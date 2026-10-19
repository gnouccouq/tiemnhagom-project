// app/customer-detail/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { subscribeCustomers, adjustCustomerPoints } from '../../src/services/adminCustomerService';
import { Customer } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustForPoints, setSelectedCustForPoints] = useState<Customer | null>(null);
  const [pointsDiff, setPointsDiff] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdding, setIsAdding] = useState(true);

  useEffect(() => {
    const unsub = subscribeCustomers((data) => setCustomers(data));
    return () => unsub();
  }, []);

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    return !q || c.displayName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
  });

  const handleAdjustPoints = async () => {
    if (!selectedCustForPoints) return;
    const num = parseInt(pointsDiff, 10);
    if (isNaN(num) || num <= 0) {
      Alert.alert('Số điểm không hợp lệ', 'Vui lòng nhập số điểm lớn hơn 0.');
      return;
    }
    const finalDiff = isAdding ? num : -num;
    const ok = await adjustCustomerPoints(
      selectedCustForPoints.id,
      finalDiff,
      adjustReason || 'Nhân viên điều chỉnh tại quầy',
      adminProfile?.displayName
    );
    if (ok) {
      Alert.alert('Thành công', `Đã ${isAdding ? 'cộng' : 'trừ'} ${num} điểm cho khách.`);
      setSelectedCustForPoints(null);
      setPointsDiff('');
      setAdjustReason('');
    } else {
      Alert.alert('Lỗi', 'Không thể điều chỉnh điểm.');
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
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>Khách hàng & Hội viên</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchPill, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: Colors.textPrimary }]}
            placeholder="Tìm theo Tên hoặc Số điện thoại..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredCustomers.map((c) => (
          <View
            key={c.id}
            style={[
              styles.customerCard,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <View style={styles.custTopRow}>
              <View style={styles.custAvatar}>
                <Ionicons name="person" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.custName, { color: Colors.textPrimary }]}>{c.displayName}</Text>
                <Text style={[styles.custPhone, { color: Colors.textSecondary }]}>{c.phone || 'Chưa cập nhật SĐT'}</Text>
              </View>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>{c.tier}</Text>
              </View>
            </View>

            <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <View style={styles.custBottomRow}>
              <View>
                <Text style={[styles.spentLabel, { color: Colors.textMuted }]}>Tổng chi tiêu:</Text>
                <Text style={[styles.spentVal, { color: Colors.textPrimary }]}>{formatCurrency(c.totalSpent)}</Text>
              </View>

              <TouchableOpacity
                style={styles.pointsPill}
                onPress={() => setSelectedCustForPoints(c)}
              >
                <Ionicons name="sparkles" size={14} color="#9C7156" />
                <Text style={styles.pointsPillText}>{c.points} điểm</Text>
                <Ionicons name="create-outline" size={13} color="#9C7156" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ADJUST POINTS MODAL */}
      <AnimatedCenterModal
        visible={!!selectedCustForPoints}
        onClose={() => setSelectedCustForPoints(null)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Điều chỉnh điểm gốm</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, marginBottom: 16 }]}>
          Khách hàng: {selectedCustForPoints?.displayName} (Hiện có: {selectedCustForPoints?.points} điểm)
        </Text>

        <View style={styles.typeToggleRow}>
          <TouchableOpacity
            style={[styles.typeBtn, isAdding && styles.typeBtnActive]}
            onPress={() => setIsAdding(true)}
          >
            <Text style={[styles.typeBtnText, isAdding && { color: '#FFFFFF' }]}>+ Cộng điểm</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, !isAdding && styles.typeBtnActive]}
            onPress={() => setIsAdding(false)}
          >
            <Text style={[styles.typeBtnText, !isAdding && { color: '#FFFFFF' }]}>- Trừ điểm</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border, marginBottom: 10 }]}
          placeholder="Số điểm điều chỉnh (VD: 50)"
          keyboardType="numeric"
          placeholderTextColor={Colors.textMuted}
          value={pointsDiff}
          onChangeText={setPointsDiff}
        />

        <TextInput
          style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border, marginBottom: 16 }]}
          placeholder="Lý do (VD: Tặng điểm sinh nhật / Bù đơn lỗi)"
          placeholderTextColor={Colors.textMuted}
          value={adjustReason}
          onChangeText={setAdjustReason}
        />

        <ScalePressable style={styles.btnSaveModal} onPress={handleAdjustPoints}>
          <Text style={styles.btnSaveModalText}>Xác nhận điều chỉnh</Text>
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
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  searchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchPill: {
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
  },
  scrollBody: {
    paddingHorizontal: 16,
    gap: 12,
  },
  customerCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },
  custTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  custAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
  },
  custPhone: {
    fontSize: 12,
    marginTop: 2,
  },
  tierBadge: {
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },
  cardDivider: {
    height: 1,
    marginVertical: 10,
  },
  custBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spentLabel: {
    fontSize: 11.5,
  },
  spentVal: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(156, 113, 86, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pointsPillText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#9C7156',
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
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 2,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#2B2928',
  },
  inputPill: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13.5,
  },
  btnSaveModal: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSaveModalText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
