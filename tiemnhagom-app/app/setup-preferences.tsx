// app/setup-preferences.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';

const TOTAL_STEPS = 5;

export default function SetupPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  const {
    t,
    language,
    setLanguage,
    fontSize,
    setFontSize,
    themeMode,
    setThemeMode,
  } = useSettings();

  // 1: Ngôn ngữ, 2: Kích thước chữ, 3: Giao diện, 4: Thông báo, 5: Vị trí
  const [step, setStep] = useState<number>(1);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();

    Animated.timing(progressAnim, {
      toValue: step / TOTAL_STEPS,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [step, fadeAnim, progressAnim]);

  const finishSetup = async () => {
    try {
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
    } catch {}
    router.replace('/auth/login');
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    } else {
      router.replace('/onboarding');
    }
  };

  const handleRequestNotifications = async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) {
        setStep(5);
        return;
      }
      if (current.canAskAgain) {
        await Notifications.requestPermissionsAsync();
        setStep(5);
        return;
      }
      // Đã tắt trong Cài đặt hệ thống (canAskAgain = false) -> mở thẳng Cài đặt máy
      await Linking.openSettings();
    } catch {}
    setStep(5);
  };

  const handleRequestLocation = async () => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.granted) {
        await finishSetup();
        return;
      }
      if (current.canAskAgain) {
        await Location.requestForegroundPermissionsAsync();
        await finishSetup();
        return;
      }
      // Đã tắt trong Cài đặt hệ thống (canAskAgain = false) -> mở thẳng Cài đặt máy
      await Linking.openSettings();
    } catch {}
    await finishSetup();
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const renderStep = () => {
    // BƯỚC 1: NGÔN NGỮ
    if (step === 1) {
      const langs = [
        { id: 'vi' as const, label: 'Tiếng Việt', flag: 'https://flagcdn.com/w80/vn.png' },
        { id: 'en' as const, label: 'English', flag: 'https://flagcdn.com/w80/gb.png' },
        { id: 'zh' as const, label: '中文 (Chinese)', flag: 'https://flagcdn.com/w80/cn.png' },
      ];
      return (
        <>
          <View style={styles.centerArea}>
            <View style={styles.groupCard}>
              {langs.map((item, idx) => {
                const active = language === item.id;
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <View style={styles.rowDivider} />}
                    <TouchableOpacity
                      style={styles.optionRow}
                      activeOpacity={0.7}
                      onPress={() => setLanguage(item.id)}
                    >
                      <Image source={{ uri: item.flag }} style={styles.flagCircle} contentFit="cover" />
                      <Text style={styles.optionTitle}>{item.label}</Text>
                      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                        {active && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          <View style={styles.bottomArea}>
            <Text style={styles.headline}>{t('chooseLanguageTitle') || 'Chọn ngôn ngữ'}</Text>
            <Text style={styles.subtitle}>
              {t('chooseLanguageSubtitle') || 'Bạn có thể thay đổi lại bất cứ lúc nào trong phần Cài đặt.'}
            </Text>
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.86} onPress={() => setStep(2)}>
              <Text style={styles.primaryBtnText}>{t('continue') || 'Tiếp tục'}</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    // BƯỚC 2: KÍCH THƯỚC CHỮ
    if (step === 2) {
      const sizes = [
        { id: 'small' as const, label: t('small') || 'Nhỏ', sz: 13 },
        { id: 'normal' as const, label: t('medium') || 'Vừa', sz: 16 },
        { id: 'large' as const, label: t('large') || 'Lớn', sz: 19 },
      ];
      const previewSz = fontSize === 'small' ? 12.5 : fontSize === 'large' ? 16.5 : 14.5;
      return (
        <>
          <View style={styles.centerArea}>
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Xem trước</Text>
              <Text style={[styles.previewSample, { fontSize: previewSz, lineHeight: previewSz * 1.5 }]}>
                {t('sampleText') || 'Gốm thủ công tinh tế mang hơi ấm thiên nhiên vào không gian sống.'}
              </Text>
            </View>

            <View style={[styles.groupCard, { marginTop: 14 }]}>
              {sizes.map((item, idx) => {
                const active = fontSize === item.id;
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <View style={styles.rowDivider} />}
                    <TouchableOpacity
                      style={styles.optionRow}
                      activeOpacity={0.7}
                      onPress={() => setFontSize(item.id)}
                    >
                      <View style={[styles.iconBadge, { backgroundColor: isDark ? '#2F2A26' : '#EDE5DC' }]}>
                        <Text style={[styles.aaText, { fontSize: item.sz }]}>Aa</Text>
                      </View>
                      <Text style={styles.optionTitle}>{item.label}</Text>
                      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                        {active && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          <View style={styles.bottomArea}>
            <Text style={styles.headline}>{t('chooseFontSizeTitle')}</Text>
            <Text style={styles.subtitle}>{t('setupFontDesc')}</Text>
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.86} onPress={() => setStep(3)}>
              <Text style={styles.primaryBtnText}>{t('continue') || 'Tiếp tục'}</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    // BƯỚC 3: GIAO DIỆN SÁNG / TỐI
    if (step === 3) {
      const themes = [
        {
          id: 'system' as const,
          label: t('systemTheme') || 'Theo hệ thống',
          icon: 'phone-portrait' as const,
          bg: isDark ? '#33281D' : '#F4E4CE',
          color: isDark ? '#E8CCB2' : '#7C5332',
        },
        {
          id: 'light' as const,
          label: t('lightTheme') || 'Sáng (Light)',
          icon: 'sunny' as const,
          bg: isDark ? '#352B1E' : '#F5E4C4',
          color: isDark ? '#F0D095' : '#96681B',
        },
        {
          id: 'dark' as const,
          label: t('darkTheme') || 'Tối (Dark)',
          icon: 'moon' as const,
          bg: isDark ? '#2D2A27' : '#EAE4DC',
          color: isDark ? '#D5CBC0' : '#5E554C',
        },
      ];
      return (
        <>
          <View style={styles.centerArea}>
            <View style={styles.groupCard}>
              {themes.map((item, idx) => {
                const active = themeMode === item.id;
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <View style={styles.rowDivider} />}
                    <TouchableOpacity
                      style={styles.optionRow}
                      activeOpacity={0.7}
                      onPress={() => setThemeMode(item.id)}
                    >
                      <View style={[styles.iconBadge, { backgroundColor: item.bg }]}>
                        <Ionicons name={item.icon} size={19} color={item.color} />
                      </View>
                      <Text style={styles.optionTitle}>{item.label}</Text>
                      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                        {active && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          <View style={styles.bottomArea}>
            <Text style={styles.headline}>{t('appTheme') || 'Giao diện ứng dụng'}</Text>
            <Text style={styles.subtitle}>
              {t('chooseTheme') || 'Chọn chế độ hiển thị sáng, tối hoặc tự động theo thiết bị.'}
            </Text>
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.86} onPress={() => setStep(4)}>
              <Text style={styles.primaryBtnText}>{t('continue') || 'Tiếp tục'}</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    // BƯỚC 4: CẤP QUYỀN THÔNG BÁO
    if (step === 4) {
      return (
        <>
          <View style={styles.centerArea}>
            <View style={[styles.heroPermissionCircle, { backgroundColor: isDark ? '#382522' : '#F6DDD7' }]}>
              <Ionicons name="notifications" size={46} color={isDark ? '#EEA898' : '#B5482B'} />
            </View>
          </View>

          <View style={styles.bottomArea}>
            <Text style={styles.headline}>{t('setupNotifTitle')}</Text>
            <Text style={styles.subtitle}>{t('setupNotifDesc')}</Text>
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.86} onPress={handleRequestNotifications}>
              <Text style={styles.primaryBtnText}>{t('continue') || 'Tiếp tục'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipLinkBtn} activeOpacity={0.7} onPress={() => setStep(5)}>
              <Text style={styles.skipNoteText}>{t('setupNotifSkip')}</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    // BƯỚC 5: CẤP QUYỀN VỊ TRÍ
    return (
      <>
        <View style={styles.centerArea}>
          <View style={[styles.heroPermissionCircle, { backgroundColor: isDark ? '#33281D' : '#F4E4CE' }]}>
            <Ionicons name="location" size={46} color={isDark ? '#E8CCB2' : '#7C5332'} />
          </View>
        </View>

        <View style={styles.bottomArea}>
          <Text style={styles.headline}>{t('setupLocationTitle')}</Text>
          <Text style={styles.subtitle}>{t('setupLocationDesc')}</Text>
          <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.86} onPress={handleRequestLocation}>
            <Text style={styles.primaryBtnText}>{t('continue') || 'Tiếp tục'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipLinkBtn} activeOpacity={0.7} onPress={finishSetup}>
            <Text style={styles.skipNoteText}>{t('setupLocationSkip')}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 20) + 12,
        },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* THANH PROGRESS + NÚT QUAY LẠI */}
      <View style={styles.topProgressRow}>
        <TouchableOpacity
          style={styles.backIconBtn}
          activeOpacity={0.7}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={Colors.textPrimary || (isDark ? '#F5F5F5' : '#181615')}
          />
        </TouchableOpacity>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>

      <Animated.View style={{ flex: 1, justifyContent: 'space-between', opacity: fadeAnim }}>
        {renderStep()}
      </Animated.View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#000000' : '#FAF8F5'),
      paddingHorizontal: 22,
    },
    topProgressRow: {
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 8,
    },
    backIconBtn: {
      width: 34,
      height: 34,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    progressTrack: {
      flex: 1,
      height: 4.5,
      borderRadius: 3,
      backgroundColor: isDark ? '#2A2724' : '#E6E0D8',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: '#9C7156',
    },
    centerArea: {
      flex: 1,
      justifyContent: 'center',
    },
    heroPermissionCircle: {
      width: 112,
      height: 112,
      borderRadius: 56,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 16,
      gap: 14,
    },
    flagCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
    },
    iconBadge: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aaText: {
      fontWeight: '800',
      color: isDark ? '#E8CCB2' : '#7C5332',
    },
    optionTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#181615'),
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 18,
    },
    radioOuter: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: isDark ? '#524D48' : '#C8C1B8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterActive: {
      borderColor: '#9C7156',
    },
    radioInner: {
      width: 11,
      height: 11,
      borderRadius: 5.5,
      backgroundColor: '#9C7156',
    },
    previewBox: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    previewLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: '#9C7156',
      marginBottom: 6,
    },
    previewSample: {
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#181615'),
    },
    bottomArea: {
      paddingTop: 12,
    },
    headline: {
      fontSize: 30,
      fontWeight: '800',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#181615'),
      lineHeight: 38,
      letterSpacing: -0.6,
    },
    subtitle: {
      fontSize: 15,
      color: Colors.textMuted || '#6E665D',
      marginTop: 10,
      marginBottom: 24,
      lineHeight: 22,
    },
    primaryBtn: {
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? '#9C7156' : '#181615',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      fontSize: 16.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    skipLinkBtn: {
      marginTop: 14,
      alignItems: 'center',
      paddingVertical: 4,
    },
    skipNoteText: {
      fontSize: 13.5,
      color: Colors.textMuted || '#7D756C',
      textAlign: 'center',
    },
  });
