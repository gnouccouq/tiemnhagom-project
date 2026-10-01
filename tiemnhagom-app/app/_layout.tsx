// app/_layout.tsx
import '../src/utils/textScaler';
import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';
import { WishlistProvider } from '../src/context/WishlistContext';
import { SettingsProvider, useSettings } from '../src/context/SettingsContext';
import { Colors } from '../src/constants/theme';

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
  const segments = useSegments();
  const router = useRouter();

  const isAuth = Boolean(user || userProfile);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!isAuth && !inAuthGroup) {
      // 1. Chưa đăng nhập: Bắt buộc chuyển hướng đến màn hình /auth/login
      router.replace('/auth/login');
    } else if (isAuth && inAuthGroup) {
      // 2. Đã đăng nhập: Tự động chuyển thẳng vào màn hình chính (tabs)
      router.replace('/(tabs)');
    }
  }, [isAuth, loading, segments]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#9C7156" />
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
    </Stack>
  );
}

function AppWrapper() {
  const { fontSize, language } = useSettings();

  return (
    <View key={`${fontSize}-${language}`} style={styles.rootContainer}>
      <NavigationRoot />
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
              <StatusBar style="dark" />
              <AppWrapper />
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
});
