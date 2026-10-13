// app/(tabs)/index.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
  Linking,
  Modal,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { BannerSlider } from '../../src/components/BannerSlider';
import { ProductCard } from '../../src/components/ProductCard';
import { ProductCardSkeleton } from '../../src/components/ShimmerSkeleton';
import { CategoryChip } from '../../src/components/CategoryChip';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import { ScalePressable } from '../../src/components/ScalePressable';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DEFAULT_CATEGORIES,
  getCategories,
  ProductCategoryItem,
  getCategoryDisplayName,
  getProducts,
  getCollections,
  getBestSellingProducts,
  getNewsArticles,
  CollectionItem,
  NewsArticle,
} from '../../src/services/productService';
import { getUserOrders } from '../../src/services/orderService';
import { Product } from '../../src/types';
import { useThemeColor, Colors } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useRealtimeData } from '../../src/context/RealtimeDataContext';
import { auth } from '../../src/config/firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Icon → emoji mapping đồng bộ từ tab danh mục
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

// Cấu hình 4 hạng thành viên đồng bộ chuẩn xác từ Website & Tab Ưu đãi
const MEMBERSHIP_TIERS = [
  { id: 'null', name: 'Gốm Mộc', badge: '🪵', min: 0, color: '#8A5A2B' },
  { id: 'new', name: 'Gốm Nung', badge: '🔥', min: 1000000, color: '#DC2626' },
  { id: 'mem', name: 'Gốm Men', badge: '✨', min: 5000000, color: '#CA8A04' },
  { id: 'vip', name: 'Gốm Độc Bản', badge: '👑', min: 10000000, color: '#EF4444' },
];

