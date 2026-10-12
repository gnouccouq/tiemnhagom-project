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
 * GlazeFluidCard - Hiệu ứng Màu nước Loang Động Dạng Tròn (Circular Fluid Watercolor Blobs)
 * Các đốm tròn màu nước chuyển động hữu cơ, trôi chậm và co giãn theo nhịp thở,
 * hòa tan mềm mại vào nhau dưới lớp men hòa sắc.
 */
export const GlazeFluidCard: React.FC<GlazeFluidCardProps> = ({
  gradientColors,
  blobs = ['#DC2626', '#D97706', '#E11D48', '#991B1B'],
  borderRadius = 20,
  style,
  children,
}) => {
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Đốm tròn 1: Dao động chậm nhịp thở 6s
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(anim1, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim1, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // 2. Đốm tròn 2: Dao động lệch pha 7.5s tạo dòng chảy hữu cơ
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(anim2, {
          toValue: 1,
          duration: 7500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim2, {
          toValue: 0,
          duration: 7500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // 3. Đốm tròn 3: Dao động nhịp thở trung tâm 6.8s
    const loop3 = Animated.loop(
      Animated.sequence([
        Animated.timing(anim3, {
          toValue: 1,
          duration: 6800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim3, {
          toValue: 0,
          duration: 6800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop1.start();
    loop2.start();
    loop3.start();

    return () => {
      loop1.stop();
      loop2.stop();
      loop3.stop();
    };
  }, [anim1, anim2, anim3]);

  // Quỹ đạo đốm tròn 1
  const blob1TranslateX = anim1.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 40],
  });
  const blob1TranslateY = anim1.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 25],
  });
  const blob1Scale = anim1.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.95, 1.35, 0.95],
  });

  // Quỹ đạo đốm tròn 2
  const blob2TranslateX = anim2.interpolate({
    inputRange: [0, 1],
    outputRange: [40, -35],
  });
  const blob2TranslateY = anim2.interpolate({
    inputRange: [0, 1],
    outputRange: [25, -20],
  });
  const blob2Scale = anim2.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1.3, 0.9, 1.3],
  });

  // Quỹ đạo đốm tròn 3
  const blob3TranslateX = anim3.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 30],
  });
  const blob3TranslateY = anim3.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 25],
  });
  const blob3Scale = anim3.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.9, 1.3, 0.9],
  });

  return (
    <View style={[styles.container, { borderRadius }, style]}>
      {/* Khối nền loang màu nước tròn - không chặn tương tác chạm */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* 1. Nền Gradient tĩnh gốc */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* 2. Đốm tròn màu nước 1 */}
        <Animated.View
          style={[
            styles.circleBlob,
            {
              backgroundColor: blobs[0] || '#DC2626',
              top: -40,
              left: -35,
              transform: [
                { translateX: blob1TranslateX },
                { translateY: blob1TranslateY },
                { scale: blob1Scale },
              ],
            },
          ]}
        />

        {/* 3. Đốm tròn màu nước 2 */}
        <Animated.View
          style={[
            styles.circleBlob,
            styles.circleBlobSecondary,
            {
              backgroundColor: blobs[1] || '#D97706',
              bottom: -45,
              right: -35,
              transform: [
                { translateX: blob2TranslateX },
                { translateY: blob2TranslateY },
                { scale: blob2Scale },
              ],
            },
          ]}
        />

        {/* 4. Đốm tròn màu nước 3 */}
        <Animated.View
          style={[
            styles.circleBlob,
            styles.circleBlobTertiary,
            {
              backgroundColor: blobs[2] || '#E11D48',
              top: '25%',
              left: '30%',
              transform: [
                { translateX: blob3TranslateX },
                { translateY: blob3TranslateY },
                { scale: blob3Scale },
              ],
            },
          ]}
        />

        {/* 5. Lớp màng mờ hòa sắc tự nhiên */}
        <LinearGradient
          colors={[
            'rgba(255, 255, 255, 0.12)',
            'rgba(0, 0, 0, 0.12)',
            'rgba(0, 0, 0, 0.30)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Nội dung bên trong được render trực tiếp */}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  circleBlob: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.62,
  },
  circleBlobSecondary: {
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.55,
  },
  circleBlobTertiary: {
    width: 140,
    height: 140,
    borderRadius: 70,
    opacity: 0.45,
  },
});
