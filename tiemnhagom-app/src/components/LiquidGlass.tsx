import React from 'react';
import {
  StyleSheet,
  View,
  Platform,
  StyleProp,
  ViewStyle,
  useColorScheme,
} from 'react-native';
import { BlurView } from 'expo-blur';

// Tải an toàn thư viện expo-glass-effect (SDK chính thức của Expo cho Apple Liquid Glass)
let ExpoGlassView: any = null;
let isExpoGlassAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const GlassEffect = require('expo-glass-effect');
  if (GlassEffect) {
    if (GlassEffect.GlassView) ExpoGlassView = GlassEffect.GlassView;
    if (typeof GlassEffect.isLiquidGlassAvailable === 'function') {
      isExpoGlassAvailable = GlassEffect.isLiquidGlassAvailable();
    }
  }
} catch {
  ExpoGlassView = null;
  isExpoGlassAvailable = false;
}

// Tải an toàn thư viện @callstack/liquid-glass
let NativeLiquidGlassView: any = View;
let NativeLiquidGlassContainerView: any = View;
let nativeSupported = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LG = require('@callstack/liquid-glass');
  if (LG) {
    if (LG.LiquidGlassView) NativeLiquidGlassView = LG.LiquidGlassView;
    if (LG.LiquidGlassContainerView) NativeLiquidGlassContainerView = LG.LiquidGlassContainerView;
    if (typeof LG.isLiquidGlassSupported === 'boolean') {
      nativeSupported = LG.isLiquidGlassSupported;
    }
  }
} catch {
  NativeLiquidGlassView = View;
  NativeLiquidGlassContainerView = View;
  nativeSupported = false;
}

export const LiquidGlassView = NativeLiquidGlassView;
export const LiquidGlassContainerView = NativeLiquidGlassContainerView;
export const isLiquidGlassSupported = nativeSupported || isExpoGlassAvailable;

export interface LiquidGlassProps extends React.ComponentProps<typeof View> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  interactive?: boolean;
  effect?: 'clear' | 'regular' | 'none';
  isDark?: boolean;
  /** Độ mờ quang học BlurView (mặc định 45 trên iOS, 32 trên Android/Web) */
  intensity?: number;
  disableRim?: boolean;
  disableGloss?: boolean;
}

/**
 * Khối kính lỏng Apple Liquid Glass chuẩn hệ thống:
 * 1. Nếu hệ thống iOS hỗ trợ Liquid Glass gốc -> RENDER TRỰC TIẾP native UIKit GlassView của Apple!
 * 2. Nếu môi trường chưa hỗ trợ native -> Fallback về BlurView quang học mờ tự nhiên (tuyệt đối không vẽ gradient giả kính).
 */
export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  style,
  children,
  interactive = false,
  effect = 'regular',
  isDark: customIsDark,
  intensity,
  disableRim = false,
  disableGloss = false,
  ...rest
}) => {
  const colorScheme = useColorScheme();
  const isDark = customIsDark !== undefined ? customIsDark : colorScheme === 'dark';

  // 1. ƯU TIÊN HÀNG ĐẦU: Dùng trực tiếp component Kính Lỏng gốc của Apple trên iOS
  if (isExpoGlassAvailable && ExpoGlassView) {
    return (
      <ExpoGlassView
        glassEffectStyle={effect === 'clear' ? 'clear' : 'regular'}
        isInteractive={interactive}
        colorScheme={isDark ? 'dark' : 'light'}
        style={style}
        {...rest}
      >
        {children}
      </ExpoGlassView>
    );
  }

  if (nativeSupported && NativeLiquidGlassView && NativeLiquidGlassView !== View) {
    return (
      <NativeLiquidGlassView
        effect={effect}
        interactive={interactive}
        style={style}
        {...rest}
      >
        {children}
      </NativeLiquidGlassView>
    );
  }

  // 2. FALLBACK TỰ NHIÊN: Frosted Glass mờ quang học thuần khiết (không vẽ viền gradient/gloss giả)
  const flatStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;

  const {
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    position,
    top,
    bottom,
    left,
    right,
    zIndex,
    flex,
    alignSelf,
    borderRadius: rawBorderRadius,
    backgroundColor: _ignoredBg,
    borderWidth: _ignoredBorderWidth,
    borderColor: _ignoredBorderColor,
    shadowColor: customShadowColor,
    shadowOffset: customShadowOffset,
    shadowOpacity: customShadowOpacity,
    shadowRadius: customShadowRadius,
    elevation: customElevation,
    ...innerContentStyle
  } = flatStyle;

  const borderRadius =
    typeof rawBorderRadius === 'number'
      ? rawBorderRadius
      : typeof height === 'number'
        ? height / 2
        : typeof width === 'number'
          ? width / 2
          : 20;

  const blurIntensity = intensity !== undefined ? intensity : Platform.OS === 'ios' ? 45 : 32;

  const isSelfSized =
    height !== undefined ||
    width !== undefined ||
    flex !== undefined ||
    minHeight !== undefined ||
    minWidth !== undefined;

  return (
    <View
      style={[
        styles.outerContainer,
        {
          width,
          height,
          minWidth,
          minHeight,
          maxWidth,
          maxHeight,
          margin,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight,
          marginHorizontal,
          marginVertical,
          position,
          top,
          bottom,
          left,
          right,
          zIndex,
          flex,
          alignSelf,
          borderRadius,
          shadowColor: customShadowColor || (isDark ? '#000000' : '#2B2928'),
          shadowOffset: customShadowOffset || { width: 0, height: 2 },
          shadowOpacity:
            customShadowOpacity !== undefined ? customShadowOpacity : isDark ? 0.35 : 0.08,
          shadowRadius: customShadowRadius || 6,
          elevation: customElevation !== undefined ? customElevation : 3,
        },
      ]}
      {...rest}
    >
      <View
        style={[
          styles.liquidBody,
          isSelfSized && styles.flexFill,
          {
            borderRadius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.85)',
          },
          innerContentStyle,
        ]}
      >
        {/* Thấu kính mờ quang học tự nhiên chuẩn iOS */}
        <BlurView
          intensity={blurIntensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* Lớp màu men gốm bán trong suốt tiệp màu nền */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? 'rgba(30, 30, 30, 0.45)'
                : 'rgba(255, 255, 255, 0.65)',
            },
          ]}
        />

        {/* Nội dung bên trong (Icon / Text) */}
        {children}
      </View>
    </View>
  );
};

export default LiquidGlass;

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: 'transparent',
  },
  liquidBody: {
    overflow: 'hidden',
    position: 'relative',
  },
  flexFill: {
    flex: 1,
  },
});
