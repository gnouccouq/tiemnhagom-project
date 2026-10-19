// app/_layout.tsx
import '../src/utils/textScaler';
import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from '../src/context/SettingsContext';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { POSProvider } from '../src/context/POSContext';
import { useThemeColor } from '../src/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { user, adminProfile, isLoading, isShiftLocked } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';

  useEffect(() => {
    if (isLoading) return;

    const segs = segments as string[];
    const inAuthGroup = segs[0] === '(auth)';

    if (!user || !adminProfile) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (isShiftLocked) {
      if (segs[1] !== 'pin-lock') {
        router.replace('/(auth)/pin-lock');
      }
    } else if (inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, adminProfile, isLoading, isShiftLocked, segments]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color="#9C7156" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/pin-lock" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="order-detail/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="rental-detail/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="product-edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="customer-detail/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="coupon-edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="push-notification" options={{ headerShown: false }} />
        <Stack.Screen name="shift-report" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ElleGaborStd: require('../assets/fonts/ElleGaborStd-Light.ttf'),
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <POSProvider>
            <RootNavigator />
          </POSProvider>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
