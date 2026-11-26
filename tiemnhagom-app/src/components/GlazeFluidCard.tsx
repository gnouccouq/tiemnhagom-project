import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface GlazeFluidCardProps {
  gradientColors: [string, string, ...string[]];
  blobs?: string[];
  borderRadius?: number;
  style?: any;
  children?: React.ReactNode;
}

/**
 * GlazeFluidCard - Hiệu ứng Ánh Men Gốm Lụa (Subtle Ceramic Glaze Shimmer & Ambient Sheen)
 * Ánh sáng lụa mảnh lướt chậm qua bề mặt thẻ kết hợp quầng sáng ấm thở nhẹ,
 * tạo chiều sâu sang trọng như lớp men gốm thủ công dưới ánh đèn.
 */
export const GlazeFluidCard: React.FC<GlazeFluidCardProps> = ({
  gradientColors,
  borderRadius = 24,
  style,
  children,
}) => {
  const sheenAnim = useRef(new Animated.Value(0)).current;
  const ambientAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Dải ánh sáng lụa lướt chéo chậm rãi qua mặt thẻ
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheenAnim, {
          toValue: 1,
          duration: 3800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(sheenAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    // 2. Quầng sáng men ấm thở nhẹ nhàng ở góc trên
    const ambientLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientAnim, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ambientAnim, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    sheenLoop.start();
    ambientLoop.start();

    return () => {
      sheenLoop.stop();
      ambientLoop.stop();
    };
  }, [sheenAnim, ambientAnim]);

  const sheenTranslateX = sheenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-280, 460],
  });

  const ambientOpacity = ambientAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  return (
    <View style={[styles.container, { borderRadius }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]} pointerEvents="none">
        {/* 1. Nền Gradient men gốm theo hạng */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* 2. Quầng sáng ấm thở nhẹ (không viền cứng) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: ambientOpacity }]}>
          <LinearGradient
            colors={[
              'rgba(255, 240, 222, 0.16)',
              'rgba(255, 240, 222, 0.04)',
              'rgba(0, 0, 0, 0.18)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.9, y: 0 }}
            end={{ x: 0.1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* 3. Dải ánh sáng lụa lướt chéo tinh tế */}
        <Animated.View
          style={[
            styles.sheenStrip,
            {
              transform: [{ translateX: sheenTranslateX }, { rotate: '22deg' }],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255, 248, 240, 0)',
              'rgba(255, 248, 240, 0.05)',
              'rgba(255, 248, 240, 0.14)',
              'rgba(255, 248, 240, 0.05)',
              'rgba(255, 248, 240, 0)',
            ]}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* 4. Lớp phủ chiều sâu & ánh cạnh trên nhẹ */}
        <LinearGradient
          colors={[
            'rgba(255, 255, 255, 0.10)',
            'rgba(0, 0, 0, 0.02)',
            'rgba(0, 0, 0, 0.28)',
          ]}
          locations={[0, 0.35, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  sheenStrip: {
    position: 'absolute',
    top: -80,
    bottom: -80,
    left: 0,
    width: 170,
  },
});
