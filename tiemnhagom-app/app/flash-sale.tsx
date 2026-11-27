// app/flash-sale.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { ScalePressable } from '../src/components/ScalePressable';
import { FlashSaleCard } from '../src/components/FlashSaleCard';
import { useSettings } from '../src/context/SettingsContext';
import {
  fetchFlashSaleData,
  FlashSaleData,
  FlashSaleStage,
  ProductWithFlashSale,
} from '../src/services/flashSaleService';

const { width, height } = Dimensions.get('window');
const STAGE_CARD_WIDTH = Math.floor((width - 28 - 20 - 10) / 2);

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export default function FlashSaleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { t } = useSettings();

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const stageYMap = useRef<Record<string, number>>({});
  const showcaseYRef = useRef<number>(screenHeight);

  const [scrollY, setScrollY] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flashSaleData, setFlashSaleData] = useState<FlashSaleData | null>(null);

  const [selectedPriceGroup, setSelectedPriceGroup] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'sale-desc' | 'price-asc' | 'price-desc'>('sale-desc');
  const [stageSubCat, setStageSubCat] = useState<Record<string, string>>({});
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      const data = await fetchFlashSaleData('all', forceRefresh);
      setFlashSaleData(data);
    } catch (error) {
      console.error('Lỗi nạp dữ liệu Flash Sale 12.12:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // Live Countdown Timer
  useEffect(() => {
    if (!flashSaleData) return;
    const { status } = flashSaleData;
    const targetDate = status.isUpcoming ? status.startTime : status.endTime;
    if (!targetDate) return;

    const updateCountdown = () => {
      const distance = Math.max(0, targetDate.getTime() - Date.now());
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [flashSaleData]);

  const sortProducts = useCallback(
    (list: ProductWithFlashSale[]) => {
      const copy = [...list];
      copy.sort((a, b) => {
        if (sortBy === 'price-asc') return a.effectivePrice - b.effectivePrice;
        if (sortBy === 'price-desc') return b.effectivePrice - a.effectivePrice;
        return b.effectiveSalePercent - a.effectiveSalePercent;
      });
      return copy;
    },
    [sortBy]
  );

  const priceGroups = useMemo(
    () =>
      (flashSaleData?.settings?.priceGroups || [])
        .map(Number)
        .filter((n) => n > 0)
        .sort((a, b) => a - b),
    [flashSaleData]
  );

  const visibleStages: FlashSaleStage[] = useMemo(() => {
    if (!flashSaleData) return [];
    return flashSaleData.stages
      .map((stage) => {
        let prods = stage.products;
        if (selectedPriceGroup !== null) {
          prods = prods.filter(
            (p) => Number((p as any).flashSaleGroup) === selectedPriceGroup || p.effectivePrice === selectedPriceGroup
          );
        }
        return { ...stage, products: sortProducts(prods) };
      })
      .filter((s) => s.products.length > 0);
  }, [flashSaleData, selectedPriceGroup, sortProducts]);

  const status = flashSaleData?.status;
  const isRunning = Boolean(status?.isRunning);
  const isUpcoming = Boolean(status?.isUpcoming);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dStr = pad(timeLeft.days);
  const hStr = pad(timeLeft.hours);
  const mStr = pad(timeLeft.minutes);
  const sStr = pad(timeLeft.seconds);

  const scrollToShowcase = () => {
    scrollRef.current?.scrollTo({ y: showcaseYRef.current - (insets.top + 56), animated: true });
  };

  const scrollToStage = (stageId: string) => {
    const y = stageYMap.current[stageId];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - (insets.top + 64)), animated: true });
    }
  };

  const isStickyBarVisible = scrollY >= Math.max(200, showcaseYRef.current - (insets.top + 58));

  const renderFilterStripContent = () => (
    <>
      {visibleStages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickJumpScroll}
        >
          {visibleStages.map((stage, i) => (
            <ScalePressable
              key={stage.id}
              style={[styles.jumpPill, i === 0 && styles.jumpPillActive]}
              onPress={() => scrollToStage(stage.id)}
            >
              <Text style={[styles.jumpPillText, i === 0 && styles.jumpPillTextActive]}>
                {stage.shortNav} ({stage.products.length})
              </Text>
            </ScalePressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.sortRow}>
        <View style={styles.miniTimerPill}>
          <Ionicons name="time-outline" size={13} color="#E8CCB2" />
          <Text style={styles.miniTimerText}>
            {isUpcoming ? 'Mở bán:' : 'Còn lại:'} {timeLeft.days > 0 ? `${dStr}n ` : ''}
            {hStr}:{mStr}:{sStr}
          </Text>
        </View>

        <View style={styles.sortChipsWrap}>
          {(
            [
              { id: 'sale-desc', label: 'Giảm sâu' },
              { id: 'price-asc', label: 'Giá ↑' },
              { id: 'price-desc', label: 'Giá ↓' },
            ] as const
          ).map((opt) => (
            <ScalePressable
              key={opt.id}
              style={[styles.sortChip, sortBy === opt.id && styles.sortChipActive]}
              onPress={() => setSortBy(opt.id)}
            >
              <Text style={[styles.sortChipText, sortBy === opt.id && styles.sortChipTextActive]}>
                {opt.label}
              </Text>
            </ScalePressable>
          ))}
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <Header
        title={t('flashSaleTitle')}
        showBack={true}
        showSearch={false}
        showCart={true}
        transparent={true}
        scrollY={scrollY}
      />

      {/* Thanh danh mục dính cố định ngay dưới Header khi người dùng lướt qua Hero */}
      {isStickyBarVisible && (
        <View
          style={[
            styles.filterStrip,
            styles.stickyFilterOverlay,
            { top: insets.top + 56 },
          ]}
        >
          {renderFilterStripContent()}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 36 }}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#E8CCB2"
            colors={['#9C7156']}
          />
        }
      >
        {/* 1. MÀN HÌNH ĐẾM NGƯỢC FULL-SCREEN 100% MÀN HÌNH IPHONE/ANDROID KÈM ẢNH NỀN GIỐNG BẢN WEB */}
        <View
          style={[
            styles.fullscreenHero,
            { height: screenHeight, paddingTop: insets.top + 64, paddingBottom: Math.max(insets.bottom, 24) + 24 },
          ]}
        >
          <Image
            source={{
              uri:
                flashSaleData?.settings?.bannerUrl ||
                'https://tiemnhagom.vn/Asset/images/848763692_122118089709333721_8694091963918561225_n.jpg',
            }}
            style={styles.heroBgImage}
            contentFit="cover"
            transition={250}
            cachePolicy="disk"
          />
          <LinearGradient
            colors={['rgba(20, 14, 11, 0.62)', 'rgba(38, 22, 16, 0.72)', 'rgba(26, 19, 16, 0.96)']}
            locations={[0, 0.5, 1]}
            style={styles.heroVignette}
          />

          <View style={styles.heroInner}>
            <View style={styles.kickerRow}>
              <View style={[styles.liveDot, isRunning && styles.liveDotActive]} />
              <Text style={styles.kickerText}>
                {isRunning ? 'ĐANG MỞ BÁN • DUY NHẤT NGÀY 12.12' : 'SỰ KIỆN NGÀY ĐÔI 12.12 • SẮP MỞ BÁN'}
              </Text>
            </View>

            <Text style={styles.dateEmblem}>12.12</Text>

            <Text style={styles.heroTitle}>{status?.title || 'Ngày Đôi 12.12 — Siêu Sale Gốm'}</Text>
            <Text style={styles.heroSubtitle}>
              {status?.subtitle ||
                'Đại tiệc ưu đãi duy nhất 24h ngày 12/12. Lưu mẫu gốm yêu thích để săn deal đúng giờ mở bán!'}
            </Text>

            {/* Đồng hồ đếm ngược 4 ô trắng lớn */}
            <Text style={styles.countdownCaption}>
              {isRunning ? 'CHƯƠNG TRÌNH KẾT THÚC SAU' : 'ĐẾM NGƯỢC TỚI GIỜ MỞ BÁN'}
            </Text>
            <View style={styles.countdownGrid}>
              {[
                { val: dStr, lbl: t('days') || 'Ngày' },
                { val: hStr, lbl: t('hours') || 'Giờ' },
                { val: mStr, lbl: t('minutes') || 'Phút' },
                { val: sStr, lbl: t('seconds') || 'Giây' },
              ].map((unit, idx) => (
                <React.Fragment key={unit.lbl}>
                  <View style={styles.cdTile}>
                    <Text style={styles.cdNum}>{unit.val}</Text>
                    <Text style={styles.cdLbl}>{unit.lbl}</Text>
                  </View>
                  {idx < 3 && <Text style={styles.cdSep}>:</Text>}
                </React.Fragment>
              ))}
            </View>

            {/* Dòng đặc quyền tối giản không khung viền */}
            <Text style={styles.perksLine}>
              Duy nhất 24h ngày 12/12  ·  Suất giới hạn  ·  Miễn phí gói quà
            </Text>

            {/* Nút CTA chính cuộn xuống kệ sản phẩm */}
            <ScalePressable style={styles.heroPrimaryBtn} onPress={scrollToShowcase}>
              <Text style={styles.heroPrimaryBtnText}>Xem kệ sản phẩm Sale 12.12</Text>
              <Ionicons name="arrow-down" size={16} color="#111111" />
            </ScalePressable>
          </View>
        </View>

        {/* 2. THANH CHUYỂN NHANH DANH MỤC & SẮP XẾP */}
        <View
          onLayout={(e) => {
            showcaseYRef.current = e.nativeEvent.layout.y;
          }}
          style={[styles.filterStrip, isStickyBarVisible && { opacity: 0 }]}
        >
          {renderFilterStripContent()}
        </View>

        {/* 3. BANNER KỆ ĐỒNG GIÁ 12.12 */}
        {priceGroups.length > 0 && (
          <LinearGradient
            colors={['#2A211C', '#56291D', '#7E3524']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tierBanner}
          >
            <Text style={styles.tierKicker}>SĂN GỐM ĐỒNG GIÁ • NGÀY ĐÔI 12.12</Text>
            <Text style={styles.tierTitle}>
              {selectedPriceGroup !== null
                ? `Kệ Đồng Giá ${selectedPriceGroup.toLocaleString('vi-VN')}đ`
                : 'Chọn nhanh Kệ Đồng Giá yêu thích'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tierTicketsRow}
            >
              {priceGroups.map((price) => {
                const isAct = selectedPriceGroup === price;
                const count =
                  flashSaleData?.allProducts.filter(
                    (p) => Number((p as any).flashSaleGroup) === price || p.effectivePrice === price
                  ).length || 0;
                return (
                  <ScalePressable
                    key={price}
                    style={[styles.tierTicket, isAct && styles.tierTicketActive]}
                    onPress={() => setSelectedPriceGroup(isAct ? null : price)}
                  >
                    <Text style={[styles.tierTicketPrice, isAct && styles.tierTicketPriceActive]}>
                      {Math.round(price / 1000)}K
                    </Text>
                    <Text style={[styles.tierTicketMeta, isAct && styles.tierTicketMetaActive]}>
                      {count > 0 ? `${count} mẫu` : 'Săn deal'}
                    </Text>
                  </ScalePressable>
                );
              })}

              {selectedPriceGroup !== null && (
                <ScalePressable
                  style={styles.tierResetBtn}
                  onPress={() => setSelectedPriceGroup(null)}
                >
                  <Text style={styles.tierResetBtnText}>Tất cả giá</Text>
                </ScalePressable>
              )}
            </ScrollView>
          </LinearGradient>
        )}

        {/* 4. CÁC KHỐI KỆ FLASH SALE PHÂN LOẠI SẢN PHẨM */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#E8CCB2" />
            <Text style={styles.loadingText}>{t('loadingCeramics')}</Text>
          </View>
        ) : visibleStages.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="pricetags-outline" size={38} color="#E8CCB2" />
            <Text style={styles.emptyTitle}>{t('noFlashSale')}</Text>
            <Text style={styles.emptySub}>
              Các sản phẩm ưu đãi Ngày Đôi 12.12 đang được Tiệm cập nhật lên kệ.
            </Text>
            <ScalePressable
              style={styles.heroPrimaryBtn}
              onPress={() => router.push('/(tabs)/products')}
            >
              <Text style={styles.heroPrimaryBtnText}>{t('exploreOtherProducts')}</Text>
            </ScalePressable>
          </View>
        ) : (
          <View style={styles.stagesList}>
            {visibleStages.map((stage) => {
              const activeSub = stageSubCat[stage.id] || 'all';
              const isExpanded = Boolean(expandedStages[stage.id]);
              const filteredProds =
                activeSub === 'all'
                  ? stage.products
                  : stage.products.filter((p) => (p.category || '').trim() === activeSub);

              const boxColors: [string, string] =
                stage.theme === 'kiln' ? ['#352923', '#241C18'] : ['#7E3524', '#5F2417'];

              return (
                <View
                  key={stage.id}
                  onLayout={(e) => {
                    stageYMap.current[stage.id] = e.nativeEvent.layout.y + showcaseYRef.current;
                  }}
                  style={styles.stageSection}
                >
                  {/* Tiêu đề viên thuốc nổi gối lên viền trên khối */}
                  <View style={styles.stageCrownWrap}>
                    <View
                      style={[
                        styles.stageCrownPill,
                        stage.theme === 'kiln' && styles.stageCrownPillKiln,
                      ]}
                    >
                      <Text style={styles.stageCrownText} numberOfLines={1}>
                        {stage.crownTitle}
                      </Text>
                    </View>
                  </View>

                  <LinearGradient colors={boxColors} style={styles.stageBox}>
                    {/* Thanh lọc danh mục con cuộn ngang */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.stageSubPillsRow}
                    >
                      <ScalePressable
                        style={[styles.subPill, activeSub === 'all' && styles.subPillActive]}
                        onPress={() => setStageSubCat((prev) => ({ ...prev, [stage.id]: 'all' }))}
                      >
                        <Text
                          style={[
                            styles.subPillText,
                            activeSub === 'all' && styles.subPillTextActive,
                          ]}
                        >
                          Tất cả ({stage.products.length})
                        </Text>
                      </ScalePressable>

                      {stage.subCategories.map((sub) => {
                        const isAct = activeSub === sub;
                        const cnt = stage.products.filter((p) => (p.category || '').trim() === sub).length;
                        return (
                          <ScalePressable
                            key={sub}
                            style={[styles.subPill, isAct && styles.subPillActive]}
                            onPress={() => setStageSubCat((prev) => ({ ...prev, [stage.id]: sub }))}
                          >
                            <Text style={[styles.subPillText, isAct && styles.subPillTextActive]}>
                              {sub} ({cnt})
                            </Text>
                          </ScalePressable>
                        );
                      })}
                    </ScrollView>

                    {/* Cụm đồng hồ đếm ngược bo tròn trong khối */}
                    <View style={styles.stageTimerPill}>
                      <Text style={styles.stageTimerLbl}>
                        {isUpcoming ? 'MỞ BÁN SAU' : 'KẾT THÚC SAU'}
                      </Text>
                      <View style={styles.stageTimerBoxes}>
                        {[dStr, hStr, mStr, sStr].map((v, i) => (
                          <React.Fragment key={i}>
                            <View style={styles.stageTBox}>
                              <Text style={styles.stageTBoxText}>{v}</Text>
                            </View>
                            {i < 3 && <Text style={styles.stageTSep}>:</Text>}
                          </React.Fragment>
                        ))}
                      </View>
                    </View>

                    {/* Khay sản phẩm: Cuộn ngang mượt mà hoặc Bung lưới 2 cột */}
                    {isExpanded ? (
                      <View style={styles.stageGridExpanded}>
                        {filteredProds.map((p) => (
                          <FlashSaleCard key={p.id} product={p} cardWidth={STAGE_CARD_WIDTH} />
                        ))}
                      </View>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        decelerationRate="fast"
                        snapToInterval={STAGE_CARD_WIDTH + 10}
                        contentContainerStyle={styles.stageHorizontalTrack}
                      >
                        {filteredProds.map((p) => (
                          <FlashSaleCard key={p.id} product={p} cardWidth={STAGE_CARD_WIDTH} />
                        ))}
                      </ScrollView>
                    )}

                    {/* Chân khối: Ghi chú & Nút xem toàn bộ */}
                    <View style={styles.stageFooter}>
                      <Text style={styles.stageNote}>{stage.note}</Text>
                      {filteredProds.length > 2 && (
                        <ScalePressable
                          style={styles.expandBtn}
                          onPress={() =>
                            setExpandedStages((prev) => ({ ...prev, [stage.id]: !isExpanded }))
                          }
                        >
                          <Text style={styles.expandBtnText}>
                            {isExpanded ? 'Thu gọn cuộn ngang' : `Xem toàn bộ ${filteredProds.length} mẫu`}
                          </Text>
                        </ScalePressable>
                      )}
                    </View>
                  </LinearGradient>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1310',
  },
  fullscreenHero: {
    position: 'relative',
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1A1310',
  },
  heroBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroInner: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    alignItems: 'center',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E8CCB2',
  },
  liveDotActive: {
    backgroundColor: '#EF4444',
  },
  kickerText: {
    color: '#E8CCB2',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  dateEmblem: {
    fontSize: 58,
    fontWeight: '800',
    color: '#FAF0E4',
    letterSpacing: 3,
    lineHeight: 64,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13.5,
    color: 'rgba(250, 248, 245, 0.82)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  countdownCaption: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E8CCB2',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  countdownGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  cdTile: {
    width: 66,
    paddingVertical: 11,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8CCB2',
    alignItems: 'center',
  },
  cdNum: {
    fontSize: 26,
    fontWeight: '800',
    color: '#231B15',
    lineHeight: 30,
  },
  cdLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7D563D',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  cdSep: {
    fontSize: 20,
    fontWeight: '800',
    color: '#E8CCB2',
    marginTop: -10,
  },
  perksLine: {
    fontSize: 12,
    color: 'rgba(232, 204, 178, 0.9)',
    textAlign: 'center',
    marginBottom: 22,
  },
  heroPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    height: 48,
    paddingHorizontal: 26,
    borderRadius: 24,
  },
  heroPrimaryBtnText: {
    color: '#111111',
    fontSize: 14.5,
    fontWeight: '700',
  },

  /* Filter Strip */
  filterStrip: {
    paddingVertical: 12,
    backgroundColor: '#211814',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(232, 204, 178, 0.16)',
    gap: 10,
  },
  stickyFilterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 45,
    backgroundColor: 'rgba(28, 20, 16, 0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  quickJumpScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  jumpPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(232, 204, 178, 0.32)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  jumpPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  jumpPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FAF8F5',
  },
  jumpPillTextActive: {
    color: '#1F1B18',
    fontWeight: '700',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 8,
  },
  miniTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(156, 81, 59, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(232, 204, 178, 0.36)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  miniTimerText: {
    color: '#F6DFC6',
    fontSize: 11.5,
    fontWeight: '700',
  },
  sortChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(232, 204, 178, 0.25)',
  },
  sortChipActive: {
    backgroundColor: '#9C7156',
    borderColor: '#9C7156',
  },
  sortChipText: {
    color: '#E8CCB2',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Banner Đồng Giá */
  tierBanner: {
    marginHorizontal: 14,
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8CCB2',
    padding: 16,
  },
  tierKicker: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#E8CCB2',
    marginBottom: 4,
  },
  tierTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  tierTicketsRow: {
    gap: 8,
    alignItems: 'center',
  },
  tierTicket: {
    minWidth: 74,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1.2,
    borderColor: 'rgba(232, 204, 178, 0.45)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  tierTicketActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  tierTicketPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tierTicketPriceActive: {
    color: '#7E3524',
  },
  tierTicketMeta: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  tierTicketMetaActive: {
    color: '#7E3524',
  },
  tierResetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  tierResetBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Categorized Stages */
  stagesList: {
    paddingHorizontal: 14,
    paddingTop: 28,
    gap: 34,
  },
  stageSection: {
    position: 'relative',
  },
  stageCrownWrap: {
    alignItems: 'center',
    zIndex: 5,
    marginBottom: -15,
  },
  stageCrownPill: {
    backgroundColor: '#5B1F14',
    borderWidth: 1.5,
    borderColor: '#E8CCB2',
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 999,
    maxWidth: '88%',
  },
  stageCrownPillKiln: {
    backgroundColor: '#231B16',
  },
  stageCrownText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  stageBox: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8CCB2',
    paddingTop: 26,
    paddingBottom: 14,
  },
  stageSubPillsRow: {
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 10,
  },
  subPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  subPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  subPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  subPillTextActive: {
    color: '#7E3524',
  },
  stageTimerPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(232, 204, 178, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  stageTimerLbl: {
    color: '#FAF8F5',
    fontSize: 11,
    fontWeight: '800',
  },
  stageTimerBoxes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stageTBox: {
    minWidth: 26,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stageTBoxText: {
    color: '#1F1B18',
    fontSize: 12,
    fontWeight: '800',
  },
  stageTSep: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  stageHorizontalTrack: {
    paddingHorizontal: 10,
    gap: 10,
  },
  stageGridExpanded: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    gap: 10,
  },
  stageFooter: {
    marginTop: 12,
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    gap: 8,
  },
  stageNote: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
  },
  expandBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  expandBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  loadingBox: {
    paddingVertical: 64,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#E8CCB2',
    fontSize: 13.5,
  },
  emptyBox: {
    margin: 16,
    padding: 32,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(232, 204, 178, 0.22)',
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    color: 'rgba(250, 248, 245, 0.78)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
});
