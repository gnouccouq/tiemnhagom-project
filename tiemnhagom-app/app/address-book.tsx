// app/address-book.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { AddressPicker } from '../src/components/AddressPicker';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { ScalePressable } from '../src/components/ScalePressable';
import { useThemeColor, Typography, Spacing, BorderRadius, Shadows } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { UserAddress } from '../src/types';
import { formatPhoneNumber } from '../src/utils/format';

export default function AddressBookScreen() {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const themeStyles = getStyles(Colors, isDark);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userProfile, addAddress, updateAddress, deleteAddress, setDefaultAddress } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const [scrollY, setScrollY] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStreet, setFormStreet] = useState('');
  const [formProvinceName, setFormProvinceName] = useState('');
  const [formProvinceCode, setFormProvinceCode] = useState<string | undefined>(undefined);
  const [formWardName, setFormWardName] = useState('');
  const [formWardCode, setFormWardCode] = useState<string | undefined>(undefined);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Address Picker State
  const [pickerVisible, setPickerVisible] = useState(false);

  const addressList: UserAddress[] = Array.isArray(userProfile?.addresses) ? userProfile.addresses : [];

  const openAddModal = () => {
    setEditingIndex(null);
    setFormName(userProfile?.displayName || userProfile?.name || '');
    setFormPhone(userProfile?.phone || '');
    setFormStreet('');
    setFormProvinceName('');
    setFormProvinceCode(undefined);
    setFormWardName('');
    setFormWardCode(undefined);
    setFormIsDefault(addressList.length === 0);
    setModalVisible(true);
  };

  const openEditModal = (index: number) => {
    const item = addressList[index];
    if (!item) return;
    setEditingIndex(index);
    setFormName(item.fullName || '');
    setFormPhone(item.phone || '');
    setFormStreet(item.address || '');
    setFormProvinceName(item.provinceName || '');
    setFormProvinceCode(item.provinceCode);
    setFormWardName(item.wardName || '');
    setFormWardCode(item.wardCode);
    setFormIsDefault(Boolean(item.isDefault));
    setModalVisible(true);
  };

  const openAreaPicker = () => {
    // Trên iOS, không thể mở 2 Modal xếp chồng lên nhau. 
    // Chúng ta dismiss bàn phím, tạm ẩn modal form và mở AddressPicker.
    Keyboard.dismiss();
    setModalVisible(false);
    setTimeout(() => {
      setPickerVisible(true);
    }, 250);
  };

  const handleSelectArea = (prov: any, ward: any) => {
    Keyboard.dismiss();
    setFormProvinceName(prov?.name || '');
    setFormProvinceCode(prov?.province_code);
    setFormWardName(ward?.name || '');
    setFormWardCode(ward?.ward_code);
    setPickerVisible(false);
    setTimeout(() => {
      setModalVisible(true);
    }, 250);
  };

  const handleCloseAreaPicker = () => {
    Keyboard.dismiss();
    setPickerVisible(false);
    setTimeout(() => {
      setModalVisible(true);
    }, 250);
  };

  const handleSaveAddress = async () => {
    if (!formName.trim()) {
      dialog.alert(t('error') || 'Thiếu thông tin', t('errMissingName') || 'Vui lòng nhập họ và tên nhận hàng.');
      return;
    }
    const cleanPhone = formPhone.trim();
    if (!cleanPhone || cleanPhone.length < 9) {
      dialog.alert(t('error') || 'Thiếu thông tin', t('errInvalidPhone') || 'Số điện thoại không hợp lệ.');
      return;
    }
    if (!formProvinceName || !formWardName) {
      dialog.alert(t('error') || 'Thiếu thông tin', t('errMissingAddress') || 'Vui lòng chọn Tỉnh/Thành và Phường/Xã.');
      return;
    }
    if (!formStreet.trim()) {
      dialog.alert(t('error') || 'Thiếu thông tin', 'Vui lòng nhập số nhà, tên đường chi tiết.');
      return;
    }

    const formattedPhone = formatPhoneNumber(cleanPhone);
    const locationName = `${formWardName}, ${formProvinceName}`;

    const newAddressItem: UserAddress = {
      fullName: formName.trim(),
      phone: formattedPhone,
      address: formStreet.trim(),
      provinceName: formProvinceName,
      provinceCode: formProvinceCode || '',
      wardName: formWardName,
      wardCode: formWardCode || '',
      locationName,
      isDefault: formIsDefault,
    };

    setIsSubmitting(true);
    try {
      if (editingIndex !== null) {
        await updateAddress(editingIndex, newAddressItem);
      } else {
        await addAddress(newAddressItem);
      }
      setModalVisible(false);
      setTimeout(() => {
        dialog.alert(t('success') || 'Thành công', t('addressSavedSuccess') || 'Đã lưu địa chỉ thành công');
      }, 350);
    } catch (err: any) {
      setTimeout(() => {
        dialog.alert(t('error') || 'Lỗi', err.message || 'Không thể lưu địa chỉ.');
      }, 350);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (index: number) => {
    dialog.confirm(
      t('deleteAddressConfirmTitle') || 'Xóa địa chỉ',
      t('deleteAddressConfirmMsg') || 'Bạn có chắc chắn muốn xóa địa chỉ này khỏi sổ địa chỉ không?',
      async () => {
        try {
          await deleteAddress(index);
          setTimeout(() => {
            dialog.alert(t('success') || 'Thành công', t('addressDeletedSuccess') || 'Đã xóa địa chỉ');
          }, 300);
        } catch (err: any) {
          setTimeout(() => {
            dialog.alert(t('error') || 'Lỗi', err.message || 'Không thể xóa địa chỉ');
          }, 300);
        }
      }
    );
  };

  const handleSetDefault = async (index: number) => {
    try {
      await setDefaultAddress(index);
      dialog.alert(t('success') || 'Thành công', t('setDefaultAddressSuccess') || 'Đã đặt làm địa chỉ mặc định');
    } catch (err: any) {
      dialog.alert(t('error') || 'Lỗi', err.message || 'Không thể cập nhật địa chỉ');
    }
  };

  return (
    <View style={themeStyles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />
      <Header
        title={t('addressBookTitle') || 'Sổ Địa Chỉ'}
        showBack
        showCart={false}
        showSearch={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[themeStyles.scrollContent, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 90 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Banner giới thiệu */}
        <View style={themeStyles.headerBanner}>
          <View style={themeStyles.headerBannerIcon}>
            <Ionicons name="map-outline" size={24} color="#9C7156" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.headerBannerTitle}>{t('addressBookTitle') || 'Sổ Địa Chỉ'}</Text>
            <Text style={themeStyles.headerBannerDesc}>
              {t('addressBookDesc') || 'Quản lý địa chỉ giao hàng để đặt hàng nhanh chóng'}
            </Text>
          </View>
        </View>

        {/* Danh sách địa chỉ */}
        {addressList.length === 0 ? (
          <View style={themeStyles.emptyContainer}>
            <View style={themeStyles.emptyIconWrap}>
              <Ionicons name="location-outline" size={44} color="#9C7156" />
            </View>
            <Text style={themeStyles.emptyTitle}>{t('emptyAddressList') || 'Bạn chưa lưu địa chỉ nhận hàng nào'}</Text>
            <Text style={themeStyles.emptyDesc}>
              {t('emptyAddressListSub') || 'Thêm địa chỉ để đặt hàng nhanh chóng hơn ở các đơn tiếp theo'}
            </Text>
            <TouchableOpacity style={themeStyles.emptyBtn} onPress={openAddModal} activeOpacity={0.85}>
              <Ionicons name="add" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={themeStyles.emptyBtnText}>{t('addNewAddress') || 'Thêm địa chỉ mới'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={themeStyles.listWrap}>
            {addressList.map((item, idx) => {
              const fullArea = item.locationName || [item.wardName, item.provinceName].filter(Boolean).join(', ');
              return (
                <View key={item.id || `addr-${idx}`} style={themeStyles.addressCard}>
                  {/* Top card: Tên + SĐT + Badge mặc định */}
                  <View style={themeStyles.cardTopRow}>
                    <View style={themeStyles.userInfoWrap}>
                      <Text style={themeStyles.userName}>{item.fullName}</Text>
                      <View style={themeStyles.dividerDot} />
                      <Text style={themeStyles.userPhone}>{item.phone}</Text>
                    </View>
                    {item.isDefault && (
                      <View style={themeStyles.defaultBadge}>
                        <Ionicons name="checkmark-circle" size={13} color="#9C7156" style={{ marginRight: 3 }} />
                        <Text style={themeStyles.defaultBadgeText}>{t('defaultAddressBadge') || 'Mặc định'}</Text>
                      </View>
                    )}
                  </View>

                  {/* Địa chỉ chi tiết */}
                  <View style={themeStyles.addressDetailsWrap}>
                    <Ionicons name="location-sharp" size={16} color="#9C7156" style={{ marginTop: 2, marginRight: 6 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={themeStyles.streetText}>{item.address}</Text>
                      {!!fullArea && <Text style={themeStyles.areaText}>{fullArea}</Text>}
                    </View>
                  </View>

                  {/* Đường kẻ mỏng */}
                  <View style={themeStyles.cardDivider} />

                  {/* Bottom card: Nút hành động */}
                  <View style={themeStyles.cardActionsRow}>
                    {!item.isDefault ? (
                      <TouchableOpacity
                        style={themeStyles.actionTextBtn}
                        onPress={() => handleSetDefault(idx)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="radio-button-off" size={15} color="#6E665D" style={{ marginRight: 4 }} />
                        <Text style={themeStyles.actionSetDefaultText}>
                          {t('setDefaultAddressAction') || 'Đặt làm mặc định'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}

                    <View style={themeStyles.actionRightBtns}>
                      <TouchableOpacity
                        style={themeStyles.iconActionBtn}
                        onPress={() => openEditModal(idx)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create-outline" size={17} color="#2B2928" />
                        <Text style={themeStyles.iconActionText}>{t('edit') || 'Sửa'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[themeStyles.iconActionBtn, { marginLeft: 12 }]}
                        onPress={() => handleDelete(idx)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={17} color="#D32F2F" />
                        <Text style={[themeStyles.iconActionText, { color: '#D32F2F' }]}>{t('delete') || 'Xóa'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating Bottom Button: Thêm địa chỉ mới */}
      {addressList.length > 0 && (
        <View style={[themeStyles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <ScalePressable style={themeStyles.primaryCtaBtn} onPress={openAddModal}>
            <Ionicons name="add" size={22} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={themeStyles.primaryCtaText}>{t('addNewAddress') || 'Thêm địa chỉ mới'}</Text>
          </ScalePressable>
        </View>
      )}

      {/* Modal / BottomSheet: Thêm & Sửa Địa Chỉ */}
      <AnimatedBottomSheetModal
        visible={modalVisible}
        onClose={() => !isSubmitting && setModalVisible(false)}
        avoidKeyboard
      >
        <View style={themeStyles.modalHeader}>
          <Text style={themeStyles.modalTitle}>
            {editingIndex !== null ? (t('editAddress') || 'Chỉnh sửa địa chỉ') : (t('addNewAddress') || 'Thêm địa chỉ mới')}
          </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              disabled={isSubmitting}
              style={themeStyles.modalCloseBtn}
            >
              <Ionicons name="close" size={20} color="#2B2928" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            <View style={themeStyles.formContainer}>
              {/* Họ và tên */}
              <View style={themeStyles.formGroup}>
                <Text style={themeStyles.formLabel}>{t('fullNameReq') || 'Họ và tên *'}</Text>
                <TextInput
                  style={themeStyles.pillInput}
                  placeholder="Nguyễn Văn A"
                  placeholderTextColor="#9E968D"
                  value={formName}
                  onChangeText={setFormName}
                />
              </View>

              {/* Số điện thoại */}
              <View style={themeStyles.formGroup}>
                <Text style={themeStyles.formLabel}>{t('phoneReq') || 'Số điện thoại *'}</Text>
                <TextInput
                  style={themeStyles.pillInput}
                  placeholder="0901234567"
                  placeholderTextColor="#9E968D"
                  value={formPhone}
                  onChangeText={setFormPhone}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Tỉnh/Thành, Phường/Xã (Selector) */}
              <View style={themeStyles.formGroup}>
                <Text style={themeStyles.formLabel}>{t('provinceWardReq') || 'Khu vực nhận hàng (Tỉnh/Thành, Phường/Xã) *'}</Text>
                <TouchableOpacity
                  style={themeStyles.pillSelector}
                  onPress={openAreaPicker}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      themeStyles.selectorText,
                      !(formProvinceName && formWardName) && themeStyles.selectorPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {formProvinceName && formWardName
                      ? `${formWardName}, ${formProvinceName}`
                      : (t('selectDeliveryArea') || 'Chọn Tỉnh/Thành, Phường/Xã')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#9E968D" />
                </TouchableOpacity>
              </View>

              {/* Số nhà, Tên đường */}
              <View style={themeStyles.formGroup}>
                <Text style={themeStyles.formLabel}>{t('streetNameReq') || 'Địa chỉ chi tiết (Số nhà, tên đường) *'}</Text>
                <TextInput
                  style={[themeStyles.pillInput, themeStyles.textAreaInput]}
                  placeholder={t('streetNamePlaceholder') || 'Ví dụ: 123 Đường Nguyễn Huệ'}
                  placeholderTextColor="#9E968D"
                  value={formStreet}
                  onChangeText={setFormStreet}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Switch: Đặt làm mặc định */}
              <View style={themeStyles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={themeStyles.switchTitle}>{t('setAsDefaultLabel') || 'Đặt làm địa chỉ mặc định'}</Text>
                  <Text style={themeStyles.switchDesc}>Tự động chọn địa chỉ này khi bạn đặt hàng</Text>
                </View>
                <Switch
                  value={formIsDefault}
                  onValueChange={setFormIsDefault}
                  trackColor={{ false: '#E8E1D8', true: '#9C7156' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </ScrollView>

          {/* Nút lưu */}
          <View style={themeStyles.modalFooter}>
            <ScalePressable
              style={[themeStyles.primaryCtaBtn, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSaveAddress}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={themeStyles.primaryCtaText}>{t('saveAddressAction') || 'Lưu địa chỉ'}</Text>
              )}
            </ScalePressable>
          </View>
      </AnimatedBottomSheetModal>

      {/* AddressPicker Modal */}
      <AddressPicker
        visible={pickerVisible}
        onClose={handleCloseAreaPicker}
        onSelect={handleSelectArea}
        initialProvinceCode={formProvinceCode}
        initialWardCode={formWardCode}
      />
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
    },
    headerBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      padding: 16,
      marginBottom: 16,
      shadowOpacity: isDark ? 0 : 0.04,
      elevation: isDark ? 0 : 2,
    },
    headerBannerIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    headerBannerTitle: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 16,
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    headerBannerDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9E968D' : '#6E665D',
      lineHeight: 18,
    },
    listWrap: {
      gap: 14,
    },
    addressCard: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      padding: 16,
      shadowOpacity: isDark ? 0 : 0.04,
      elevation: isDark ? 0 : 2,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    userInfoWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    userName: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 15,
      color: Colors.textPrimary,
    },
    dividerDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? '#666666' : '#9E968D',
      marginHorizontal: 8,
    },
    userPhone: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '500',
      fontSize: 14,
      color: isDark ? '#9E968D' : '#6E665D',
    },
    defaultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      borderWidth: 1,
      borderColor: isDark ? '#9C7156' : '#E8CCB2',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    defaultBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 11,
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    addressDetailsWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 2,
      marginBottom: 12,
    },
    streetText: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 14,
      color: Colors.textPrimary,
      lineHeight: 20,
    },
    areaText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9E968D' : '#6E665D',
      marginTop: 2,
      lineHeight: 18,
    },
    cardDivider: {
      height: 1,
      backgroundColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
      marginBottom: 10,
    },
    cardActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionTextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    actionSetDefaultText: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '500',
      fontSize: 13,
      color: isDark ? '#9E968D' : '#6E665D',
    },
    actionRightBtns: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    iconActionText: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '500',
      fontSize: 13,
      color: Colors.textPrimary,
      marginLeft: 4,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      padding: 32,
      marginTop: 20,
      shadowOpacity: isDark ? 0 : 0.04,
      elevation: isDark ? 0 : 2,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 16,
      color: Colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9E968D' : '#6E665D',
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 20,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      paddingHorizontal: 24,
      borderRadius: 24,
      backgroundColor: '#9C7156',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.15,
      shadowRadius: 6,
      elevation: isDark ? 0 : 3,
    },
    emptyBtnText: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 14,
      color: '#FFFFFF',
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: Colors.background,
      borderTopWidth: 1,
      borderTopColor: isDark ? (Colors.divider || '#2A2A2A') : '#E8E1D8',
    },
    primaryCtaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryCtaText: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 15,
      color: '#FFFFFF',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
    },
    modalTitle: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 17,
      color: Colors.textPrimary,
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    formContainer: {
      paddingTop: 16,
    },
    formGroup: {
      marginBottom: 14,
    },
    formLabel: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '500',
      fontSize: 13,
      color: Colors.textPrimary,
      marginBottom: 6,
    },
    pillInput: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      paddingHorizontal: 18,
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textPrimary,
    },
    textAreaInput: {
      minHeight: 84,
      height: 'auto',
      borderRadius: 20,
      paddingTop: 14,
      paddingBottom: 14,
      textAlignVertical: 'top',
    },
    pillSelector: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectorText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textPrimary,
      flex: 1,
      marginRight: 8,
    },
    selectorPlaceholder: {
      color: isDark ? '#777777' : '#9E968D',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      borderRadius: 20,
      padding: 14,
      marginTop: 4,
      marginBottom: 10,
    },
    switchTitle: {
      fontFamily: 'ElleGaborStd',
      fontWeight: '700',
      fontSize: 14,
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    switchDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#9E968D' : '#6E665D',
    },
    modalFooter: {
      paddingTop: 16,
    },
  });
