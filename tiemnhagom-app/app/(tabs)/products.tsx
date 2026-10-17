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
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ScalePressable } from '../../src/components/ScalePressable';
import { BlurButton } from '../../src/components/BlurButton';
import { ProductCard } from '../../src/components/ProductCard';
import { ProductCardSkeleton } from '../../src/components/ShimmerSkeleton';
import { DEFAULT_CATEGORIES, getCategories, ProductCategoryItem, getProducts } from '../../src/services/productService';
import { Product } from '../../src/types';
import { formatCurrency, removeVietnameseTones } from '../../src/utils/format';
import { useCart } from '../../src/context/CartContext';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { useWishlist } from '../../src/context/WishlistContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useDialog } from '../../src/context/DialogContext';
import { useRealtimeData } from '../../src/context/RealtimeDataContext';
import { usePageAnimation } from '../../src/hooks/usePageAnimation';

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

// Màu nền gốm men mộc chuẩn Brand Guidelines Tiệm Nhà Gốm
const CATEGORY_BG: Record<string, string> = {
  'all': '#F3ECE3',
  'Dining Decor': '#F7EFE6',
  'Teatime & Drinks': '#F4EAE0',
  'Home Decor': '#FBF6F0',
  'Kitchenware': '#EFE4D8',
  'Lifestyle': '#F5ECE3',
  'Value Packs': '#EEDECF',
};

const SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'popular', label: 'Bán chạy' },
  { id: 'price-asc', label: 'Giá tăng ↑' },
  { id: 'price-desc', label: 'Giá giảm ↓' },
];

import { useThemeColor } from '../../src/constants/theme';

