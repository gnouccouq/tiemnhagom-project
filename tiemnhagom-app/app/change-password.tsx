import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../src/config/firebase';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { useThemeColor } from '../src/constants/theme';
import { Header } from '../src/components/Header';

const getRules = (pw: string) => ({
  length: pw.length >= 6,
  upper: /[A-Z]/.test(pw),
  number: /[0-9]/.test(pw),
  special: /[^A-Za-z0-9\s]/.test(pw),
});

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors);
  const { user, userProfile, resetPassword } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const providers: string[] = (user?.providerData || []).map((p: any) => p?.providerId).filter(Boolean);
  
  // Xác định tài khoản có mật khẩu:
  // 1. Firebase Auth có provider 'password'
  // 2. Hoặc người dùng đăng nhập qua email (user?.email) mà không chỉ thuần Google
  const hasPasswordProvider = providers.includes('password');
  const isGoogleOnly = providers.length > 0 && providers.every((p) => p === 'google.com');
  const isAppleOnly = providers.length > 0 && providers.every((p) => p === 'apple.com');

  // Email hữu dụng để nhận link reset password hoặc re-authenticate
  const effectiveEmail = user?.email || userProfile?.email || auth.currentUser?.email || '';

  // Tài khoản có mật khẩu: nếu có provider password, hoặc người dùng có email và không phải chỉ thuần Google/Apple
  const hasPassword = hasPasswordProvider || (!isGoogleOnly && !isAppleOnly && Boolean(effectiveEmail));
  const requiresCurrentPassword = hasPasswordProvider;

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const rules = getRules(newPw);
  const rulesOk = rules.length && rules.upper && rules.number && rules.special;
  const matches = confirmPw.length > 0 && confirmPw === newPw;
  const hasCurrentIfRequired = !requiresCurrentPassword || Boolean(currentPw);
  const canSubmit = hasPassword && hasCurrentIfRequired && rulesOk && matches && !submitting;

  const mapError = (code?: string) => {
    switch (code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return t('pwdErrWrongCurrent');
      case 'auth/requires-recent-login':
        return t('pwdErrRecentLogin');
      case 'auth/weak-password':
        return t('pwdErrWeak');
      case 'auth/too-many-requests':
        return t('pwdErrTooMany');
      default:
        return t('pwdErrGeneric');
    }
  };

  const handleSendResetLink = async () => {
    if (!effectiveEmail) {
      dialog.alert(t('error'), t('pwdNoPasswordDesc'));
      return;
    }
    setSendingReset(true);
    try {
      await resetPassword(effectiveEmail);
      dialog.alert(t('success'), t('resetPasswordSentNotice', { email: effectiveEmail }));
    } catch (e: any) {
      dialog.alert(t('error'), e?.message || t('pwdErrGeneric'));
    } finally {
      setSendingReset(false);
    }
  };

  const handleSubmit = async () => {
    const current = auth.currentUser;
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      if (current && requiresCurrentPassword && current.email && currentPw) {
        const cred = EmailAuthProvider.credential(current.email, currentPw);
        await reauthenticateWithCredential(current, cred);
      }

      if (current) {
        await updatePassword(current, newPw);
      } else {
        throw new Error(t('pwdErrRecentLogin'));
      }

      setSubmitting(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      dialog.showDialog({
        title: t('success'),
        message: t('pwdSuccess'),
        type: 'success',
        buttons: [{ text: t('understoodBtn'), style: 'primary', onPress: () => router.back() }],
      });
    } catch (e: any) {
      setSubmitting(false);
      if (e?.code === 'auth/requires-recent-login') {
        dialog.showDialog({
          title: t('notification'),
          message: t('pwdErrRecentLogin'),
          type: 'confirm',
          buttons: [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('btnSendResetEmail'),
              style: 'primary',
              onPress: handleSendResetLink,
            },
          ],
        });
      } else {
        dialog.alert(t('error'), mapError(e?.code));
      }
    }
  };

  const renderInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    visible: boolean,
    toggle: () => void
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={label}
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity onPress={toggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header title={t('pwdChangeTitle')} showBack={true} showSearch={false} showCart={false} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingTop: insets.top + 54 + 10, paddingBottom: insets.bottom + 40 }}
        >
          {!hasPassword ? (
            <View style={styles.card}>
              <Ionicons name="information-circle-outline" size={28} color={Colors.primary} />
              <Text style={styles.infoTitle}>{t('pwdNoPasswordTitle')}</Text>
              <Text style={styles.infoText}>
                {isGoogleOnly ? t('pwdGoogleOnlyDesc') : t('pwdNoPasswordDesc')}
              </Text>
              {effectiveEmail ? (
                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: 16, alignSelf: 'stretch' }, sendingReset && { opacity: 0.7 }]}
                  activeOpacity={0.85}
                  disabled={sendingReset}
                  onPress={handleSendResetLink}
                >
                  {sendingReset ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitText}>{t('btnSendResetEmail')}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.infoText}>{t('pwdChangeDesc')}</Text>
              
              {requiresCurrentPassword &&
                renderInput(t('pwdCurrent'), currentPw, setCurrentPw, showCurrent, () => setShowCurrent(!showCurrent))}
              
              {renderInput(t('pwdNew'), newPw, setNewPw, showNew, () => setShowNew(!showNew))}

              <View style={styles.rulesBox}>
                {[
                  { key: 'length', valid: rules.length, label: t('authRuleLength') },
                  { key: 'upper', valid: rules.upper, label: t('authRuleUpper') },
                  { key: 'number', valid: rules.number, label: t('authRuleNumber') },
                  { key: 'special', valid: rules.special, label: t('authRuleSpecial') },
                ].map((r) => (
                  <View key={r.key} style={styles.ruleRow}>
                    <Ionicons
                      name={r.valid ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={r.valid ? Colors.primary : Colors.textMuted}
                    />
                    <Text style={[styles.ruleText, r.valid && { color: Colors.textPrimary }]}>{r.label}</Text>
                  </View>
                ))}
              </View>

              {renderInput(t('pwdConfirm'), confirmPw, setConfirmPw, showConfirm, () => setShowConfirm(!showConfirm))}
              {confirmPw.length > 0 && (
                <Text style={[styles.matchHint, { color: matches ? Colors.primary : '#B3261E' }]}>
                  {matches ? t('pwdMatch') : t('pwdNotMatch')}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, !canSubmit && { opacity: 0.45 }]}
                disabled={!canSubmit}
                activeOpacity={0.85}
                onPress={handleSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>{t('pwdSubmit')}</Text>
                )}
              </TouchableOpacity>

              {effectiveEmail ? (
                <TouchableOpacity
                  style={[styles.outlineBtn, { marginTop: 12 }]}
                  activeOpacity={0.85}
                  disabled={sendingReset}
                  onPress={handleSendResetLink}
                >
                  {sendingReset ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                  ) : (
                    <Text style={styles.outlineBtnText}>{t('btnSendResetEmail')}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (Colors: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.background },
    card: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: Colors.borderLight,
    },
    infoTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginTop: 8 },
    infoText: { fontSize: 14, color: Colors.textSecondary || Colors.textMuted, lineHeight: 20, marginTop: 6 },
    field: { marginTop: 16 },
    label: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.borderLight,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 48,
      backgroundColor: Colors.background,
    },
    input: { flex: 1, marginHorizontal: 8, fontSize: 15, color: Colors.textPrimary },
    rulesBox: { marginTop: 10, gap: 6 },
    ruleRow: { flexDirection: 'row', alignItems: 'center' },
    ruleText: { marginLeft: 6, fontSize: 13, color: Colors.textMuted },
    matchHint: { marginTop: 6, fontSize: 13 },
    submitBtn: {
      marginTop: 24,
      height: 50,
      borderRadius: 14,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    outlineBtn: {
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: Colors.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    outlineBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  });
