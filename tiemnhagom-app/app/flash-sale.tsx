// app/flash-sale.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { ScalePressable } from '../src/components/ScalePressable';
import { FlashSaleCard } from '../src/components/FlashSaleCard';
import { useSettings } from '../src/context/SettingsContext';
import { useThemeColor } from '../src/constants/theme';
import {
  fetchFlashSaleData,
  FlashSaleData,
  ProductWithFlashSale,
} from '../src/services/flashSaleService';
import { DEFAULT_CATEGORIES } from '../src/services/productService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 32 - 12) / 2;

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export default function FlashSaleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  const [scrollY, setScrollY] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flashSaleData, setFlashSaleData] = useState<FlashSaleData | null>(null);

  // Bộ lọc & Sắp xếp
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriceGroup, setSelectedPriceGroup] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'sale-desc' | 'price-asc' | 'price-desc' | 'rating-desc'>('sale-desc');

  // Đếm ngược thời gian
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // Tải dữ liệu Flash Sale
  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      const data = await fetchFlashSaleData(selectedCategory, forceRefresh);
      setFlashSaleData(data);
    } catch (error) {
      console.error('Lỗi nạp dữ liệu Flash Sale:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Cập nhật Countdown Timer
  useEffect(() => {
    if (!flashSaleData) return;
    const { status } = flashSaleData;
    const targetDate = status.isRunning
      ? status.endTime
      : status.isUpcoming
      ? status.startTime
      : null;

    if (!targetDate) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const updateCountdown = () => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        // Kích hoạt nạp lại khi chuyển trạng thái (bắt đầu hoặc kết thúc)
        loadData(true);
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [flashSaleData, loadData]);

  // Hàm sắp xếp
  const sortProducts = useCallback((list: ProductWithFlashSale[]) => {
    const copy = [...list];
    copy.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.effectivePrice - b.effectivePrice;
        case 'price-desc':
          return b.effectivePrice - a.effectivePrice;
        case 'rating-desc':
          return (b.rating || 0) - (a.rating || 0);
        case 'sale-desc':
        default:
          return b.effectiveSalePercent - a.effectiveSalePercent;
      }
    });
    return copy;
  }, [sortBy]);

  // Lọc sản phẩm theo priceGroup nếu chọn
  const filteredAllProducts = useMemo(() => {
    if (!flashSaleData) return [];
    let list = flashSaleData.allProducts;
    if (selectedPriceGroup !== null) {
      list = list.filter((p) => (p as any).flashSaleGroup === selectedPriceGroup);
    }
    return sortProducts(list);
  }, [flashSaleData, selectedPriceGroup, sortProducts]);

  const priceGroups = flashSaleData?.settings?.priceGroups || [];
  const status = flashSaleData?.status;
  const isRunning = status?.isRunning;
  const isUpcoming = status?.isUpcoming;

  return (
    <View style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Header chuẩn GEMINI.md: Nút Back tròn 40x40, tiêu đề, nút giỏ hàng */}
      <Header
        title={t('flashSaleTitle')}
        showBack={true}
        showSearch={false}
        showCart={true}
        transparent={true}
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 + 8 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#9C7156"
            colors={['#9C7156']}
          />
        }
      >
        {/* ================= HERO BANNER & COUNTDOWN TIMER ================= */}
        <View style={styles.heroBanner}>
          <View style={styles.heroContent}>
            {/* Huy hiệu trạng thái */}
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.statusBadge,
                  isRunning
                    ? styles.statusBadgeRunning
                    : isUpcoming
                    ? styles.statusBadgeUpcoming
                    : styles.statusBadgeEnded,
                ]}
              >
                <Ionicons
                  name={isRunning ? 'flash' : isUpcoming ? 'time' : 'checkmark-circle'}
                  size={13}
                  color="#FFFFFF"
                />
                <Text style={styles.statusBadgeText}>
                  {isRunning
                    ? t('flashSaleRunning')
                    : isUpcoming
                    ? t('flashSaleUpcoming')
                    : t('flashSaleEnded')}
                </Text>
              </View>
            </View>

            {/* Tiêu đề & phụ đề */}
            <Text style={styles.heroTitle}>{status?.title || t('flashSaleTitle')}</Text>
            <Text style={styles.heroSubtitle}>
              {status?.subtitle || t('flashSaleSubtitle')}
            </Text>

            {/* Bộ đếm ngược thời gian */}
            {(isRunning || isUpcoming) && (
              <View style={styles.countdownContainer}>
                <Text style={styles.countdownPrompt}>
                  {isRunning ? t('endsIn') : t('startsIn')}
                </Text>
                <View style={styles.timerRow}>
                  {timeLeft.days > 0 && (
                    <>
                      <View style={styles.timerBox}>
                        <Text style={styles.timerNum}>
                          {String(timeLeft.days).padStart(2, '0')}
                        </Text>
                        <Text style={styles.timerUnit}>{t('days')}</Text>
                      </View>
                      <Text style={styles.timerColon}>:</Text>
                    </>
                  )}
                  <View style={styles.timerBox}>
                    <Text style={styles.timerNum}>
                      {String(timeLeft.hours).padStart(2, '0')}
                    </Text>
                    <Text style={styles.timerUnit}>{t('hours')}</Text>
                  </View>
                  <Text style={styles.timerColon}>:</Text>
                  <View style={styles.timerBox}>
                    <Text style={styles.timerNum}>
                      {String(timeLeft.minutes).padStart(2, '0')}
                    </Text>
                    <Text style={styles.timerUnit}>{t('minutes')}</Text>
                  </View>
                  <Text style={styles.timerColon}>:</Text>
                  <View style={styles.timerBox}>
                    <Text style={styles.timerNum}>
                      {String(timeLeft.seconds).padStart(2, '0')}
                    </Text>
                    <Text style={styles.timerUnit}>{t('seconds')}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ================= BỘ LỌC DANH MỤC CUỘN NGANG (KÈM SỐ LƯỢNG) ================= */}
        <View style={styles.categoryFilterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScrollContent}
          >
            {DEFAULT_CATEGORIES.map((cat) => {
              const isSelected =
                (cat.id === 'all' && selectedCategory === 'all') ||
                selectedCategory.toLowerCase() === cat.name.toLowerCase();
              const count =
                flashSaleData?.categoryCounts[cat.id === 'all' ? 'all' : cat.name] || 0;

              return (
                <ScalePressable
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    isSelected ? styles.categoryChipActive : styles.categoryChipInactive,
                  ]}
                  onPress={() => setSelectedCategory(cat.id === 'all' ? 'all' : cat.name)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      isSelected ? styles.categoryChipTextActive : styles.categoryChipTextInactive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      isSelected ? styles.countBadgeActive : styles.countBadgeInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.countBadgeText,
                        isSelected
                          ? styles.countBadgeTextActive
                          : styles.countBadgeTextInactive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </ScalePressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ================= BỘ LỌC ĐỒNG GIÁ (NẾU CÓ PRICE GROUPS) ================= */}
        {isRunning && priceGroups.length > 0 && (
          <View style={styles.priceGroupSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.priceGroupScrollContent}
            >
              <ScalePressable
                style={[
                  styles.priceChip,
                  selectedPriceGroup === null ? styles.priceChipActive : styles.priceChipInactive,
                ]}
                onPress={() => setSelectedPriceGroup(null)}
              >
                <Text
                  style={[
                    styles.priceChipText,
                    selectedPriceGroup === null
                      ? styles.priceChipTextActive
                      : styles.priceChipTextInactive,
                  ]}
                >
                  {t('allPrices')}
                </Text>
              </ScalePressable>

              {priceGroups.map((price) => {
                const isSelected = selectedPriceGroup === price;
                const label = `⚡ Đồng giá ${price / 1000}k`;
                return (
                  <ScalePressable
                    key={price}
                    style={[
                      styles.priceChip,
                      isSelected ? styles.priceChipActive : styles.priceChipInactive,
                    ]}
                    onPress={() => setSelectedPriceGroup(isSelected ? null : price)}
                  >
                    <Text
                      style={[
                        styles.priceChipText,
                        isSelected ? styles.priceChipTextActive : styles.priceChipTextInactive,
                      ]}
                    >
                      {label}
                    </Text>
                  </ScalePressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ================= THANH TỔNG SỐ LƯỢNG & SẮP XẾP ================= */}
        <View style={styles.sortBar}>
          <Text style={styles.totalCountText}>
            {filteredAllProducts.length} {t('ceramicCategories').toLowerCase()}
          </Text>
          <View style={styles.sortOptionsRow}>
            <ScalePressable
              style={[
                styles.sortChip,
                sortBy === 'sale-desc' && styles.sortChipActive,
              ]}
              onPress={() => setSortBy('sale-desc')}
            >
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === 'sale-desc' && styles.sortChipTextActive,
                ]}
              >
                {t('sortBySaleDesc')}
              </Text>
            </ScalePressable>
            <ScalePressable
              style={[
                styles.sortChip,
                sortBy === 'price-asc' && styles.sortChipActive,
              ]}
              onPress={() => setSortBy('price-asc')}
            >
              <Ionicons
                name="arrow-up"
                size={12}
                color={sortBy === 'price-asc' ? '#FFFFFF' : '#9C7156'}
              />
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === 'price-asc' && styles.sortChipTextActive,
                ]}
              >
                {t('priceLowToHigh') || 'Giá tăng'}
              </Text>
            </ScalePressable>
            <ScalePressable
              style={[
                styles.sortChip,
                sortBy === 'price-desc' && styles.sortChipActive,
              ]}
              onPress={() => setSortBy('price-desc')}
            >
              <Ionicons
                name="arrow-down"
                size={12}
                color={sortBy === 'price-desc' ? '#FFFFFF' : '#9C7156'}
              />
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === 'price-desc' && styles.sortChipTextActive,
                ]}
              >
                {t('priceHighToLow') || 'Giá giảm'}
              </Text>
            </ScalePressable>
          </View>
        </View>

        {/* ================= DANH SÁCH SẢN PHẨM ================= */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#9C7156" />
            <Text style={styles.loadingText}>{t('loadingCeramics')}</Text>
          </View>
        ) : filteredAllProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="pricetags-outline" size={38} color="#9C7156" />
            </View>
            <Text style={styles.emptyTitle}>{t('noFlashSale')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('flashSaleSubtitle')}
            </Text>
            <ScalePressable
              style={styles.exploreButton}
              onPress={() => router.push('/(tabs)/products')}
            >
              <Text style={styles.exploreButtonText}>{t('exploreOtherProducts')}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </ScalePressable>
          </View>
        ) : isUpcoming ? (
          /* TRƯỜNG HỢP SẮP DIỄN RA: Đếm ngược tới giờ mở bán */
          <View style={styles.sectionContainer}>
            <View style={styles.upcomingNoticeBox}>
              <Text style={styles.upcomingNoticeTitle}>
                🎁 {status?.title || t('flashSaleTitle')}
              </Text>
              <Text style={styles.upcomingNoticeDesc}>
                {status?.startTime
                  ? `Chương trình sẽ chính thức mở bán vào lúc ${status.startTime.toLocaleString(
                      'vi-VN'
                    )}. Hãy lưu vào danh sách yêu thích trước!`
                  : 'Chương trình sắp chính thức mở bán. Hãy sẵn sàng săn deal!'}
              </Text>
            </View>
            <View style={styles.productGrid}>
              {filteredAllProducts.map((product) => (
                <FlashSaleCard
                  key={product.id}
                  product={product}
                  cardWidth={CARD_WIDTH}
                />
              ))}
            </View>
          </View>
        ) : selectedPriceGroup !== null || selectedCategory !== 'all' ? (
          /* KHI NGƯỜI DÙNG ĐÃ CHỌN LỌC: Hiển thị lưới sản phẩm đã lọc */
          <View style={styles.sectionContainer}>
            <View style={styles.productGrid}>
              {filteredAllProducts.map((product) => (
                <FlashSaleCard
                  key={product.id}
                  product={product}
                  cardWidth={CARD_WIDTH}
                />
              ))}
            </View>
          </View>
        ) : (
          /* CHẾ ĐỘ HIỂN THỊ ĐẦY ĐỦ 4 PHÂN NHÓM CHUẨN BẢN WEB */
          <View style={styles.sectionsWrapper}>
            {/* Nhóm 1: Mua 1 Tặng 1 (BOGO) */}
            {flashSaleData && flashSaleData.bogoProducts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    🎁 {t('bogoSectionTitle')}
                  </Text>
                  <View style={styles.sectionBadgePill}>
                    <Text style={styles.sectionBadgeText}>
                      ✨ {t('bogoSectionBadge')}
                    </Text>
                  </View>
                </View>
                <View style={styles.productGrid}>
                  {sortProducts(flashSaleData.bogoProducts).map((product) => (
                    <FlashSaleCard
                      key={product.id}
                      product={product}
                      cardWidth={CARD_WIDTH}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Nhóm 2: Flash Sale Campaign (Giá Sốc Độc Quyền) */}
            {flashSaleData && flashSaleData.shockCampaignProducts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    ⚡ {t('shockPriceSectionTitle')}
                  </Text>
                  <View style={styles.sectionBadgePill}>
                    <Text style={styles.sectionBadgeText}>
                      🔥 {t('shockPriceBadge')}
                    </Text>
                  </View>
                </View>
                <View style={styles.productGrid}>
                  {sortProducts(flashSaleData.shockCampaignProducts).map((product) => (
                    <FlashSaleCard
                      key={product.id}
                      product={product}
                      cardWidth={CARD_WIDTH}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Nhóm 3: Các nhóm đồng giá */}
            {flashSaleData &&
              priceGroups.map((price) => {
                const groupProducts = flashSaleData.priceGroupProducts[price] || [];
                if (groupProducts.length === 0) return null;
                return (
                  <View key={price} style={styles.sectionContainer}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>
                        ⚡ {t('fixedPriceSectionTitle')} {price / 1000}k
                      </Text>
                    </View>
                    <View style={styles.productGrid}>
                      {sortProducts(groupProducts).map((product) => (
                        <FlashSaleCard
                          key={product.id}
                          product={product}
                          cardWidth={CARD_WIDTH}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}

            {/* Nhóm 4: Các sản phẩm giảm giá khác */}
            {flashSaleData && flashSaleData.otherSaleProducts.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>
                    🏺 {t('otherSaleSectionTitle')}
                  </Text>
                </View>
                <View style={styles.productGrid}>
                  {sortProducts(flashSaleData.otherSaleProducts).map((product) => (
                    <FlashSaleCard
                      key={product.id}
                      product={product}
                      cardWidth={CARD_WIDTH}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    heroBanner: {
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 24,
      backgroundColor: isDark ? '#141210' : '#FFF9F2',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8CCB2',
      overflow: 'hidden',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    heroContent: {
      padding: 20,
      alignItems: 'center',
    },
    statusBadgeRow: {
      marginBottom: 10,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
    },
    statusBadgeRunning: {
      backgroundColor: '#9C7156',
    },
    statusBadgeUpcoming: {
      backgroundColor: '#2B2928',
    },
    statusBadgeEnded: {
      backgroundColor: '#6E665D',
    },
    statusBadgeText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    heroTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
      textAlign: 'center',
      marginBottom: 6,
    },
    heroSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#B0B0B0' : '#6E665D',
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 8,
      marginBottom: 16,
    },
    countdownContainer: {
      alignItems: 'center',
      width: '100%',
    },
    countdownPrompt: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '600',
      color: '#9C7156',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    timerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timerBox: {
      width: 48,
      height: 52,
      borderRadius: 14,
      backgroundColor: isDark ? '#23201D' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    timerNum: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '800',
      color: '#9C7156',
      lineHeight: 22,
    },
    timerUnit: {
      fontFamily: 'ElleGaborStd',
      fontSize: 9.5,
      fontWeight: '600',
      color: isDark ? '#A0988F' : '#6E665D',
      marginTop: 1,
    },
    timerColon: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '800',
      color: '#9C7156',
    },
    categoryFilterSection: {
      marginBottom: 12,
    },
    categoryScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 22,
      borderWidth: 1,
    },
    categoryChipActive: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    categoryChipInactive: {
      backgroundColor: isDark ? '#1C1A18' : '#FFFFFF',
      borderColor: isDark ? '#2A2622' : '#E8E1D8',
    },
    categoryChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      marginRight: 6,
    },
    categoryChipTextActive: {
      color: '#FFFFFF',
    },
    categoryChipTextInactive: {
      color: isDark ? '#E0DDD8' : '#2B2928',
    },
    countBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 10,
    },
    countBadgeActive: {
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    countBadgeInactive: {
      backgroundColor: isDark ? '#2B2724' : '#F0ECE6',
    },
    countBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10.5,
      fontWeight: '700',
    },
    countBadgeTextActive: {
      color: '#FFFFFF',
    },
    countBadgeTextInactive: {
      color: '#9C7156',
    },
    priceGroupSection: {
      marginBottom: 14,
    },
    priceGroupScrollContent: {
      paddingHorizontal: 16,
      gap: 8,
    },
    priceChip: {
      paddingHorizontal: 14,
      paddingVertical: 6.5,
      borderRadius: 18,
      borderWidth: 1,
    },
    priceChipActive: {
      backgroundColor: isDark ? '#2C221A' : '#FBF3EC',
      borderColor: '#9C7156',
    },
    priceChipInactive: {
      backgroundColor: isDark ? '#161413' : '#FFFFFF',
      borderColor: isDark ? '#26221E' : '#E8E1D8',
    },
    priceChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '600',
    },
    priceChipTextActive: {
      color: '#9C7156',
      fontWeight: '700',
    },
    priceChipTextInactive: {
      color: isDark ? '#B0B0B0' : '#6E665D',
    },
    sortBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 14,
    },
    totalCountText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#B0B0B0' : '#6E665D',
      fontWeight: '600',
    },
    sortOptionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: isDark ? '#1C1A18' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#2A2622' : '#E8E1D8',
    },
    sortChipActive: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    sortChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#B0B0B0' : '#6E665D',
    },
    sortChipTextActive: {
      color: '#FFFFFF',
    },
    sectionsWrapper: {
      gap: 8,
    },
    sectionContainer: {
      paddingHorizontal: 16,
      marginBottom: 18,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#222222' : '#E8CCB2',
      flexWrap: 'wrap',
      gap: 8,
    },
    sectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    sectionBadgePill: {
      backgroundColor: isDark ? '#231B16' : '#FFF9F2',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E8CCB2',
    },
    sectionBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: '#9C7156',
      fontWeight: '700',
    },
    productGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    upcomingNoticeBox: {
      backgroundColor: isDark ? '#1A1816' : '#FFF9F2',
      borderWidth: 1.5,
      borderColor: '#E8CCB2',
      borderStyle: 'dashed',
      borderRadius: 18,
      padding: 18,
      alignItems: 'center',
      marginBottom: 18,
    },
    upcomingNoticeTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: '#9C7156',
      marginBottom: 6,
      textAlign: 'center',
    },
    upcomingNoticeDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#B0B0B0' : '#6E665D',
      textAlign: 'center',
      lineHeight: 18,
    },
    loadingContainer: {
      paddingVertical: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: '#9C7156',
      marginTop: 12,
    },
    emptyContainer: {
      paddingVertical: 50,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#E8CCB2',
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
      marginBottom: 6,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#A0988F' : '#6E665D',
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
    },
    exploreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 48,
      paddingHorizontal: 24,
      borderRadius: 24,
      backgroundColor: '#9C7156',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    exploreButtonText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
