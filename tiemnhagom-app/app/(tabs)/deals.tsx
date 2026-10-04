// app/(tabs)/deals.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { Colors } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { getUserOrders } from '../../src/services/orderService';
import { getActiveCoupons, CouponItem } from '../../src/services/couponService';
import { formatCurrency } from '../../src/utils/format';
import { useSettings } from '../../src/context/SettingsContext';

// Cấu hình 4 hạng thành viên đồng bộ chuẩn xác từ Website Tiệm Nhà Gốm
export const MEMBERSHIP_TIERS = [
  {
    id: 'null',
    name: 'Gốm Mộc',
    min: 0,
    discount: 0,
    badge: '🪵',
    color: '#52525B',
    bgColor: '#F4F4F5',
    borderColor: '#E4E4E7',
    benefits: [
      'Hạng khởi đầu dành cho mọi khách hàng đăng ký tài khoản.',
      'Tích lũy chi tiêu trên từng đơn hàng để thăng hạng tự động.',
      'Nhận thông báo sớm các chương trình ưu đãi và bộ sưu tập mới.',
    ],
  },
  {
    id: 'new',
    name: 'Gốm Nung',
    min: 1000000,
    discount: 1,
    badge: '🔥',
    color: '#2563EB',
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    benefits: [
      'Giảm giá trực tiếp 1% trên toàn bộ đơn hàng.',
      'Tặng voucher 50.000đ khi lên hạng.',
      'Tặng voucher sinh nhật trị giá 50.000đ.',
      'Giảm thêm 0.5% - 1% các nhóm hàng KitchenWare & HomeDecor.',
    ],
  },
  {
    id: 'mem',
    name: 'Gốm Men',
    min: 5000000,
    discount: 3,
    badge: '✨',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    benefits: [
      'Giảm giá trực tiếp 3% trên toàn bộ đơn hàng.',
      'Miễn phí vận chuyển toàn quốc cho mọi đơn hàng.',
      'Tặng voucher 100.000đ khi lên hạng.',
      'Tặng phiếu sinh nhật trị giá 200.000đ.',
      'Tặng voucher 10% (tối đa 150k) cho người thân, bạn bè.',
    ],
  },
  {
    id: 'vip',
    name: 'Gốm Độc Bản',
    min: 10000000,
    discount: 5,
    badge: '👑',
    color: '#DC2626',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
    benefits: [
      'Giảm giá trực tiếp 5% vĩnh viễn trên mọi đơn hàng.',
      'Miễn phí giao hàng toàn quốc.',
      'Tặng voucher 300.000đ khi lên hạng.',
      'Ưu đãi sinh nhật: Tặng phiếu quà tặng 500.000đ.',
      'Ưu tiên đặt trước các tác phẩm gốm mộc độc bản số lượng giới hạn.',
    ],
  },
];

type ActiveTab = 'vouchers' | 'tiers';

