import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  StatusBar,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { useDialog } from '../src/context/DialogContext';
import { useSettings } from '../src/context/SettingsContext';
import { AddressPicker } from '../src/components/AddressPicker';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { useThemeColor } from '../src/constants/theme';
import { Header } from '../src/components/Header';
import { resolveMemberJoinDate } from '../src/utils/joinDate';

type ActiveSheet = 'name' | 'phone' | 'gender' | 'address' | null;

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile, updateUserProfileData, signOut } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGender, setEditGender] = useState('Nam');
  const [editDob, setEditDob] = useState('');
  const [editStreet, setEditStreet] = useState('');
  const [provinceCode, setProvinceCode] = useState<string | undefined>();
  const [wardCode, setWardCode] = useState<string | undefined>();
  const [locationName, setLocationName] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [joinDate, setJoinDate] = useState('');

  // Bottom sheet state
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftGender, setDraftGender] = useState('Nam');
  const [draftStreet, setDraftStreet] = useState('');
  const [draftProvinceCode, setDraftProvinceCode] = useState<string | undefined>();
  const [draftWardCode, setDraftWardCode] = useState<string | undefined>();
  const [draftLocationName, setDraftLocationName] = useState('');
  const [savingField, setSavingField] = useState(false);

  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  const linkedPhone = (userProfile?.phone || user?.phoneNumber || '').trim();
  const hasLinkedPhone = Boolean(linkedPhone);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState<number>(now.getFullYear() - 20);
  const [calMonth, setCalMonth] = useState<number>(now.getMonth());
  const [calDay, setCalDay] = useState<number>(1);

  useEffect(() => {
    setEditName(userProfile?.displayName || userProfile?.name || user?.displayName || '');
    setEditPhone(userProfile?.phone || user?.phoneNumber || '');
    setUserEmail(user?.email || userProfile?.email || '');

    const joined = resolveMemberJoinDate(userProfile, user);
    setJoinDate(joined ? joined.toLocaleDateString('vi-VN') : (t('memberRole') || 'Thành viên'));

    setEditGender(userProfile?.gender || 'Nam');
    const existingDob = userProfile?.dob || userProfile?.birthday || '';
    setEditDob(existingDob);

    if (existingDob) {
      if (existingDob.includes('-')) {
        const [y, m, d] = existingDob.split('-').map(Number);
        if (y && m && d) {
          setCalYear(y);
          setCalMonth(m - 1);
          setCalDay(d);
        }
      } else if (existingDob.includes('/')) {
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
    setEditAvatar(userProfile?.photoURL || userProfile?.avatar || user?.photoURL || null);
  }, [userProfile, user]);

  const handlePhoneLockedNotice = () => {
    dialog.alert(
      t('phoneLockedTitle') || 'Số điện thoại đã liên kết',
      t('phoneLockedDesc') || 'Số điện thoại đã gắn với tài khoản không thể tự thay đổi. Vui lòng liên hệ Admin nếu bạn cần cập nhật.'
    );
  };

  const persistProfilePatch = async (patch: Record<string, any>) => {
    setSavingField(true);
    try {
      await updateUserProfileData(patch);
      return true;
    } catch (e: any) {
      console.warn('Lỗi lưu thông tin:', e);
      dialog.alert(t('error') || 'Lỗi', e?.message || t('profileUpdateError') || 'Không thể cập nhật thông tin.');
      return false;
    } finally {
      setSavingField(false);
    }
  };

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
        const nextAvatar = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setEditAvatar(nextAvatar);
        await persistProfilePatch({ photoURL: nextAvatar });
      }
    } catch (e) {
      console.warn('Lỗi chọn ảnh:', e);
      dialog.alert(t('error') || 'Lỗi', t('photoPermissionRequired'));
    }
  };

  const openNameSheet = () => {
    setDraftName(editName);
    setActiveSheet('name');
  };

  const openPhoneSheet = () => {
    if (hasLinkedPhone) {
      handlePhoneLockedNotice();
      return;
    }
    setDraftPhone(editPhone);
    setActiveSheet('phone');
  };

  const openGenderSheet = () => {
    setDraftGender(editGender || 'Nam');
    setActiveSheet('gender');
  };

  const openAddressSheet = () => {
    setDraftStreet(editStreet);
    setDraftProvinceCode(provinceCode);
    setDraftWardCode(wardCode);
    setDraftLocationName(locationName);
    setActiveSheet('address');
  };

  const handleSaveName = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      dialog.alert(t('error') || 'Lỗi', t('nameRequiredError') || 'Vui lòng nhập tên của bạn.');
      return;
    }
    const ok = await persistProfilePatch({ displayName: trimmed, name: trimmed });
    if (ok) {
      setEditName(trimmed);
      setActiveSheet(null);
    }
  };

  const handleSavePhone = async () => {
    const trimmed = draftPhone.trim();
    const ok = await persistProfilePatch({ phone: trimmed });
    if (ok) {
      setEditPhone(trimmed);
      setActiveSheet(null);
    }
  };

  const handleSaveGender = async () => {
    const ok = await persistProfilePatch({ gender: draftGender });
    if (ok) {
      setEditGender(draftGender);
      setActiveSheet(null);
    }
  };

  const handleSaveAddress = async () => {
    const street = draftStreet.trim();
    const fullAddr = draftLocationName ? (street ? `${street}, ${draftLocationName}` : draftLocationName) : street;
    const ok = await persistProfilePatch({
      address: street,
      streetAddress: street,
      fullAddress: fullAddr,
      provinceCode: draftProvinceCode,
      wardCode: draftWardCode,
      locationName: draftLocationName,
    });
    if (ok) {
      setEditStreet(street);
      setProvinceCode(draftProvinceCode);
      setWardCode(draftWardCode);
      setLocationName(draftLocationName);
      setActiveSheet(null);
    }
  };

  const handleConfirmDob = async () => {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const formatted = `${calYear}-${pad(calMonth + 1)}-${pad(calDay)}`;
    const ok = await persistProfilePatch({ dob: formatted, birthday: formatted });
    if (ok) {
      setEditDob(formatted);
      setDatePickerVisible(false);
    }
  };

  const handleSignOut = () => {
    dialog.confirm(
      t('signOutTitle') || 'Đăng xuất',
      t('signOutConfirm') || 'Bạn có chắc chắn muốn đăng xuất tài khoản khỏi thiết bị?',
      async () => {
        await signOut();
        router.replace('/onboarding');
      },
      t('signOutTitle') || 'Đăng xuất',
      t('cancel') || 'Hủy'
    );
  };

  const handleDeleteAccount = () => {
    dialog.confirm(
      t('deleteAccountTitle') || 'Xóa tài khoản',
      t('deleteAccountConfirm') || 'Hành động này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu tích điểm. Bạn có chắc chắn không?',
      async () => {
        try {
          if (user && user.delete) {
            await user.delete();
          }
          await signOut();
          dialog.alert(
            t('success') || 'Thành công',
            t('accountDeleted') || 'Tài khoản của bạn đã được xóa thành công.'
          );
          router.replace('/(tabs)');
        } catch (e: any) {
          dialog.alert(t('error') || 'Lỗi', e?.message || t('deleteAccountError') || 'Không thể xóa tài khoản lúc này.');
        }
      },
      t('confirmDelete') || 'Xóa tài khoản',
      t('cancel') || 'Hủy'
    );
  };

  const formattedDob = editDob
    ? (() => {
        if (editDob.includes('-')) {
          const parts = editDob.split('-');
          if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return editDob;
      })()
    : '';

  const genderLabel =
    editGender === 'Nữ'
      ? (t('genderFemale') || 'Nữ')
      : editGender === 'Khác'
      ? (t('genderOther') || 'Khác')
      : (t('genderMale') || 'Nam');

  const fullAddressDisplay = [editStreet.trim(), locationName.trim()].filter(Boolean).join(', ');
  const displayInitial = (editName || userEmail || 'G').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <Header
        title={t('profileTab') || 'Tài khoản'}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent={true}
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56 + 14, paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* 1. HERO AVATAR + TÊN + SĐT */}
        <View style={styles.heroSection}>
          <TouchableOpacity
            style={styles.avatarTouchable}
            activeOpacity={0.85}
            onPress={handlePickAvatar}
          >
            {editAvatar ? (
              <Image source={{ uri: editAvatar }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarInitialCircle}>
                <Text style={styles.avatarInitialText}>{displayInitial}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName} numberOfLines={1}>
            {editName || t('memberRole') || 'Thành viên'}
          </Text>
          {!!(editPhone || userEmail) && (
            <Text style={styles.heroSub} numberOfLines={1}>
              {editPhone || userEmail}
            </Text>
          )}
        </View>

        {/* 2. CARD THÔNG TIN CÁ NHÂN (CHẠM TỪNG DÒNG ĐỂ SỬA) */}
        <View style={styles.groupCard}>
          <TouchableOpacity style={styles.infoRow} activeOpacity={0.7} onPress={openNameSheet}>
            <Text style={styles.infoLabel}>{t('nameShortLabel') || 'Tên'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {editName || t('notUpdated') || 'Chưa cập nhật'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted || '#9E968D'} />
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.infoRow} activeOpacity={0.7} onPress={openPhoneSheet}>
            <Text style={styles.infoLabel}>{t('phoneLabel') || 'Số điện thoại'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {editPhone || t('notUpdated') || 'Chưa cập nhật'}
              </Text>
              {!hasLinkedPhone && (
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted || '#9E968D'} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('emailLabel') || 'Email'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {userEmail || t('unlinkedEmail') || 'Chưa liên kết'}
              </Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.infoRow} activeOpacity={0.7} onPress={openGenderSheet}>
            <Text style={styles.infoLabel}>{t('genderLabel') || 'Giới tính'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {genderLabel}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted || '#9E968D'} />
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.infoRow} activeOpacity={0.7} onPress={() => setDatePickerVisible(true)}>
            <Text style={styles.infoLabel}>{t('dobLabel') || 'Ngày sinh'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {formattedDob || t('notUpdated') || 'Chưa cập nhật'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted || '#9E968D'} />
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.infoRow} activeOpacity={0.7} onPress={openAddressSheet}>
            <Text style={styles.infoLabel}>{t('deliveryAddressTitle') || 'Địa chỉ'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {fullAddressDisplay || t('notUpdated') || 'Chưa cập nhật'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted || '#9E968D'} />
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('joinDateLabel') || 'Ngày tham gia'}</Text>
            <View style={styles.infoValueWrap}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {joinDate}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. CARD ĐĂNG XUẤT */}
        <TouchableOpacity style={styles.actionCard} activeOpacity={0.75} onPress={handleSignOut}>
          <View style={styles.logoutLeft}>
            <View style={styles.logoutIconCircle}>
              <Ionicons name="log-out-outline" size={20} color={Colors.textPrimary} />
            </View>
            <Text style={styles.logoutText}>{t('signOutTitle') || 'Đăng xuất'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
        </TouchableOpacity>

        {/* 4. CARD XÓA TÀI KHOẢN */}
        <TouchableOpacity style={styles.deleteCard} activeOpacity={0.75} onPress={handleDeleteAccount}>
          <Text style={styles.deleteTitle}>{t('deleteAccountTitle') || 'Xóa tài khoản'}</Text>
          <Text style={styles.deleteSub}>
            {t('deleteAccountShortDesc') || 'Xóa vĩnh viễn tài khoản, đơn hàng và toàn bộ điểm gốm.'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ================= BOTTOM SHEET: SỬA TÊN ================= */}
      <AnimatedBottomSheetModal
        visible={activeSheet === 'name'}
        onClose={() => setActiveSheet(null)}
        contentStyle={styles.sheetModalContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('yourNameSheetTitle') || 'Tên của bạn'}</Text>

        <View style={styles.outlinedInputContainer}>
          <Text style={styles.outlinedLabel}>{t('nameShortLabel') || 'Tên'}</Text>
          <TextInput
            style={styles.outlinedInput}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={t('enterFullNamePlaceholder') || 'Nhập tên của bạn'}
            placeholderTextColor={isDark ? '#807A73' : '#A09A92'}
            autoFocus={true}
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
          />
        </View>
        <Text style={styles.sheetHelperText}>
          {t('nameSheetHelper') || 'Tên sẽ hiển thị trên thẻ thành viên và đơn hàng của bạn'}
        </Text>

        <TouchableOpacity
          style={[styles.sheetSaveBtn, savingField && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={savingField}
          onPress={handleSaveName}
        >
          {savingField ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sheetSaveBtnText}>{t('saveBtn') || 'Lưu'}</Text>
          )}
        </TouchableOpacity>
      </AnimatedBottomSheetModal>

      {/* ================= BOTTOM SHEET: SỬA SỐ ĐIỆN THOẠI ================= */}
      <AnimatedBottomSheetModal
        visible={activeSheet === 'phone'}
        onClose={() => setActiveSheet(null)}
        contentStyle={styles.sheetModalContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('phoneLabel') || 'Số điện thoại'}</Text>

        <View style={styles.outlinedInputContainer}>
          <Text style={styles.outlinedLabel}>{t('phoneLabel') || 'Số điện thoại'}</Text>
          <TextInput
            style={styles.outlinedInput}
            value={draftPhone}
            onChangeText={setDraftPhone}
            placeholder={t('phoneInputPlaceholder') || 'Nhập số điện thoại'}
            placeholderTextColor={isDark ? '#807A73' : '#A09A92'}
            keyboardType="phone-pad"
            autoFocus={true}
          />
        </View>

        <TouchableOpacity
          style={[styles.sheetSaveBtn, savingField && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={savingField}
          onPress={handleSavePhone}
        >
          {savingField ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sheetSaveBtnText}>{t('saveBtn') || 'Lưu'}</Text>
          )}
        </TouchableOpacity>
      </AnimatedBottomSheetModal>

      {/* ================= BOTTOM SHEET: CHỌN GIỚI TÍNH ================= */}
      <AnimatedBottomSheetModal
        visible={activeSheet === 'gender'}
        onClose={() => setActiveSheet(null)}
        contentStyle={styles.sheetModalContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('genderLabel') || 'Giới tính'}</Text>

        <View style={styles.genderSheetRow}>
          {[
            { id: 'Nam', label: t('genderMale') || 'Nam' },
            { id: 'Nữ', label: t('genderFemale') || 'Nữ' },
            { id: 'Khác', label: t('genderOther') || 'Khác' },
          ].map((g) => {
            const active = draftGender === g.id;
            return (
              <TouchableOpacity
                key={g.id}
                style={[styles.genderOptionPill, active && styles.genderOptionPillActive]}
                activeOpacity={0.8}
                onPress={() => setDraftGender(g.id)}
              >
                <Text style={[styles.genderOptionText, active && styles.genderOptionTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.sheetSaveBtn, savingField && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={savingField}
          onPress={handleSaveGender}
        >
          {savingField ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sheetSaveBtnText}>{t('saveBtn') || 'Lưu'}</Text>
          )}
        </TouchableOpacity>
      </AnimatedBottomSheetModal>

      {/* ================= BOTTOM SHEET: SỬA ĐỊA CHỈ ================= */}
      <AnimatedBottomSheetModal
        visible={activeSheet === 'address'}
        onClose={() => setActiveSheet(null)}
        contentStyle={styles.sheetModalContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('deliveryAddressTitle') || 'Địa chỉ giao hàng'}</Text>

        <TouchableOpacity
          style={styles.areaPickerField}
          activeOpacity={0.75}
          onPress={() => {
            Keyboard.dismiss();
            setAddressPickerVisible(true);
          }}
        >
          <Ionicons name="location-outline" size={18} color="#9C7156" style={{ marginRight: 10 }} />
          <Text
            style={[styles.areaPickerText, !draftLocationName && { color: isDark ? '#807A73' : '#A09A92' }]}
            numberOfLines={1}
          >
            {draftLocationName || t('selectAreaPlaceholder') || 'Chọn Tỉnh/Thành, Phường/Xã'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted || '#9E968D'} />
        </TouchableOpacity>

        <View style={[styles.outlinedInputContainer, { marginTop: 14 }]}>
          <Text style={styles.outlinedLabel}>{t('streetAddressLabel') || 'Số nhà, tên đường'}</Text>
          <TextInput
            style={styles.outlinedInput}
            value={draftStreet}
            onChangeText={setDraftStreet}
            placeholder={t('streetAddressPlaceholder') || 'Nhập số nhà, tên đường'}
            placeholderTextColor={isDark ? '#807A73' : '#A09A92'}
          />
        </View>

        <TouchableOpacity
          style={[styles.sheetSaveBtn, savingField && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={savingField}
          onPress={handleSaveAddress}
        >
          {savingField ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sheetSaveBtnText}>{t('saveBtn') || 'Lưu'}</Text>
          )}
        </TouchableOpacity>
      </AnimatedBottomSheetModal>

      <AddressPicker
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        initialProvinceCode={draftProvinceCode}
        initialWardCode={draftWardCode}
        onSelect={(prov, ward) => {
          setDraftProvinceCode(prov.province_code);
          setDraftWardCode(ward.ward_code);
          setDraftLocationName(`${ward.name}, ${prov.name}`);
        }}
      />

      {/* ================= BOTTOM SHEET: CHỌN NGÀY SINH ================= */}
      <AnimatedBottomSheetModal
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        contentStyle={styles.sheetModalContent}
        showHandle={true}
      >
        <View style={styles.calendarHeader}>
          <Text style={styles.sheetTitle}>{t('selectDobModalTitle') || 'Chọn ngày sinh'}</Text>
          <TouchableOpacity onPress={() => setDatePickerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarControlsRow}>
          <View style={styles.calControlGroup}>
            <TouchableOpacity onPress={() => setCalYear((prev) => Math.max(1940, prev - 1))} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={16} color="#9C7156" />
            </TouchableOpacity>
            <Text style={styles.calNavLabel}>{t('yearFormat', { year: calYear })}</Text>
            <TouchableOpacity onPress={() => setCalYear((prev) => Math.min(new Date().getFullYear(), prev + 1))} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={16} color="#9C7156" />
            </TouchableOpacity>
          </View>

          <View style={styles.calControlGroup}>
            <TouchableOpacity
              onPress={() => {
                if (calMonth === 0) {
                  setCalMonth(11);
                  setCalYear((prev) => prev - 1);
                } else {
                  setCalMonth((prev) => prev - 1);
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
                  setCalYear((prev) => prev + 1);
                } else {
                  setCalMonth((prev) => prev + 1);
                }
              }}
              style={styles.calNavBtn}
            >
              <Ionicons name="chevron-forward" size={16} color="#9C7156" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.weekRow}>
          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((w, idx) => (
            <Text key={w} style={[styles.weekDayText, idx === 0 && { color: '#C86432' }]}>
              {w}
            </Text>
          ))}
        </View>

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

        <TouchableOpacity
          style={[styles.sheetSaveBtn, { marginTop: 18 }, savingField && { opacity: 0.6 }]}
          onPress={handleConfirmDob}
          disabled={savingField}
          activeOpacity={0.85}
        >
          {savingField ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sheetSaveBtnText}>
              {t('confirmDate', { day: calDay, month: calMonth + 1, year: calYear })}
            </Text>
          )}
        </TouchableOpacity>
      </AnimatedBottomSheetModal>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#121212' : '#FAF8F5'),
    },
    scrollContent: {
      paddingHorizontal: 16,
    },

    // 1. Hero Avatar + Name + Phone
    heroSection: {
      alignItems: 'center',
      marginTop: 6,
      marginBottom: 24,
    },
    avatarTouchable: {
      position: 'relative',
      width: 86,
      height: 86,
      marginBottom: 14,
    },
    avatarImg: {
      width: 86,
      height: 86,
      borderRadius: 43,
    },
    avatarInitialCircle: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitialText: {
      fontSize: 34,
      fontWeight: '800',
      color: '#231B15',
    },
    cameraBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: Colors.background || (isDark ? '#121212' : '#FAF8F5'),
    },
    heroName: {
      fontSize: 22,
      fontWeight: '800',
      color: Colors.textPrimary,
      letterSpacing: -0.3,
    },
    heroSub: {
      fontSize: 14,
      color: Colors.textMuted || '#7D756C',
      marginTop: 4,
    },

    // 2. Grouped Info Card
    groupCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 20,
      marginBottom: 14,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 17,
      gap: 12,
    },
    infoLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    infoValueWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
    },
    infoValue: {
      fontSize: 15,
      color: Colors.textMuted || '#7D756C',
      textAlign: 'right',
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 18,
    },

    // 3. Logout Card
    actionCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 15,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    logoutLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    logoutIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#2A2A2A' : '#F4EFE8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutText: {
      fontSize: 15.5,
      fontWeight: '600',
      color: Colors.textPrimary,
    },

    // 4. Delete Account Card
    deleteCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 16,
      marginBottom: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    deleteTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: '#C84B31',
    },
    deleteSub: {
      fontSize: 13.5,
      color: Colors.textMuted || '#7D756C',
      marginTop: 4,
      lineHeight: 19,
    },

    // Bottom Sheet Modal
    sheetModalContent: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 32 : 24,
      paddingTop: 8,
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginBottom: 18,
      letterSpacing: -0.3,
    },
    outlinedInputContainer: {
      position: 'relative',
      borderWidth: 1.8,
      borderColor: '#9C7156',
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 54,
      justifyContent: 'center',
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
    },
    outlinedLabel: {
      position: 'absolute',
      top: -9,
      left: 12,
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      paddingHorizontal: 5,
      fontSize: 12,
      fontWeight: '600',
      color: '#9C7156',
    },
    outlinedInput: {
      fontSize: 16,
      color: Colors.textPrimary,
      paddingVertical: 0,
    },
    sheetHelperText: {
      fontSize: 12.5,
      color: Colors.textMuted || '#7D756C',
      marginTop: 8,
      marginLeft: 4,
    },
    sheetSaveBtn: {
      marginTop: 22,
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#9C7156' : '#1E1B18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetSaveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Gender Sheet
    genderSheetRow: {
      flexDirection: 'row',
      gap: 10,
    },
    genderOptionPill: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2A2A2A' : '#F4EFE8',
    },
    genderOptionPillActive: {
      backgroundColor: '#9C7156',
    },
    genderOptionText: {
      fontSize: 14.5,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    genderOptionTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },

    // Address Sheet
    areaPickerField: {
      height: 52,
      borderRadius: 14,
      backgroundColor: isDark ? '#2A2A2A' : '#F4EFE8',
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },
    areaPickerText: {
      flex: 1,
      fontSize: 15,
      color: Colors.textPrimary,
    },

    // Calendar Sheet
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    calendarControlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
      gap: 10,
    },
    calControlGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#2A2A2A' : '#F4EFE8',
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    calNavBtn: {
      padding: 4,
    },
    calNavLabel: {
      fontSize: 13.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 8,
    },
    weekDayText: {
      width: '14.28%',
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: Colors.textMuted || '#7D756C',
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.28%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
    },
    dayCellSelected: {
      backgroundColor: '#9C7156',
    },
    dayCellText: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    dayCellTextSelected: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
  });
