// app/order-detail/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { updateOrderStatus, addOrderInternalNote } from '../../src/services/adminOrderService';
import { Order, OrderStatus } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [internalNoteInput, setInternalNoteInput] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);

  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'orders', id);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const ord: Order = {
          id: docSnap.id,
          orderCode: data.orderCode || docSnap.id,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          customerName: data.customerName || data.shippingAddress?.fullName || 'Khách hàng',
          customerPhone: data.customerPhone || data.shippingAddress?.phone || '',
          customerEmail: data.customerEmail || '',
          shippingAddress: data.shippingAddress,
          items: data.items || [],
          subtotal: data.subtotal || data.totalAmount || 0,
          discountAmount: data.discountAmount || 0,
          pointsUsed: data.pointsUsed || 0,
          pointsEarned: data.pointsEarned || 0,
          shippingFee: data.shippingFee || 0,
          totalAmount: data.totalAmount || 0,
          status: (data.status || 'pending') as OrderStatus,
          paymentMethod: data.paymentMethod || 'cod',
          paymentStatus: data.paymentStatus || 'unpaid',
          source: data.source || 'online',
          staffId: data.staffId,
          staffName: data.staffName,
          notes: data.notes || '',
          internalNotes: data.internalNotes || '',
        };
        setOrder(ord);
        setInternalNoteInput(ord.internalNotes || '');
      }
    });

    return () => unsub();
  }, [id]);

  if (!order) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>Đang tải chi tiết đơn hàng...</Text>
      </View>
    );
  }

  const handleStatusChange = async (newStatus: OrderStatus) => {
    await updateOrderStatus(order.id, newStatus, adminProfile?.displayName);
  };

  const handleSaveInternalNote = async () => {
    await addOrderInternalNote(order.id, internalNoteInput.trim());
    setIsEditingNote(false);
  };

  const handleCallCustomer = () => {
    if (order.customerPhone) {
      Linking.openURL(`tel:${order.customerPhone}`);
    } else {
      Alert.alert('Không có SĐT', 'Đơn hàng này không có số điện thoại khách hàng.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backCircleBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerOrderCode, { color: Colors.textPrimary }]}>{order.orderCode}</Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]}>
              {order.source === 'pos' ? 'Đơn bán tại quầy' : 'Đơn đặt trực tuyến'}
            </Text>
          </View>
        </View>

        {order.customerPhone ? (
          <ScalePressable style={styles.btnCall} onPress={handleCallCustomer}>
            <Ionicons name="call" size={16} color="#FFFFFF" />
            <Text style={styles.btnCallText}>Gọi khách</Text>
          </ScalePressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollBody,
          {
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Selector Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Trạng thái đơn hàng</Text>
          <View style={styles.statusButtonsRow}>
            {[
              { id: 'pending', label: 'Chờ duyệt' },
              { id: 'processing', label: 'Đang xử lý' },
              { id: 'shipping', label: 'Đang giao' },
              { id: 'completed', label: 'Đã hoàn tất' },
              { id: 'cancelled', label: 'Hủy đơn' },
            ].map((st) => {
              const active = order.status === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.statusPillBtn,
                    active && styles.statusPillBtnActive,
                    {
                      borderColor: active ? '#9C7156' : isDark ? '#333' : '#E8E1D8',
                      backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : 'transparent',
                    },
                  ]}
                  onPress={() => handleStatusChange(st.id as OrderStatus)}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary },
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Customer & Delivery Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Thông tin giao nhận</Text>

          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={17} color="#9C7156" style={styles.infoIcon} />
            <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Khách hàng:</Text>
            <Text style={[styles.infoVal, { color: Colors.textPrimary }]}>{order.customerName}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={17} color="#9C7156" style={styles.infoIcon} />
            <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Số điện thoại:</Text>
            <Text style={[styles.infoVal, { color: Colors.textPrimary }]}>{order.customerPhone || 'Chưa có'}</Text>
          </View>

          {order.shippingAddress && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={17} color="#9C7156" style={styles.infoIcon} />
              <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Địa chỉ:</Text>
              <Text style={[styles.infoVal, { color: Colors.textPrimary, flex: 1 }]}>
                {typeof order.shippingAddress === 'string'
                  ? order.shippingAddress
                  : `${order.shippingAddress.address || order.shippingAddress.detail || ''}, ${
                      order.shippingAddress.ward || ''
                    }, ${order.shippingAddress.district || ''}, ${order.shippingAddress.province || ''}`}
              </Text>
            </View>
          )}

          {order.notes ? (
            <View style={styles.infoRow}>
              <Ionicons name="chatbubble-outline" size={17} color="#9C7156" style={styles.infoIcon} />
              <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Ghi chú khách:</Text>
              <Text style={[styles.infoVal, { color: Colors.textPrimary, flex: 1 }]}>{order.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Products in Order */}
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
            Sản phẩm trong đơn ({order.items.length})
          </Text>

          {order.items.map((it, idx) => (
            <View key={idx} style={[styles.itemRow, { borderBottomColor: isDark ? '#222222' : '#F0ECE6' }]}>
              <Image
                source={it.imageUrl ? { uri: it.imageUrl } : require('../../assets/images/LOGO.jpg')}
                style={styles.itemThumb}
                contentFit="cover"
              />
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={[styles.itemName, { color: Colors.textPrimary }]}>{it.name}</Text>
                {it.selectedVariant ? (
                  <Text style={[styles.itemVariant, { color: Colors.textMuted }]}>Men: {it.selectedVariant}</Text>
                ) : null}
                <Text style={styles.itemPriceSingle}>{formatCurrency(it.price)}</Text>
              </View>
              <View style={styles.itemQtyWrap}>
                <Text style={[styles.itemQtyText, { color: Colors.textPrimary }]}>x{it.quantity}</Text>
                <Text style={styles.itemSubtotal}>{formatCurrency(it.price * it.quantity)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Billing Breakdown */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Chi tiết thanh toán</Text>

          <View style={styles.billRow}>
            <Text style={[styles.billLabel, { color: Colors.textSecondary }]}>Tạm tính:</Text>
            <Text style={[styles.billVal, { color: Colors.textPrimary }]}>{formatCurrency(order.subtotal)}</Text>
          </View>

          {(order.discountAmount ?? 0) > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, { color: '#9C7156' }]}>Giảm giá / Voucher:</Text>
              <Text style={[styles.billVal, { color: '#9C7156' }]}>-{formatCurrency(order.discountAmount ?? 0)}</Text>
            </View>
          )}

          {(order.shippingFee ?? 0) > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, { color: Colors.textSecondary }]}>Phí vận chuyển:</Text>
              <Text style={[styles.billVal, { color: Colors.textPrimary }]}>{formatCurrency(order.shippingFee ?? 0)}</Text>
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

          <View style={styles.billRow}>
            <Text style={[styles.totalLabel, { color: Colors.textPrimary }]}>TỔNG ĐƠN HÀNG:</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.totalAmount)}</Text>
          </View>

          <View style={styles.paymentMethodBadgeRow}>
            <View style={styles.methodTag}>
              <Text style={styles.methodTagText}>{order.paymentMethod.toUpperCase()}</Text>
            </View>
            <View style={[styles.methodTag, { backgroundColor: order.paymentStatus === 'paid' ? 'rgba(156, 113, 86, 0.12)' : '#FEF3C7' }]}>
              <Text style={[styles.methodTagText, { color: order.paymentStatus === 'paid' ? '#9C7156' : '#D97706' }]}>
                {order.paymentStatus === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'}
              </Text>
            </View>
          </View>
        </View>

        {/* Staff Internal Notes */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <View style={styles.notesHeaderRow}>
            <Text style={[styles.cardTitle, { color: Colors.textPrimary, marginBottom: 0 }]}>Ghi chú nội bộ</Text>
            {!isEditingNote && (
              <TouchableOpacity onPress={() => setIsEditingNote(true)}>
                <Text style={styles.editNoteLink}>{order.internalNotes ? 'Sửa' : 'Thêm'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {isEditingNote ? (
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={[styles.noteTextArea, { color: Colors.textPrimary, borderColor: Colors.border, backgroundColor: Colors.surface }]}
                multiline
                numberOfLines={3}
                placeholder="Nhập ghi chú cho nhân viên hoặc người giao hàng..."
                placeholderTextColor={Colors.textMuted}
                value={internalNoteInput}
                onChangeText={setInternalNoteInput}
              />
              <View style={styles.noteActionRow}>
                <TouchableOpacity onPress={() => setIsEditingNote(false)} style={styles.btnCancelNote}>
                  <Text style={[styles.btnCancelNoteText, { color: Colors.textSecondary }]}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveInternalNote} style={styles.btnSaveNote}>
                  <Text style={styles.btnSaveNoteText}>Lưu ghi chú</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={[styles.noteContent, { color: order.internalNotes ? Colors.textPrimary : Colors.textMuted }]}>
              {order.internalNotes || 'Chưa có ghi chú nội bộ cho đơn hàng này.'}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
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
    gap: 12,
  },
  backCircleBtn: {
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
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  headerOrderCode: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
  },
  btnCall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#9C7156',
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
  },
  btnCallText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusPillBtnActive: {},
  statusPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoLabel: {
    fontSize: 13,
    width: 100,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  itemThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#FAF8F5',
  },
  itemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  itemVariant: {
    fontSize: 11.5,
    marginTop: 2,
  },
  itemPriceSingle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#9C7156',
    marginTop: 2,
  },
  itemQtyWrap: {
    alignItems: 'flex-end',
  },
  itemQtyText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  itemSubtotal: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#9C7156',
    marginTop: 2,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  billLabel: {
    fontSize: 13,
  },
  billVal: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  totalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#9C7156',
  },
  paymentMethodBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  methodTag: {
    backgroundColor: 'rgba(156, 113, 86, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  methodTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },
  notesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editNoteLink: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#9C7156',
    fontWeight: '600',
  },
  noteContent: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  noteTextArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 64,
  },
  noteActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  btnCancelNote: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnCancelNoteText: {
    fontSize: 13,
  },
  btnSaveNote: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  btnSaveNoteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
