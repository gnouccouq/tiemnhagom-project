// app/select-voucher.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';
import { useCart } from '../src/context/CartContext';
import { useDialog } from '../src/context/DialogContext';
import {
  getAllUserCoupons,
  checkUserCouponUsed,
  CategorizedCoupons,
  CouponItem,
} from '../src/services/couponService';
import { getUserOrders } from '../src/services/orderService';
import { formatCurrency } from '../src/utils/format';

type TabType = 'unused' | 'used' | 'expired';

export default function SelectVoucherScreen() {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useSettings();
  const { user, userProfile } = useAuth();
  const { subtotal, appliedCoupon, appliedCouponItem, applyCouponItem } = useCart();
  const dialog = useDialog();

  const [activeTab, setActiveTab] = useState<TabType>('unused');
  const [couponsData, setCouponsData] = useState<CategorizedCoupons>({
    unused: [],
    used: [],
    expired: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [promoInput, setPromoInput] = useState<string>('');
  const [applyingCode, setApplyingCode] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<CouponItem | null>(appliedCouponItem);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);

  // Tải tổng chi tiêu thực tế từ các đơn hàng để tính chuẩn xác điểm gốm
  useEffect(() => {
    let isCancelled = false;
    if (!user) {
      setTotalSpent(0);
      setRedeemedPoints(0);
      return;
    }
    getUserOrders(user.uid)
      .then((orders) => {
        if (isCancelled) return;
        let spent = Number(userProfile?.totalSpent || (userProfile as any)?.spentTotal || 0);
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
        if (!isCancelled) {
          setTotalSpent(Number(userProfile?.totalSpent || (userProfile as any)?.spentTotal || 0));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [user, userProfile]);

  const earnedPoints = Math.floor(totalSpent / 10000);
  const rawProfilePoints =
    userProfile?.points !== undefined && userProfile?.points !== null
      ? Number(userProfile.points)
      : 0;
  const cleanProfilePoints = rawProfilePoints === 50 && totalSpent < 500000 ? 0 : rawProfilePoints;
  const userPoints = Math.max(0, Math.max(earnedPoints, cleanProfilePoints) - redeemedPoints);

  // Tải danh sách voucher đồng bộ 100% với trang Kho quà (app/vouchers.tsx)
  const loadCoupons = useCallback(async () => {
    try {
      const data = await getAllUserCoupons(user?.uid);
      setCouponsData(data);

      // Nếu đang có coupon được chọn trong CartContext, tìm trong danh sách khả dụng
      if (appliedCouponItem) {
        setSelectedItem(appliedCouponItem);
      } else if (appliedCoupon) {
        const matched = data.unused.find(
          (c) => c.code.toUpperCase() === appliedCoupon.toUpperCase() || c.id.toUpperCase() === appliedCoupon.toUpperCase()
        );
        if (matched) setSelectedItem(matched);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách voucher:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedCoupon, appliedCouponItem, user?.uid]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCoupons();
  };

  const getExpiryInfo = (expiryDate?: string) => {
    if (!expiryDate) return { text: t('unlimitedTime') || 'Không giới hạn thời gian', isUrgent: false, dateStr: '' };
    try {
      const d = new Date(expiryDate);
      if (isNaN(d.getTime())) return { text: `${t('expiryDateLabel') || 'Hạn dùng'}: ${expiryDate}`, isUrgent: false, dateStr: expiryDate };

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffMs = target.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateStr = `23:59 ${day}/${month}/${year}`;

      if (diffDays > 0 && diffDays <= 3) {
        return {
          text: (t('expiresInDays') || 'Hết hạn trong {days} ngày').replace('{days}', String(diffDays)),
          isUrgent: true,
          dateStr,
        };
      } else if (diffDays === 0) {
        return {
          text: t('expiresToday') || 'Hết hạn hôm nay',
          isUrgent: true,
          dateStr,
        };
      }
      return {
        text: (t('expiresAt') || 'Hết hạn: {date}').replace('{date}', dateStr),
        isUrgent: false,
        dateStr,
      };
    } catch {
      return { text: (t('expiresAt') || 'Hết hạn: {date}').replace('{date}', expiryDate), isUrgent: false, dateStr: expiryDate };
    }
  };

  // Xử lý khi người dùng nhập mã voucher thủ công (tuân thủ nghiêm ngặt quy tắc voucher chỉ dùng 1 lần)
  const handleApplyPromoCode = async () => {
    const clean = promoInput.trim().toUpperCase();
    if (!clean) return;

    setApplyingCode(true);
    try {
      // 1. Kiểm tra xem người dùng đã từng sử dụng mã này trong đơn hàng nào chưa (Bản Web: check orders)
      const isAlreadyUsedInOrders = await checkUserCouponUsed(user?.uid, clean);
      const isAlreadyInUsedList = couponsData.used.some(
        (c) => c.code.toUpperCase() === clean || c.id.toUpperCase() === clean
      );

      if (isAlreadyUsedInOrders || isAlreadyInUsedList) {
        dialog.alert(
          t('notice') || 'Thông báo',
          t('voucherAlreadyUsed') || 'Bạn đã sử dụng mã giảm giá này cho một đơn hàng trước đó.'
        );
        setApplyingCode(false);
        return;
      }

      // 2. Kiểm tra nếu mã đã hết hạn
      const isExpiredInList = couponsData.expired.some(
        (c) => c.code.toUpperCase() === clean || c.id.toUpperCase() === clean
      );
      if (isExpiredInList) {
        dialog.alert(
          t('notice') || 'Thông báo',
          t('voucherExpiredAlert') || 'Mã giảm giá này đã hết hạn sử dụng.'
        );
        setApplyingCode(false);
        return;
      }

      // 3. Tìm trong danh sách voucher khả dụng
      const matched = couponsData.unused.find(
        (c) => c.code.toUpperCase() === clean || c.id.toUpperCase() === clean
      );

      if (matched) {
        if (matched.minOrder && subtotal < matched.minOrder) {
          dialog.alert(
            t('error_2') || 'Không đủ điều kiện',
            (t('voucherSubtotalNotMet') || 'Voucher yêu cầu đơn hàng từ {amount}.').replace(
              '{amount}',
              formatCurrency(matched.minOrder)
            )
          );
          setApplyingCode(false);
          return;
        }
        setSelectedItem(matched);
        setActiveTab('unused');
        setPromoInput('');
        setApplyingCode(false);
        return;
      }

      // 4. Nếu chưa có trong danh sách local, kiểm tra trực tiếp collection "coupons" trên Firestore
      try {
        const snapDoc = await getDoc(doc(db, 'coupons', clean));
        if (snapDoc.exists()) {
          const data = snapDoc.data();
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Kiểm tra hạn
          if (data.expiryDate && new Date(data.expiryDate) < today) {
            dialog.alert(
              t('notice') || 'Thông báo',
              t('voucherExpiredAlert') || 'Mã giảm giá này đã hết hạn sử dụng.'
            );
            setApplyingCode(false);
            return;
          }

          // Kiểm tra lượt dùng hệ thống
          if (data.limit && Number(data.limit) > 0 && (Number(data.usedCount) || 0) >= Number(data.limit)) {
            dialog.alert(
              t('notice') || 'Thông báo',
              t('voucherLimitReached') || 'Mã giảm giá này đã hết lượt sử dụng.'
            );
            setApplyingCode(false);
            return;
          }

          // Kiểm tra gán riêng cho user khác
          if (data.assignedTo && data.assignedTo !== user?.uid) {
            dialog.alert(
              t('notice') || 'Thông báo',
              'Mã ưu đãi này dành riêng cho tài khoản khác.'
            );
            setApplyingCode(false);
            return;
          }

          const minOrd = Number(data.minOrder || data.minSpend || 0);
          if (minOrd > 0 && subtotal < minOrd) {
            dialog.alert(
              t('error_2') || 'Không đủ điều kiện',
              (t('voucherSubtotalNotMet') || 'Voucher yêu cầu đơn hàng từ {amount}.').replace(
                '{amount}',
                formatCurrency(minOrd)
              )
            );
            setApplyingCode(false);
            return;
          }

          const fetchedCoupon: CouponItem = {
            id: snapDoc.id,
            code: snapDoc.id,
            name: data.name || data.title || `Voucher ${snapDoc.id}`,
            type: data.type || data.discountType || 'percent',
            value: Number(data.value || data.discountValue || 0),
            maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : undefined,
            minOrder: minOrd,
            limit: data.limit ? Number(data.limit) : undefined,
            usedCount: data.usedCount ? Number(data.usedCount) : 0,
            expiryDate: data.expiryDate,
            conditions: data.conditions || data.description,
            description: data.description || data.conditions,
            isUsed: false,
          };

          setCouponsData((prev) => ({
            ...prev,
            unused: [fetchedCoupon, ...prev.unused.filter((c) => c.id !== fetchedCoupon.id)],
          }));
          setSelectedItem(fetchedCoupon);
          setActiveTab('unused');
          setPromoInput('');
          setApplyingCode(false);
          return;
        }
      } catch (err) {
        console.warn('Lỗi tra cứu voucher Firestore:', err);
      }

      // 5. Kiểm tra các mã mặc định
      if (clean === 'GOMMOI' || clean === 'TIEMNHAGOM' || clean === 'CHAOBAN') {
        const customCoupon: CouponItem = {
          id: clean,
          code: clean,
          name: `Ưu đãi ${clean}`,
          type: clean === 'GOMMOI' ? 'percent' : clean === 'CHAOBAN' ? 'percent' : 'fixed',
          value: clean === 'GOMMOI' ? 10 : clean === 'CHAOBAN' ? 15 : 20000,
          maxDiscount: clean === 'GOMMOI' ? 30000 : clean === 'CHAOBAN' ? 50000 : undefined,
          isUsed: false,
        };
        setSelectedItem(customCoupon);
        setActiveTab('unused');
        setPromoInput('');
      } else {
        dialog.alert(
          t('error_2') || 'Mã không hợp lệ',
          t('invalidCoupon') || 'Mã ưu đãi không chính xác hoặc đã hết lượt.'
        );
      }
    } finally {
      setApplyingCode(false);
    }
  };

  const handleToggleItem = (item: CouponItem) => {
    if (selectedItem?.id === item.id || selectedItem?.code === item.code) {
      setSelectedItem(null);
    } else {
      if (item.minOrder && subtotal < item.minOrder) {
        dialog.alert(
          t('error_2') || 'Không đủ điều kiện',
          (t('voucherSubtotalNotMet') || 'Voucher yêu cầu đơn hàng từ {amount}.').replace(
            '{amount}',
            formatCurrency(item.minOrder)
          )
        );
        return;
      }
      setSelectedItem(item);
    }
  };

  const handleConfirm = () => {
    applyCouponItem(selectedItem);
    router.back();
  };

  const handleRemoveVoucher = () => {
    setSelectedItem(null);
    applyCouponItem(null);
    router.back();
  };

  const currentList = couponsData[activeTab];

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Thanh điều hướng gốc iOS UINavigationBar chuẩn Liquid Glass */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitle: () => (
            <Text style={styles.navHeaderTitle} numberOfLines={1}>
              {t('selectOfferBtn') || 'Chọn Ưu Đãi'}
            </Text>
          ),
          headerTintColor: '#9C7156',
          headerRight: () => (
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsText}>{userPoints}</Text>
              <Image
                source={require('../assets/images/icon_ceramic_point.png')}
                style={styles.pointsIcon}
                contentFit="contain"
              />
            </View>
          ),
        }}
      />
      <FadingHeaderBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 54 + 10,
            paddingBottom: Math.max(insets.bottom, 16) + 120,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#9C7156']}
            tintColor="#9C7156"
          />
        }
      >
        {/* Banner thông báo quy chuẩn: Voucher chỉ sử dụng 1 lần duy nhất */}
        <View style={styles.singleUseNoticeBox}>
          <Ionicons name="sparkles" size={17} color="#9C7156" style={{ marginTop: 1 }} />
          <Text style={styles.singleUseNoticeText}>
            {t('singleUseOnlyNotice') || 'Mỗi voucher chỉ áp dụng 1 lần duy nhất cho mỗi khách hàng.'}
          </Text>
        </View>

        {/* Input Nhập Mã ưu đãi */}
        <View style={styles.inputRowContainer}>
          <View style={styles.pillInputWrapper}>
            <Ionicons name="pricetag-outline" size={18} color="#9C7156" style={styles.inputPrefixIcon} />
            <TextInput
              style={styles.pillInput}
              placeholder={t('enterOfferPlaceholder') || 'Nhập mã ưu đãi'}
              placeholderTextColor={Colors.textMuted}
              value={promoInput}
              onChangeText={setPromoInput}
              autoCapitalize="characters"
              editable={!applyingCode}
            />
            {promoInput.length > 0 && (
              <TouchableOpacity onPress={() => setPromoInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.applyPillBtn, (!promoInput.trim() || applyingCode) && { opacity: 0.5 }]}
            onPress={handleApplyPromoCode}
            disabled={!promoInput.trim() || applyingCode}
            activeOpacity={0.85}
          >
            {applyingCode ? (
              <ActivityIndicator size="small" color="#9C7156" />
            ) : (
              <Text style={styles.applyBtnText}>{t('apply') || 'Áp dụng'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Bộ lọc 3 Tabs Đồng bộ hoàn toàn với Trang Kho Quà (app/vouchers.tsx) */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'unused' && styles.tabBtnActive]}
            onPress={() => setActiveTab('unused')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'unused' && styles.tabTextActive]}>
              {t('vouchersTabUnused') || 'Chưa dùng'}{' '}
              {couponsData.unused.length > 0 ? `(${couponsData.unused.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'used' && styles.tabBtnActive]}
            onPress={() => setActiveTab('used')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'used' && styles.tabTextActive]}>
              {t('vouchersTabUsed') || 'Đã dùng'}{' '}
              {couponsData.used.length > 0 ? `(${couponsData.used.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'expired' && styles.tabBtnActive]}
            onPress={() => setActiveTab('expired')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'expired' && styles.tabTextActive]}>
              {t('vouchersTabExpired') || 'Hết hạn'}{' '}
              {couponsData.expired.length > 0 ? `(${couponsData.expired.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Danh sách Voucher */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#9C7156" />
            <Text style={styles.loadingText}>
              {t('loadingVouchersVault') || 'Đang tải kho quà...'}
            </Text>
          </View>
        ) : currentList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="gift-outline" size={32} color="#9C7156" />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'unused'
                ? t('vouchersEmptyUnusedTitle') || 'Kho quà đang trống'
                : activeTab === 'used'
                ? t('vouchersEmptyUsedTitle') || 'Chưa có voucher nào đã dùng'
                : t('vouchersEmptyExpiredTitle') || 'Không có voucher hết hạn'}
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === 'unused'
                ? t('vouchersEmptyUnusedDesc') || 'Các mã ưu đãi mới từ Tiệm Nhà Gốm sẽ xuất hiện tại đây khi có chương trình.'
                : activeTab === 'used'
                ? t('vouchersEmptyUsedDesc') || 'Lịch sử sử dụng voucher của bạn sẽ được hiển thị đầy đủ tại đây.'
                : 'Các voucher hết thời hạn áp dụng sẽ được lưu giữ tại đây.'}
            </Text>
          </View>
        ) : (
          currentList.map((item) => {
            const isSelected = selectedItem?.id === item.id || selectedItem?.code === item.code;
            const isApplicable = activeTab === 'unused' && (!item.minOrder || subtotal >= item.minOrder);
            const isUsed = activeTab === 'used';
            const isExpired = activeTab === 'expired';
            const expiryInfo = getExpiryInfo(item.expiryDate);

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.voucherCard,
                  isSelected && styles.voucherCardSelected,
                  (isUsed || isExpired) && styles.voucherCardDisabled,
                  activeTab === 'unused' && !isApplicable && { opacity: 0.55 },
                ]}
                onPress={() => {
                  if (activeTab === 'unused') {
                    handleToggleItem(item);
                  } else if (isUsed) {
                    dialog.alert(
                      t('notice') || 'Thông báo',
                      t('voucherAlreadyUsed') || 'Bạn đã sử dụng mã giảm giá này cho một đơn hàng trước đó.'
                    );
                  } else {
                    dialog.alert(
                      t('notice') || 'Thông báo',
                      t('voucherExpiredAlert') || 'Mã giảm giá này đã hết hạn sử dụng.'
                    );
                  }
                }}
                activeOpacity={activeTab === 'unused' ? 0.85 : 0.95}
              >
                {/* Logo tròn thương hiệu Tiệm Nhà Gốm đồng bộ 100% với Kho Quà */}
                <View style={styles.logoCircle}>
                  <Image
                    source={require('../assets/images/logo.webp')}
                    style={styles.logoImage}
                    contentFit="contain"
                  />
                </View>

                {/* Thông tin Voucher */}
                <View style={styles.voucherInfo}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[
                        styles.voucherTitle,
                        (isUsed || isExpired) && { color: Colors.textMuted || '#888888' },
                      ]}
                      numberOfLines={2}
                    >
                      {item.name ? item.name.toUpperCase() : item.code}
                    </Text>
                  </View>

                  {/* Huy hiệu 1 lần duy nhất */}
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.singleBadgePill,
                        isUsed && styles.usedBadgePill,
                        isExpired && styles.expiredBadgePill,
                      ]}
                    >
                      <Ionicons
                        name={isUsed ? 'checkmark-circle-outline' : isExpired ? 'time-outline' : 'sparkles-outline'}
                        size={11}
                        color={isUsed ? '#888888' : isExpired ? '#999999' : '#9C7156'}
                        style={{ marginRight: 3 }}
                      />
                      <Text
                        style={[
                          styles.singleBadgeText,
                          isUsed && { color: '#888888' },
                          isExpired && { color: '#999999' },
                        ]}
                      >
                        {isUsed
                          ? t('usedStatus') || 'Đã sử dụng'
                          : isExpired
                          ? t('vouchersTabExpired') || 'Hết hạn'
                          : t('singleUseBadge') || '1 lần duy nhất'}
                      </Text>
                    </View>

                    {item.minOrder && item.minOrder > 0 ? (
                      <Text style={styles.voucherMinSpend}>
                        {t('minSpendFrom') || 'Đơn từ'} {formatCurrency(item.minOrder)}
                      </Text>
                    ) : null}
                  </View>

                  {/* Trạng thái hạn sử dụng */}
                  <Text
                    style={[
                      styles.voucherExpiry,
                      {
                        color: isUsed || isExpired
                          ? Colors.textMuted || '#888888'
                          : expiryInfo.isUrgent
                          ? '#E53935'
                          : Colors.textMuted || '#71717A',
                        fontWeight: (!isUsed && !isExpired && expiryInfo.isUrgent) ? '600' : '400',
                      },
                    ]}
                  >
                    {isUsed
                      ? 'Đã áp dụng cho đơn hàng trước đó'
                      : isExpired
                      ? expiryInfo.dateStr ? `Hết hạn ngày ${expiryInfo.dateStr}` : 'Đã hết hạn sử dụng'
                      : expiryInfo.text}
                  </Text>
                </View>

                {/* Nút Checkbox chọn voucher (Chỉ hiển thị ở tab Chưa dùng) */}
                {activeTab === 'unused' ? (
                  <View style={[styles.checkboxBox, isSelected && styles.checkboxBoxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </View>
                ) : (
                  <View style={styles.lockBox}>
                    <Ionicons
                      name={isUsed ? 'checkmark-done-circle-outline' : 'close-circle-outline'}
                      size={20}
                      color={Colors.textMuted || '#999999'}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Khối Xác nhận dính chân trang */}
      <View style={[styles.bottomStickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.bottomBarRow}>
          {appliedCouponItem || selectedItem ? (
            <TouchableOpacity
              style={styles.removePillBtn}
              onPress={handleRemoveVoucher}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={17} color={Colors.error || '#DC2626'} />
              <Text style={styles.removeBtnText}>{t('removeVoucher') || 'Bỏ chọn'}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.confirmPillBtn, !selectedItem && !appliedCouponItem && styles.confirmPillBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.88}
          >
            <Text style={styles.confirmBtnText}>
              {selectedItem
                ? `${t('apply') || 'Áp dụng'} (${selectedItem.code})`
                : t('confirmBtn') || 'Xác nhận'}
            </Text>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    navHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
      letterSpacing: 0.3,
    },
    pointsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      flexShrink: 0,
    },
    pointsText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#9C7156',
    },
    pointsIcon: {
      width: 18,
      height: 18,
    },
    scrollContent: {
      paddingHorizontal: 16,
      gap: 12,
    },
    singleUseNoticeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    singleUseNoticeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: '#9C7156',
      fontWeight: '600',
      flex: 1,
      lineHeight: 18,
    },
    inputRowContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 2,
    },
    pillInputWrapper: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: Colors.cardBackground,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 4,
      elevation: isDark ? 0 : 1,
    },
    inputPrefixIcon: {
      marginRight: 2,
    },
    pillInput: {
      flex: 1,
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    applyPillBtn: {
      height: 52,
      paddingHorizontal: 22,
      borderRadius: 26,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: 1.2,
      borderColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 4,
      elevation: isDark ? 0 : 2,
    },
    applyBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#9C7156',
    },
    tabContainer: {
      flexDirection: 'row',
      gap: 8,
      marginVertical: 4,
    },
    tabBtn: {
      flex: 1,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.cardBackground,
      borderWidth: 1.2,
      borderColor: isDark ? '#242424' : '#E8E1D8',
    },
    tabBtnActive: {
      borderColor: '#9C7156',
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
    },
    tabText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: Colors.textSecondary,
    },
    tabTextActive: {
      color: '#9C7156',
      fontWeight: '700',
    },
    voucherCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    voucherCardSelected: {
      borderColor: '#9C7156',
      borderWidth: 1.5,
      backgroundColor: isDark ? '#1A1817' : '#FFFCFA',
    },
    voucherCardDisabled: {
      opacity: 0.65,
    },
    logoCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      borderWidth: 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      overflow: 'hidden',
    },
    logoImage: {
      width: 32,
      height: 32,
    },
    voucherInfo: {
      flex: 1,
      marginRight: 10,
    },
    titleRow: {
      marginBottom: 3,
    },
    voucherTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 18,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginVertical: 3,
    },
    singleBadgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#261F1A' : '#F6F0EA',
      paddingHorizontal: 8,
      paddingVertical: 2.5,
      borderRadius: 12,
      borderWidth: 0.8,
      borderColor: isDark ? '#3D2B22' : '#E8CCB2',
    },
    usedBadgePill: {
      backgroundColor: isDark ? '#202020' : '#F0ECE6',
      borderColor: isDark ? '#333333' : '#E0DCD5',
    },
    expiredBadgePill: {
      backgroundColor: isDark ? '#202020' : '#F0ECE6',
      borderColor: isDark ? '#333333' : '#E0DCD5',
    },
    singleBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      fontWeight: '600',
      color: '#9C7156',
    },
    voucherMinSpend: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: '#9C7156',
      fontWeight: '600',
    },
    voucherExpiry: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted || '#71717A',
      marginTop: 2,
    },
    checkboxBox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: isDark ? '#3E3E3E' : '#C7BFB5',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxBoxSelected: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    lockBox: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingContainer: {
      paddingVertical: 50,
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
    },
    emptyContainer: {
      paddingVertical: 50,
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    bottomStickyBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.background,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 0,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 6,
      elevation: isDark ? 0 : 3,
    },
    bottomBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    removePillBtn: {
      height: 52,
      paddingHorizontal: 18,
      borderRadius: 26,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: 1.2,
      borderColor: isDark ? '#333333' : '#E8E1D8',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    removeBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: Colors.error || '#DC2626',
    },
    confirmPillBtn: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    confirmPillBtnDisabled: {
      opacity: 0.85,
    },
    confirmBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
