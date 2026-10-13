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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { GlazeFluidCard } from '../../src/components/GlazeFluidCard';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import { ScalePressable } from '../../src/components/ScalePressable';
import { useAuth } from '../../src/context/AuthContext';
import { getUserOrders } from '../../src/services/orderService';
import { getActiveCoupons, CouponItem } from '../../src/services/couponService';
import { formatCurrency } from '../../src/utils/format';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';

// Cấu hình 4 hạng thành viên đồng bộ chuẩn xác với trang Profile & Trang Đặc quyền
export const MEMBERSHIP_TIERS = [
  {
    id: 'null',
    name: 'Gốm Mộc',
    min: 0,
    discount: 0,
    badge: '🪵',
    gradientColors: ['#543824', '#3E2718', '#28170D'] as [string, string, ...string[]],
    watercolorBlobs: ['#8A5A2B', '#A16207', '#6B4226', '#B45309'],
    logoTint: '#FFFFFF',
    accentColor: '#D97706',
    flameColor: '#FFFFFF',
  },
  {
    id: 'new',
    name: 'Gốm Nung',
    min: 1000000,
    discount: 1,
    badge: '🔥',
    gradientColors: ['#A31D1D', '#821414', '#520B0B'] as [string, string, ...string[]],
    watercolorBlobs: ['#DC2626', '#E11D48', '#D97706', '#991B1B'],
    logoTint: '#FFFFFF',
    accentColor: '#EF4444',
    flameColor: '#FFFFFF',
  },
  {
    id: 'mem',
    name: 'Gốm Men',
    min: 5000000,
    discount: 3,
    badge: '✨',
    gradientColors: ['#B45309', '#92400E', '#5C2D07'] as [string, string, ...string[]],
    watercolorBlobs: ['#F59E0B', '#D97706', '#B45309', '#CA8A04'],
    logoTint: '#FFFFFF',
    accentColor: '#FACC15',
    flameColor: '#FFFFFF',
  },
  {
    id: 'vip',
    name: 'Gốm Độc Bản',
    min: 10000000,
    discount: 5,
    badge: '👑',
    gradientColors: ['#27272A', '#18181B', '#09090B'] as [string, string, ...string[]],
    watercolorBlobs: ['#52525B', '#3F3F46', '#71717A', '#3F3F46'],
    logoTint: '#FFFFFF',
    accentColor: '#EF4444',
    flameColor: '#FFFFFF',
  },
];

