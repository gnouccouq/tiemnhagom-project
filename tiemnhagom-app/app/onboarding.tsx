// app/onboarding.tsx
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useSettings } from '../src/context/SettingsContext';

const { width, height } = Dimensions.get('window');
export default function OnboardingScreen() {
  const { t } = useSettings();
  const router = useRouter();

  const SLIDES = [
    {
      id: '1',
      title: t('onboardingTitle1'),
      description: t('onboardingDesc1'),
      image: require('../assets/images/tiemnhagom_background.png'),
    },
    {
      id: '2',
      title: t('onboardingTitle2'),
      description: t('onboardingDesc2'),
      image: require('../assets/images/about-story.jpg'),
    },
    {
      id: '3',
      title: t('onboardingTitle4'),
      description: t('onboardingDesc4'),
      image: require('../assets/images/hoa-nha-gom.webp'),
    },
    {
      id: '4',
      title: t('onboardingTitle5'),
      description: t('onboardingDesc5'),
      image: require('../assets/images/decor-su-kien.jpg'),
    },
    {
      id: '5',
      title: t('onboardingTitle3'),
      description: t('onboardingDesc3'),
      image: require('../assets/images/tiemnhagom.png'),
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleSkip = () => {
    router.replace('/setup-preferences');
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleSkip();
    }
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={onScroll}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });
          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [40, 0, -40],
            extrapolate: 'clamp',
          });

          return (
            <View style={{ width, height }}>
              <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.overlay} />
              <LinearGradient
                colors={['transparent', 'rgba(0, 0, 0, 0.6)', 'rgba(0, 0, 0, 0.95)']}
                locations={[0, 0.5, 1]}
                style={styles.bottomGradient}
                pointerEvents="none"
              />
              <SafeAreaView style={styles.safeArea}>
                <Animated.View style={[styles.content, { opacity, transform: [{ translateY }] }]}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                </Animated.View>
              </SafeAreaView>
            </View>
          );
        }}
      />

      <SafeAreaView style={styles.footerContainer} pointerEvents="box-none">
        <View style={styles.footer}>
          <View style={styles.pagination}>
            {SLIDES.map((_, index) => {
              const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
              const dotWidth = scrollX.interpolate({
                inputRange,
                outputRange: [8, 20, 8],
                extrapolate: 'clamp',
              });
              const opacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.4, 1, 0.4],
                extrapolate: 'clamp',
              });
              return <Animated.View key={index} style={[styles.dot, { width: dotWidth, opacity }]} />;
            })}
          </View>

          <View style={styles.buttonContainer}>
            {currentIndex < SLIDES.length - 1 ? (
              <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                <Text style={styles.skipText}>{t('skip')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} /> 
            )}
            <TouchableOpacity onPress={handleNext} style={styles.nextButton} activeOpacity={0.8}>
              <Text style={styles.nextText}>
                {currentIndex === SLIDES.length - 1 ? t('onboardingStart') : t('next')}
              </Text>
              {currentIndex === SLIDES.length - 1 && (
                <Ionicons name="arrow-forward" size={18} color="#111" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5 },
  safeArea: { flex: 1, justifyContent: 'flex-end' },
  content: { paddingHorizontal: 24, paddingBottom: 100 },
  title: { fontFamily: 'ElleGaborStd', fontSize: 36, fontWeight: '700', color: '#FFFFFF', marginBottom: 12, letterSpacing: 0.5 },
  description: { fontSize: 16, color: '#E0E0E0', lineHeight: 24, paddingRight: 20 },
  footerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 24 },
  pagination: { flexDirection: 'row', alignItems: 'center' },
  dot: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', marginRight: 6 },
  buttonContainer: { flexDirection: 'row', alignItems: 'center' },
  skipButton: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 8 },
  skipText: { color: '#CCCCCC', fontSize: 15, fontWeight: '600' },
  nextButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  nextText: { color: '#111111', fontSize: 16, fontWeight: '700' },
});
