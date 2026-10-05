// app/(tabs)/profile.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useWishlist } from '../../src/context/WishlistContext';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { getUserOrders } from '../../src/services/orderService';
import { formatCurrency } from '../../src/utils/format';
import { openWebLink } from '../../src/utils/openWebLink';
import { useSettings } from '../../src/context/SettingsContext';
import { BlurButton } from '../../src/components/BlurButton';

// Cấu hình hạng thành viên đồng bộ chuẩn xác từ Website Tiệm Nhà Gốm
const MEMBERSHIP_TIERS = [
  {
    id: 'null',
    nameKey: 'tierGomMoc',
    defaultName: 'Gốm Mộc',
    min: 0,
    discount: 0,
    color: '#8A5A2B',
    gradientColors: ['#543824', '#3E2718', '#28170D'] as [string, string, ...string[]],
    logoTint: '#E8D5C4',
    accentColor: '#D97706',
    flameColor: '#FDE68A',
    badge: '🪵',
    perkKey: 'tierPerkGomMoc',
    defaultPerk: 'Tích 1% điểm cho mọi đơn hàng',
  },
  {
    id: 'new',
    nameKey: 'tierGomNung',
    defaultName: 'Gốm Nung',
    min: 1000000,
    discount: 1,
    color: '#DC2626',
    gradientColors: ['#A31D1D', '#821414', '#520B0B'] as [string, string, ...string[]],
    logoTint: '#FFFFFF',
    accentColor: '#EF4444',
    flameColor: '#FDE68A',
    badge: '🔥',
    perkKey: 'tierPerkGomNung',
    defaultPerk: 'Giảm 1% toàn đơn + Quà sinh nhật',
  },
  {
    id: 'mem',
    nameKey: 'tierGomMen',
    defaultName: 'Gốm Men',
    min: 5000000,
    discount: 3,
    color: '#CA8A04',
    gradientColors: ['#B45309', '#92400E', '#5C2D07'] as [string, string, ...string[]],
    logoTint: '#FEF08A',
    accentColor: '#FACC15',
    flameColor: '#FEF08A',
    badge: '✨',
    perkKey: 'tierPerkGomMen',
    defaultPerk: 'Giảm 3% toàn đơn + Miễn phí vận chuyển',
  },
  {
    id: 'vip',
    nameKey: 'tierGomDocBan',
    defaultName: 'Gốm Độc Bản',
    min: 10000000,
    discount: 5,
    color: '#EF4444',
    gradientColors: ['#27272A', '#18181B', '#09090B'] as [string, string, ...string[]],
    logoTint: '#EF4444',
    accentColor: '#EF4444',
    flameColor: '#F59E0B',
    badge: '👑',
    perkKey: 'tierPerkGomDocBan',
    defaultPerk: 'Giảm 5% toàn đơn + Ưu tiên bộ sưu tập giới hạn',
  },
];

const formatD = (amount?: number | null) => `${new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0))}đ`;
const formatNumberOnly = (amount?: number | null) => new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0));

