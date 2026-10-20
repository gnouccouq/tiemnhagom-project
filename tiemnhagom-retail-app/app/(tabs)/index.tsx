// app/(tabs)/index.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { subscribeOrders, updateOrderStatus } from '../../src/services/adminOrderService';
import { subscribeProducts, subscribeRestockAlerts } from '../../src/services/adminProductService';
import { Order, Product, RestockAlert } from '../../src/types';
import { formatCurrency, formatDate } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

type PeriodType = 'today' | 'yesterday' | '7days' | 'month' | 'year' | 'all';

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile, lockShift, checkPermission } = useAuth();
  const { t } = useSettings();
  const canOverview = checkPermission('overview');

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [restockAlerts, setRestockAlerts] = useState<RestockAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('today');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  useEffect(() => {
    if (adminProfile && !canOverview) {
      if (checkPermission('pos')) {
        router.replace('/(tabs)/pos');
      } else if (checkPermission('orders')) {
        router.replace('/(tabs)/orders');
      } else if (checkPermission('inventory')) {
        router.replace('/(tabs)/inventory');
      } else {
        router.replace('/(tabs)/more');
      }
    }
  }, [adminProfile, canOverview]);

  useEffect(() => {
    if (!canOverview) return;
    const unsubOrders = subscribeOrders((data) => setOrders(data));
    const unsubProducts = subscribeProducts((data) => setProducts(data));
    const unsubAlerts = subscribeRestockAlerts((data) => setRestockAlerts(data));
    return () => {
      unsubOrders();
      unsubProducts();
      unsubAlerts();
    };
  }, [canOverview]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  // Helper chuyển đổi timestamp sang milliseconds
  const getOrderTime = (o: Order): number => {
    if (o.createdAt?.seconds) return o.createdAt.seconds * 1000;
    if (o.createdAt?.toMillis) return o.createdAt.toMillis();
    if (o.createdAt instanceof Date) return o.createdAt.getTime();
    return new Date(o.createdAt || 0).getTime() || 0;
  };

  // Tính toán thời gian cho từng chu kỳ báo cáo
  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const endOfYesterday = startOfToday - 1;
    const startOf7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const endOfLastMonth = startOfMonth - 1;
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1).getTime();
    const endOfLastYear = startOfYear - 1;

    let periodStart = 0;
    let periodEnd = Number.MAX_SAFE_INTEGER;
    let prevPeriodStart = 0;
    let prevPeriodEnd = 0;

    switch (selectedPeriod) {
      case 'today':
        periodStart = startOfToday;
        prevPeriodStart = startOfYesterday;
        prevPeriodEnd = endOfYesterday;
        break;
      case 'yesterday':
        periodStart = startOfYesterday;
        periodEnd = endOfYesterday;
        prevPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getTime();
        prevPeriodEnd = startOfYesterday - 1;
        break;
      case '7days':
        periodStart = startOf7Days;
        prevPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13).getTime();
        prevPeriodEnd = startOf7Days - 1;
        break;
      case 'month':
        periodStart = startOfMonth;
        prevPeriodStart = startOfLastMonth;
        prevPeriodEnd = endOfLastMonth;
        break;
      case 'year':
        periodStart = startOfYear;
        prevPeriodStart = startOfLastYear;
        prevPeriodEnd = endOfLastYear;
        break;
      case 'all':
      default:
        periodStart = 0;
        break;
    }

    // Lọc đơn hàng theo chu kỳ hiện tại và chu kỳ trước
    const periodOrders = orders.filter((o) => {
      const t = getOrderTime(o);
      return t >= periodStart && t <= periodEnd;
    });

    const prevPeriodOrders = orders.filter((o) => {
      const t = getOrderTime(o);
      return t >= prevPeriodStart && t <= prevPeriodEnd;
    });

    // Chỉ số chu kỳ hiện tại
    let grossRevenue = 0;
    let netRevenue = 0;
    let completedOrdersCount = 0;
    let cancelledOrdersCount = 0;
    let cancelledAmount = 0;
    let estCostTotal = 0;

    // Phân bổ thanh toán & kênh bán
    let cashSales = 0;
    let vietqrSales = 0;
    let cardSales = 0;
    let posChannelSales = 0;
    let onlineChannelSales = 0;

    periodOrders.forEach((o) => {
      const isCancelled = o.status === 'cancelled';
      const orderTotal = o.totalAmount || 0;

      if (isCancelled) {
        cancelledOrdersCount += 1;
        cancelledAmount += orderTotal;
      } else {
        grossRevenue += orderTotal;
        completedOrdersCount += 1;

        // Ước tính giá vốn hàng bán để tính lợi nhuận gộp
        let orderCost = 0;
        if (Array.isArray(o.items)) {
          o.items.forEach((it) => {
            const cost = (it as any).cost || (it.price ? it.price * 0.45 : 0);
            orderCost += cost * (it.quantity || 1);
          });
        } else {
          orderCost = orderTotal * 0.45;
        }
        estCostTotal += orderCost;

        // Phương thức thanh toán
        const pm = (o.paymentMethod || '').toLowerCase();
        if (pm === 'cash' || pm === 'tien_mat') {
          cashSales += orderTotal;
        } else if (pm === 'vietqr' || pm === 'transfer' || pm === 'chuyen_khoan') {
          vietqrSales += orderTotal;
        } else {
          cardSales += orderTotal;
        }

        // Kênh bán
        const isPOS = (o as any).isPOS || o.source === 'pos' || o.orderSource === 'pos' || !!o.cashierId;
        if (isPOS) {
          posChannelSales += orderTotal;
        } else {
          onlineChannelSales += orderTotal;
        }
      }
    });

    netRevenue = Math.max(0, grossRevenue - cancelledAmount);
    const estGrossProfit = Math.max(0, grossRevenue - estCostTotal);
    const totalOrderAttempts = periodOrders.length;
    const cancelRate = totalOrderAttempts > 0 ? Math.round((cancelledOrdersCount / totalOrderAttempts) * 100) : 0;
    const avgOrderValue = completedOrdersCount > 0 ? Math.round(grossRevenue / completedOrdersCount) : 0;

    // Chu kỳ trước để tính tăng trưởng
    let prevGrossRevenue = 0;
    prevPeriodOrders.forEach((o) => {
      if (o.status !== 'cancelled') {
        prevGrossRevenue += o.totalAmount || 0;
      }
    });

    let growthPercent = 0;
    if (prevGrossRevenue > 0) {
      growthPercent = Math.round(((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 100);
    } else if (grossRevenue > 0) {
      growthPercent = 100;
    }

    // Tạo các cột biểu đồ phân bổ thời gian trực quan (Interactive Bar Chart)
    const chartBars: { label: string; value: number }[] = [];

    if (selectedPeriod === 'today' || selectedPeriod === 'yesterday') {
      // Phân bổ 4 khung giờ: Sáng (6-12), Chiều (12-17), Tối (17-21), Đêm (21-6)
      const slots = [
        { label: 'Sáng (6-12h)', min: 6, max: 12, value: 0 },
        { label: 'Chiều (12-17h)', min: 12, max: 17, value: 0 },
        { label: 'Tối (17-21h)', min: 17, max: 21, value: 0 },
        { label: 'Đêm (21-6h)', min: 21, max: 24, value: 0 },
      ];
      periodOrders.forEach((o) => {
        if (o.status !== 'cancelled') {
          const d = new Date(getOrderTime(o));
          const h = d.getHours();
          const target = slots.find((s) => (s.min === 21 ? h >= 21 || h < 6 : h >= s.min && h < s.max));
          if (target) target.value += o.totalAmount || 0;
        }
      });
      slots.forEach((s) => chartBars.push({ label: s.label, value: s.value }));
    } else if (selectedPeriod === '7days') {
      // 7 ngày gần nhất
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStart = d.getTime();
        const dayEnd = dayStart + 86400000 - 1;
        const dayVal = periodOrders
          .filter((o) => o.status !== 'cancelled' && getOrderTime(o) >= dayStart && getOrderTime(o) <= dayEnd)
          .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const dayName = i === 0 ? 'Hôm nay' : `${d.getDate()}/${d.getMonth() + 1}`;
        chartBars.push({ label: dayName, value: dayVal });
      }
    } else if (selectedPeriod === 'month') {
      // 4 tuần trong tháng
      const weeks = [
        { label: 'Tuần 1 (1-7)', min: 1, max: 7, value: 0 },
        { label: 'Tuần 2 (8-14)', min: 8, max: 14, value: 0 },
        { label: 'Tuần 3 (15-21)', min: 15, max: 21, value: 0 },
        { label: 'Tuần 4 (22+)', min: 22, max: 31, value: 0 },
      ];
      periodOrders.forEach((o) => {
        if (o.status !== 'cancelled') {
          const day = new Date(getOrderTime(o)).getDate();
          const target = weeks.find((w) => day >= w.min && day <= w.max);
          if (target) target.value += o.totalAmount || 0;
        }
      });
      weeks.forEach((w) => chartBars.push({ label: w.label, value: w.value }));
    } else {
      // 12 tháng trong năm
      for (let m = 0; m < 12; m++) {
        const mStart = new Date(now.getFullYear(), m, 1).getTime();
        const mEnd = new Date(now.getFullYear(), m + 1, 0, 23, 59, 59).getTime();
        const mVal = orders
          .filter((o) => o.status !== 'cancelled' && getOrderTime(o) >= mStart && getOrderTime(o) <= mEnd)
          .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        chartBars.push({ label: `T${m + 1}`, value: mVal });
      }
    }

    const maxChartValue = Math.max(...chartBars.map((b) => b.value), 100000);

    return {
      grossRevenue,
      netRevenue,
      growthPercent,
      completedOrdersCount,
      cancelledOrdersCount,
      cancelledAmount,
      cancelRate,
      avgOrderValue,
      estGrossProfit,
      cashSales,
      vietqrSales,
      cardSales,
      posChannelSales,
      onlineChannelSales,
      chartBars,
      maxChartValue,
    };
  }, [orders, selectedPeriod]);

  // Thống kê phân bổ trạng thái đơn
  const statusCounts = useMemo(() => {
    const counts = { pending: 0, processing: 0, shipping: 0, completed: 0, cancelled: 0 };
    orders.forEach((o) => {
      const s = o.status as keyof typeof counts;
      if (counts[s] !== undefined) counts[s] += 1;
    });
    return counts;
  }, [orders]);

  // Cảnh báo thông minh
  const pendingOrdersList = useMemo(() => orders.filter((o) => o.status === 'pending'), [orders]);
  const lowStockProducts = useMemo(() => products.filter((p) => (p.stock || 0) <= 5 && !p.isHidden), [products]);
  const pendingAlerts = useMemo(() => restockAlerts.filter((a) => a.status === 'pending'), [restockAlerts]);

  // Top 5 sản phẩm bán chạy nhất
  const topSelling = useMemo(() => {
    return [...products]
      .sort((a, b) => (b.sold || 0) - (a.sold || 0))
      .slice(0, 5);
  }, [products]);

  // 5 đơn hàng mới nhất
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => getOrderTime(b) - getOrderTime(a))
      .slice(0, 5);
  }, [orders]);

  const handleQuickConfirm = async (orderId: string) => {
    await updateOrderStatus(orderId, 'processing', adminProfile?.displayName || 'Thu ngân');
  };

  const periodOptions: { key: PeriodType; label: string }[] = [
    { key: 'today', label: t('filterToday') },
    { key: 'yesterday', label: t('filterYesterday') },
    { key: '7days', label: t('filter7Days') },
    { key: 'month', label: t('filterThisMonth') },
    { key: 'year', label: t('filterThisYear') },
    { key: 'all', label: t('filterAllTime') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          <View style={styles.headerBrandBadge}>
            <Ionicons name="sparkles" size={14} color="#9C7156" />
            <Text style={styles.headerBrandText}>Tiệm Nhà Gốm</Text>
          </View>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>
            {t('navOverview')} & Báo cáo
          </Text>
          <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
            Thu ngân: <Text style={{ fontWeight: '700', color: '#9C7156' }}>{adminProfile?.displayName || 'Nhân viên Tiệm'}</Text>
          </Text>
        </View>

        <View style={styles.headerActions}>
          <ScalePressable style={styles.btnLockHeader} onPress={lockShift}>
            <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
          </ScalePressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 84 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9C7156" />
        }
      >
        {/* SECTION 1: BỘ LỌC CHU KỲ BÁO CÁO (Time Period Selector Chips) */}
        <View style={styles.periodScrollWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodChipsContent}>
            {periodOptions.map((opt) => {
              const active = selectedPeriod === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.periodChip,
                    active && styles.periodChipActive,
                    {
                      backgroundColor: active ? '#9C7156' : isDark ? '#1E1E1E' : '#FFFFFF',
                      borderColor: active ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                  onPress={() => {
                    setSelectedPeriod(opt.key);
                    setSelectedBarIndex(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.periodChipText,
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

        {/* BANNER: Báo cáo Doanh thu & Sổ thuế Chuyên sâu */}
        <ScalePressable
          style={[
            styles.revenueReportBanner,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
          onPress={() => router.push('/revenue-report' as any)}
        >
          <View style={styles.revenueReportBannerLeft}>
            <View style={styles.revenueReportBannerIcon}>
              <Ionicons name="bar-chart" size={18} color="#9C7156" />
            </View>
            <View style={styles.revenueReportBannerTextGroup}>
              <Text style={[styles.revenueReportBannerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
                Báo cáo doanh thu & Nghĩa vụ thuế
              </Text>
              <Text style={[styles.revenueReportBannerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
                Xem theo Quý/Tháng/Ngày, sổ thuế 1.5% & khung giờ vàng
              </Text>
            </View>
          </View>
          <View style={styles.revenueReportBannerRight}>
            <Text style={styles.revenueReportBannerAction}>Chi tiết</Text>
            <Ionicons name="chevron-forward" size={15} color="#9C7156" />
          </View>
        </ScalePressable>

        {/* SECTION 2: CÁC CHỈ SỐ TÀI CHÍNH CỐT LÕI (Core Financial KPIs) */}
        <View style={styles.kpiGrid}>
          {/* Card 1: Doanh thu kỳ này */}
          <View
            style={[
              styles.kpiCardHero,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.kpiHeroHeader}>
              <View style={styles.kpiHeroTitleGroup}>
                <View style={styles.kpiIconCirclePrimary}>
                  <Ionicons name="wallet-outline" size={20} color="#9C7156" />
                </View>
                <Text style={[styles.kpiHeroLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                  {t('todayRevenue')} ({periodOptions.find((p) => p.key === selectedPeriod)?.label})
                </Text>
              </View>

              {stats.growthPercent !== 0 && (
                <View
                  style={[
                    styles.growthBadge,
                    {
                      backgroundColor: stats.growthPercent > 0 ? 'rgba(156, 113, 86, 0.12)' : 'rgba(220, 38, 38, 0.1)',
                    },
                  ]}
                >
                  <Ionicons
                    name={stats.growthPercent > 0 ? 'arrow-up' : 'arrow-down'}
                    size={13}
                    color={stats.growthPercent > 0 ? '#9C7156' : '#DC2626'}
                  />
                  <Text
                    style={[
                      styles.growthBadgeText,
                      { color: stats.growthPercent > 0 ? '#9C7156' : '#DC2626' },
                    ]}
                    numberOfLines={1}
                  >
                    {stats.growthPercent > 0 ? `+${stats.growthPercent}%` : `${stats.growthPercent}%`}
                  </Text>
                </View>
              )}
            </View>

            <Text
              style={[styles.kpiHeroValue, { color: Colors.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatCurrency(stats.grossRevenue)}
            </Text>

            <View style={styles.kpiHeroFooter}>
              <Text style={[styles.kpiHeroSubtext, { color: Colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                📦 <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{stats.completedOrdersCount}</Text> đơn hàng thành công
              </Text>
              <Text style={[styles.kpiHeroSubtext, { color: Colors.textSecondary, flexShrink: 0 }]} numberOfLines={1}>
                Thuần: <Text style={{ fontWeight: '700', color: '#9C7156' }}>{formatCurrency(stats.netRevenue)}</Text>
              </Text>
            </View>
          </View>

          {/* Hàng 2 Card nhỏ: Lợi nhuận dự tính & AOV */}
          <View style={styles.kpiRowTwo}>
            <View
              style={[
                styles.kpiCardHalf,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconCircleSmall}>
                <Ionicons name="trending-up-outline" size={17} color="#9C7156" />
              </View>
              <Text style={[styles.kpiCardHalfLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                {t('estimatedProfit')}
              </Text>
              <Text
                style={[styles.kpiCardHalfValue, { color: '#9C7156' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(stats.estGrossProfit)}
              </Text>
              <Text style={[styles.kpiCardHalfSub, { color: Colors.textMuted }]} numberOfLines={1}>
                Tỷ suất ~{stats.grossRevenue > 0 ? Math.round((stats.estGrossProfit / stats.grossRevenue) * 100) : 55}%
              </Text>
            </View>

            <View
              style={[
                styles.kpiCardHalf,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.kpiIconCircleSmall}>
                <Ionicons name="receipt-outline" size={17} color="#9C7156" />
              </View>
              <Text style={[styles.kpiCardHalfLabel, { color: Colors.textSecondary }]} numberOfLines={1}>
                {t('avgOrderValue')}
              </Text>
              <Text
                style={[styles.kpiCardHalfValue, { color: Colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCurrency(stats.avgOrderValue)}
              </Text>
              <Text style={[styles.kpiCardHalfSub, { color: Colors.textMuted }]} numberOfLines={1}>
                Hủy: {stats.cancelRate}% ({stats.cancelledOrdersCount} đơn)
              </Text>
            </View>
          </View>
        </View>

        {/* SECTION 3: BIỂU ĐỒ DOANH THU THEO THỜI GIAN (Interactive Revenue Bar Chart) */}
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
            <View>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
                {t('revenueTrend')}
              </Text>
              <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]}>
                Biến động doanh thu theo mốc thời gian đã chọn
              </Text>
            </View>

            <View style={styles.chartTotalBadge}>
              <Text style={styles.chartTotalBadgeText}>{formatCurrency(stats.grossRevenue)}</Text>
            </View>
          </View>

          {/* Interactive Bar Chart Canvas */}
          <View style={styles.chartContainer}>
            <View style={styles.chartBarsRow}>
              {stats.chartBars.map((bar, idx) => {
                const heightPercent = Math.max(12, Math.round((bar.value / stats.maxChartValue) * 100));
                const isSelected = selectedBarIndex === idx;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.chartBarCol}
                    onPress={() => setSelectedBarIndex(isSelected ? null : idx)}
                    activeOpacity={0.8}
                  >
                    {/* Tooltip on select */}
                    {isSelected && (
                      <View style={[styles.chartTooltip, { backgroundColor: isDark ? '#1E1E1E' : '#2B2928' }]}>
                        <Text style={styles.chartTooltipText}>{formatCurrency(bar.value)}</Text>
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
            </View>
          </View>
        </View>

        {/* SECTION 4: PHÂN BỔ KÊNH BÁN & PHƯƠNG THỨC THANH TOÁN */}
        <View style={styles.twoColumnGrid}>
          {/* Card Kênh Bán Hàng */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
              {t('channelBreakdown')}
            </Text>

            <View style={styles.distributionGroup}>
              {/* Quầy POS */}
              <View style={styles.distribRow}>
                <View style={styles.distribHeader}>
                  <Text style={[styles.distribName, { color: Colors.textPrimary }]}>
                    🛒 {t('posSales')}
                  </Text>
                  <Text style={[styles.distribValue, { color: '#9C7156' }]}>
                    {formatCurrency(stats.posChannelSales)}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${stats.grossRevenue > 0 ? Math.round((stats.posChannelSales / stats.grossRevenue) * 100) : 0}%`,
                        backgroundColor: '#9C7156',
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Online Web & App */}
              <View style={styles.distribRow}>
                <View style={styles.distribHeader}>
                  <Text style={[styles.distribName, { color: Colors.textPrimary }]}>
                    🌐 {t('onlineSales')}
                  </Text>
                  <Text style={[styles.distribValue, { color: '#9C7156' }]}>
                    {formatCurrency(stats.onlineChannelSales)}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${stats.grossRevenue > 0 ? Math.round((stats.onlineChannelSales / stats.grossRevenue) * 100) : 0}%`,
                        backgroundColor: '#E8CCB2',
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Card Phương Thức Thanh Toán */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
              {t('paymentBreakdown')}
            </Text>

            <View style={styles.distributionGroup}>
              {/* Tiền mặt */}
              <View style={styles.distribRow}>
                <View style={styles.distribHeader}>
                  <Text style={[styles.distribName, { color: Colors.textPrimary }]}>
                    💵 Tiền mặt
                  </Text>
                  <Text style={[styles.distribValue, { color: '#9C7156' }]}>
                    {formatCurrency(stats.cashSales)}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${stats.grossRevenue > 0 ? Math.round((stats.cashSales / stats.grossRevenue) * 100) : 0}%`,
                        backgroundColor: '#9C7156',
                      },
                    ]}
                  />
                </View>
              </View>

              {/* VietQR */}
              <View style={styles.distribRow}>
                <View style={styles.distribHeader}>
                  <Text style={[styles.distribName, { color: Colors.textPrimary }]}>
                    ⚡ Quét mã VietQR
                  </Text>
                  <Text style={[styles.distribValue, { color: '#9C7156' }]}>
                    {formatCurrency(stats.vietqrSales)}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${stats.grossRevenue > 0 ? Math.round((stats.vietqrSales / stats.grossRevenue) * 100) : 0}%`,
                        backgroundColor: '#2B2928',
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Thẻ ngân hàng */}
              <View style={styles.distribRow}>
                <View style={styles.distribHeader}>
                  <Text style={[styles.distribName, { color: Colors.textPrimary }]}>
                    💳 Quẹt thẻ POS
                  </Text>
                  <Text style={[styles.distribValue, { color: '#9C7156' }]}>
                    {formatCurrency(stats.cardSales)}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${stats.grossRevenue > 0 ? Math.round((stats.cardSales / stats.grossRevenue) * 100) : 0}%`,
                        backgroundColor: '#E8CCB2',
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* SECTION 5: CẢNH BÁO THÔNG MINH & TÁC VỤ CẦN XỬ LÝ (Smart Alerts & Tasks) */}
        <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>
          {t('smartAlertsTitle')}
        </Text>

        <View style={styles.alertsContainer}>
          {/* Alert 1: Đơn hàng online chờ duyệt */}
          {pendingOrdersList.length > 0 && (
            <ScalePressable
              style={[
                styles.alertCard,
                {
                  backgroundColor: isDark ? '#1C1917' : '#FFFBF5',
                  borderColor: '#E8CCB2',
                },
              ]}
              onPress={() => router.push('/(tabs)/orders')}
            >
              <View style={styles.alertIconCircle}>
                <Ionicons name="notifications" size={20} color="#9C7156" />
              </View>
              <View style={styles.alertTextGroup}>
                <Text style={[styles.alertTitle, { color: '#9C7156' }]}>
                  {pendingOrdersList.length} đơn hàng mới cần xác nhận
                </Text>
                <Text style={[styles.alertDesc, { color: Colors.textSecondary }]}>
                  Khách hàng vừa đặt đơn online, chạm để xử lý đóng gói ngay.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9C7156" />
            </ScalePressable>
          )}

          {/* Alert 2: Tồn kho sắp hết */}
          {lowStockProducts.length > 0 && (
            <ScalePressable
              style={[
                styles.alertCard,
                {
                  backgroundColor: isDark ? '#1C1917' : '#FFFBF5',
                  borderColor: '#E8CCB2',
                },
              ]}
              onPress={() => router.push('/(tabs)/inventory')}
            >
              <View style={styles.alertIconCircle}>
                <Ionicons name="alert-circle" size={20} color="#9C7156" />
              </View>
              <View style={styles.alertTextGroup}>
                <Text style={[styles.alertTitle, { color: '#9C7156' }]}>
                  {lowStockProducts.length} tác phẩm gốm sắp hết hàng (tồn ≤ 5)
                </Text>
                <Text style={[styles.alertDesc, { color: Colors.textSecondary }]}>
                  Cần lên kế hoạch nung gốm hoặc nhập thêm hàng vào kho.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9C7156" />
            </ScalePressable>
          )}

          {/* Alert 3: Khách chờ báo có hàng */}
          {pendingAlerts.length > 0 && (
            <ScalePressable
              style={[
                styles.alertCard,
                {
                  backgroundColor: isDark ? '#1C1917' : '#FFFBF5',
                  borderColor: '#E8CCB2',
                },
              ]}
              onPress={() => router.push('/restock-alerts' as any)}
            >
              <View style={styles.alertIconCircle}>
                <Ionicons name="chatbubbles" size={20} color="#9C7156" />
              </View>
              <View style={styles.alertTextGroup}>
                <Text style={[styles.alertTitle, { color: '#9C7156' }]}>
                  {pendingAlerts.length} yêu cầu báo có hàng từ khách
                </Text>
                <Text style={[styles.alertDesc, { color: Colors.textSecondary }]}>
                  Khách hàng đăng ký nhận thông báo khi có hàng lại.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9C7156" />
            </ScalePressable>
          )}

          {pendingOrdersList.length === 0 && lowStockProducts.length === 0 && pendingAlerts.length === 0 && (
            <View
              style={[
                styles.allGoodCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={26} color="#9C7156" />
              <Text style={[styles.allGoodText, { color: Colors.textPrimary }]}>
                Mọi đơn hàng & tồn kho đều trong trạng thái hoàn hảo!
              </Text>
            </View>
          )}
        </View>

        {/* SECTION 6: PHÍM TẮT THAO TÁC NHANH (Quick Action Shortcuts) */}
        <View style={styles.quickActionsGrid}>
          <ScalePressable
            style={[styles.quickActionBtn, { backgroundColor: '#9C7156' }]}
            onPress={() => router.push('/(tabs)/pos')}
          >
            <Ionicons name="cart" size={20} color="#FFFFFF" />
            <Text style={styles.quickActionText}>Bán hàng POS</Text>
          </ScalePressable>

          <ScalePressable
            style={[
              styles.quickActionBtnSecondary,
              {
                backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
            onPress={() => router.push('/product-edit/new' as any)}
          >
            <Ionicons name="add-circle-outline" size={20} color="#9C7156" />
            <Text style={[styles.quickActionTextSecondary, { color: Colors.textPrimary }]}>
              Thêm tác phẩm
            </Text>
          </ScalePressable>

          <ScalePressable
            style={[
              styles.quickActionBtnSecondary,
              {
                backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
            onPress={() => router.push('/flash-sale' as any)}
          >
            <Ionicons name="flame-outline" size={20} color="#9C7156" />
            <Text style={[styles.quickActionTextSecondary, { color: Colors.textPrimary }]}>
              Flash Sale
            </Text>
          </ScalePressable>

          <ScalePressable
            style={[
              styles.quickActionBtnSecondary,
              {
                backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
            onPress={() => router.push('/inventory-log' as any)}
          >
            <Ionicons name="clipboard-outline" size={20} color="#9C7156" />
            <Text style={[styles.quickActionTextSecondary, { color: Colors.textPrimary }]}>
              Nhật ký kho
            </Text>
          </ScalePressable>
        </View>

        {/* SECTION 7: TOP 5 SẢN PHẨM BÁN CHẠY NHẤT */}
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
            <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
              {t('topSellingTitle')}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/inventory')}>
              <Text style={styles.linkMoreText}>Xem kho &rarr;</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.topSellingList}>
            {topSelling.map((prod, index) => (
              <View key={prod.id} style={styles.topSellingRow}>
                <View style={styles.topSellingRankBadge}>
                  <Text style={styles.topSellingRankText}>{index + 1}</Text>
                </View>

                <Image
                  source={{ uri: prod.imageUrl || 'https://placehold.co/100x100?text=SP' }}
                  style={styles.topSellingThumb}
                  contentFit="cover"
                />

                <View style={styles.topSellingInfo}>
                  <Text style={[styles.topSellingName, { color: Colors.textPrimary }]} numberOfLines={1}>
                    {prod.name}
                  </Text>
                  <Text style={[styles.topSellingPrice, { color: '#9C7156' }]}>
                    {formatCurrency(prod.price)}
                  </Text>
                </View>

                <View style={styles.topSellingStats}>
                  <Text style={[styles.topSellingSoldCount, { color: Colors.textPrimary }]}>
                    {prod.sold || 0} đã bán
                  </Text>
                  <Text style={[styles.topSellingStockText, { color: Colors.textSecondary }]}>
                    Còn {prod.stock || 0} trong kho
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* SECTION 8: PHÂN BỔ TRẠNG THÁI ĐƠN HÀNG (Order Funnel Status) */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
            {t('orderStatusBreakdown')}
          </Text>

          <View style={styles.funnelGrid}>
            <View style={[styles.funnelPill, { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5' }]}>
              <Text style={[styles.funnelNumber, { color: '#9C7156' }]}>{statusCounts.pending}</Text>
              <Text style={[styles.funnelLabel, { color: Colors.textSecondary }]}>{t('statusPending')}</Text>
            </View>

            <View style={[styles.funnelPill, { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5' }]}>
              <Text style={[styles.funnelNumber, { color: '#9C7156' }]}>{statusCounts.processing}</Text>
              <Text style={[styles.funnelLabel, { color: Colors.textSecondary }]}>{t('statusProcessing')}</Text>
            </View>

            <View style={[styles.funnelPill, { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5' }]}>
              <Text style={[styles.funnelNumber, { color: '#9C7156' }]}>{statusCounts.shipping}</Text>
              <Text style={[styles.funnelLabel, { color: Colors.textSecondary }]}>{t('statusShipping')}</Text>
            </View>

            <View style={[styles.funnelPill, { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5' }]}>
              <Text style={[styles.funnelNumber, { color: '#9C7156' }]}>{statusCounts.completed}</Text>
              <Text style={[styles.funnelLabel, { color: Colors.textSecondary }]}>{t('statusCompleted')}</Text>
            </View>
          </View>
        </View>

        {/* SECTION 9: ĐƠN HÀNG MỚI NHẤT (Recent Orders Feed) */}
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
            <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
              {t('recentOrdersTitle')}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
              <Text style={styles.linkMoreText}>Xem tất cả &rarr;</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.recentOrdersList}>
            {recentOrders.map((order) => {
              const orderId = order.id;
              const isPos =
                order.source === 'pos' ||
                order.orderCode?.toUpperCase().includes('POS') ||
                order.id?.toUpperCase().includes('POS');
              const isPending = !isPos && order.status === 'pending';

              return (
                <TouchableOpacity
                  key={orderId}
                  style={styles.recentOrderRow}
                  onPress={() => router.push(`/order-detail/${orderId}` as any)}
                  activeOpacity={0.8}
                >
                  <View style={styles.recentOrderLeft}>
                    <View style={styles.recentOrderCodeRow}>
                      <Text style={[styles.recentOrderCode, { color: Colors.textPrimary }]} numberOfLines={1}>
                        #{order.orderCode || orderId.slice(0, 8)}
                      </Text>
                      {isPos && (
                        <View style={{ backgroundColor: isDark ? '#2B241E' : '#F6F0EA', borderColor: '#E8CCB2', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginRight: 6 }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#9C7156' }}>POS</Text>
                        </View>
                      )}
                      <View style={[styles.statusTag, { backgroundColor: 'rgba(156, 113, 86, 0.12)' }]}>
                        <Text style={styles.statusTagText} numberOfLines={1}>
                          {isPos ? 'Đã hoàn tất' : (t(`status${order.status.charAt(0).toUpperCase() + order.status.slice(1)}` as any) || order.status)}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.recentOrderCustomer, { color: Colors.textSecondary }]} numberOfLines={1}>
                      {order.customerName || 'Khách lẻ quầy'} • {formatDate(order.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.recentOrderRight}>
                    <Text style={[styles.recentOrderTotal, { color: '#9C7156' }]}>
                      {formatCurrency(order.totalAmount)}
                    </Text>

                    {isPending ? (
                      <ScalePressable
                        style={styles.btnQuickConfirm}
                        onPress={() => handleQuickConfirm(orderId)}
                      >
                        <Text style={styles.btnQuickConfirmText}>Duyệt</Text>
                      </ScalePressable>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: 8,
    zIndex: 10,
  },
  headerLeftGroup: {
    flex: 1,
  },
  headerBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  headerBrandText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnLockHeader: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  periodScrollWrapper: {
    marginBottom: 14,
  },
  periodChipsContent: {
    gap: 8,
  },
  periodChip: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  periodChipActive: {},
  periodChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  kpiGrid: {
    gap: 12,
    marginBottom: 16,
  },
  kpiCardHero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  kpiHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  kpiHeroTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 6,
  },
  kpiIconCirclePrimary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiHeroLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  growthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 2,
    flexShrink: 0,
  },
  growthBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  kpiHeroValue: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  kpiHeroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E1D8',
    gap: 8,
  },
  kpiHeroSubtext: {
    fontSize: 12,
  },
  kpiRowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiCardHalf: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  kpiIconCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(156, 113, 86, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiCardHalfLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  kpiCardHalfValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  kpiCardHalfSub: {
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
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
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
    justifyContent: 'space-around',
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
    width: 22,
    height: 110,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'transparent',
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
  twoColumnGrid: {
    gap: 12,
  },
  distributionGroup: {
    gap: 12,
    marginTop: 6,
  },
  distribRow: {},
  distribHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  distribName: {
    fontSize: 13,
    fontWeight: '600',
  },
  distribValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3.5,
  },
  sectionHeading: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
    marginBottom: 10,
    marginLeft: 4,
    marginTop: 4,
  },
  alertsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  alertCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertTextGroup: {
    flex: 1,
  },
  alertTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
  },
  alertDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  allGoodCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  allGoodText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    minWidth: '47%',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  quickActionText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quickActionBtnSecondary: {
    flex: 1,
    minWidth: '47%',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  quickActionTextSecondary: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
  },
  linkMoreText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  topSellingList: {
    gap: 12,
  },
  topSellingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topSellingRankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(156, 113, 86, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topSellingRankText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },
  topSellingThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#E8E1D8',
  },
  topSellingInfo: {
    flex: 1,
  },
  topSellingName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  topSellingPrice: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  topSellingStats: {
    alignItems: 'flex-end',
  },
  topSellingSoldCount: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  topSellingStockText: {
    fontSize: 11,
    marginTop: 2,
  },
  funnelGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  funnelPill: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  funnelNumber: {
    fontSize: 17,
    fontWeight: '700',
  },
  funnelLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  recentOrdersList: {
    gap: 12,
  },
  recentOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  recentOrderLeft: {
    flex: 1,
    marginRight: 10,
  },
  recentOrderCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  recentOrderCode: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  recentOrderCustomer: {
    fontSize: 12,
  },
  recentOrderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentOrderTotal: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  btnQuickConfirm: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  btnQuickConfirmText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  revenueReportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  revenueReportBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  revenueReportBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  revenueReportBannerTextGroup: {
    flex: 1,
  },
  revenueReportBannerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
  },
  revenueReportBannerSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  revenueReportBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  revenueReportBannerAction: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#9C7156',
  },
});
