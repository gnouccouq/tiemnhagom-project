// app/onboarding.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useSettings } from '../src/context/SettingsContext';

export default function OnboardingScreen() {
  const { t } = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const STEPS = [
    {
      id: 'welcome',
      title: t('onboardingWelcomeTitle'),
      description: t('onboardingWelcomeDesc'),
      image: require('../assets/images/tiemnhagom_background.png'),
    },
    {
      id: 'discover',
      title: t('onboardingFeature1Title'),
      description: t('onboardingFeature1Desc'),
      image: require('../assets/images/about-story.jpg'),
    },
    {
      id: 'rewards',
      title: t('onboardingFeature2Title'),
      description: t('onboardingFeature2Desc'),
      image: require('../assets/images/hoa-nha-gom.webp'),
    },
    {
      id: 'gift',
      title: t('onboardingFeature3Title'),
      description: t('onboardingFeature3Desc'),
      image: require('../assets/images/decor-su-kien.jpg'),
    },
    {
      id: 'realtime',
      title: t('onboardingFeature4Title'),
      description: t('onboardingFeature4Desc'),
      image: require('../assets/images/tiemnhagom.png'),
    },
  ];

  const TOTAL_INTRO_STEPS = STEPS.length - 1;
  const [step, setStep] = useState<number>(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(18)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    translateYAnim.setValue(18);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();

    if (step > 0) {
      Animated.timing(progressAnim, {
        toValue: step / TOTAL_INTRO_STEPS,
        duration: 280,
        useNativeDriver: false,
      }).start();
    }
  }, [step, fadeAnim, translateYAnim, progressAnim, TOTAL_INTRO_STEPS]);

  const handleBack = () => {
    if (step > 0) {
      setStep((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (step < TOTAL_INTRO_STEPS) {
      setStep((prev) => prev + 1);
    } else {
      router.replace('/setup-preferences');
    }
  };

  const handleLogin = async () => {
    try {
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
    } catch {}
    router.replace('/auth/login');
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const current = STEPS[step];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ẢNH NỀN FULL MÀN HÌNH */}
      <Image
        source={current.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={280}
      />

      {/* LỚP PHỦ MỜ NHẸ PHÍA TRÊN ĐỂ THANH PROGRESS & STATUS BAR RÕ NÉT */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.58)', 'rgba(0, 0, 0, 0.18)', 'transparent']}
        locations={[0, 0.55, 1]}
        style={[styles.topGradient, { height: insets.top + 96 }]}
        pointerEvents="none"
      />

      {/* LỚP PHỦ FADE MỜ DẦN PHÍA DƯỚI CHO CỤM CHỮ & NÚT */}
      <LinearGradient
        colors={['transparent', 'rgba(16, 12, 10, 0.55)', 'rgba(12, 10, 8, 0.90)', 'rgba(10, 8, 7, 0.98)']}
        locations={[0, 0.32, 0.68, 1]}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* THANH PROGRESS + NÚT QUAY LẠI TRÊN CÙNG */}
      <View style={[styles.topArea, { paddingTop: insets.top + 12 }]}>
        {step > 0 && (
          <View style={styles.topProgressRow}>
            <TouchableOpacity
              style={styles.backIconBtn}
              activeOpacity={0.75}
              onPress={handleBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
          </View>
        )}
      </View>

      {/* CỤM CHỮ + NÚT BẤM PHÍA DƯỚI VỚI HIỆU ỨNG FADE-IN */}
      <Animated.View
        style={[
          styles.bottomArea,
          {
            paddingBottom: Math.max(insets.bottom, 22) + 12,
            opacity: fadeAnim,
            transform: [{ translateY: translateYAnim }],
          },
        ]}
      >
        <Text style={styles.headline}>{current.title}</Text>
        <Text style={styles.subtitle}>{current.description}</Text>

        <TouchableOpacity style={styles.startBtn} activeOpacity={0.86} onPress={handleNext}>
          <Text style={styles.startBtnText}>
            {step === 0
              ? (t('onboardingStart') || 'Bắt đầu')
              : step === TOTAL_INTRO_STEPS
              ? (t('continue') || 'Tiếp tục')
              : (t('next') || 'Tiếp')}
          </Text>
        </TouchableOpacity>

        {step === 0 && (
          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>{t('alreadyHaveAccountPrompt')}</Text>
            <TouchableOpacity
              onPress={handleLogin}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.loginLink}>{t('login') || 'Đăng nhập'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0B09',
    justifyContent: 'space-between',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    zIndex: 2,
  },
  topArea: {
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topProgressRow: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#E8CCB2',
  },
  bottomArea: {
    paddingHorizontal: 22,
    zIndex: 10,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 40,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.80)',
    marginTop: 10,
    marginBottom: 24,
    lineHeight: 22,
  },
  startBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#181615',
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  loginPrompt: {
    fontSize: 14.5,
    color: 'rgba(255, 255, 255, 0.72)',
  },
  loginLink: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#E8CCB2',
  },
});
