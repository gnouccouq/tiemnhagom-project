// src/components/VoucherSelectorModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedBottomSheetModal } from './AnimatedBottomSheetModal';
import { useThemeColor } from '../constants/theme';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { getActiveCoupons, CouponItem } from '../services/couponService';
import { formatCurrency } from '../utils/format';

interface VoucherSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectVoucher: (coupon: CouponItem | null) => void;
  selectedCouponCode: string | null;
  subtotal: number;
}

export const VoucherSelectorModal: React.FC<VoucherSelectorModalProps> = ({
  visible,
  onClose,
  onSelectVoucher,
  selectedCouponCode,
  subtotal,
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { user, userProfile } = useAuth();
  const dialog = useDialog();

  const [activeTab, setActiveTab] = useState<'vault' | 'redeem'>('vault');
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [promoInput, setPromoInput] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<CouponItem | null>(null);

  const userPoints = Number(userProfile?.points || 0);

  // Tải danh sách Voucher từ Firestore khi mở Modal
  useEffect(() => {
    if (visible) {
      let isCancelled = false;
      setLoading(true);
      getActiveCoupons(user?.uid)
        .then((items) => {
          if (!isCancelled) {
            setCoupons(items);
            // Đồng bộ voucher đang được chọn trước đó
            if (selectedCouponCode) {
              const matched = items.find((c) => c.code === selectedCouponCode || c.id === selectedCouponCode);
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
    }
  }, [visible, selectedCouponCode, user?.uid]);

  const handleApplyPromoCode = () => {
    const clean = promoInput.trim().toUpperCase();
    if (!clean) return;

    // Tìm trong danh sách hiện có
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
      // Cho phép áp dụng các mã code hệ thống nhanh
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
        dialog.alert(t('error_2') || 'Mã không hợp lệ', t('invalidCoupon') || 'Mã ưu đãi không chính xác hoặc đã hết lượt.');
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
    onSelectVoucher(selectedItem);
    onClose();
  };

  return (
    <AnimatedBottomSheetModal
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      contentStyle={styles.sheetContent}
    >
      {/* Header Modal */}
      <View style={styles.modalHeader}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.modalTitle}>{t('selectOfferBtn') || 'Chọn Ưu Đãi'}</Text>

        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>{userPoints}</Text>
          <Image
            source={require('../../assets/images/icon_ceramic_point.png')}
            style={styles.pointsIcon}
            contentFit="contain"
          />
        </View>
      </View>

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
            placeholderTextColor={isDark ? 'rgba(245, 245, 245, 0.72)' : 'rgba(43, 41, 40, 0.68)'}
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={styles.scrollView}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#9C7156" />
          </View>
        ) : coupons.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('noSavedAddressNotice') || 'Hiện chưa có mã ưu đãi khả dụng.'}</Text>
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
                {/* Logo gốm */}
                <View style={styles.voucherLogoBox}>
                  <Image
                    source={require('../../assets/images/tiemnhagom.png')}
                    style={styles.voucherLogoImg}
                    contentFit="contain"
                  />
                </View>

                {/* Nội dung voucher */}
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

                {/* Checkbox / Radio */}
                <View
                  style={[
                    styles.checkboxBox,
                    isSelected && styles.checkboxBoxSelected,
                  ]}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Nút Xác nhận chân Modal */}
      <View style={styles.modalBottomBar}>
        <TouchableOpacity
          style={styles.confirmPillBtn}
          onPress={handleConfirm}
          activeOpacity={0.88}
        >
          <Text style={styles.confirmBtnText}>{t('confirmBtn') || 'Xác nhận'}</Text>
        </TouchableOpacity>
      </View>
    </AnimatedBottomSheetModal>
  );
};

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    sheetContent: {
      maxHeight: '85%',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Math.max(Platform.OS === 'ios' ? 24 : 16, 16),
      backgroundColor: isDark ? '#000000' : '#FAF8F5',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 16,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    modalTitle: {
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
    tabContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    tabBtn: {
      flex: 1,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
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
      marginBottom: 16,
    },
    pillInputWrapper: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
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
    scrollView: {
      maxHeight: 380,
    },
    listContent: {
      paddingBottom: 16,
    },
    voucherCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
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
      paddingVertical: 30,
      alignItems: 'center',
    },
    emptyContainer: {
      paddingVertical: 30,
      alignItems: 'center',
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
    },
    modalBottomBar: {
      paddingTop: 12,
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
