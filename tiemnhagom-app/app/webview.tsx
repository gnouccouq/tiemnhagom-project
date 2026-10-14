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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { ScalePressable } from '../src/components/ScalePressable';
import { useThemeColor } from '../src/constants/theme';

export default function WebViewScreen() {
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [pageTitle, setPageTitle] = useState(title || 'Đang tải...');
  const webViewRef = useRef<WebView>(null);

  if (!url) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <ScalePressable
          onPress={() => {
            if (canGoBack) {
              webViewRef.current?.goBack();
            } else {
              router.back();
            }
          }}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />
        </ScalePressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {pageTitle}
        </Text>

        <ScalePressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color={Colors.textPrimary} />
        </ScalePressable>
      </View>

      {/* Loading bar */}
      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#9C7156" />
          <Text style={styles.loadingText}>Đang tải trang...</Text>
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
    </SafeAreaView>
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
    backgroundColor: Colors.background,
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.08,
    shadowRadius: 4,
    elevation: isDark ? 0 : 2,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
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
    backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    shadowOpacity: isDark ? 0 : 0.08,
    elevation: isDark ? 0 : 2,
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
