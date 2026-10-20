// app/staff-management.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { useThemeColor } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { ScalePressable } from '../src/components/ScalePressable';

interface StaffItem {
  uid: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'manager' | 'staff';
  permissions: string[];
  isLocked: boolean;
  phone?: string;
}

export default function StaffManagementScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile, checkPermission } = useAuth();
  const { t } = useSettings();

  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'super_admin' | 'manager' | 'staff'>('all');

  // Kiểm tra quyền truy cập phân hệ nhân sự
  const canAccessStaff = checkPermission('staff');

  useEffect(() => {
    if (!canAccessStaff) return;

    const unsubscribe = onSnapshot(
      collection(db, 'admins'),
      async (snapshot) => {
        try {
          const items: StaffItem[] = await Promise.all(
            snapshot.docs.map(async (adminDoc) => {
              const a = adminDoc.data();
              const uid = adminDoc.id;
              let displayName = a.displayName || '';
              let phone = a.phone || '';

              if (!displayName || !phone) {
                try {
                  const userSnap = await getDoc(doc(db, 'users', uid));
                  if (userSnap.exists()) {
                    const u = userSnap.data();
                    displayName = displayName || u.displayName || '';
                    phone = phone || u.phone || '';
                  }
                } catch {
                  // Fallback
                }
              }

              return {
                uid,
                email: a.email || '',
                displayName: displayName || a.email || 'Nhân viên Tiệm',
                role: a.role || 'staff',
                permissions: a.permissions || [],
                isLocked: a.isLocked || false,
                phone,
              };
            })
          );
          setStaffList(items);
        } catch (err) {
          console.error('Lỗi tải danh sách nhân viên:', err);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Lỗi listener nhân sự:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [canAccessStaff]);

  const handleToggleLock = (staff: StaffItem) => {
    const isSelf = adminProfile?.uid === staff.uid;
    if (isSelf) {
      Alert.alert(t('error'), 'Bạn không thể tự khóa tài khoản của chính mình.');
      return;
    }

    const actionText = staff.isLocked ? 'mở khóa' : 'khóa';
    Alert.alert(
      `Xác nhận ${actionText}`,
      `Bạn có chắc chắn muốn ${actionText} tài khoản của "${staff.displayName}"? Nhân viên sẽ ${staff.isLocked ? 'có thể' : 'bị ngắt'} quyền truy cập hệ thống.`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: staff.isLocked ? 'Mở khóa' : 'Khóa tài khoản',
          style: staff.isLocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'admins', staff.uid), {
                isLocked: !staff.isLocked,
              });
            } catch (e: any) {
              Alert.alert(t('error'), e.message || 'Không thể cập nhật trạng thái.');
            }
          },
        },
      ]
    );
  };

  const filteredStaff = staffList.filter((s) => {
    const matchesRole = roleFilter === 'all' || s.role === roleFilter;
    const kw = searchKeyword.trim().toLowerCase();
    const matchesKw =
      !kw ||
      s.displayName.toLowerCase().includes(kw) ||
      s.email.toLowerCase().includes(kw) ||
      (s.phone && s.phone.includes(kw));
    return matchesRole && matchesKw;
  });

  const totalStaff = staffList.length;
  const activeStaff = staffList.filter((s) => !s.isLocked).length;
  const lockedStaff = staffList.filter((s) => s.isLocked).length;

  const getRoleBadge = (role: string) => {
    if (role === 'super_admin') {
      return { text: t('roleSuperAdmin'), bg: '#9C7156', color: '#FFFFFF' };
    }
    if (role === 'manager') {
      return { text: t('roleManager'), bg: '#b45309', color: '#FFFFFF' };
    }
    return { text: t('roleStaff'), bg: isDark ? '#2B2928' : '#FAF7F2', color: isDark ? '#E8CCB2' : '#2B2928' };
  };

  if (!canAccessStaff) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.background }]}>
        <FadingHeaderBackdrop isDark={isDark} />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>{t('staffManagement')}</Text>
        </View>
        <View style={styles.restrictedCenter}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
          <Text style={[styles.restrictedTitle, { color: Colors.textPrimary }]}>Không có quyền truy cập</Text>
          <Text style={[styles.restrictedDesc, { color: Colors.textSecondary }]}>
            Phân hệ này chỉ dành cho Ban quản trị tối cao hoặc Quản lý cửa hàng.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>{t('staffManagement')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 30 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI Metrics Summary */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <Text style={[styles.metricNumber, { color: Colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{totalStaff}</Text>
            <Text style={[styles.metricLabel, { color: Colors.textSecondary }]} numberOfLines={1}>Tổng nhân sự</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <Text style={[styles.metricNumber, { color: '#9C7156' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{activeStaff}</Text>
            <Text style={[styles.metricLabel, { color: Colors.textSecondary }]} numberOfLines={1}>Đang hoạt động</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <Text style={[styles.metricNumber, { color: '#DC2626' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{lockedStaff}</Text>
            <Text style={[styles.metricLabel, { color: Colors.textSecondary }]} numberOfLines={1}>Đã khóa</Text>
          </View>
        </View>

        {/* Search Bar (Pill 52px) */}
        <View style={[styles.searchPill, { backgroundColor: isDark ? Colors.surface : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Ionicons name="search-outline" size={19} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: Colors.textPrimary }]}
            placeholder="Tìm theo tên, email, SĐT nhân viên..."
            placeholderTextColor={Colors.textMuted}
            value={searchKeyword}
            onChangeText={setSearchKeyword}
          />
          {searchKeyword ? (
            <TouchableOpacity onPress={() => setSearchKeyword('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'super_admin', label: 'Super Admin' },
            { id: 'manager', label: 'Quản lý' },
            { id: 'staff', label: 'Nhân viên' },
          ].map((chip) => {
            const isSelected = roleFilter === chip.id;
            return (
              <ScalePressable
                key={chip.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? '#9C7156' : isDark ? Colors.surface : '#FFFFFF',
                    borderColor: isSelected ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
                onPress={() => setRoleFilter(chip.id as any)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isSelected ? '#FFFFFF' : Colors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
              </ScalePressable>
            );
          })}
        </ScrollView>

        {/* Staff List */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#9C7156" />
            <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>{t('loading')}</Text>
          </View>
        ) : filteredStaff.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
            <Text style={[styles.emptyText, { color: Colors.textSecondary }]}>Không tìm thấy nhân viên nào</Text>
          </View>
        ) : (
          filteredStaff.map((staff) => {
            const isSelf = adminProfile?.uid === staff.uid;
            const badge = getRoleBadge(staff.role);
            const permsCount = staff.role === 'super_admin' ? 'Toàn quyền' : `${staff.permissions.length} chức năng`;

            return (
              <View
                key={staff.uid}
                style={[
                  styles.staffCard,
                  {
                    backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
              >
                <View style={styles.staffCardHeader}>
                  <View style={styles.staffAvatarCircle}>
                    <Text style={styles.staffAvatarText}>
                      {(staff.displayName || 'NV').charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.staffInfo}>
                    <View style={styles.staffNameRow}>
                      <Text style={[styles.staffName, { color: Colors.textPrimary }]} numberOfLines={1}>
                        {staff.displayName}
                      </Text>
                      {isSelf ? <Text style={styles.selfTag}>(Bạn)</Text> : null}
                    </View>
                    <Text style={[styles.staffEmail, { color: Colors.textSecondary }]} numberOfLines={1}>
                      {staff.email}
                    </Text>
                    {staff.phone ? (
                      <Text style={[styles.staffPhone, { color: Colors.textMuted }]} numberOfLines={1}>
                        📞 {staff.phone}
                      </Text>
                    ) : null}
                  </View>

                  {/* Status Badge */}
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: staff.isLocked ? '#FEF2F2' : 'rgba(156, 113, 86, 0.12)',
                        borderColor: staff.isLocked ? '#FECACA' : '#E8CCB2',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: staff.isLocked ? '#DC2626' : '#9C7156' },
                      ]}
                      numberOfLines={1}
                    >
                      {staff.isLocked ? 'Đã khóa' : 'Hoạt động'}
                    </Text>
                  </View>
                </View>

                {/* Role and Permissions Divider */}
                <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

                <View style={styles.staffCardFooter}>
                  <View style={styles.tagsContainer}>
                    <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.roleBadgeText, { color: badge.color }]}>{badge.text}</Text>
                    </View>
                    <View style={[styles.permBadge, { borderColor: isDark ? '#333333' : '#E8E1D8' }]}>
                      <Ionicons name="key-outline" size={12} color="#9C7156" style={{ marginRight: 4 }} />
                      <Text style={[styles.permBadgeText, { color: Colors.textSecondary }]}>
                        {permsCount}
                      </Text>
                    </View>
                  </View>

                  {!isSelf ? (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: staff.isLocked ? 'rgba(156, 113, 86, 0.12)' : '#FEF2F2',
                          borderColor: staff.isLocked ? '#E8CCB2' : '#FECACA',
                        },
                      ]}
                      onPress={() => handleToggleLock(staff)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={staff.isLocked ? 'lock-open-outline' : 'lock-closed-outline'}
                        size={14}
                        color={staff.isLocked ? '#9C7156' : '#DC2626'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.actionBtnText,
                          { color: staff.isLocked ? '#9C7156' : '#DC2626' },
                        ]}
                      >
                        {staff.isLocked ? 'Mở khóa' : 'Khóa'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
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
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  metricNumber: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  searchPill: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
  },
  filterChipScroll: {
    gap: 8,
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13.5,
  },
  staffCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  staffCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  staffAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FAF7F2',
    borderWidth: 1.5,
    borderColor: '#E8E1D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: '#9C7156',
  },
  staffInfo: {
    flex: 1,
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  staffName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
  },
  selfTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },
  staffEmail: {
    fontSize: 12.5,
    marginTop: 2,
  },
  staffPhone: {
    fontSize: 11.5,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  staffCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  permBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  restrictedCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  restrictedTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  restrictedDesc: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
  },
});
