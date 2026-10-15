import React from 'react';
import { StyleSheet, View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeColor } from '../constants/theme';

export interface LiquidGlassProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  interactive?: boolean;
}

let NativeLiquidGlassView: any = null;
let isLiquidGlassSupportedFn: any = null;
try {
  const liquidModule = require('react-native-liquid-glassmorphism');
  NativeLiquidGlassView = liquidModule.LiquidGlassView;
  isLiquidGlassSupportedFn = liquidModule.isLiquidGlassSupported;
} catch {
  // Graceful fallback nếu chưa có native module
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  style,
  children,
  interactive = false,
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';

  // Dynamic System Materials chuẩn Apple iOS:
  // systemUltraThinMaterial là chất liệu kính mỏng nhất, trong suốt nhất của Apple
  const blurTint = Platform.OS === 'ios'
    ? (isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight')
    : (isDark ? 'dark' : 'light');

  const canUseLiquidGlass = typeof isLiquidGlassSupportedFn === 'function' ? isLiquidGlassSupportedFn() : false;

  return (
    <View style={[styles.inner, isDark ? styles.innerDark : styles.innerLight, style]}>
      {canUseLiquidGlass && NativeLiquidGlassView ? (
        <NativeLiquidGlassView
          style={StyleSheet.absoluteFill}
          variant="clear"
          intensity={35}
          interactive={interactive}
          rim={true}
          specular={true}
        />
      ) : (
        <BlurView
          intensity={Platform.OS === 'ios' ? 45 : 35}
          tint={blurTint as any}
          blurMethod="none"
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Lớp phản chiếu ánh sáng bề mặt (Specular Light Highlight) mỏng nhẹ, giữ độ trong suốt cao */}
      <View
        style={[StyleSheet.absoluteFill, isDark ? styles.glassOverlayDark : styles.glassOverlayLight]}
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
  glassOverlayLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  glassOverlayDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.015)',
  },
});
