// src/components/AddressSelectorModal.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedBottomSheetModal } from './AnimatedBottomSheetModal';
import { useThemeColor } from '../constants/theme';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { UserAddress } from '../types';

interface AddressSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  selectedAddress: UserAddress | null;
  onSelectAddress: (addr: UserAddress) => void;
}

export const AddressSelectorModal: React.FC<AddressSelectorModalProps> = ({
  visible,
  onClose,
  selectedAddress,
  onSelectAddress,
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { userProfile } = useAuth();
  const router = useRouter();

  const savedAddresses: UserAddress[] = Array.isArray(userProfile?.addresses) && userProfile.addresses.length > 0
    ? userProfile.addresses
    : userProfile?.address || userProfile?.streetAddress
    ? [
        {
          fullName: userProfile.fullName || userProfile.displayName || '',
          phone: userProfile.phone || '',
          address: userProfile.address || userProfile.streetAddress || '',
          locationName: userProfile.locationName,
          provinceName: userProfile.locationName,
          isDefault: true,
        },
      ]
    : [];

  const handleSelect = (item: UserAddress) => {
    onSelectAddress(item);
    onClose();
  };

  const handleAddNew = () => {
    onClose();
    router.push('/address-book');
  };

  return (
    <AnimatedBottomSheetModal
      visible={visible}
      onClose={onClose}
      contentStyle={styles.sheetContent}
    >
      {/* Header */}
      <View style={styles.modalHeader}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.modalTitle}>{t('selectAddressModalTitle') || 'Sổ địa chỉ nhận hàng'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Danh sách địa chỉ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={styles.scrollView}
      >
        {savedAddresses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {t('noSavedAddressNotice') || 'Bạn chưa có địa chỉ nhận hàng nào. Vui lòng thêm địa chỉ.'}
            </Text>
          </View>
        ) : (
          savedAddresses.map((addr, index) => {
            const isSelected =
              selectedAddress?.id === addr.id ||
              (selectedAddress?.address === addr.address && selectedAddress?.phone === addr.phone);

            const displayFullLoc = addr.locationName ||
              (addr.wardName && addr.provinceName ? `${addr.wardName}, ${addr.provinceName}` : addr.provinceName || '');

            return (
              <TouchableOpacity
                key={addr.id || `addr_${index}`}
                style={[styles.addressCard, isSelected && styles.addressCardSelected]}
                onPress={() => handleSelect(addr)}
                activeOpacity={0.85}
              >
                <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                  <Ionicons
                    name="location-sharp"
                    size={22}
                    color={isSelected ? '#9C7156' : Colors.textMuted}
                  />
                </View>

                <View style={styles.textBox}>
                  <View style={styles.nameRow}>
                    <Text style={styles.recipientName}>{addr.fullName || 'Người nhận'}</Text>
                    {addr.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Mặc định</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.phoneText}>{addr.phone}</Text>
                  <Text style={styles.addressText} numberOfLines={2}>
                    {addr.address}{displayFullLoc ? `, ${displayFullLoc}` : ''}
                  </Text>
                </View>

                {/* Radio button */}
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Nút Thêm địa chỉ mới */}
      <View style={styles.modalBottomBar}>
        <TouchableOpacity
          style={styles.addNewPillBtn}
          onPress={handleAddNew}
          activeOpacity={0.88}
        >
          <Ionicons name="add" size={20} color="#9C7156" style={{ marginRight: 6 }} />
          <Text style={styles.addNewBtnText}>{t('addNewAddressBtn') || '+ Thêm địa chỉ mới'}</Text>
        </TouchableOpacity>
      </View>
    </AnimatedBottomSheetModal>
  );
};

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    sheetContent: {
      maxHeight: '80%',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Math.max(Platform.OS === 'ios' ? 24 : 16, 16),
      backgroundColor: isDark ? '#000000' : '#FAF8F5',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 16,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    modalTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    scrollView: {
      maxHeight: 380,
    },
    listContent: {
      paddingBottom: 16,
    },
    emptyContainer: {
      paddingVertical: 36,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    addressCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    addressCardSelected: {
      borderColor: '#9C7156',
      borderWidth: 1.5,
      backgroundColor: isDark ? '#1A1817' : '#FFFCFA',
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    iconBoxSelected: {
      backgroundColor: isDark ? '#2E2219' : '#F5EBE1',
    },
    textBox: {
      flex: 1,
      marginRight: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    recipientName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    defaultBadge: {
      backgroundColor: isDark ? '#2E2219' : '#F6F4EC',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E8CCB2',
    },
    defaultBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10,
      fontWeight: '700',
      color: '#9C7156',
    },
    phoneText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
      marginBottom: 4,
    },
    addressText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
      lineHeight: 18,
    },
    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.8,
      borderColor: isDark ? '#4A4A4A' : '#C7BFB5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterSelected: {
      borderColor: '#9C7156',
    },
    radioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#9C7156',
    },
    modalBottomBar: {
      paddingTop: 12,
    },
    addNewPillBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderWidth: 1.2,
      borderColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addNewBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#9C7156',
    },
  });
