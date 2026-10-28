// app/auth/login.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { auth } from '../../src/config/firebase';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { useAuth } from '../../src/context/AuthContext';
import { formatPhoneNumber } from '../../src/utils/format';
import { useSettings } from '../../src/context/SettingsContext';
import { useDialog } from '../../src/context/DialogContext';
import { ScalePressable } from '../../src/components/ScalePressable';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import {
  FirebasePhoneAuthWebView,
  FirebasePhoneAuthWebViewHandle,
} from '../../src/components/FirebasePhoneAuthWebView';

WebBrowser.maybeCompleteAuthSession();

// Tải an toàn Native GoogleSignin SDK (Tránh crash khi mở bằng Expo Go)
let NativeGoogleSignin: any = null;
let nativeStatusCodes: any = null;
try {
  const gSigninModule = require('@react-native-google-signin/google-signin');
  NativeGoogleSignin = gSigninModule.GoogleSignin;
  nativeStatusCodes = gSigninModule.statusCodes;
  if (NativeGoogleSignin?.configure) {
    NativeGoogleSignin.configure({
      webClientId: '571834989973-nd7opseai7t3etcfnrpvth24pm9f9msb.apps.googleusercontent.com',
      iosClientId: '571834989973-vvcjphjo86n4uudkd5mcqpelrp67d7kj.apps.googleusercontent.com',
      offlineAccess: false,
    });
  }
} catch (err) {
  // Đang chạy trên Expo Go (chưa có native binary RNGoogleSignin)
}

const GOOGLE_CLIENT_ID = '571834989973-nd7opseai7t3etcfnrpvth24pm9f9msb.apps.googleusercontent.com';

