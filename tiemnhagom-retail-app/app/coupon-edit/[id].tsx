// app/coupon-edit/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../../src/constants/theme';
import { subscribeCoupons, addCoupon, toggleCouponActive, deleteCoupon } from '../../src/services/adminCouponService';
import { Coupon } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function CouponScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // New coupon form
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [minOrder, setMinOrder] = useState('0');
  const [expiryDate, setExpiryDate] = useState('2026-12-31');

  useEffect(() => {
    const unsub = subscribeCoupons((data) => setCoupons(data));
    return () => unsub();
  }, []);

  const handleCreateCoupon = async () => {
    if (!code.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập mã giảm giá (VD: GOMMOC10).');
      return;
    }
    const valNum = Number(value.replace(/\D/g, '')) || 0;
    if (valNum <= 0) {
      Alert.alert('Giá trị không hợp lệ', 'Vui lòng nhập phần trăm hoặc số tiền giảm.');
      return;
    }
    const minNum = Number(minOrder.replace(/\D/g, '')) || 0;

    const newCoupon: Coupon = {
      id: code.trim().toUpperCase(),
      code: code.trim().toUpperCase(),
      type,
      value: valNum,
      minOrder: minNum,
      expiryDate,
      isActive: true,
      usedCount: 0,
    };

    const res = await addCoupon(newCoupon);
    if (res.success) {
      setShowAddModal(false);
      setCode('');
      setValue('');
      setMinOrder('0');
    } else {
      Alert.alert('Lỗi', res.error || 'Không thể tạo mã voucher.');
    }
  };

  const handleDelete = (cp: Coupon) => {
    Alert.alert('Xóa mã giảm giá', `Bạn có chắc muốn xóa mã ${cp.code}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteCoupon(cp.id) },
    ]);
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
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>Mã giảm giá (Coupons)</Text>
        </View>

        <ScalePressable style={styles.btnAddHeader} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.btnAddHeaderText}>Tạo mã</Text>
        </ScalePressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {coupons.map((c) => (
          <View
            key={c.id}
            style={[
              styles.couponCard,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.couponTopRow}>
              <View style={styles.codeTag}>
                <Ionicons name="pricetag" size={14} color="#9C7156" />
                <Text style={styles.codeTagText} numberOfLines={1}>{c.code}</Text>
              </View>

              <Switch
                value={c.isActive}
                onValueChange={(val) => {
                  toggleCouponActive(c.id, val);
                }}
                trackColor={{ false: '#E8E1D8', true: '#9C7156' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <Text style={[styles.couponValueText, { color: Colors.textPrimary }]} numberOfLines={1}>
              Giảm {c.type === 'percent' ? `${c.value}%` : formatCurrency(c.value)}
            </Text>
            <Text style={[styles.couponMinOrder, { color: Colors.textSecondary }]} numberOfLines={1}>
              Đơn tối thiểu: {formatCurrency(c.minOrder)} • HSD: {c.expiryDate}
            </Text>

            <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <View style={styles.couponBottomRow}>
              <Text style={[styles.usedCount, { color: Colors.textMuted }]} numberOfLines={1}>Đã dùng: {c.usedCount || 0} lượt</Text>
              <TouchableOpacity onPress={() => handleDelete(c)} style={{ flexShrink: 0 }}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CREATE COUPON MODAL */}
      <AnimatedCenterModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Tạo mã giảm giá mới</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, marginBottom: 14 }]}>
          Mã sẽ có hiệu lực ngay cho khách đặt hàng Web & App
        </Text>

        <TextInput
          style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border, marginBottom: 10 }]}
          placeholder="Mã voucher (VD: CHAOXUAN20)"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
        />

        {/* Type toggle */}
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'percent' && styles.typeBtnActive]}
            onPress={() => setType('percent')}
          >
            <Text style={[styles.typeBtnText, type === 'percent' && { color: '#FFFFFF' }]}>Giảm theo %</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'fixed' && styles.typeBtnActive]}
            onPress={() => setType('fixed')}
          >
            <Text style={[styles.typeBtnText, type === 'fixed' && { color: '#FFFFFF' }]}>Giảm số tiền cố định</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border, marginBottom: 10 }]}
          placeholder={type === 'percent' ? 'Phần trăm giảm (VD: 15)' : 'Số tiền giảm (VD: 50000)'}
          keyboardType="numeric"
          placeholderTextColor={Colors.textMuted}
          value={value}
          onChangeText={setValue}
        />

        <TextInput
          style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border, marginBottom: 16 }]}
          placeholder="Đơn tối thiểu áp dụng (VD: 200000)"
          keyboardType="numeric"
          placeholderTextColor={Colors.textMuted}
          value={minOrder}
          onChangeText={setMinOrder}
        />

        <ScalePressable style={styles.btnCreateConfirm} onPress={handleCreateCoupon}>
          <Text style={styles.btnCreateConfirmText}>Kích hoạt mã voucher</Text>
        </ScalePressable>
      </AnimatedCenterModal>
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
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  btnAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9C7156',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexShrink: 0,
  },
  btnAddHeaderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 16,
    gap: 12,
  },
  couponCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    overflow: 'hidden',
  },
  couponTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(156, 113, 86, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  codeTagText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#9C7156',
    letterSpacing: 0.5,
  },
  couponValueText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  couponMinOrder: {
    fontSize: 12.5,
  },
  cardDivider: {
    height: 1,
    marginVertical: 10,
  },
  couponBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usedCount: {
    fontSize: 12,
  },
  modalCard: {
    width: '90%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  inputPill: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13.5,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    width: '100%',
  },
  typeBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0ECE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#9C7156',
  },
  typeBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#2B2928',
  },
  btnCreateConfirm: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCreateConfirmText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
