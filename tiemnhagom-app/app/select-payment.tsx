// app/select-payment.tsx
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useCart, PaymentMethodType } from '../src/context/CartContext';

interface PaymentOptionItem {
  id: PaymentMethodType;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  defaultTitle: string;
  descKey: string;
  defaultDesc: string;
}

const PAYMENT_OPTIONS: PaymentOptionItem[] = [
  {
    id: 'banking',
    icon: 'qr-code-outline',
    titleKey: 'vietQR',
    defaultTitle: 'Chuyển khoản mã QR (VietQR)',
    descKey: 'vietQRDesc',
    defaultDesc: 'Quét mã QR qua app ngân hàng tiện lợi và bảo mật',
  },
  {
    id: 'cod',
    icon: 'cash-outline',
    titleKey: 'cod',
    defaultTitle: 'Tiền mặt khi nhận hàng (COD)',
    descKey: 'codDesc',
    defaultDesc: 'Nhận hàng, kiểm tra đồ gốm và thanh toán tiền mặt',
  },
];

export default function SelectPaymentScreen() {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useSettings();
  const { paymentMethod, setPaymentMethod } = useCart();

  const [tempSelected, setTempSelected] = useState<PaymentMethodType>(paymentMethod);

  const handleConfirm = () => {
    setPaymentMethod(tempSelected);
    router.back();
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header chuẩn Screenshot 3 */}
      <View style={[styles.customHeader, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{t('paymentMethodSection') || 'Phương thức thanh toán'}</Text>
        <View style={{ width: 40 }} />
      </View>

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
        {PAYMENT_OPTIONS.map((opt) => {
          const isSelected = tempSelected === opt.id;

          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.paymentCard, isSelected && styles.paymentCardSelected]}
              onPress={() => setTempSelected(opt.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                <Ionicons
                  name={opt.icon}
                  size={22}
                  color={isSelected ? '#9C7156' : Colors.textPrimary}
                />
              </View>

              <View style={styles.textBox}>
                <Text style={styles.optionTitle}>{t(opt.titleKey) || opt.defaultTitle}</Text>
                {opt.defaultDesc ? (
                  <Text style={styles.optionDesc}>{t(opt.descKey) || opt.defaultDesc}</Text>
                ) : null}
              </View>

              <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Nút xác nhận dính đáy */}
      <View style={[styles.bottomStickyBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TouchableOpacity
          style={styles.confirmPillBtn}
          onPress={handleConfirm}
          activeOpacity={0.88}
        >
          <Text style={styles.confirmBtnText}>{t('confirmBtn') || 'Xác nhận'}</Text>
        </TouchableOpacity>
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
      backgroundColor: Colors.background,
      borderBottomWidth: 0,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#121212' : Colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 4,
      elevation: isDark ? 0 : 2,
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
    paymentCard: {
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
    paymentCardSelected: {
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
    optionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 3,
    },
    optionDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
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
    bottomStickyBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.background,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 0,
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
