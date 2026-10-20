// app/revenue-report.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';
import { subscribeOrders } from '../src/services/adminOrderService';
import { subscribeProducts } from '../src/services/adminProductService';
import { Order, Product } from '../src/types';
import { formatCurrency, formatDate } from '../src/utils/format';
import { ScalePressable } from '../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';

type CycleType = 'quarterly' | 'monthly' | 'daily' | 'all';

export default function RevenueReportScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { t } = useSettings();
  const { adminProfile } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedCycle, setSelectedCycle] = useState<CycleType>('quarterly');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsubOrders = subscribeOrders((data) => {
      setOrders(data);
      setIsLoading(false);
    });
    const unsubProducts = subscribeProducts((data) => setProducts(data));
    return () => {
      unsubOrders();
      unsubProducts();
    };
  }, []);

  const getOrderTime = (o: Order): number => {
    if (o.createdAt?.seconds) return o.createdAt.seconds * 1000;
    if (o.createdAt?.toMillis) return o.createdAt.toMillis();
    if (o.createdAt instanceof Date) return o.createdAt.getTime();
    return new Date(o.createdAt || 0).getTime() || 0;
  };

  // Tính toán dữ liệu báo cáo chuyên sâu
  const reportData = useMemo(() => {
    const yearStart = new Date(selectedYear, 0, 1).getTime();
    const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59).getTime();

    // Các đơn trong năm được chọn
    const yearOrders = orders.filter((o) => {
      const time = getOrderTime(o);
      return time >= yearStart && time <= yearEnd;
    });

    // Các đơn năm trước để so sánh tăng trưởng
    const prevYearStart = new Date(selectedYear - 1, 0, 1).getTime();
    const prevYearEnd = new Date(selectedYear - 1, 11, 31, 23, 59, 59).getTime();
    const prevYearOrders = orders.filter((o) => {
      const time = getOrderTime(o);
      return time >= prevYearStart && time <= prevYearEnd;
    });

    let grossRevenue = 0;
    let netRevenue = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let lostRevenue = 0;
    let estCostTotal = 0;

    let cashSales = 0;
    let vietqrSales = 0;
    let cardSales = 0;

    // Map theo dõi khung giờ mua sắm (24h)
    const hourlyDistribution = {
      morning: { label: 'Sáng (06:00 - 12:00)', revenue: 0, orders: 0 },
      afternoon: { label: 'Chiều (12:00 - 17:00)', revenue: 0, orders: 0 },
      evening: { label: 'Tối (17:00 - 21:00)', revenue: 0, orders: 0 },
      night: { label: 'Đêm (21:00 - 06:00)', revenue: 0, orders: 0 },
    };

    // Theo dõi sản phẩm bị hủy nhiều nhất
    const canceledProductMap: Record<string, { name: string; quantity: number; lostAmount: number; totalSold: number }> = {};

    yearOrders.forEach((o) => {
      const isCancelled = o.status === 'cancelled';
      const total = o.totalAmount || 0;
      const d = new Date(getOrderTime(o));
      const h = d.getHours();

      if (isCancelled) {
        cancelledCount += 1;
        lostRevenue += total;

        if (Array.isArray(o.items)) {
          o.items.forEach((it) => {
            const raw = it as any;
            const pId = raw.productId || raw.product?.id || it.id || it.name || 'unknown';
            const pName = raw.product?.name || it.name || 'Sản phẩm';
            if (!canceledProductMap[pId]) {
              canceledProductMap[pId] = { name: pName, quantity: 0, lostAmount: 0, totalSold: 0 };
            }
            canceledProductMap[pId].quantity += it.quantity || 1;
            canceledProductMap[pId].lostAmount += (it.price || 0) * (it.quantity || 1);
          });
        }
      } else {
        grossRevenue += total;
        completedCount += 1;

        // Phân bổ giờ mua sắm
        if (h >= 6 && h < 12) {
          hourlyDistribution.morning.revenue += total;
          hourlyDistribution.morning.orders += 1;
        } else if (h >= 12 && h < 17) {
          hourlyDistribution.afternoon.revenue += total;
          hourlyDistribution.afternoon.orders += 1;
        } else if (h >= 17 && h < 21) {
          hourlyDistribution.evening.revenue += total;
          hourlyDistribution.evening.orders += 1;
        } else {
          hourlyDistribution.night.revenue += total;
          hourlyDistribution.night.orders += 1;
        }

        // Tính giá vốn
        let orderCost = 0;
        if (Array.isArray(o.items)) {
          o.items.forEach((it) => {
            const raw = it as any;
            const cost = raw.cost || (it.price ? it.price * 0.45 : 0);
            orderCost += cost * (it.quantity || 1);

            const pId = raw.productId || raw.product?.id || it.id || 'unknown';
            if (canceledProductMap[pId]) {
              canceledProductMap[pId].totalSold += it.quantity || 1;
            }
          });
        } else {
          orderCost = total * 0.45;
        }
        estCostTotal += orderCost;

        // Phương thức thanh toán
        const pm = (o.paymentMethod || '').toLowerCase();
        if (pm === 'cash' || pm === 'tien_mat') cashSales += total;
        else if (pm === 'vietqr' || pm === 'transfer' || pm === 'chuyen_khoan') vietqrSales += total;
        else cardSales += total;
      }
    });

    netRevenue = Math.max(0, grossRevenue);
    const estProfit = Math.max(0, grossRevenue - estCostTotal);
    const totalOrdersInYear = yearOrders.length;
    const cancelRate = totalOrdersInYear > 0 ? Math.round((cancelledCount / totalOrdersInYear) * 100) : 0;
    const aov = completedCount > 0 ? Math.round(grossRevenue / completedCount) : 0;

    // Doanh thu năm trước để so sánh tăng trưởng
    let prevGrossRevenue = 0;
    prevYearOrders.forEach((o) => {
      if (o.status !== 'cancelled') prevGrossRevenue += o.totalAmount || 0;
    });

    let growthPercent = 0;
    if (prevGrossRevenue > 0) {
      growthPercent = Math.round(((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 100);
    } else if (grossRevenue > 0) {
      growthPercent = 100;
    }

    // Xác định khung giờ vàng cao điểm nhất
    const peakEntries = Object.entries(hourlyDistribution);
    peakEntries.sort((a, b) => b[1].revenue - a[1].revenue);
    const peakHourBest = peakEntries[0];

    // Top sản phẩm bị hủy nhiều nhất
    const topCanceledList = Object.values(canceledProductMap)
      .sort((a, b) => b.lostAmount - a.lostAmount)
      .slice(0, 5);

    // Xây dựng Bảng kê chi tiết & Cột biểu đồ theo Chu kỳ (Quarterly / Monthly / Daily)
    type LedgerRow = {
      periodLabel: string;
      orderCount: number;
      netRevenue: number;
      vatTax: number;
      pitTax: number;
      totalTax: number;
      grossRevenue: number;
      estProfit: number;
    };

    const ledgerRows: LedgerRow[] = [];
    const chartBars: { label: string; value: number }[] = [];

    if (selectedCycle === 'quarterly') {
      const quarters = [
        { name: 'Quý 1 (T1-T3)', mStart: 0, mEnd: 2 },
        { name: 'Quý 2 (T4-T6)', mStart: 3, mEnd: 5 },
        { name: 'Quý 3 (T7-T9)', mStart: 6, mEnd: 8 },
        { name: 'Quý 4 (T10-T12)', mStart: 9, mEnd: 11 },
      ];

      quarters.forEach((q) => {
        const qStart = new Date(selectedYear, q.mStart, 1).getTime();
        const qEnd = new Date(selectedYear, q.mEnd + 1, 0, 23, 59, 59).getTime();

        const qOrders = yearOrders.filter((o) => {
          const t = getOrderTime(o);
          return t >= qStart && t <= qEnd && o.status !== 'cancelled';
        });

        const qGross = qOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const qCount = qOrders.length;
        const vat = Math.round(qGross * 0.01);
        const pit = Math.round(qGross * 0.005);
        const totalTax = vat + pit;
        const profit = Math.round(qGross * 0.52);

        ledgerRows.push({
          periodLabel: q.name,
          orderCount: qCount,
          netRevenue: qGross,
          vatTax: vat,
          pitTax: pit,
          totalTax: totalTax,
          grossRevenue: qGross,
          estProfit: profit,
        });

        chartBars.push({ label: `Q${quarters.indexOf(q) + 1}`, value: qGross });
      });
    } else if (selectedCycle === 'monthly') {
      for (let m = 0; m < 12; m++) {
        const mStart = new Date(selectedYear, m, 1).getTime();
        const mEnd = new Date(selectedYear, m + 1, 0, 23, 59, 59).getTime();

        const mOrders = yearOrders.filter((o) => {
          const t = getOrderTime(o);
          return t >= mStart && t <= mEnd && o.status !== 'cancelled';
        });

        const mGross = mOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const mCount = mOrders.length;
        const vat = Math.round(mGross * 0.01);
        const pit = Math.round(mGross * 0.005);
        const totalTax = vat + pit;
        const profit = Math.round(mGross * 0.52);

        ledgerRows.push({
          periodLabel: `Tháng ${m + 1}`,
          orderCount: mCount,
          netRevenue: mGross,
          vatTax: vat,
          pitTax: pit,
          totalTax: totalTax,
          grossRevenue: mGross,
          estProfit: profit,
        });

        chartBars.push({ label: `T${m + 1}`, value: mGross });
      }
    } else if (selectedCycle === 'daily') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const daysInMonth = new Date(selectedYear, currentMonth + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const dStart = new Date(selectedYear, currentMonth, day, 0, 0, 0).getTime();
        const dEnd = new Date(selectedYear, currentMonth, day, 23, 59, 59).getTime();

        const dOrders = yearOrders.filter((o) => {
          const t = getOrderTime(o);
          return t >= dStart && t <= dEnd && o.status !== 'cancelled';
        });

        const dGross = dOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const dCount = dOrders.length;
        const vat = Math.round(dGross * 0.01);
        const pit = Math.round(dGross * 0.005);

        ledgerRows.push({
          periodLabel: `${day}/${currentMonth + 1}`,
          orderCount: dCount,
          netRevenue: dGross,
          vatTax: vat,
          pitTax: pit,
          totalTax: vat + pit,
          grossRevenue: dGross,
          estProfit: Math.round(dGross * 0.52),
        });

        if (day % 3 === 1 || day === daysInMonth) {
          chartBars.push({ label: `${day}`, value: dGross });
        }
      }
    } else {
      // Chu kỳ toàn năm
      const vat = Math.round(grossRevenue * 0.01);
      const pit = Math.round(grossRevenue * 0.005);
      ledgerRows.push({
        periodLabel: `Toàn năm ${selectedYear}`,
        orderCount: completedCount,
        netRevenue: netRevenue,
        vatTax: vat,
        pitTax: pit,
        totalTax: vat + pit,
        grossRevenue: grossRevenue,
        estProfit: estProfit,
      });

      chartBars.push({ label: `${selectedYear}`, value: grossRevenue });
    }

    const maxChartValue = Math.max(...chartBars.map((b) => b.value), 100000);

    // Tính tổng nghĩa vụ thuế cả năm (1% VAT + 0.5% TNCN theo luật bán lẻ)
    const yearVat = Math.round(grossRevenue * 0.01);
    const yearPit = Math.round(grossRevenue * 0.005);
    const yearTotalTax = yearVat + yearPit;

    return {
      grossRevenue,
      netRevenue,
      completedCount,
      cancelledCount,
      lostRevenue,
      cancelRate,
      aov,
      estProfit,
      growthPercent,
      prevGrossRevenue,
      cashSales,
      vietqrSales,
      cardSales,
      hourlyDistribution,
      peakHourBest,
      topCanceledList,
      ledgerRows,
      chartBars,
      maxChartValue,
      yearVat,
      yearPit,
      yearTotalTax,
    };
  }, [orders, selectedYear, selectedCycle]);

  // Chia sẻ / Xuất tóm tắt báo cáo
  const handleShareReport = async () => {
    try {
      const summaryText = `📊 BÁO CÁO DOANH THU TIỆM NHÀ GỐM - NĂM ${selectedYear}
---------------------------------
💰 Tổng doanh thu: ${formatCurrency(reportData.grossRevenue)}
💵 Doanh thu thuần: ${formatCurrency(reportData.netRevenue)}
📈 Lợi nhuận dự tính: ${formatCurrency(reportData.estProfit)}
📦 Tổng đơn hoàn tất: ${reportData.completedCount} đơn
🧾 Giá trị TB đơn (AOV): ${formatCurrency(reportData.aov)}
⚠️ Tỷ lệ hủy/hoàn: ${reportData.cancelRate}% (Thất thoát: ${formatCurrency(reportData.lostRevenue)})
🏦 Tổng thuế ước tính (1.5%): ${formatCurrency(reportData.yearTotalTax)}
---------------------------------
Xuất từ Tiệm Nhà Gốm Retail App • Thu ngân: ${adminProfile?.displayName || 'Admin'}`;

      await Share.share({
        message: summaryText,
        title: `Báo cáo doanh thu Tiệm Nhà Gốm ${selectedYear}`,
      });
    } catch (e: any) {
      Alert.alert(t('error'), e.message || 'Lỗi khi chia sẻ báo cáo');
    }
  };

  const cycleOptions: { key: CycleType; label: string }[] = [
    { key: 'quarterly', label: t('cycleQuarterly') },
    { key: 'monthly', label: t('cycleMonthly') },
    { key: 'daily', label: t('cycleDaily') },
    { key: 'all', label: 'Toàn năm' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity
            style={[
              styles.btnBack,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
                borderWidth: isDark ? 0 : 1,
              },
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleGroup}>
            <Text
              style={[styles.headerTitle, { color: Colors.textPrimary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {t('revenueReportTitle')}
            </Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
              Năm tài chính {selectedYear}
            </Text>
          </View>
        </View>

        <ScalePressable style={styles.btnExportHeader} onPress={handleShareReport}>
          <Ionicons name="share-outline" size={16} color="#FFFFFF" />
          <Text style={styles.btnExportHeaderText} numberOfLines={1}>Xuất</Text>
        </ScalePressable>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#9C7156" />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>{t('loading')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* SECTION 1: BỘ LỌC NĂM VÀ CHU KỲ BÁO CÁO */}
          <View
            style={[
              styles.filterCard,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            {/* Hàng chọn Năm */}
            <View style={styles.yearRow}>
              <Text style={[styles.filterLabel, { color: Colors.textSecondary }]}>Năm báo cáo:</Text>
              <View style={styles.yearPillsGroup}>
                {[currentYear, currentYear - 1, currentYear - 2].map((yr) => (
                  <TouchableOpacity
                    key={yr}
                    style={[
                      styles.yearPill,
                      selectedYear === yr && styles.yearPillActive,
                      {
                        backgroundColor: selectedYear === yr ? '#9C7156' : isDark ? '#1E1E1E' : '#FAF8F5',
                        borderColor: selectedYear === yr ? '#9C7156' : Colors.border,
                      },
                    ]}
                    onPress={() => setSelectedYear(yr)}
                  >
                    <Text
                      style={[
                        styles.yearPillText,
                        { color: selectedYear === yr ? '#FFFFFF' : Colors.textPrimary },
                        selectedYear === yr && { fontWeight: '700' },
                      ]}
                    >
                      {yr}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hàng chọn Chu kỳ */}
            <View style={[styles.divider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <View style={styles.cycleRow}>
              <Text style={[styles.filterLabel, { color: Colors.textSecondary }]}>Xem theo chu kỳ:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cycleChipsScroll}>
                {cycleOptions.map((opt) => {
                  const active = selectedCycle === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.cycleChip,
                        active && styles.cycleChipActive,
                        {
                          backgroundColor: active ? '#9C7156' : isDark ? '#1E1E1E' : '#FAF8F5',
                          borderColor: active ? '#9C7156' : Colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedCycle(opt.key);
                        setSelectedBarIndex(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.cycleChipText,
                          { color: active ? '#FFFFFF' : Colors.textPrimary },
                          active && { fontWeight: '700' },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* SECTION 2: 6 THẺ CHỈ SỐ TÀI CHÍNH KPI CHUYÊN SÂU */}
          <View style={styles.kpiGrid}>
            {/* Card 1: Doanh thu kỳ này */}
            <View
              style={[
                styles.kpiCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconBox}>
                <Ionicons name="cash-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                Doanh thu kỳ này
              </Text>
              <Text
                style={[styles.kpiValue, { color: '#9C7156' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(reportData.grossRevenue)}
              </Text>
              {reportData.growthPercent !== 0 && (
                <Text
                  style={[
                    styles.kpiGrowth,
                    { color: reportData.growthPercent > 0 ? '#9C7156' : '#DC2626' },
                  ]}
                  numberOfLines={1}
                >
                  {reportData.growthPercent > 0 ? `↑ +${reportData.growthPercent}%` : `↓ ${reportData.growthPercent}%`} so năm trước
                </Text>
              )}
            </View>

            {/* Card 2: Doanh thu thuần */}
            <View
              style={[
                styles.kpiCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconBox}>
                <Ionicons name="pie-chart-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                {t('netRevenue')}
              </Text>
              <Text
                style={[styles.kpiValue, { color: Colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(reportData.netRevenue)}
              </Text>
              <Text style={[styles.kpiSub, { color: Colors.textMuted }]} numberOfLines={1}>
                Sau khi trừ hoàn/hủy
              </Text>
            </View>

            {/* Card 3: Đơn hoàn thành */}
            <View
              style={[
                styles.kpiCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconBox}>
                <Ionicons name="bag-check-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                Đơn hoàn thành
              </Text>
              <Text
                style={[styles.kpiValue, { color: Colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {reportData.completedCount} đơn
              </Text>
              <Text style={[styles.kpiSub, { color: Colors.textMuted }]} numberOfLines={1}>
                Thành công vào sổ bán
              </Text>
            </View>

            {/* Card 4: Tỷ lệ hủy / hoàn */}
            <View
              style={[
                styles.kpiCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconBox}>
                <Ionicons name="alert-circle-outline" size={20} color="#DC2626" />
              </View>
              <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                {t('cancelRate')}
              </Text>
              <Text
                style={[styles.kpiValue, { color: '#DC2626' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {reportData.cancelRate}%
              </Text>
              <Text style={[styles.kpiSub, { color: '#DC2626' }]} numberOfLines={1}>
                Mất {formatCurrency(reportData.lostRevenue)}
              </Text>
            </View>

            {/* Card 5: Lợi nhuận dự tính */}
            <View
              style={[
                styles.kpiCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconBox}>
                <Ionicons name="trending-up-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                {t('estimatedProfit')}
              </Text>
              <Text
                style={[styles.kpiValue, { color: '#9C7156' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(reportData.estProfit)}
              </Text>
              <Text style={[styles.kpiSub, { color: Colors.textMuted }]} numberOfLines={1}>
                Tỷ suất ~52% sau giá vốn
              </Text>
            </View>

            {/* Card 6: Giá trị trung bình đơn AOV */}
            <View
              style={[
                styles.kpiCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconBox}>
                <Ionicons name="pricetag-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                {t('avgOrderValue')}
              </Text>
              <Text
                style={[styles.kpiValue, { color: Colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(reportData.aov)}
              </Text>
              <Text style={[styles.kpiSub, { color: Colors.textMuted }]} numberOfLines={1}>
                Trung bình mỗi lượt khách
              </Text>
            </View>
          </View>

          {/* SECTION 3: BIỂU ĐỒ BIẾN ĐỘNG DOANH THU THEO CHU KỲ (Visual Chart) */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleGroup}>
                <Text style={[styles.cardTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
                  Biến động doanh thu ({cycleOptions.find((c) => c.key === selectedCycle)?.label})
                </Text>
                <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]} numberOfLines={1}>
                  Chạm vào từng cột để xem chi tiết doanh thu
                </Text>
              </View>
              <View style={styles.chartTotalBadge}>
                <Text style={styles.chartTotalBadgeText} numberOfLines={1}>
                  {formatCurrency(reportData.grossRevenue)}
                </Text>
              </View>
            </View>

            <View style={styles.chartContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.chartBarsRow,
                  {
                    minWidth: '100%',
                    justifyContent: reportData.chartBars.length <= 5 ? 'space-around' : 'flex-start',
                    gap: reportData.chartBars.length <= 5 ? 0 : 10,
                    paddingHorizontal: 4,
                  },
                ]}
              >
                {reportData.chartBars.map((bar, idx) => {
                  const heightPercent = Math.max(12, Math.round((bar.value / reportData.maxChartValue) * 100));
                  const isSelected = selectedBarIndex === idx;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.chartBarCol,
                        reportData.chartBars.length > 5 && { width: 38, flex: 0 },
                      ]}
                      onPress={() => setSelectedBarIndex(isSelected ? null : idx)}
                      activeOpacity={0.8}
                    >
                      {isSelected && (
                        <View style={[styles.chartTooltip, { backgroundColor: isDark ? '#1E1E1E' : '#2B2928' }]}>
                          <Text style={styles.chartTooltipText} numberOfLines={1}>
                            {formatCurrency(bar.value)}
                          </Text>
                        </View>
                      )}

                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${heightPercent}%`,
                              backgroundColor: isSelected ? '#2B2928' : '#9C7156',
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.barLabel,
                          { color: isSelected ? '#9C7156' : Colors.textSecondary },
                          isSelected && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {bar.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* SECTION 4: 🕒 KHUNG GIỜ VÀNG MUA SẮM TRONG NGÀY (Peak Shopping Hours / 24h) */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleGroup}>
                <Text style={[styles.cardTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
                  {t('peakHoursTitle')}
                </Text>
                <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]} numberOfLines={1}>
                  Phân tích khung giờ đặt hàng nhiều nhất trong ngày
                </Text>
              </View>

              <View style={styles.peakHourBadge}>
                <Ionicons name="flame" size={14} color="#9C7156" />
                <Text style={styles.peakHourBadgeText} numberOfLines={1}>
                  Giờ vàng: {reportData.peakHourBest ? reportData.peakHourBest[1].label.split(' ')[0] : 'Tối'}
                </Text>
              </View>
            </View>

            <View style={styles.hourlyGrid}>
              {Object.entries(reportData.hourlyDistribution).map(([key, item]) => {
                const percent =
                  reportData.grossRevenue > 0 ? Math.round((item.revenue / reportData.grossRevenue) * 100) : 0;
                return (
                  <View
                    key={key}
                    style={[
                      styles.hourlyBox,
                      { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5' },
                    ]}
                  >
                    <Text style={[styles.hourlyBoxTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={[styles.hourlyBoxRevenue, { color: '#9C7156' }]} numberOfLines={1}>
                      {formatCurrency(item.revenue)}
                    </Text>
                    <Text style={[styles.hourlyBoxOrders, { color: Colors.textSecondary }]} numberOfLines={1}>
                      {item.orders} đơn hàng ({percent}%)
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* SECTION 5: 📋 BẢNG KÊ CHI TIẾT DOANH THU & NGHĨA VỤ THUẾ THEO KỲ */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleGroup}>
                <Text style={[styles.cardTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
                  {t('taxLedgerTitle')}
                </Text>
                <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]} numberOfLines={1}>
                  Bao gồm thuế GTGT (1%) và TNCN (0.5%) theo luật thuế bán lẻ
                </Text>
              </View>
            </View>

            {/* Bảng kê chi tiết từng mốc */}
            <View style={styles.ledgerList}>
              {reportData.ledgerRows.map((row, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.ledgerRowCard,
                    {
                      backgroundColor: isDark ? '#1A1816' : '#FAF8F5',
                      borderColor: isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                >
                  <View style={styles.ledgerRowHeader}>
                    <Text style={[styles.ledgerPeriodName, { color: Colors.textPrimary }]} numberOfLines={1}>
                      📅 {row.periodLabel}
                    </Text>
                    <Text style={[styles.ledgerGross, { color: '#9C7156' }]} numberOfLines={1}>
                      {formatCurrency(row.grossRevenue)}
                    </Text>
                  </View>

                  <View style={styles.ledgerDetailsGrid}>
                    <View style={styles.ledgerDetailRow}>
                      <View style={styles.ledgerDetailItem}>
                        <Text style={[styles.ledgerDetailLabel, { color: Colors.textMuted }]}>Số đơn:</Text>
                        <Text style={[styles.ledgerDetailVal, { color: Colors.textPrimary }]}>{row.orderCount} đơn</Text>
                      </View>
                      <View style={styles.ledgerDetailItem}>
                        <Text style={[styles.ledgerDetailLabel, { color: Colors.textMuted }]}>Lợi nhuận dự tính:</Text>
                        <Text style={[styles.ledgerDetailVal, { color: '#9C7156' }]}>{formatCurrency(row.estProfit)}</Text>
                      </View>
                    </View>

                    <View style={styles.ledgerDetailRow}>
                      <View style={styles.ledgerDetailItem}>
                        <Text style={[styles.ledgerDetailLabel, { color: Colors.textMuted }]}>{t('vatTax')} (1%):</Text>
                        <Text style={[styles.ledgerDetailVal, { color: Colors.textPrimary }]}>{formatCurrency(row.vatTax)}</Text>
                      </View>
                      <View style={styles.ledgerDetailItem}>
                        <Text style={[styles.ledgerDetailLabel, { color: Colors.textMuted }]}>{t('pitTax')} (0.5%):</Text>
                        <Text style={[styles.ledgerDetailVal, { color: Colors.textPrimary }]}>{formatCurrency(row.pitTax)}</Text>
                      </View>
                    </View>

                    <View style={[styles.ledgerTotalTaxPill, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]}>
                      <Text style={[styles.ledgerTotalTaxLabel, { color: Colors.textSecondary }]}>
                        {t('totalTax')} (1.5%):
                      </Text>
                      <Text style={styles.ledgerTotalTaxVal}>{formatCurrency(row.totalTax)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Khối tổng hợp nghĩa vụ thuế năm */}
            <View
              style={[
                styles.taxSummaryCard,
                { backgroundColor: isDark ? '#1E1E1E' : '#FFFBF5', borderColor: '#E8CCB2' },
              ]}
            >
              <View style={styles.taxSummaryRow}>
                <Text style={[styles.taxSummaryLabel, { color: Colors.textPrimary }]} numberOfLines={1}>
                  🏛️ Tổng thuế cả năm {selectedYear}:
                </Text>
                <Text style={styles.taxSummaryTotalValue} numberOfLines={1}>
                  {formatCurrency(reportData.yearTotalTax)}
                </Text>
              </View>
              <Text style={[styles.taxSummaryHint, { color: Colors.textSecondary }]} numberOfLines={1}>
                (Đã gồm {formatCurrency(reportData.yearVat)} VAT và {formatCurrency(reportData.yearPit)} thuế TNCN)
              </Text>
            </View>
          </View>

          {/* SECTION 6: ⚠️ TOP SẢN PHẨM CÓ TỶ LỆ HỦY CAO NHẤT */}
          {reportData.topCanceledList.length > 0 && (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
                ❌ Top tác phẩm có tỷ lệ hủy cao
              </Text>
              <Text style={[styles.cardSubtitle, { color: Colors.textSecondary, marginBottom: 12 }]} numberOfLines={1}>
                Rà soát lại thông tin mô tả hoặc tư vấn để hạn chế đơn hủy
              </Text>

              <View style={styles.topCanceledList}>
                {reportData.topCanceledList.map((item, idx) => (
                  <View key={idx} style={styles.topCanceledRow}>
                    <View style={styles.topCanceledLeft}>
                      <Text style={[styles.topCanceledName, { color: Colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                        {idx + 1}. {item.name}
                      </Text>
                      <Text style={[styles.topCanceledSub, { color: Colors.textMuted }]} numberOfLines={1}>
                        Hủy: {item.quantity} món
                      </Text>
                    </View>
                    <Text style={[styles.topCanceledAmount, { color: '#DC2626' }]} numberOfLines={1}>
                      Mất {formatCurrency(item.lostAmount)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
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
    paddingBottom: 10,
    zIndex: 10,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  headerTitleGroup: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 4,
  },
  btnBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  btnExportHeader: {
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9C7156',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  btnExportHeaderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  yearPillsGroup: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  yearPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  yearPillActive: {},
  yearPillText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  cycleRow: {
    gap: 10,
  },
  cycleChipsScroll: {
    gap: 8,
  },
  cycleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  cycleChipActive: {},
  cycleChipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  kpiGrowth: {
    fontSize: 11,
    fontWeight: '700',
  },
  kpiSub: {
    fontSize: 11,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  cardHeaderTitleGroup: {
    flex: 1,
    marginRight: 4,
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  chartTotalBadge: {
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  chartTotalBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9C7156',
  },
  chartContainer: {
    height: 180,
    paddingTop: 16,
    justifyContent: 'flex-end',
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
  },
  chartBarCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  chartTooltip: {
    position: 'absolute',
    top: -24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
  },
  chartTooltipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  barTrack: {
    width: 20,
    height: 110,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    minHeight: 8,
  },
  barLabel: {
    fontSize: 11,
    marginTop: 8,
  },
  peakHourBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexShrink: 0,
  },
  peakHourBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  hourlyGrid: {
    gap: 10,
  },
  hourlyBox: {
    padding: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  hourlyBoxTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  hourlyBoxRevenue: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  hourlyBoxOrders: {
    fontSize: 11.5,
  },
  ledgerList: {
    gap: 10,
  },
  ledgerRowCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    overflow: 'hidden',
  },
  ledgerRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E1D8',
    gap: 8,
  },
  ledgerPeriodName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  ledgerGross: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 0,
  },
  ledgerDetailsGrid: {
    gap: 8,
  },
  ledgerDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  ledgerDetailItem: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerDetailLabel: {
    fontSize: 11,
    marginRight: 4,
  },
  ledgerDetailVal: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  ledgerTotalTaxPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 2,
  },
  ledgerTotalTaxLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  ledgerTotalTaxVal: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  taxSummaryCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  taxSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  taxSummaryLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },
  taxSummaryTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9C7156',
    flexShrink: 0,
  },
  taxSummaryHint: {
    fontSize: 11,
    marginTop: 4,
  },
  topCanceledList: {
    gap: 10,
  },
  topCanceledRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  topCanceledLeft: {
    flex: 1,
    marginRight: 8,
  },
  topCanceledName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
  },
  topCanceledSub: {
    fontSize: 11,
    marginTop: 2,
  },
  topCanceledAmount: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
  },
});
