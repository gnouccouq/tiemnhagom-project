// app/(tabs)/products.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Modal,
  RefreshControl,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Colors } from '../../src/constants/theme';
import { ProductCard } from '../../src/components/ProductCard';
import { ProductCardSkeleton } from '../../src/components/ShimmerSkeleton';
import { DEFAULT_CATEGORIES, getCategories, ProductCategoryItem, getProducts } from '../../src/services/productService';
import { Product } from '../../src/types';
import { formatCurrency, removeVietnameseTones } from '../../src/utils/format';
import { useCart } from '../../src/context/CartContext';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useDialog } from '../../src/context/DialogContext';
import { useRealtimeData } from '../../src/context/RealtimeDataContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2;

// Icon → emoji mapping
const CATEGORY_EMOJI: Record<string, string> = {
  'all': '🏷️',
  'Dining Decor': '🍜',
  'Teatime & Drinks': '🍵',
  'Home Decor': '🌸',
  'Kitchenware': '🔥',
  'Lifestyle': '✨',
  'Value Packs': '🎁',
};

// Màu nền bubble
const CATEGORY_BG: Record<string, string> = {
  'all': '#E8E8E8',
  'Dining Decor': '#FFF3E0',
  'Teatime & Drinks': '#E8F5E9',
  'Home Decor': '#FCE4EC',
  'Kitchenware': '#FBE9E7',
  'Lifestyle': '#EDE7F6',
  'Value Packs': '#E3F2FD',
};

const SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'popular', label: 'Bán chạy' },
  { id: 'price-asc', label: 'Giá tăng ↑' },
  { id: 'price-desc', label: 'Giá giảm ↓' },
];

// ─── Category Bubble ─────────────────────────────────────────────────────────
function CategoryBubble({
  cat,
  isSelected,
  onPress,
}: {
  cat: ProductCategoryItem;
  isSelected: boolean;
  onPress: () => void;
}) {
  const emoji = CATEGORY_EMOJI[cat.id] || '📦';
  const bg = isSelected ? '#111111' : (CATEGORY_BG[cat.id] || '#F3E5DC');
  const textColor = isSelected ? '#FFFFFF' : '#1F2937';

  return (
    <TouchableOpacity style={bubbleStyles.wrap} onPress={onPress} activeOpacity={0.8}>
      <View style={[bubbleStyles.circle, { backgroundColor: bg }]}>
        {cat.imageUrl ? (
          <Image source={{ uri: cat.imageUrl }} style={bubbleStyles.image} contentFit="cover" />
        ) : (
          <Text style={bubbleStyles.emoji}>{emoji}</Text>
        )}
      </View>
      <Text style={[bubbleStyles.label, { color: isSelected ? '#111111' : '#52525B', fontWeight: isSelected ? '700' : '500' }]} numberOfLines={2}>
        {cat.name}
      </Text>
    </TouchableOpacity>
  );
}

