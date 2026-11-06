// app/_layout.tsx
import '../src/utils/textScaler';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, AppState, Text, TouchableOpacity, Image, LogBox, Platform } from 'react-native';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  '[expo-notifications]: `shouldShowAlert` is deprecated',
  'setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture',
  'setLayoutAnimationEnabledExperimental',
  'Cannot record touch move without a touch start',
  '@firebase/firestore: Firestore',
  'WebChannelConnection RPC',
]);
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Stack, useRouter, usePathname, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens, enableFreeze } from 'react-native-screens';

enableScreens(true);
enableFreeze(true);

import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';
import { WishlistProvider } from '../src/context/WishlistContext';
import { SettingsProvider, useSettings } from '../src/context/SettingsContext';
import { Colors, useThemeColor, checkIsDark } from '../src/constants/theme';
import { NotificationBadgeProvider } from '../src/context/NotificationBadgeContext';
import ForceUpdateChecker from '../src/components/ForceUpdateChecker';
import { InAppNotificationBanner } from '../src/components/InAppNotificationBanner';
import NetworkOverlay from '../src/components/NetworkOverlay';
import { RealtimeDataProvider } from '../src/context/RealtimeDataContext';
import { DialogProvider } from '../src/context/DialogContext';
import { initMemoryManager } from '../src/utils/memoryManager';
import { auth } from '../src/config/firebase';
import { preloadNotificationFeed } from '../src/services/notificationFeedService';
import { preloadAccountData } from '../src/services/loyaltyService';
import { setupPushNotificationListeners } from '../src/services/notificationService';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: 'auth/login',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

// Component màn hình chờ với hiệu ứng logo mượt mà và thanh tải OTA khi có bản update mới
function AnimatedAppSplash({ onFinish }: { onFinish: () => void }) {
  // Logo đứng yên tĩnh lặng ở tỉ lệ chuẩn 1.0 lúc đang chờ
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const [downloadingOta, setDownloadingOta] = useState(false);

  // Chỉ zoom ra khi bắt đầu chuyển sang trang khác
  const startExitTransition = () => {
    scale.value = withTiming(1.28, { duration: 400, easing: Easing.inOut(Easing.ease) });
    opacity.value = withTiming(0, { duration: 360, easing: Easing.in(Easing.ease) }, (finished) => {
      if (finished) {
        runOnJS(onFinish)();
      }
    });
  };

  useEffect(() => {
    let isMounted = true;

    // Kiểm tra OTA Update thông minh kết hợp tải trước dữ liệu Firestore Thông báo & Tài khoản
    const runSplashPreloader = async () => {
      const startTime = Date.now();
      try {
        // Xác định ID tài khoản người dùng ngay lập tức từ Auth hoặc bộ nhớ phiên
        let targetUid: string | undefined = auth.currentUser?.uid;
        if (!targetUid) {
          try {
            const rawSession = await AsyncStorage.getItem('tng_user_session');
            if (rawSession) {
              const parsed = JSON.parse(rawSession);
              if (parsed?.uid) targetUid = parsed.uid;
            }
          } catch {}
        }

        // Tải sẵn đồng thời ngay trong SplashScreen:
        // 1. Kiểm tra bản cập nhật OTA
        // 2. Tải sẵn thông báo Firestore (Tin tức, Thông báo chung, Thông báo riêng, Đơn hàng, Quà tặng gốm)
        // 3. Tải sẵn tài khoản Firestore (Profile, Chi tiêu, Điểm gốm, Hạng hội viên, Đơn hàng, Voucher)
        await Promise.allSettled([
          (async () => {
            if (!__DEV__ && Updates.isEnabled) {
              const update = await Updates.checkForUpdateAsync();
              if (update.isAvailable) {
                if (isMounted) setDownloadingOta(true);
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              }
            }
          })(),
          preloadNotificationFeed(targetUid),
          targetUid ? preloadAccountData(targetUid) : Promise.resolve(null),
        ]);
      } catch (e) {
        console.log('Lỗi preload trong SplashScreen:', e);
      }

      // Đảm bảo thời gian hiển thị logo tối thiểu 600ms để hoạt ảnh mượt mà, tối đa không quá 1200ms
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 600 - elapsed);
      setTimeout(() => {
        if (isMounted) startExitTransition();
      }, remainingTime);
    };

    runSplashPreloader();

    return () => {
      isMounted = false;
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.loadingContainer, containerAnimatedStyle]}>
      <Animated.Image 
        source={require('../assets/images/LOGO_2_PNG.png')} 
        style={[{ width: 260, height: 260 }, animatedStyle]} 
        resizeMode="contain" 
      />

      {downloadingOta && (
        <View style={styles.otaProgressWrap}>
          <View style={styles.otaProgressBarContainer}>
            <View style={styles.otaProgressBarFill} />
          </View>
          <Text style={styles.otaProgressText}>Đang cập nhật phiên bản mới...</Text>
        </View>
      )}
    </Animated.View>
  );
}