export default function LoginScreen() {
  const router = useRouter();
  const {
    signIn,
    signUp,
    resetPassword,
    signInWithGoogleCredential,
    signInWithAppleCredential,
    signInWithPhoneResult,
  } = useAuth();

  const { t } = useSettings();
  const dialog = useDialog();

  // Chế độ: false = Đăng nhập (Sign In), true = Đăng ký (Sign Up)
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');

  // Phone OTP ref & states
  const phoneAuthRef = useRef<FirebasePhoneAuthWebViewHandle>(null);
  const otpInputRef = useRef<TextInput>(null);
  const [phone, setPhone] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpFocused, setIsOtpFocused] = useState(false);
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Email form fields (Đăng ký chỉ cần email và mật khẩu giống web)
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

  // Countdown timer cho OTP
  useEffect(() => {
    let timer: any = null;
    if (otpCountdown > 0) {
      timer = setTimeout(() => {
        setOtpCountdown((c) => c - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [otpCountdown]);

  // Focus ô OTP ngay khi bật isOtpMode
  useEffect(() => {
    if (isOtpMode) {
      setOtp('');
      const tId = setTimeout(() => {
        otpInputRef.current?.focus();
      }, 250);
      return () => clearTimeout(tId);
    }
  }, [isOtpMode]);

  // Google OAuth Hook
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: '571834989973-vvcjphjo86n4uudkd5mcqpelrp67d7kj.apps.googleusercontent.com',
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
            dialog.alert(t('success') || 'Thành công', 'Đăng nhập Google thành công!');
            router.back();
          })
          .catch((err: any) => {
            dialog.alert(t('error') || 'Lỗi', err.message || 'Không thể xác thực tài khoản Google.');
          })
          .finally(() => {
            setGoogleLoading(false);
          });
      }
    }
  }, [response]);

  // Xử lý gửi mã xác thực OTP qua số điện thoại (giống bản web)
  const handleSendOtp = async () => {
    const rawPhone = phone.trim();
    if (!rawPhone) {
      dialog.alert(t('notification') || 'Thông báo', t('phoneRequiredError') || 'Vui lòng nhập số điện thoại');
      return;
    }

    if (otpCountdown > 0) {
      dialog.alert(
        t('notification') || 'Thông báo',
        (t('resendOtpIn') || 'Gửi lại sau {seconds}s').replace('{seconds}', String(otpCountdown))
      );
      return;
    }

    setLoading(true);
    try {
      const res = await phoneAuthRef.current?.sendOtp(rawPhone);
      if (res?.success) {
        if (res.verificationId) {
          setVerificationId(res.verificationId);
        }
        setIsOtpMode(true);
        setOtpCountdown(60);
        setOtp('');
        // Mở bàn phím ngay lập tức
        setTimeout(() => {
          otpInputRef.current?.focus();
        }, 250);
      } else {
        dialog.alert(
          t('error') || 'Lỗi',
          res?.error || t('genericError') || 'Không thể gửi mã xác thực. Vui lòng kiểm tra lại số điện thoại.'
        );
      }
    } catch (err: any) {
      dialog.alert(t('error') || 'Lỗi', err.message || t('genericError'));
    } finally {
      setLoading(false);
    }
  };

  // Xử lý xác thực OTP và đồng bộ ID User / tài khoản giống bản web
  const handleVerifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (cleanOtp.length < 6) {
      dialog.alert(t('notification') || 'Thông báo', t('invalidOtpError') || 'Vui lòng nhập đủ 6 chữ số OTP');
      return;
    }

    setLoading(true);
    try {
      let phoneUid = '';

      // 1. Xác thực native trực tiếp vào Firebase Auth qua PhoneAuthProvider credential
      if (verificationId) {
        try {
          const credential = PhoneAuthProvider.credential(verificationId, cleanOtp);
          const cred = await signInWithCredential(auth, credential);
          if (cred?.user?.uid) {
            phoneUid = cred.user.uid;
          }
        } catch (credErr: any) {
          console.warn('Native signInWithCredential attempt failed, trying WebView fallback:', credErr);
        }
      }

      // 2. Dự phòng bằng WebView xác thực nếu chưa lấy được phoneUid
      if (!phoneUid) {
        const res = await phoneAuthRef.current?.verifyOtp(cleanOtp);
        if (res?.success && res.uid) {
          phoneUid = res.uid;
        } else {
          throw new Error(res?.error || t('invalidOtpError') || 'Mã OTP không chính xác hoặc đã hết hạn.');
        }
      }

      // 3. Đồng bộ UserProfile & phân quyền
      await signInWithPhoneResult(phoneUid, phone.trim());
      dialog.showDialog({
        title: t('success') || 'Thành công',
        message: t('loginSuccess') || 'Đăng nhập thành công!',
        type: 'success',
        buttons: [
          {
            text: t('start') || 'Bắt đầu',
            style: 'primary',
            onPress: () => router.back(),
          },
        ],
      });
    } catch (err: any) {
      dialog.alert(
        t('error') || 'Lỗi',
        err.message || t('invalidOtpError') || 'Mã OTP không chính xác hoặc đã hết hạn.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Submit form (Đăng nhập Email hoặc Đăng ký tài khoản mới)
  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      dialog.alert(t('notification') || 'Thông báo', t('emailPasswordRequired'));
      return;
    }

    setLoading(true);
    try {
      if (isSignUpMode) {
        // Đăng ký giống bản web: chỉ cần email và mật khẩu, điều kiện mật khẩu tối thiểu 6 ký tự
        if (password.length < 6) {
          dialog.alert(t('notification') || 'Thông báo', t('passwordLengthError'));
          setLoading(false);
          return;
        }
        const name = email.split('@')[0];
        await signUp(email.trim(), password, name);
        dialog.showDialog({
          title: t('success') || 'Thành công',
          message: t('registerSuccess') || 'Đăng ký tài khoản thành công!',
          type: 'success',
          buttons: [
            { text: t('start') || 'Bắt đầu', style: 'primary', onPress: () => router.back() },
          ],
        });
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
      } else if (err.code === 'auth/weak-password') {
        message = t('passwordLengthError');
      }
      dialog.alert(t('error') || 'Lỗi', message);
    } finally {
      setLoading(false);
    }
  };

  // Quên mật khẩu
  const handleSendResetPassword = async () => {
    if (!forgotEmail.trim()) {
      dialog.alert(t('notification') || 'Thông báo', t('emailRequiredError') || 'Vui lòng nhập email');
      return;
    }

    setForgotLoading(true);
    try {
      await resetPassword(forgotEmail.trim());
      setForgotModalVisible(false);
      dialog.alert(
        t('success') || 'Thành công',
        t('resetPasswordSentNotice') || 'Link đặt lại mật khẩu đã được gửi vào Email của bạn. Vui lòng kiểm tra hộp thư đến (và mục Spam).'
      );
    } catch (e: any) {
      dialog.alert(t('error') || 'Lỗi', e.message || 'Không tìm thấy tài khoản');
    } finally {
      setForgotLoading(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      // 1. Thử đăng nhập bằng Native Google SDK (nếu chạy trên bản build .ipa/.apk có native binary)
      if (NativeGoogleSignin) {
        try {
          await NativeGoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          const gResponse = await NativeGoogleSignin.signIn();
          const idToken = gResponse?.data?.idToken || gResponse?.idToken;
          if (idToken) {
            await signInWithGoogleCredential(idToken);
            dialog.alert(t('success') || 'Thành công', 'Đăng nhập Google thành công!');
            router.back();
            return;
          }
        } catch (nativeErr: any) {
          if (nativeStatusCodes && nativeErr.code === nativeStatusCodes.SIGN_IN_CANCELLED) {
            return;
          }
          console.log('Native GoogleSignin attempt error, fallback to browser OAuth:', nativeErr);
        }
      }

      // 2. Dự phòng bằng Expo AuthSession (dành cho Expo Go)
      if (request) {
        await promptAsync();
      } else {
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=id_token&scope=openid%20profile%20email&redirect_uri=${encodeURIComponent('https://auth.expo.io/@gnouccouq/tiemnhagom')}&nonce=${Math.random().toString(36).substring(7)}`;
        await WebBrowser.openAuthSessionAsync(authUrl);
      }
    } catch (e: any) {
      console.log('Google login error:', e);
      dialog.alert(t('notification') || 'Thông báo', 'Vui lòng kiểm tra kết nối Google hoặc đăng nhập bằng Email.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Facebook Login
  const handleFacebookLogin = async () => {
    dialog.alert(
      t('notification') || 'Thông báo',
      t('facebookComingSoon') || 'Tính năng đăng nhập bằng Facebook đang được hoàn thiện. Vui lòng sử dụng Google hoặc Apple để đăng nhập.'
    );
  };

  // Apple Login
  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios') {
      dialog.alert(
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
        dialog.alert(t('success') || 'Thành công', 'Đăng nhập Apple thành công!');
        router.back();
      } else {
        throw new Error('Không nhận được identityToken từ Apple.');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.log('Apple login error:', e);
        dialog.alert(t('error') || 'Lỗi', 'Không thể đăng nhập bằng Apple.');
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
        source={require('../../assets/images/tiemnhagom.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        priority="high"
      />

      {/* GRADIENT OVERLAY */}
      <View style={styles.bgOverlay} />
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.72)', 'rgba(0, 0, 0, 1)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* AUTH CARD (BOTTOM SHEET) */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetContainer}
      >
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authModalCard}>
            {/* AUTH MODAL HEADER */}
            <Animated.View entering={FadeInUp.duration(500).delay(100)} style={styles.authModalHeader}>
              <View style={styles.authModalTitle}>
                {!isSignUpMode ? (
                  <>
                    <Text style={styles.mainTitleText}>{t('welcomeBack')}</Text>
                    <Text style={styles.subTitleText}>
                      {loginMethod === 'phone'
                        ? (t('phoneLoginDesc') || 'Đăng nhập bảo mật qua mã xác thực OTP')
                        : t('gladToSeeYou')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.mainTitleText}>{t('createNewAccount')}</Text>
                    <Text style={styles.subTitleText}>{t('joinPotteryStudio')}</Text>
                  </>
                )}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(500).delay(250)}>
              {/* CHẾ ĐỘ 1: ĐĂNG KÝ (GIỐNG BẢN WEB - CHỈ CẦN EMAIL VÀ MẬT KHẨU TỐI THIỂU 6 KÝ TỰ) */}
              {isSignUpMode ? (
                <>
                  <View style={styles.authInputGroup}>
                    <TextInput
                      style={styles.authInput}
                      placeholder={t('newEmailPlaceholder') || 'example@gmail.com'}
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
                      placeholder={t('passwordMinLengthNotice') || 'Tối thiểu 6 ký tự'}
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

                  {/* NÚT TẠO TÀI KHOẢN */}
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
                        <Text style={styles.btnAuthSubmitText}>{t('createAccount')}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#111" style={{ marginLeft: 6 }} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* CHUYỂN VỀ ĐĂNG NHẬP */}
                  <View style={styles.switchModeRow}>
                    <TouchableOpacity
                      onPress={() => setIsSignUpMode(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.switchModeText}>{t('alreadyHaveAccount')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : loginMethod === 'phone' ? (
                /* CHẾ ĐỘ 2: ĐĂNG NHẬP SỐ ĐIỆN THOẠI GỬI MÃ OTP (GIỐNG BẢN WEB) */
                <>
                  {!isOtpMode ? (
                    <>
                      <View style={styles.authInputGroup}>
                        <TextInput
                          style={styles.authInput}
                          placeholder={t('phonePlaceholder') || '+84 123 456 789'}
                          placeholderTextColor="#A0A0A0"
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                        />
                      </View>

                      {/* NÚT GỬI MÃ XÁC THỰC */}
                      <TouchableOpacity
                        style={[styles.btnAuthSubmit, loading && styles.btnDisabled]}
                        onPress={handleSendOtp}
                        disabled={loading}
                        activeOpacity={0.85}
                      >
                        {loading ? (
                          <ActivityIndicator color="#111" size="small" />
                        ) : (
                          <>
                            <Text style={styles.btnAuthSubmitText}>{t('sendOtp')}</Text>
                            <Ionicons name="arrow-forward" size={18} color="#111" style={{ marginLeft: 6 }} />
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      {/* THÔNG BÁO ĐÃ GỬI OTP */}
                      <View style={styles.otpInfoBox}>
                        <Text style={styles.otpInfoText}>
                          {t('otpSentNotice')} ({formatPhoneNumber(phone)})
                        </Text>
                      </View>

                      {/* 6 Ô NHẬP MÃ OTP CHUẨN NATIVE VỚI BÀN PHÍM TỰ ĐỘNG BẬT */}
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => otpInputRef.current?.focus()}
                        style={styles.otpRowContainer}
                      >
                        {[0, 1, 2, 3, 4, 5].map((index) => {
                          const digit = otp[index] || '';
                          const isCurrent = isOtpFocused && (index === otp.length || (index === 5 && otp.length === 6));
                          const isFilled = !!digit;
                          return (
                            <View
                              key={index}
                              pointerEvents="none"
                              style={[
                                styles.otpBox,
                                isCurrent && styles.otpBoxActive,
                                !isCurrent && isFilled && styles.otpBoxFilled,
                              ]}
                            >
                              <Text style={styles.otpDigitText}>{digit}</Text>
                              {isCurrent && !digit && <View style={styles.otpCaret} />}
                            </View>
                          );
                        })}

                        {/* INPUT NẰM PHỦ BÊN TRÊN ĐỂ BẮT MỌI CHẠM & TỰ ĐỘNG BẬT BÀN PHÍM */}
                        <TextInput
                          ref={otpInputRef}
                          style={styles.hiddenOtpInput}
                          value={otp}
                          onChangeText={(val) => {
                            const clean = val.replace(/\D/g, '').slice(0, 6);
                            setOtp(clean);
                          }}
                          keyboardType="number-pad"
                          maxLength={6}
                          textContentType="oneTimeCode"
                          autoComplete="sms-otp"
                          onFocus={() => setIsOtpFocused(true)}
                          onBlur={() => setIsOtpFocused(false)}
                          autoFocus={true}
                          caretHidden={true}
                        />
                      </TouchableOpacity>

                      {/* NÚT XÁC NHẬN ĐĂNG NHẬP */}
                      <TouchableOpacity
                        style={[styles.btnAuthSubmit, loading && styles.btnDisabled]}
                        onPress={handleVerifyOtp}
                        disabled={loading}
                        activeOpacity={0.85}
                      >
                        {loading ? (
                          <ActivityIndicator color="#111" size="small" />
                        ) : (
                          <>
                            <Text style={styles.btnAuthSubmitText}>{t('verifyOtp')}</Text>
                            <Ionicons name="checkmark-circle-outline" size={19} color="#111" style={{ marginLeft: 6 }} />
                          </>
                        )}
                      </TouchableOpacity>

                      {/* HÀNG HÀNH ĐỘNG OTP: GỬI LẠI MÃ & ĐỔI SỐ ĐIỆN THOẠI */}
                      <View style={styles.otpActionsRow}>
                        {otpCountdown > 0 ? (
                          <Text style={styles.otpCountdownText}>
                            {(t('resendOtpIn') || 'Gửi lại sau {seconds}s').replace('{seconds}', String(otpCountdown))}
                          </Text>
                        ) : (
                          <TouchableOpacity onPress={handleSendOtp} disabled={loading} activeOpacity={0.7}>
                            <Text style={styles.otpActionLink}>{t('resendOtp')}</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          onPress={() => {
                            setIsOtpMode(false);
                            setOtp('');
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.otpActionLink}>{t('changePhoneNumber')}</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {/* CHUYỂN SANG ĐĂNG KÝ */}
                  <View style={styles.switchModeRow}>
                    <TouchableOpacity
                      onPress={() => setIsSignUpMode(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.switchModeText}>{t('dontHaveAccount')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                /* CHẾ ĐỘ 3: ĐĂNG NHẬP EMAIL (GIỐNG BẢN WEB) */
                <>
                  <View style={styles.authInputGroup}>
                    <TextInput
                      style={styles.authInput}
                      placeholder={t('emailPlaceholder') || 'example@gmail.com'}
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
                      placeholder={t('passwordPlaceholder') || '******'}
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

                  {/* NÚT ĐĂNG NHẬP EMAIL */}
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
                        <Text style={styles.btnAuthSubmitText}>{t('login')}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#111" style={{ marginLeft: 6 }} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* QUÊN MẬT KHẨU & CHƯA CÓ TÀI KHOẢN */}
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

                  <View style={styles.switchModeRow}>
                    <TouchableOpacity
                      onPress={() => setIsSignUpMode(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.switchModeText}>{t('dontHaveAccount')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* SOCIAL LOGIN DIVIDER & BUTTONS */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('or') || 'HOẶC'}</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialButtonsRow}>
                {/* NÚT CHUYỂN ĐỔI EMAIL / SỐ ĐIỆN THOẠI NHƯ CŨ NGAY CẠNH FB, GOOGLE, APPLE */}
                {!isSignUpMode && (
                  <ScalePressable
                    style={styles.socialCircleBtn}
                    onPress={() => {
                      setLoginMethod(loginMethod === 'email' ? 'phone' : 'email');
                      setIsOtpMode(false);
                      setOtp('');
                    }}
                    accessibilityLabel="Toggle login method"
                  >
                    <Ionicons
                      name={loginMethod === 'email' ? 'call' : 'mail'}
                      size={24}
                      color="#000"
                    />
                  </ScalePressable>
                )}

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
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL QUÊN MẬT KHẨU */}
      <AnimatedCenterModal
        visible={forgotModalVisible}
        onClose={() => setForgotModalVisible(false)}
        contentStyle={styles.modalCard}
        avoidKeyboard
      >
        <Text style={styles.modalTitle}>{t('forgotPassword')}</Text>
        <Text style={styles.modalSubtitle}>{t('forgotPasswordDesc')}</Text>

        <View style={[styles.authInputGroup, { marginBottom: 18 }]}>
          <TextInput
            style={styles.modalInput}
            placeholder={t('emailPlaceholder') || 'example@gmail.com'}
            placeholderTextColor="#8C8278"
            value={forgotEmail}
            onChangeText={setForgotEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.modalActions}>
          <ScalePressable
            style={styles.modalCancelBtn}
            onPress={() => setForgotModalVisible(false)}
            disabled={forgotLoading}
            activeScale={0.96}
          >
            <Text style={styles.modalCancelText}>{t('cancel')}</Text>
          </ScalePressable>

          <ScalePressable
            style={[styles.modalSubmitBtn, forgotLoading && styles.btnDisabled]}
            onPress={handleSendResetPassword}
            disabled={forgotLoading}
            activeScale={0.96}
          >
            {forgotLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.modalSubmitBtnText}>{t('sendLink')}</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              </>
            )}
          </ScalePressable>
        </View>
      </AnimatedCenterModal>

      {/* FIREBASE PHONE AUTH WEBVIEW (DÙNG CHO RECAPTCHA & SIGNINWITHPHONENUMBER CHUẨN FIREBASE) */}
      <FirebasePhoneAuthWebView ref={phoneAuthRef} />
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
    top: Platform.OS === 'ios' ? 52 : 36,
    left: 18,
    zIndex: 99,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
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
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  authModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  authModalTitle: {
    flex: 1,
  },
  mainTitleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 38,
  },
  subTitleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
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
    marginBottom: 14,
    position: 'relative',
    justifyContent: 'center',
  },
  authInput: {
    fontFamily: 'ElleGaborStd',
    width: '100%',
    height: 52,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 26,
    paddingHorizontal: 20,
    fontSize: 15,
    color: '#FFFFFF',
  },
  // 6 ô nhập mã OTP chuẩn
  otpRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
    gap: 8,
    position: 'relative',
    height: 52,
    width: '100%',
  },
  otpBox: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: '#E8CCB2',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  otpBoxFilled: {
    borderColor: '#9C7156',
    backgroundColor: 'rgba(156, 113, 86, 0.22)',
  },
  otpDigitText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  otpCaret: {
    width: 2,
    height: 22,
    backgroundColor: '#E8CCB2',
    borderRadius: 1,
  },
  hiddenOtpInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    fontSize: 1,
    color: 'transparent',
  },
  authPasswordToggle: {
    position: 'absolute',
    right: 16,
    padding: 6,
  },
  btnAuthSubmit: {
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
  otpInfoBox: {
    backgroundColor: 'rgba(156, 113, 86, 0.25)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(156, 113, 86, 0.45)',
  },
  otpInfoText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: '#F6F4EC',
    textAlign: 'center',
    lineHeight: 18,
  },
  otpActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 6,
  },
  otpCountdownText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  otpActionLink: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: '#E8CCB2',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  switchModeRow: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchModeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: '#E8CCB2',
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  dividerText: {
    fontSize: 13.5,
    color: 'rgba(255, 255, 255, 0.65)',
    marginHorizontal: 16,
    fontWeight: '500',
  },
  socialButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
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
    marginTop: 12,
    alignItems: 'center',
  },
  btnForgotPassword: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#B0B0B0',
    textDecorationLine: 'underline',
  },
  // Modal Quên mật khẩu
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FAF8F5',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E8CCB2',
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
    color: '#2B2928',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#6E665D',
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalInput: {
    fontFamily: 'ElleGaborStd',
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    borderRadius: 26,
    paddingHorizontal: 20,
    fontSize: 15,
    color: '#2B2928',
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
    borderColor: '#E8E1D8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#6E665D',
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  modalSubmitBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
