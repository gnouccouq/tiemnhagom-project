// app/auth/login.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Animated, { FadeInUp, FadeInDown, FadeIn } from 'react-native-reanimated';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { ScalePressable } from '../../src/components/ScalePressable';

WebBrowser.maybeCompleteAuthSession();

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const GOOGLE_CLIENT_ID = '571834989973-nd7opseai7t3etcfnrpvth24pm9f9msb.apps.googleusercontent.com';

export default function LoginScreen() {
  const router = useRouter();
  const {
    signIn,
    signUp,
    resetPassword,
    signInWithGoogleCredential,
    signInWithAppleCredential,
  } = useAuth();
  
  const { t } = useSettings();

  // Chế độ: false = Đăng nhập (Sign In), true = Đăng ký (Sign Up)
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Modal Quên mật khẩu
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Google OAuth Hook
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: '571834989973-nd7opseai7t3etcfnrpvth24pm9f9msb.apps.googleusercontent.com',
    iosClientId: '571834989973-vvcjphjo86n4uudkd5mcqpelrp67d7kj.apps.googleusercontent.com',
    androidClientId: '571834989973-2hceq95tg0suavnlkit7fhs2ce6iaaua.apps.googleusercontent.com',
    selectAccount: true,
  });

  // Lắng nghe kết quả xác thực từ Google
  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        setGoogleLoading(true);
        signInWithGoogleCredential(idToken)
          .then(() => {
            Alert.alert(t('success'), 'Đăng nhập Google thành công!');
            router.back();
          })
          .catch((err: any) => {
            Alert.alert(t('error'), err.message || 'Không thể xác thực tài khoản Google.');
          })
          .finally(() => {
            setGoogleLoading(false);
          });
      }
    }
  }, [response]);

  // Submit form (Sign in / Sign up)
  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('notification'), t('emailPasswordRequired'));
      return;
    }

    setLoading(true);
    try {
      if (isSignUpMode) {
        if (password.length < 6) {
          Alert.alert(t('notification'), t('passwordLengthError'));
          setLoading(false);
          return;
        }
        const name = fullName.trim() || email.split('@')[0];
        await signUp(email.trim(), password, name, phone.trim());
        Alert.alert(t('success'), t('registerSuccess'), [
          { text: t('start'), onPress: () => router.back() },
        ]);
      } else {
        await signIn(email.trim(), password);
        router.back();
      }
    } catch (err: any) {
      let message = t('genericError');
      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found'
      ) {
        message = t('wrongPassword');
      } else if (err.code === 'auth/email-already-in-use') {
        message = t('emailAlreadyInUse');
      } else if (err.code === 'auth/invalid-email') {
        message = t('invalidEmail');
      }
      Alert.alert(t('error'), message);
    } finally {
      setLoading(false);
    }
  };

  // Quên mật khẩu
  const handleSendResetPassword = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập email để nhận liên kết');
      return;
    }

    setForgotLoading(true);
    try {
      await resetPassword(forgotEmail.trim());
      setForgotModalVisible(false);
      Alert.alert(
        'Đã gửi liên kết',
        'Link đặt lại mật khẩu đã được gửi vào Email của bạn. Vui lòng kiểm tra hộp thư đến (và mục Spam).'
      );
    } catch (e: any) {
      Alert.alert('Lỗi', e.message || 'Không tìm thấy tài khoản');
    } finally {
      setForgotLoading(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      if (request) {
        await promptAsync();
      } else {
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=id_token&scope=openid%20profile%20email&redirect_uri=${encodeURIComponent('https://auth.expo.io/@gnouccouq/tiemnhagom')}&nonce=${Math.random().toString(36).substring(7)}`;
        await WebBrowser.openAuthSessionAsync(authUrl);
      }
    } catch (e: any) {
      console.log('Google login error:', e);
      Alert.alert('Thông báo', 'Vui lòng kiểm tra kết nối Google hoặc đăng nhập bằng Email.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Facebook Login
  const handleFacebookLogin = async () => {
    Alert.alert(
      t('notification') || 'Thông báo',
      t('facebookComingSoon') || 'Tính năng đăng nhập bằng Facebook đang được hoàn thiện. Vui lòng sử dụng Google hoặc Apple để đăng nhập.'
    );
  };

  // Apple Login
  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        t('notification') || 'Thông báo',
        t('appleIosOnly') || 'Đăng nhập bằng Apple chỉ hỗ trợ trên thiết bị iOS.'
      );
      return;
    }
    setAppleLoading(true);
    try {
      const csrf = Math.random().toString(36).substring(2, 15);
      const nonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        state: csrf,
        nonce: hashedNonce,
      });

      const { identityToken } = credential;
      if (identityToken) {
        await signInWithAppleCredential(identityToken, nonce);
        Alert.alert(t('success') || 'Thành công', 'Đăng nhập Apple thành công!');
        router.back();
      } else {
        throw new Error('Không nhận được identityToken từ Apple.');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.log('Apple login error:', e);
        Alert.alert(t('error') || 'Lỗi', 'Không thể đăng nhập bằng Apple.');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* FULLSCREEN BACKGROUND IMAGE */}
      <Image
        source={require('../../assets/images/tiemnhagom.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        priority="high"
      />

      {/* GRADIENT OVERLAY */}
      <View style={styles.bgOverlay} />
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 1)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* AUTH CARD (BOTTOM SHEET .auth-sheet-standalone & .auth-modal-card) */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetContainer}
      >
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetScroll}
        >
          <View style={styles.authModalCard}>
            {/* AUTH MODAL HEADER */}
            <Animated.View entering={FadeInUp.duration(600).delay(100)} style={styles.authModalHeader}>
              <View style={styles.authModalTitle}>
                {!isSignUpMode ? (
                  <>
                    <Text style={styles.mainTitleText}>{t('welcomeBack')}</Text>
                    <Text style={styles.subTitleText}>{t('gladToSeeYou')}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.mainTitleText}>{t('createNewAccount')}</Text>
                    <Text style={styles.subTitleText}>{t('joinPotteryStudio')}</Text>
                  </>
                )}
              </View>

              <View style={styles.authHeaderRight}>
                <TouchableOpacity
                  style={styles.authToggleBadge}
                  onPress={() => setIsSignUpMode(!isSignUpMode)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.authToggleLink}>
                    {isSignUpMode ? t('login') : t('register')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            {/* FORM INPUTS (.auth-input-group & .auth-input) */}
            {isSignUpMode && (
              <>
                <View style={styles.authInputGroup}>
                  <TextInput
                    style={styles.authInput}
                    placeholder={t('fullName')}
                    placeholderTextColor="#A0A0A0"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.authInputGroup}>
                  <TextInput
                    style={styles.authInput}
                    placeholder={t('phonePlaceholder')}
                    placeholderTextColor="#A0A0A0"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            )}

            <View style={styles.authInputGroup}>
              <TextInput
                style={styles.authInput}
                placeholder={t('emailPlaceholder')}
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.authInputGroup}>
              <TextInput
                style={[styles.authInput, { paddingRight: 48 }]}
                placeholder={t('passwordPlaceholder')}
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.authPasswordToggle}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#FFF"
                />
              </TouchableOpacity>
            </View>

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.btnAuthSubmit, loading && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#111" size="small" />
              ) : (
                <>
                  <Text style={styles.btnAuthSubmitText}>
                    {isSignUpMode ? t('createAccount') : t('login')}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#111" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>

            {/* SOCIAL LOGIN DIVIDER & BUTTONS */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('or') || 'Or'}</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtonsRow}>
              {/* FACEBOOK */}
              <ScalePressable
                style={styles.socialCircleBtn}
                onPress={handleFacebookLogin}
                accessibilityLabel="Login with Facebook"
              >
                <Image
                  source={require('../../assets/images/logo-facebook.png')}
                  style={styles.socialIconFb}
                  contentFit="contain"
                />
              </ScalePressable>

              {/* GOOGLE */}
              <ScalePressable
                style={styles.socialCircleBtn}
                onPress={handleGoogleLogin}
                disabled={googleLoading}
                accessibilityLabel="Login with Google"
              >
                {googleLoading ? (
                  <ActivityIndicator color="#4285F4" size="small" />
                ) : (
                  <Image
                    source={require('../../assets/images/logo-google.png')}
                    style={styles.socialIconGoogle}
                    contentFit="contain"
                  />
                )}
              </ScalePressable>

              {/* APPLE */}
              <ScalePressable
                style={styles.socialCircleBtn}
                onPress={handleAppleLogin}
                disabled={appleLoading}
                accessibilityLabel="Login with Apple"
              >
                {appleLoading ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Ionicons name="logo-apple" size={26} color="#000" style={styles.socialIconApple} />
                )}
              </ScalePressable>
            </View>

            {/* FORGOT PASSWORD LINK (.btn-forgot-password) */}
            {!isSignUpMode && (
              <View style={styles.authFooterLinks}>
                <TouchableOpacity
                  onPress={() => {
                    setForgotEmail(email.trim());
                    setForgotModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnForgotPassword}>{t('forgotPassword')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL QUÊN MẬT KHẨU */}
      <Modal
        visible={forgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('forgotPassword')}</Text>
            <Text style={styles.modalSubtitle}>
              {t('forgotPasswordDesc')}
            </Text>

            <View style={[styles.authInputGroup, { marginBottom: 18 }]}>
              <TextInput
                style={styles.authInput}
                placeholder={t('emailPlaceholder')}
                placeholderTextColor="#a8b8b0"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setForgotModalVisible(false)}
                disabled={forgotLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, forgotLoading && styles.btnDisabled]}
                onPress={handleSendResetPassword}
                disabled={forgotLoading}
                activeOpacity={0.85}
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.modalSubmitBtnText}>{t('sendLink')}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141413',
  },
  bgOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 12 : 24,
    left: 16,
    zIndex: 99,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScroll: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  authModalCard: {
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: Platform.OS === 'ios' ? 48 : 24,
  },
  authModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  authModalTitle: {
    flex: 1,
  },
  mainTitleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 40,
  },
  subTitleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    color: '#DDDDDD',
    marginTop: 6,
  },
  authHeaderRight: {
    alignItems: 'flex-end',
    paddingTop: 4,
  },
  authToggleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  authToggleLink: {
    fontSize: 13.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  authInputGroup: {
    marginBottom: 16,
    position: 'relative',
    justifyContent: 'center',
  },
  authInput: {
    fontFamily: 'ElleGaborStd',
    width: '100%',
    height: 52,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 26,
    paddingHorizontal: 20,
    fontSize: 15,
    color: '#FFFFFF',
  },
  authPasswordToggle: {
    position: 'absolute',
    right: 16,
    padding: 6,
  },
  // .btn-auth-submit in app/app.css
  btnAuthSubmit: {
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  btnAuthSubmitText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  dividerText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.65)',
    marginHorizontal: 16,
    fontWeight: '500',
  },
  socialButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginBottom: 10,
  },
  socialCircleBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  socialIconFb: {
    width: 32,
    height: 32,
  },
  socialIconGoogle: {
    width: 27,
    height: 27,
  },
  socialIconApple: {
    marginTop: -2,
  },
  authFooterLinks: {
    marginTop: 14,
    alignItems: 'center',
  },
  btnForgotPassword: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#888888',
    textDecorationLine: 'underline',
  },
  // Modal Quên mật khẩu
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#eef3eb',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#3b4d45',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#687971',
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  modalCancelBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#dce4da',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    color: '#687971',
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalSubmitBtnText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
