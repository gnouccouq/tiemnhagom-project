// app/rental-detail/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { updateRentalStatus } from '../../src/services/adminRentalOrderService';
import { RentalOrder, RentalStatus } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function RentalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();

  const [rental, setRental] = useState<RentalOrder | null>(null);

  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'rental_orders', id);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const r: RentalOrder = {
          id: docSnap.id,
          orderCode: data.code || data.orderCode || docSnap.id,
          customerName: data.customerName || data.name || 'Khách thuê decor',
          customerPhone: data.customerPhone || data.phone || '',
          customerEmail: data.customerEmail || data.email || '',
          eventDate: data.eventDate || '',
          startDate: data.startDate || '',
          endDate: data.endDate || '',
          rentalDays: data.rentalDays || 1,
          items: data.items || [],
          totalRentalFee: data.totalRentalFee || data.totalFee || 0,
          totalDeposit: data.totalDeposit || data.deposit || 0,
          totalAmount: data.totalAmount || 0,
          status: (data.status || 'pending_deposit') as RentalStatus,
          shippingAddress: data.address || data.shippingAddress || '',
          notes: data.notes || '',
          createdAt: data.createdAt,
          staffId: data.staffId,
          staffName: data.staffName,
        };
        setRental(r);
      }
    });

    return () => unsub();
  }, [id]);

  if (!rental) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <Text style={{ color: Colors.textSecondary }}>Đang tải đơn thuê decor...</Text>
      </View>
    );
  }

  const handleStatusChange = async (newStatus: RentalStatus) => {
    await updateRentalStatus(rental.id, newStatus, adminProfile?.displayName);
  };

  const handleCall = () => {
    if (rental.customerPhone) Linking.openURL(`tel:${rental.customerPhone}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backCircleBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerCode, { color: Colors.textPrimary }]} numberOfLines={1}>{rental.orderCode}</Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>Đơn thuê đồ Decor sự kiện</Text>
          </View>
        </View>

        {rental.customerPhone ? (
          <ScalePressable style={styles.btnCall} onPress={handleCall}>
            <Ionicons name="call" size={16} color="#FFFFFF" />
            <Text style={styles.btnCallText}>Gọi</Text>
          </ScalePressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Selector Card */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Trạng thái thuê đồ</Text>
          <View style={styles.statusButtonsRow}>
            {[
              { id: 'pending_deposit', label: 'Chờ đặt cọc' },
              { id: 'deposit_paid', label: 'Đã nhận cọc' },
              { id: 'renting', label: 'Đang thuê đồ' },
              { id: 'returned', label: 'Đã hoàn trả' },
            ].map((st) => {
              const active = rental.status === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.statusPillBtn,
                    {
                      borderColor: active ? '#9C7156' : isDark ? '#333' : '#E8E1D8',
                      backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : 'transparent',
                    },
                  ]}
                  onPress={() => handleStatusChange(st.id as RentalStatus)}
                >
                  <Text style={[styles.statusPillText, { color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary }]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Customer & Event Details */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Thông tin sự kiện & Khách thuê</Text>

          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={17} color="#9C7156" />
            <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Khách hàng:</Text>
            <Text style={[styles.infoVal, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1}>{rental.customerName}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={17} color="#9C7156" />
            <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>SĐT:</Text>
            <Text style={[styles.infoVal, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1}>{rental.customerPhone || 'Chưa có'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={17} color="#9C7156" />
            <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Lịch thuê:</Text>
            <Text style={[styles.infoVal, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1}>
              {rental.startDate} ⮂ {rental.endDate} ({rental.rentalDays} ngày)
            </Text>
          </View>

          {rental.shippingAddress ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={17} color="#9C7156" />
              <Text style={[styles.infoLabel, { color: Colors.textSecondary }]}>Địa điểm tiệc:</Text>
              <Text style={[styles.infoVal, { color: Colors.textPrimary, flex: 1 }]}>{rental.shippingAddress}</Text>
            </View>
          ) : null}
        </View>

        {/* Rental Items List */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Danh mục đồ thuê ({rental.items.length})</Text>

          {rental.items.map((it, idx) => (
            <View key={idx} style={[styles.itemRow, { borderBottomColor: isDark ? '#222' : '#F0ECE6' }]}>
              <Image
                source={it.imageUrl ? { uri: it.imageUrl } : require('../../assets/images/LOGO.jpg')}
                style={styles.itemThumb}
                contentFit="cover"
              />
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={[styles.itemName, { color: Colors.textPrimary }]} numberOfLines={1}>{it.name}</Text>
                <Text style={[styles.itemSub, { color: Colors.textMuted }]} numberOfLines={1}>
                  Thuê: {formatCurrency(it.rentalPrice)}/ngày • Cọc: {formatCurrency(it.depositPrice)}
                </Text>
              </View>
              <Text style={[styles.itemQty, { color: Colors.textPrimary }]}>x{it.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Deposit and Total fee */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Chi phí thuê & Tiền cọc</Text>

          <View style={styles.billRow}>
            <Text style={[styles.billLabel, { color: Colors.textSecondary }]} numberOfLines={1}>Tổng tiền thuê:</Text>
            <Text style={[styles.billVal, { color: Colors.textPrimary }]} numberOfLines={1}>{formatCurrency(rental.totalRentalFee)}</Text>
          </View>

          <View style={styles.billRow}>
            <Text style={[styles.billLabel, { color: '#9C7156' }]} numberOfLines={1}>Tiền cọc thiết bị:</Text>
            <Text style={[styles.billVal, { color: '#9C7156' }]} numberOfLines={1}>{formatCurrency(rental.totalDeposit)}</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

          <View style={styles.billRow}>
            <Text style={[styles.totalLabel, { color: Colors.textPrimary }]} numberOfLines={1}>TỔNG THU BAN ĐẦU:</Text>
            <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{formatCurrency(rental.totalAmount || rental.totalRentalFee + rental.totalDeposit)}</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
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
    flexShrink: 0,
  },
  headerCode: {
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
    flexShrink: 0,
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
    overflow: 'hidden',
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
  infoLabel: {
    fontSize: 13,
    width: 100,
    flexShrink: 0,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  itemThumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#FAF8F5',
  },
  itemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  itemQty: {
    fontSize: 13.5,
    fontWeight: '700',
    flexShrink: 0,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  billLabel: {
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  billVal: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  totalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  totalValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#9C7156',
    flexShrink: 0,
  },
});
