// app/(tabs)/orders.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { EmptyState } from '../../src/components/EmptyState';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { lookupOrders, getUserOrders } from '../../src/services/orderService';
import { useAuth } from '../../src/context/AuthContext';
import { Order } from '../../src/types';
import { formatCurrency, formatDate } from '../../src/utils/format';

export default function OrdersScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'lookup' | 'my-orders'>('lookup');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Load user orders when switching to "Đơn của tôi"
  useEffect(() => {
    if (activeTab === 'my-orders' && user) {
      setLoading(true);
      getUserOrders(user.uid)
        .then((res) => {
          setOrders(res);
          setHasSearched(true);
        })
        .finally(() => setLoading(false));
    } else if (activeTab === 'lookup') {
      setOrders([]);
      setHasSearched(false);
    }
  }, [activeTab, user]);

  const handleLookup = async () => {
    if (!searchInput.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await lookupOrders(searchInput);
      setOrders(res);
    } catch (e) {
      console.warn('Lỗi tra cứu đơn:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Hoàn thành':
        return { bg: '#E8F5E9', text: Colors.success };
      case 'Đang giao':
        return { bg: '#E1F5FE', text: Colors.info };
      case 'Đã hủy':
        return { bg: '#FFEBEE', text: Colors.error };
      default:
        return { bg: '#FFF3E0', text: Colors.warning };
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <Header title="Đơn hàng" showSearch={false} />

      {/* Tabs Switcher */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'lookup' && styles.tabButtonActive]}
          onPress={() => setActiveTab('lookup')}
        >
          <Text style={[styles.tabText, activeTab === 'lookup' && styles.tabTextActive]}>
            Tra cứu nhanh
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'my-orders' && styles.tabButtonActive]}
          onPress={() => setActiveTab('my-orders')}
        >
          <Text style={[styles.tabText, activeTab === 'my-orders' && styles.tabTextActive]}>
            Đơn của tôi
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'lookup' ? (
          <View>
            {/* Lookup Input Form */}
            <View style={styles.searchCard}>
              <Text style={styles.searchCardTitle}>Tra cứu tình trạng đơn hàng</Text>
              <Text style={styles.searchCardDesc}>
                Nhập Số điện thoại hoặc Mã đơn hàng (VD: TNG-XXXXXX) để kiểm tra lộ trình giao hàng gốm.
              </Text>

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="SĐT hoặc Mã đơn hàng..."
                  placeholderTextColor={Colors.textMuted}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  returnKeyType="search"
                  onSubmitEditing={handleLookup}
                />
                <TouchableOpacity style={styles.lookupBtn} onPress={handleLookup}>
                  <Text style={styles.lookupBtnText}>Tra cứu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : !user ? (
          <EmptyState
            icon="person-circle-outline"
            title="Chưa đăng nhập"
            message="Hãy đăng nhập để xem toàn bộ lịch sử đơn hàng đã đặt và tích lũy điểm thưởng thành viên."
            buttonText="Đăng nhập ngay"
            onButtonPress={() => {}}
          />
        ) : null}

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tra cứu dữ liệu đơn...</Text>
          </View>
        )}

        {/* Order Results List */}
        {!loading && hasSearched && orders.length === 0 && (
          <EmptyState
            icon="receipt-outline"
            title="Không tìm thấy đơn hàng"
            message="Không tìm thấy đơn hàng phù hợp với thông tin đã nhập. Vui lòng kiểm tra lại SĐT hoặc mã đơn."
          />
        )}

        {!loading && orders.length > 0 && (
          <View style={styles.ordersList}>
            <Text style={styles.resultsCount}>Tìm thấy {orders.length} đơn hàng</Text>
            {orders.map((order, idx) => {
              const badge = getStatusBadge(order.status);
              return (
                <View key={order.id || idx} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderCode}>{order.orderCode}</Text>
                      <Text style={styles.orderDate}>{formatDate(order.orderDate)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusText, { color: badge.text }]}>
                        {order.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Customer Info */}
                  <View style={styles.customerRow}>
                    <Ionicons name="person-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.customerText}>
                      {order.customerName} - {order.shippingAddress?.phone}
                    </Text>
                  </View>

                  <View style={styles.customerRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.customerText} numberOfLines={2}>
                      {order.shippingAddress?.address}
                    </Text>
                  </View>

                  {/* Items Preview */}
                  <View style={styles.itemsPreview}>
                    {order.items?.map((item, itemIdx) => (
                      <View key={itemIdx} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          • {item.name} {item.variant?.name ? `(${item.variant.name})` : ''}
                        </Text>
                        <Text style={styles.itemQtyPrice}>
                          x{item.quantity} | {formatCurrency(item.price * item.quantity)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.divider} />

                  {/* Total Amount & Method */}
                  <View style={styles.orderFooter}>
                    <View>
                      <Text style={styles.paymentMethod}>
                        Thanh toán: {order.paymentMethod === 'cod' ? 'Tiền mặt khi nhận (COD)' : 'Chuyển khoản QR'}
                      </Text>
                    </View>
                    <View style={styles.totalWrap}>
                      <Text style={styles.totalLabel}>Tổng tiền:</Text>
                      <Text style={styles.totalValue}>{formatCurrency(order.totalAmount)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.xs,
  },
  tabButtonActive: {
    backgroundColor: Colors.cardBackground,
    ...Shadows.sm,
  },
  tabText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    fontFamily: 'ElleGaborStd',
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  searchCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
    marginBottom: Spacing.md,
  },
  searchCardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  searchCardDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  input: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  lookupBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lookupBtnText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: Typography.fontSize.sm,
  },
  loadingWrap: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    marginTop: Spacing.sm,
    color: Colors.textMuted,
    fontSize: Typography.fontSize.sm,
  },
  resultsCount: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  ordersList: {
    gap: Spacing.md,
  },
  orderCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderCode: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.base,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  orderDate: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
  },
  statusText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  customerText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    flex: 1,
  },
  itemsPreview: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xs,
    padding: Spacing.sm,
    marginVertical: Spacing.xs,
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  itemQtyPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethod: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  totalWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  totalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.md,
    fontWeight: '700',
    color: Colors.primary,
  },
});
