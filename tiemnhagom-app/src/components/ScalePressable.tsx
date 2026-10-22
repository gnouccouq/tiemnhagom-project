// src/components/ScalePressable.tsx
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { triggerHaptic } from '../utils/haptics';

export interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  activeScale?: number;
  children: React.ReactNode;
}

/**
 * ScalePressable - Nút bấm có hiệu ứng co lún đàn hồi (Spring Animation) khi chạm hoặc nhấn giữ,
 * tạo cảm giác tương tác vật lý sống động và phản hồi mượt mà cho các nút tròn trên toàn app.
 */
export const ScalePressable: React.FC<ScalePressableProps> = ({
  style,
  activeScale = 0.88,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    if (disabled) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: activeScale,
        useNativeDriver: true,
        speed: 28,
        bounciness: 3,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.88,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    if (disabled) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 22,
        bounciness: 8, // Độ nảy đàn hồi sống động
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
    onPressOut?.(e);
  };

  const flatStyle = (StyleSheet.flatten(style) as ViewStyle) || {};
  const pressableStyle: ViewStyle = {};
  const innerStyle: ViewStyle = { ...flatStyle };

  const layoutKeys: (keyof ViewStyle)[] = [
    'flex',
    'flexGrow',
    'flexShrink',
    'flexBasis',
    'alignSelf',
    'width',
    'height',
    'minWidth',
    'maxWidth',
    'minHeight',
    'maxHeight',
    'margin',
    'marginHorizontal',
    'marginVertical',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'position',
    'top',
    'bottom',
    'left',
    'right',
    'zIndex',
  ];

  layoutKeys.forEach((key) => {
    if (flatStyle[key] !== undefined) {
      (pressableStyle as any)[key] = flatStyle[key];
      delete (innerStyle as any)[key];
    }
  });

  return (
    <Pressable
      style={Object.keys(pressableStyle).length > 0 ? pressableStyle : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      {...rest}
    >
      <Animated.View
        style={[
          innerStyle,
          (pressableStyle.flex !== undefined || flatStyle.flex !== undefined || pressableStyle.width !== undefined || flatStyle.width !== undefined) && { width: '100%' },
          (pressableStyle.height !== undefined || flatStyle.height !== undefined) && { height: '100%' },
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default ScalePressable;