export default function HomeScreen() {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { t } = useSettings();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [categories, setCategories] = useState<ProductCategoryItem[]>(DEFAULT_CATEGORIES);
  const { products, news: realtimeNews, loadingProducts } = useRealtimeData();
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Xác định trạng thái đăng nhập thực tế (đồng bộ từ user, userProfile và Firebase Auth)
  const isLoggedIn = Boolean(user || userProfile || auth.currentUser);
  const effectiveUid = user?.uid || userProfile?.uid || auth.currentUser?.uid;

  // Tính toán dữ liệu người dùng thực tế (chi tiêu, điểm, hạng)
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);

  useEffect(() => {
    if (effectiveUid) {
      getUserOrders(effectiveUid)
        .then((orders) => {
          let spent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
          let redeemed = 0;
          orders.forEach((o) => {
            const status = (o.status || '').toLowerCase();
            if (
              status.includes('hoàn thành') ||
              status.includes('thành công') ||
              status.includes('đang giao') ||
              status.includes('completed')
            ) {
              spent += Number(o.totalAmount || 0);
            }
            if ((o as any).pointsUsed && Number((o as any).pointsUsed) > 0) {
              redeemed += Number((o as any).pointsUsed);
            }
          });
          setRedeemedPoints(redeemed);
          setTotalSpent(spent);
        })
        .catch(() => {
          setTotalSpent(Number(userProfile?.totalSpent || userProfile?.spentTotal || 0));
        });
    } else {
      setTotalSpent(0);
      setRedeemedPoints(0);
    }
  }, [effectiveUid, userProfile]);

  // Xác định hạng hội viên theo chi tiêu tích lũy thực tế
  let currentTier = MEMBERSHIP_TIERS[0];
  for (let i = MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
    if (totalSpent >= MEMBERSHIP_TIERS[i].min) {
      currentTier = MEMBERSHIP_TIERS[i];
      break;
    }
  }

  // Nếu userProfile đã được gán hạng cụ thể từ backend
  if (userProfile?.tier) {
    const t = userProfile.tier.toLowerCase();
    if (t.includes('vip') || t.includes('độc bản') || t.includes('doc ban')) currentTier = MEMBERSHIP_TIERS[3];
    else if (t.includes('mem') || t.includes('men')) currentTier = MEMBERSHIP_TIERS[2];
    else if (t.includes('new') || t.includes('nung')) currentTier = MEMBERSHIP_TIERS[1];
  }

  // Cứ 10.000đ = 1 điểm, trừ điểm đã dùng, bỏ thưởng chào mừng 50 điểm cũ
  const earnedPoints = Math.floor(totalSpent / 10000);
  const rawProfilePoints = userProfile?.points !== undefined && userProfile?.points !== null ? Number(userProfile.points) : 0;
  const cleanProfilePoints = (rawProfilePoints === 50 && totalSpent < 500000) ? 0 : rawProfilePoints;
  const points = Math.max(0, Math.max(earnedPoints, cleanProfilePoints) - redeemedPoints);

  const displayName =
    userProfile?.displayName ||
    userProfile?.name ||
    userProfile?.fullName ||
    user?.displayName ||
    auth.currentUser?.displayName ||
    (userProfile?.email ? userProfile.email.split('@')[0] : '') ||
    (user?.email ? user.email.split('@')[0] : '') ||
    userProfile?.phone ||
    'Khách hàng thân thiết';

  const avatarUrl =
    userProfile?.photoURL ||
    user?.photoURL ||
    auth.currentUser?.photoURL ||
    '';

  // Modal dịch vụ (Hoa / Decor / Về Tiệm)
  const [serviceModal, setServiceModal] = useState<{
    visible: boolean;
    type: 'flower' | 'event' | 'about';
  }>({
    visible: false,
    type: 'flower',
  });

  const loadData = useCallback(async () => {
    try {
      const [colRes, catRes] = await Promise.allSettled([
        getCollections(),
        getCategories(),
      ]);

      if (colRes.status === 'fulfilled') {
        setCollections(colRes.value);
      }
      if (catRes.status === 'fulfilled' && catRes.value.length > 0) {
        setCategories(catRes.value);
      }
    } catch (e) {
      console.warn('Lỗi load home: ' + String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Derive bestSellers and featuredProducts from realtime products
    if (products.length > 0) {
      const sortedByPopular = [...products].sort((a, b) => (b.sold || 0) - (a.sold || 0));
      setBestSellers(sortedByPopular.slice(0, 10));
      
      const feat = products.filter((p) => (p.sale && p.sale > 0) || p.salePrice).slice(0, 6);
      setFeaturedProducts(feat.length > 0 ? feat : products.slice(0, 6));
    }
  }, [products]);

  useEffect(() => {
    if (realtimeNews.length > 0) {
      setNewsArticles(realtimeNews.slice(0, 6));
    }
  }, [realtimeNews]);

  useEffect(() => {
    if (!loadingProducts) {
      setLoading(false);
    }
  }, [loadingProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const [scrollY, setScrollY] = useState(0);
  const topGradientOpacity = Math.max(0, 1 - scrollY / 65);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    setScrollY(currentY);
  };

  const handleCategoryPress = (catId: string) => {
    setSelectedCategory(catId);
    router.push({
      pathname: '/(tabs)/products',
      params: { category: catId === 'all' ? '' : catId },
    });
  };

  const handleCollectionPress = (colName: string) => {
    router.push({
      pathname: '/(tabs)/products',
      params: { collection: colName },
    });
  };

  const callHotline = () => {
    Linking.openURL('tel:0777709662');
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar
        barStyle={scrollY > 35 ? 'dark-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
      />
      <View style={[styles.topGradientWrap, { opacity: topGradientOpacity }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Header transparent scrollY={scrollY} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.textPrimary}
            colors={['#18181B']}
          />
        }
      >
        {/* 1. Full-Screen Hero Banner Slider */}
        <BannerSlider
          onBannerPress={(slide) => {
            if (slide.link) {
              const match = slide.link.match(/id=([^&]+)/);
              if (match && match[1]) {
                router.push(`/product/${match[1]}` as any);
                return;
              }
              if (slide.link.includes('TNGCB01')) {
                router.push('/product/TNGCB01' as any);
                return;
              }
            }
            router.push('/(tabs)/products');
          }}
        />

        {/* 2. BỘ SƯU TẬP TÂM ĐẮC (Lấy từ Firestore settings/collections) */}
        {collections.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <View>
                <View style={styles.overlineBadgeRow}>
                  <View style={styles.accentDot} />
                  <Text style={styles.sectionOverline}>{t('featuredThemes')}</Text>
                </View>
                <Text style={styles.sectionTitle}>{t('favoriteCollections')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/products')}
                style={styles.seeAllBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.seeAllText}>{t('seeAll')}</Text>
                <Ionicons name="arrow-forward" size={12} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.collectionsScroll}
            >
              {collections.map((col, idx) => (
                <TouchableOpacity
                  key={col.id || idx}
                  style={styles.collectionCard}
                  activeOpacity={0.92}
                  onPress={() => handleCollectionPress(col.name)}
                >
                  <Image
                    source={{ uri: col.imageUrl }}
                    style={styles.collectionImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.collectionFooter}>
                    <Text style={styles.collectionName} numberOfLines={1}>
                      {col.name}
                    </Text>
                    <View style={styles.collectionActionRow}>
                      <Text style={styles.collectionActionText}>{t('exploreNow')}</Text>
                      <Ionicons name="arrow-forward" size={12} color={Colors.textPrimary} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 3. DANH MỤC SẢN PHẨM (Đầy đủ cả danh mục cha và con từ Firestore) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <View>
              <View style={styles.overlineBadgeRow}>
                <View style={styles.accentDot} />
                <Text style={styles.sectionOverline}>{t('ceramicCategories')}</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('curatedSpace')}</Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/products',
                  params: {
                    category:
                      selectedSubCategory ||
                      (selectedCategory === 'all' ? '' : selectedCategory),
                  },
                })
              }
              style={styles.seeAllBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.seeAllText}>{t('viewAll')}</Text>
              <Ionicons name="arrow-forward" size={12} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Lưới 3 cột Không Gian Tuyển Chọn (Icon gốm tròn bo cong đồng bộ với tab Danh mục) */}
          <View style={styles.curatedGridCard}>
            <View style={styles.curatedGrid}>
              {categories
                .filter((cat) => cat.id !== 'all' && cat.name.toLowerCase() !== 'tất cả')
                .slice(0, 9)
                .map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const emoji = CATEGORY_EMOJI[cat.id] || '🏺';
                  const bg = CATEGORY_BG[cat.id] || '#F3ECE3';
                  const displayName = getCategoryDisplayName(cat.name);

                  return (
                    <ScalePressable
                      key={cat.id}
                      style={styles.curatedGridItem}
                      onPress={() => handleCategoryPress(cat.id)}
                      activeScale={0.92}
                    >
                      <View
                        style={[
                          styles.curatedIconCircle,
                          { backgroundColor: bg },
                          isSelected ? styles.curatedIconCircleActive : styles.curatedIconCircleInactive,
                        ]}
                      >
                        {cat.imageUrl ? (
                          <Image
                            source={{ uri: cat.imageUrl }}
                            style={styles.curatedImage}
                            contentFit="cover"
                          />
                        ) : (
                          <Text style={styles.curatedEmoji}>{emoji}</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.curatedItemName,
                          isSelected && styles.curatedItemNameSelected,
                        ]}
                        numberOfLines={2}
                      >
                        {displayName}
                      </Text>
                    </ScalePressable>
                  );
                })}
            </View>
          </View>
        </View>

        {/* 4. FLASH SALE / ƯU ĐÃI HÔM NAY (Phong cách thẻ Deals đồng bộ màu gốm) */}
        {featuredProducts.length > 0 && (
          <View style={styles.dealContainer}>
            <View style={styles.dealHeader}>
              <View style={styles.dealTitleWrap}>
                <View style={styles.dealBadgeFire}>
                  <Ionicons name="flame" size={14} color="#9C7156" />
                  <Text style={styles.dealBadgeFireText}>{t('todayDeals')}</Text>
                </View>
                <Text style={styles.dealMainTitle}>{t('flashSaleAndGifts')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/deals')}
                style={styles.seeAllBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.seeAllText}>{t('getCoupon')}</Text>
                <Ionicons name="arrow-forward" size={12} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalProducts}
            >
              {featuredProducts.map((p) => (
                <View key={p.id} style={styles.productHorizontalItem}>
                  <ProductCard product={p} cardWidth={160} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 5. SẢN PHẨM BÁN CHẠY (Lấy từ Firestore products) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <View>
              <View style={styles.overlineBadgeRow}>
                <View style={styles.accentDot} />
                <Text style={styles.sectionOverline}>{t('mostLoved')}</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('bestSellers')}</Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/products',
                  params: { sortBy: 'popular' },
                })
              }
              style={styles.seeAllBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.seeAllText}>{t('viewAll')}</Text>
              <Ionicons name="arrow-forward" size={12} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.gridContainer}>
              <ProductCardSkeleton />
              <ProductCardSkeleton />
              <ProductCardSkeleton />
              <ProductCardSkeleton />
            </View>
          ) : (
            <View style={styles.gridContainer}>
              {bestSellers.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </View>
          )}
        </View>

        {/* 6. HOA NHÀ GỐM (Phong cách Card tiêu chuẩn của Deals Tab) */}
        <View style={styles.editorialCard}>
          <View style={styles.editorialImageWrap}>
            <Image
              source={require('../../assets/images/hoa-nha-gom.webp')}
              style={styles.editorialImage}
              contentFit="cover"
            />
            <View style={styles.editorialTagBadge}>
              <Text style={styles.editorialTagBadgeText}>{t('flowerArt')}</Text>
            </View>
          </View>

          <View style={styles.editorialBody}>
            <Text style={styles.editorialOverline}>{t('flowerService')}</Text>
            <Text style={styles.editorialTitle}>{t('flowerHome')}</Text>
            <Text style={styles.editorialDesc}>
              {t('flowerDesc')}
            </Text>

            <View style={styles.pillTagRow}>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{t('weddingFlower')}</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{t('giftBouquet')}</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{t('designBasket')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryDarkBtn}
              activeOpacity={0.88}
              onPress={() => setServiceModal({ visible: true, type: 'flower' })}
            >
              <Text style={styles.primaryDarkBtnText}>{t('exploreFlowerService')}</Text>
              <Ionicons name="arrow-forward" size={15} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 7. DECOR SỰ KIỆN (Phong cách Card tiêu chuẩn của Deals Tab) */}
        <View style={styles.editorialCard}>
          <View style={styles.editorialImageWrap}>
            <Image
              source={require('../../assets/images/decor-su-kien.jpg')}
              style={styles.editorialImage}
              contentFit="cover"
            />
            <View style={styles.editorialTagBadge}>
              <Text style={styles.editorialTagBadgeText}>{t('setupWorkshop')}</Text>
            </View>
          </View>

          <View style={styles.editorialBody}>
            <Text style={styles.editorialOverline}>{t('artSpace')}</Text>
            <Text style={styles.editorialTitle}>{t('eventDecor')}</Text>
            <Text style={styles.editorialDesc}>
              {t('eventDecorDesc')}
            </Text>

            <View style={styles.pillTagRow}>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{t('partySetup')}</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{t('decorWorkshop')}</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{t('checkinCorner')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryDarkBtn}
              activeOpacity={0.88}
              onPress={() => setServiceModal({ visible: true, type: 'event' })}
            >
              <Text style={styles.primaryDarkBtnText}>{t('viewDecorService')}</Text>
              <Ionicons name="sparkles-outline" size={15} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 8. VỀ TIỆM NHÀ GỐM (Phong cách Card tiêu chuẩn của Deals Tab) */}
        <View style={styles.editorialCard}>
          <View style={styles.editorialImageWrap}>
            <Image
              source={require('../../assets/images/about-story.jpg')}
              style={styles.editorialImage}
              contentFit="cover"
            />
            <View style={styles.editorialTagBadge}>
              <Text style={styles.editorialTagBadgeText}>{t('breathOfEarthAndFire')}</Text>
            </View>
          </View>

          <View style={styles.editorialBody}>
            <Text style={styles.editorialOverline}>{t('potteryStory')}</Text>
            <Text style={styles.editorialTitle}>{t('aboutTiemNhaGom')}</Text>
            <Text style={styles.editorialDesc}>
              {t('aboutTiemNhaGomDesc')}
            </Text>

            <TouchableOpacity
              style={styles.secondaryOutlineBtn}
              activeOpacity={0.88}
              onPress={() => setServiceModal({ visible: true, type: 'about' })}
            >
              <Text style={styles.secondaryOutlineBtnText}>{t('learnMoreAboutUs')}</Text>
              <Ionicons name="chevron-forward" size={15} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 9. TIN TỨC BÀI VIẾT (Lấy từ Firestore news) */}
        {newsArticles.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <View>
                <View style={styles.overlineBadgeRow}>
                  <View style={styles.accentDot} />
                  <Text style={styles.sectionOverline}>{t('sharingCorner')}</Text>
                </View>
                <Text style={styles.sectionTitle}>{t('latestArticles')}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.newsScroll}
            >
              {newsArticles.map((article) => (
                <TouchableOpacity
                  key={article.id}
                  style={styles.newsCard}
                  activeOpacity={0.92}
                  onPress={() => router.push(`/article/${article.id}` as any)}
                >
                  <View style={styles.newsImageWrap}>
                    <Image
                      source={{ uri: article.imageUrl }}
                      style={styles.newsImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View style={styles.newsBadge}>
                      <Text style={styles.newsBadgeText}>{t('blog')}</Text>
                    </View>
                  </View>

                  <View style={styles.newsBody}>
                    {article.dateStr ? (
                      <Text style={styles.newsDate}>{article.dateStr}</Text>
                    ) : null}
                    <Text style={styles.newsTitle} numberOfLines={2}>
                      {article.title}
                    </Text>
                    <Text style={styles.newsExcerpt} numberOfLines={2}>
                      {article.excerpt}
                    </Text>
                    <View style={styles.newsReadMore}>
                      <Text style={styles.newsReadMoreText}>{t('readMore')}</Text>
                      <Ionicons name="arrow-forward" size={13} color={Colors.textPrimary} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 10. FOOTER TIỆM */}
        <View style={styles.footerWrap}>
          <Text style={styles.footerBrand}>{t('footerBrand')}</Text>
          <Text style={styles.footerInfo}>{t('footerAddress')}</Text>
          <Text style={styles.footerInfo}>{t('footerHotline')}</Text>
          <Text style={styles.footerInfo}>{t('footerWebsite')}</Text>
          <Text style={styles.footerCopyright}>{t('footerCopyright')}</Text>
        </View>
      </ScrollView>


      {/* SERVICE / ABOUT MODAL (Phong cách Deals Tab) */}
      <AnimatedCenterModal
        visible={serviceModal.visible}
        onClose={() => setServiceModal({ ...serviceModal, visible: false })}
        contentStyle={styles.modalCard}
      >
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalBrandTag}>TIỆM NHÀ GỐM</Text>
            <Text style={styles.modalHeaderTitle}>
              {serviceModal.type === 'flower'
                ? t('serviceFlowerTitle')
                : serviceModal.type === 'event'
                ? t('serviceEventTitle')
                : t('serviceAboutTitle')}
            </Text>
          </View>
          <ScalePressable
            onPress={() => setServiceModal({ ...serviceModal, visible: false })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.modalCloseBtn}
            activeScale={0.9}
          >
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </ScalePressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
          {serviceModal.type === 'flower' && (
            <View>
              <Text style={styles.modalDesc}>
                {t('serviceFlowerDesc')}
              </Text>
              <View style={styles.modalFeatureList}>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('flowerFeature1')}</Text>
                </View>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('flowerFeature2')}</Text>
                </View>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('flowerFeature3')}</Text>
                </View>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('flowerFeature4')}</Text>
                </View>
              </View>
            </View>
          )}

          {serviceModal.type === 'event' && (
            <View>
              <Text style={styles.modalDesc}>
                {t('serviceEventDesc')}
              </Text>
              <View style={styles.modalFeatureList}>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('eventFeature1')}</Text>
                </View>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('eventFeature2')}</Text>
                </View>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('eventFeature3')}</Text>
                </View>
                <View style={styles.modalFeatureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                  <Text style={styles.modalFeatureText}>{t('eventFeature4')}</Text>
                </View>
              </View>
            </View>
          )}

          {serviceModal.type === 'about' && (
            <View>
              <Text style={styles.modalDesc}>
                Tiệm Nhà Gốm khởi đầu từ tình yêu với đất nung và mong muốn gìn giữ nét đẹp thủ
                công truyền thống trong nhịp sống hiện đại.
              </Text>
              <Text style={[styles.modalDesc, { marginTop: 10 }]}>
                Mỗi sản phẩm đều được người thợ gốm nung ở nhiệt độ cao 1280°C, an toàn cho sức
                khỏe, chịu nhiệt tốt và mang một dấu ấn độc bản riêng biệt.
              </Text>
              <View style={styles.modalStoreBox}>
                <Ionicons name="location-outline" size={18} color={Colors.textPrimary} />
                <Text style={styles.modalStoreText}>
                  37 Nguyễn Duy, Phường Gia Định, TP. Hồ Chí Minh
                </Text>
              </View>
            </View>
          )}

          <View style={styles.modalActionRow}>
            <ScalePressable style={styles.modalCallBtn} onPress={callHotline} activeScale={0.96}>
              <Ionicons name="call" size={16} color={Colors.textInverse} />
              <Text style={styles.modalCallBtnText}>{t('contactConsultTitle')}</Text>
            </ScalePressable>
          </View>
        </ScrollView>
      </AnimatedCenterModal>
    </View>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  topGradientWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: 90,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // SECTION TIÊU CHUẨN (Chuẩn khoảng cách 26px - 28px)
  sectionWrap: {
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  overlineBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9C7156',
    marginRight: 6,
  },
  sectionOverline: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#9C7156',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 21,
    fontWeight: '800',
    color: '#2B2928',
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  seeAllText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#9C7156',
    fontWeight: '700',
  },

  // BỘ SƯU TẬP TÂM ĐẮC (Bo cong chuẩn 20px)
  collectionsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  collectionCard: {
    width: 240,
    height: 164,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  collectionImage: {
    width: '100%',
    height: 114,
  },
  collectionFooter: {
    height: 50,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0ECE6',
  },
  collectionName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#2B2928',
    flex: 1,
    marginRight: 8,
  },
  collectionActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionActionText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },

  // CATEGORIES - LƯỚI KHÔNG GIAN TUYỂN CHỌN
  curatedGridCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  curatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  curatedGridItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  curatedIconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  curatedIconCircleInactive: {
    borderWidth: 1.5,
    borderColor: '#E8E1D8',
  },
  curatedIconCircleActive: {
    borderWidth: 2.5,
    borderColor: '#9C7156',
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  curatedImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  curatedEmoji: {
    fontSize: 26,
  },
  curatedItemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6E665D',
    textAlign: 'center',
    lineHeight: 15,
    minHeight: 30,
    width: '100%',
  },
  curatedItemNameSelected: {
    color: '#9C7156',
    fontWeight: '700',
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },

  // DEAL SECTION CONTAINER (Thẻ Ưu Đãi đồng bộ bo cong 20px và màu Gốm Mộc)
  dealContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  dealTitleWrap: {
    gap: 3,
  },
  dealBadgeFire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF4EF',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  dealBadgeFireText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#9C7156',
  },
  dealMainTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '800',
    color: '#2B2928',
    letterSpacing: -0.3,
  },
  horizontalProducts: {
    paddingHorizontal: 16,
    gap: 12,
  },
  productHorizontalItem: {
    width: 160,
  },

  // SẢN PHẨM BÁN CHẠY GRID
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 6,
  },
  loadingWrap: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    color: '#9E968D',
    fontSize: 12,
  },

  // EDITORIAL CARDS (Bo cong 20px chuẩn GEMINI.md, nút bấm & tag đồng bộ bảng màu)
  editorialCard: {
    marginHorizontal: 16,
    marginTop: 26,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  editorialImageWrap: {
    width: '100%',
    height: 185,
    position: 'relative',
    backgroundColor: '#FAF8F5',
  },
  editorialImage: {
    width: '100%',
    height: '100%',
  },
  editorialTagBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(43, 41, 40, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  editorialTagBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  editorialBody: {
    padding: 18,
  },
  editorialOverline: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#9C7156',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  editorialTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 21,
    fontWeight: '800',
    color: '#2B2928',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  editorialDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    lineHeight: 20,
    color: '#6E665D',
    marginBottom: 14,
  },
  pillTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pillTag: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 16,
  },
  pillTagText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#6E665D',
    fontWeight: '600',
  },
  primaryDarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#9C7156',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 26,
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryDarkBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#9C7156',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 26,
  },
  secondaryOutlineBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#9C7156',
  },

  // TIN TỨC BÀI VIẾT (Bo cong 20px)
  newsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  newsCard: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  newsImageWrap: {
    width: '100%',
    height: 130,
    position: 'relative',
    backgroundColor: '#FAF8F5',
  },
  newsImage: {
    width: '100%',
    height: '100%',
  },
  newsBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#9C7156',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  newsBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  newsBody: {
    padding: 14,
  },
  newsDate: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10.5,
    color: '#9E968D',
    marginBottom: 4,
  },
  newsTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#2B2928',
    lineHeight: 18,
    marginBottom: 5,
  },
  newsExcerpt: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#6E665D',
    lineHeight: 16,
    marginBottom: 10,
  },
  newsReadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newsReadMoreText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },

  // FOOTER
  footerWrap: {
    marginHorizontal: 16,
    marginTop: 32,
    paddingTop: 24,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    alignItems: 'center',
    gap: 5,
  },
  footerBrand: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 1.5,
  },
  footerInfo: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  footerCopyright: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 4,
  },

  // MODAL (Chuẩn Deals Tab)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: 12,
  },
  modalBrandTag: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  modalHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    maxHeight: 380,
  },
  modalDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  modalFeatureList: {
    marginTop: 14,
    gap: 8,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalFeatureText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textPrimary,
    flex: 1,
  },
  modalStoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalStoreText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: Colors.textPrimary,
    flex: 1,
  },
  modalActionRow: {
    marginTop: 20,
  },
  modalCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 22,
  },
  modalCallBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textInverse,
  },
});
