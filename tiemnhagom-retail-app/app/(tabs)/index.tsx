// app/(tabs)/index.tsx
import React, { useState, useEffect } from 'react';
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
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { subscribeOrders, updateOrderStatus } from '../../src/services/adminOrderService';
import { subscribeProducts } from '../../src/services/adminProductService';
import { Order, Product } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { LiquidGlass } from '../../src/components/LiquidGlass';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

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
  const [refreshing, setRefreshing] = useState(false);

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
    return () => {
      unsubOrders();
      unsubProducts();
    };
  }, [canOverview]);

  // Tính toán KPI
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();

  let todayRevenue = 0;
  let todayOrdersCount = 0;
  let weekRevenue = 0;
  let pendingOrdersCount = 0;

  orders.forEach((o) => {
    const time = o.createdAt?.seconds ? o.createdAt.seconds * 1000 : new Date(o.createdAt).getTime() || 0;
    if (o.status !== 'cancelled') {
      if (time >= startOfToday) {
        todayRevenue += o.totalAmount || 0;
        todayOrdersCount += 1;
      }
      if (time >= startOfWeek) {
        weekRevenue += o.totalAmount || 0;
      }
    }
    if (o.status === 'pending') {
      pendingOrdersCount += 1;
    }
  });

  const lowStockProducts = products.filter((p) => p.stock <= 5 && !p.isHidden);
  const pendingOrders = orders.filter((o) => o.status === 'pending').slice(0, 5);
  const topSelling = [...products].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 5);

  const handleQuickConfirm = async (orderId: string) => {
    await updateOrderStatus(orderId, 'processing', adminProfile?.displayName || 'Thu ngân');
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Image
            source={
              isDark
                ? require('../../assets/images/LOGO_WHITE.png')
                : require('../../assets/images/LOGO_2_PNG.png')
            }
            style={styles.headerLogo}
            contentFit="contain"
          />
          <View style={styles.headerStaffBadge}>
            <View style={styles.statusDot} />
            <Text style={[styles.headerStaffText, { color: Colors.textSecondary }]} numberOfLines={1}>
              {adminProfile?.displayName || 'Nhân viên'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Quick Lock Shift */}
          <ScalePressable style={styles.headerIconBtn} onPress={lockShift}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.textPrimary} />
          </ScalePressable>

          {/* POS Shortcut Button */}
          <ScalePressable
            style={styles.headerPosPill}
            onPress={() => router.push('/(tabs)/pos' as any)}
          >
            <Ionicons name="cart" size={17} color="#FFFFFF" />
            <Text style={styles.headerPosPillText}>POS</Text>
          </ScalePressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollBody,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 84, // Tránh che khuất sau Floating Tab Bar
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 800);
            }}
            tintColor="#9C7156"
          />
        }
      >
        {/* KPI CARDS 2x2 GRID */}
        <View style={styles.kpiGrid}>
          {/* 1. Doanh thu hôm nay */}
          <View style={[styles.kpiCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="wallet-outline" size={20} color="#9C7156" />
            </View>
            <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]}>{t('todayRevenue')}</Text>
            <Text style={[styles.kpiValue, { color: Colors.textPrimary }]}>{formatCurrency(todayRevenue)}</Text>
            <Text style={[styles.kpiSub, { color: Colors.textMuted }]}>{todayOrdersCount} đơn hôm nay</Text>
          </View>

          {/* 2. Đơn chờ duyệt */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/(tabs)/orders' as any)}
            style={[styles.kpiCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
          >
            <View style={[styles.kpiIconWrap, pendingOrdersCount > 0 && { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="time-outline" size={20} color={pendingOrdersCount > 0 ? '#DC2626' : '#9C7156'} />
            </View>
            <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]}>{t('pendingOrders')}</Text>
            <Text style={[styles.kpiValue, pendingOrdersCount > 0 ? { color: '#DC2626' } : { color: Colors.textPrimary }]}>
              {pendingOrdersCount}
            </Text>
            <Text style={[styles.kpiSub, { color: Colors.textMuted }]}>Cần xác nhận ngay</Text>
          </TouchableOpacity>

          {/* 3. Doanh thu tuần này */}
          <View style={[styles.kpiCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <View style={styles.kpiIconWrap}>
              <Ionicons name="trending-up-outline" size={20} color="#9C7156" />
            </View>
            <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]}>{t('weeklyRevenue')}</Text>
            <Text style={[styles.kpiValue, { color: Colors.textPrimary }]}>{formatCurrency(weekRevenue)}</Text>
            <Text style={[styles.kpiSub, { color: Colors.textMuted }]}>Tuần hiện tại</Text>
          </View>

          {/* 4. Cảnh báo kho */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/(tabs)/inventory' as any)}
            style={[styles.kpiCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
          >
            <View style={[styles.kpiIconWrap, lowStockProducts.length > 0 && { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="alert-circle-outline" size={20} color={lowStockProducts.length > 0 ? '#D97706' : '#9C7156'} />
            </View>
            <Text style={[styles.kpiLabel, { color: Colors.textSecondary }]}>{t('lowStockItems')}</Text>
            <Text style={[styles.kpiValue, lowStockProducts.length > 0 ? { color: '#D97706' } : { color: Colors.textPrimary }]}>
              {lowStockProducts.length}
            </Text>
            <Text style={[styles.kpiSub, { color: Colors.textMuted }]}>Tồn kho ≤ 5</Text>
          </TouchableOpacity>
        </View>

        {/* QUICK ACTION PILLS ROW */}
        <View style={styles.quickActionRow}>
          <ScalePressable
            style={[styles.quickPill, { backgroundColor: '#9C7156' }]}
            onPress={() => router.push('/(tabs)/pos' as any)}
          >
            <Ionicons name="cart" size={16} color="#FFFFFF" />
            <Text style={[styles.quickPillText, { color: '#FFFFFF' }]}>{t('quickActionPOS')}</Text>
          </ScalePressable>

          <ScalePressable
            style={[styles.quickPill, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: Colors.border, borderWidth: 1 }]}
            onPress={() => router.push('/product-edit/new' as any)}
          >
            <Ionicons name="add-circle-outline" size={16} color={Colors.textPrimary} />
            <Text style={[styles.quickPillText, { color: Colors.textPrimary }]}>{t('quickActionAddProduct')}</Text>
          </ScalePressable>

          <ScalePressable
            style={[styles.quickPill, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: Colors.border, borderWidth: 1 }]}
            onPress={() => router.push('/(tabs)/orders' as any)}
          >
            <Ionicons name="receipt-outline" size={16} color={Colors.textPrimary} />
            <Text style={[styles.quickPillText, { color: Colors.textPrimary }]}>{t('quickActionCheckOrders')}</Text>
          </ScalePressable>
        </View>

        {/* PENDING ORDERS SECTION */}
        {pendingOrders.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleGroup}>
                <View style={[styles.dotAlert, { backgroundColor: '#DC2626' }]} />
                <Text style={[styles.sectionTitle, { color: Colors.textPrimary }]}>Đơn chờ xác nhận ({pendingOrdersCount})</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/orders' as any)}>
                <Text style={styles.seeAllText}>Xem tất cả</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.orderList}>
              {pendingOrders.map((ord) => (
                <View
                  key={ord.id}
                  style={[
                    styles.orderCard,
                    {
                      backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                >
                  <View style={styles.orderCardHeader}>
                    <View>
                      <Text style={[styles.orderCode, { color: Colors.textPrimary }]}>{ord.orderCode}</Text>
                      <Text style={[styles.orderCustName, { color: Colors.textSecondary }]}>{ord.customerName} • {ord.customerPhone}</Text>
                    </View>
                    <Text style={styles.orderPrice}>{formatCurrency(ord.totalAmount)}</Text>
                  </View>

                  <View style={styles.orderDivider} />

                  <View style={styles.orderCardFooter}>
                    <Text style={[styles.orderItemCount, { color: Colors.textMuted }]}>{ord.items?.length || 0} món đồ gốm</Text>
                    <View style={styles.orderActionRow}>
                      <TouchableOpacity
                        style={styles.btnDetail}
                        onPress={() => router.push(`/order-detail/${ord.id}` as any)}
                      >
                        <Text style={[styles.btnDetailText, { color: Colors.textPrimary }]}>Chi tiết</Text>
                      </TouchableOpacity>
                      <ScalePressable
                        style={styles.btnQuickConfirm}
                        onPress={() => handleQuickConfirm(ord.id)}
                      >
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        <Text style={styles.btnQuickConfirmText}>Xác nhận</Text>
                      </ScalePressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* TOP SELLING PRODUCTS */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: Colors.textPrimary }]}>{t('topSellingTitle')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/inventory' as any)}>
              <Text style={styles.seeAllText}>Xem kho</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.cardBox,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            {topSelling.map((p, idx) => (
              <View key={p.id}>
                <TouchableOpacity
                  style={styles.productRow}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/product-edit/${p.id}` as any)}
                >
                  <View style={styles.productLeft}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{idx + 1}</Text>
                    </View>
                    <Image
                      source={p.imageUrl ? { uri: p.imageUrl } : require('../../assets/images/LOGO.jpg')}
                      style={styles.productThumb}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.productName, { color: Colors.textPrimary }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={[styles.productCategory, { color: Colors.textMuted }]}>
                        {p.category} • Tồn: {p.stock}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.productRight}>
                    <Text style={styles.productSold}>{p.sold || 0} đã bán</Text>
                    <Text style={[styles.productPrice, { color: Colors.textPrimary }]}>{formatCurrency(p.salePrice || p.price)}</Text>
                  </View>
                </TouchableOpacity>
                {idx < topSelling.length - 1 && <View style={[styles.rowDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />}
              </View>
            ))}
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 110,
    height: 38,
  },
  headerStaffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(156, 113, 86, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9C7156',
  },
  headerStaffText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    fontWeight: '600',
    maxWidth: 90,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  headerPosPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#9C7156',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  headerPosPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    width: '48%',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(156, 113, 86, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 17.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  kpiSub: {
    fontSize: 11,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  quickPill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '600',
  },
  sectionWrap: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotAlert: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
  },
  seeAllText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#9C7156',
  },
  orderList: {
    gap: 10,
  },
  orderCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderCode: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  orderCustName: {
    fontSize: 12,
  },
  orderPrice: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#F0ECE6',
    marginVertical: 10,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderItemCount: {
    fontSize: 12,
  },
  orderActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnDetail: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
  },
  btnDetailText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
  },
  btnQuickConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#9C7156',
  },
  btnQuickConfirmText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardBox: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  productLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  rankBadge: {
    width: 20,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9C7156',
  },
  productThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FAF8F5',
  },
  productName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  productCategory: {
    fontSize: 11.5,
    marginTop: 2,
  },
  productRight: {
    alignItems: 'flex-end',
  },
  productSold: {
    fontSize: 11,
    color: '#9C7156',
    fontWeight: '600',
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  rowDivider: {
    height: 1,
  },
});
