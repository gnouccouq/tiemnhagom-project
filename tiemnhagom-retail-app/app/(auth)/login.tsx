// app/(auth)/login.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';
import { ScalePressable } from '../../src/components/ScalePressable';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { signIn, isLoading } = useAuth();
  const { t } = useSettings();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ email và mật khẩu quản trị.');
      return;
    }
    setErrorMessage('');
    const res = await signIn(email, password);
    if (!res.success) {
      setErrorMessage(res.error || 'Đăng nhập không thành công.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: Colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 40,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <Image
            source={
              isDark
                ? require('../../assets/images/LOGO_WHITE.png')
                : require('../../assets/images/LOGO_2_PNG.png')
            }
            style={styles.logo}
            contentFit="contain"
          />
          <View style={styles.badgeRetail}>
            <Ionicons name="shield-checkmark" size={13} color="#9C7156" />
            <Text style={styles.badgeRetailText}>RETAIL & OPERATIONS</Text>
          </View>
          <Text style={[styles.title, { color: Colors.textPrimary }]}>{t('loginTitle')}</Text>
          <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>{t('loginDesc')}</Text>
        </View>

        {/* Card Form */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          {errorMessage ? (
            <View style={styles.errorAlert}>
              <Ionicons name="alert-circle" size={18} color="#D32F2F" />
              <Text style={styles.errorAlertText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Email Input (Pill shape 52px) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textPrimary }]}>{t('email')}</Text>
            <View style={[styles.inputPill, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
              <Ionicons name="mail-outline" size={19} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.inputText, { color: Colors.textPrimary }]}
                placeholder="admin@tiemnhagom.vn"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          {/* Password Input (Pill shape 52px) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textPrimary }]}>{t('password')}</Text>
            <View style={[styles.inputPill, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
              <Ionicons name="lock-closed-outline" size={19} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.inputText, { color: Colors.textPrimary }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Primary CTA (Pill 52px) */}
          <ScalePressable
            style={[styles.loginBtn, isLoading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.btnInner}>
                <Text style={styles.loginBtnText}>{t('btnLogin')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </View>
            )}
          </ScalePressable>
        </View>

        {/* Security Footer Notice */}
        <View style={styles.footerNotice}>
          <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
          <Text style={[styles.footerNoticeText, { color: Colors.textMuted }]}>
            Hệ thống quản lý nội bộ dành riêng cho nhân viên Tiệm Nhà Gốm
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 170,
    height: 70,
    marginBottom: 14,
  },
  badgeRetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  badgeRetailText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    gap: 8,
  },
  errorAlertText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputPill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    marginRight: 10,
  },
  inputText: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
  },
  loginBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
    paddingHorizontal: 16,
  },
  footerNoticeText: {
    fontSize: 12,
    textAlign: 'center',
    flexShrink: 1,
  },
});