export default function ProfileScreen() {
  const router = useRouter();
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const { user, userProfile } = useAuth();
  const { favorites } = useWishlist();
  const { unreadCount } = useNotificationBadge();
  const { t } = useSettings();

  // Helper dịch hạng thành viên & quyền lợi
  const getTierName = (tier: (typeof MEMBERSHIP_TIERS)[0]) => t(tier.nameKey) || tier.defaultName;
  const getTierPerk = (tier: (typeof MEMBERSHIP_TIERS)[0]) => t(tier.perkKey) || tier.defaultPerk;

  // Loyalty calculations - khởi tạo giá trị ban đầu trực tiếp từ userProfile để tránh lệch hạng / lệch màu
  const [totalSpent, setTotalSpent] = useState<number>(() => {
    return Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
  });
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);
  const [, setLoadingOrders] = useState<boolean>(false);

  // Modals state
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [tierModalVisible, setTierModalVisible] = useState(false);
  const [pointsModalVisible, setPointsModalVisible] = useState(false);

  // Tính toán chi tiêu thực tế từ các đơn hàng đã hoàn thành để đồng bộ chuẩn xác với web
  useEffect(() => {
    const profileSpent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
    if (user) {
      setLoadingOrders(true);
      getUserOrders(user.uid)
        .then((orders) => {
          let orderSpent = 0;
          let redeemed = 0;
          orders.forEach((o) => {
            const status = (o.status || '').toLowerCase();
            // Chỉ tích lũy các đơn hàng đã hoàn thành thành công giống hệ thống Web
            if (
              status.includes('hoàn thành') ||
              status.includes('thành công') ||
              status.includes('completed')
            ) {
              orderSpent += Number(o.totalAmount || 0);
            }
            if ((o as any).pointsUsed && Number((o as any).pointsUsed) > 0) {
              redeemed += Number((o as any).pointsUsed);
            }
          });
          setRedeemedPoints(redeemed);
          // Không cộng dồn trùng lặp: lấy mức chi tiêu cao nhất giữa tổng đơn thực tế và trường profile
          setTotalSpent(Math.max(orderSpent, profileSpent));
        })
        .catch(() => {
          setTotalSpent(profileSpent);
        })
        .finally(() => setLoadingOrders(false));
    } else {
      setTotalSpent(profileSpent);
      setRedeemedPoints(0);
    }
  }, [user, userProfile]);

  // Xác định hạng hội viên theo chi tiêu (đồng bộ chuẩn xác 100% với hệ thống Web Tiệm Nhà Gốm)
  // Mốc phân hạng:
  // - Gốm Mộc: Từ 0đ đến dưới 1.000.000đ
  // - Gốm Nung: Từ 1.000.000đ đến dưới 5.000.000đ
  // - Gốm Men: Từ 5.000.000đ đến dưới 10.000.000đ
  // - Gốm Độc Bản: Từ 10.000.000đ trở lên
  let currentTier = MEMBERSHIP_TIERS[0];
  let nextTier: (typeof MEMBERSHIP_TIERS)[0] | null = MEMBERSHIP_TIERS[1];

  for (let i = MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
    if (totalSpent >= MEMBERSHIP_TIERS[i].min) {
      currentTier = MEMBERSHIP_TIERS[i];
      nextTier = MEMBERSHIP_TIERS[i + 1] || null;
      break;
    }
  }

  // Chỉ ghi đè nếu admin gán thủ công trường membershipTier cụ thể
  const manualTierRaw = userProfile?.membershipTier;
  if (manualTierRaw && typeof manualTierRaw === 'string') {
    const cTier = manualTierRaw.toLowerCase().trim();
    let manualIdx = -1;
    if (cTier === 'vip' || cTier.includes('độc bản') || cTier.includes('doc ban')) manualIdx = 3;
    else if (cTier === 'mem' || cTier.includes('men') || cTier.includes('gom men')) manualIdx = 2;
    else if (cTier === 'new' || cTier.includes('nung') || cTier.includes('gom nung')) manualIdx = 1;
    else if (cTier === 'null' || cTier.includes('mộc') || cTier.includes('moc')) manualIdx = 0;

    if (manualIdx > -1) {
      const currentIdx = MEMBERSHIP_TIERS.findIndex((t) => t.id === currentTier.id);
      if (manualIdx > currentIdx) {
        currentTier = MEMBERSHIP_TIERS[manualIdx];
        nextTier = MEMBERSHIP_TIERS[manualIdx + 1] || null;
      }
    }
  }

  // % thanh tiến độ thăng hạng chuẩn xác 100% theo mốc hiển thị (totalSpent / nextTier.min)
  const progressPercent = nextTier
    ? Math.min(100, Math.max(0, Math.round((totalSpent / nextTier.min) * 100)))
    : 100;

  // Hệ thống tính điểm: Cứ 10.000đ = 1 điểm. Cộng từ chi tiêu thực tế, trừ điểm đã sử dụng, bỏ thưởng chào mừng 50đ cũ
  const earnedPoints = Math.floor(totalSpent / 10000);
  const rawProfilePoints = userProfile?.points !== undefined && userProfile?.points !== null ? Number(userProfile.points) : 0;
  // Bỏ thưởng chào mừng 50 điểm cũ nếu chưa chi tiêu đủ 500k
  const cleanProfilePoints = (rawProfilePoints === 50 && totalSpent < 500000) ? 0 : rawProfilePoints;
  const points = Math.max(0, Math.max(earnedPoints, cleanProfilePoints) - redeemedPoints);
  const memberCode = `TNG-${(user?.uid || userProfile?.uid || '1612').substring(0, 8).toUpperCase()}`;
  const displayName = userProfile?.displayName || userProfile?.name || user?.displayName || 'Nguyễn Cường';

  const openHotline = () => {
    Linking.openURL('tel:0777709662').catch(() => {
      Alert.alert(t('notification') || 'Thông báo', 'Hotline: 0777 709 662');
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle={Colors.cardBackground === '#1E1E1E' ? 'light-content' : 'dark-content'} />

      {/* ========================================================================= */}
      {/* 1. TOP HEADER: AVATAR + USER NAME + ROUND SETTINGS & NOTIFICATIONS BTNS  */}
      {/* ========================================================================= */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.userInfoRow}
          activeOpacity={0.8}
          onPress={() => (user ? router.push('/edit-profile') : router.push('/auth/login'))}
        >
          <View style={styles.avatarWrap}>
            {userProfile?.photoURL || user?.photoURL ? (
              <Image
                source={{ uri: userProfile?.photoURL || user?.photoURL || '' }}
                style={styles.avatarImg}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={22} color="#A1A1AA" />
              </View>
            )}
          </View>

          <View style={styles.userNameBlock}>
            <Text style={styles.userNameText} numberOfLines={1}>
              {user ? displayName : (t('loginRegister') || `${t('login')} / ${t('register')}`)}
            </Text>
            {user ? (
              <Text style={styles.userTierSubText}>
                {getTierName(currentTier)} • {points} {t('pointUnit') || 'Điểm'}
              </Text>
            ) : (
              <Text style={styles.userTierSubText}>
                {t('exploreMemberPerks')}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Nút icon tròn: Thông báo trước, Cài đặt sau */}
        <View style={styles.headerRightButtons}>
          <BlurButton
            style={styles.roundHeaderBtn}
            onPress={() => router.push('/notifications')}
            accessibilityLabel={t('notifications') || 'Thông báo'}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </BlurButton>

          <BlurButton
            style={styles.roundHeaderBtn}
            onPress={() => router.push('/settings')}
            accessibilityLabel={t('settingsTitle') || 'Cài đặt'}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.textPrimary} />
          </BlurButton>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ========================================================================= */}
        {/* 2. PRIMARY HERO CARD: VIP MEMBERSHIP CARD (2-COLUMN HIGHLANDS LAYOUT)     */}
        {/* ========================================================================= */}
        <View style={[styles.cardShadowWrap, { shadowColor: currentTier.gradientColors[0] }]}>
          <LinearGradient
            colors={currentTier.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.membershipCard}
          >
            <View style={styles.cardTwoColumns}>
              {/* CỘT TRÁI: LOGO/EMBLEM + TÊN HẠNG */}
              <View style={styles.cardLeftCol}>
                <View style={styles.emblemContainer}>
                  <Image
                    source={require('../../assets/images/textlogo.webp')}
                    style={styles.emblemImg}
                    contentFit="contain"
                    tintColor={currentTier.logoTint}
                  />
                </View>
                <Text style={styles.tierNameUnderEmblem} numberOfLines={1}>
                  {t('tierPrefix')} {getTierName(currentTier)}
                </Text>
              </View>

              {/* CỘT PHẢI: ĐIỂM, QR, THANH TIẾN ĐỘ & DẢI THĂNG HẠNG */}
              <View style={styles.cardRightCol}>
                {/* 1. Điểm & Icon QR */}
                <View style={styles.rightTopRow}>
                  <TouchableOpacity
                    style={styles.pointsGroup}
                    activeOpacity={0.8}
                    onPress={() => router.push('/points-history')}
                  >
                    <Text style={styles.pointsNumber}>{points}</Text>
                    <Ionicons
                      name="flame"
                      size={17}
                      color={currentTier.flameColor || '#FDE68A'}
                      style={{ marginLeft: 3 }}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.qrScanIconBtn}
                    activeOpacity={0.8}
                    onPress={() => setQrModalVisible(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="scan-outline" size={23} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* 2. Thanh tiến độ */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${progressPercent}%`,
                        backgroundColor: currentTier.accentColor || '#FCD34D',
                      },
                    ]}
                  />
                </View>

                {/* 3. Chi tiêu / Mục tiêu & Tên hạng tiếp theo */}
                <View style={styles.spendRow}>
                  <Text style={styles.spendText}>
                    {nextTier
                      ? `${formatNumberOnly(totalSpent)} / ${formatD(nextTier.min)}`
                      : `${formatD(totalSpent)} / ${t('maxLabel')}`}
                  </Text>
                  <Text style={styles.nextTierName}>
                    {nextTier ? getTierName(nextTier) : t('topTierLabel')}
                  </Text>
                </View>

                {/* 4. Dải thông báo thăng hạng */}
                <TouchableOpacity
                  style={styles.calloutStrip}
                  activeOpacity={0.8}
                  onPress={() => router.push('/membership-privileges')}
                >
                  <Text style={styles.calloutText} numberOfLines={2}>
                    {nextTier
                      ? `${t('spendMoreToUpgrade')} ${formatD(Math.max(0, nextTier.min - totalSpent))} ${t('toUpgradeTo')} ${getTierName(nextTier)}.`
                      : t('highestTierReached')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ========================================================================= */}
        {/* 3. SECONDARY BANNER: THẺ TIỆM NHÀ GỐM & THAO TÁC NHANH                    */}
        {/* ========================================================================= */}
        <View style={styles.secondaryCard}>
          <View style={styles.secondaryCardLeft}>
            <Text style={styles.secondaryCardTitle}>{t('tiemNhaGomCard')}</Text>

            <View style={styles.secondaryActionsRow}>
              <TouchableOpacity
                style={styles.pillActionBtn}
                activeOpacity={0.8}
                onPress={() => setQrModalVisible(true)}
              >
                <Ionicons name="scan-outline" size={16} color={Colors.textPrimary} />
                <Text style={styles.pillActionText}>{t('scanAction')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pillActionBtn}
                activeOpacity={0.8}
                onPress={() => router.push('/deals')}
              >
                <Ionicons name="gift-outline" size={16} color={Colors.textPrimary} />
                <Text style={styles.pillActionText}>{t('dealsAction')}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.manageCardLink}
              activeOpacity={0.7}
              onPress={() => router.push('/membership-privileges')}
            >
              <Text style={styles.manageCardText}>{t('manageCard')}</Text>
              <Ionicons name="chevron-forward" size={15} color="#8A5A2B" />
            </TouchableOpacity>
          </View>

          {/* Right illustration / artwork */}
          <View style={styles.secondaryCardRight}>
            <Image
              source={require('../../assets/images/hoa-nha-gom.webp')}
              style={styles.illustrationImg}
              contentFit="cover"
            />
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 4. UTILITY ACTIONS GRID (2 ROWS X 4 COLUMNS = 8 ITEMS)                    */}
        {/* ========================================================================= */}
        <View style={styles.gridCard}>
          {/* Row 1 */}
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => (user ? router.push('/edit-profile') : router.push('/auth/login'))}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="person-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel}>{t('profileUtility')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => router.push('/membership-privileges')}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="ribbon-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel} numberOfLines={2}>
                {t('memberPrivilegesUtility')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => router.push('/deals')}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="gift-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel}>{t('rewardsWalletUtility')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => router.push('/favorites')}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="heart-outline" size={24} color="#8A5A2B" />
                {favorites.length > 0 && (
                  <View style={styles.gridBadge}>
                    <Text style={styles.gridBadgeText}>{favorites.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.gridLabel}>{t('favoriteItemsUtility')}</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2 */}
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => router.push('/orders')}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="receipt-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel} numberOfLines={2}>
                {t('purchaseHistoryUtility')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => router.push('/points-history')}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="flame-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel} numberOfLines={2}>
                {t('pointsHistoryUtility')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => openWebLink('https://maps.app.goo.gl/7Jxw7yJyaQG8wkHeA', t('storeLocationsUtility'))}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="storefront-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel}>{t('storeLocationsUtility')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.7}
              onPress={() => (user ? router.push('/edit-profile') : router.push('/auth/login'))}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name="location-outline" size={24} color="#8A5A2B" />
              </View>
              <Text style={styles.gridLabel}>{t('addressBookUtility')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 5. SUPPORT & SETTINGS LIST (HỖ TRỢ & CÀI ĐẶT)                             */}
        {/* ========================================================================= */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('supportSectionTitle')}</Text>
        </View>

        <View style={styles.supportListCard}>
          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() => openWebLink('https://tiemnhagom.vn/about/', t('aboutTiemNhaGom'))}
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="information-circle-outline" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>{t('aboutTiemNhaGom')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() => openWebLink('https://tiemnhagom.vn/faq.html', t('faqSupport'))}
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="help-circle-outline" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>{t('faqSupport')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() =>
              Linking.openURL('https://www.facebook.com/tiemnhagom.vn')
            }
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="logo-facebook" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>Fanpage</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() =>
              Linking.openURL('https://www.instagram.com/tiemnhagom.vn')
            }
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="logo-instagram" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>Instagram</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() =>
              Linking.openURL('https://www.tiktok.com/@tiemnhagom.vn')
            }
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="logo-tiktok" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>Tik Tok</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('mailto:tiemnhagom.contact@gmail.com')}
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="mail-open-outline" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>
                tiemnhagom.contact@gmail.com
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={openHotline}
          >
            <View style={styles.hotlineLeft}>
              <Ionicons name="call-outline" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>{t('hotlineSupport')}</Text>
              <Text style={styles.hotlineNumber}>0777 709 662</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('privacyTitle')}</Text>
        </View>

        <View style={styles.supportListCard}>
          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() => openWebLink('https://tiemnhagom.vn/chinh-sach/privacy-policy.html', t('termsAndPolicies'))}
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>{t('privacyText')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          <View style={styles.itemDivider} />

          <TouchableOpacity
            style={styles.supportListItem}
            activeOpacity={0.7}
            onPress={() => openWebLink('https://tiemnhagom.vn/chinh-sach/terms-of-service.html', t('termsAndPolicies'))}
          >
            <View style={styles.supportItemLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#8A5A2B" />
              <Text style={styles.supportItemTitle}>{t('termsText')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: QR CODE & MÃ THÀNH VIÊN                                          */}
      {/* ========================================================================= */}
      <Modal
        visible={qrModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.qrCardModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('memberCardModalTitle')}</Text>
              <TouchableOpacity
                onPress={() => setQrModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#5D6160" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrModalBody}>
              <View style={styles.qrBox}>
                <Ionicons name="qr-code" size={140} color="#2D3B34" />
              </View>

              <Text style={styles.qrCodeLabel}>{memberCode}</Text>
              <Text style={styles.qrTierName}>
                {displayName} • {t('tierPrefix')} {getTierName(currentTier)} • {points} {t('pointUnit') || 'Điểm'}
              </Text>

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

              <Text style={styles.qrHelpText}>
                {t('scanAtCounterInstruction')}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: ĐẶC QUYỀN CÁC HẠNG THÀNH VIÊN                                   */}
      {/* ========================================================================= */}
      <Modal
        visible={tierModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTierModalVisible(false)}
      >
        <View style={styles.modalOverlayBottom}>
          <View style={styles.tierSheetModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="ribbon-outline" size={20} color="#8A5A2B" />
                <Text style={styles.modalTitle}>{t('memberPrivilegesModalTitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setTierModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#5D6160" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.tierListContainer}>
              <Text style={styles.tierIntroText}>
                {t('memberPrivilegesIntro')}
              </Text>

              {MEMBERSHIP_TIERS.map((tier) => {
                const isCurrent = tier.id === currentTier.id;
                return (
                  <View
                    key={tier.id}
                    style={[styles.tierDetailCard, isCurrent && styles.tierDetailCardActive]}
                  >
                    <View style={styles.tierHeader}>
                      <View style={styles.tierLeftBadge}>
                        <View style={[styles.tierColorDot, { backgroundColor: tier.color }]} />
                        <Text style={styles.tierCardTitle}>
                          {t('tierPrefix')} {getTierName(tier)}
                        </Text>
                        {isCurrent && (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>{t('currentTierBadge')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.tierDiscountTag}>
                        {t('orderDiscount') || 'Giảm'} {tier.discount}%
                      </Text>
                    </View>

                    <Text style={styles.tierMinSpend}>
                      {t('spendConditionText')} {formatCurrency(tier.min)}
                    </Text>
                    <Text style={styles.tierPerkText}>{getTierPerk(tier)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: LỊCH SỬ & QUY TẮC ĐIỂM THƯỞNG                                   */}
      {/* ========================================================================= */}
      <Modal
        visible={pointsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPointsModalVisible(false)}
      >
        <View style={styles.modalOverlayBottom}>
          <View style={styles.tierSheetModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="flame" size={20} color="#E5B869" />
                <Text style={styles.modalTitle}>{t('potteryPointsModalTitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPointsModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#5D6160" />
              </TouchableOpacity>
            </View>

            <View style={styles.pointsSheetBody}>
              <View style={styles.pointsHighlightBox}>
                <Text style={styles.pointsBigNumber}>{points}</Text>
                <Text style={styles.pointsUnitLabel}>{t('availablePointsLabel')}</Text>
                <Text style={styles.pointsEquivText}>
                  {t('pointsDiscountEquivText')} {formatCurrency(points * 1000)} {t('pointsDiscountEquivSuffix')}
                </Text>
              </View>

              <View style={styles.pointsRulesList}>
                <View style={styles.ruleItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.ruleText}>{t('pointRuleText1')}</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.ruleText}>{t('pointRuleText2')}</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.ruleText}>{t('pointRuleText3')}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (Colors: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || '#FAF8F5',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 80,
    },

    // 1. Top Header
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'android' ? 10 : 6,
      paddingBottom: 8,
      backgroundColor: Colors.background || '#FAF8F5',
    },
    userInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 10,
      marginRight: 10,
    },
    avatarWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: '#E4E4E7',
      borderWidth: 1.5,
      borderColor: Colors.border || '#E8E1D8',
    },
    avatarImg: {
      width: 44,
      height: 44,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E4E4E7',
    },
    userNameBlock: {
      flex: 1,
    },
    userNameText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
    },
    userTierSubText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: Colors.textMuted || '#9E968D',
      marginTop: 2,
    },
    headerRightButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    roundHeaderBtn: {
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
      backgroundColor: '#B91C1C',
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: Colors.background || '#FAF8F5',
      zIndex: 10,
    },
    notificationBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },

    // 2. Primary Hero Card (VIP Member Card)
    cardShadowWrap: {
      borderRadius: 20,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 6,
      marginBottom: 16,
    },
    membershipCard: {
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.14)',
    },
    cardTwoColumns: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    cardLeftCol: {
      width: 105,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    emblemContainer: {
      width: '100%',
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emblemImg: {
      width: '100%',
      height: '100%',
    },
    tierNameUnderEmblem: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.8,
      fontWeight: '700',
      color: '#FFFFFF',
      textAlign: 'center',
      marginTop: 6,
      letterSpacing: 0.2,
    },
    cardRightCol: {
      flex: 1,
      paddingLeft: 14,
      justifyContent: 'space-between',
    },
    rightTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pointsGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pointsNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    qrScanIconBtn: {
      padding: 2,
    },
    progressBarTrack: {
      height: 4,
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      borderRadius: 2,
      marginTop: 8,
      marginBottom: 5,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: 4,
      backgroundColor: '#FFFFFF',
      borderRadius: 2,
    },
    spendRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    spendText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10.5,
      color: 'rgba(255, 255, 255, 0.9)',
      fontWeight: '600',
    },
    nextTierName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10.5,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    calloutStrip: {
      backgroundColor: 'rgba(0, 0, 0, 0.22)',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    calloutText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10,
      color: 'rgba(255, 255, 255, 0.92)',
      lineHeight: 14,
    },

    // 3. Secondary Card (Thẻ Tiệm Nhà Gốm)
    secondaryCard: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      borderRadius: 20,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: Colors.border || '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    secondaryCardLeft: {
      flex: 1.3,
    },
    secondaryCardTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
      marginBottom: 12,
    },
    secondaryActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    pillActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: Colors.background || '#FAF8F5',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: Colors.border || '#E8E1D8',
    },
    pillActionText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: Colors.textPrimary || '#231B15',
    },
    manageCardLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    manageCardText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      color: '#8A5A2B',
    },
    secondaryCardRight: {
      flex: 0.9,
      alignItems: 'flex-end',
    },
    illustrationImg: {
      width: 100,
      height: 85,
      borderRadius: 16,
    },

    // 4. Utility Actions Grid (4 columns)
    gridCard: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 8,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: Colors.border || '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
      gap: 16,
    },
    gridRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-around',
    },
    gridItem: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    gridIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Colors.background || '#FAF8F5',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      position: 'relative',
    },
    gridBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      backgroundColor: '#C86432',
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    gridBadgeText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '700',
    },
    gridLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: Colors.textSecondary || '#6E665D',
      textAlign: 'center',
      fontWeight: '500',
      lineHeight: 14,
    },

    // 5. Support Section
    sectionHeaderRow: {
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
    },
    supportListCard: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: Colors.border || '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    supportListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    },
    supportItemTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '500',
      color: Colors.textPrimary || '#231B15',
    },
    supportItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    supportItemRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    currentLangText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: '#8A5A2B',
      fontWeight: '600',
    },
    hotlineLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    hotlineNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: '#8A5A2B',
    },
    itemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: Colors.borderLight || '#F0ECE6',
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 20,
      paddingVertical: 14,
      gap: 8,
      marginBottom: 20,
      marginTop: 4,
    },
    logoutBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: '#DC2626',
    },

    // Footer
    footerWrap: {
      alignItems: 'center',
      marginVertical: 14,
    },
    footerLogoImg: {
      width: 110,
      height: 40,
      marginBottom: 6,
      opacity: 0.85,
    },
    footerVersion: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10,
      color: Colors.textMuted || '#9E968D',
      marginTop: 2,
    },

    // =========================================================================
    // MODAL STYLES
    // =========================================================================
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalOverlayBottom: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'flex-end',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Colors.border || '#E8E1D8',
    },
    modalHeaderTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: Colors.background || '#FAF8F5',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // QR Modal
    qrCardModal: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      width: '100%',
      maxWidth: 340,
      borderRadius: 24,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    qrModalBody: {
      padding: 20,
      alignItems: 'center',
    },
    qrBox: {
      padding: 14,
      backgroundColor: '#FAF8F5',
      borderRadius: 20,
      borderWidth: 1.2,
      borderColor: Colors.border || '#E8E1D8',
      marginBottom: 12,
    },
    qrCodeLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '800',
      color: Colors.textPrimary || '#231B15',
      letterSpacing: 1.5,
    },
    qrTierName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textMuted || '#9E968D',
      marginTop: 4,
      marginBottom: 14,
      textAlign: 'center',
    },
    barcodePlaceholder: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: '#FAF8F5',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.border || '#E8E1D8',
      marginBottom: 12,
    },
    barcodeLinesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    barcodeBar: {
      backgroundColor: '#2D3B34',
    },
    qrHelpText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: Colors.textMuted || '#9E968D',
      textAlign: 'center',
      lineHeight: 16,
      maxWidth: 260,
    },

    // Tier Sheet Modal
    tierSheetModal: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '80%',
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    tierListContainer: {
      padding: 20,
      gap: 12,
    },
    tierIntroText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textSecondary || '#6E665D',
      lineHeight: 18,
      marginBottom: 6,
    },
    tierDetailCard: {
      backgroundColor: Colors.background || '#FAF8F5',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: Colors.border || '#E8E1D8',
    },
    tierDetailCardActive: {
      borderColor: '#8A5A2B',
      borderWidth: 1.5,
      backgroundColor: '#FFFDF9',
    },
    tierHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    tierLeftBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    tierColorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    tierCardTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
    },
    currentBadge: {
      backgroundColor: '#8A5A2B',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    currentBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    tierDiscountTag: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '800',
      color: '#B91C1C',
    },
    tierMinSpend: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: Colors.textMuted || '#9E968D',
      marginBottom: 4,
    },
    tierPerkText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textPrimary || '#231B15',
      fontWeight: '500',
    },

    // Points Sheet Modal
    pointsSheetBody: {
      padding: 20,
    },
    pointsHighlightBox: {
      backgroundColor: '#FFFDF9',
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1.2,
      borderColor: '#E5B869',
      marginBottom: 20,
    },
    pointsBigNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 44,
      fontWeight: '800',
      color: '#8A5A2B',
    },
    pointsUnitLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
      marginTop: 2,
    },
    pointsEquivText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: '#16A34A',
      fontWeight: '600',
      marginTop: 8,
    },
    pointsRulesList: {
      gap: 12,
    },
    ruleItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    ruleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textSecondary || '#6E665D',
      flex: 1,
      lineHeight: 18,
    },

    // Language Modal Styles
    langModalContent: {
      padding: 20,
    },
    langModalSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textSecondary || '#6E665D',
      marginBottom: 16,
    },
    langOptionsList: {
      gap: 10,
    },
    langOptionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Colors.background || '#FAF8F5',
      borderWidth: 1.2,
      borderColor: Colors.border || '#E8E1D8',
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    langOptionCardActive: {
      borderColor: '#8A5A2B',
      backgroundColor: '#FFFDF9',
    },
    langOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    langFlagEmoji: {
      fontSize: 24,
    },
    langOptionName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textPrimary || '#231B15',
    },
    langOptionNameActive: {
      color: '#8A5A2B',
      fontWeight: '700',
    },
    langOptionNativeName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: Colors.textMuted || '#9E968D',
      marginTop: 2,
    },
    radioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: Colors.border || '#D1D5DB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleActive: {
      borderColor: '#8A5A2B',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#8A5A2B',
    },
  });
