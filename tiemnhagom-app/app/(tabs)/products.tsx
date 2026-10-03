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
  SafeAreaView,
  StatusBar,
  Modal,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/theme';
import { DEFAULT_CATEGORIES, getCategories, ProductCategoryItem, getProducts } from '../../src/services/productService';
import { Product } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { useCart } from '../../src/context/CartContext';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

// ─── Product Row Item (list view like reference) ──────────────────────────────
function ProductRow({ product }: { product: Product }) {
  const router = useRouter();
  const { addToCart } = useCart();

  const img = product.images?.[0] || product.imageUrl;
  const price = (product.salePrice !== undefined && product.salePrice !== null) ? product.salePrice : product.price;
  const hasDiscount = Boolean(product.salePrice && product.salePrice < product.price);

  return (
    <TouchableOpacity
      style={rowStyles.wrap}
      activeOpacity={0.85}
      onPress={() => {
        const targetId = product.parentProductId || product.id;
        router.push({
          pathname: '/product/[id]',
          params: {
            id: targetId,
            ...(product.selectedVariant?.name ? { variant: product.selectedVariant.name } : {}),
          },
        } as any);
      }}
    >
      <View style={rowStyles.imgWrap}>
        {img ? (
          <Image source={{ uri: img }} style={rowStyles.img} contentFit="cover" />
        ) : (
          <View style={[rowStyles.img, rowStyles.imgPlaceholder]}>
            <Ionicons name="image-outline" size={28} color="#C8B89A" />
          </View>
        )}
        {hasDiscount && (
          <View style={rowStyles.saleBadge}>
            <Text style={rowStyles.saleBadgeText}>SALE</Text>
          </View>
        )}
      </View>

      <View style={rowStyles.info}>
        <Text style={rowStyles.name} numberOfLines={2}>{product.name}</Text>
        <View style={rowStyles.priceRow}>
          <Text style={rowStyles.price}>{formatCurrency(price)}</Text>
          {hasDiscount && (
            <Text style={rowStyles.oldPrice}>{formatCurrency(product.price)}</Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={rowStyles.addBtn}
        onPress={() => {
          addToCart(product, 1);
          Alert.alert('✓', 'Đã thêm vào giỏ hàng', [{ text: 'OK' }]);
        }}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  imgWrap: {
    position: 'relative',
    marginRight: 12,
  },
  img: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F5F0EB',
  },
  imgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  saleBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#E53935',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  saleBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'ElleGaborStd',
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: 20,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  price: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  oldPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProductsScreen() {
  const params = useLocalSearchParams<{ category?: string; search?: string; collection?: string }>();
  const router = useRouter();

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

  const fetchItems = useCallback(async () => {
    try {
      // Load toàn bộ không giới hạn
      const data = await getProducts({
        category: selectedSubCategory || selectedCategory,
        searchTerm: params.search || '',
        sortBy,
        // Không truyền maxItems → lấy tất cả
      });
      setAllProducts(data);
      setPage(1);
      setProducts(data.slice(0, PAGE_SIZE)); // hiển thị trang đầu tiên
    } catch (e) {
      console.warn('Lỗi load products: ' + String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedSubCategory, params.search, sortBy]);

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
    setLoading(true);
    fetchItems();
  }, [fetchItems]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const activeCatName = categories.find(c => c.id === selectedCategory)?.name || 'Tất cả';
  const activeCat = categories.find(c => c.id === selectedCategory);
  const subs = activeCat?.subs || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerTitle} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
          <View style={styles.headerDots}>
            <View style={[styles.dot, { backgroundColor: '#E8A87C' }]} />
            <View style={[styles.dot, { backgroundColor: '#9A7B4F' }]} />
            <View style={[styles.dot, { backgroundColor: '#E8A87C' }]} />
            <View style={[styles.dot, { backgroundColor: '#9A7B4F' }]} />
          </View>
          <Text style={styles.headerTitleText}>Danh mục</Text>
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
              <View style={[styles.badge, { position: 'absolute', width: 10, height: 10, borderRadius: 5, paddingHorizontal: 0, minWidth: 10, top: -2, right: -2 }]} />
            )}
          </TouchableOpacity>
        </View>
      </View>

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
                Tất cả
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
        {selectedSubCategory || (activeCatName === 'Tất cả' ? 'Tất cả sản phẩm' : activeCatName)}
      </Text>
      <View style={styles.sectionHeader}>
        <Text style={styles.countText}>{allProducts.length} sản phẩm</Text>
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

      {/* ── Product List ── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#111111" />
          <Text style={styles.loadingText}>Đang tải sản phẩm...</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="cube-outline" size={48} color="#C8B89A" />
          <Text style={styles.emptyTitle}>Chưa có sản phẩm</Text>
          <Text style={styles.emptyDesc}>Danh mục này đang được cập nhật, thử chọn danh mục khác nhé!</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <ProductRow product={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 110 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
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
      )}

      {/* ── Modal: Toàn bộ danh mục dạng grid 4 cột ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={modalStyles.safeArea}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Danh mục</Text>
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
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 56,
    backgroundColor: '#FAF8F5',
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
