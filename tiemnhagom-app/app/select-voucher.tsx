// app/select-voucher.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';
import { useCart } from '../src/context/CartContext';
import { useDialog } from '../src/context/DialogContext';
import { getActiveCoupons, CouponItem } from '../src/services/couponService';
import { formatCurrency } from '../src/utils/format';

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

  const [activeTab, setActiveTab] = useState<'vault' | 'redeem'>('vault');
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [promoInput, setPromoInput] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<CouponItem | null>(appliedCouponItem);

  const userPoints = Number(userProfile?.points || 0);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    getActiveCoupons(user?.uid)
      .then((items) => {
        if (!isCancelled) {
          setCoupons(items);
          if (appliedCoupon) {
            const matched = items.find((c) => c.code === appliedCoupon || c.id === appliedCoupon);
            if (matched) setSelectedItem(matched);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [appliedCoupon, user?.uid]);

  const handleApplyPromoCode = () => {
    const clean = promoInput.trim().toUpperCase();
    if (!clean) return;

    const matched = coupons.find((c) => c.code.toUpperCase() === clean || c.id.toUpperCase() === clean);
    if (matched) {
      if (matched.minOrder && subtotal < matched.minOrder) {
        dialog.alert(
          t('error_2') || 'Không đủ điều kiện',
          `Voucher yêu cầu đơn hàng từ ${formatCurrency(matched.minOrder)}.`
        );
        return;
      }
      setSelectedItem(matched);
      setPromoInput('');
    } else {
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
        setPromoInput('');
      } else {
        dialog.alert(
          t('error_2') || 'Mã không hợp lệ',
          t('invalidCoupon') || 'Mã ưu đãi không chính xác hoặc đã hết lượt.'
        );
      }
    }
  };

  const handleToggleItem = (item: CouponItem) => {
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
    } else {
      if (item.minOrder && subtotal < item.minOrder) {
        dialog.alert(
          t('error_2') || 'Không đủ điều kiện',
          `Voucher yêu cầu đơn hàng từ ${formatCurrency(item.minOrder)}.`
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

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header chuẩn Screenshot 4 */}
      <View style={[styles.customHeader, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{t('selectOfferBtn') || 'Chọn Ưu Đãi'}</Text>

        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>{userPoints}</Text>
          <Image
            source={require('../assets/images/icon_ceramic_point.png')}
            style={styles.pointsIcon}
            contentFit="contain"
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 54 + 10,
            paddingBottom: Math.max(insets.bottom, 16) + 100,
          },
        ]}
      >
        {/* Tabs Kho quà | Đổi ngay */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'vault' && styles.tabBtnActive]}
            onPress={() => setActiveTab('vault')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'vault' && styles.tabTextActive]}>
              {t('giftVaultTab') || 'Kho quà'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'redeem' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('redeem');
              dialog.alert(
                t('redeemNowTab') || 'Đổi ngay',
                'Tính năng đổi Điểm Gốm lấy voucher độc quyền đang được hoàn thiện và sẽ sớm ra mắt!'
              );
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'redeem' && styles.tabTextActive]}>
              {t('redeemNowTab') || 'Đổi ngay'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input Mã ưu đãi */}
        <View style={styles.inputRowContainer}>
          <View style={styles.pillInputWrapper}>
            <TextInput
              style={styles.pillInput}
              placeholder={t('enterOfferPlaceholder') || 'Nhập mã ưu đãi'}
              placeholderTextColor={Colors.textMuted}
              value={promoInput}
              onChangeText={setPromoInput}
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity
            style={[styles.applyPillBtn, !promoInput.trim() && { opacity: 0.5 }]}
            onPress={handleApplyPromoCode}
            disabled={!promoInput.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.applyBtnText}>{t('apply') || 'Áp dụng'}</Text>
          </TouchableOpacity>
        </View>

        {/* Danh sách Voucher */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#9C7156" />
          </View>
        ) : coupons.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('noSavedAddressNotice') || 'Hiện chưa có mã ưu đãi khả dụng.'}
            </Text>
          </View>
        ) : (
          coupons.map((item) => {
            const isSelected = selectedItem?.id === item.id || selectedItem?.code === item.code;
            const isApplicable = !item.minOrder || subtotal >= item.minOrder;

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.voucherCard,
                  isSelected && styles.voucherCardSelected,
                  !isApplicable && { opacity: 0.55 },
                ]}
                onPress={() => handleToggleItem(item)}
                activeOpacity={0.85}
              >
                <View style={styles.voucherLogoBox}>
                  <Image
                    source={require('../assets/images/tiemnhagom.png')}
                    style={styles.voucherLogoImg}
                    contentFit="contain"
                  />
                </View>

                <View style={styles.voucherInfo}>
                  <Text style={styles.voucherTitle} numberOfLines={2}>
                    {item.name ? item.name.toUpperCase() : item.code}
                  </Text>
                  <Text style={styles.voucherExpiry}>
                    {item.expiryDate
                      ? `${t('expiresAt') || 'Hết hạn vào'} ${item.expiryDate}`
                      : `${t('expiresInDays') || 'Hết hạn trong 30 ngày'}`}
                  </Text>
                  {item.minOrder && item.minOrder > 0 ? (
                    <Text style={styles.voucherMinSpend}>
                      Đơn tối thiểu {formatCurrency(item.minOrder)}
                    </Text>
                  ) : null}
                </View>

                <View style={[styles.checkboxBox, isSelected && styles.checkboxBoxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Nút Xác nhận dính chân trang */}
      <View style={[styles.bottomStickyBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TouchableOpacity
          style={styles.confirmPillBtn}
          onPress={handleConfirm}
          activeOpacity={0.88}
        >
          <Text style={styles.confirmBtnText}>{t('confirmBtn') || 'Xác nhận'}</Text>
        </TouchableOpacity>
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
    customHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      backgroundColor: Colors.background,
      borderBottomWidth: 0,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#121212' : Colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 4,
      elevation: isDark ? 0 : 2,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    pointsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
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
    tabContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 4,
    },
    tabBtn: {
      flex: 1,
      height: 42,
      borderRadius: 21,
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
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textSecondary,
    },
    tabTextActive: {
      color: isDark ? '#F5F5F5' : '#231B15',
      fontWeight: '700',
    },
    inputRowContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 4,
    },
    pillInputWrapper: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: Colors.cardBackground,
      borderWidth: 1,
      borderColor: isDark ? '#242424' : '#E8E1D8',
      paddingHorizontal: 18,
      justifyContent: 'center',
    },
    pillInput: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textPrimary,
    },
    applyPillBtn: {
      paddingHorizontal: 18,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#9C7156',
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
    voucherLogoBox: {
      width: 50,
      height: 50,
      borderRadius: 14,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      padding: 6,
    },
    voucherLogoImg: {
      width: '100%',
      height: '100%',
    },
    voucherInfo: {
      flex: 1,
      marginRight: 10,
    },
    voucherTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 18,
      marginBottom: 4,
    },
    voucherExpiry: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
    },
    voucherMinSpend: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: '#9C7156',
      marginTop: 2,
    },
    checkboxBox: {
      width: 24,
      height: 24,
      borderRadius: 6,
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
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
    },
    bottomStickyBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.background,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 0,
    },
    confirmPillBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    confirmBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
