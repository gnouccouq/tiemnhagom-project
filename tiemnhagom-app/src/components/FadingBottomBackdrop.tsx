import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '../constants/theme';

interface FadingBottomBackdropProps {
  height?: number;
  rgbColor?: string; // Ví dụ: '250, 248, 245' hoặc '0, 0, 0'
  zIndex?: number;
}

/**
 * Lớp phủ LinearGradient mờ dần từ trên xuống dưới ở đáy màn hình chuẩn GEMINI.md
 * Đặt bên dưới các nút hành động fixed/floating ở đáy (Bottom CTA buttons)
 * để tạo hiệu ứng fade-in mượt mà, giúp nội dung cuộn mờ dần phía sau các nút.
 */
export const FadingBottomBackdrop: React.FC<FadingBottomBackdropProps> = ({
  height,
  rgbColor,
  zIndex = 40,
}) => {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';

  // Chiều cao chuẩn: khoảng đệm đáy + chiều cao nút (52px) + 36px vùng mờ phía trên nút
  const defaultHeight = Math.max(insets.bottom, 14) + 52 + 36;
  const targetHeight = height || defaultHeight;

  // Sử dụng màu nền Canvas chuẩn của hệ thống (#FAF8F5 ở Light / #000000 ở Dark)
  const baseRgb = rgbColor || (isDark ? '0, 0, 0' : '250, 248, 245');

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[
        styles.container,
        {
          height: targetHeight,
          zIndex,
        },
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={[
          `rgba(${baseRgb}, 0)`,
          `rgba(${baseRgb}, 0.35)`,
          `rgba(${baseRgb}, 0.72)`,
          `rgba(${baseRgb}, 0.90)`,
          `rgba(${baseRgb}, 0.98)`,
        ]}
        locations={[0, 0.28, 0.58, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

export default FadingBottomBackdrop;
