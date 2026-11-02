import React from 'react';
import {
  StyleSheet,
  View,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeColor, checkIsDark } from '../constants/theme';

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
 * 1. Trên iOS: Dùng trực tiếp component Kính Lỏng gốc UIKit GlassView của Apple (nếu có) hoặc fallback BlurView quang học tự nhiên.
 * 2. Trên Android: Dùng một View duy nhất với nền kính mờ bán trong suốt (Liquid Frosted Glass),
 *    tuyệt đối KHÔNG lồng View con absoluteFill + overflow: 'hidden' vì RenderNode clipping trên phần cứng Android (HWUI)
 *    sẽ xén góc thành hình bát giác (8-sided polygon/octagon)!
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
  const Colors = useThemeColor();
  const themeIsDark = checkIsDark(Colors);
  const isDark = customIsDark !== undefined ? customIsDark : themeIsDark;

  // 1. ƯU TIÊN HÀNG ĐẦU: Dùng trực tiếp component Kính Lỏng gốc của Apple trên iOS
  if (Platform.OS === 'ios' && isExpoGlassAvailable && ExpoGlassView) {
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

  if (Platform.OS === 'ios' && nativeSupported && NativeLiquidGlassView && NativeLiquidGlassView !== View) {
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
    backgroundColor: customBg,
    borderWidth: customBorderWidth,
    borderColor: customBorderColor,
    shadowColor: customShadowColor,
    shadowOffset: customShadowOffset,
    shadowOpacity: customShadowOpacity,
    shadowRadius: customShadowRadius,
    elevation: customElevation,
    overflow: customOverflow,
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

  // 2. GIẢI PHÁP CHUẨN MỰC CHO ANDROID:
  // Render một View duy nhất có nền kính mờ bán trong suốt (Liquid Frosted Glass).
  // Đặt elevation: 0 để tránh lỗi hardware outline clipping của Android (HWUI) biến hình tròn thành hình bát giác!
  if (Platform.OS === 'android') {
    const androidBg =
      customBg ||
      (isDark ? 'rgba(26, 24, 22, 0.55)' : 'rgba(255, 255, 255, 0.45)');
    const androidBorderColor =
      customBorderColor ||
      (isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.65)');
    const androidBorderWidth =
      customBorderWidth !== undefined ? customBorderWidth : 1;

    return (
      <View
        style={[
          styles.androidContainer,
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
            backgroundColor: androidBg,
            borderWidth: androidBorderWidth,
            borderColor: androidBorderColor,
            shadowColor: customShadowColor || (isDark ? '#000000' : '#2B2928'),
            shadowOffset: customShadowOffset || { width: 0, height: 2 },
            shadowOpacity:
              customShadowOpacity !== undefined ? customShadowOpacity : isDark ? 0.35 : 0.06,
            shadowRadius: customShadowRadius || 6,
            elevation: customElevation !== undefined ? customElevation : 0,
            overflow: customOverflow || 'visible',
          },
          innerContentStyle,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  // 3. FALLBACK TỰ NHIÊN TRÊN IOS (Khi chưa có UIKit GlassView): Frosted Glass mờ quang học thuần khiết
  const blurIntensity = intensity !== undefined ? intensity : 45;
  const isSelfSized =
    height !== undefined ||
    width !== undefined ||
    flex !== undefined ||
    minHeight !== undefined ||
    minWidth !== undefined;

  const defaultBorderColor = isDark
    ? 'rgba(255, 255, 255, 0.16)'
    : 'rgba(255, 255, 255, 0.85)';
  const defaultBorderWidth = 1;

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
            customShadowOpacity !== undefined ? customShadowOpacity : isDark ? 0.35 : 0.06,
          shadowRadius: customShadowRadius || 6,
          elevation: customElevation !== undefined ? customElevation : (isDark ? 0 : 2),
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
            borderWidth: defaultBorderWidth,
            borderColor: defaultBorderColor,
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
  androidContainer: {
    overflow: 'visible',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
