import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Switch,
  Platform,
  ActivityIndicator,
  Animated,
  Linking,
  AppState,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Header } from '../src/components/Header';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { auth } from '../src/config/firebase';
import { useAuth } from '../src/context/AuthContext';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { getFullAppVersionString } from '../src/utils/appVersion';
import { resolveMemberJoinDate } from '../src/utils/joinDate';
import { triggerHaptic, Haptics } from '../src/utils/haptics';

WebBrowser.maybeCompleteAuthSession();

// Tải an toàn Native GoogleSignin SDK
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
  // Expo Go fallback
}

const GOOGLE_CLIENT_ID = '571834989973-nd7opseai7t3etcfnrpvth24pm9f9msb.apps.googleusercontent.com';

export default function SettingsScreen() {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    user,
    userProfile,
    signOut,
    linkGoogleAccount,
    saveCurrentToBiometrics,
    removeAccountFromBiometrics,
  } = useAuth();
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const {
    themeMode,
    setThemeMode,
    language,
    fontSize,
    setLanguage,
    setFontSize,
    isAppLockEnabled,
    setAppLockEnabled,
    isPushNotificationEnabled,
    setPushNotificationEnabled,
    isHapticEnabled,
    setHapticEnabled,
    t,
  } = useSettings();

  const dialog = useDialog();

  // Google OAuth Hook
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: '571834989973-nd7opseai7t3etcfnrpvth24pm9f9msb.apps.googleusercontent.com',
    iosClientId: '571834989973-vvcjphjo86n4uudkd5mcqpelrp67d7kj.apps.googleusercontent.com',
    androidClientId: '571834989973-2hceq95tg0suavnlkit7fhs2ce6iaaua.apps.googleusercontent.com',
    selectAccount: true,
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        setLinkingGoogle(true);
        linkGoogleAccount(idToken)
          .then(() => {
            dialog.alert(t('success'), t('linkGoogleSuccess'));
          })
          .catch((err: any) => {
            dialog.alert(t('linkGoogleErrorTitle'), err.message || t('linkGoogleErrorMsg'));
          })
          .finally(() => {
            setLinkingGoogle(false);
          });
      }
    }
  }, [googleResponse]);

  const handleToggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        dialog.alert(t('notAvailable'), t('deviceNotSupportLock'));
        return;
      }

      const authRes = await LocalAuthentication.authenticateAsync({
        promptMessage: t('authToEnableLock'),
        disableDeviceFallback: false,
      });

      if (authRes.success) {
        // Lưu tài khoản hiện tại vào danh sách đa tài khoản sinh trắc học
        await saveCurrentToBiometrics();
        await setAppLockEnabled(true);
        dialog.alert(t('success'), t('biometricLoginEnabledAlert'));
      }
    } else {
      const effectiveUid = user?.uid || userProfile?.uid || auth.currentUser?.uid;
      if (effectiveUid) {
        await removeAccountFromBiometrics(effectiveUid);
      }
      await setAppLockEnabled(false);
      dialog.alert(t('notification'), t('biometricLoginDisabledAlert'));
    }
  };
  
  const handleTogglePushNotification = async (value: boolean) => {
    setPushNotificationEnabled(value);
    if (value) {
      dialog.alert(
        t('notificationEnabled'),
        t('receiveOffers')
      );
    } else {
      dialog.alert(
        t('notificationDisabled'),
        t('pushDisabled')
      );
    }
  };

  const handleToggleHaptic = async (value: boolean) => {
    await setHapticEnabled(value);
    if (value) {
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const [cacheSize, setCacheSize] = useState<string>('0 KB');
  const [dataSize, setDataSize] = useState<string>('0 KB');
  const [totalStorageSize, setTotalStorageSize] = useState<string>('0 MB');
  const [isClearingCache, setIsClearingCache] = useState(false);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDirSizeBytes = async (dirUri: string | null | undefined, depth = 0): Promise<number> => {
    if (!dirUri || depth > 3) return 0;
    try {
      const entries = await FileSystem.readDirectoryAsync(dirUri);
      let sum = 0;
      for (const name of entries) {
        const uri = dirUri.endsWith('/') ? `${dirUri}${name}` : `${dirUri}/${name}`;
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) continue;
          if (info.isDirectory) {
            sum += await getDirSizeBytes(uri, depth + 1);
          } else if (typeof (info as any).size === 'number') {
            sum += (info as any).size;
          }
        } catch {}
      }
      return sum;
    } catch {
      return 0;
    }
  };

  // Tính toán dung lượng bộ nhớ đệm & dữ liệu tải xuống thực tế
  const calculateCacheSize = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      let asyncDataBytes = 0;
      let asyncTempBytes = 0;
      if (keys.length > 0) {
        const stores = await AsyncStorage.multiGet(keys);
        stores.forEach(([k, val]) => {
          if (val) {
            const b = k.length + val.length * 2;
            if (k.includes('recent_searches') || k.includes('temp') || k.includes('cache')) {
              asyncTempBytes += b;
            } else {
              asyncDataBytes += b;
            }
          }
        });
      }

      const [cacheDirBytes, docDirBytes] = await Promise.all([
        getDirSizeBytes((FileSystem as any).cacheDirectory),
        getDirSizeBytes((FileSystem as any).documentDirectory),
      ]);

      const totalCacheBytes = cacheDirBytes + asyncTempBytes;
      const totalDataBytes = docDirBytes + asyncDataBytes;
      const grandTotalBytes = totalCacheBytes + totalDataBytes;

      setCacheSize(formatBytes(totalCacheBytes));
      setDataSize(formatBytes(totalDataBytes));
      setTotalStorageSize(formatBytes(grandTotalBytes));
    } catch {
      setCacheSize('0 KB');
      setDataSize('0 KB');
      setTotalStorageSize('0 KB');
    }
  };

  useEffect(() => {
    calculateCacheSize();
  }, []);

  const handleClearCache = () => {
    dialog.confirm(
      t('clearCacheTitle') || 'Xóa bộ nhớ đệm',
      t('clearCacheConfirmMsg') || `Bạn có chắc muốn giải phóng ${cacheSize} bộ nhớ đệm hình ảnh và dữ liệu tạm không?`,
      async () => {
        try {
          setIsClearingCache(true);
          if (Image.clearMemoryCache) {
            await Image.clearMemoryCache();
          }
          if (Image.clearDiskCache) {
            await Image.clearDiskCache();
          }
          const cacheDir = (FileSystem as any).cacheDirectory;
          if (cacheDir) {
            try {
              const entries = await FileSystem.readDirectoryAsync(cacheDir);
              await Promise.all(
                entries.map((name) =>
                  FileSystem.deleteAsync(
                    cacheDir.endsWith('/') ? `${cacheDir}${name}` : `${cacheDir}/${name}`,
                    { idempotent: true }
                  ).catch(() => {})
                )
              );
            } catch {}
          }
          const allKeys = await AsyncStorage.getAllKeys();
          const tempKeys = allKeys.filter((k) =>
            k.includes('recent_searches') ||
            k.includes('temp') ||
            k.includes('cache')
          );
          if (tempKeys.length > 0) {
            await AsyncStorage.multiRemove(tempKeys);
          }
          await calculateCacheSize();
          dialog.alert(
            t('clearCacheTitle') || 'Xóa bộ nhớ đệm',
            t('cacheCleared') || 'Đã giải phóng bộ nhớ đệm thành công!'
          );
        } catch {
          await calculateCacheSize();
          dialog.alert(
            t('clearCacheTitle') || 'Xóa bộ nhớ đệm',
            t('cacheCleared') || 'Đã giải phóng bộ nhớ đệm thành công!'
          );
        } finally {
          setIsClearingCache(false);
        }
      },
      t('clearAll') || 'Xóa ngay',
      t('cancel') || 'Hủy',
      true
    );
  };

  const handleSignOut = () => {
    dialog.confirm(
      t('signOutTitle') || 'Đăng xuất',
      t('signOutConfirm') || 'Bạn có chắc chắn muốn đăng xuất tài khoản khỏi thiết bị?',
      async () => {
        await signOut();
        router.replace('/(tabs)/profile');
      },
      t('signOutTitle') || 'Đăng xuất',
      t('cancel') || 'Hủy',
      true
    );
  };

  const handleDeleteAccount = () => {
    dialog.confirm(
      t('deleteAccountTitle') || 'Xóa tài khoản',
      t('deleteAccountConfirm') || 'Hành động này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu tích điểm. Bạn có chắc chắn không?',
      async () => {
        try {
          if (user && user.delete) {
            await user.delete();
          }
          await signOut();
          dialog.alert(
            t('success') || 'Thành công',
            t('accountDeleted') || 'Tài khoản của bạn đã được xóa thành công.'
          );
          router.replace('/(tabs)/profile');
        } catch (e: any) {
          if (e.code === 'auth/requires-recent-login') {
            dialog.alert(
              t('authRequired') || 'Yêu cầu xác thực',
              t('reauthRequired') || 'Vui lòng đăng nhập lại trước khi thực hiện thao tác xóa tài khoản.'
            );
          } else {
            dialog.alert(t('error') || 'Lỗi', e.message || t('deleteAccountError'));
          }
        }
      },
      t('confirmDelete') || 'Xóa tài khoản',
      t('cancel') || 'Hủy',
      true
    );
  };

  const [scrollY, setScrollY] = React.useState(0);
  const [pickerSheet, setPickerSheet] = useState<'theme' | 'language' | 'fontSize' | null>(null);
  const [locationPermLabel, setLocationPermLabel] = useState<string>('Chưa cấp quyền');
  const [notifPermLabel, setNotifPermLabel] = useState<string>('Tắt');

  const refreshSystemPermissions = React.useCallback(async () => {
    try {
      const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
      const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (bg?.status === 'granted') {
        setLocationPermLabel('Luôn cho phép');
      } else if (fg?.status === 'granted') {
        setLocationPermLabel('Khi dùng app');
      } else if (fg?.status === 'denied') {
        setLocationPermLabel('Đang tắt');
      } else {
        setLocationPermLabel('Chưa cấp quyền');
      }
    } catch {
      setLocationPermLabel('Chưa cấp quyền');
    }

    try {
      const notif = await Notifications.getPermissionsAsync();
      setNotifPermLabel(notif.granted ? 'Bật' : 'Tắt');
    } catch {
      setNotifPermLabel(isPushNotificationEnabled ? 'Bật' : 'Tắt');
    }
  }, [isPushNotificationEnabled]);

  useEffect(() => {
    refreshSystemPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshSystemPermissions();
      }
    });
    return () => sub.remove();
  }, [refreshSystemPermissions]);

  const openSystemAppSettings = () => {
    Linking.openSettings().catch(() => {
      dialog.alert(t('notification') || 'Thông báo', 'Không thể mở cài đặt hệ thống.');
    });
  };

  const { pageStyle } = usePageAnimation({ itemCount: 20 });

  const isDark = Colors.cardBackground !== '#FFFFFF';

  const themeLabel =
    themeMode === 'light'
      ? (t('lightTheme') || 'Sáng')
      : themeMode === 'dark'
      ? (t('darkTheme') || 'Tối')
      : (t('systemTheme') || 'Hệ thống');

  const languageLabel =
    language === 'en'
      ? (t('english') || 'English')
      : language === 'zh'
      ? (t('chinese') || '中文')
      : (t('vietnamese') || 'Tiếng Việt');

  const fontSizeLabel =
    fontSize === 'small'
      ? (t('small') || 'Nhỏ')
      : fontSize === 'large'
      ? (t('large') || 'Lớn')
      : (t('medium') || 'Vừa');

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('settingsTitle')}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56 + 10, paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* 1. QUYỀN RIÊNG TƯ & TIỆN ÍCH */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionKicker}>{t('security') || 'Quyền riêng tư & Tiện ích'}</Text>

          <View style={styles.groupCard}>
            {/* Khóa app */}
            <View style={styles.settingRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F4E4CE' }]}>
                <Ionicons name="lock-closed-outline" size={20} color={isDark ? '#E8CCB2' : '#7C5332'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('appLockFeature') || 'Khóa app'}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{t('lockAppDesc') || 'Mở bằng sinh trắc học / mã máy'}</Text>
              </View>
              <Switch
                value={isAppLockEnabled}
                onValueChange={handleToggleAppLock}
                trackColor={{ false: isDark ? '#383430' : '#DED8D0', true: '#9C7156' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {(user || userProfile) && (
              <>
                <View style={styles.rowDivider} />
                <TouchableOpacity
                  style={styles.settingRow}
                  activeOpacity={0.7}
                  onPress={() => router.push('/change-password' as any)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: isDark ? '#362722' : '#F3DFD6' }]}>
                    <Ionicons name="key-outline" size={20} color={isDark ? '#E8B8A2' : '#8F4D32'} />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{t('pwdChangeTitle') || 'Đổi mật khẩu'}</Text>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>Cập nhật mật khẩu đăng nhập</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
                </TouchableOpacity>
              </>
            )}

            <View style={styles.rowDivider} />

            {/* Vị trí (mở Cài đặt hệ thống) */}
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={openSystemAppSettings}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F2E2D5' }]}>
                <Ionicons name="location" size={20} color={isDark ? '#E8CCB2' : '#8A5A2B'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('locationPermissionTitle') || 'Vị trí'}</Text>
              </View>
              <View style={styles.rowRightValue}>
                <Text style={styles.rowValueText} numberOfLines={1}>{locationPermLabel}</Text>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Thông báo (mở Cài đặt hệ thống) */}
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={openSystemAppSettings}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#382522' : '#F6DDD7' }]}>
                <Ionicons name="notifications" size={20} color={isDark ? '#EEA898' : '#A64430'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('notificationsTab') || 'Thông báo'}</Text>
              </View>
              <View style={styles.rowRightValue}>
                <Text style={styles.rowValueText} numberOfLines={1}>{notifPermLabel}</Text>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Phản hồi xúc giác */}
            <View style={styles.settingRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2D2A27' : '#EAE4DC' }]}>
                <Ionicons name="finger-print-outline" size={20} color={isDark ? '#D5CBC0' : '#5E554C'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('hapticFeedbackFeature') || 'Phản hồi xúc giác'}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>{t('hapticFeedbackDesc') || 'Rung nhẹ khi thao tác nút bấm'}</Text>
              </View>
              <Switch
                value={isHapticEnabled}
                onValueChange={handleToggleHaptic}
                trackColor={{ false: isDark ? '#383430' : '#DED8D0', true: '#9C7156' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* 2. HIỂN THỊ & BỘ NHỚ */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionKicker}>{t('appTheme') || 'Hiển thị & Hệ thống'}</Text>

          <View style={styles.groupCard}>
            {/* Giao diện */}
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push('/settings-theme' as any)}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#352B1E' : '#F5E4C4' }]}>
                <Ionicons name="contrast-outline" size={20} color={isDark ? '#F0D095' : '#96681B'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('appTheme') || 'Giao diện'}</Text>
              </View>
              <View style={styles.rowRightValue}>
                <Text style={styles.rowValueText} numberOfLines={1}>{themeLabel}</Text>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Ngôn ngữ */}
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push('/settings-language' as any)}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F2E2D5' }]}>
                <Ionicons name="globe-outline" size={20} color={isDark ? '#E8CCB2' : '#8A5A2B'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('appLanguage') || 'Ngôn ngữ'}</Text>
              </View>
              <View style={styles.rowRightValue}>
                <Text style={styles.rowValueText} numberOfLines={1}>{languageLabel}</Text>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Cỡ chữ */}
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push('/settings-fontsize' as any)}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2F2A26' : '#EDE5DC' }]}>
                <Ionicons name="text-outline" size={20} color={isDark ? '#DCD0C4' : '#66584A'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('fontSizeTitle') || 'Kích thước chữ'}</Text>
              </View>
              <View style={styles.rowRightValue}>
                <Text style={styles.rowValueText} numberOfLines={1}>{fontSizeLabel}</Text>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </View>
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Bộ nhớ đệm & Dữ liệu tải xuống */}
            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.7}
              onPress={() => router.push('/settings-storage' as any)}
            >
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#382522' : '#F6DDD7' }]}>
                <Ionicons name="server-outline" size={20} color={isDark ? '#EEA898' : '#B5482B'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{t('appCache') || 'Bộ nhớ'}</Text>
              </View>
              <View style={styles.rowRightValue}>
                <Text style={styles.rowValueText}>{totalStorageSize}</Text>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. TÀI KHOẢN LIÊN KẾT */}
        {(user || userProfile) && (() => {
          const effectiveUid = userProfile?.uid || user?.uid || null;
          const isDirectPrimarySession = Boolean(user?.uid && effectiveUid && effectiveUid === user.uid);
          const currentProviders = auth.currentUser?.providerData || user?.providerData || [];

          const googleProviderInfo = currentProviders.find((p) => p?.providerId === 'google.com') || null;
          const hasGoogleOnCurrentAuth = Boolean(googleProviderInfo);
          const isGoogleLinked = hasGoogleOnCurrentAuth || userProfile?.googleLinked === true;
          const googleEmail = isGoogleLinked
            ? (googleProviderInfo?.email || userProfile?.googleEmail || (isDirectPrimarySession ? user?.email : null) || userProfile?.email || null)
            : null;

          const appleProviderInfo = currentProviders.find((p) => p?.providerId === 'apple.com') || null;
          const hasAppleOnCurrentAuth = Boolean(appleProviderInfo);
          const isAppleLinked = hasAppleOnCurrentAuth || userProfile?.appleLinked === true;
          const appleEmail = isAppleLinked
            ? (appleProviderInfo?.email || userProfile?.appleEmail || null)
            : null;

          const linkedPhoneVal = (userProfile?.phone || user?.phoneNumber || '').trim();
          const linkedEmailVal = (userProfile?.email || user?.email || '').trim();

          return (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionKicker}>{t('linkedAccountsTitle') || 'Tài khoản liên kết'}</Text>

              <View style={styles.groupCard}>
                {/* SỐ ĐIỆN THOẠI */}
                <View style={styles.settingRow}>
                  <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F4E4CE' }]}>
                    <Ionicons name="call" size={19} color={isDark ? '#E8CCB2' : '#7C5332'} />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>{t('phoneLabel') || 'Số điện thoại'}</Text>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {linkedPhoneVal || t('linkedStatusNotConnected')}
                    </Text>
                  </View>
                  {linkedPhoneVal ? (
                    <View style={styles.linkedActiveBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#9C7156" />
                      <Text style={styles.linkedActiveText}>{t('linkedBadgeConnected')}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.rowDivider} />

                {/* EMAIL */}
                <View style={styles.settingRow}>
                  <View style={[styles.iconCircle, { backgroundColor: isDark ? '#352B1E' : '#F5E4C4' }]}>
                    <Ionicons name="mail" size={19} color={isDark ? '#F0D095' : '#96681B'} />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>{t('emailLabel') || 'Email'}</Text>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {linkedEmailVal || t('linkedStatusNotConnected')}
                    </Text>
                  </View>
                  {linkedEmailVal ? (
                    <View style={styles.linkedActiveBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#9C7156" />
                      <Text style={styles.linkedActiveText}>{t('linkedBadgeConnected')}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.rowDivider} />

                {/* GOOGLE */}
                <View style={styles.settingRow}>
                  <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2B2B2B' : '#F4EFEA' }]}>
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>Google</Text>
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {isGoogleLinked ? (googleEmail || t('linkedStatusConnected')) : t('linkedStatusNotConnected')}
                    </Text>
                  </View>
                  {isGoogleLinked ? (
                    <View style={styles.linkedActiveBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#9C7156" />
                      <Text style={styles.linkedActiveText}>{t('linkedBadgeConnected')}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.btnLinkAction, linkingGoogle && { opacity: 0.6 }]}
                      activeOpacity={0.8}
                      disabled={linkingGoogle}
                      onPress={async () => {
                        setLinkingGoogle(true);
                        try {
                          if (NativeGoogleSignin) {
                            try {
                              await NativeGoogleSignin.hasPlayServices();
                              const response = await NativeGoogleSignin.signIn();
                              const idToken = response.data?.idToken;
                              if (idToken) {
                                await linkGoogleAccount(idToken);
                                dialog.alert(t('success'), t('linkGoogleSuccess'));
                                return;
                              }
                            } catch (nativeErr: any) {
                              if (nativeStatusCodes && nativeErr.code === nativeStatusCodes.SIGN_IN_CANCELLED) {
                                return;
                              }
                            }
                          }
                          if (googleRequest) {
                            await promptGoogleAsync();
                          } else {
                            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=id_token&scope=openid%20profile%20email&redirect_uri=${encodeURIComponent('https://auth.expo.io/@gnouccouq/tiemnhagom')}&nonce=${Math.random().toString(36).substring(7)}`;
                            await WebBrowser.openAuthSessionAsync(authUrl);
                          }
                        } catch (err: any) {
                          dialog.alert(t('linkGoogleErrorTitle'), err.message || t('linkGoogleErrorMsg'));
                        } finally {
                          setLinkingGoogle(false);
                        }
                      }}
                    >
                      {linkingGoogle ? (
                        <ActivityIndicator size="small" color="#9C7156" />
                      ) : (
                        <Text style={styles.btnLinkActionText}>{t('linkActionBtn')}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {Platform.OS === 'ios' && (
                  <>
                    <View style={styles.rowDivider} />
                    <View style={styles.settingRow}>
                      <View style={[styles.iconCircle, { backgroundColor: '#1E1B18' }]}>
                        <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.rowTextCol}>
                        <Text style={styles.rowTitle}>Apple ID</Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {isAppleLinked ? (appleEmail || t('linkedStatusConnected')) : t('linkedStatusNotConnected')}
                        </Text>
                      </View>
                      {isAppleLinked ? (
                        <View style={styles.linkedActiveBadge}>
                          <Ionicons name="checkmark-circle" size={14} color="#9C7156" />
                          <Text style={styles.linkedActiveText}>{t('linkedBadgeConnected')}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.btnLinkAction}
                          activeOpacity={0.8}
                          onPress={() => dialog.alert(t('linkAppleTitle'), t('linkAppleIosOnly'))}
                        >
                          <Text style={styles.btnLinkActionText}>{t('linkActionBtn')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })()}

        <TouchableOpacity
          style={styles.versionContainer}
          activeOpacity={0.7}
          onPress={() => router.push('/version' as any)}
        >
          <Text style={styles.versionText}>
            Tiệm Nhà Gốm v{getFullAppVersionString()}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* BOTTOM SHEET: GIAO DIỆN */}
      <AnimatedBottomSheetModal
        visible={pickerSheet === 'theme'}
        onClose={() => setPickerSheet(null)}
        contentStyle={styles.sheetContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('appTheme') || 'Giao diện'}</Text>
        {[
          { id: 'system' as const, label: t('systemTheme') || 'Theo hệ thống', icon: 'phone-portrait-outline' as const },
          { id: 'light' as const, label: t('lightTheme') || 'Sáng (Light)', icon: 'sunny-outline' as const },
          { id: 'dark' as const, label: t('darkTheme') || 'Tối (Dark)', icon: 'moon-outline' as const },
        ].map((item) => {
          const active = themeMode === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.sheetOptionRow, active && styles.sheetOptionRowActive]}
              activeOpacity={0.75}
              onPress={() => {
                setThemeMode(item.id);
                setPickerSheet(null);
              }}
            >
              <View style={styles.sheetOptionLeft}>
                <Ionicons name={item.icon} size={20} color={active ? '#9C7156' : Colors.textMuted} />
                <Text style={[styles.sheetOptionLabel, active && styles.sheetOptionLabelActive]}>{item.label}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color="#9C7156" />}
            </TouchableOpacity>
          );
        })}
      </AnimatedBottomSheetModal>

      {/* BOTTOM SHEET: NGÔN NGỮ */}
      <AnimatedBottomSheetModal
        visible={pickerSheet === 'language'}
        onClose={() => setPickerSheet(null)}
        contentStyle={styles.sheetContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('appLanguage') || 'Ngôn ngữ'}</Text>
        {[
          { id: 'vi' as const, label: t('vietnamese') || 'Tiếng Việt', flag: 'https://flagcdn.com/w80/vn.png' },
          { id: 'en' as const, label: t('english') || 'English', flag: 'https://flagcdn.com/w80/gb.png' },
          { id: 'zh' as const, label: t('chinese') || '中文 (Chinese)', flag: 'https://flagcdn.com/w80/cn.png' },
        ].map((item) => {
          const active = language === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.sheetOptionRow, active && styles.sheetOptionRowActive]}
              activeOpacity={0.75}
              onPress={() => {
                setLanguage(item.id);
                setPickerSheet(null);
              }}
            >
              <View style={styles.sheetOptionLeft}>
                <Image source={{ uri: item.flag }} style={styles.langFlagImage} />
                <Text style={[styles.sheetOptionLabel, active && styles.sheetOptionLabelActive]}>{item.label}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color="#9C7156" />}
            </TouchableOpacity>
          );
        })}
      </AnimatedBottomSheetModal>

      {/* BOTTOM SHEET: KÍCH THƯỚC CHỮ */}
      <AnimatedBottomSheetModal
        visible={pickerSheet === 'fontSize'}
        onClose={() => setPickerSheet(null)}
        contentStyle={styles.sheetContent}
        showHandle={true}
      >
        <Text style={styles.sheetTitle}>{t('fontSizeTitle') || 'Kích thước chữ'}</Text>
        <View style={styles.fontSizeGrid}>
          {[
            { id: 'small' as const, label: t('small') || 'Nhỏ', sz: 12 },
            { id: 'normal' as const, label: t('medium') || 'Vừa', sz: 15 },
            { id: 'large' as const, label: t('large') || 'Lớn', sz: 18 },
          ].map((item) => {
            const active = fontSize === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.fontSizeChip, active && styles.fontSizeChipActive]}
                activeOpacity={0.8}
                onPress={() => setFontSize(item.id)}
              >
                <Text style={[styles.fontSizeChipLabel, active && styles.fontSizeChipLabelActive, { fontSize: item.sz }]}>Aa</Text>
                <Text style={[styles.fontSizeChipSub, active && styles.fontSizeChipSubActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.previewBox}>
          <Text style={[styles.previewSampleText, { fontSize: fontSize === 'small' ? 12 : fontSize === 'large' ? 16 : 14 }]}>
            {t('sampleText')}
          </Text>
        </View>
      </AnimatedBottomSheetModal>
    </Animated.View>
  );
}

const getStyles = (Colors: any) => {
  const isDark = Colors.cardBackground !== '#FFFFFF';

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
    },
    sectionBlock: {
      marginBottom: 22,
    },
    sectionKicker: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#7C5332',
      marginBottom: 10,
      marginLeft: 6,
    },
    groupCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTextCol: {
      flex: 1,
      justifyContent: 'center',
    },
    rowTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    rowSubtitle: {
      fontSize: 12.5,
      color: Colors.textMuted || '#7D756C',
      marginTop: 2,
    },
    rowRightValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    rowValueText: {
      fontSize: 14,
      fontWeight: '500',
      color: Colors.textMuted || '#7D756C',
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 16,
    },
    sheetContent: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    },
    sheetTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginBottom: 14,
    },
    sheetOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 14,
      marginBottom: 8,
      backgroundColor: isDark ? '#252525' : '#FAF8F5',
    },
    sheetOptionRowActive: {
      backgroundColor: isDark ? '#33281D' : '#F4E8DC',
    },
    sheetOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sheetOptionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    sheetOptionLabelActive: {
      color: isDark ? '#E8CCB2' : '#7C5332',
      fontWeight: '700',
    },
    settingsGroup: {
      marginBottom: 24,
    },
    settingsGroupTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 4,
    },
    settingsGroupSubtitle: {
      fontSize: 12.5,
      color: Colors.textMuted || '#7A827E',
      marginBottom: 12,
    },
    optionsList: {
      gap: 10,
    },
    settingOptionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Colors.cardBackground,
      borderWidth: isDark ? 0 : 1.2,
      borderColor: isDark ? 'transparent' : Colors.borderLight,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    settingOptionCardActive: {
      borderWidth: 1.2,
      borderColor: isDark ? '#9C7156' : '#2B2928',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : Colors.cardBackground,
    },
    settingOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    themeIcon: {
      marginRight: 8,
    },
    langFlagImage: {
      width: 28,
      height: 20,
      borderRadius: 3,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E5E7EB',
    },
    settingOptionName: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textPrimary || '#2B2928',
    },
    settingOptionNameActive: {
      color: isDark ? '#E8CCB2' : '#2B2928',
      fontWeight: '700',
    },
    settingOptionDesc: {
      fontSize: 11.5,
      color: Colors.textMuted || '#888888',
      marginTop: 2,
    },
    radioCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: isDark ? '#555555' : '#D1D5DB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleActive: {
      borderColor: isDark ? '#9C7156' : '#2B2928',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: isDark ? '#9C7156' : '#2B2928',
    },
    fontSizeGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    fontSizeChip: {
      flex: 1,
      backgroundColor: Colors.cardBackground,
      borderWidth: isDark ? 0 : 1.2,
      borderColor: isDark ? 'transparent' : Colors.borderLight,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    fontSizeChipActive: {
      borderWidth: 1.2,
      borderColor: isDark ? '#9C7156' : '#2B2928',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#2B2928',
    },
    fontSizeChipLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: Colors.textPrimary || '#333333',
    },
    fontSizeChipLabelActive: {
      color: isDark ? '#E8CCB2' : '#FFFFFF',
      fontWeight: '700',
    },
    fontSizeChipSub: {
      fontSize: 11,
      color: Colors.textMuted || '#888888',
      marginTop: 2,
    },
    fontSizeChipSubActive: {
      color: isDark ? '#E8CCB2' : '#D4D4D8',
    },
    previewBox: {
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : Colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : Colors.borderLight,
    },
    previewHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    previewHeaderLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: Colors.textSecondary,
    },
    previewSampleText: {
      color: Colors.textPrimary,
      lineHeight: 22,
    },
    cacheActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Colors.cardBackground,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : Colors.borderLight,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    cacheLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    cacheIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFF4EE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cacheBtnText: {
      fontSize: 13.5,
      color: Colors.textPrimary || '#231B15',
      fontWeight: '600',
    },
    cacheSubText: {
      fontSize: 11.5,
      color: Colors.textMuted || '#9E968D',
      marginTop: 2,
    },
    cacheRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cacheSizeBadge: {
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    cacheSizeText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    linkedAccountsCard: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      paddingHorizontal: 16,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    linkedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    linkedRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      marginRight: 12,
    },
    linkedIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkedProviderName: {
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary || '#2B2928',
    },
    linkedProviderStatus: {
      fontSize: 12,
      color: Colors.textMuted || '#6E665D',
      marginTop: 2,
    },
    linkedActiveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.2)' : '#F6F4EC',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    linkedActiveText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    btnLinkAction: {
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    btnLinkActionText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    joinDateCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    joinDateLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    joinDateLabel: {
      fontSize: 13.5,
      color: Colors.textSecondary || '#6E665D',
      fontWeight: '600',
    },
    joinDateValue: {
      fontSize: 13.5,
      color: isDark ? '#E8CCB2' : '#9C7156',
      fontWeight: '700',
    },
    linkedDivider: {
      height: 1,
      backgroundColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.cardBackground,
      height: 52,
      borderRadius: 26,
      gap: 8,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : Colors.borderLight,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    logoutBtnText: {
      color: Colors.textPrimary || '#333333',
      fontWeight: '600',
      fontSize: 14.5,
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(211, 47, 47, 0.12)' : '#FFECEC',
      height: 52,
      borderRadius: 26,
      gap: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(211, 47, 47, 0.3)' : '#FFCDD2',
    },
    deleteBtnText: {
      color: '#EF5350',
      fontWeight: '700',
      fontSize: 14.5,
    },
    versionContainer: {
      marginTop: 30,
      alignItems: 'center',
      paddingBottom: 20,
    },
    versionText: {
      fontSize: 12,
      color: '#A0A5A2',
      letterSpacing: 0.5,
    },
  });
};
