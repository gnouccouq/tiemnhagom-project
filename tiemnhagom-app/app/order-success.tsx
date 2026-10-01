// app/order-success.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../src/constants/theme';
import { formatCurrency } from '../src/utils/format';

export default function OrderSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orderCode: string;
    totalAmount: string;
    customerName: string;
    paymentMethod: string;
  }>();

  const orderCode = params.orderCode || 'TNG-000000';
  const totalAmount = Number(params.totalAmount) || 0;
  const isBanking = params.paymentMethod === 'banking';

  // Link VietQR động của Tiệm Nhà Gốm
  // Ngân hàng MB Bank (970422) hoặc Techcombank
  const vietQrUrl = `https://img.vietqr.io/image/970422-0909123456-compact2.png?amount=${totalAmount}&addInfo=${orderCode}&accountName=TIEM%20NHA%20GOM`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Success Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-circle" size={68} color={Colors.success} />
        </View>

        <Text style={styles.title}>Đặt Hàng Thành Công!</Text>
        <Text style={styles.subtitle}>
          Cảm ơn bạn đã tin yêu và lựa chọn sản phẩm gốm mộc tại Tiệm Nhà Gốm.
        </Text>

        {/* Order Details Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Mã đơn hàng:</Text>
            <Text style={styles.orderCode}>{orderCode}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tổng tiền:</Text>
            <Text style={styles.price}>{formatCurrency(totalAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Phương thức:</Text>
            <Text style={styles.value}>
              {isBanking ? 'Chuyển khoản VietQR' : 'Thanh toán tiền mặt khi nhận (COD)'}
            </Text>
          </View>
        </View>

        {/* Bank Transfer QR section if banking */}
        {isBanking && (
          <View style={styles.bankingCard}>
            <Text style={styles.bankingTitle}>Thông tin Chuyển khoản VietQR</Text>
            <Text style={styles.bankingSubtitle}>
              Mở app ngân hàng quét mã QR dưới đây hoặc chuyển khoản theo cú pháp:
            </Text>

            <View style={styles.qrContainer}>
              <Image source={{ uri: vietQrUrl }} style={styles.qrImage} contentFit="contain" />
            </View>

            <View style={styles.bankInfoBox}>
              <Text style={styles.bankInfoText}>• Ngân hàng: <Text style={styles.bold}>MB Bank (Quân Đội)</Text></Text>
              <Text style={styles.bankInfoText}>• Số tài khoản: <Text style={styles.bold}>0909 123 456</Text></Text>
              <Text style={styles.bankInfoText}>• Chủ tài khoản: <Text style={styles.bold}>TIEM NHA GOM</Text></Text>
              <Text style={styles.bankInfoText}>• Nội dung CK: <Text style={styles.boldHighlight}>{orderCode}</Text></Text>
            </View>
          </View>
        )}

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.noticeText}>
            Tiệm sẽ liên hệ xác nhận đơn hàng và chuẩn bị đóng gói kỹ lưỡng với xốp chống sốc trước khi gửi đi.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsGroup}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/(tabs)/orders')}
            activeOpacity={0.88}
          >
            <Ionicons name="receipt-outline" size={20} color={Colors.textInverse} />
            <Text style={styles.primaryBtnText}>Theo dõi đơn hàng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Tiếp tục mua sắm</Text>
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
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
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
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
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
    padding: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  bankInfoBox: {
    width: '100%',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  bankInfoText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
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
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    width: '100%',
    marginBottom: Spacing.xl,
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
    gap: Spacing.sm,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  primaryBtnText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: Typography.fontSize.base,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  secondaryBtnText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: Typography.fontSize.sm,
  },
});
