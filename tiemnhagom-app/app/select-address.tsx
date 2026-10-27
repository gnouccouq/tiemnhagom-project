// app/select-address.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurButton } from '../src/components/BlurButton';
import { LiquidGlass } from '../src/components/LiquidGlass';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { SymbolView } from 'expo-symbols';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';
import { useCart } from '../src/context/CartContext';
import { UserAddress } from '../src/types';

export default function SelectAddressScreen() {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useSettings();
  const { userProfile } = useAuth();
  const { selectedAddress, setSelectedAddress } = useCart();

  const savedAddresses: UserAddress[] =
    Array.isArray(userProfile?.addresses) && userProfile.addresses.length > 0
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

  const [tempSelected, setTempSelected] = useState<UserAddress | null>(selectedAddress);

  const handleSelectAddress = (addr: UserAddress) => {
    setTempSelected(addr);
  };

  const handleConfirm = () => {
    if (tempSelected) {
      setSelectedAddress(tempSelected);
    }
    router.back();
  };

  const handleAddNew = () => {
    router.push('/address-book');
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Thanh điều hướng gốc iOS UINavigationBar chuẩn Liquid Glass */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitle: () => (
            <Text style={styles.navHeaderTitle}>
              {t('selectAddressModalTitle') || 'Sổ địa chỉ nhận hàng'}
            </Text>
          ),
          headerTintColor: '#9C7156',
        }}
      />
      <FadingHeaderBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 54 + 10,
            paddingBottom: Math.max(insets.bottom, 16) + 100,
          },
        ]}
      >
        {savedAddresses.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {t('noSavedAddressNotice') || 'Bạn chưa có địa chỉ nhận hàng nào. Vui lòng thêm địa chỉ.'}
            </Text>
          </View>
        ) : (
          savedAddresses.map((addr, index) => {
            const isSelected =
              tempSelected?.id === addr.id ||
              (tempSelected?.address === addr.address && tempSelected?.phone === addr.phone);

            const displayFullLoc =
              addr.locationName ||
              (addr.wardName && addr.provinceName
                ? `${addr.wardName}, ${addr.provinceName}`
                : addr.provinceName || '');

            return (
              <TouchableOpacity
                key={addr.id || `addr_${index}`}
                style={[styles.addressCard, isSelected && styles.addressCardSelected]}
                onPress={() => handleSelectAddress(addr)}
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
                    {addr.address}
                    {displayFullLoc ? `, ${displayFullLoc}` : ''}
                  </Text>
                </View>

                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Nút thêm địa chỉ mới */}
        <TouchableOpacity
          style={styles.addNewPillBtn}
          onPress={handleAddNew}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#9C7156" style={{ marginRight: 6 }} />
          <Text style={styles.addNewBtnText}>{t('addNewAddressBtn') || '+ Thêm địa chỉ mới'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Nút xác nhận dính đáy màn hình bọc Liquid Glass chuẩn hệ thống iOS */}
      <View
        style={[styles.bottomStickyWrapper, { bottom: Math.max(insets.bottom, 14) }]}
        pointerEvents="box-none"
      >
        <LiquidGlass
          style={styles.bottomStickyBar}
          interactive={true}
          effect="regular"
          isDark={isDark}
        >
          <TouchableOpacity
            style={styles.confirmPillBtn}
            onPress={handleConfirm}
            activeOpacity={0.88}
          >
            <Text style={styles.confirmBtnText}>{t('confirmBtn') || 'Xác nhận'}</Text>
          </TouchableOpacity>
        </LiquidGlass>
      </View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    customHeader: {
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
      borderBottomWidth: 0,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
      letterSpacing: 0.3,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    scrollContent: {
      paddingHorizontal: 16,
      gap: 12,
    },
    emptyContainer: {
      paddingVertical: 50,
      alignItems: 'center',
      gap: 14,
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 30,
    },
    addressCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
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
    addNewPillBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderWidth: 1.2,
      borderColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    addNewBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#9C7156',
    },
    bottomStickyWrapper: {
      position: 'absolute',
      left: 14,
      right: 14,
      zIndex: 50,
    },
    bottomStickyBar: {
      borderRadius: 36,
      paddingHorizontal: 10,
      paddingVertical: 8,
      overflow: 'hidden',
    },
    confirmPillBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    confirmBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
