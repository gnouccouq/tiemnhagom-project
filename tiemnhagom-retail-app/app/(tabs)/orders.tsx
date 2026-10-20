// app/(tabs)/orders.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { subscribeOrders, updateOrderStatus } from '../../src/services/adminOrderService';
import { subscribeRentalOrders, updateRentalStatus } from '../../src/services/adminRentalOrderService';
import { Order, OrderStatus, RentalOrder, RentalStatus } from '../../src/types';
import { formatCurrency, formatDate } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();
  const { t } = useSettings();

  const [activeTab, setActiveTab] = useState<'online' | 'rental'>('online');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [rentalOrders, setRentalOrders] = useState<RentalOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubOrders = subscribeOrders((data) => setOrders(data));
    const unsubRentals = subscribeRentalOrders((data) => setRentalOrders(data));
    return () => {
      unsubOrders();
      unsubRentals();
    };
  }, []);

  // Filter Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const isPos =
        o.source === 'pos' ||
        o.orderCode?.toUpperCase().includes('POS') ||
        o.id?.toUpperCase().includes('POS');
      const effStatus = isPos && o.status !== 'cancelled' ? 'completed' : o.status;
      const matchStatus = selectedStatus === 'all' || effStatus === selectedStatus;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        o.orderCode?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q);
      return matchStatus && matchQuery;
    });
  }, [orders, selectedStatus, searchQuery]);

  // Filter Rentals
  const filteredRentals = useMemo(() => {
    return rentalOrders.filter((r) => {
      const matchStatus = selectedStatus === 'all' || r.status === selectedStatus;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        r.orderCode?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.customerPhone?.includes(q);
      return matchStatus && matchQuery;
    });
  }, [rentalOrders, selectedStatus, searchQuery]);

  const getStatusBadge = (status: OrderStatus | RentalStatus, isPos = false) => {
    if (isPos && status !== 'cancelled') {
      return { label: 'Đã hoàn tất', bg: 'rgba(156, 113, 86, 0.15)', text: '#9C7156' };
    }
    switch (status) {
      case 'pending':
      case 'pending_deposit':
        return { label: 'Chờ duyệt', bg: '#FEF3C7', text: '#D97706' };
      case 'processing':
      case 'deposit_paid':
        return { label: 'Đang xử lý', bg: '#E0F2FE', text: '#0284C7' };
      case 'shipping':
      case 'renting':
        return { label: 'Đang giao / Thuê', bg: '#F3E8FF', text: '#7E22CE' };
      case 'completed':
      case 'returned':
        return { label: 'Đã hoàn tất', bg: 'rgba(156, 113, 86, 0.15)', text: '#9C7156' };
      case 'cancelled':
        return { label: 'Đã hủy', bg: '#FEE2E2', text: '#DC2626' };
      default:
        return { label: status, bg: '#F3F4F6', text: '#4B5563' };
    }
  };

  const handleAdvanceStatus = async (order: Order) => {
    const isPos =
      order.source === 'pos' ||
      order.orderCode?.toUpperCase().includes('POS') ||
      order.id?.toUpperCase().includes('POS');
    if (isPos) return; // Đơn POS đã hoàn tất tại quầy

    let nextStatus: OrderStatus | null = null;
    if (order.status === 'pending') nextStatus = 'processing';
    else if (order.status === 'processing') nextStatus = 'shipping';
    else if (order.status === 'shipping') nextStatus = 'completed';

    if (nextStatus) {
      await updateOrderStatus(order.id, nextStatus, adminProfile?.displayName);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>{t('navOrders')}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{filteredOrders.length}</Text>
          </View>
        </View>

        {/* Tab Segment (Mua hàng / Thuê decor) */}
        <View style={[styles.segmentContainer, { backgroundColor: isDark ? '#1E1E1E' : '#F0ECE6' }]}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'online' && styles.segmentBtnActive]}
            onPress={() => {
              setActiveTab('online');
              setSelectedStatus('all');
            }}
          >
            <Text style={[styles.segmentText, activeTab === 'online' && styles.segmentTextActive]}>
              {t('tabOnlineOrders')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'rental' && styles.segmentBtnActive]}
            onPress={() => {
              setActiveTab('rental');
              setSelectedStatus('all');
            }}
          >
            <Text style={[styles.segmentText, activeTab === 'rental' && styles.segmentTextActive]}>
              {t('tabRentalOrders')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar (Pill shape 52px) */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchPill, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="search-outline" size={19} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: Colors.textPrimary }]}
            placeholder={t('searchOrderPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Status Filter Chips Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusChipsScroll}
      >
        {activeTab === 'online' ? (
          <>
            {[
              { id: 'all', label: t('statusAll') },
              { id: 'pending', label: t('statusPending') },
              { id: 'processing', label: t('statusProcessing') },
              { id: 'shipping', label: t('statusShipping') },
              { id: 'completed', label: t('statusCompleted') },
              { id: 'cancelled', label: t('statusCancelled') },
            ].map((st) => {
              const active = selectedStatus === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                    {
                      backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: active ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                  onPress={() => setSelectedStatus(st.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <>
            {[
              { id: 'all', label: t('statusAll') },
              { id: 'pending_deposit', label: t('rentalPendingDeposit') },
              { id: 'deposit_paid', label: t('rentalDepositPaid') },
              { id: 'renting', label: t('rentalRenting') },
              { id: 'returned', label: t('rentalReturned') },
            ].map((st) => {
              const active = selectedStatus === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                    {
                      backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: active ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                  onPress={() => setSelectedStatus(st.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary,
                        fontWeight: active ? '700' : '500',
                      },
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Orders List Content */}
      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 84,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 600);
            }}
            tintColor="#9C7156"
          />
        }
      >
        {activeTab === 'online' ? (
          filteredOrders.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
              <Text style={[styles.emptyText, { color: Colors.textMuted }]}>Không có đơn hàng nào</Text>
            </View>
          ) : (
            filteredOrders.map((ord) => {
              const isPos =
                ord.source === 'pos' ||
                ord.orderCode?.toUpperCase().includes('POS') ||
                ord.id?.toUpperCase().includes('POS');
              const badge = getStatusBadge(ord.status, isPos);
              return (
                <TouchableOpacity
                  key={ord.id}
                  style={[
                    styles.orderCard,
                    {
                      backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                  activeOpacity={0.88}
                  onPress={() => router.push(`/order-detail/${ord.id}` as any)}
                >
                  <View style={styles.orderTop}>
                    <View style={styles.orderTopLeft}>
                      <Text style={[styles.orderCode, { color: Colors.textPrimary }]} numberOfLines={1}>{ord.orderCode}</Text>
                      {isPos && (
                        <View style={[styles.posBadge, { backgroundColor: isDark ? '#2B241E' : '#F6F0EA', borderColor: '#E8CCB2', borderWidth: 1 }]}>
                          <Ionicons name="storefront-outline" size={11} color="#9C7156" style={{ marginRight: 3 }} />
                          <Text style={[styles.posBadgeText, { color: '#9C7156', fontWeight: '700' }]}>BÁN TẠI QUẦY (POS)</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]} numberOfLines={1}>{badge.label}</Text>
                    </View>
                  </View>

                  <Text style={[styles.custName, { color: Colors.textPrimary }]} numberOfLines={1}>
                    {ord.customerName} {ord.customerPhone ? `• ${ord.customerPhone}` : ''}
                  </Text>

                  {/* Items summary */}
                  <View style={styles.itemsSummary}>
                    <Text style={[styles.itemsSummaryText, { color: Colors.textSecondary }]} numberOfLines={1}>
                      {ord.items?.map((it) => `${it.name} (x${it.quantity})`).join(', ') || 'Chi tiết đơn'}
                    </Text>
                  </View>

                  <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

                  <View style={styles.orderBottom}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.paymentLabel, { color: isPos || ord.paymentStatus === 'paid' ? '#9C7156' : Colors.textMuted, fontWeight: isPos || ord.paymentStatus === 'paid' ? '700' : '500' }]} numberOfLines={1}>
                        {ord.paymentMethod.toUpperCase()} • {isPos || ord.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                      </Text>
                      <Text style={styles.orderTotal} numberOfLines={1}>{formatCurrency(ord.totalAmount)}</Text>
                    </View>

                    {/* Quick action button */}
                    {!isPos && ord.status !== 'completed' && ord.status !== 'cancelled' ? (
                      <ScalePressable
                        style={styles.btnAdvance}
                        onPress={() => handleAdvanceStatus(ord)}
                      >
                        <Text style={styles.btnAdvanceText} numberOfLines={1}>
                          {ord.status === 'pending'
                            ? 'Duyệt đơn'
                            : ord.status === 'processing'
                            ? 'Giao hàng'
                            : 'Hoàn tất'}
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                      </ScalePressable>
                    ) : (
                      <View style={styles.finishedBadge}>
                        <Ionicons name="checkmark-circle" size={15} color="#9C7156" />
                        <Text style={styles.finishedText} numberOfLines={1}>
                          {ord.status === 'cancelled' ? 'Đã hủy' : 'Đã hoàn tất'}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )
        ) : (
          filteredRentals.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
              <Text style={[styles.emptyText, { color: Colors.textMuted }]}>Không có đơn thuê decor nào</Text>
            </View>
          ) : (
            filteredRentals.map((rent) => {
              const badge = getStatusBadge(rent.status);
              return (
                <TouchableOpacity
                  key={rent.id}
                  style={[
                    styles.orderCard,
                    {
                      backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: isDark ? 'transparent' : '#E8E1D8',
                    },
                  ]}
                  activeOpacity={0.88}
                  onPress={() => router.push(`/rental-detail/${rent.id}` as any)}
                >
                  <View style={styles.orderTop}>
                    <Text style={[styles.orderCode, { color: Colors.textPrimary }]} numberOfLines={1}>{rent.orderCode}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]} numberOfLines={1}>{badge.label}</Text>
                    </View>
                  </View>

                  <Text style={[styles.custName, { color: Colors.textPrimary }]} numberOfLines={1}>
                    {rent.customerName} • {rent.customerPhone}
                  </Text>
                  <Text style={[styles.rentalDates, { color: Colors.textSecondary }]} numberOfLines={1}>
                    📅 Thuê: {rent.startDate} ⮂ {rent.endDate} ({rent.rentalDays} ngày)
                  </Text>

                  <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

                  <View style={styles.orderBottom}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.paymentLabel, { color: Colors.textMuted }]} numberOfLines={1}>
                        Cọc: {formatCurrency(rent.totalDeposit)}
                      </Text>
                      <Text style={styles.orderTotal} numberOfLines={1}>Phí thuê: {formatCurrency(rent.totalRentalFee)}</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.btnDetailOnly}
                      onPress={() => router.push(`/rental-detail/${rent.id}` as any)}
                    >
                      <Text style={[styles.btnDetailOnlyText, { color: Colors.textPrimary }]} numberOfLines={1}>Chi tiết</Text>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )
        )}
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
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  segmentContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 18,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  segmentBtnActive: {
    backgroundColor: '#9C7156',
  },
  segmentText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#6E665D',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchPill: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
  },
  statusChipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipActive: {},
  chipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  orderCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  orderTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  orderCode: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  posBadge: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  posBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  custName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemsSummary: {
    marginBottom: 6,
  },
  itemsSummaryText: {
    fontSize: 12.5,
  },
  rentalDates: {
    fontSize: 12,
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    marginVertical: 10,
  },
  orderBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  orderTotal: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  btnAdvance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9C7156',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  btnAdvanceText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  finishedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  finishedText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#9C7156',
  },
  btnDetailOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  btnDetailOnlyText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 10,
  },
});