// ─── Category Bubble ─────────────────────────────────────────────────────────
function CategoryBubble({
  cat,
  isSelected,
  onPress,
  isDark,
}: {
  cat: ProductCategoryItem;
  isSelected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const emoji = CATEGORY_EMOJI[cat.id] || '📦';
  const bg = CATEGORY_BG[cat.id] || '#F3ECE3';

  return (
    <ScalePressable style={bubbleStyles.wrap} onPress={onPress} activeScale={0.92}>
      <View
        style={[
          bubbleStyles.circle,
          { backgroundColor: bg },
          isSelected ? bubbleStyles.circleActive : (isDark ? bubbleStyles.circleInactiveDark : bubbleStyles.circleInactive),
        ]}
      >
        {cat.imageUrl ? (
          <Image source={{ uri: cat.imageUrl }} style={bubbleStyles.image} contentFit="cover" />
        ) : (
          <Text style={bubbleStyles.emoji}>{emoji}</Text>
        )}
      </View>
      <Text
        style={[
          bubbleStyles.label,
          {
            color: isSelected ? '#9C7156' : (isDark ? '#B0B0B0' : '#6E665D'),
            fontWeight: isSelected ? '700' : '500',
          },
        ]}
        numberOfLines={2}
      >
        {cat.name}
      </Text>
      {isSelected && <View style={bubbleStyles.activeIndicator} />}
    </ScalePressable>
  );
}

const bubbleStyles = StyleSheet.create({
  wrap: {
    width: 72,
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
  circleInactive: {
    borderWidth: 1.5,
    borderColor: '#E8E1D8',
    backgroundColor: '#FAF8F5',
  },
  circleInactiveDark: {
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#2C2C2C',
  },
  circleActive: {
    borderWidth: 2.5,
    borderColor: '#9C7156',
    backgroundColor: '#FFFFFF',
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  image: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  emoji: {
    fontSize: 26,
  },
  label: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 15,
  },
  activeIndicator: {
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#9C7156',
    marginTop: 3,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const modalStyles = getModalStyles(Colors, isDark);
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
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(340)).current;
  const sheetScale = useRef(new Animated.Value(0.96)).current;
  const itemsAnim = useRef(new Animated.Value(0)).current;

  const openCategoryModal = useCallback(() => {
    setModalVisible(true);
    backdropAnim.setValue(0);
    sheetTranslateY.setValue(340);
    sheetScale.setValue(0.96);
    itemsAnim.setValue(0);

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 260,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.spring(sheetScale, {
        toValue: 1,
        damping: 22,
        stiffness: 260,
        useNativeDriver: true,
      }),
      Animated.timing(itemsAnim, {
        toValue: 1,
        duration: 280,
        delay: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropAnim, sheetTranslateY, sheetScale, itemsAnim]);

  const closeCategoryModal = useCallback((callback?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 340,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetScale, {
        toValue: 0.96,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(itemsAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      if (callback) callback();
    });
  }, [backdropAnim, sheetTranslateY, sheetScale, itemsAnim]);

  const [searchVisible, setSearchVisible] = useState(false);
  const { unreadCount } = useNotificationBadge();
  const { favorites } = useWishlist();
  const favoriteCount = favorites ? favorites.length : 0;

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
  const { pageStyle } = usePageAnimation();

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4), height: insets.top + 56 }]}>
        <View style={[StyleSheet.absoluteFill, { height: insets.top + 56 + 24 }]} pointerEvents="none">
          <LinearGradient
            colors={
              isDark
                ? [
                    'rgba(0,0,0,0.85)',
                    'rgba(0,0,0,0.72)',
                    'rgba(0,0,0,0.45)',
                    'rgba(0,0,0,0.15)',
                    'rgba(0,0,0,0)',
                  ]
                : [
                    'rgba(250,248,245,0.88)',
                    'rgba(250,248,245,0.75)',
                    'rgba(250,248,245,0.45)',
                    'rgba(250,248,245,0.15)',
                    'rgba(250,248,245,0)',
                  ]
            }
            locations={[0, 0.40, 0.70, 0.88, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <TouchableOpacity style={styles.headerTitle} onPress={openCategoryModal} activeOpacity={0.7}>
          <View style={styles.headerDots}>
            <View style={[styles.dot, { backgroundColor: '#E8A87C' }]} />
            <View style={[styles.dot, { backgroundColor: '#9A7B4F' }]} />
            <View style={[styles.dot, { backgroundColor: '#E8A87C' }]} />
            <View style={[styles.dot, { backgroundColor: '#9A7B4F' }]} />
          </View>
          <Text style={styles.headerTitleText}>{t('categories')}</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textPrimary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <BlurButton
            style={styles.iconBtn}
            onPress={() => router.push('/search' as any)}
            accessibilityLabel="Tìm kiếm"
          >
            <Ionicons name="search-outline" size={20} color={Colors.textPrimary} />
          </BlurButton>
          <BlurButton
            style={styles.iconBtn}
            onPress={() => router.push('/favorites' as any)}
            accessibilityLabel="Yêu thích"
          >
            <Ionicons name="heart-outline" size={20} color={Colors.textPrimary} />
            {favoriteCount > 0 && (
              <View style={styles.notificationBadge} pointerEvents="none">
                <Text style={styles.notificationBadgeText}>
                  {favoriteCount > 99 ? '99+' : favoriteCount}
                </Text>
              </View>
            )}
          </BlurButton>
          <BlurButton
            style={styles.iconBtn}
            onPress={() => router.push('/notifications' as any)}
            accessibilityLabel="Thông báo"
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge} pointerEvents="none">
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </BlurButton>
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
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + 56 + 4, paddingBottom: 110 }}
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
                    isDark={isDark}
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
              <View style={styles.subChipsContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subChipList}
                >
                  <ScalePressable
                    style={[styles.subChip, selectedSubCategory === '' && styles.subChipActive]}
                    onPress={() => setSelectedSubCategory('')}
                    activeScale={0.93}
                  >
                    <Text style={[styles.subChipText, selectedSubCategory === '' && styles.subChipTextActive]}>
                      {t('all')}
                    </Text>
                  </ScalePressable>
                  {subs.map((sub, i) => (
                    <ScalePressable
                      key={i}
                      style={[styles.subChip, selectedSubCategory === sub && styles.subChipActive]}
                      onPress={() => setSelectedSubCategory(selectedSubCategory === sub ? '' : sub)}
                      activeScale={0.93}
                    >
                      <Text style={[styles.subChipText, selectedSubCategory === sub && styles.subChipTextActive]}>
                        {sub}
                      </Text>
                    </ScalePressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Section Title + Sort ── */}
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>
                {selectedSubCategory || (activeCatName === t('all') ? t('allProducts') : activeCatName)}
              </Text>
              <Text style={styles.countText}>{allProducts.length} {t('productsCount')}</Text>
            </View>
            <View style={styles.sortContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
                {SORT_OPTIONS.map(opt => {
                  const isActive = sortBy === opt.id;
                  return (
                    <ScalePressable
                      key={opt.id}
                      style={[styles.sortChip, isActive && styles.sortChipActive]}
                      onPress={() => setSortBy(opt.id as any)}
                      activeScale={0.93}
                    >
                      {isActive && <View style={styles.sortActiveDot} />}
                      <Text style={[styles.sortText, isActive && styles.sortTextActive]}>{opt.label}</Text>
                    </ScalePressable>
                  );
                })}
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

      {/* ── Modal: Toàn bộ danh mục dạng Bottom Sheet có Animation UX mượt mà ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeCategoryModal()}
      >
        <Animated.View style={[modalStyles.backdrop, { opacity: backdropAnim }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => closeCategoryModal()}
          />
          <Animated.View
            style={[
              modalStyles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 12,
                transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
              },
            ]}
          >
            {/* Thanh kéo nhỏ (Handle bar) */}
            <View style={modalStyles.handle} />

            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>{t('categories')}</Text>
              <ScalePressable
                onPress={() => closeCategoryModal()}
                style={modalStyles.closeBtn}
                activeScale={0.9}
              >
                <Ionicons name="close" size={18} color="#2B2928" />
              </ScalePressable>
            </View>

            <View style={modalStyles.grid}>
              {allCatsWithAll.map(cat => {
                const emoji = CATEGORY_EMOJI[cat.id] || '📦';
                const bg = CATEGORY_BG[cat.id] || '#F3ECE3';
                const isSelected = selectedCategory === cat.id;
                return (
                  <Animated.View
                    key={cat.id}
                    style={[
                      modalStyles.item,
                      {
                        opacity: itemsAnim,
                        transform: [
                          {
                            translateY: itemsAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [16, 0],
                            }),
                          },
                          {
                            scale: itemsAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.92, 1],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <ScalePressable
                      style={{ alignItems: 'center' }}
                      onPress={() => {
                        closeCategoryModal(() => {
                          setSelectedCategory(cat.id);
                          setSelectedSubCategory('');
                        });
                      }}
                      activeScale={0.92}
                    >
                      <View
                        style={[
                          modalStyles.circle,
                          { backgroundColor: bg },
                          isSelected ? modalStyles.circleActive : modalStyles.circleInactive,
                        ]}
                      >
                        {cat.imageUrl ? (
                          <Image source={{ uri: cat.imageUrl }} style={modalStyles.circleImg} contentFit="cover" />
                        ) : (
                          <Text style={{ fontSize: 24 }}>{emoji}</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          modalStyles.label,
                          {
                            color: isSelected ? '#9C7156' : '#6E665D',
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {cat.name}
                      </Text>
                      {isSelected && <View style={modalStyles.activeIndicator} />}
                    </ScalePressable>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
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
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'android' ? 8 : 4,
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
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    notificationBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      backgroundColor: '#9C7156',
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: isDark ? '#121212' : '#FAF8F5',
      zIndex: 10,
    },
    notificationBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },
    badge: {
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
    },

    // Bubbles
    bubblesSection: {
      paddingTop: 4,
      paddingBottom: 8,
      backgroundColor: Colors.background,
    },
    bubbleRow: {
      paddingHorizontal: 16,
      paddingBottom: 4,
    },

    // Sub-category chips
    subChipsContainer: {
      backgroundColor: Colors.background,
      paddingVertical: 2,
    },
    subChipList: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    subChip: {
      height: 38,
      borderRadius: 19,
      paddingHorizontal: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      marginRight: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 3,
      elevation: isDark ? 0 : 1,
    },
    subChipActive: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.22,
      shadowRadius: 5,
      elevation: 3,
    },
    subChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#E8CCB2' : '#6E665D',
    },
    subChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },

    // Section Header + Sort
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    countText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
      fontWeight: '500',
    },
    sortContainer: {
      paddingBottom: 8,
    },
    sortRow: {
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    sortChip: {
      height: 34,
      borderRadius: 17,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      marginRight: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.03,
      shadowRadius: 2,
      elevation: isDark ? 0 : 1,
    },
    sortChipActive: {
      backgroundColor: isDark ? '#2C2C2C' : '#F6F4EC',
      borderWidth: 1.5,
      borderColor: '#9C7156',
    },
    sortActiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#9C7156',
      marginRight: 6,
    },
    sortText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#B0B0B0' : '#6E665D',
      fontWeight: '500',
    },
    sortTextActive: {
      color: isDark ? '#E8CCB2' : '#9C7156',
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
      color: Colors.textMuted,
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
      color: Colors.textPrimary,
    },
    emptyDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });

const getModalStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FAF8F5',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 10,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0 : 0.1,
      shadowRadius: 10,
      elevation: isDark ? 0 : 10,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? '#3A3A3A' : '#D8CFBF',
      alignSelf: 'center',
      marginBottom: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#2A2A2A' : '#E8E1D8',
    },
    title: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 2,
      elevation: isDark ? 0 : 1,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      paddingTop: 16,
      paddingBottom: 4,
    },
    item: {
      width: (SCREEN_WIDTH - 24) / 4,
      alignItems: 'center',
      marginBottom: 14,
    },
    circle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    circleInactive: {
      borderWidth: 1.5,
      borderColor: '#E8E1D8',
      backgroundColor: '#FAF8F5',
    },
    circleActive: {
      borderWidth: 2,
      borderColor: '#9C7156',
      backgroundColor: '#FFFFFF',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 5,
      elevation: 3,
    },
    circleImg: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    label: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: isDark ? '#B0B0B0' : '#6E665D',
      textAlign: 'center',
      marginTop: 5,
      lineHeight: 14,
      paddingHorizontal: 4,
    },
    activeIndicator: {
      width: 12,
      height: 2,
      borderRadius: 1,
      backgroundColor: '#9C7156',
      marginTop: 2,
    },
  });
