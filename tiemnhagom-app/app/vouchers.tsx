import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  Clipboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { AnimatedCenterModal } from '../src/components/AnimatedCenterModal';
import { ScalePressable } from '../src/components/ScalePressable';
import { useThemeColor, Typography } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { useDialog } from '../src/context/DialogContext';
import { useSettings } from '../src/context/SettingsContext';
import { getAllUserCoupons, CategorizedCoupons, CouponItem } from '../src/services/couponService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabType = 'unused' | 'used' | 'expired';

export default function VouchersScreen() {
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user } = useAuth();
  const dialog = useDialog();
  const { t } = useSettings();

  const [activeTab, setActiveTab] = useState<TabType>('unused');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [couponsData, setCouponsData] = useState<CategorizedCoupons>({
    unused: [],
    used: [],
    expired: [],
  });

  // Modal xem chi tiết voucher
  const [selectedVoucher, setSelectedVoucher] = useState<CouponItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getAllUserCoupons(user?.uid);
      setCouponsData(data);
    } catch (error) {
      console.warn('Lỗi tải danh sách voucher:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2500);
  };

  const handleUseNow = (voucher: CouponItem) => {
    Clipboard.setString(voucher.code);
    setModalVisible(false);
    dialog.alert(
      t('voucherCopiedTitle'),
      t('voucherCopiedMsg', { code: voucher.code })
    );
    router.push('/(tabs)/products' as any);
  };

  const getExpiryInfo = (expiryDate?: string) => {
    if (!expiryDate) return { text: t('unlimitedTime'), isUrgent: false, dateStr: '' };
    try {
      const d = new Date(expiryDate);
      if (isNaN(d.getTime())) return { text: `${t('expiryDateLabel')}: ${expiryDate}`, isUrgent: false, dateStr: expiryDate };

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
          text: t('expiresInDays', { days: diffDays }),
          isUrgent: true,
          dateStr,
        };
      } else if (diffDays === 0) {
        return {
          text: t('expiresToday'),
          isUrgent: true,
          dateStr,
        };
      }
      return {
        text: t('expiresAt', { date: dateStr }),
        isUrgent: false,
        dateStr,
      };
    } catch {
      return { text: t('expiresAt', { date: expiryDate }), isUrgent: false, dateStr: expiryDate };
    }
  };

  const formatExpiryDisplay = (expiryDate?: string) => {
    return getExpiryInfo(expiryDate).text;
  };

  const currentList = couponsData[activeTab];

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: Colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />

      {/* Header chuẩn app Tiệm Nhà Gốm */}
      <Header
        title={t('giftVault')}
        showBack={true}
        showSearch={false}
        showCart={false}
      />

      {/* Bộ lọc 3 Tabs (Chưa dùng, Đã dùng, Hết hạn) đúng theo ảnh mẫu */}
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === 'unused' ? styles.tabPillActive : styles.tabPillInactive,
            ]}
            onPress={() => setActiveTab('unused')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'unused' ? styles.tabTextActive : styles.tabTextInactive,
              ]}
            >
              {t('vouchersTabUnused')} {couponsData.unused.length > 0 ? `(${couponsData.unused.length})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === 'used' ? styles.tabPillActive : styles.tabPillInactive,
            ]}
            onPress={() => setActiveTab('used')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'used' ? styles.tabTextActive : styles.tabTextInactive,
              ]}
            >
              {t('vouchersTabUsed')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === 'expired' ? styles.tabPillActive : styles.tabPillInactive,
            ]}
            onPress={() => setActiveTab('expired')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'expired' ? styles.tabTextActive : styles.tabTextInactive,
              ]}
            >
              {t('vouchersTabExpired')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Danh sách Voucher */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9C7156" />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>
            {t('loadingVouchersVault')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#9C7156']}
              tintColor="#9C7156"
            />
          }
        >
          {currentList.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="gift-outline" size={38} color="#9C7156" />
              </View>
              <Text style={[styles.emptyTitle, { color: Colors.textPrimary }]}>
                {activeTab === 'unused'
                  ? t('vouchersEmptyUnusedTitle')
                  : activeTab === 'used'
                  ? t('vouchersEmptyUsedTitle')
                  : t('vouchersEmptyExpiredTitle')}
              </Text>
              <Text style={[styles.emptyDesc, { color: Colors.textSecondary }]}>
                {activeTab === 'unused'
                  ? t('vouchersEmptyUnusedDesc')
                  : t('vouchersEmptyUsedDesc')}
              </Text>

              {activeTab === 'unused' && (
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => router.push('/(tabs)/deals')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyActionBtnText}>{t('exploreDealsAction')}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            currentList.map((item) => {
              const isExpired = activeTab === 'expired';
              const isUsed = activeTab === 'used';
              const expiryInfo = getExpiryInfo(item.expiryDate);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.voucherCard,
                    {
                      backgroundColor: Colors.cardBackground,
                      opacity: isExpired || isUsed ? 0.65 : 1,
                    },
                  ]}
                  activeOpacity={0.88}
                  onPress={() => {
                    router.push({
                      pathname: '/voucher-detail',
                      params: { voucher: JSON.stringify(item) },
                    });
                  }}
                >
                  <View style={styles.cardContentRow}>
                    {/* Logo tròn thương hiệu Tiệm Nhà Gốm */}
                    <View style={styles.logoCircle}>
                      <Image
                        source={require('../assets/images/logo.webp')}
                        style={styles.logoImage}
                        contentFit="contain"
                      />
                    </View>

                    {/* Tiêu đề & Hạn sử dụng */}
                    <View style={styles.cardMetaWrap}>
                      <Text
                        style={[
                          styles.voucherTitle,
                          { color: isExpired ? (Colors.textMuted || '#888888') : Colors.textPrimary },
                        ]}
                        numberOfLines={2}
                      >
                        {item.name.toUpperCase()}
                      </Text>

                      <Text
                        style={[
                          styles.voucherExpiry,
                          {
                            color: isExpired || isUsed
                              ? (Colors.textMuted || '#888888')
                              : expiryInfo.isUrgent
                              ? '#E53935'
                              : (Colors.textMuted || '#71717A'),
                            fontWeight: (!isExpired && !isUsed && expiryInfo.isUrgent) ? '600' : '400',
                          },
                        ]}
                      >
                        {isUsed
                          ? t('usedStatus')
                          : isExpired
                          ? t('expiresAt', { date: expiryInfo.dateStr || '' })
                          : expiryInfo.text}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* MODAL CHI TIẾT VOUCHER */}
      <AnimatedCenterModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        contentStyle={[styles.modalCard, { backgroundColor: Colors.cardBackground }]}
      >
        {/* Nút đóng */}
        <ScalePressable
          style={styles.modalCloseBtn}
          onPress={() => setModalVisible(false)}
          activeScale={0.9}
        >
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </ScalePressable>

        {/* Logo Tiệm Nhà Gốm lớn */}
        <View style={styles.modalLogoWrap}>
          <Image
            source={require('../assets/images/logo.webp')}
            style={styles.modalLogo}
            contentFit="contain"
          />
        </View>

        {/* Tên voucher */}
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>
          {selectedVoucher?.name}
        </Text>

        {/* Hạn sử dụng */}
        <Text style={[styles.modalExpiry, { color: Colors.textMuted }]}>
          {formatExpiryDisplay(selectedVoucher?.expiryDate)}
        </Text>

        {/* Khung mã giảm giá */}
        <View style={styles.modalCodeBox}>
          <View>
            <Text style={styles.modalCodeLabel}>{t('exclusiveVoucherCode')}</Text>
            <Text style={styles.modalCodeVal}>{selectedVoucher?.code}</Text>
          </View>

          <ScalePressable
            style={[
              styles.modalCopyBtn,
              copiedCode === selectedVoucher?.code && styles.modalCopyBtnDone,
            ]}
            onPress={() => selectedVoucher && handleCopyCode(selectedVoucher.code)}
            activeScale={0.92}
          >
            <Ionicons
              name={copiedCode === selectedVoucher?.code ? 'checkmark' : 'copy-outline'}
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.modalCopyBtnText}>
              {copiedCode === selectedVoucher?.code ? t('copiedCode') : t('copyCode')}
            </Text>
          </ScalePressable>
        </View>

        {/* Chi tiết điều kiện */}
        <View style={styles.modalDetailsList}>
          <View style={styles.modalDetailRow}>
            <Ionicons name="information-circle-outline" size={16} color="#9C7156" />
            <Text style={[styles.modalDetailText, { color: Colors.textSecondary }]}>
              {selectedVoucher?.conditions ||
                selectedVoucher?.description ||
                t('applyAtTiemNhaGom')}
            </Text>
          </View>

          {Boolean(selectedVoucher?.minOrder && selectedVoucher.minOrder > 0) && (
            <View style={styles.modalDetailRow}>
              <Ionicons name="cart-outline" size={16} color="#9C7156" />
              <Text style={[styles.modalDetailText, { color: Colors.textSecondary }]}>
                {t('minSpendFrom')}:{' '}
                {new Intl.NumberFormat('vi-VN').format(selectedVoucher?.minOrder || 0)}đ
              </Text>
            </View>
          )}

          {Boolean(selectedVoucher?.maxDiscount && selectedVoucher.maxDiscount > 0) && (
            <View style={styles.modalDetailRow}>
              <Ionicons name="pricetag-outline" size={16} color="#9C7156" />
              <Text style={[styles.modalDetailText, { color: Colors.textSecondary }]}>
                {t('maxDiscountLabel')}:{' '}
                {new Intl.NumberFormat('vi-VN').format(selectedVoucher?.maxDiscount || 0)}đ
              </Text>
            </View>
          )}
        </View>

        {/* Nút hành động */}
        {activeTab === 'unused' && (
          <ScalePressable
            style={styles.modalPrimaryBtn}
            onPress={() => selectedVoucher && handleUseNow(selectedVoucher)}
            activeScale={0.96}
          >
            <Text style={styles.modalPrimaryBtnText}>{t('useNowWhenShopping')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </ScalePressable>
        )}
      </AnimatedCenterModal>
    </SafeAreaView>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  tabsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tabPill: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FDFBF7',
    borderWidth: 1.5,
    borderColor: '#C4A482',
  },
  tabPillInactive: {
    backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#F4F4F5',
    borderWidth: 0,
  },
  tabText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
  },
  tabTextActive: {
    color: isDark ? '#E8CCB2' : '#2B2928',
    fontWeight: '700',
  },
  tabTextInactive: {
    color: isDark ? '#888888' : '#71717A',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  // Voucher Card theo chuẩn thiết kế ảnh mẫu
  voucherCard: {
    borderRadius: 18,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 1.5,
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#2E2E2E' : '#EFEAE2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 3,
    elevation: isDark ? 0 : 1,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  cardMetaWrap: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  voucherTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  voucherExpiry: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    lineHeight: 18,
  },
  // Empty State
  emptyContainer: {
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8CCB2',
  },
  emptyTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  emptyActionBtn: {
    marginTop: 10,
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 21,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.1,
    shadowRadius: 4,
    elevation: isDark ? 0 : 2,
  },
  emptyActionBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0 : 0.15,
    shadowRadius: 16,
    elevation: isDark ? 0 : 8,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F6F4EC',
    borderWidth: 1.5,
    borderColor: '#E8CCB2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    marginBottom: 14,
  },
  modalLogo: {
    width: '100%',
    height: '100%',
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  modalExpiry: {
    fontSize: 12.5,
    marginBottom: 16,
  },
  modalCodeBox: {
    width: '100%',
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
    borderRadius: 16,
    borderWidth: isDark ? 0 : 1.2,
    borderColor: isDark ? 'transparent' : '#E8CCB2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalCodeLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    fontWeight: '600',
    color: isDark ? '#E8CCB2' : '#9C7156',
    letterSpacing: 0.5,
  },
  modalCodeVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary || '#2B2928',
    letterSpacing: 0.5,
  },
  modalCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#9C7156',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  modalCopyBtnDone: {
    backgroundColor: isDark ? '#121212' : '#2B2928',
  },
  modalCopyBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalDetailsList: {
    width: '100%',
    gap: 8,
    marginBottom: 20,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  modalDetailText: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  modalPrimaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0 : 0.25,
    shadowRadius: 6,
    elevation: isDark ? 0 : 3,
  },
  modalPrimaryBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
