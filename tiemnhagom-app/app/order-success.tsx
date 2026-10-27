// app/order-success.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlass } from '../src/components/LiquidGlass';
import { useThemeColor, checkIsDark, Typography, Spacing } from '../src/constants/theme';
import { formatCurrency } from '../src/utils/format';
import { useSettings } from '../src/context/SettingsContext';

export default function OrderSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = checkIsDark(Colors);
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const params = useLocalSearchParams<{
    orderCode: string;
    totalAmount: string;
    customerName: string;
    paymentMethod: string;
  }>();

  const [savingQr, setSavingQr] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const orderCode = params.orderCode || 'TNG-000000';
  const totalAmount = Number(params.totalAmount) || 0;
  const isBanking = params.paymentMethod === 'banking';

  // Thông tin chuyển khoản chuẩn của Tiệm Nhà Gốm (HỘ KINH DOANH TIỆM NHÀ GỐM)
  const BANK_ID = '970436'; // Vietcombank
  const ACCOUNT_NO = '1059447798';
  const ACCOUNT_NAME = 'HO KINH DOANH TIEM NHA GOM';
  const BANK_NAME = 'Vietcombank (VCB)';

  // Link VietQR tự động khớp với hệ thống Web
  const vietQrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${totalAmount}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      Clipboard.setString(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      Alert.alert(t('notification'), `${t('copiedShort')}: ${text}`);
    }
  };

  // Tính năng 1: Lưu ảnh mã QR vào thư viện ảnh điện thoại
  const handleSaveQR = async () => {
    if (savingQr) return;
    try {
      setSavingQr(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('qrPermissionTitle'), t('qrPermissionDesc'));
        return;
      }

      const fileUri = `${FileSystem.cacheDirectory}vietqr-${orderCode}.png`;
      const downloadRes = await FileSystem.downloadAsync(vietQrUrl, fileUri);

      if (downloadRes.status === 200) {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(t('qrSavedSuccessTitle'), t('qrSavedSuccessDesc'));
      } else {
        throw new Error('Download failed');
      }
    } catch (err: any) {
      console.warn('Lỗi lưu mã QR:', err);
      Alert.alert(t('qrSaveFailedTitle'), t('qrSaveFailedDesc'));
    } finally {
      setSavingQr(false);
    }
  };

  // Tính năng 2: Mở ứng dụng ngân hàng hoặc danh sách app thanh toán
  const handleOpenBankingApp = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const vcbScheme = 'vietcombank://';
      const canOpenVCB = await Linking.canOpenURL(vcbScheme);

      if (canOpenVCB) {
        await Linking.openURL(vcbScheme);
        return;
      }

      Clipboard.setString(ACCOUNT_NO);
      Alert.alert(
        t('bankingAppGuideTitle'),
        t('bankingAppGuideDesc'),
        [
          {
            text: t('copyAccountNumberAction'),
            onPress: () => copyToClipboard(ACCOUNT_NO, 'stk'),
          },
          {
            text: t('understoodAction'),
            style: 'cancel',
          },
        ]
      );
    } catch (err) {
      console.warn('Lỗi mở app ngân hàng:', err);
    }
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: Math.max(insets.bottom, 20) + 110,
          },
        ]}
      >
        {/* Success Icon chuẩn màu Nâu Đất Nung #9C7156 */}
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-circle" size={72} color="#9C7156" />
        </View>

        <Text style={styles.title}>{t('orderSuccessTitle')}</Text>
        <Text style={styles.subtitle}>{t('orderSuccessDesc')}</Text>

        {/* Order Details Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('orderCodeText')}</Text>
            <Text style={styles.orderCode} numberOfLines={1} ellipsizeMode="tail">
              {orderCode}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('orderTotal')}</Text>
            <Text style={styles.price}>{formatCurrency(totalAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('paymentMethod')}</Text>
            <Text style={styles.value}>
              {isBanking ? t('paymentTransfer') : t('paymentCOD')}
            </Text>
          </View>
        </View>

        {/* Bank Transfer QR section if banking */}
        {isBanking && (
          <View style={styles.bankingCard}>
            <Text style={styles.bankingTitle}>{t('bankingInfoTitle')}</Text>
            <Text style={styles.bankingSubtitle}>{t('bankingInfoSubtitle')}</Text>

            <View style={styles.qrContainer}>
              <Image source={{ uri: vietQrUrl }} style={styles.qrImage} contentFit="contain" />
            </View>

            {/* Hàng nút thao tác tiện lợi: Lưu QR & Mở App Ngân Hàng */}
            <View style={styles.qrActionRow}>
              <TouchableOpacity
                style={styles.qrActionBtn}
                onPress={handleSaveQR}
                activeOpacity={0.82}
                disabled={savingQr}
              >
                {savingQr ? (
                  <ActivityIndicator size="small" color="#9C7156" />
                ) : (
                  <Ionicons name="download-outline" size={16} color="#9C7156" />
                )}
                <Text style={styles.qrActionBtnText} numberOfLines={1}>
                  {savingQr ? t('savingQrAction') : t('saveQrAction')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.qrActionBtn, styles.qrActionBtnPrimary]}
                onPress={handleOpenBankingApp}
                activeOpacity={0.82}
              >
                <Ionicons name="phone-portrait-outline" size={16} color="#FFFFFF" />
                <Text style={styles.qrActionBtnTextPrimary} numberOfLines={1}>
                  {t('openBankingAppAction')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bankInfoBox}>
              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>
                  • {t('bankNameLabel')} <Text style={styles.bold}>{BANK_NAME}</Text>
                </Text>
              </View>

              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>
                  • {t('bankAccountLabel')}{' '}
                  <Text style={[styles.bold, { color: '#9C7156', fontSize: 13 }]}>{ACCOUNT_NO}</Text>
                </Text>
                <TouchableOpacity
                  style={styles.inlineCopyBtn}
                  onPress={() => copyToClipboard(ACCOUNT_NO, 'stk')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={copiedField === 'stk' ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color="#9C7156"
                  />
                  <Text style={styles.inlineCopyText}>
                    {copiedField === 'stk' ? t('copiedShort') : t('copyAction')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>
                  • {t('bankOwnerLabel')} <Text style={styles.bold}>HỘ KINH DOANH TIỆM NHÀ GỐM</Text>
                </Text>
              </View>

              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>
                  • {t('transferContentLabel')} <Text style={styles.boldHighlight}>{orderCode}</Text>
                </Text>
                <TouchableOpacity
                  style={styles.inlineCopyBtn}
                  onPress={() => copyToClipboard(orderCode, 'code')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={copiedField === 'code' ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color="#9C7156"
                  />
                  <Text style={styles.inlineCopyText}>
                    {copiedField === 'code' ? t('copiedShort') : t('copyAction')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={20} color="#9C7156" />
          <Text style={styles.noticeText}>{t('orderNoticeText')}</Text>
        </View>
      </ScrollView>

      {/* Thanh hành động đáy nổi dạng viên thuốc bọc LiquidGlass chuẩn hệ thống iOS */}
      <View
        style={[styles.bottomBarWrapper, { bottom: Math.max(insets.bottom, 14) }]}
        pointerEvents="box-none"
      >
        <LiquidGlass
          style={styles.bottomBar}
          interactive={true}
          effect="regular"
          isDark={isDark}
        >
          <View style={styles.bottomBarRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.replace('/(tabs)')}
              activeOpacity={0.82}
            >
              <Text
                style={styles.secondaryBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t('continueShopping')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace('/orders')}
              activeOpacity={0.88}
            >
              <Ionicons name="receipt-outline" size={17} color="#FFFFFF" />
              <Text
                style={styles.primaryBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t('trackOrder')}
              </Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </LiquidGlass>
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
    scrollContent: {
      paddingHorizontal: Spacing.lg,
      alignItems: 'center',
    },
    iconCircle: {
      marginBottom: Spacing.md,
    },
    title: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.xxl,
      fontWeight: '800',
      color: Colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: Spacing.xs,
      marginBottom: Spacing.lg,
      maxWidth: 320,
    },
    card: {
      width: '100%',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: Spacing.lg,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : Colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
      marginBottom: Spacing.md,
      gap: Spacing.sm,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: Colors.textSecondary,
      flex: 1,
      marginRight: 8,
    },
    orderCode: {
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
      color: Colors.textPrimary,
      letterSpacing: 0.4,
      flexShrink: 0,
    },
    price: {
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
      color: '#9C7156',
      flexShrink: 0,
    },
    value: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
      color: Colors.textPrimary,
      flexShrink: 0,
    },
    bankingCard: {
      width: '100%',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: Spacing.lg,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : Colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
      marginBottom: Spacing.md,
      alignItems: 'center',
    },
    bankingTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.base,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    bankingSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.xs,
      color: Colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: Spacing.md,
    },
    qrContainer: {
      width: 200,
      height: 200,
      backgroundColor: '#FFFFFF',
      padding: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E8E1D8',
      marginBottom: Spacing.md,
    },
    qrImage: {
      width: '100%',
      height: '100%',
    },
    qrActionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: Spacing.md,
      width: '100%',
      justifyContent: 'center',
    },
    qrActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
      borderRadius: 22,
      borderWidth: 1.2,
      borderColor: '#9C7156',
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      gap: 6,
      paddingHorizontal: 12,
    },
    qrActionBtnPrimary: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    qrActionBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    qrActionBtnTextPrimary: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.xs,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    bankInfoBox: {
      width: '100%',
      backgroundColor: Colors.surface,
      padding: Spacing.md,
      borderRadius: 16,
      gap: 8,
    },
    bankInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    inlineCopyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8CCB2',
    },
    inlineCopyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      fontWeight: '700',
      color: '#9C7156',
    },
    bankInfoText: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.xs,
      color: Colors.textPrimary,
      flexShrink: 1,
      marginRight: 8,
    },
    bold: {
      fontWeight: '700',
    },
    boldHighlight: {
      fontWeight: '800',
      color: '#9C7156',
      letterSpacing: 0.3,
    },
    noticeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2',
      padding: Spacing.md,
      borderRadius: 16,
      gap: Spacing.sm,
      width: '100%',
      marginBottom: Spacing.xl,
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8CCB2',
    },
    noticeText: {
      fontFamily: 'ElleGaborStd',
      flex: 1,
      fontSize: Typography.fontSize.xs,
      color: Colors.textSecondary,
      lineHeight: 18,
    },
    bottomBarWrapper: {
      position: 'absolute',
      left: 14,
      right: 14,
      zIndex: 100,
    },
    bottomBar: {
      borderRadius: 36,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.14,
      shadowRadius: 18,
      elevation: 10,
    },
    bottomBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    secondaryBtn: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(156,113,86,0.10)',
      borderWidth: 1.2,
      borderColor: '#9C7156',
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    secondaryBtnText: {
      fontFamily: 'ElleGaborStd',
      color: isDark ? '#E8CCB2' : '#9C7156',
      fontWeight: '700',
      fontSize: 14,
    },
    primaryBtn: {
      flex: 1.25,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      height: 50,
      borderRadius: 25,
      gap: 6,
      paddingHorizontal: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryBtnText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14.5,
    },
  });
