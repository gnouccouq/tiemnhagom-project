// src/components/PaymentMethodModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedBottomSheetModal } from './AnimatedBottomSheetModal';
import { useThemeColor } from '../constants/theme';
import { useSettings } from '../context/SettingsContext';
import { PaymentMethodType } from '../context/CartContext';

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

interface PaymentMethodModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMethod: PaymentMethodType;
  onSelectMethod: (method: PaymentMethodType) => void;
}

export const PaymentMethodModal: React.FC<PaymentMethodModalProps> = ({
  visible,
  onClose,
  selectedMethod,
  onSelectMethod,
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();

  const [tempSelected, setTempSelected] = useState<PaymentMethodType>(selectedMethod);

  useEffect(() => {
    if (visible) {
      setTempSelected(selectedMethod);
    }
  }, [visible, selectedMethod]);

  const handleConfirm = () => {
    onSelectMethod(tempSelected);
    onClose();
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

        <Text style={styles.modalTitle}>{t('paymentMethodSection') || 'Phương thức thanh toán'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Danh sách phương thức */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={styles.scrollView}
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
              {/* Icon */}
              <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                <Ionicons
                  name={opt.icon}
                  size={22}
                  color={isSelected ? '#9C7156' : Colors.textPrimary}
                />
              </View>

              {/* Title & Description */}
              <View style={styles.textBox}>
                <Text style={styles.optionTitle}>{t(opt.titleKey) || opt.defaultTitle}</Text>
                {opt.defaultDesc ? (
                  <Text style={styles.optionDesc}>{t(opt.descKey) || opt.defaultDesc}</Text>
                ) : null}
              </View>

              {/* Radio button */}
              <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Nút xác nhận */}
      <View style={styles.modalBottomBar}>
        <TouchableOpacity
          style={styles.confirmPillBtn}
          onPress={handleConfirm}
          activeOpacity={0.88}
        >
          <Text style={styles.confirmBtnText}>{t('confirmBtn') || 'Xác nhận'}</Text>
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
    paymentCard: {
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
    modalBottomBar: {
      paddingTop: 12,
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
