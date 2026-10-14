import React from 'react';
import { StyleSheet, View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { ScalePressable, ScalePressableProps } from './ScalePressable';
import { useThemeColor } from '../constants/theme';

export interface BlurButtonProps extends Omit<ScalePressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

let LiquidGlassView: any = null;
let isLiquidGlassSupported: any = null;
try {
  const liquidModule = require('react-native-liquid-glassmorphism');
  LiquidGlassView = liquidModule.LiquidGlassView;
  isLiquidGlassSupported = liquidModule.isLiquidGlassSupported;
} catch {
  // Graceful fallback nếu đang chạy môi trường chưa nạp native module
}

export const BlurButton: React.FC<BlurButtonProps> = ({
  style,
  containerStyle,
  children,
  ...rest
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  // Áp dụng trực tiếp Dynamic System Materials gốc của Apple trên iOS
  const blurTint = Platform.OS === 'ios'
    ? (isDark ? 'systemThinMaterialDark' : 'systemUltraThinMaterialLight')
    : (isDark ? 'dark' : 'light');

  const canUseLiquidGlass = typeof isLiquidGlassSupported === 'function' ? isLiquidGlassSupported() : false;

  return (
    <ScalePressable
      style={[styles.shadowContainer, containerStyle]}
      activeScale={0.90}
      {...rest}
    >
      <View style={[styles.inner, style]}>
        {canUseLiquidGlass && LiquidGlassView ? (
          <LiquidGlassView
            style={StyleSheet.absoluteFill}
            interactive={true}
            blurRadius={20}
            refraction={1.2}
          />
        ) : (
          <BlurView
            intensity={Platform.OS === 'ios' ? 100 : 75}
            tint={blurTint as any}
            blurMethod="none"
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Lớp phản chiếu ánh sáng bề mặt (Specular Light Highlight) chuẩn Apple Liquid Glass */}
        <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
        <View style={styles.content}>{children}</View>
      </View>
    </ScalePressable>
  );
};

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  shadowContainer: {
    backgroundColor: 'transparent',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0 : 0.08,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  inner: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Viền khúc xạ ánh sáng mỏng 0.5px siêu thực
    borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
    borderColor: isDark ? 'transparent' : 'rgba(255, 255, 255, 0.75)',
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.7)' : 'rgba(255, 255, 255, 0.35)',
  },
  glassOverlay: {
    backgroundColor: isDark 
      ? 'rgba(255, 255, 255, 0.03)'
      : (Platform.OS === 'ios' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.45)'),
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
