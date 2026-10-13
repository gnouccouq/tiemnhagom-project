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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { useDialog } from '../src/context/DialogContext';
import { AddressPicker } from '../src/components/AddressPicker';
import { ScalePressable } from '../src/components/ScalePressable';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { Colors, Typography, Spacing } from '../src/constants/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userProfile, updateUserProfileData } = useAuth();

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
          setJoinDate('Thành viên');
        }
      } catch {
        setJoinDate('Thành viên');
      }
    } else {
      setJoinDate('Thành viên');
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
        dialog.alert('Quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để đổi ảnh đại diện.');
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
      dialog.alert('Lỗi', 'Không thể mở thư viện ảnh.');
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      dialog.alert('Lỗi', 'Vui lòng nhập họ và tên của bạn.');
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
        title: 'Thành công',
        message: 'Thông tin tài khoản đã được cập nhật và đồng bộ với hệ thống!',
        type: 'success',
        buttons: [{ text: 'Đã hiểu', style: 'primary', onPress: () => router.back() }],
      });
    } catch (e: any) {
      console.warn('Lỗi lưu thông tin:', e);
      dialog.alert('Lỗi', e.message || 'Không thể cập nhật thông tin lúc này. Vui lòng thử lại.');
    } finally {
      setSavingProfile(false);
    }
  };

  const [scrollY, setScrollY] = useState(0);
  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      
      {/* Header Modal */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        {blurProgress > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: blurProgress }]} pointerEvents="none">
            <BlurView
              intensity={Platform.OS === 'ios' ? 85 : 75}
              tint="light"
              blurMethod="none"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Platform.OS === 'ios' ? 'rgba(255,255,255,0.12)' : 'rgba(250,248,245,0.45)',
                },
              ]}
            />
          </View>
        )}
        <ScalePressable
          onPress={() => router.back()}
          style={styles.headerBackBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#18181B" />
        </ScalePressable>
        <Text style={styles.headerTitle}>Chỉnh Sửa Thông Tin</Text>
        <View style={{ width: 40 }} />
      </View>

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
                <ScalePressable
                  style={styles.cameraBtn}
                  onPress={handlePickAvatar}
                >
                  <Ionicons name="camera" size={15} color="#FFFFFF" />
                </ScalePressable>
              </View>
              <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.7}>
                <Text style={styles.changeAvatarText}>Đổi ảnh đại diện</Text>
              </TouchableOpacity>
            </View>

            {/* Form Input: Họ và tên */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Họ và tên *</Text>
              <View style={styles.pillInputWrapper}>
                <Ionicons name="person-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.pillInput}
                  placeholder="Nhập họ và tên..."
                  placeholderTextColor="#A0A8A4"
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>
            </View>

            {/* Form Input: Số điện thoại */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Số điện thoại</Text>
              <View style={styles.pillInputWrapper}>
                <Ionicons name="call-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.pillInput}
                  placeholder="Ví dụ: 0909123456"
                  placeholderTextColor="#A0A8A4"
                  keyboardType="phone-pad"
                  value={editPhone}
                  onChangeText={setEditPhone}
                />
              </View>
            </View>

            {/* Form Input: Email (Tương tự web, hiển thị thông tin tài khoản) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={[styles.pillInputWrapper, styles.disabledPillWrapper]}>
                <Ionicons name="mail-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={[styles.pillInput, styles.disabledInput]}
                  value={userEmail || 'Chưa liên kết email'}
                  editable={false}
                />
              </View>
            </View>

            {/* Form Input: Giới tính */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Giới tính</Text>
              <View style={styles.genderRow}>
                {['Nam', 'Nữ', 'Khác'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderPill, editGender === g && styles.genderPillActive]}
                    onPress={() => setEditGender(g)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.genderText, editGender === g && styles.genderTextActive]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Form Input: Ngày sinh với Modal chọn lịch */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ngày sinh</Text>
              <TouchableOpacity
                style={styles.pillInputWrapper}
                activeOpacity={0.75}
                onPress={() => setDatePickerVisible(true)}
              >
                <Ionicons name="calendar-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <Text style={[styles.pillInput, { lineHeight: 50, color: editDob ? '#2B2928' : '#A0A8A4' }]}>
                  {editDob || 'Chọn ngày sinh nhật...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#7A827E" style={{ marginRight: 16 }} />
              </TouchableOpacity>
            </View>

            {/* Form Input: Ngày tham gia (Tương tự web) */}
            <View style={[styles.inputGroup, { marginBottom: 6 }]}>
              <Text style={styles.inputLabel}>Ngày tham gia</Text>
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
              <Ionicons name="location-outline" size={18} color="#18181B" />
              <Text style={styles.sectionCardTitle}>Địa chỉ giao hàng</Text>
            </View>

            {/* Form Input: Chọn Tỉnh / Thành phố / Phường / Xã */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tỉnh / Thành phố, Phường / Xã</Text>
              <TouchableOpacity
                style={styles.locationPill}
                onPress={() => setAddressPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="map-outline" size={18} color="#8E8E93" style={styles.inputIcon} />
                <Text style={[styles.locationText, !locationName && styles.locationPlaceholder]} numberOfLines={1}>
                  {locationName || 'Chọn khu vực giao hàng...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#7A827E" />
              </TouchableOpacity>
            </View>

            {/* Form Input: Số nhà, Tên đường */}
            <View style={[styles.inputGroup, { marginBottom: 4 }]}>
              <Text style={styles.inputLabel}>Số nhà, Tên đường</Text>
              <TextInput
                style={styles.textAreaInput}
                placeholder="Nhập số nhà, tên đường, hẻm, tòa nhà..."
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
            <Text style={styles.calendarTitle}>Chọn Ngày Sinh Nhật</Text>
            <TouchableOpacity onPress={() => setDatePickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#18181B" />
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
              <Text style={styles.calNavLabel}>Năm {calYear}</Text>
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
              <Text style={styles.calNavLabel}>Tháng {calMonth + 1}</Text>
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
                Xác nhận ngày {calDay}/{calMonth + 1}/{calYear}
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
              {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: '#231B15',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // 1. Nhóm Card chuẩn Profile (Bo tròn 20px, bóng nhẹ)
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE6',
  },
  sectionCardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#231B15',
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
    borderColor: '#E8E1D8',
    resizeMode: 'cover',
  },
  avatarPickerPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F4EFEB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E1D8',
  },
  cameraBtn: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#111111',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  changeAvatarText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#111111',
    textDecorationLine: 'underline',
  },

  // 2. Input Fields chuẩn Login (Dạng viên thuốc height: 52px, borderRadius: 26px)
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#6E665D',
    fontWeight: '700',
    marginBottom: 6,
    marginLeft: 4,
  },
  pillInputWrapper: {
    height: 52,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  disabledPillWrapper: {
    backgroundColor: '#F3EFEA',
    borderColor: '#DFD8CE',
  },
  inputIcon: {
    marginRight: 10,
  },
  pillInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    color: '#231B15',
    height: '100%',
  },
  disabledInput: {
    color: '#7D756C',
  },
  locationPill: {
    height: 52,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    borderRadius: 26,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
    color: '#231B15',
  },
  locationPlaceholder: {
    color: '#A0A8A4',
  },
  textAreaInput: {
    minHeight: 84,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
    color: '#231B15',
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
    borderWidth: 1,
    borderColor: '#E8E1D8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F5',
  },
  genderPillActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  genderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#6E665D',
    fontWeight: '600',
  },
  genderTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // 3. Bottom CTA Button chuẩn Login (height: 52px, borderRadius: 26px, nổi khối)
  footerAction: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E1D8',
  },
  saveBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
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

  // Calendar Modal Styles (Bo tròn 24px, chuẩn GEMINI.md)
  calendarModalContent: {
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#F0ECE6',
  },
  calendarTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#2B2928',
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
    backgroundColor: '#FAF8F5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  calNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  calNavLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#2B2928',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    backgroundColor: '#FAF8F5',
    borderRadius: 12,
    marginBottom: 8,
  },
  weekDayText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#6E665D',
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
    color: '#2B2928',
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
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  btnConfirmDateText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
