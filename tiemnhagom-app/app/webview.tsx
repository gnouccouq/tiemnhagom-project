import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { ScalePressable } from '../src/components/ScalePressable';
import { BlurButton } from '../src/components/BlurButton';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { SymbolView } from 'expo-symbols';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';

export default function WebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();

  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [pageTitle, setPageTitle] = useState(title || t('loading') || 'Đang tải...');
  const webViewRef = useRef<WebView>(null);

  if (!url) {
    return null;
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Thanh điều hướng gốc iOS UINavigationBar chuẩn Liquid Glass */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitle: () => (
            <Text style={styles.navHeaderTitle} numberOfLines={1}>
              {pageTitle}
            </Text>
          ),
          headerTintColor: '#9C7156',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t('close')}
            >
              <SymbolView
                name="xmark"
                size={18}
                tintColor={Colors.textPrimary}
                fallback={<Ionicons name="close" size={20} color={Colors.textPrimary} />}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <FadingHeaderBackdrop />

      {/* Loading bar */}
      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#9C7156" />
          <Text style={styles.loadingText}>{t('loadingPage')}</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webView}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
          if (navState.title) setPageTitle(navState.title);
        }}
        allowsBackForwardNavigationGestures={true}
        sharedCookiesEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
      />
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  headerTitle: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: isDark ? '#888888' : '#8E8E93',
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