export default function DealsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { user, userProfile } = useAuth();

  // Loyalty calculations
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);
  const [, setLoadingLoyalty] = useState<boolean>(true);

  // Vouchers state from Firestore
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [, setLoadingCoupons] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Modal QR mã thành viên
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);

  // 1. Tải tổng chi tiêu thực tế từ các đơn hàng hoàn thành
  const fetchLoyaltyData = useCallback(async () => {
    if (!user) {
      setTotalSpent(0);
      setRedeemedPoints(0);
      setLoadingLoyalty(false);
      return;
    }

    try {
      let spent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
      let redeemed = 0;
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
        if ((o as any).pointsUsed && Number((o as any).pointsUsed) > 0) {
          redeemed += Number((o as any).pointsUsed);
        }
      });
      setRedeemedPoints(redeemed);
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

  useEffect(() => {
    fetchLoyaltyData();
    fetchCouponsData();
  }, [fetchLoyaltyData, fetchCouponsData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLoyaltyData(), fetchCouponsData()]);
    setRefreshing(false);
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

  // Cứ 10.000đ = 1 điểm
  const earnedPoints = Math.floor(totalSpent / 10000);
  const rawProfilePoints =
    userProfile?.points !== undefined && userProfile?.points !== null
      ? Number(userProfile.points)
      : 0;
  const cleanProfilePoints = rawProfilePoints === 50 && totalSpent < 500000 ? 0 : rawProfilePoints;
  const points = Math.max(0, Math.max(earnedPoints, cleanProfilePoints) - redeemedPoints);
  const memberCode = `TNG-${(user?.uid || userProfile?.uid || 'GOM').substring(0, 8).toUpperCase()}`;

  const [scrollY, setScrollY] = useState(0);

  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />
      <Header
        title="Ưu đãi"
        showBack={false}
        showSearch={false}
        showCart={true}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 54 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={currentTier.gradientColors[0]}
            colors={[currentTier.gradientColors[0]]}
          />
        }
      >
        {/* ================= KHỐI TỔNG QUAN ĐẦU TRANG (HIỆU ỨNG DÒNG CHẢY MEN GỐM / MÀU NƯỚC LOANG) ================= */}
        <View style={styles.topSummaryRow}>
          {/* Card 1: Hạng thành viên & Điểm tích lũy */}
          <ScalePressable
            style={styles.tierPointsTouch}
            activeScale={0.98}
            onPress={() => router.push('/membership-privileges')}
          >
            <GlazeFluidCard
              gradientColors={currentTier.gradientColors}
              blobs={currentTier.watercolorBlobs}
              borderRadius={20}
              style={styles.tierPointsCard}
            >
              <View style={styles.tierPointsLeft}>
                {/* Logo Tiệm Nhà Gốm đồng bộ chuẩn xác như trang chủ */}
                <Image
                  source={require('../../assets/images/logongang.webp')}
                  style={styles.headerBrandLogo}
                  contentFit="contain"
                  tintColor="#FFFFFF"
                />

                <Text style={styles.tierNameLabel}>Hạng {currentTier.name}</Text>

                <View style={styles.pointsRow}>
                  <Text style={styles.pointsNumber}>{points}</Text>
                  {/* Icon ngọn lửa phẳng chuẩn vector */}
                  <Ionicons
                    name="flame"
                    size={18}
                    color="#FFFFFF"
                    style={styles.flameIcon}
                  />
                </View>
              </View>

              {/* Nút tròn xem QR / Mã vạch thẻ */}
              <TouchableOpacity
                style={styles.qrScanBtn}
                activeOpacity={0.8}
                onPress={(e) => {
                  e.stopPropagation();
                  setQrModalVisible(true);
                }}
              >
                <Ionicons name="qr-code-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </GlazeFluidCard>
          </ScalePressable>

          {/* Card 2: Kho quà (Hiệu ứng dòng chảy men gốm đồng bộ, chuyển sang /vouchers) */}
          <ScalePressable
            style={styles.giftVaultTouch}
            activeScale={0.98}
            onPress={() => router.push('/vouchers')}
          >
            <GlazeFluidCard
              gradientColors={currentTier.gradientColors}
              blobs={currentTier.watercolorBlobs}
              borderRadius={20}
              style={styles.giftVaultCard}
            >
              <Text style={styles.giftVaultTitle}>Kho quà</Text>

              {/* Hàng số lượng quà: Sử dụng icon quà phẳng vector đồng bộ */}
              <View style={styles.giftVaultCountRow}>
                <Text style={styles.giftVaultCount}>{coupons.length || 0}</Text>
                <Ionicons name="gift-outline" size={17} color="#FFFFFF" style={styles.giftFlatIcon} />
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </View>
            </GlazeFluidCard>
          </ScalePressable>
        </View>

        {/* ================= THANH BANNER ĐẶC QUYỀN HỘI VIÊN (CHUYỂN SANG /membership-privileges) ================= */}
        <ScalePressable
          style={styles.membershipBanner}
          activeScale={0.98}
          onPress={() => router.push('/membership-privileges')}
        >
          <View style={styles.membershipBannerLeft}>
            <View style={[styles.bannerIconCircle, { backgroundColor: '#FAF4EE' }]}>
              <Ionicons name="flame" size={18} color={currentTier.gradientColors[0]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipBannerTitle}>
                {nextTier
                  ? `Chi thêm ${formatCurrency(Math.max(0, nextTier.min - totalSpent))} để lên ${nextTier.name}`
                  : 'Đã đạt hạng hội viên cao nhất'}
              </Text>
              <Text style={styles.membershipBannerSub}>
                Ưu đãi giảm giá {currentTier.discount}% • Xem chi tiết đặc quyền hội viên &gt;
              </Text>
            </View>
          </View>
        </ScalePressable>

        {/* ================= PHÂN MỤC: ƯU ĐÃI MỚI (CHỮ SẮP RA MẮT CHÍNH GIỮA) ================= */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Ưu đãi mới</Text>
        </View>

        {/* Khối chính giữa hiển thị thông báo "Sắp ra mắt" với icon phẳng */}
        <View style={styles.comingSoonCenterCard}>
          <View style={styles.comingSoonIconCircle}>
            <Ionicons name="gift-outline" size={38} color={currentTier.gradientColors[0]} />
          </View>

          <Text style={styles.comingSoonMainTitle}>SẮP RA MẮT</Text>

          <Text style={styles.comingSoonSubDesc}>
            Tính năng đổi điểm lấy quà tặng & voucher ưu đãi đang được hoàn thiện. Hãy tiếp tục mua
            sắm để tích lũy thêm điểm gốm nhé!
          </Text>

          {/* Badge hiển thị điểm gốm khả dụng */}
          <View style={styles.userPointsBadge}>
            <Ionicons name="flame" size={16} color={currentTier.gradientColors[0]} />
            <Text style={styles.userPointsBadgeText}>
              Bạn hiện có <Text style={styles.userPointsBold}>{points} Điểm gốm</Text> khả dụng
            </Text>
          </View>

          <ScalePressable
            style={[
              styles.explorePrivilegesBtn,
              { backgroundColor: currentTier.gradientColors[0] || '#9C7156' },
            ]}
            activeScale={0.97}
            onPress={() => router.push('/membership-privileges')}
          >
            <View style={styles.explorePrivilegesContent}>
              <Text style={styles.explorePrivilegesText}>
                Khám phá đặc quyền hạng {currentTier.name}
              </Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </View>
          </ScalePressable>
        </View>
      </ScrollView>

      {/* ================= MODAL: MÃ THÀNH VIÊN SỐ (QR & BARCODE) ================= */}
      <AnimatedCenterModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        contentStyle={styles.qrCardModal}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Thẻ Thành Viên Số</Text>
          <ScalePressable
            onPress={() => setQrModalVisible(false)}
            style={styles.modalCloseBtn}
            activeScale={0.9}
          >
            <Ionicons name="close" size={20} color="#2B2928" />
          </ScalePressable>
        </View>

        <View style={styles.qrModalBody}>
          <View style={styles.qrBox}>
            <Ionicons name="qr-code" size={140} color="#2B2928" />
          </View>

          <Text style={styles.qrCodeLabel}>{memberCode}</Text>
          <Text style={styles.qrTierName}>
            {userProfile?.displayName || user?.displayName || 'Khách hàng thân thiết'} • Hạng {currentTier.name} • {points} Điểm
          </Text>

          {/* Barcode giả lập */}
          <View style={styles.barcodePlaceholder}>
            <View style={styles.barcodeLinesRow}>
              {Array.from({ length: 32 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.barcodeBar,
                    { width: i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1, height: 38 },
                  ]}
                />
              ))}
            </View>
          </View>

          <Text style={styles.qrModalHint}>
            Đưa mã này cho nhân viên thu ngân tại quầy Tiệm Nhà Gốm để tích điểm và hưởng ưu đãi
            hạng thành viên.
          </Text>

          <ScalePressable
            style={styles.qrCloseActionBtn}
            onPress={() => setQrModalVisible(false)}
            activeScale={0.96}
          >
            <GlazeFluidCard
              gradientColors={currentTier.gradientColors}
              blobs={currentTier.watercolorBlobs}
              borderRadius={26}
              style={styles.qrCloseActionGradient}
            >
              <Text style={styles.qrCloseActionText}>Đóng</Text>
            </GlazeFluidCard>
          </ScalePressable>
        </View>
      </AnimatedCenterModal>
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
      paddingBottom: 110,
    },

    // ================= KHỐI TỔNG QUAN ĐẦU TRANG =================
    topSummaryRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 12,
      width: '100%',
    },
    // Card 1: Hạng & Điểm
    tierPointsTouch: {
      flex: 1.85,
      borderRadius: 20,
      height: 104,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.16,
      shadowRadius: 8,
      elevation: isDark ? 0 : 4,
    },
    tierPointsCard: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderRadius: 20,
      height: 104,
      width: '100%',
    },
    tierPointsLeft: {
      flex: 1,
      justifyContent: 'space-between',
      height: '100%',
    },
    headerBrandLogo: {
      width: 86,
      height: 22,
      marginTop: 2,
    },
    tierNameLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: 'rgba(255, 255, 255, 0.92)',
      fontWeight: '600',
    },
    pointsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    pointsNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    flameIcon: {
      width: 18,
      height: 18,
      marginLeft: 2,
    },
    qrScanBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },

    // Card 2: Kho quà
    giftVaultTouch: {
      flex: 1,
      borderRadius: 20,
      height: 104,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.16,
      shadowRadius: 8,
      elevation: isDark ? 0 : 4,
    },
    giftVaultCard: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      justifyContent: 'space-between',
      borderRadius: 20,
      height: 104,
      width: '100%',
    },
    giftVaultTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.92)',
    },
    giftVaultCountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 2,
    },
    giftVaultCount: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    giftFlatIcon: {
      marginHorizontal: 1,
    },

    // BANNER HỘI VIÊN
    membershipBanner: {
      marginHorizontal: 16,
      marginTop: 16,
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 4,
      elevation: isDark ? 0 : 1,
    },
    membershipBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    bannerIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    membershipBannerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    membershipBannerSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: isDark ? '#9E968D' : '#6E665D',
      marginTop: 2,
    },

    // SECTION HEADER
    sectionHeaderRow: {
      paddingHorizontal: 16,
      marginTop: 24,
      marginBottom: 12,
    },
    sectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },

    // ================= KHỐI CHÍNH GIỮA "SẮP RA MẮT" =================
    comingSoonCenterCard: {
      marginHorizontal: 16,
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      paddingVertical: 36,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 8,
      elevation: isDark ? 0 : 2,
    },
    comingSoonIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      marginBottom: 16,
    },
    comingSoonMainTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '700',
      color: Colors.textPrimary,
      letterSpacing: 1.5,
      textAlign: 'center',
      marginBottom: 10,
    },
    comingSoonSubDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9E968D' : '#6E665D',
      textAlign: 'center',
      lineHeight: 19,
      paddingHorizontal: 12,
      marginBottom: 20,
    },
    userPointsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      borderWidth: 1,
      borderColor: isDark ? '#9C7156' : '#E8CCB2',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginBottom: 24,
    },
    userPointsBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#9E968D' : '#6E665D',
    },
    userPointsBold: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#2B2928',
    },
    explorePrivilegesBtn: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.16,
      shadowRadius: 8,
      elevation: isDark ? 0 : 4,
    },
    explorePrivilegesContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 24,
    },
    explorePrivilegesText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ================= MODAL QR CODE =================
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
    },
    modalTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrCardModal: {
      width: '100%',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0 : 0.2,
      shadowRadius: 16,
      elevation: isDark ? 0 : 6,
    },
    qrModalBody: {
      alignItems: 'center',
      paddingTop: 16,
      width: '100%',
    },
    qrBox: {
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      padding: 16,
      borderRadius: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      marginBottom: 12,
    },
    qrCodeLabel: {
      fontFamily: 'monospace',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      letterSpacing: 2,
      marginBottom: 4,
    },
    qrTierName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#9E968D' : '#6E665D',
      marginBottom: 16,
      textAlign: 'center',
    },
    barcodePlaceholder: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 16,
    },
    barcodeLinesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      height: 40,
      paddingHorizontal: 16,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderRadius: 10,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    barcodeBar: {
      backgroundColor: isDark ? '#E8CCB2' : '#2B2928',
      borderRadius: 1,
    },
    qrModalHint: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: isDark ? '#9E968D' : '#6E665D',
      textAlign: 'center',
      lineHeight: 16,
      marginBottom: 18,
      paddingHorizontal: 8,
    },
    qrCloseActionBtn: {
      width: '100%',
      borderRadius: 26,
      overflow: 'hidden',
    },
    qrCloseActionGradient: {
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    qrCloseActionText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
