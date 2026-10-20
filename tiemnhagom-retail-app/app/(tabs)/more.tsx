// app/(tabs)/more.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { ScalePressable } from '../../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile, lockShift, signOut, checkPermission } = useAuth();
  const { themeMode, setThemeMode, language, setLanguage, hapticsEnabled, setHapticsEnabled, t } = useSettings();

  const canInventory = checkPermission('inventory');
  const canCustomers = checkPermission('customers');
  const canCoupons = checkPermission('coupons');
  const canPush = checkPermission('push_notifications');
  const canShiftReport = checkPermission('shift_report');
  const canRevenueReport = checkPermission('stats') || checkPermission('overview') || canShiftReport;
  const canStaff = checkPermission('staff');
  const hasBusinessModules = canInventory || canCustomers || canCoupons || canPush || canShiftReport || canRevenueReport || canStaff;

  const [showLangModal, setShowLangModal] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('logout'),
      'Bạn có chắc chắn muốn đăng xuất tài khoản quản trị khỏi thiết bị?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  const getRoleName = (role?: string) => {
    if (role === 'super_admin') return t('roleSuperAdmin');
    if (role === 'manager') return t('roleManager');
    return t('roleStaff');
  };

  const getLangName = (lang: string) => {
    if (lang === 'vi') return 'Tiếng Việt';
    if (lang === 'zh') return '中文 (简体)';
    return 'English';
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>{t('moreTitle')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 84,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <View style={styles.profileAvatarCircle}>
            <Ionicons name="person" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: Colors.textPrimary }]}>
              {adminProfile?.displayName || 'Nhân viên Tiệm'}
            </Text>
            <Text style={[styles.profileEmail, { color: Colors.textSecondary }]}>
              {adminProfile?.email}
            </Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>{getRoleName(adminProfile?.role)}</Text>
            </View>
          </View>
        </View>

        {/* SECTION 1: QUẢN TRỊ HÀNG HÓA & KHO (Inventory Modules) */}
        {canInventory ? (
          <>
            <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>Hàng hóa & Khuyến mãi</Text>
            <View
              style={[
                styles.menuGroupCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              {/* Danh mục sản phẩm */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => router.push('/categories' as any)}
              >
                <View style={styles.menuRowLeft}>
                  <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                    <Ionicons name="grid-outline" size={20} color="#9C7156" />
                  </View>
                  <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('categoryManagementTitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

              {/* Thiết lập Flash Sale */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => router.push('/flash-sale' as any)}
              >
                <View style={styles.menuRowLeft}>
                  <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                    <Ionicons name="flame-outline" size={20} color="#9C7156" />
                  </View>
                  <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('flashSaleSettings')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

              {/* Yêu cầu báo có hàng */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => router.push('/restock-alerts' as any)}
              >
                <View style={styles.menuRowLeft}>
                  <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                    <Ionicons name="alert-circle-outline" size={20} color="#9C7156" />
                  </View>
                  <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('restockAlertsTitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

              {/* Nhật ký kho & Tồn kho */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => router.push('/inventory-log' as any)}
              >
                <View style={styles.menuRowLeft}>
                  <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                    <Ionicons name="clipboard-outline" size={20} color="#9C7156" />
                  </View>
                  <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('inventoryLogTitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {/* SECTION 2: QUẢN TRỊ KHÁCH HÀNG & MARKETING */}
        {canCustomers || canCoupons || canPush ? (
          <>
            <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>Khách hàng & Marketing</Text>
            <View
              style={[
                styles.menuGroupCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              {/* Khách hàng & Hội viên */}
              {canCustomers ? (
                <>
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push('/customer-detail/list' as any)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                        <Ionicons name="people-outline" size={20} color="#9C7156" />
                      </View>
                      <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('customerManagement')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : null}

              {/* Mã giảm giá */}
              {canCoupons ? (
                <>
                  {canCustomers ? <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} /> : null}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push('/coupon-edit/list' as any)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                        <Ionicons name="pricetags-outline" size={20} color="#9C7156" />
                      </View>
                      <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('couponManagement')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : null}

              {/* Gửi thông báo đẩy App */}
              {canPush ? (
                <>
                  {canCustomers || canCoupons ? <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} /> : null}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push('/push-notification' as any)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                        <Ionicons name="notifications-outline" size={20} color="#9C7156" />
                      </View>
                      <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('pushNotification')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </>
        ) : null}

        {/* SECTION 3: VẬN HÀNH & BÁO CÁO TÀI CHÍNH */}
        {canShiftReport || canRevenueReport || canStaff ? (
          <>
            <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>Vận hành & Báo cáo tài chính</Text>
            <View
              style={[
                styles.menuGroupCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              {/* Báo cáo doanh thu & Lợi nhuận chuyên sâu */}
              {canRevenueReport ? (
                <>
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push('/revenue-report' as any)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                        <Ionicons name="bar-chart-outline" size={20} color="#9C7156" />
                      </View>
                      <View style={{ flex: 1, marginRight: 4 }}>
                        <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]} numberOfLines={1}>
                          {t('revenueReportTitle')}
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                          {t('revenueReportDesc')}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : null}

              {/* Báo cáo kết ca thu ngân */}
              {canShiftReport ? (
                <>
                  {canRevenueReport ? <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} /> : null}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push('/shift-report' as any)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                        <Ionicons name="document-text-outline" size={20} color="#9C7156" />
                      </View>
                      <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('shiftReport')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : null}

              {/* Quản lý tài khoản nhân viên */}
              {canStaff ? (
                <>
                  {canShiftReport || canRevenueReport ? <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} /> : null}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => router.push('/staff-management' as any)}
                  >
                    <View style={styles.menuRowLeft}>
                      <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                        <Ionicons name="shield-checkmark-outline" size={20} color="#9C7156" />
                      </View>
                      <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('staffManagement')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </>
        ) : null}

        {/* SECTION 4: CÀI ĐẶT ỨNG DỤNG (System & Preferences) */}
        <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>Cài đặt hệ thống</Text>
        <View
          style={[
            styles.menuGroupCard,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          {/* Dark Mode OLED Switch */}
          <View style={styles.menuRow}>
            <View style={styles.menuRowLeft}>
              <View style={[styles.menuIconCircle, { backgroundColor: isDark ? '#333' : '#F0ECE6' }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={20} color={isDark ? '#E8CCB2' : '#2B2928'} />
              </View>
              <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('darkMode')}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')}
              trackColor={{ false: '#E8E1D8', true: '#9C7156' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

          {/* Rung phản hồi Haptics */}
          <View style={styles.menuRow}>
            <View style={styles.menuRowLeft}>
              <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                <Ionicons name="phone-portrait-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>Rung phản hồi thao tác</Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: '#E8E1D8', true: '#9C7156' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.menuDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

          {/* Ngôn ngữ */}
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setShowLangModal(true)}
          >
            <View style={styles.menuRowLeft}>
              <View style={[styles.menuIconCircle, { backgroundColor: 'rgba(156, 113, 86, 0.1)' }]}>
                <Ionicons name="globe-outline" size={20} color="#9C7156" />
              </View>
              <Text style={[styles.menuRowLabel, { color: Colors.textPrimary }]}>{t('appLanguage')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.langCurrentText, { color: '#9C7156' }]}>
                {getLangName(language)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* SECTION 3: CA TRỰC & BẢO MẬT (Security Actions) */}
        <View style={styles.actionSection}>
          {/* Nút Khóa ca trực */}
          <ScalePressable style={styles.btnLockShift} onPress={lockShift}>
            <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
            <Text style={styles.btnLockShiftText}>{t('lockShift')}</Text>
          </ScalePressable>

          {/* Nút Đăng xuất */}
          <TouchableOpacity style={styles.btnLogout} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={19} color="#DC2626" />
            <Text style={styles.btnLogoutText}>{t('logout')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.versionText, { color: Colors.textMuted }]}>
          Tiệm Nhà Gốm Retail App v1.0.0 (Internal Production)
        </Text>
      </ScrollView>

      {/* Modal Chọn Ngôn ngữ */}
      <Modal
        visible={showLangModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowLangModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowLangModal(false)}
        >
          <View
            style={[
              styles.langModalCard,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <Text style={[styles.langModalTitle, { color: Colors.textPrimary }]}>
              {t('appLanguage')}
            </Text>

            <TouchableOpacity
              style={[
                styles.langOptionRow,
                language === 'vi' && { backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2' },
              ]}
              onPress={() => {
                setLanguage('vi');
                setShowLangModal(false);
              }}
            >
              <Text style={styles.langFlag}>🇻🇳</Text>
              <Text style={[styles.langOptionLabel, { color: Colors.textPrimary }]}>Tiếng Việt (Chuẩn)</Text>
              {language === 'vi' ? <Ionicons name="checkmark-circle" size={20} color="#9C7156" /> : null}
            </TouchableOpacity>

            <View style={[styles.menuDivider, { marginLeft: 16, backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <TouchableOpacity
              style={[
                styles.langOptionRow,
                language === 'en' && { backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2' },
              ]}
              onPress={() => {
                setLanguage('en');
                setShowLangModal(false);
              }}
            >
              <Text style={styles.langFlag}>🇬🇧</Text>
              <Text style={[styles.langOptionLabel, { color: Colors.textPrimary }]}>English</Text>
              {language === 'en' ? <Ionicons name="checkmark-circle" size={20} color="#9C7156" /> : null}
            </TouchableOpacity>

            <View style={[styles.menuDivider, { marginLeft: 16, backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

            <TouchableOpacity
              style={[
                styles.langOptionRow,
                language === 'zh' && { backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2' },
              ]}
              onPress={() => {
                setLanguage('zh');
                setShowLangModal(false);
              }}
            >
              <Text style={styles.langFlag}>🇨🇳</Text>
              <Text style={[styles.langOptionLabel, { color: Colors.textPrimary }]}>中文 (简体)</Text>
              {language === 'zh' ? <Ionicons name="checkmark-circle" size={20} color="#9C7156" /> : null}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  profileCard: {
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  profileAvatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 12.5,
    marginTop: 2,
  },
  roleTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
  },
  sectionHeading: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
  },
  menuGroupCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuRowLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    marginLeft: 64,
  },
  langCurrentText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
  },
  actionSection: {
    gap: 10,
    marginTop: 6,
  },
  btnLockShift: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  btnLockShiftText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnLogout: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  btnLogoutText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11.5,
    marginTop: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  langModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
  },
  langModalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  langOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 12,
  },
  langFlag: {
    fontSize: 22,
  },
  langOptionLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});
