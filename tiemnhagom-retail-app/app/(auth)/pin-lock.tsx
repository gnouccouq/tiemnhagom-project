// app/(auth)/pin-lock.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';
import { LiquidGlass } from '../../src/components/LiquidGlass';
import { ScalePressable } from '../../src/components/ScalePressable';

export default function PinLockScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { adminProfile, hasPinConfigured, setupPin, unlockWithPin, unlockWithBiometrics, isBiometricAvailable, signOut } = useAuth();
  const { t } = useSettings();

  const [pin, setPin] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(!hasPinConfigured);
  const [firstPin, setFirstPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tự động gợi ý sinh trắc học Face ID khi vào màn hình nếu đã có PIN
  useEffect(() => {
    if (hasPinConfigured && isBiometricAvailable) {
      unlockWithBiometrics();
    }
  }, [hasPinConfigured, isBiometricAvailable]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setErrorMessage('');

      if (nextPin.length === 4) {
        handleCompletePin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage('');
    }
  };

  const handleCompletePin = async (inputPin: string) => {
    if (isSettingUp) {
      if (!firstPin) {
        setFirstPin(inputPin);
        setPin('');
      } else {
        if (firstPin === inputPin) {
          await setupPin(inputPin);
          setIsSettingUp(false);
          setPin('');
          Alert.alert('Thành công', 'Đã lưu mã PIN ca trực của bạn.');
        } else {
          setErrorMessage('Mã PIN xác nhận không trùng khớp.');
          setPin('');
          setFirstPin('');
        }
      }
    } else {
      const ok = await unlockWithPin(inputPin);
      if (!ok) {
        setErrorMessage(t('invalidPin'));
        setPin('');
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}>
      {/* Top Staff Info */}
      <View style={styles.topBar}>
        <View style={styles.staffBadge}>
          <Ionicons name="person-circle" size={24} color="#9C7156" style={{ flexShrink: 0 }} />
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.staffName, { color: Colors.textPrimary }]} numberOfLines={1}>{adminProfile?.displayName || 'Thu ngân'}</Text>
            <Text style={[styles.staffRole, { color: Colors.textSecondary }]} numberOfLines={1}>Ca trực Tiệm Nhà Gốm</Text>
          </View>
        </View>

        <TouchableOpacity onPress={signOut} style={styles.btnSwitchCashier}>
          <Ionicons name="log-out-outline" size={18} color={Colors.textSecondary} />
          <Text style={[styles.switchText, { color: Colors.textSecondary }]} numberOfLines={1}>{t('switchCashier')}</Text>
        </TouchableOpacity>
      </View>

      {/* Middle: Title & Dots */}
      <View style={styles.centerSection}>
        <Image
          source={
            isDark
              ? require('../../assets/images/LOGO_WHITE.png')
              : require('../../assets/images/LOGO_2_PNG.png')
          }
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.pinTitle, { color: Colors.textPrimary }]}>
          {isSettingUp
            ? firstPin
              ? 'Xác nhận lại mã PIN 4 số'
              : t('pinSetupTitle')
            : t('pinUnlockTitle')}
        </Text>
        <Text style={[styles.pinSubtitle, { color: Colors.textSecondary }]}>
          {isSettingUp ? t('pinSetupDesc') : t('pinUnlockDesc')}
        </Text>

        {/* 4 PIN Dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((idx) => {
            const filled = pin.length > idx;
            return (
              <View
                key={idx}
                style={[
                  styles.dot,
                  {
                    borderColor: filled ? '#9C7156' : Colors.border,
                    backgroundColor: filled ? '#9C7156' : 'transparent',
                  },
                ]}
              />
            );
          })}
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      {/* Numeric Keypad (Liquid Glass circle buttons) */}
      <View style={styles.keypad}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ].map((row, rIdx) => (
          <View key={rIdx} style={styles.keyRow}>
            {row.map((num) => (
              <ScalePressable
                key={num}
                style={[styles.keyBtn, { backgroundColor: isDark ? Colors.surface : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
                onPress={() => handleKeyPress(num)}
              >
                <Text style={[styles.keyNumber, { color: Colors.textPrimary }]}>{num}</Text>
              </ScalePressable>
            ))}
          </View>
        ))}

        <View style={styles.keyRow}>
          {/* Biometrics button */}
          {isBiometricAvailable ? (
            <ScalePressable style={styles.keySpecialBtn} onPress={unlockWithBiometrics}>
              <Ionicons name="scan-outline" size={26} color="#9C7156" />
            </ScalePressable>
          ) : (
            <View style={styles.keyEmpty} />
          )}

          {/* Key 0 */}
          <ScalePressable
            style={[styles.keyBtn, { backgroundColor: isDark ? Colors.surface : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => handleKeyPress('0')}
          >
            <Text style={[styles.keyNumber, { color: Colors.textPrimary }]}>0</Text>
          </ScalePressable>

          {/* Delete button */}
          <ScalePressable style={styles.keySpecialBtn} onPress={handleDelete}>
            <Ionicons name="backspace-outline" size={24} color={Colors.textPrimary} />
          </ScalePressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  staffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  staffName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
  },
  staffRole: {
    fontSize: 11.5,
  },
  btnSwitchCashier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  switchText: {
    fontSize: 12,
    fontWeight: '500',
  },
  centerSection: {
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 50,
    marginBottom: 16,
  },
  pinTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
  },
  pinSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
    marginTop: 12,
    fontWeight: '500',
  },
  keypad: {
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 24,
  },
  keyBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  keyNumber: {
    fontSize: 26,
    fontWeight: '500',
  },
  keySpecialBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyEmpty: {
    width: 72,
    height: 72,
  },
});