// Cờ ghi nhớ đã hoàn thành splash trong phiên làm việc, tránh phát lại khi đổi cài đặt
let hasFinishedSplashOnce = false;

// Cổng bảo vệ xác thực (Auth Gate riêng biệt không gây re-render toàn bộ NavigationRoot)
function AuthGate() {
  const { user, userProfile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isAuth = Boolean(user || userProfile);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = pathname.startsWith('/auth');
    const inOnboarding =
      pathname === '/onboarding' ||
      pathname === '/setup-preferences' ||
      pathname === '/setup-permissions';

    // Tối ưu hiệu năng: Khi người dùng đã đăng nhập và đang dùng các trang trong app,
    // bỏ qua kiểm tra AsyncStorage để không làm chậm thao tác chuyển trang.
    if (isAuth && !inAuthGroup && !inOnboarding) {
      return;
    }

    AsyncStorage.getItem('has_seen_onboarding').then((value) => {
      const seenOnboarding = value === 'true' || isAuth;

      if (!seenOnboarding && !inOnboarding) {
        router.replace('/onboarding');
      } else if (seenOnboarding && !isAuth && !inAuthGroup) {
        router.replace('/auth/login');
      } else if (isAuth && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)');
      }
    });
  }, [isAuth, loading, pathname]);

  return null;
}

