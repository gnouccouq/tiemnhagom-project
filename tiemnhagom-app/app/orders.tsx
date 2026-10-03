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
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { EmptyState } from '../src/components/EmptyState';
import { lookupOrders, getUserOrders } from '../src/services/orderService';
import { useAuth } from '../src/context/AuthContext';
import { useRealtimeData } from '../src/context/RealtimeDataContext';
import { useSettings } from '../src/context/SettingsContext';
import { Order } from '../src/types';
import { formatCurrency, formatDate } from '../src/utils/format';

export default function OrdersScreen() {
  const router = useRouter();
  const { t } = useSettings();
  const { user } = useAuth();
  const { orders: realtimeOrders } = useRealtimeData();
  const [activeTab, setActiveTab] = useState<'lookup' | 'my-orders'>('lookup');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (activeTab === 'my-orders') {
      setOrders(realtimeOrders);
      setHasSearched(true);
    } else if (activeTab === 'lookup') {
      setOrders([]);
      setHasSearched(false);
    }
  }, [activeTab, realtimeOrders]);

  const handleLookup = async () => {
    if (!searchInput.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await lookupOrders(searchInput);
      setOrders(res);
    } catch (e) {
      console.warn('Lỗi tra cứu đơn: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('hoàn thành') || s.includes('thành công') || s.includes('completed')) {
      return { bg: '#F0FDF4', color: '#16A34A', icon: 'checkmark-circle' as const, label: t('statusCompleted') };
    }
    if (s.includes('đang giao') || s.includes('shipping') || s.includes('delivery')) {
      return { bg: '#EFF6FF', color: '#2563EB', icon: 'bicycle' as const, label: t('statusShipping') };
    }
    if (s.includes('hủy') || s.includes('cancelled') || s.includes('cancel')) {
      return { bg: '#FEF2F2', color: '#DC2626', icon: 'close-circle' as const, label: t('statusCancelled') };
    }
    return { bg: '#F5F3FF', color: '#7C3AED', icon: 'time' as const, label: status || t('statusProcessing') };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color="#111111" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('orderTitle')}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* ── Tab Switcher ── */}
      <View style={styles.tabWrap}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'lookup' && styles.tabActive]}
          onPress={() => setActiveTab('lookup')}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={14} color={activeTab === 'lookup' ? '#FFFFFF' : '#71717A'} />
          <Text style={[styles.tabText, activeTab === 'lookup' && styles.tabTextActive]}>{t('lookupOrder')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-orders' && styles.tabActive]}
          onPress={() => setActiveTab('my-orders')}
          activeOpacity={0.8}
        >
          <Ionicons name="receipt-outline" size={14} color={activeTab === 'my-orders' ? '#FFFFFF' : '#71717A'} />
          <Text style={[styles.tabText, activeTab === 'my-orders' && styles.tabTextActive]}>{t('myOrders')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tra cứu ── */}
        {activeTab === 'lookup' && (
          <View style={styles.lookupCard}>
            <View style={styles.lookupIconWrap}>
              <Ionicons name="search" size={22} color="#111111" />
            </View>
            <Text style={styles.lookupTitle}>{t('lookupOrderTitle')}</Text>
            <Text style={styles.lookupDesc}>
              {t('lookupOrderDesc')}
            </Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={16} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('lookupOrderPlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={searchInput}
                  onChangeText={setSearchInput}
                  returnKeyType="search"
                  onSubmitEditing={handleLookup}
                />
                {searchInput.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.lookupBtn} onPress={handleLookup} activeOpacity={0.85}>
                <Text style={styles.lookupBtnText}>{t('search')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Chưa đăng nhập ── */}
        {activeTab === 'my-orders' && !user && (
          <View style={styles.loginPrompt}>
            <Ionicons name="person-circle-outline" size={56} color="#D4D4D8" />
            <Text style={styles.loginTitle}>{t('notLoggedIn')}</Text>
            <Text style={styles.loginDesc}>
              {t('loginPromptDesc')}
            </Text>
            <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/auth/login' as any)} activeOpacity={0.85}>
              <Text style={styles.loginBtnText}>{t('loginNow')}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Loading ── */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#111111" />
            <Text style={styles.loadingText}>{t('loadingOrders')}</Text>
          </View>
        )}

        {/* ── Không tìm thấy ── */}
        {!loading && hasSearched && orders.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={44} color="#D4D4D8" />
            <Text style={styles.emptyTitle}>{t('noOrdersFound')}</Text>
            <Text style={styles.emptyDesc}>
              {activeTab === 'lookup'
                ? t('noOrdersLookupDesc')
                : t('noOrdersMyDesc')}
            </Text>
          </View>
        )}

        {/* ── Danh sách đơn ── */}
        {!loading && orders.length > 0 && (
          <View style={styles.ordersList}>
            <Text style={styles.resultsCount}>{orders.length} {t('ordersCount')}</Text>

            {orders.map((order, idx) => {
              const st = getStatusConfig(order.status);
              return (
                <View key={order.id || idx} style={styles.orderCard}>
                  {/* Header: Mã đơn + Trạng thái */}
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.orderCodeLabel}>{t('orderCodeLabel')}</Text>
                      <Text style={styles.orderCode}>
                        {order.orderCode || `#${String(order.id || '').slice(-6).toUpperCase()}`}
                      </Text>
                      <Text style={styles.orderDate}>Ngày đặt: {formatDate(order.orderDate)}</Text>
                    </View>
                    <View style={styles.cardHeaderRight}>
                      <Text style={styles.statusLabel}>{t('statusLabel')}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Progress Timeline */}
                  <View style={styles.timelineWrap}>
                    {[t('statusReceived') || 'Tiếp nhận', t('statusPacking') || 'Đóng gói', t('statusShipping') || 'Đang giao', t('statusDelivered') || 'Đã nhận'].map((step, sIdx) => {
                      let isActive = false;
                      if (st.label === t('statusCancelled') || st.label === 'Đã hủy') {
                        isActive = sIdx === 0;
                      } else if (st.label === t('statusCompleted') || st.label === 'Hoàn thành') {
                        isActive = true;
                      } else if (st.label === t('statusShipping') || st.label === 'Đang giao') {
                        isActive = sIdx <= 2;
                      } else {
                        const original = (order.status || '').toLowerCase();
                        if (original.includes('xác nhận') || original.includes('đóng gói')) {
                          isActive = sIdx <= 1;
                        } else {
                          isActive = sIdx === 0;
                        }
                      }

                      return (
                        <View key={step} style={styles.timelineStep}>
                          <View style={styles.timelineIconWrap}>
                            <View style={[styles.timelineIcon, isActive && styles.timelineIconActive]}>
                              {isActive && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                            </View>
                            {sIdx < 3 && <View style={[styles.timelineLine, isActive && styles.timelineLineActive]} />}
                          </View>
                          <Text style={[styles.timelineText, isActive && styles.timelineTextActive]}>{step}</Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.sep} />

                  {/* Sản phẩm */}
                  <View style={styles.itemsSection}>
                    <Text style={styles.itemsSectionLabel}>SẢN PHẨM ({order.items?.length || 0})</Text>
                    {order.items?.map((item, itemIdx) => (
                      <View key={itemIdx} style={styles.itemRow}>
                        <View style={styles.itemImageWrap}>
                          {item.variant?.imageUrl || item.imageUrl ? (
                            <Image
                              source={{ uri: item.variant?.imageUrl || item.imageUrl }}
                              style={styles.itemImage}
                              contentFit="cover"
                            />
                          ) : (
                            <Ionicons name="image-outline" size={20} color="#D4D4D8" />
                          )}
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {item.variant?.name ? (
                            <Text style={styles.itemVariant}>
                              {item.variant.type === 'color' ? 'Màu sắc' : item.variant.type === 'pattern' ? 'Họa tiết' : item.variant.type === 'combo' ? 'Combo' : 'Phân loại'}: {item.variant.name}
                            </Text>
                          ) : null}
                          <Text style={styles.itemQty}>SL: x{item.quantity}</Text>
                        </View>
                        <View style={styles.itemRight}>
                          <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Footer Details */}
                  <View style={styles.footerGrid}>
                    {/* Cột trái: Địa chỉ & Thanh toán */}
                    <View style={styles.footerLeft}>
                      <Text style={styles.footerLabel}>{t('shippingAddressLabel')}</Text>
                      <Text style={styles.footerTextBold}>
                        {order.customerName} - {order.shippingAddress?.phone?.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')}
                      </Text>
                      {Boolean(order.shippingAddress?.address) && (
                        <Text style={styles.footerText} numberOfLines={2}>
                          {order.shippingAddress?.address}
                        </Text>
                      )}
                      <Text style={[styles.footerText, { marginTop: 8 }]}>
                        Hình thức thanh toán: {order.paymentMethod === 'cod' ? 'Thanh toán khi nhận (COD)' : 'Chuyển khoản / Trực tiếp'}
                      </Text>
                    </View>

                    {/* Dấu phân cách dọc */}
                    <View style={styles.verticalSep} />

                    {/* Cột phải: Tổng kết tiền */}
                    <View style={styles.footerRight}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Tạm tính ({order.items?.length || 0} món):</Text>
                        <Text style={styles.summaryValue}>{formatCurrency(order.subtotal || order.items?.reduce((acc, i) => acc + i.price * i.quantity, 0) || 0)}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('shippingFeeLabel')}</Text>
                        <Text style={[styles.summaryValue, order.shippingFee === 0 && { color: '#16A34A' }]}>
                          {order.shippingFee === 0 ? '0đ (Miễn phí)' : formatCurrency(order.shippingFee || 0)}
                        </Text>
                      </View>
                      {Boolean(order.discountAmount) && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>{t('discountLabel')}</Text>
                          <Text style={styles.summaryValue}>-{formatCurrency(order.discountAmount)}</Text>
                        </View>
                      )}
                      
                      <View style={styles.horizontalSep} />
                      
                      <View style={styles.summaryRow}>
                        <Text style={styles.totalSumLabel}>{t('totalPaymentLabel')}</Text>
                        <Text style={styles.totalSumValue}>{formatCurrency(order.totalAmount)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FAF8F5',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  headerRight: {
    width: 38,
  },

  // Tabs
  tabWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: '#F4F4F5',
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 5,
  },
  tabActive: {
    backgroundColor: '#111111',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#71717A',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // Lookup
  lookupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 16,
  },
  lookupIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lookupTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
  },
  lookupDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#71717A',
    lineHeight: 18,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    fontSize: 13,
    color: '#111111',
    paddingVertical: 0,
  },
  lookupBtn: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingHorizontal: 20,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lookupBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Login prompt
  loginPrompt: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  loginTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginTop: 8,
  },
  loginDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 20,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111111',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 8,
  },
  loginBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // Loading
  loadingWrap: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    color: '#9CA3AF',
    fontSize: 13,
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptyDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Order list
  ordersList: {
    gap: 14,
  },
  resultsCount: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  // Order card
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  orderCodeLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
    letterSpacing: 1,
  },
  orderCode: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
  },
  orderDate: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  statusLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
  },
  sep: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginHorizontal: 16,
  },

  // Timeline
  timelineWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    position: 'relative',
  },
  timelineStep: {
    alignItems: 'center',
    flex: 1,
  },
  timelineIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
    height: 24,
  },
  timelineIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: '50%',
    marginLeft: -12,
    zIndex: 2,
  },
  timelineIconActive: {
    backgroundColor: '#16A34A',
  },
  timelineLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#E4E4E7',
    top: 11,
    left: '50%',
    right: '-50%',
    zIndex: 1,
  },
  timelineLineActive: {
    backgroundColor: '#16A34A',
  },
  timelineText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  timelineTextActive: {
    color: '#111111',
    fontWeight: '600',
  },

  // Items
  itemsSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  itemsSectionLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FAFAFA',
  },
  itemImageWrap: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#111111',
    lineHeight: 18,
    marginBottom: 4,
  },
  itemVariant: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#71717A',
    marginBottom: 2,
  },
  itemQty: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#9CA3AF',
  },
  itemRight: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    minWidth: 80,
    marginTop: 20,
  },
  itemPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },

  // Footer Details
  footerGrid: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    padding: 16,
    gap: 16,
  },
  footerLeft: {
    flex: 1,
  },
  footerLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#71717A',
    marginBottom: 4,
  },
  footerTextBold: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 2,
  },
  footerText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#71717A',
    lineHeight: 16,
  },
  verticalSep: {
    width: 1,
    backgroundColor: '#E4E4E7',
  },
  footerRight: {
    flex: 1,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#71717A',
  },
  summaryValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#111111',
  },
  horizontalSep: {
    height: 1,
    backgroundColor: '#E4E4E7',
    marginVertical: 4,
  },
  totalSumLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  totalSumValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
  },
});

