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
  Platform,
  Alert,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, useThemeColor, checkIsDark, Typography, Spacing, BorderRadius, Shadows } from '../src/constants/theme';
import { formatCurrency } from '../src/utils/format';
import { useSettings } from '../src/context/SettingsContext';

export default function OrderSuccessScreen() {
  const router = useRouter();
  const themeColors = useThemeColor();
  const isDark = checkIsDark(themeColors);
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
  const BRANCH = 'VCB Tân Bình - PGD ETown';

  // Link VietQR tự động khớp với hệ thống Web
  const vietQrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${totalAmount}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      Clipboard.setString(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      Alert.alert('Thông báo', `Đã sao chép: ${text}`);
    }
  };

  // Tính năng 1: Lưu ảnh mã QR vào thư viện ảnh điện thoại
  const handleSaveQR = async () => {
    if (savingQr) return;
    try {
      setSavingQr(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Yêu cầu quyền truy cập',
          'Vui lòng cấp quyền truy cập Thư viện ảnh trong Cài đặt máy để lưu mã QR thanh toán.'
        );
        return;
      }

      const fileUri = `${FileSystem.cacheDirectory}vietqr-${orderCode}.png`;
      const downloadRes = await FileSystem.downloadAsync(vietQrUrl, fileUri);

      if (downloadRes.status === 200) {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
        Alert.alert(
          'Đã lưu thành công! 🎉',
          'Mã QR thanh toán đã được lưu vào Bộ sưu tập ảnh. Bạn có thể mở ứng dụng Ngân hàng và chọn Quét QR từ ảnh.'
        );
      } else {
        throw new Error('Tải ảnh QR thất bại');
      }
    } catch (err: any) {
      console.warn('Lỗi lưu mã QR:', err);
      Alert.alert('Không thể lưu ảnh', 'Đã có lỗi xảy ra khi lưu mã QR vào máy. Vui lòng thử chụp lại màn hình.');
    } finally {
      setSavingQr(false);
    }
  };

  // Tính năng 2: Mở ứng dụng ngân hàng hoặc danh sách app thanh toán
  const handleOpenBankingApp = async () => {
    try {
      // Deeplink mở trực tiếp app Vietcombank Digibank hoặc danh sách app ngân hàng
      const vcbScheme = 'vietcombank://';
      const canOpenVCB = await Linking.canOpenURL(vcbScheme);

      if (canOpenVCB) {
        await Linking.openURL(vcbScheme);
        return;
      }

      // Nếu không có scheme riêng, mở app ngân hàng mặc định hoặc hướng dẫn
      Alert.alert(
        'Thanh toán Ngân hàng',
        'Đã sao chép số tài khoản & nội dung đơn hàng. Vui lòng mở ứng dụng ngân hàng trên máy bạn để tiến hành quét QR hoặc dán thông tin chuyển khoản.',
        [
          {
            text: 'Sao chép STK',
            onPress: () => copyToClipboard(ACCOUNT_NO, 'stk'),
          },
          {
            text: 'Đã hiểu',
            style: 'cancel',
          },
        ]
      );
    } catch (err) {
      console.warn('Lỗi mở app ngân hàng:', err);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Success Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-circle" size={68} color={Colors.success} />
        </View>

        <Text style={styles.title}>{t('orderSuccessTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('orderSuccessDesc')}
        </Text>

        {/* Order Details Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('orderCodeText')}</Text>
            <Text style={styles.orderCode}>{orderCode}</Text>
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
            <Text style={styles.bankingSubtitle}>
              {t('bankingInfoSubtitle')}
            </Text>

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
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="download-outline" size={16} color={Colors.primary} />
                )}
                <Text style={styles.qrActionBtnText}>
                  {savingQr ? 'Đang lưu...' : 'Lưu ảnh QR'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.qrActionBtn, styles.qrActionBtnPrimary]}
                onPress={handleOpenBankingApp}
                activeOpacity={0.82}
              >
                <Ionicons name="phone-portrait-outline" size={16} color="#FFFFFF" />
                <Text style={styles.qrActionBtnTextPrimary}>Mở App Ngân hàng</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bankInfoBox}>
              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>• {t('bankNameLabel')} <Text style={styles.bold}>{BANK_NAME}</Text></Text>
              </View>

              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>• {t('bankAccountLabel')} <Text style={[styles.bold, { color: Colors.primaryDark, fontSize: 13 }]}>{ACCOUNT_NO}</Text></Text>
                <TouchableOpacity
                  style={styles.inlineCopyBtn}
                  onPress={() => copyToClipboard(ACCOUNT_NO, 'stk')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={copiedField === 'stk' ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color={copiedField === 'stk' ? Colors.success : Colors.primary}
                  />
                  <Text style={[styles.inlineCopyText, copiedField === 'stk' && { color: Colors.success }]}>
                    {copiedField === 'stk' ? 'Đã chép' : 'Sao chép'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>• {t('bankOwnerLabel')} <Text style={styles.bold}>HỘ KINH DOANH TIỆM NHÀ GỐM</Text></Text>
              </View>

              <View style={styles.bankInfoRow}>
                <Text style={styles.bankInfoText}>• {t('transferContentLabel')} <Text style={styles.boldHighlight}>{orderCode}</Text></Text>
                <TouchableOpacity
                  style={styles.inlineCopyBtn}
                  onPress={() => copyToClipboard(orderCode, 'code')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={copiedField === 'code' ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color={copiedField === 'code' ? Colors.success : Colors.primary}
                  />
                  <Text style={[styles.inlineCopyText, copiedField === 'code' && { color: Colors.success }]}>
                    {copiedField === 'code' ? 'Đã chép' : 'Sao chép'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.noticeText}>
            {t('orderNoticeText')}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsGroup}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/orders')}
            activeOpacity={0.88}
          >
            <Ionicons name="receipt-outline" size={18} color={Colors.textInverse} />
            <Text style={styles.primaryBtnText}>{t('trackOrder')}</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>{t('continueShopping')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
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
    maxWidth: 300,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
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
  },
  orderCode: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.base,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  price: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.base,
    fontWeight: '800',
    color: Colors.primary,
  },
  value: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  bankingCard: {
    width: '100%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
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
    borderColor: Colors.border,
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
    height: 42,
    borderRadius: 21,
    borderWidth: 1.2,
    borderColor: '#E8CCB2',
    backgroundColor: '#FFFFFF',
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
    color: '#9C7156',
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
    borderRadius: 14,
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
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
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
  },
  bold: {
    fontWeight: '700',
  },
  boldHighlight: {
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    padding: Spacing.md,
    borderRadius: 16,
    gap: Spacing.sm,
    width: '100%',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noticeText: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    fontSize: Typography.fontSize.xs,
    color: '#8A6D3B',
    lineHeight: 18,
  },
  actionsGroup: {
    width: '100%',
    gap: Spacing.md,
  },
  primaryBtn: {
    backgroundColor: '#111111',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 52,
    borderRadius: 26,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: Typography.fontSize.base,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.2,
    borderColor: '#E4E4E7',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: Typography.fontSize.sm,
  },
});
