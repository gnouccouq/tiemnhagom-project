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
import { CategoryChip } from '../../src/components/CategoryChip';
import {
  DEFAULT_CATEGORIES,
  getCategories,
  ProductCategoryItem,
  getProducts,
  getCollections,
  getBestSellingProducts,
  getNewsArticles,
  CollectionItem,
  NewsArticle,
} from '../../src/services/productService';
import { getUserOrders } from '../../src/services/orderService';
import { Product } from '../../src/types';
import { useAuth } from '../../src/context/AuthContext';
import { auth } from '../../src/config/firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Cấu hình 4 hạng thành viên đồng bộ chuẩn xác từ Website & Tab Ưu đãi
const MEMBERSHIP_TIERS = [
  { id: 'null', name: 'Gốm Mộc', badge: '🪵', min: 0, color: '#A1A1AA' },
  { id: 'new', name: 'Gốm Nung', badge: '🔥', min: 1000000, color: '#60A5FA' },
  { id: 'mem', name: 'Gốm Men', badge: '✨', min: 5000000, color: '#FBBF24' },
  { id: 'vip', name: 'Gốm Độc Bản', badge: '👑', min: 10000000, color: '#F87171' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, userProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [categories, setCategories] = useState<ProductCategoryItem[]>(DEFAULT_CATEGORIES);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Animation ẩn/hiện thanh VIP Member Pill khi cuộn
  const lastScrollY = useRef(0);
  const isPillVisible = useRef(true);
  const pillTranslateY = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;

  const showPill = () => {
    if (!isPillVisible.current) {
      isPillVisible.current = true;
      Animated.parallel([
        Animated.spring(pillTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(pillOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const hidePill = () => {
    if (isPillVisible.current) {
      isPillVisible.current = false;
      Animated.parallel([
        Animated.spring(pillTranslateY, {
          toValue: 90,
          useNativeDriver: true,
          tension: 70,
          friction: 12,
        }),
        Animated.timing(pillOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  // Xác định trạng thái đăng nhập thực tế (đồng bộ từ user, userProfile và Firebase Auth)
  const isLoggedIn = Boolean(user || userProfile || auth.currentUser);
  const effectiveUid = user?.uid || userProfile?.uid || auth.currentUser?.uid;

  // Tính toán dữ liệu người dùng thực tế (chi tiêu, điểm, hạng)
  const [totalSpent, setTotalSpent] = useState<number>(0);

  useEffect(() => {
    if (effectiveUid) {
      getUserOrders(effectiveUid)
        .then((orders) => {
          let spent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
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
          });
          setTotalSpent(spent);
        })
        .catch(() => {
          setTotalSpent(Number(userProfile?.totalSpent || userProfile?.spentTotal || 0));
        });
    } else {
      setTotalSpent(0);
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

  const points =
    userProfile?.points !== undefined
      ? Number(userProfile.points)
      : Math.floor(totalSpent / 100000);

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
      const [colRes, bestRes, newsRes, prodRes, catRes] = await Promise.allSettled([
        getCollections(),
        getBestSellingProducts(10),
        getNewsArticles(6),
        getProducts({ maxItems: 30 }),
        getCategories(),
      ]);

      if (colRes.status === 'fulfilled') {
        setCollections(colRes.value);
      }
      if (bestRes.status === 'fulfilled') {
        setBestSellers(bestRes.value);
      }
      if (newsRes.status === 'fulfilled') {
        setNewsArticles(newsRes.value);
      }
      if (prodRes.status === 'fulfilled') {
        const all = prodRes.value;
        const feat = all.filter((p) => (p.sale && p.sale > 0) || p.salePrice).slice(0, 6);
        setFeaturedProducts(feat.length > 0 ? feat : all.slice(0, 6));
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

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const [scrollY, setScrollY] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    setScrollY(currentY);

    const diff = currentY - lastScrollY.current;

    // Khi ở gần đầu trang (currentY <= 40), luôn hiện lại thanh user
    if (currentY <= 40) {
      showPill();
    } else if (diff > 6 && currentY > 50) {
      // Đang lướt xuống -> Ẩn thanh user
      hidePill();
    } else if (diff < -6) {
      // Đang cuộn lên -> Hiện lại thanh user
      showPill();
    }

    lastScrollY.current = currentY;
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
            tintColor="#18181B"
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
                  <Text style={styles.sectionOverline}>CHỦ ĐỀ ĐẶC TRƯNG</Text>
                </View>
                <Text style={styles.sectionTitle}>Bộ Sưu Tập Tâm Đắc</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/products')}
                style={styles.seeAllBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.seeAllText}>Tất cả</Text>
                <Ionicons name="arrow-forward" size={12} color="#18181B" />
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
                      <Text style={styles.collectionActionText}>Khám phá ngay</Text>
                      <Ionicons name="arrow-forward" size={12} color="#18181B" />
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
                <Text style={styles.sectionOverline}>DANH MỤC GỐM SỨ</Text>
              </View>
              <Text style={styles.sectionTitle}>Không Gian Tuyển Chọn</Text>
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
              <Text style={styles.seeAllText}>Xem tất cả</Text>
              <Ionicons name="arrow-forward" size={12} color="#18181B" />
            </TouchableOpacity>
          </View>

          {/* Hàng 1: Danh mục cha (Parent Categories) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScroll}
          >
            {categories.map((cat) => (
              <CategoryChip
                key={cat.id}
                id={cat.id}
                name={cat.name}
                icon={cat.icon}
                isSelected={selectedCategory === cat.id}
                onPress={() => {
                  setSelectedCategory(cat.id);
                  setSelectedSubCategory('');
                }}
              />
            ))}
          </ScrollView>

          {/* Hàng 2: Danh mục con (Subcategories) đầy đủ */}
          {(() => {
            const activeGroup = categories.find((c) => c.id === selectedCategory);
            const subsToShow =
              activeGroup && activeGroup.subs && activeGroup.subs.length > 0
                ? activeGroup.subs
                : Array.from(new Set(categories.flatMap((c) => c.subs || []))).slice(0, 10);

            if (!subsToShow || subsToShow.length === 0) return null;

            return (
              <View style={styles.subCategoriesWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subCategoriesScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.subCategoryChip,
                      selectedSubCategory === '' && styles.subCategoryChipActive,
                    ]}
                    onPress={() => {
                      setSelectedSubCategory('');
                      router.push({
                        pathname: '/(tabs)/products',
                        params: { category: selectedCategory === 'all' ? '' : selectedCategory },
                      });
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.subCategoryText,
                        selectedSubCategory === '' && styles.subCategoryTextActive,
                      ]}
                    >
                      {activeGroup && activeGroup.id !== 'all' ? `Tất cả ${activeGroup.name}` : 'Tất cả'}
                    </Text>
                  </TouchableOpacity>

                  {subsToShow.map((sub, idx) => {
                    const isSelected = selectedSubCategory === sub;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.subCategoryChip,
                          isSelected && styles.subCategoryChipActive,
                        ]}
                        onPress={() => {
                          setSelectedSubCategory(sub);
                          router.push({
                            pathname: '/(tabs)/products',
                            params: { category: sub },
                          });
                        }}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.subCategoryText,
                            isSelected && styles.subCategoryTextActive,
                          ]}
                        >
                          {sub}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}
        </View>

        {/* 4. FLASH SALE / ƯU ĐÃI HÔM NAY (Phong cách thẻ Deals) */}
        {featuredProducts.length > 0 && (
          <View style={styles.dealContainer}>
            <View style={styles.dealHeader}>
              <View style={styles.dealTitleWrap}>
                <View style={styles.dealBadgeFire}>
                  <Ionicons name="flame" size={14} color="#DC2626" />
                  <Text style={styles.dealBadgeFireText}>ƯU ĐÃI HÔM NAY</Text>
                </View>
                <Text style={styles.dealMainTitle}>Flash Sale & Quà Tặng</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/deals')}
                style={styles.seeAllBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.seeAllText}>Nhận mã</Text>
                <Ionicons name="arrow-forward" size={12} color="#18181B" />
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
                <Text style={styles.sectionOverline}>ĐƯỢC YÊU THÍCH NHẤT</Text>
              </View>
              <Text style={styles.sectionTitle}>Sản Phẩm Bán Chạy</Text>
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
              <Text style={styles.seeAllText}>Xem tất cả</Text>
              <Ionicons name="arrow-forward" size={12} color="#18181B" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#18181B" />
              <Text style={styles.loadingText}>Đang tải đồ gốm...</Text>
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
              <Text style={styles.editorialTagBadgeText}>HOA TƯƠI NGHỆ THUẬT</Text>
            </View>
          </View>

          <View style={styles.editorialBody}>
            <Text style={styles.editorialOverline}>DỊCH VỤ HOA TƯƠI</Text>
            <Text style={styles.editorialTitle}>Hoa Nhà Gốm</Text>
            <Text style={styles.editorialDesc}>
              Không chỉ có gốm, Tiệm mang đến những thiết kế hoa tươi tinh tế, giúp tô điểm thêm vẻ
              đẹp cho không gian sống và những dịp đặc biệt của bạn.
            </Text>

            <View style={styles.pillTagRow}>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>Hoa cưới</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>Bó hoa tặng</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>Giỏ hoa thiết kế</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryDarkBtn}
              activeOpacity={0.88}
              onPress={() => setServiceModal({ visible: true, type: 'flower' })}
            >
              <Text style={styles.primaryDarkBtnText}>Khám phá dịch vụ hoa</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
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
              <Text style={styles.editorialTagBadgeText}>SETUP & WORKSHOP</Text>
            </View>
          </View>

          <View style={styles.editorialBody}>
            <Text style={styles.editorialOverline}>KHÔNG GIAN NGHỆ THUẬT</Text>
            <Text style={styles.editorialTitle}>Trang trí Sự kiện</Text>
            <Text style={styles.editorialDesc}>
              Tiệm nhận thiết kế và setup không gian cho các buổi tiệc thân mật, workshop hay góc
              check-in nghệ thuật, kết hợp tinh tế giữa hoa tươi và đồ gốm thủ công.
            </Text>

            <View style={styles.pillTagRow}>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>Setup tiệc</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>Workshop decor</Text>
              </View>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>Góc check-in</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryDarkBtn}
              activeOpacity={0.88}
              onPress={() => setServiceModal({ visible: true, type: 'event' })}
            >
              <Text style={styles.primaryDarkBtnText}>Xem dịch vụ trang trí</Text>
              <Ionicons name="sparkles-outline" size={15} color="#FFFFFF" />
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
              <Text style={styles.editorialTagBadgeText}>HƠI THỞ CỦA ĐẤT & LỬA</Text>
            </View>
          </View>

          <View style={styles.editorialBody}>
            <Text style={styles.editorialOverline}>CÂU CHUYỆN XƯỞNG GỐM</Text>
            <Text style={styles.editorialTitle}>Về Tiệm Nhà Gốm</Text>
            <Text style={styles.editorialDesc}>
              Tại Tiệm Nhà Gốm, chúng tôi tin rằng những vật dụng hàng ngày cũng có linh hồn. Từng chiếc tách, từng bình hoa đều được tạo tác thủ công với tất cả sự tỉ mỉ và tâm huyết, mang hơi thở của đất và lửa vào không gian sống của bạn.
            </Text>

            <TouchableOpacity
              style={styles.secondaryOutlineBtn}
              activeOpacity={0.88}
              onPress={() => setServiceModal({ visible: true, type: 'about' })}
            >
              <Text style={styles.secondaryOutlineBtnText}>Tìm hiểu thêm về chúng tôi</Text>
              <Ionicons name="chevron-forward" size={15} color="#18181B" />
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
                  <Text style={styles.sectionOverline}>GÓC CHIA SẺ</Text>
                </View>
                <Text style={styles.sectionTitle}>Bài Viết Mới Nhất</Text>
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
                      <Text style={styles.newsBadgeText}>BLOG</Text>
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
                      <Text style={styles.newsReadMoreText}>Đọc tiếp</Text>
                      <Ionicons name="arrow-forward" size={13} color="#18181B" />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 10. FOOTER TIỆM */}
        <View style={styles.footerWrap}>
          <Text style={styles.footerBrand}>TIỆM NHÀ GỐM • CERAMICS & DECOR</Text>
          <Text style={styles.footerInfo}>37 Nguyễn Duy, Phường Gia Định, TP. Hồ Chí Minh</Text>
          <Text style={styles.footerInfo}>Hotline: 0777709662</Text>
          <Text style={styles.footerInfo}>Website: tiemnhagom.vn</Text>
          <Text style={styles.footerCopyright}>© 2026 Tiệm Nhà Gốm. All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* ================= THANH MEMBER PILL CỐ ĐỊNH Ở TRÊN BOTTOM BAR (CHỈ RIÊNG TRANG CHỦ) VỚI ANIMATION ẨN HIỆN ================= */}
      <Animated.View
        style={[
          styles.fixedMemberPillWrap,
          {
            transform: [{ translateY: pillTranslateY }],
            opacity: pillOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.fixedMemberPill}
          activeOpacity={0.9}
          onPress={() => {
            if (isLoggedIn) {
              router.push('/(tabs)/deals');
            } else {
              router.push('/auth/login' as any);
            }
          }}
        >
          {isLoggedIn ? (
            <>
              <View style={styles.memberPillLeft}>
                <View style={styles.memberAvatarWrap}>
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={styles.memberAvatar}
                    />
                  ) : (
                    <View style={styles.memberAvatarPlaceholder}>
                      <Text style={styles.memberAvatarInitial}>
                        {(displayName || 'G')[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.memberTextWrap}>
                  <View style={styles.memberGreetingRow}>
                    <Text style={styles.memberBrandTag}>TIỆM NHÀ GỐM</Text>
                    <View style={styles.memberTierBadge}>
                      <Text style={styles.memberTierBadgeText}>
                        {currentTier.badge} {currentTier.name.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {displayName || 'Khách hàng thân thiết'}
                  </Text>
                </View>
              </View>

              <View style={styles.memberPillRight}>
                <View style={styles.memberPointsBox}>
                  <Text style={styles.memberPointsLabel}>ĐIỂM TÍCH LŨY</Text>
                  <Text style={styles.memberPointsVal}>{points} ĐIỂM</Text>
                </View>
                <View style={styles.memberArrowBtn}>
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.memberPillLeft}>
                <View style={[styles.memberAvatarWrap, styles.memberAvatarGuest]}>
                  <Ionicons name="person" size={17} color="#D4D4D8" />
                </View>

                <View style={styles.memberTextWrap}>
                  <View style={styles.memberGreetingRow}>
                    <Text style={styles.memberBrandTag}>TIỆM NHÀ GỐM</Text>
                    <View style={[styles.memberTierBadge, styles.memberGuestBadge]}>
                      <Text style={styles.memberGuestBadgeText}>ƯU ĐÃI THÀNH VIÊN</Text>
                    </View>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>
                    Đăng nhập / Đăng ký
                  </Text>
                </View>
              </View>

              <View style={styles.memberPillRight}>
                <View style={styles.loginPillBadge}>
                  <Text style={styles.loginPillBadgeText}>Đăng nhập</Text>
                  <Ionicons name="arrow-forward" size={13} color="#18181B" />
                </View>
              </View>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* SERVICE / ABOUT MODAL (Phong cách Deals Tab) */}
      <Modal
        visible={serviceModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setServiceModal({ ...serviceModal, visible: false })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalBrandTag}>TIỆM NHÀ GỐM</Text>
                <Text style={styles.modalHeaderTitle}>
                  {serviceModal.type === 'flower'
                    ? 'Hoa Nhà Gốm'
                    : serviceModal.type === 'event'
                    ? 'Trang Trí Sự Kiện'
                    : 'Về Tiệm Nhà Gốm'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setServiceModal({ ...serviceModal, visible: false })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#18181B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              {serviceModal.type === 'flower' && (
                <View>
                  <Text style={styles.modalDesc}>
                    Hoa Nhà Gốm là sự kết hợp tinh tế giữa nghệ thuật cắm hoa hiện đại và các bình
                    gốm thủ công mộc mạc từ Tiệm.
                  </Text>
                  <View style={styles.modalFeatureList}>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Hoa cưới cầm tay & hoa cài áo</Text>
                    </View>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Bó hoa tặng sinh nhật, ngày kỷ niệm</Text>
                    </View>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Bình hoa gốm mix hoa tươi theo yêu cầu</Text>
                    </View>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Thiết kế hoa định kỳ cho quán cafe, nhà hàng</Text>
                    </View>
                  </View>
                </View>
              )}

              {serviceModal.type === 'event' && (
                <View>
                  <Text style={styles.modalDesc}>
                    Tiệm nhận tư vấn, thiết kế và trang trí không gian nghệ thuật với vật liệu chính
                    là đồ gốm, hoa tươi và phong cách mộc mạc ấm cúng.
                  </Text>
                  <View style={styles.modalFeatureList}>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Setup bàn tiệc thân mật (Dinner / Tea party)</Text>
                    </View>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Tổ chức workshop gốm thủ công cuối tuần</Text>
                    </View>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Thiết kế góc chụp ảnh check-in sự kiện</Text>
                    </View>
                    <View style={styles.modalFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#18181B" />
                      <Text style={styles.modalFeatureText}>Quà tặng doanh nghiệp khắc logo theo yêu cầu</Text>
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
                    <Ionicons name="location-outline" size={18} color="#18181B" />
                    <Text style={styles.modalStoreText}>
                      37 Nguyễn Duy, Phường Gia Định, TP. Hồ Chí Minh
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.modalActionRow}>
                <TouchableOpacity style={styles.modalCallBtn} onPress={callHotline}>
                  <Ionicons name="call" size={16} color="#FFFFFF" />
                  <Text style={styles.modalCallBtnText}>Liên hệ tư vấn (0777709662)</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
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
  scrollContent: {
    paddingBottom: 175, // Dành khoảng trống để không bị che bởi fixedMemberPill ở đáy
  },

  // THẺ THÀNH VIÊN SỐ CỐ ĐỊNH Ở ĐÁY TRANG CHỦ (TRÊN BOTTOM BAR)
  fixedMemberPillWrap: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    zIndex: 99,
  },
  fixedMemberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  memberPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  memberAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#3F3F46',
  },
  memberAvatar: {
    width: 36,
    height: 36,
  },
  memberAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarInitial: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#F4F4F5',
  },
  memberAvatarGuest: {
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberTextWrap: {
    flex: 1,
  },
  memberGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  memberBrandTag: {
    fontFamily: 'ElleGaborStd',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#A1A1AA',
  },
  memberTierBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  memberTierBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 8.5,
    fontWeight: '700',
    color: '#FBBF24',
  },
  memberGuestBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  memberGuestBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 8,
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  memberName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  memberPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberPointsBox: {
    alignItems: 'flex-end',
  },
  memberPointsLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 8,
    color: '#A1A1AA',
    letterSpacing: 0.8,
  },
  memberPointsVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  memberArrowBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  loginPillBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#18181B',
  },

  // SECTION TIÊU CHUẨN
  sectionWrap: {
    marginTop: 26,
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
    color: '#18181B',
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  seeAllText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#18181B',
    fontWeight: '700',
  },

  // BỘ SƯU TẬP TÂM ĐẮC
  collectionsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  collectionCard: {
    width: 240,
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  collectionImage: {
    width: '100%',
    height: 110,
  },
  collectionFooter: {
    height: 50,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  collectionName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
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
    fontWeight: '600',
    color: '#18181B',
  },

  // CATEGORIES
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  subCategoriesWrap: {
    marginTop: 8,
  },
  subCategoriesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    gap: 6,
  },
  subCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    marginRight: 6,
  },
  subCategoryChipActive: {
    backgroundColor: '#18181B',
    borderColor: '#18181B',
  },
  subCategoryText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  subCategoryTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // DEAL SECTION CONTAINER (Theo chuẩn tab Ưu đãi)
  dealContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 22,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  dealTitleWrap: {
    gap: 2,
  },
  dealBadgeFire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dealBadgeFireText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#DC2626',
  },
  dealMainTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '800',
    color: '#18181B',
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
    color: '#71717A',
    fontSize: 12,
  },

  // EDITORIAL CARDS (Hoa Nhà Gốm, Trang Trí Sự Kiện, Về Tiệm - Chuẩn Deals Tab)
  editorialCard: {
    marginHorizontal: 16,
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  editorialImageWrap: {
    width: '100%',
    height: 185,
    position: 'relative',
    backgroundColor: '#F4F4F5',
  },
  editorialImage: {
    width: '100%',
    height: '100%',
  },
  editorialTagBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
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
    padding: 16,
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
    color: '#18181B',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  editorialDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    lineHeight: 20,
    color: '#52525B',
    marginBottom: 14,
  },
  pillTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pillTag: {
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  pillTagText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#52525B',
    fontWeight: '500',
  },
  primaryDarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#18181B',
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryDarkBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    paddingVertical: 11,
    borderRadius: 22,
  },
  secondaryOutlineBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
  },

  // TIN TỨC BÀI VIẾT (Chuẩn Deals Tab)
  newsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  newsCard: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  newsImageWrap: {
    width: '100%',
    height: 130,
    position: 'relative',
    backgroundColor: '#F4F4F5',
  },
  newsImage: {
    width: '100%',
    height: '100%',
  },
  newsBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#18181B',
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
    color: '#71717A',
    marginBottom: 4,
  },
  newsTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#18181B',
    lineHeight: 18,
    marginBottom: 5,
  },
  newsExcerpt: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#52525B',
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
    fontSize: 11.5,
    fontWeight: '700',
    color: '#18181B',
  },

  // FOOTER
  footerWrap: {
    marginHorizontal: 16,
    marginTop: 32,
    paddingTop: 24,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    alignItems: 'center',
    gap: 5,
  },
  footerBrand: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '800',
    color: '#18181B',
    letterSpacing: 1.5,
  },
  footerInfo: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#71717A',
    textAlign: 'center',
  },
  footerCopyright: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#A1A1AA',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
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
    borderBottomColor: '#F4F4F5',
    paddingBottom: 12,
  },
  modalBrandTag: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#71717A',
    marginBottom: 2,
  },
  modalHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F4F5',
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
    color: '#3F3F46',
  },
  modalFeatureList: {
    marginTop: 14,
    gap: 8,
    backgroundColor: '#F4F4F5',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  modalFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalFeatureText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#27272A',
    flex: 1,
  },
  modalStoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#F4F4F5',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  modalStoreText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#27272A',
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
    backgroundColor: '#18181B',
    paddingVertical: 13,
    borderRadius: 22,
  },
  modalCallBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
