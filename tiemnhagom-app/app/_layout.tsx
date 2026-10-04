// app/_layout.tsx
import '../src/utils/textScaler';
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, AppState, Text, TouchableOpacity, Image } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Stack, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import Constants from 'expo-constants';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';
import { WishlistProvider } from '../src/context/WishlistContext';
import { SettingsProvider, useSettings } from '../src/context/SettingsContext';
import { Colors } from '../src/constants/theme';
import { NotificationBadgeProvider } from '../src/context/NotificationBadgeContext';
import ForceUpdateChecker from '../src/components/ForceUpdateChecker';
import NetworkOverlay from '../src/components/NetworkOverlay';
import { RealtimeDataProvider } from '../src/context/RealtimeDataContext';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'auth/login',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

// Cổng bảo vệ xác thực (Auth Gate)
function NavigationRoot() {
  const { user, userProfile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuth = Boolean(user || userProfile);

  useEffect(() => {
    if (loading) return;

    AsyncStorage.getItem('has_seen_onboarding').then((value) => {
      // Nếu đã đăng nhập thì ngầm định là đã qua onboarding
      const seenOnboarding = (value === 'true') || isAuth;
      const inAuthGroup = pathname.startsWith('/auth');
      const inOnboarding = pathname === '/onboarding' || pathname === '/setup-preferences' || pathname === '/setup-permissions';

      if (!seenOnboarding && !inOnboarding) {
        // Chưa xem onboarding -> vào trang onboarding
        router.replace('/onboarding');
      } else if (seenOnboarding && !isAuth && !inAuthGroup) {
        // Đã xem onboarding nhưng chưa đăng nhập -> vào trang login
        router.replace('/auth/login');
      } else if (isAuth && (inAuthGroup || inOnboarding)) {
        // Đã đăng nhập nhưng lại đang ở trang login hoặc onboarding -> vào trang chính
        router.replace('/(tabs)');
      }
    });
  }, [isAuth, loading, pathname]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Image 
          source={require('../assets/images/LOGO_3_BLACK_PNG.png')} 
          style={{ width: 360, height: 360 }} 
          resizeMode="contain" 
        />
        <ActivityIndicator 
          size="large" 
          color={Colors.textPrimary} 
          style={{ position: 'absolute', bottom: 100 }} 
        />
        <Text style={styles.versionText}>v{Constants.expoConfig?.version || '1.0.0'}</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
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
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="setup-permissions"
        options={{
          headerShown: false,
          gestureEnabled: false,
          animation: 'slide_from_right',
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
      <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="checkout" options={{ headerShown: false }} />
      <Stack.Screen name="order-success" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'slide_from_right' }} />

      {/* WebView: mở từ dưới lên */}
      <Stack.Screen
        name="webview"
        options={{
          headerShown: false,
          gestureEnabled: true,
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

function AppLockGuard({ children }: { children: React.ReactNode }) {
  const { isAppLockEnabled, language } = useSettings();
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
        promptMessage: language === 'vi' ? 'Xác thực để mở khóa ứng dụng' : 'Authenticate to unlock app',
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
        appState.current.match(/inactive|background/) &&
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
        <Text style={styles.lockTitle}>{language === 'vi' ? 'Ứng dụng đã khóa' : 'App Locked'}</Text>
        <Text style={styles.lockSub}>{language === 'vi' ? 'Vui lòng xác thực để tiếp tục' : 'Please authenticate to continue'}</Text>
        <TouchableOpacity style={styles.unlockBtn} onPress={authenticate}>
          <Text style={styles.unlockBtnText}>{language === 'vi' ? 'Mở khóa' : 'Unlock'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

function AppWrapper() {
  const { fontSize, language } = useSettings();

  return (
    <View key={`${fontSize}-${language}`} style={styles.rootContainer}>
      <AppLockGuard>
        <NavigationRoot />
      </AppLockGuard>
      <NetworkOverlay />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ElleGaborStd: require('../assets/fonts/ElleGaborStd-Light.ttf'),
    'ElleGaborStd-Light': require('../assets/fonts/ElleGaborStd-Light.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded]);

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
                  <StatusBar style="dark" />
                  <AppWrapper />
                  <ForceUpdateChecker />
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
    backgroundColor: '#F7F6F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionText: {
    position: 'absolute',
    bottom: 30,
    fontSize: 12,
    color: '#9E968D',
    fontFamily: 'SpaceMono',
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