function NavigationRoot() {
  const { loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const cleanup = setupPushNotificationListeners(router);
    return () => {
      cleanup?.();
    };
  }, [router]);
  const [splashFinished, setSplashFinished] = useState(() => hasFinishedSplashOnce);
  const themeColors = useThemeColor();
  const isDark = checkIsDark(themeColors);

  const navigationTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        background: themeColors.background,
        card: themeColors.cardBackground,
        text: themeColors.textPrimary,
        border: themeColors.border,
      },
    }),
    [isDark, themeColors]
  );

  if (loading || !splashFinished) {
    return (
      <AnimatedAppSplash
        onFinish={() => {
          hasFinishedSplashOnce = true;
          setSplashFinished(true);
        }}
      />
    );
  }

  // Trên iOS: Dùng hoạt ảnh native UIKit 'default' mượt mà 120Hz, không delay và hỗ trợ swipe-back gốc.
  // Trên Android: Dùng 'slide_from_right' để giữ trải nghiệm trượt ngang hiện đại.
  const stackAnimation = Platform.OS === 'ios' ? 'default' : 'slide_from_right';

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: themeColors.textPrimary,
          headerTitleStyle: {
            fontFamily: 'ElleGaborStd',
            fontSize: 17,
            fontWeight: '700',
            color: themeColors.textPrimary,
          },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: themeColors.background },
          animation: stackAnimation,
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="setup-preferences"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: stackAnimation,
          }}
        />
        <Stack.Screen
          name="setup-permissions"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: stackAnimation,
          }}
        />
        {/* Trang Login riêng biệt, bắt buộc trước khi vào app */}
        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="cart" options={{ animation: stackAnimation }} />
        <Stack.Screen name="product/[id]" options={{ animation: stackAnimation }} />
        <Stack.Screen name="checkout" options={{ animation: stackAnimation }} />
        <Stack.Screen name="order-success" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="edit-profile" options={{ animation: stackAnimation }} />
        <Stack.Screen
          name="search"
          options={{
            headerShown: false,
            headerTransparent: true,
            headerShadowVisible: false,
            headerTitle: '',
            headerTintColor: themeColors.textPrimary,
            animation: stackAnimation,
            headerSearchBarOptions: {
              placement: 'automatic',
              placeholder: 'Tìm kiếm sản phẩm...',
              tintColor: '#9C7156',
              textColor: themeColors.textPrimary,
              headerIconColor: '#9C7156',
              hintTextColor: themeColors.textSecondary,
              autoCapitalize: 'none',
              hideWhenScrolling: false,
            },
          }}
        />
        <Stack.Screen name="membership-privileges" options={{ animation: stackAnimation }} />
        <Stack.Screen name="points-history" options={{ animation: stackAnimation }} />
        <Stack.Screen name="vouchers" options={{ animation: stackAnimation }} />
        <Stack.Screen name="voucher-detail" options={{ animation: stackAnimation }} />
        <Stack.Screen name="order-detail" options={{ animation: stackAnimation }} />

        {/* WebView: mở từ dưới lên */}
        <Stack.Screen
          name="webview"
          options={{
            gestureEnabled: true,
            animation: 'slide_from_bottom',
          }}
        />
        
        {/* Trang chi tiết thông báo riêng biệt */}
        <Stack.Screen
          name="notification-detail"
          options={{
            animation: stackAnimation,
          }}
        />

        {/* Trang Flash Sale mới */}
        <Stack.Screen
          name="flash-sale"
          options={{
            animation: stackAnimation,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

function AppLockGuard({ children }: { children: React.ReactNode }) {
  const { isAppLockEnabled, language, t } = useSettings();
  const [isLocked, setIsLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const isAuthenticating = useRef(false);

  const authenticate = async () => {
    if (isAuthenticating.current) return;
    
    isAuthenticating.current = true;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('authToContinue'),
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsLocked(false);
      }
    } else {
      // Nếu không có phần cứng thì bỏ qua
      setIsLocked(false);
    }
    
    // Đợi 1 giây trước khi reset cờ để AppState có thời gian chuyển về 'active'
    // tránh tình trạng nhận diện nhầm AppState thay đổi và loop gọi lại authenticate
    setTimeout(() => {
      isAuthenticating.current = false;
    }, 1000);
  };

  useEffect(() => {
    // Khi khởi động, nếu bật lock thì khóa ngay
    if (isAppLockEnabled) {
      setIsLocked(true);
      authenticate();
    }
  }, [isAppLockEnabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current?.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App goes to foreground
        if (isAppLockEnabled && !isAuthenticating.current) {
          setIsLocked(true);
          authenticate();
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App goes to background
        if (isAppLockEnabled && !isAuthenticating.current) {
          setIsLocked(true);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAppLockEnabled]);

  if (isLocked) {
    return (
      <View style={styles.lockContainer}>
        <Ionicons name="lock-closed" size={60} color="#2D3B34" style={{ marginBottom: 20 }} />
        <Text style={styles.lockTitle}>{t('appLocked')}</Text>
        <Text style={styles.lockSub}>{t('authToContinue')}</Text>
        <TouchableOpacity style={styles.unlockBtn} onPress={authenticate}>
          <Text style={styles.unlockBtnText}>{t('unlock')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

function AppWrapper() {
  const themeColors = useThemeColor();
  const isDark = checkIsDark(themeColors);

  return (
    <View style={[styles.rootContainer, { backgroundColor: themeColors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppLockGuard>
        <NavigationRoot />
      </AppLockGuard>
      <InAppNotificationBanner />
      <NetworkOverlay />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ElleGaborStd: require('../assets/fonts/ElleGaborStd-Light.ttf'),
    'ElleGaborStd-Light': require('../assets/fonts/ElleGaborStd-Light.ttf'),
    ...Ionicons.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded]);

  useEffect(() => {
    const cleanup = initMemoryManager();
    return () => {
      cleanup?.();
    };
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <NotificationBadgeProvider>
                <RealtimeDataProvider>
                  <DialogProvider>
                    <AppWrapper />
                    <ForceUpdateChecker />
                  </DialogProvider>
                </RealtimeDataProvider>
              </NotificationBadgeProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#9C7156',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otaProgressWrap: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    width: '80%',
    maxWidth: 260,
  },
  otaProgressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  otaProgressBarFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  otaProgressText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.3,
  },
  lockContainer: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  lockTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3B34',
    marginBottom: 8,
  },
  lockSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#7A827E',
    marginBottom: 40,
  },
  unlockBtn: {
    backgroundColor: '#2D3B34',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 24,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
