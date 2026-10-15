import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { useDialog } from '../src/context/DialogContext';
import { useSettings } from '../src/context/SettingsContext';
import { AddressPicker } from '../src/components/AddressPicker';
import { ScalePressable } from '../src/components/ScalePressable';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { useThemeColor, Typography, Spacing } from '../src/constants/theme';
import { Header } from '../src/components/Header';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile, updateUserProfileData } = useAuth();
  const { t } = useSettings();

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGender, setEditGender] = useState('Nam');
  const [editDob, setEditDob] = useState('');
  const [editStreet, setEditStreet] = useState('');
  const [provinceCode, setProvinceCode] = useState<string | undefined>();
  const [wardCode, setWardCode] = useState<string | undefined>();
  const [locationName, setLocationName] = useState('');
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [joinDate, setJoinDate] = useState('');

  // States cho bộ chọn ngày sinh
  const now = new Date();
  const [calYear, setCalYear] = useState<number>(now.getFullYear() - 20);
  const [calMonth, setCalMonth] = useState<number>(now.getMonth());
  const [calDay, setCalDay] = useState<number>(1);

  useEffect(() => {
    // Khởi tạo dữ liệu
    setEditName(userProfile?.displayName || userProfile?.name || user?.displayName || '');
    setEditPhone(userProfile?.phone || '');
    setUserEmail(user?.email || userProfile?.email || '');

    // Ngày tham gia tính từ metadata creationTime hoặc createdAt của userProfile
    const createdTimestamp =
      user?.metadata?.creationTime ||
      userProfile?.createdAt ||
      userProfile?.metadata?.creationTime;
    if (createdTimestamp) {
      try {
        const parsedDate = new Date(createdTimestamp);
        if (!isNaN(parsedDate.getTime())) {
          setJoinDate(parsedDate.toLocaleDateString('vi-VN'));
        } else {
          setJoinDate(t('memberRole') || 'Thành viên');
        }
      } catch {
        setJoinDate(t('memberRole') || 'Thành viên');
      }
    } else {
      setJoinDate(t('memberRole') || 'Thành viên');
    }

    setEditGender(userProfile?.gender || 'Nam');
    const existingDob = userProfile?.dob || userProfile?.birthday || '';
    setEditDob(existingDob);

    if (existingDob) {
      if (existingDob.includes('-')) {
        // YYYY-MM-DD
        const [y, m, d] = existingDob.split('-').map(Number);
        if (y && m && d) {
          setCalYear(y);
          setCalMonth(m - 1);
          setCalDay(d);
        }
      } else if (existingDob.includes('/')) {
        // DD/MM/YYYY
        const [d, m, y] = existingDob.split('/').map(Number);
        if (y && m && d) {
          setCalYear(y);
          setCalMonth(m - 1);
          setCalDay(d);
        }
      }
    }

    setEditStreet(userProfile?.streetAddress || userProfile?.address || userProfile?.fullAddress || '');
    setProvinceCode(userProfile?.provinceCode);
    setWardCode(userProfile?.wardCode);
    setLocationName(userProfile?.locationName || '');
    setEditAvatar(userProfile?.photoURL || user?.photoURL || null);
  }, [userProfile, user]);

  const dialog = useDialog();

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        dialog.alert(t('error') || 'Quyền truy cập', t('photoPermissionRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setEditAvatar(`data:image/jpeg;base64,${asset.base64}`);
        } else {
          setEditAvatar(asset.uri);
        }
      }
    } catch (e) {
      console.warn('Lỗi chọn ảnh:', e);
      dialog.alert(t('error') || 'Lỗi', t('photoPermissionRequired'));
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      dialog.alert(t('error') || 'Lỗi', t('nameRequiredError'));
      return;
    }

    setSavingProfile(true);
    try {
      const fullAddr = locationName ? `${editStreet.trim()}, ${locationName}` : editStreet.trim();
      await updateUserProfileData({
        displayName: editName.trim(),
        name: editName.trim(),
        phone: editPhone.trim(),
        gender: editGender,
        dob: editDob.trim(),
        birthday: editDob.trim(),
        address: editStreet.trim(),
        fullAddress: fullAddr,
        streetAddress: editStreet.trim(),
        provinceCode,
        wardCode,
        locationName,
        photoURL: editAvatar,
      });

      dialog.showDialog({
        title: t('success') || 'Thành công',
        message: t('profileUpdateSuccess'),
        type: 'success',
        buttons: [{ text: t('understoodBtn'), style: 'primary', onPress: () => router.back() }],
      });
    } catch (e: any) {
      console.warn('Lỗi lưu thông tin:', e);
      dialog.alert(t('error') || 'Lỗi', e.message || t('profileUpdateError'));
    } finally {
      setSavingProfile(false);
    }
  };

  const [scrollY, setScrollY] = useState(0);
  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />
      
      <Header
        title={t('editProfile')}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent={true}
        scrollY={scrollY}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 54 + 10 }]}
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {/* Card 1: Avatar & Thông tin cá nhân */}
          <View style={styles.sectionCard}>
            {/* Avatar Picker */}
            <View style={styles.avatarPickerSection}>
              <View style={styles.avatarPickerWrapper}>
                {editAvatar ? (
                  <Image source={{ uri: editAvatar }} style={styles.avatarPickerImg} />
                ) : (
                  <View style={styles.avatarPickerPlaceholder}>
                    <Ionicons name="person" size={40} color="#7A827E" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.cameraBtn}
                  activeOpacity={0.85}
                  onPress={handlePickAvatar}
                >
                  <Ionicons name="camera" size={15} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.7}>
                <Text style={styles.changeAvatarText}>{t('changeAvatar')}</Text>
              </TouchableOpacity>
            </View>

            {/* Form Input: Họ và tên */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('fullNameLabel')}</Text>
              <View style={styles.pillInputWrapper}>
                <Ionicons name="person-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.pillInput}
                  placeholder={t('enterFullNamePlaceholder')}
                  placeholderTextColor="#A0A8A4"
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>
            </View>

            {/* Form Input: Số điện thoại */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('phoneLabel')}</Text>
              <View style={styles.pillInputWrapper}>
                <Ionicons name="call-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.pillInput}
                  placeholder={t('phoneInputPlaceholder')}
                  placeholderTextColor="#A0A8A4"
                  keyboardType="phone-pad"
                  value={editPhone}
                  onChangeText={setEditPhone}
                />
              </View>
            </View>

            {/* Form Input: Email (Tương tự web, hiển thị thông tin tài khoản) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('emailLabel')}</Text>
              <View style={[styles.pillInputWrapper, styles.disabledPillWrapper]}>
                <Ionicons name="mail-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={[styles.pillInput, styles.disabledInput]}
                  value={userEmail || t('unlinkedEmail')}
                  editable={false}
                />
              </View>
            </View>

            {/* Form Input: Giới tính */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('genderLabel')}</Text>
              <View style={styles.genderRow}>
                {[
                  { id: 'Nam', label: t('genderMale') },
                  { id: 'Nữ', label: t('genderFemale') },
                  { id: 'Khác', label: t('genderOther') },
                ].map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.genderPill, editGender === g.id && styles.genderPillActive]}
                    onPress={() => setEditGender(g.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.genderText, editGender === g.id && styles.genderTextActive]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Form Input: Ngày sinh với Modal chọn lịch */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('dobLabel')}</Text>
              <TouchableOpacity
                style={styles.pillInputWrapper}
                activeOpacity={0.75}
                onPress={() => setDatePickerVisible(true)}
              >
                <Ionicons name="calendar-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <Text style={[styles.pillInput, { lineHeight: 50, color: editDob ? '#2B2928' : '#A0A8A4' }]}>
                  {editDob ? (() => {
                    if (editDob.includes('-')) {
                      const parts = editDob.split('-');
                      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                    return editDob;
                  })() : t('selectDobPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#7A827E" style={{ marginRight: 16 }} />
              </TouchableOpacity>
            </View>

            {/* Form Input: Ngày tham gia (Tương tự web) */}
            <View style={[styles.inputGroup, { marginBottom: 6 }]}>
              <Text style={styles.inputLabel}>{t('joinDateLabel')}</Text>
              <View style={[styles.pillInputWrapper, styles.disabledPillWrapper]}>
                <Ionicons name="time-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={[styles.pillInput, styles.disabledInput]}
                  value={joinDate}
                  editable={false}
                />
              </View>
            </View>
          </View>

          {/* Card 2: Địa chỉ giao hàng */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionCardHeader}>
              <Ionicons name="location-outline" size={18} color={isDark ? '#E8CCB2' : '#9C7156'} />
              <Text style={styles.sectionCardTitle}>{t('deliveryAddressTitle')}</Text>
            </View>

            {/* Form Input: Chọn Tỉnh / Thành phố / Phường / Xã */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('areaLabel')}</Text>
              <TouchableOpacity
                style={styles.locationPill}
                onPress={() => {
                  Keyboard.dismiss();
                  setAddressPickerVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="map-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <Text style={[styles.locationText, !locationName && styles.locationPlaceholder]} numberOfLines={1}>
                  {locationName || t('selectAreaPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#7A827E" />
              </TouchableOpacity>
            </View>

            {/* Form Input: Số nhà, Tên đường */}
            <View style={[styles.inputGroup, { marginBottom: 4 }]}>
              <Text style={styles.inputLabel}>{t('streetAddressLabel')}</Text>
              <TextInput
                style={styles.textAreaInput}
                placeholder={t('streetAddressPlaceholder')}
                placeholderTextColor="#A0A8A4"
                value={editStreet}
                onChangeText={setEditStreet}
                multiline
              />
            </View>
          </View>
        </ScrollView>

        <AddressPicker
          visible={addressPickerVisible}
          onClose={() => setAddressPickerVisible(false)}
          initialProvinceCode={provinceCode}
          initialWardCode={wardCode}
          onSelect={(prov, ward) => {
            setProvinceCode(prov.province_code);
            setWardCode(ward.ward_code);
            setLocationName(`${ward.name}, ${prov.name}`);
          }}
        />

        {/* Modal Chọn Ngày Sinh Nhật (Lịch) */}
        <AnimatedBottomSheetModal
          visible={datePickerVisible}
          onClose={() => setDatePickerVisible(false)}
          contentStyle={styles.calendarModalContent}
          showHandle={true}
        >
          <View style={styles.calendarHeader}>
            <Text style={styles.calendarTitle}>{t('selectDobModalTitle')}</Text>
            <TouchableOpacity onPress={() => setDatePickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Month & Year Selectors */}
          <View style={styles.calendarControlsRow}>
            {/* Year selector */}
            <View style={styles.calControlGroup}>
              <TouchableOpacity
                onPress={() => setCalYear(prev => Math.max(1940, prev - 1))}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-back" size={16} color="#9C7156" />
              </TouchableOpacity>
              <Text style={styles.calNavLabel}>{t('yearFormat', { year: calYear })}</Text>
              <TouchableOpacity
                onPress={() => setCalYear(prev => Math.min(new Date().getFullYear(), prev + 1))}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-forward" size={16} color="#9C7156" />
              </TouchableOpacity>
            </View>

            {/* Month selector */}
            <View style={styles.calControlGroup}>
              <TouchableOpacity
                onPress={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear(prev => prev - 1);
                  } else {
                    setCalMonth(prev => prev - 1);
                  }
                }}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-back" size={16} color="#9C7156" />
              </TouchableOpacity>
              <Text style={styles.calNavLabel}>{t('monthFormat', { month: calMonth + 1 })}</Text>
              <TouchableOpacity
                onPress={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear(prev => prev + 1);
                  } else {
                    setCalMonth(prev => prev + 1);
                  }
                }}
                style={styles.calNavBtn}
              >
                <Ionicons name="chevron-forward" size={16} color="#9C7156" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Day of Week Headers */}
          <View style={styles.weekRow}>
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((w, idx) => (
              <Text key={w} style={[styles.weekDayText, idx === 0 && { color: '#C86432' }]}>{w}</Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {(() => {
              const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
              const items = [];

              for (let i = 0; i < firstDayOfWeek; i++) {
                items.push(<View key={`empty-${i}`} style={styles.dayCell} />);
              }

              for (let d = 1; d <= daysInMonth; d++) {
                const isSelected = calDay === d;
                items.push(
                  <TouchableOpacity
                    key={`day-${d}`}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                    onPress={() => setCalDay(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>{d}</Text>
                  </TouchableOpacity>
                );
              }

              return items;
            })()}
          </View>

          {/* Confirm Button */}
          <View style={{ marginTop: 18, marginBottom: 10 }}>
            <TouchableOpacity
              style={styles.btnConfirmDate}
              onPress={() => {
                const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
                const formatted = `${calYear}-${pad(calMonth + 1)}-${pad(calDay)}`;
                setEditDob(formatted);
                setDatePickerVisible(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.btnConfirmDateText}>
                {t('confirmDate', { day: calDay, month: calMonth + 1, year: calYear })}
              </Text>
            </TouchableOpacity>
          </View>
        </AnimatedBottomSheetModal>

        {/* Bottom CTA Action Button */}
        <View style={styles.footerAction}>
          <TouchableOpacity
            style={[styles.saveBtn, savingProfile && styles.saveBtnDisabled]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
            activeOpacity={0.88}
          >
            <Text style={styles.saveBtnText}>
              {savingProfile ? t('saving') : t('saveProfile')}
            </Text>
            {!savingProfile && (
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginLeft: 6 }} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // 1. Nhóm Card chuẩn Profile (Bo tròn 20px, không viền ở Dark Mode)
  sectionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
  },
  sectionCardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Avatar Section
  avatarPickerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarPickerWrapper: {
    position: 'relative',
    width: 88,
    height: 88,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPickerImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    resizeMode: 'cover',
  },
  avatarPickerPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F4EFEB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: isDark ? 0 : 1.5,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
  },
  cameraBtn: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#9C7156',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
    elevation: 4,
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.2,
    shadowRadius: 3,
  },
  changeAvatarText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: isDark ? '#E8CCB2' : '#111111',
    textDecorationLine: 'underline',
  },

  // 2. Input Fields chuẩn Login
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textSecondary || '#6E665D',
    fontWeight: '700',
    marginBottom: 6,
    marginLeft: 4,
  },
  pillInputWrapper: {
    height: 52,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  disabledPillWrapper: {
    backgroundColor: isDark ? '#222222' : '#F3EFEA',
    borderColor: isDark ? 'transparent' : '#DFD8CE',
  },
  inputIcon: {
    marginRight: 10,
  },
  pillInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    color: Colors.textPrimary,
    height: '100%',
  },
  disabledInput: {
    color: Colors.textMuted || '#7D756C',
  },
  locationPill: {
    height: 52,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    borderRadius: 26,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
    color: Colors.textPrimary,
  },
  locationPlaceholder: {
    color: Colors.textMuted || '#A0A8A4',
  },
  textAreaInput: {
    minHeight: 84,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },

  // Giới tính dạng Pill Buttons
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderPill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
  },
  genderPillActive: {
    backgroundColor: isDark ? '#9C7156' : '#2B2928',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#2B2928',
  },
  genderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textSecondary || '#6E665D',
    fontWeight: '600',
  },
  genderTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // 3. Bottom CTA Button
  footerAction: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: isDark ? (Colors.divider || '#2A2A2A') : '#E8E1D8',
  },
  saveBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0 : 0.16,
    shadowRadius: 8,
    elevation: isDark ? 0 : 4,
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Calendar Modal Styles
  calendarModalContent: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
  },
  calendarTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  calendarControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  calControlGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  calNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
  },
  calNavLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderRadius: 12,
    marginBottom: 8,
  },
  weekDayText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary || '#6E665D',
    width: 38,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 20,
  },
  dayCellSelected: {
    backgroundColor: '#9C7156',
  },
  dayCellText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  btnConfirmDate: {
    backgroundColor: '#9C7156',
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0 : 0.15,
    shadowRadius: 6,
    elevation: isDark ? 0 : 3,
  },
  btnConfirmDateText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