const bubbleStyles = StyleSheet.create({
  wrap: {
    width: 70,
    alignItems: 'center',
    marginRight: 12,
  },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  emoji: {
    fontSize: 28,
  },
  label: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 15,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; search?: string; collection?: string }>();
  const router = useRouter();
  const { t } = useSettings();

  const SORT_OPTIONS = [
    { id: 'newest', label: t('sortNewest') },
    { id: 'popular', label: t('sortPopular') },
    { id: 'price-asc', label: t('sortPriceAsc') },
    { id: 'price-desc', label: t('sortPriceDesc') },
  ];

  const { products: realtimeProducts, loadingProducts } = useRealtimeData();
  const [categories, setCategories] = useState<ProductCategoryItem[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string>(params.category || 'all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [allProducts, setAllProducts] = useState<Product[]>([]); // toàn bộ kết quả
  const [products, setProducts] = useState<Product[]>([]); // hiển thị theo page
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc' | 'popular'>('newest');
  const [modalVisible, setModalVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const { unreadCount } = useNotificationBadge();

  const PAGE_SIZE = 30; // số sản phẩm mỗi lần tải thêm

  // Tất cả danh mục bao gồm 'all' để hiển thị trong 1 hàng
  const allCatsWithAll = categories; // đã bao gồm 'all' từ DEFAULT_CATEGORIES

  // Tải danh mục từ Firestore
  useEffect(() => {
    getCategories().then(cats => {
      if (cats && cats.length > 0) setCategories(cats);
    });
  }, []);

  // Cập nhật category từ route params
  useEffect(() => {
    if (params.category) setSelectedCategory(params.category);
  }, [params.category]);

  const fetchItems = useCallback(() => {
    let items = [...realtimeProducts];

    // Lọc theo category
    const catTarget = (selectedSubCategory || selectedCategory).toLowerCase().trim();
    if (catTarget && catTarget !== 'all') {
      const matchedGroup = categories.find(
        (g) =>
          g.id.toLowerCase() === catTarget ||
          g.name.toLowerCase() === catTarget ||
          (g.enName && g.enName.toLowerCase() === catTarget)
      );

      const targetSubs = matchedGroup?.subs ? matchedGroup.subs.map((s) => s.toLowerCase()) : [];
      const matchCriteria = [
        catTarget,
        ...(matchedGroup?.id ? [matchedGroup.id.toLowerCase()] : []),
        ...(matchedGroup?.name ? [matchedGroup.name.toLowerCase()] : []),
        ...(matchedGroup?.enName ? [matchedGroup.enName.toLowerCase()] : []),
        ...targetSubs,
      ];

      items = items.filter((p) => {
        const pCat = (p.category || '').toLowerCase();
        return matchCriteria.some((c) => pCat.includes(c) || c.includes(pCat));
      });
    }

    // Lọc theo search
    if (params.search && params.search.trim() !== '') {
      const cleanTerm = removeVietnameseTones(params.search);
      items = items.filter((p) => {
        const cleanName = removeVietnameseTones(p.name);
        const sku = p.id.toLowerCase();
        return cleanName.includes(cleanTerm) || sku.includes(cleanTerm);
      });
    }

    // Sắp xếp
    if (sortBy === 'price-asc') {
      items.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
    } else if (sortBy === 'price-desc') {
      items.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
    } else if (sortBy === 'popular') {
      items.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    } else {
      // newest (mặc định createdAt desc)
      items.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
    }

    setAllProducts(items);
    setPage(1);
    setProducts(items.slice(0, PAGE_SIZE));
    setLoading(false);
    setRefreshing(false);
  }, [selectedCategory, selectedSubCategory, params.search, sortBy, realtimeProducts, categories]);

  // Load thêm khi cuộn xuống gần cuối
  const loadMore = useCallback(() => {
    if (loadingMore || products.length >= allProducts.length) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const nextSlice = allProducts.slice(0, nextPage * PAGE_SIZE);
    setProducts(nextSlice);
    setPage(nextPage);
    setLoadingMore(false);
  }, [loadingMore, page, products.length, allProducts]);

  useEffect(() => {
    if (loadingProducts) {
      setLoading(true);
    } else {
      fetchItems();
    }
  }, [fetchItems, loadingProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const activeCatName = categories.find(c => c.id === selectedCategory)?.name || t('all');
  const activeCat = categories.find(c => c.id === selectedCategory);
  const subs = activeCat?.subs || [];

  const [scrollY, setScrollY] = useState(0);
  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4), height: insets.top + 56 }]}>
        {blurProgress > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: blurProgress }]} pointerEvents="none">
            <BlurView
              intensity={Platform.OS === 'ios' ? 85 : 75}
              tint="light"
              blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Platform.OS === 'ios' ? 'rgba(255,255,255,0.12)' : 'rgba(250,248,245,0.45)',
                },
              ]}
            />
          </View>
        )}
        <TouchableOpacity style={styles.headerTitle} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
          <View style={styles.headerDots}>
            <View style={[styles.dot, { backgroundColor: '#E8A87C' }]} />
            <View style={[styles.dot, { backgroundColor: '#9A7B4F' }]} />
            <View style={[styles.dot, { backgroundColor: '#E8A87C' }]} />
            <View style={[styles.dot, { backgroundColor: '#9A7B4F' }]} />
          </View>
          <Text style={styles.headerTitleText}>{t('categories')}</Text>
          <Ionicons name="chevron-down" size={16} color="#1F2937" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/search' as any)}>
            <Ionicons name="search-outline" size={22} color="#1F2937" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/favorites' as any)}>
            <Ionicons name="heart-outline" size={22} color="#1F2937" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications' as any)}>
            <Ionicons name="notifications-outline" size={22} color="#1F2937" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Product FlatList dạng lưới 2 cột card dọc chuẩn trang chủ ── */}
      <FlatList
        key="products-2-col-grid"
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        data={loading ? [] : products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard product={item} cardWidth={CARD_WIDTH} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: 110 }}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        windowSize={5}
        maxToRenderPerBatch={6}
        initialNumToRender={6}
        removeClippedSubviews={Platform.OS === 'android'}
        updateCellsBatchingPeriod={50}
        ListHeaderComponent={
          <View>
            {/* ── Category Bubbles: 1 hàng ngang cuộn ── */}
            <View style={styles.bubblesSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bubbleRow}
              >
                {allCatsWithAll.map(cat => (
                  <CategoryBubble
                    key={cat.id}
                    cat={cat}
                    isSelected={selectedCategory === cat.id}
                    onPress={() => {
                      setSelectedCategory(cat.id);
                      setSelectedSubCategory('');
                    }}
                  />
                ))}
              </ScrollView>
            </View>

            {/* ── Sub-category chips ── */}
            {subs.length > 0 && (
              <View style={{ backgroundColor: '#FAF8F5' }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subChipList}
                >
                  <TouchableOpacity
                    style={[styles.subChip, selectedSubCategory === '' && styles.subChipActive]}
                    onPress={() => setSelectedSubCategory('')}
                  >
                    <Text style={[styles.subChipText, selectedSubCategory === '' && styles.subChipTextActive]}>
                      {t('all')}
                    </Text>
                  </TouchableOpacity>
                  {subs.map((sub, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.subChip, selectedSubCategory === sub && styles.subChipActive]}
                      onPress={() => setSelectedSubCategory(selectedSubCategory === sub ? '' : sub)}
                    >
                      <Text style={[styles.subChipText, selectedSubCategory === sub && styles.subChipTextActive]}>
                        {sub}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Section Title + Sort ── */}
            <Text style={styles.sectionTitle}>
              {selectedSubCategory || (activeCatName === t('all') ? t('allProducts') : activeCatName)}
            </Text>
            <View style={styles.sectionHeader}>
              <Text style={styles.countText}>{allProducts.length} {t('productsCount')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.sortChip, sortBy === opt.id && styles.sortChipActive]}
                    onPress={() => setSortBy(opt.id as any)}
                  >
                    <Text style={[styles.sortText, sortBy === opt.id && styles.sortTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonGrid}>
              {[1, 2, 3, 4, 5, 6].map((key) => (
                <ProductCardSkeleton key={key} cardWidth={CARD_WIDTH} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={48} color="#C8B89A" />
              <Text style={styles.emptyTitle}>{t('noProducts')}</Text>
              <Text style={styles.emptyDesc}>{t('noProductsDesc')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#111111" />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#111111"
            colors={['#111111']}
          />
        }
      />

      {/* ── Modal: Toàn bộ danh mục dạng grid 4 cột ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[modalStyles.safeArea, { paddingTop: Platform.OS === 'android' ? 24 : insets.top }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{t('categories')}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modalStyles.grid} showsVerticalScrollIndicator={false}>
            {allCatsWithAll.map(cat => {
              const emoji = CATEGORY_EMOJI[cat.id] || '📦';
              const bg = CATEGORY_BG[cat.id] || '#F3E5DC';
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={modalStyles.item}
                  onPress={() => {
                    setSelectedCategory(cat.id);
                    setSelectedSubCategory('');
                    setModalVisible(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[modalStyles.circle, { backgroundColor: isSelected ? '#111111' : bg }]}>
                    {cat.imageUrl ? (
                      <Image source={{ uri: cat.imageUrl }} style={modalStyles.circleImg} contentFit="cover" />
                    ) : (
                      <Text style={{ fontSize: 30 }}>{emoji}</Text>
                    )}
                  </View>
                  <Text style={[modalStyles.label, isSelected && { fontWeight: '700', color: '#111111' }]} numberOfLines={2}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerDots: {
    width: 22,
    height: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0ECE6',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#B91C1C',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FAF8F5',
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  // Bubbles
  bubblesSection: {
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  bubbleRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Sub-category chips
  subChipList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
  },
  subChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    marginRight: 8,
  },
  subChipActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  subChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  subChipTextActive: {
    color: '#FFFFFF',
  },

  // Section Header
  sectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '800',
    color: '#1F2937',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
    marginBottom: 6,
  },
  countText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#9CA3AF',
    minWidth: 70,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    marginRight: 6,
  },
  sortChipActive: {
    backgroundColor: '#F3E5DC',
    borderColor: '#E8A87C',
  },
  sortText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#9CA3AF',
  },
  sortTextActive: {
    color: '#9A7B4F',
    fontWeight: '700',
  },

  // Lưới 2 cột & Skeleton Grid
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  // Loading / Empty
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#9CA3AF',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptyDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});

const modalStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 60,
  },
  item: {
    width: (SCREEN_WIDTH - 32) / 4,
    alignItems: 'center',
    marginBottom: 24,
  },
  circle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleImg: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  label: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#52525B',
    textAlign: 'center',
    marginTop: 7,
    lineHeight: 15,
    paddingHorizontal: 4,
  },
});
