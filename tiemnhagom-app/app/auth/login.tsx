// app/auth/login.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import Animated, { FadeInUp, FadeInDown, FadeIn } from 'react-native-reanimated';
import { useAuth } from '../../src/context/AuthContext';

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
  } = useAuth();

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

  // Google OAuth Hook
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_ID,
    androidClientId: GOOGLE_CLIENT_ID,
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
            Alert.alert('Thành công', 'Đăng nhập Google thành công!');
            router.back();
          })
          .catch((err: any) => {
            Alert.alert('Lỗi đăng nhập', err.message || 'Không thể xác thực tài khoản Google.');
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
      Alert.alert('Thông báo', 'Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUpMode) {
        if (password.length < 6) {
          Alert.alert('Thông báo', 'Mật khẩu phải có tối thiểu 6 ký tự.');
          setLoading(false);
          return;
        }
        const name = fullName.trim() || email.split('@')[0];
        await signUp(email.trim(), password, name, phone.trim());
        Alert.alert('Thành công', 'Tạo tài khoản thành công! Tặng ngay 50 điểm chào mừng.', [
          { text: 'Bắt đầu', onPress: () => router.back() },
        ]);
      } else {
        await signIn(email.trim(), password);
        router.back();
      }
    } catch (err: any) {
      let message = 'Đã xảy ra lỗi. Vui lòng thử lại.';
      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found'
      ) {
        message = 'Sai email hoặc mật khẩu';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'Email này đã được sử dụng. Vui lòng bấm đăng nhập.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Định dạng email không hợp lệ.';
      }
      Alert.alert('Lỗi', message);
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
      Alert.alert('Thông báo', 'Vui lòng kiểm tra kết nối Google hoặc đăng nhập bằng Email.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* FULLSCREEN BACKGROUND IMAGE */}
      <Image
        source={require('../../assets/images/hero-bg.webp')}
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
                    <Text style={styles.mainTitleText}>welcome back,</Text>
                    <Text style={styles.subTitleText}>we've missed you!</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.mainTitleText}>create account,</Text>
                    <Text style={styles.subTitleText}>join our pottery family!</Text>
                  </>
                )}
              </View>

              <View style={styles.authHeaderRight}>
                <TouchableOpacity
                  onPress={() => setIsSignUpMode(!isSignUpMode)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.authToggleLink}>
                    {isSignUpMode ? 'sign in' : 'sign up'}
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
                    placeholder="full name"
                    placeholderTextColor="#A0A0A0"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.authInputGroup}>
                  <TextInput
                    style={styles.authInput}
                    placeholder="phone number"
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
                placeholder="email"
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
                placeholder="password"
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
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#111" size="small" />
              ) : (
                <Text style={styles.btnAuthSubmitText}>
                  {isSignUpMode ? 'create account' : 'sign in'}
                </Text>
              )}
            </TouchableOpacity>

            {/* GOOGLE LOGIN BUTTON (.btn-google-auth) */}
            <TouchableOpacity
              style={styles.btnGoogleAuth}
              onPress={handleGoogleLogin}
              disabled={googleLoading}
              activeOpacity={0.88}
            >
              {googleLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Image
                    source={require('../../assets/images/logo-google.png')}
                    style={styles.googleIcon}
                    contentFit="contain"
                  />
                  <Text style={styles.btnGoogleAuthText}>continue with google</Text>
                </>
              )}
            </TouchableOpacity>

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
                  <Text style={styles.btnForgotPassword}>forgot password?</Text>
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
            <Text style={styles.modalTitle}>forgot password?</Text>
            <Text style={styles.modalSubtitle}>
              enter your email to receive a password reset link from Tiệm Nhà Gốm.
            </Text>

            <View style={[styles.authInputGroup, { marginBottom: 18 }]}>
              <TextInput
                style={styles.authInput}
                placeholder="email"
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
              >
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnAuthSubmit, { flex: 1, marginTop: 0 }]}
                onPress={handleSendResetPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.btnAuthSubmitText}>send link</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
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
    paddingTop: 8,
  },
  authToggleLink: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  btnAuthSubmitText: {
    fontFamily: 'ElleGaborStd',
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  // .btn-google-auth in app/app.css
  btnGoogleAuth: {
    width: '100%',
    height: 48,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dce4da',
    borderRadius: 24,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleIcon: {
    width: 18,
    height: 18,
  },
  btnGoogleAuthText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#3b4d45',
    fontWeight: '600',
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
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#687971',
    fontWeight: '600',
  },
});
