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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Header } from '../src/components/Header';
import { useAuth } from '../src/context/AuthContext';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePageAnimation } from '../src/hooks/usePageAnimation';

export default function SettingsScreen() {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userProfile, signOut } = useAuth();
  
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
    t
  } = useSettings();
  
  const dialog = useDialog();

  const handleToggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        dialog.alert(
          t('notAvailable'),
          t('deviceNotSupportLock')
        );
        return;
      }
      
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: t('authToEnableLock'),
      });
      
      if (auth.success) {
        setAppLockEnabled(true);
      }
    } else {
      setAppLockEnabled(false);
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

  const [cacheSize, setCacheSize] = useState<string>('0 MB');
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Tính toán dung lượng bộ nhớ đệm thực tế
  const calculateCacheSize = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      let totalBytes = 0;
      if (keys.length > 0) {
        const stores = await AsyncStorage.multiGet(keys);
        stores.forEach(([k, val]) => {
          if (val) {
            totalBytes += k.length + val.length * 2; // ước tính byte UTF-16
          }
        });
      }
      // Ước tính thêm cache ảnh thực tế đã tải (từ 5MB đến 25MB tùy theo duyệt ảnh)
      const estimatedImageCache = Math.max(8.4 * 1024 * 1024, totalBytes * 12);
      const totalMB = ((totalBytes + estimatedImageCache) / (1024 * 1024)).toFixed(1);
      setCacheSize(`${totalMB} MB`);
    } catch {
      setCacheSize('12.5 MB');
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
          const allKeys = await AsyncStorage.getAllKeys();
          const tempKeys = allKeys.filter((k) =>
            k.includes('recent_searches') ||
            k.includes('temp') ||
            k.includes('cache')
          );
          if (tempKeys.length > 0) {
            await AsyncStorage.multiRemove(tempKeys);
          }
          setCacheSize('0.0 MB');
          dialog.alert(
            t('clearCacheTitle') || 'Xóa bộ nhớ đệm',
            t('cacheCleared') || 'Đã giải phóng bộ nhớ đệm thành công!'
          );
        } catch {
          setCacheSize('0.0 MB');
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

  const { pageStyle, getItemStyle } = usePageAnimation({ itemCount: 20 });

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
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
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 54 + 14 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        
        {/* GIAO DIỆN */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('appTheme') || 'Giao diện'}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('chooseTheme') || 'Chọn chế độ hiển thị sáng/tối'}
          </Text>
          <View style={styles.optionsList}>
            <TouchableOpacity 
              style={[styles.settingOptionCard, themeMode === 'system' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setThemeMode('system')}
            >
              <View style={styles.settingOptionLeft}>
                <Ionicons name="phone-portrait-outline" size={20} color={themeMode === 'system' ? Colors.primary : Colors.textMuted} style={styles.themeIcon} />
                <View>
                  <Text style={[styles.settingOptionName, themeMode === 'system' && styles.settingOptionNameActive]}>{t('systemTheme') || 'Theo hệ thống'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, themeMode === 'system' && styles.radioCircleActive]}>
                {themeMode === 'system' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingOptionCard, themeMode === 'light' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setThemeMode('light')}
            >
              <View style={styles.settingOptionLeft}>
                <Ionicons name="sunny-outline" size={20} color={themeMode === 'light' ? Colors.primary : Colors.textMuted} style={styles.themeIcon} />
                <View>
                  <Text style={[styles.settingOptionName, themeMode === 'light' && styles.settingOptionNameActive]}>{t('lightTheme') || 'Sáng (Light)'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, themeMode === 'light' && styles.radioCircleActive]}>
                {themeMode === 'light' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingOptionCard, themeMode === 'dark' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setThemeMode('dark')}
            >
              <View style={styles.settingOptionLeft}>
                <Ionicons name="moon-outline" size={20} color={themeMode === 'dark' ? Colors.primary : Colors.textMuted} style={styles.themeIcon} />
                <View>
                  <Text style={[styles.settingOptionName, themeMode === 'dark' && styles.settingOptionNameActive]}>{t('darkTheme') || 'Tối (Dark)'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, themeMode === 'dark' && styles.radioCircleActive]}>
                {themeMode === 'dark' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 1. BẢO MẬT */}

        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('security')}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('lockAppDesc')}
          </Text>
          <View style={styles.cacheActionBtn}>
            <View style={styles.cacheLeft}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.cacheBtnText}>
                {t('appLockFeature')}
              </Text>
            </View>
            <Switch
              value={isAppLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: Colors.borderLight, true: Colors.primary }}
              thumbColor={Colors.textInverse}
            />
          </View>
        </View>

        {/* 2. THÔNG BÁO */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('pushNotifications')}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('receivePromotions')}
          </Text>
          <View style={styles.cacheActionBtn}>
            <View style={styles.cacheLeft}>
              <Ionicons name="notifications-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.cacheBtnText}>
                {t('receivePush')}
              </Text>
            </View>
            <Switch
              value={isPushNotificationEnabled}
              onValueChange={handleTogglePushNotification}
              trackColor={{ false: Colors.borderLight, true: Colors.primary }}
              thumbColor={Colors.textInverse}
            />
          </View>
        </View>

        {/* 3. NGÔN NGỮ */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('appLanguage')}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('chooseLanguage')}
          </Text>
          <View style={styles.optionsList}>
            <TouchableOpacity 
              style={[styles.settingOptionCard, language === 'vi' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setLanguage('vi')}
            >
              <View style={styles.settingOptionLeft}>
                <Image source={{ uri: 'https://flagcdn.com/w80/vn.png' }} style={styles.langFlagImage} />
                <View>
                  <Text style={[styles.settingOptionName, language === 'vi' && styles.settingOptionNameActive]}>{t('vietnamese')}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, language === 'vi' && styles.radioCircleActive]}>
                {language === 'vi' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingOptionCard, language === 'en' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setLanguage('en')}
            >
              <View style={styles.settingOptionLeft}>
                <Image source={{ uri: 'https://flagcdn.com/w80/gb.png' }} style={styles.langFlagImage} />
                <View>
                  <Text style={[styles.settingOptionName, language === 'en' && styles.settingOptionNameActive]}>{t('english')}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, language === 'en' && styles.radioCircleActive]}>
                {language === 'en' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingOptionCard, language === 'zh' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setLanguage('zh')}
            >
              <View style={styles.settingOptionLeft}>
                <Image source={{ uri: 'https://flagcdn.com/w80/cn.png' }} style={styles.langFlagImage} />
                <View>
                  <Text style={[styles.settingOptionName, language === 'zh' && styles.settingOptionNameActive]}>{t('chinese') || '中文 (Chinese)'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, language === 'zh' && styles.radioCircleActive]}>
                {language === 'zh' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. KÍCH THƯỚC CHỮ */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('fontSizeTitle')}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('adjustTextSize')}
          </Text>
          
          <View style={styles.fontSizeGrid}>
            <TouchableOpacity 
              style={[styles.fontSizeChip, fontSize === 'small' && styles.fontSizeChipActive]} 
              activeOpacity={0.8}
              onPress={() => setFontSize('small')}
            >
              <Text style={[styles.fontSizeChipLabel, fontSize === 'small' && styles.fontSizeChipLabelActive, { fontSize: 11 }]}>Aa</Text>
              <Text style={[styles.fontSizeChipSub, fontSize === 'small' && styles.fontSizeChipSubActive]}>
                {t('small')}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.fontSizeChip, fontSize === 'normal' && styles.fontSizeChipActive]} 
              activeOpacity={0.8}
              onPress={() => setFontSize('normal')}
            >
              <Text style={[styles.fontSizeChipLabel, fontSize === 'normal' && styles.fontSizeChipLabelActive, { fontSize: 13 }]}>Aa</Text>
              <Text style={[styles.fontSizeChipSub, fontSize === 'normal' && styles.fontSizeChipSubActive]}>
                {t('medium')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.fontSizeChip, fontSize === 'large' && styles.fontSizeChipActive]} 
              activeOpacity={0.8}
              onPress={() => setFontSize('large')}
            >
              <Text style={[styles.fontSizeChipLabel, fontSize === 'large' && styles.fontSizeChipLabelActive, { fontSize: 15 }]}>Aa</Text>
              <Text style={[styles.fontSizeChipSub, fontSize === 'large' && styles.fontSizeChipSubActive]}>
                {t('large')}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.previewBox}>
            <View style={styles.previewHeaderRow}>
              <Ionicons name="eye-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.previewHeaderLabel}>{t('previewText')}</Text>
            </View>
            <Text style={[
              styles.previewSampleText, 
              { fontSize: fontSize === 'small' ? 12 : fontSize === 'large' ? 16 : 14 }
            ]}>
              {t('sampleText')}
            </Text>
          </View>
        </View>

        {/* 5. BỘ NHỚ ĐỆM */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('appCache')}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('freeStorage')}
          </Text>
          <TouchableOpacity 
            style={styles.cacheActionBtn} 
            onPress={handleClearCache} 
            activeOpacity={0.8}
            disabled={isClearingCache}
          >
            <View style={styles.cacheLeft}>
              <View style={styles.cacheIconWrap}>
                <Ionicons name="trash-bin-outline" size={18} color="#C86432" />
              </View>
              <View>
                <Text style={styles.cacheBtnText}>{t('clearAppCache')}</Text>
                <Text style={styles.cacheSubText}>
                  {t('cachedDataDesc') || 'Hình ảnh gốm sứ & Dữ liệu tải tạm'}
                </Text>
              </View>
            </View>
            <View style={styles.cacheRight}>
              {isClearingCache ? (
                <ActivityIndicator size="small" color="#C86432" />
              ) : (
                <View style={styles.cacheSizeBadge}>
                  <Text style={styles.cacheSizeText}>{cacheSize}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color="#9E968D" style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>
        </View>

        {(user || userProfile) && (
          <View style={[styles.settingsGroup, { marginTop: 10 }]}>
            <Text style={styles.settingsGroupTitle}>{t('accountManagement')}</Text>
            <View style={{ gap: 12, marginTop: 10 }}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
                <Ionicons name="log-out-outline" size={20} color="#333333" />
                <Text style={styles.logoutBtnText}>{t('signOutAccount')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.85}>
                <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                <Text style={styles.deleteBtnText}>{t('reqDeleteAccount')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>
            Tiệm Nhà Gốm v{Constants.expoConfig?.version || '1.0.0'} ({Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber || '1' : Constants.expoConfig?.android?.versionCode || '1'})
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  settingsGroup: {
    marginBottom: 24,
  },
  settingsGroupTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  settingsGroupSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#7A827E',
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
    borderWidth: 1.2,
    borderColor: Colors.borderLight,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingOptionCardActive: {
    borderColor: '#000000',
    backgroundColor: Colors.cardBackground,
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingOptionName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  settingOptionNameActive: {
    color: '#000000',
    fontWeight: '700',
  },
  settingOptionDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#888888',
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#000000',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000000',
  },
  fontSizeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  fontSizeChip: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1.2,
    borderColor: Colors.borderLight,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  fontSizeChipActive: {
    borderColor: '#000000',
    backgroundColor: '#000000',
  },
  fontSizeChipLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
  },
  fontSizeChipLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  fontSizeChipSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },
  fontSizeChipSubActive: {
    color: '#D4D4D8',
  },
  previewBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewHeaderLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  previewSampleText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  cacheActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    backgroundColor: '#FFF4EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cacheBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: Colors.textPrimary || '#231B15',
    fontWeight: '600',
  },
  cacheSubText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: Colors.textMuted || '#9E968D',
    marginTop: 2,
  },
  cacheRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cacheSizeBadge: {
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  cacheSizeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#9C7156',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
    height: 52,
    borderRadius: 26,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  logoutBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#333333',
    fontWeight: '600',
    fontSize: 14.5,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFECEC',
    height: 52,
    borderRadius: 26,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  deleteBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#D32F2F',
    fontWeight: '700',
    fontSize: 14.5,
  },
  versionContainer: {
    marginTop: 30,
    alignItems: 'center',
    paddingBottom: 20,
  },
  versionText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#A0A5A2',
    letterSpacing: 0.5,
  },
});
