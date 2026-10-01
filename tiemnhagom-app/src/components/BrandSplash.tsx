// src/components/BrandSplash.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, StatusBar, Platform } from 'react-native';
import { Image } from 'expo-image';

interface BrandSplashProps {
  onFinish: () => void;
}

const { width } = Dimensions.get('window');
const LOGO_SIZE = Math.min(width * 0.72, 280);

export const BrandSplash: React.FC<BrandSplashProps> = ({ onFinish }) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Hiển thị logo 1.8s sau khi app nạp xong, sau đó fade out mượt mà vào trang chủ
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 1800);

    return () => clearTimeout(timer);
  }, [fadeAnim, onFinish]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#9C7156" translucent />
      <View style={styles.logoWrap}>
        <Image
          source={require('../../assets/images/LOGO.jpg')}
          style={styles.logoImage}
          contentFit="contain"
          priority="high"
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#9C7156',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});