export default function DealsScreen() {
  const router = useRouter();
  const { t } = useSettings();
  const { user, userProfile } = useAuth();

  // State Tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('vouchers');

  // Loyalty calculations
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [loadingLoyalty, setLoadingLoyalty] = useState<boolean>(true);

  // Vouchers state from Firestore
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState<boolean>(true);
  const [voucherFilter, setVoucherFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // 1. Tải tổng chi tiêu thực tế từ các đơn hàng hoàn thành
  const fetchLoyaltyData = useCallback(async () => {
    if (!user) {
      setTotalSpent(0);
      setLoadingLoyalty(false);
      return;
    }

    try {
      let spent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
      const orders = await getUserOrders(user.uid);
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
    } catch {
      setTotalSpent(Number(userProfile?.totalSpent || userProfile?.spentTotal || 0));
    } finally {
      setLoadingLoyalty(false);
    }
  }, [user, userProfile]);

  // 2. Tải danh sách Voucher từ Firestore collection "coupons"
  const fetchCouponsData = useCallback(async () => {
    setLoadingCoupons(true);
    try {
      const data = await getActiveCoupons(user?.uid);
      setCoupons(data);
    } catch (e) {
      console.warn('Lỗi tải vouchers từ Firestore: ' + String(e));
    } finally {
      setLoadingCoupons(false);
    }
  }, [user]);

  // Tải dữ liệu ban đầu
  useEffect(() => {
    fetchLoyaltyData();
    fetchCouponsData();
  }, [fetchLoyaltyData, fetchCouponsData]);

  // Kéo xuống làm mới (Pull-to-refresh)
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLoyaltyData(), fetchCouponsData()]);
    setRefreshing(false);
  };

  // Sao chép mã voucher
  const handleCopyCode = (code: string, id: string) => {
    setCopiedId(id);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Xác định hạng hội viên theo tổng chi tiêu
  let currentTier = MEMBERSHIP_TIERS[0];
  let nextTier: (typeof MEMBERSHIP_TIERS)[0] | null = MEMBERSHIP_TIERS[1];

  for (let i = MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
    if (totalSpent >= MEMBERSHIP_TIERS[i].min) {
      currentTier = MEMBERSHIP_TIERS[i];
      nextTier = MEMBERSHIP_TIERS[i + 1] || null;
      break;
    }
  }

  // % thanh tiến độ thăng hạng
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          5,
          Math.round(((totalSpent - currentTier.min) / (nextTier.min - currentTier.min)) * 100)
        )
      )
    : 100;

  const points = userProfile?.points !== undefined ? userProfile.points : Math.floor(totalSpent / 100000);
  const memberCode = `TNG-${(user?.uid || userProfile?.uid || 'GOM').substring(0, 8).toUpperCase()}`;

  // Lọc voucher
  const filteredCoupons = coupons.filter((c) => {
    if (voucherFilter === 'all') return true;
    if (voucherFilter === 'percent') return c.type === 'percent';
    if (voucherFilter === 'fixed') return c.type === 'fixed';
    if (voucherFilter === 'shipping') return c.type === 'free_ship';
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <Header title="Ưu đãi & Thành viên" showSearch={false} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#000000"
            colors={['#000000']}
          />
        }
      >
        {/* ================= THẺ THÀNH VIÊN SỐ (DIGITAL MEMBER CARD) ================= */}
        <View style={styles.memberCardWrapper}>
          <View style={styles.memberCard}>
            {/* Header thẻ */}
            <View style={styles.memberCardHeader}>
              <View>
                <Text style={styles.brandTag}>{t('brandName')}</Text>
                <Text style={styles.cardTypeTitle}>{t('digitalMemberCard')}</Text>
              </View>
              <View style={styles.tierPill}>
                <Text style={styles.tierPillEmoji}>{currentTier.badge}</Text>
                <Text style={styles.tierPillText}>{currentTier.name}</Text>
              </View>
            </View>

            {/* Thông tin chủ thẻ */}
            <View style={styles.memberInfoRow}>
              <View>
                <Text style={styles.memberLabel}>{t('cardHolder')}</Text>
                <Text style={styles.memberName} numberOfLines={1}>
                  {userProfile?.displayName || user?.displayName || (user ? 'Khách hàng thân thiết' : t('notLoggedIn'))}
                </Text>
              </View>
              <View style={styles.memberCodeBox}>
                <Text style={styles.memberLabel}>{t('memberCode')}</Text>
                <Text style={styles.memberCodeText}>{user ? memberCode : 'TNG-GUEST'}</Text>
              </View>
            </View>

            {/* Thống kê chi tiêu & Đặc quyền */}
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>{t('totalSpentLabel')}</Text>
                <Text style={styles.statValue}>{formatCurrency(totalSpent)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>{t('pointsLabel')}</Text>
                <Text style={styles.statValue}>{points} {t('pointsLabel').split(' ')[0]}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>{t('orderDiscountLabel')}</Text>
                <Text style={styles.statValueHighlight}>
                  {currentTier.discount > 0 ? `Giảm ${currentTier.discount}%` : 'Chuẩn'}
                </Text>
              </View>
            </View>

            {/* Tiến trình lên hạng tiếp theo */}
            <View style={styles.progressContainer}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressTextLeft}>
                  {nextTier ? `Tiến độ lên ${nextTier.name}` : 'Đã đạt hạng cao nhất'}
                </Text>
                <Text style={styles.progressTextRight}>{progressPercent}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              {nextTier && (
                <Text style={styles.progressHint}>
                  Chi thêm {formatCurrency(Math.max(0, nextTier.min - totalSpent))} để nâng lên hạng{' '}
                  <Text style={styles.boldText}>{nextTier.name}</Text> ({nextTier.discount}% off).
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ================= TAB SWITCHER ================= */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'vouchers' && styles.tabBtnActive]}
            activeOpacity={0.8}
            onPress={() => setActiveTab('vouchers')}
          >
            <Ionicons
              name={activeTab === 'vouchers' ? 'pricetag' : 'pricetag-outline'}
              size={16}
              color={activeTab === 'vouchers' ? '#000000' : '#888888'}
            />
            <Text style={[styles.tabBtnText, activeTab === 'vouchers' && styles.tabBtnTextActive]}>
              Mã Voucher ({coupons.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'tiers' && styles.tabBtnActive]}
            activeOpacity={0.8}
            onPress={() => setActiveTab('tiers')}
          >
            <Ionicons
              name={activeTab === 'tiers' ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={16}
              color={activeTab === 'tiers' ? '#000000' : '#888888'}
            />
            <Text style={[styles.tabBtnText, activeTab === 'tiers' && styles.tabBtnTextActive]}>
              Quyền lợi hội viên
            </Text>
          </TouchableOpacity>
        </View>

        {/* ================= TAB 1: DANH SÁCH VOUCHER (FIRESTORE) ================= */}
        {activeTab === 'vouchers' && (
          <View style={styles.vouchersSection}>
            {/* Filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.voucherFilterScroll}
            >
              {[
                { id: 'all', label: 'Tất cả mã' },
                { id: 'percent', label: 'Giảm theo %' },
                { id: 'fixed', label: 'Giảm tiền mặt' },
                { id: 'shipping', label: 'Freeship' },
              ].map((f) => {
                const isSelected = voucherFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                    onPress={() => setVoucherFilter(f.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipLabel, isSelected && styles.filterChipLabelSelected]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* List vouchers */}
            {loadingCoupons ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#111111" />
                <Text style={styles.loadingText}>{t('loadingVouchers')}</Text>
              </View>
            ) : filteredCoupons.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="ticket-outline" size={40} color="#AAAAAA" />
                <Text style={styles.emptyTitle}>{t('noVouchersFound')}</Text>
                <Text style={styles.emptyDesc}>{t('noVouchersDesc')}</Text>
              </View>
            ) : (
              filteredCoupons.map((voucher) => {
                const isCopied = copiedId === voucher.id;
                const valueText =
                  voucher.type === 'percent'
                    ? `Giảm ${voucher.value}%`
                    : voucher.type === 'free_ship'
                    ? 'Miễn phí giao hàng'
                    : `Giảm ${formatCurrency(voucher.value)}`;

                return (
                  <View key={voucher.id} style={[styles.ticketCard, voucher.isUsed && styles.ticketCardUsed]}>
                    {/* Phần trái cuống vé */}
                    <TouchableOpacity
                      style={styles.ticketLeft}
                      activeOpacity={0.7}
                      onPress={() => handleCopyCode(voucher.code, voucher.id)}
                    >
                      <View style={styles.ticketIconWrap}>
                        <Ionicons
                          name={
                            voucher.type === 'free_ship'
                              ? 'bicycle'
                              : voucher.type === 'percent'
                              ? 'pie-chart'
                              : 'cash'
                          }
                          size={18}
                          color="#111111"
                        />
                      </View>
                      <Text style={styles.ticketCodeText} numberOfLines={1}>
                        {voucher.code}
                      </Text>
                      <Text style={styles.ticketStubHint}>Chạm chép</Text>
                    </TouchableOpacity>

                    {/* Vết cắt đứt giữa hai phần cuống vé */}
                    <View style={styles.cutoutWrap}>
                      <View style={styles.cutoutTop} />
                      <View style={styles.dashedDivider} />
                      <View style={styles.cutoutBottom} />
                    </View>

                    {/* Phần thân vé bên phải */}
                    <View style={styles.ticketRight}>
                      <View style={styles.ticketHeader}>
                        <Text style={styles.ticketName} numberOfLines={1}>
                          {voucher.name}
                        </Text>
                        {voucher.isUsed ? (
                          <View style={styles.usedBadge}>
                            <Text style={styles.usedBadgeText}>{t('usedBadge')}</Text>
                          </View>
                        ) : (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>{t('activeBadge')}</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.ticketDiscount}>{valueText}</Text>

                      {voucher.conditions ? (
                        <Text style={styles.ticketDesc} numberOfLines={2}>
                          {voucher.conditions}
                        </Text>
                      ) : voucher.minOrder ? (
                        <Text style={styles.ticketDesc} numberOfLines={1}>
                          Áp dụng cho đơn hàng từ {formatCurrency(voucher.minOrder)}
                        </Text>
                      ) : null}

                      <View style={styles.ticketFooter}>
                        <View style={styles.ticketExpiryRow}>
                          <Ionicons name="time-outline" size={12} color="#71717A" />
                          <Text style={styles.ticketExpiry} numberOfLines={1} ellipsizeMode="tail">
                            {voucher.expiryDate
                              ? `HSD: ${new Date(voucher.expiryDate).toLocaleDateString('vi-VN')}`
                              : 'Hạn dùng: Vô thời hạn'}
                          </Text>
                        </View>

                        <View style={styles.ticketActionButtons}>
                          <TouchableOpacity
                            style={[styles.ticketCopyBtn, isCopied && styles.ticketCopyBtnSuccess]}
                            activeOpacity={0.8}
                            onPress={() => handleCopyCode(voucher.code, voucher.id)}
                          >
                            <Ionicons
                              name={isCopied ? 'checkmark' : 'copy-outline'}
                              size={12}
                              color={isCopied ? '#FFFFFF' : '#111111'}
                            />
                            <Text
                              style={[styles.ticketCopyText, isCopied && styles.ticketCopyTextSuccess]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {isCopied ? 'Đã lưu' : 'Sao chép'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.ticketUseBtn}
                            activeOpacity={0.8}
                            onPress={() => router.push('/(tabs)/products')}
                          >
                            <Text style={styles.ticketUseText} numberOfLines={1} ellipsizeMode="tail">
                              Dùng ngay
                            </Text>
                            <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ================= TAB 2: QUYỀN LỢI TỪNG HẠNG HỘI VIÊN ================= */}
        {activeTab === 'tiers' && (
          <View style={styles.tiersSection}>
            <View style={styles.tiersIntro}>
              <Text style={styles.tiersIntroTitle}>{t('memberTierPolicy')}</Text>
              <Text style={styles.tiersIntroDesc}>
                Hệ thống tự động cộng dồn doanh số mua sắm từ Website và Ứng dụng để nâng hạng và mở khóa các đặc quyền
                độc quyền.
              </Text>
            </View>

            {MEMBERSHIP_TIERS.map((tier) => {
              const isCurrent = currentTier.id === tier.id;
              return (
                <View
                  key={tier.id}
                  style={[
                    styles.tierCard,
                    { borderColor: isCurrent ? '#000000' : tier.borderColor },
                    isCurrent && styles.tierCardCurrent,
                  ]}
                >
                  <View style={styles.tierCardHeader}>
                    <View style={styles.tierTitleWrap}>
                      <Text style={styles.tierEmoji}>{tier.badge}</Text>
                      <View>
                        <View style={styles.tierNameRow}>
                          <Text style={[styles.tierName, { color: tier.color }]}>{tier.name}</Text>
                          {isCurrent && (
                            <View style={styles.currentTag}>
                              <Text style={styles.currentTagText}>{t('currentTierTag')}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.tierMinSpend}>
                          {tier.min === 0 ? 'Dành cho mọi thành viên' : `Tổng chi tiêu từ ${formatCurrency(tier.min)}`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.tierDiscountBadge}>
                      <Text style={styles.tierDiscountVal}>
                        {tier.discount > 0 ? `-${tier.discount}%` : 'Chuẩn'}
                      </Text>
                      <Text style={styles.tierDiscountSub}>{t('discountSub')}</Text>
                    </View>
                  </View>

                  <View style={styles.tierDivider} />

                  <View style={styles.tierBenefitsList}>
                    {tier.benefits.map((b, i) => (
                      <View key={i} style={styles.benefitRow}>
                        <Ionicons name="checkmark-circle" size={16} color={tier.color} style={styles.benefitIcon} />
                        <Text style={styles.benefitText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  scrollContent: {
    paddingBottom: 125,
  },
  // THẺ THÀNH VIÊN
  memberCardWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  memberCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  memberCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTag: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#A1A1AA',
  },
  cardTypeTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tierPillEmoji: {
    fontSize: 13,
  },
  tierPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  memberInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  memberLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    color: '#71717A',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 2,
  },
  memberName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: 190,
  },
  memberCodeBox: {
    alignItems: 'flex-end',
  },
  memberCodeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: '#E4E4E7',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#27272A',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#A1A1AA',
    marginBottom: 2,
  },
  statValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statValueHighlight: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#3F3F46',
  },
  progressContainer: {
    marginTop: 2,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressTextLeft: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#D4D4D8',
    fontWeight: '600',
  },
  progressTextRight: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#3F3F46',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  progressHint: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10.5,
    color: '#A1A1AA',
    marginTop: 6,
    lineHeight: 15,
  },
  boldText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loginHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: '#3F3F46',
    marginTop: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  loginHintText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // TAB SWITCHER
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#EAE6DF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 14,
    padding: 3,
    borderRadius: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
  },
  tabBtnTextActive: {
    fontWeight: '700',
    color: '#000000',
  },

  // VOUCHERS SECTION
  vouchersSection: {
    paddingHorizontal: 16,
  },
  voucherFilterScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  filterChipSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterChipLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#555555',
    fontWeight: '500',
  },
  filterChipLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#71717A',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#333333',
  },
  emptyDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#888888',
    textAlign: 'center',
  },

  // TICKET CARD
  ticketCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  ticketCardUsed: {
    opacity: 0.6,
    backgroundColor: '#FAFAFA',
  },
  ticketLeft: {
    width: 68,
    backgroundColor: '#F5F5F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  ticketIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    marginBottom: 4,
  },
  ticketCodeText: {
    fontFamily: 'monospace',
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1C1917',
    textAlign: 'center',
  },
  ticketStubHint: {
    fontFamily: 'ElleGaborStd',
    fontSize: 8.5,
    color: '#888888',
    marginTop: 2,
  },
  cutoutWrap: {
    width: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cutoutTop: {
    position: 'absolute',
    top: -7,
    left: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    zIndex: 3,
  },
  cutoutBottom: {
    position: 'absolute',
    bottom: -7,
    left: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    zIndex: 3,
  },
  dashedDivider: {
    flex: 1,
    width: 1,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    borderStyle: 'dashed',
  },
  ticketRight: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  ticketName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
    flex: 1,
    marginRight: 6,
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  usedBadge: {
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  usedBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9,
    fontWeight: '700',
    color: '#71717A',
  },
  ticketDiscount: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '700',
    color: '#C86432',
    marginBottom: 2,
  },
  ticketDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#52525B',
    lineHeight: 16,
    marginBottom: 4,
  },
  ticketFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0ECE6',
    paddingTop: 7,
    marginTop: 5,
    gap: 6,
  },
  ticketExpiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  ticketExpiry: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10.5,
    color: '#71717A',
    flexShrink: 1,
  },
  ticketActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
  ticketCopyBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#000000',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  ticketCopyBtnSuccess: {
    backgroundColor: '#000000',
  },
  ticketCopyText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '600',
    color: '#000000',
    flexShrink: 1,
  },
  ticketCopyTextSuccess: {
    color: '#FFFFFF',
  },
  ticketUseBtn: {
    flex: 1.1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#000000',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  ticketUseText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    flexShrink: 1,
  },

  // TIERS SECTION
  tiersSection: {
    paddingHorizontal: 16,
    gap: 12,
  },
  tiersIntro: {
    marginBottom: 4,
  },
  tiersIntroTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 2,
  },
  tiersIntroDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#71717A',
    lineHeight: 17,
  },
  tierCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  tierCardCurrent: {
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  tierCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tierEmoji: {
    fontSize: 26,
  },
  tierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
  },
  currentTag: {
    backgroundColor: '#000000',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  currentTagText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tierMinSpend: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#71717A',
    marginTop: 2,
  },
  tierDiscountBadge: {
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tierDiscountVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
  },
  tierDiscountSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9,
    color: '#71717A',
  },
  tierDivider: {
    height: 1,
    backgroundColor: '#F0ECE6',
    marginVertical: 12,
  },
  tierBenefitsList: {
    gap: 8,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  benefitIcon: {
    marginTop: 1,
  },
  benefitText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#3F3F46',
    lineHeight: 18,
    flex: 1,
  },
});
