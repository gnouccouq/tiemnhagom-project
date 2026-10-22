import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  Animated,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LiquidGlass } from './LiquidGlass';

export interface BlurButtonProps {
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onPress?: (e: any) => void;
  onPressIn?: (e: any) => void;
  onPressOut?: (e: any) => void;
  accessibilityLabel?: string;
  testID?: string;
  hitSlop?: any;
  disabled?: boolean;
  /** Độ phóng giãn đàn hồi giọt nước khi chạm (mặc định 1.08 để tạo cổ nối giọt nước) */
  elasticScale?: number;
}

export const BlurButton: React.FC<BlurButtonProps> = ({
  style,
  containerStyle,
  children,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  testID,
  hitSlop,
  disabled = false,
  elasticScale = 1.08,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    // Hiệu ứng giọt nước phồng nở đàn hồi hướng về các phần tử lân cận
    Animated.spring(scale, {
      toValue: elasticScale,
      friction: 4,
      tension: 240,
      useNativeDriver: true,
    }).start();

    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    // Thu giọt nước giật nảy êm dịu về trạng thái ban đầu
    Animated.spring(scale, {
      toValue: 1,
      friction: 3.5,
      tension: 260,
      useNativeDriver: true,
    }).start();

    if (onPressOut) onPressOut(e);
  };

  const handlePress = (e: any) => {
    if (disabled) return;
    if (onPress) onPress(e);
  };

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <LiquidGlass style={[styles.defaultInner, style]} interactive={true}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID={testID}
          hitSlop={hitSlop}
          disabled={disabled}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.content}
        >
          {children}
        </Pressable>
      </LiquidGlass>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  defaultInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
});

export default BlurButton;
