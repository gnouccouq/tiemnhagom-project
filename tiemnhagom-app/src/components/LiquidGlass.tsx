import React from 'react';
import { StyleSheet, View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '../constants/theme';

export interface LiquidGlassProps extends React.ComponentProps<typeof View> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  interactive?: boolean;
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  style,
  children,
  interactive = false,
  ...rest
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';

  const blurTint = Platform.OS === 'ios'
    ? (isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight')
    : (isDark ? 'dark' : 'light');

  return (
    <View style={[styles.inner, isDark ? styles.innerDark : styles.innerLight, style]} {...rest}>
      {/* 1. Lớp kính mờ quang học Frosted Glass siêu mỏng - độ trong suốt cao không bị đục */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 45 : 38}
        tint={blurTint as any}
        blurMethod="none"
        style={StyleSheet.absoluteFill}
      />
      {/* 2. Ánh phản quang đỉnh vòm kính (Top Specular Highlight) */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255, 255, 255, 0.24)', 'rgba(255, 255, 255, 0.05)', 'transparent']
            : ['rgba(255, 255, 255, 0.80)', 'rgba(255, 255, 255, 0.25)', 'transparent']
        }
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* 3. Ánh tán sắc đáy kính lỏng (Bottom Caustic Rim Reflection) tạo độ nảy khối thủy tinh lỏng */}
      <LinearGradient
        colors={
          isDark
            ? ['transparent', 'rgba(255, 255, 255, 0.06)']
            : ['transparent', 'rgba(255, 255, 255, 0.28)']
        }
        locations={[0.65, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  inner: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  innerLight: {
    borderColor: 'rgba(255, 255, 255, 0.75)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  innerDark: {
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
});
