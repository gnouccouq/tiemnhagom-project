import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Switch,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Header } from '../src/components/Header';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import * as LocalAuthentication from 'expo-local-authentication';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  
  const { 
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
  
  const handleToggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
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
      Alert.alert(
        t('notificationEnabled'),
        t('receiveOffers')
      );
    } else {
      Alert.alert(
        t('notificationDisabled'),
        t('pushDisabled')
      );
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      t('clearCacheTitle'),
      t('cacheCleared')
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      t('signOutTitle'),
      t('signOutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('signOutTitle'), style: 'destructive', onPress: async () => {
            await signOut();
            router.replace('/(tabs)/profile');
          } 
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccountTitle'),
      t('deleteAccountConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { 
          text: t('confirmDelete'), 
          style: 'destructive', 
          onPress: async () => {
            try {
              if (user && user.delete) {
                await user.delete();
              }
              await signOut();
              Alert.alert(
                t('success'), 
                t('accountDeleted')
              );
              router.replace('/(tabs)/profile');
            } catch (e: any) {
              if (e.code === 'auth/requires-recent-login') {
                Alert.alert(
                  t('authRequired'), 
                  t('reauthRequired')
                );
              } else {
                Alert.alert(t('error'), e.message || t('deleteAccountError'));
              }
            }
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <Header 
        title={t('settingsTitle')} 
        showBack={true} 
        showSearch={false} 
        showCart={false} 
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* 1. BẢO MẬT */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('security')}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('lockAppDesc')}
          </Text>
          <View style={styles.cacheActionBtn}>
            <View style={styles.cacheLeft}>
              <Ionicons name="lock-closed-outline" size={18} color="#2D3B34" />
              <Text style={styles.cacheBtnText}>
                {t('appLockFeature')}
              </Text>
            </View>
            <Switch
              value={isAppLockEnabled}
              onValueChange={handleToggleAppLock}
              trackColor={{ false: '#E1E8DF', true: '#3B4D45' }}
              thumbColor={'#FFFFFF'}
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
              <Ionicons name="notifications-outline" size={18} color="#2D3B34" />
              <Text style={styles.cacheBtnText}>
                {t('receivePush')}
              </Text>
            </View>
            <Switch
              value={isPushNotificationEnabled}
              onValueChange={handleTogglePushNotification}
              trackColor={{ false: '#E1E8DF', true: '#3B4D45' }}
              thumbColor={'#FFFFFF'}
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
              <Ionicons name="eye-outline" size={14} color="#5D6160" />
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
          <TouchableOpacity style={styles.cacheActionBtn} onPress={handleClearCache} activeOpacity={0.8}>
            <View style={styles.cacheLeft}>
              <Ionicons name="trash-bin-outline" size={18} color="#2D3B34" />
              <Text style={styles.cacheBtnText}>{t('clearAppCache')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7A827E" />
          </TouchableOpacity>
        </View>

        {user && (
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
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
    color: '#2D3B34',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingOptionCardActive: {
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
  },
  settingOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
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
    backgroundColor: '#EEF3EB',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E1E8DF',
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
    color: '#5D6160',
  },
  previewSampleText: {
    fontFamily: 'ElleGaborStd',
    color: '#2D3B34',
    lineHeight: 22,
  },
  cacheActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8DF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cacheLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cacheBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#333333',
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E1E8DF',
  },
  logoutBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#333333',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFECEC',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  deleteBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#D32F2F',
    fontWeight: '700',
    fontSize: 14,
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
