// app/shift-report.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { useThemeColor } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { ScalePressable } from '../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { formatCurrency, formatDate } from '../src/utils/format';
import { Order } from '../src/types';
import { subscribeOrders } from '../src/services/adminOrderService';

export default function ShiftReportScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();
  const { t } = useSettings();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [initialCash, setInitialCash] = useState('1000000'); // 1,000,000 VND default
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [shiftCompleted, setShiftCompleted] = useState(false);

  // Subscribe to orders to aggregate shift stats
  useEffect(() => {
    const unsub = subscribeOrders((allOrders) => {
      // Filter orders from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayOrders = allOrders.filter((order) => {
        if (!order.createdAt) return false;
        const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        return orderDate >= today && order.status !== 'cancelled';
      });

      setOrders(todayOrders);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Compute shift financial metrics
  const shiftMetrics = useMemo(() => {
    let totalCashSales = 0;
    let totalVietQRSales = 0;
    let totalCardSales = 0;
    let posOrdersCount = 0;
    let onlineOrdersCount = 0;

    orders.forEach((order) => {
      const amount = order.totalAmount || 0;
      if (order.source === 'pos') {
        posOrdersCount++;
        if (order.paymentMethod === 'cash') {
          totalCashSales += amount;
        } else if (order.paymentMethod === 'vietqr') {
          totalVietQRSales += amount;
        } else {
          totalCardSales += amount;
        }
      } else {
        onlineOrdersCount++;
        if (order.paymentMethod === 'cod') {
          // COD typically collected later or by shippers
        } else {
          totalVietQRSales += amount;
        }
      }
    });

    const initCashNum = parseInt(initialCash.replace(/[^0-9]/g, ''), 10) || 0;
    const expectedCashInDrawer = initCashNum + totalCashSales;
    const actualCashNum = actualCash ? parseInt(actualCash.replace(/[^0-9]/g, ''), 10) : null;
    const difference = actualCashNum !== null ? actualCashNum - expectedCashInDrawer : null;

    return {
      totalCashSales,
      totalVietQRSales,
      totalCardSales,
      totalSales: totalCashSales + totalVietQRSales + totalCardSales,
      totalOrders: orders.length,
      posOrdersCount,
      onlineOrdersCount,
      initCashNum,
      expectedCashInDrawer,
      actualCashNum,
      difference,
    };
  }, [orders, initialCash, actualCash]);

  const handleSaveShiftReport = async () => {
    if (!adminProfile) return;
    if (shiftMetrics.actualCashNum === null) {
      Alert.alert('Chưa nhập số tiền', 'Vui lòng kiểm đếm và nhập số tiền mặt thực tế trong két.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      await addDoc(collection(db, 'shift_reports'), {
        staffId: adminProfile.uid,
        staffName: adminProfile.displayName,
        staffEmail: adminProfile.email,
        startTime: serverTimestamp(),
        initialCash: shiftMetrics.initCashNum,
        totalCashSales: shiftMetrics.totalCashSales,
        totalVietQRSales: shiftMetrics.totalVietQRSales,
        totalCardSales: shiftMetrics.totalCardSales,
        totalSales: shiftMetrics.totalSales,
        totalOrders: shiftMetrics.totalOrders,
        posOrdersCount: shiftMetrics.posOrdersCount,
        expectedCashInDrawer: shiftMetrics.expectedCashInDrawer,
        actualCashInDrawer: shiftMetrics.actualCashNum,
        difference: shiftMetrics.difference,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
      });

      setShiftCompleted(true);
      Alert.alert(
        'Bàn giao ca thành công',
        `Biên bản kết ca thu ngân đã được ghi nhận. Chênh lệch: ${
          shiftMetrics.difference === 0
            ? 'Khớp tuyệt đối'
            : shiftMetrics.difference! > 0
            ? `Thừa ${formatCurrency(shiftMetrics.difference!)}`
            : `Thiếu ${formatCurrency(Math.abs(shiftMetrics.difference!))}`
        }`,
        [{ text: 'Đóng', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Lỗi lưu báo cáo', err?.message || 'Không thể ghi nhận biên bản kết ca');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <ScalePressable
          style={[
            styles.backBtn,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </ScalePressable>
        <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>Báo cáo kết ca</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#9C7156" />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>
            Đang tổng hợp dữ liệu ca thu ngân...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 84 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Shift Cashier Info Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.cashierRow}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.cashierDetails}>
                <Text style={[styles.cashierName, { color: Colors.textPrimary }]}>
                  {adminProfile?.displayName || 'Thu ngân'}
                </Text>
                <Text style={[styles.cashierSub, { color: Colors.textSecondary }]}>
                  {adminProfile?.email} • {adminProfile?.role?.toUpperCase()}
                </Text>
              </View>
              <View style={styles.todayBadge}>
                <Ionicons name="calendar-outline" size={13} color="#9C7156" />
                <Text style={styles.todayBadgeText}>Hôm nay</Text>
              </View>
            </View>
          </View>

          {/* Section: Thu ngân trong ca */}
          <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>Doanh thu ghi nhận hôm nay</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.statRow}>
              <View style={styles.statLabelGroup}>
                <View style={[styles.iconDot, { backgroundColor: '#9C7156' }]} />
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Tiền mặt thu tại quầy</Text>
              </View>
              <Text style={[styles.statValue, { color: Colors.textPrimary }]}>
                {formatCurrency(shiftMetrics.totalCashSales)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <View style={styles.statRow}>
              <View style={styles.statLabelGroup}>
                <View style={[styles.iconDot, { backgroundColor: '#E8CCB2' }]} />
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Chuyển khoản VietQR</Text>
              </View>
              <Text style={[styles.statValue, { color: Colors.textPrimary }]}>
                {formatCurrency(shiftMetrics.totalVietQRSales)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <View style={styles.statRow}>
              <View style={styles.statLabelGroup}>
                <View style={[styles.iconDot, { backgroundColor: '#6E665D' }]} />
                <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>Quẹt thẻ POS</Text>
              </View>
              <Text style={[styles.statValue, { color: Colors.textPrimary }]}>
                {formatCurrency(shiftMetrics.totalCardSales)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <View style={styles.statRowTotal}>
              <Text style={[styles.totalLabel, { color: Colors.textPrimary }]}>Tổng doanh số ({shiftMetrics.totalOrders} đơn)</Text>
              <Text style={styles.totalValue}>{formatCurrency(shiftMetrics.totalSales)}</Text>
            </View>
          </View>

          {/* Section: Kiểm kê Tiền mặt Trong Két */}
          <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>Đối soát két tiền mặt</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            {/* Tiền mặt đầu ca */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                Tiền mặt đầu ca (tiền thối sẵn)
              </Text>
              <View
                style={[
                  styles.inputPill,
                  {
                    backgroundColor: isDark ? Colors.surface : '#FAF8F5',
                    borderColor: isDark ? '#333' : '#E8E1D8',
                  },
                ]}
              >
                <TextInput
                  style={[styles.textInput, { color: Colors.textPrimary }]}
                  keyboardType="numeric"
                  value={initialCash}
                  onChangeText={(val) => setInitialCash(val)}
                  placeholder="Nhập số tiền..."
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={[styles.inputUnit, { color: Colors.textSecondary }]}>VNĐ</Text>
              </View>
            </View>

            {/* Expected Cash In Drawer */}
            <View style={[styles.calloutRow, { backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2' }]}>
              <View>
                <Text style={[styles.calloutTitle, { color: Colors.textSecondary }]}>
                  Tiền mặt dự kiến có trong két:
                </Text>
                <Text style={[styles.calloutDesc, { color: Colors.textMuted }]}>
                  = Đầu ca ({formatCurrency(shiftMetrics.initCashNum)}) + Thu tiền mặt ({formatCurrency(shiftMetrics.totalCashSales)})
                </Text>
              </View>
              <Text style={styles.calloutAmount}>
                {formatCurrency(shiftMetrics.expectedCashInDrawer)}
              </Text>
            </View>

            {/* Actual Cash In Drawer Input */}
            <View style={[styles.inputGroup, { marginTop: 14 }]}>
              <Text style={[styles.inputLabel, { color: Colors.textPrimary, fontWeight: '700' }]}>
                Tiền mặt thực tế đếm được trong két:
              </Text>
              <View
                style={[
                  styles.inputPill,
                  {
                    backgroundColor: isDark ? Colors.surface : '#FAF8F5',
                    borderColor: '#9C7156',
                    borderWidth: 1.5,
                  },
                ]}
              >
                <TextInput
                  style={[styles.textInput, { color: Colors.textPrimary, fontWeight: '700', fontSize: 16 }]}
                  keyboardType="numeric"
                  value={actualCash}
                  onChangeText={(val) => setActualCash(val)}
                  placeholder="Nhập số tiền thực tế..."
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={[styles.inputUnit, { color: '#9C7156', fontWeight: '700' }]}>VNĐ</Text>
              </View>
            </View>

            {/* Difference Indicator */}
            {shiftMetrics.actualCashNum !== null && (
              <View
                style={[
                  styles.diffBadge,
                  {
                    backgroundColor:
                      shiftMetrics.difference === 0
                        ? 'rgba(156, 113, 86, 0.12)'
                        : shiftMetrics.difference! > 0
                        ? 'rgba(232, 204, 178, 0.25)'
                        : 'rgba(200, 80, 80, 0.15)',
                  },
                ]}
              >
                <Ionicons
                  name={
                    shiftMetrics.difference === 0
                      ? 'checkmark-circle'
                      : shiftMetrics.difference! > 0
                      ? 'add-circle'
                      : 'alert-circle'
                  }
                  size={20}
                  color={shiftMetrics.difference === 0 ? '#9C7156' : shiftMetrics.difference! > 0 ? '#9C7156' : '#C85050'}
                />
                <Text
                  style={[
                    styles.diffText,
                    {
                      color:
                        shiftMetrics.difference === 0
                          ? '#9C7156'
                          : shiftMetrics.difference! > 0
                          ? '#9C7156'
                          : '#C85050',
                    },
                  ]}
                >
                  {shiftMetrics.difference === 0
                    ? 'Khớp chính xác 100% két tiền mặt'
                    : shiftMetrics.difference! > 0
                    ? `Thừa két: +${formatCurrency(shiftMetrics.difference!)}`
                    : `Thiếu két: -${formatCurrency(Math.abs(shiftMetrics.difference!))}`}
                </Text>
              </View>
            )}

            {/* Notes textarea */}
            <View style={[styles.inputGroup, { marginTop: 14 }]}>
              <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                Ghi chú bàn giao ca
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: isDark ? Colors.surface : '#FAF8F5',
                    color: Colors.textPrimary,
                    borderColor: isDark ? '#333' : '#E8E1D8',
                  },
                ]}
                placeholder="Ghi chú chi tiền lẻ, đổi tiền hoặc giải trình chênh lệch két..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>

          {/* Action Button */}
          <ScalePressable
            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
            onPress={handleSaveShiftReport}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitButtonText}>Lưu & Bàn giao ca thu ngân</Text>
              </>
            )}
          </ScalePressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cashierRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#9C7156',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cashierDetails: {
    flex: 1,
  },
  cashierName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
  },
  cashierSub: {
    fontSize: 12,
    marginTop: 2,
  },
  todayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(156, 113, 86, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  todayBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9C7156',
  },
  sectionHeading: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    marginLeft: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  statRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'ElleGaborStd',
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#9C7156',
    fontFamily: 'ElleGaborStd',
  },
  inputGroup: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  inputPill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'ElleGaborStd',
  },
  inputUnit: {
    fontSize: 13,
  },
  calloutRow: {
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  calloutDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  calloutAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9C7156',
    fontFamily: 'ElleGaborStd',
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    marginTop: 8,
  },
  diffText: {
    fontSize: 13,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 84,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submitButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
