// app/collection-detail.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { BlurButton } from '../src/components/BlurButton';
import { SymbolView } from 'expo-symbols';
import { ProductCard } from '../src/components/ProductCard';
import {
  getCollectionByName,
  getProducts,
  CollectionItem,
} from '../src/services/productService';
import { Product } from '../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.95);

export default function CollectionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { t } = useSettings();
  const styles = getStyles(Colors, isDark);

  const { name: nameParam, title: titleParam } = useLocalSearchParams<{
    name?: string;
    title?: string;
  }>();

  const collectionName = (nameParam || titleParam || '').trim();

  const [collectionData, setCollectionData] = useState<CollectionItem | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Parallax Hero Animation (đồng bộ với voucher-detail và index.tsx)
  const scrollY = useRef(new Animated.Value(0)).current;

  const heroOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.75],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const heroScale = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0],
    outputRange: [2.0, 1.0],
    extrapolateRight: 'clamp',
  });

  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, HERO_HEIGHT * 0.42],
    extrapolate: 'clamp',
  });

  // Tải dữ liệu bộ sưu tập và sản phẩm
  const loadData = async () => {
    if (!collectionName) {
      setLoading(false);
      return;
    }
    try {
      const [colDetail, prods] = await Promise.all([
        getCollectionByName(collectionName),
        getProducts({ collection: collectionName, maxItems: 40, expandVariants: false }),
      ]);

      if (colDetail) {
        setCollectionData(colDetail);
      } else {
        // Fallback tạo object tối thiểu nếu không tìm thấy trong Firestore settings
        setCollectionData({
          name: collectionName,
          imageUrl:
            'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
          description: t('collectionDefaultStory'),
        });
      }

      setProducts(prods);
    } catch (err) {
      console.warn('Lỗi tải dữ liệu chi tiết bộ sưu tập:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [collectionName]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Danh sách hình ảnh album nghệ thuật (Gallery)
  const galleryList = useMemo(() => {
    if (!collectionData) return [];
    if (collectionData.galleryUrls && collectionData.galleryUrls.length > 0) {
      return collectionData.galleryUrls;
    }
    return collectionData.imageUrl ? [collectionData.imageUrl] : [];
  }, [collectionData]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />
        <ActivityIndicator size="large" color="#9C7156" />
        <Text style={styles.loadingText}>{t('loading') || 'Đang tải bộ sưu tập...'}</Text>
      </View>
    );
  }

  if (!collectionData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />
        <Ionicons name="folder-open-outline" size={48} color="#9C7156" />
        <Text style={styles.notFoundTitle}>{t('collectionNotFound')}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>{t('back') || 'Quay lại'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* ================= 1. HERO PARALLAX BANNER FULL SCREEN (GIỐNG WEB DETAIL) ================= */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heroWrap,
          {
            height: HERO_HEIGHT,
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
          },
        ]}
      >
        <Image
          source={{ uri: collectionData.imageUrl }}
          style={styles.heroImage}
          contentFit="cover"
          priority="high"
        />
        {/* Lớp phủ Gradient mờ dần từ tối sang trong suốt để tôn chữ và thanh điều hướng */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Tiêu đề & Tag bộ sưu tập nổi trên ảnh Hero */}
        <View style={styles.heroContent}>
          <View style={styles.heroBadgeCapsule}>
            <Ionicons name="sparkles" size={13} color="#E8CCB2" style={{ marginRight: 5 }} />
            <Text style={styles.heroBadgeText}>{t('collectionDetailTitle')}</Text>
          </View>
          <Text style={styles.heroTitle}>{collectionData.name}</Text>
          <Text style={styles.heroSubtitle}>
            {t('collectionProductCount', { count: products.length })}
          </Text>
        </View>
      </Animated.View>

      {/* ================= 2. NÚT QUAY LẠI CỐ ĐỊNH TRÊN CÙNG ================= */}
      <View style={[styles.floatingHeader, { top: insets.top + 6 }]} pointerEvents="box-none">
        <BlurButton onPress={() => router.back()} accessibilityLabel={t('back') || 'Quay lại'}>
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor="#FFFFFF"
            fallback={<Ionicons name="chevron-back" size={22} color="#FFFFFF" style={{ marginLeft: -1 }} />}
          />
        </BlurButton>
      </View>

      {/* ================= 3. NỘI DUNG CUỘN CHÍNH (MAIN SHEET TRƯỢT LÊN TRÊN HERO) ================= */}
      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#9C7156"
            progressViewOffset={HERO_HEIGHT - 30}
          />
        }
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
      >
        {/* Khoảng đệm spacer để lộ ảnh Hero full ở đỉnh ban đầu */}
        <View style={{ height: HERO_HEIGHT - 28 }} />

        {/* MAIN SHEET BO TRÒN 28PX CHUẨN GEMINI.MD */}
        <View style={[styles.mainSheet, { backgroundColor: Colors.background }]}>
          {/* Tag Thương hiệu */}
          <View style={styles.brandTagRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brandSubtitle}>TIỆM NHÀ GỐM • CURATED COLLECTION</Text>
          </View>

          {/* Tiêu đề chính */}
          <Text style={styles.sheetTitle}>{collectionData.name}</Text>

          {/* ================= CÂU CHUYỆN BỘ SƯU TẬP (STORY TEXT GIỐNG TRÊN WEB) ================= */}
          <View style={styles.storyCard}>
            <View style={styles.storyHeaderRow}>
              <View style={styles.storyIconWrap}>
                <Ionicons name="book-outline" size={17} color="#9C7156" />
              </View>
              <Text style={styles.storySectionTitle}>{t('collectionStoryTitle')}</Text>
            </View>
            <Text style={styles.storyText}>
              {collectionData.description || t('collectionDefaultStory')}
            </Text>
          </View>

          {/* ================= ALBUM ẢNH NGHỆ THUẬT (GALLERY GIỐNG CỘT TRÁI WEB) ================= */}
          {galleryList.length > 0 && (
            <View style={styles.gallerySection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.accentBar} />
                <Text style={styles.sectionHeading}>{t('collectionGalleryTitle')}</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {galleryList.map((url, idx) => (
                  <View key={`gal_${idx}`} style={styles.galleryImageCard}>
                    <Image
                      source={{ uri: url }}
                      style={styles.galleryImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ================= DANH SÁCH TÁC PHẨM THUỘC BỘ SƯU TẬP (FEATURED PRODUCTS) ================= */}
          <View style={styles.productsSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.accentBar} />
              <View style={styles.sectionTitleCol}>
                <Text style={styles.sectionHeading}>{t('collectionFeaturedProducts')}</Text>
                <Text style={styles.sectionSubHeading}>
                  {t('collectionProductCount', { count: products.length })}
                </Text>
              </View>
            </View>

            {products.length === 0 ? (
              <View style={styles.emptyProductsCard}>
                <Ionicons name="cube-outline" size={36} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>{t('collectionEmptyProducts')}</Text>
              </View>
            ) : (
              <View style={styles.productGrid}>
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </View>
            )}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      gap: 12,
    },
    loadingText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
    },
    notFoundTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginTop: 8,
    },
    backBtn: {
      marginTop: 12,
      paddingHorizontal: 22,
      paddingVertical: 10,
      backgroundColor: '#9C7156',
      borderRadius: 20,
    },
    backBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ================= HERO BANNER =================
    heroWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      width: SCREEN_WIDTH,
      overflow: 'hidden',
      zIndex: 1,
      justifyContent: 'flex-end',
    },
    heroImage: {
      ...StyleSheet.absoluteFill,
      width: '100%',
      height: '100%',
    },
    heroContent: {
      paddingHorizontal: 20,
      paddingBottom: 44,
      zIndex: 3,
    },
    heroBadgeCapsule: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(43, 41, 40, 0.65)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(232, 204, 178, 0.35)',
      marginBottom: 8,
    },
    heroBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      color: '#E8CCB2',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    heroTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 26,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 32,
      textShadowColor: 'rgba(0, 0, 0, 0.6)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 6,
    },
    heroSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: '#E8CCB2',
      marginTop: 4,
      fontWeight: '600',
    },

    // ================= FLOATING HEADER =================
    floatingHeader: {
      position: 'absolute',
      left: 16,
      zIndex: 10,
    },

    // ================= SCROLL VIEW & MAIN SHEET =================
    scrollView: {
      flex: 1,
      zIndex: 2,
    },
    scrollContent: {
      flexGrow: 1,
    },
    mainSheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 24,
      paddingHorizontal: 16,
      minHeight: 600,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      elevation: 6,
    },
    brandTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    brandDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#9C7156',
      marginRight: 7,
    },
    brandSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: '#9C7156',
    },
    sheetTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 22,
      fontWeight: '800',
      lineHeight: 28,
      color: Colors.textPrimary,
      marginBottom: 16,
    },

    // ================= CÂU CHUYỆN BỘ SƯU TẬP =================
    storyCard: {
      backgroundColor: isDark ? '#141414' : '#FFFFFF',
      borderRadius: 20,
      padding: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
      marginBottom: 24,
    },
    storyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    storyIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.22)' : '#F5EBE1',
      justifyContent: 'center',
      alignItems: 'center',
    },
    storySectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: '#9C7156',
    },
    storyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      lineHeight: 23,
      color: isDark ? '#CFC8C0' : '#4A4642',
      textAlign: 'justify',
    },

    // ================= GALLERY SECTION =================
    gallerySection: {
      marginBottom: 24,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    accentBar: {
      width: 4,
      height: 18,
      borderRadius: 2,
      backgroundColor: '#9C7156',
    },
    sectionHeading: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    sectionTitleCol: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    sectionSubHeading: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: '#9C7156',
      fontWeight: '600',
    },
    galleryScroll: {
      gap: 12,
      paddingRight: 8,
    },
    galleryImageCard: {
      width: SCREEN_WIDTH * 0.72,
      height: Math.round(SCREEN_WIDTH * 0.72 * 0.75),
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: isDark ? '#1C1C1C' : '#F6F4EC',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
    },
    galleryImage: {
      width: '100%',
      height: '100%',
    },

    // ================= PRODUCTS SECTION =================
    productsSection: {
      marginBottom: 20,
    },
    productGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 12,
    },
    emptyProductsCard: {
      backgroundColor: isDark ? '#141414' : '#FFFFFF',
      borderRadius: 20,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
  });
