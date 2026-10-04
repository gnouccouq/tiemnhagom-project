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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { AddressPicker } from '../src/components/AddressPicker';
import { ScalePressable } from '../src/components/ScalePressable';
import { Colors, Typography, Spacing } from '../src/constants/theme';

export default function EditProfileScreen() {
  const router = useRouter();
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

  useEffect(() => {
    // Khởi tạo dữ liệu
    setEditName(userProfile?.displayName || userProfile?.name || user?.displayName || '');
    setEditPhone(userProfile?.phone || '');
    setEditGender(userProfile?.gender || 'Nam');
    setEditDob(userProfile?.dob || userProfile?.birthday || '');
    setEditStreet(userProfile?.streetAddress || userProfile?.address || userProfile?.fullAddress || '');
    setProvinceCode(userProfile?.provinceCode);
    setWardCode(userProfile?.wardCode);
    setLocationName(userProfile?.locationName || '');
    setEditAvatar(userProfile?.photoURL || user?.photoURL || null);
  }, [userProfile, user]);

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để đổi ảnh đại diện.');
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
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh.');
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập họ và tên của bạn.');
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

      Alert.alert('Thành công', 'Thông tin tài khoản đã được cập nhật và đồng bộ với hệ thống!');
      router.back();
    } catch (e: any) {
      console.warn('Lỗi lưu thông tin:', e);
      Alert.alert('Lỗi', e.message || 'Không thể cập nhật thông tin lúc này. Vui lòng thử lại.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header Modal */}
      <View style={styles.header}>
        <ScalePressable
          onPress={() => router.back()}
          style={styles.headerBackBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color="#18181B" />
        </ScalePressable>
        <Text style={styles.headerTitle}>Chỉnh Sửa Thông Tin</Text>
        <View style={{ width: 40 }} />
        {/* Balance */}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </ScalePressable>
            </View>
            <TouchableOpacity onPress={handlePickAvatar}>
              <Text style={styles.changeAvatarText}>Đổi ảnh đại diện</Text>
            </TouchableOpacity>
          </View>

          {/* Form Input: Họ và tên */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Họ và tên *</Text>
            <TextInput
              style={styles.inputField}
              placeholder="Nhập họ và tên..."
              placeholderTextColor="#A0A8A4"
              value={editName}
              onChangeText={setEditName}
            />
          </View>

          {/* Form Input: Số điện thoại */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Số điện thoại</Text>
            <TextInput
              style={styles.inputField}
              placeholder="Ví dụ: 0909123456"
              placeholderTextColor="#A0A8A4"
              keyboardType="phone-pad"
              value={editPhone}
              onChangeText={setEditPhone}
            />
          </View>

          {/* Form Input: Giới tính */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Giới tính</Text>
            <View style={styles.genderRow}>
              {['Nam', 'Nữ', 'Khác'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, editGender === g && styles.genderBtnActive]}
                  onPress={() => setEditGender(g)}
                >
                  <Text style={[styles.genderText, editGender === g && styles.genderTextActive]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Form Input: Ngày sinh */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Ngày sinh</Text>
            <TextInput
              style={styles.inputField}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#A0A8A4"
              value={editDob}
              onChangeText={setEditDob}
            />
          </View>

          {/* Form Input: Chọn Tỉnh / Thành phố / Phường / Xã */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Tỉnh / Thành phố, Phường / Xã</Text>
            <TouchableOpacity
              style={styles.locationSelector}
              onPress={() => setAddressPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.locationText, !locationName && styles.locationPlaceholder]}>
                {locationName || 'Chọn khu vực giao hàng...'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#7A827E" />
            </TouchableOpacity>
          </View>

          {/* Form Input: Số nhà, Tên đường */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Số nhà, Tên đường</Text>
            <TextInput
              style={[styles.inputField, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Nhập số nhà, tên đường, hẻm, tòa nhà..."
              placeholderTextColor="#A0A8A4"
              value={editStreet}
              onChangeText={setEditStreet}
              multiline
            />
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

        <View style={styles.footerAction}>
          <TouchableOpacity
            style={[styles.saveBtn, savingProfile && styles.saveBtnDisabled]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            <Text style={styles.saveBtnText}>
              {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE6',
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
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0ECE6',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  avatarPickerSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarPickerWrapper: {
    position: 'relative',
    width: 90,
    height: 90,
    marginBottom: 10,
  },
  avatarPickerImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#E1E8DF',
  },
  avatarPickerPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EEF3EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E1E8DF',
  },
  cameraBtn: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#18181B',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  changeAvatarText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
    textDecorationLine: 'underline',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#18181B',
    fontWeight: '700',
    marginBottom: 8,
  },
  inputField: {
    backgroundColor: '#F9FAF9',
    borderWidth: 1,
    borderColor: '#E1E8DF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
    color: '#2D3B34',
  },
  locationSelector: {
    backgroundColor: '#F9FAF9',
    borderWidth: 1,
    borderColor: '#E1E8DF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationText: {
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
    color: '#2D3B34',
    flex: 1,
  },
  locationPlaceholder: {
    color: '#A0A8A4',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  genderBtnActive: {
    backgroundColor: '#F4F4F5',
    borderColor: '#18181B',
  },
  genderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#7A827E',
    fontWeight: '600',
  },
  genderTextActive: {
    color: '#18181B',
    fontWeight: '700',
  },
  footerAction: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0ECE6',
  },
  saveBtn: {
    backgroundColor: '#18181B',
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
