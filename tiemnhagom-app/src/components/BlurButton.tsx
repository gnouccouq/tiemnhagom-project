import React, { useRef } from 'react';
import {
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LiquidGlass } from './LiquidGlass';
import { triggerHaptic } from '../utils/haptics';
import { useThemeColor, checkIsDark } from '../constants/theme';

export interface BlurButtonProps {
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  badge?: React.ReactNode;
  isDark?: boolean;
  onPress?: (e: any) => void;
  onPressIn?: (e: any) => void;
  onPressOut?: (e: any) => void;
  accessibilityLabel?: string;
  testID?: string;
  hitSlop?: any;
  disabled?: boolean;
  /** Độ phóng giãn đàn hồi giọt nước khi chạm (mặc định 1.10 để tạo cổ nối giọt nước) */
  elasticScale?: number;
}

export const BlurButton: React.FC<BlurButtonProps> = ({
  style,
  containerStyle,
  children,
  badge,
  isDark: customIsDark,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  testID,
  hitSlop,
  disabled = false,
  elasticScale = 1.10,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const Colors = useThemeColor();
  const isDark = customIsDark !== undefined ? customIsDark : checkIsDark(Colors);

  // Tách các phần tử con có position: 'absolute' (như huy hiệu số lượng / notificationBadge)
  // ra khỏi LiquidGlass để không bị thuộc tính overflow: 'hidden' bo tròn cắt cụt trên Android và iOS.
  const regularChildren: React.ReactNode[] = [];
  const overlayChildren: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const flatStyle = StyleSheet.flatten((child.props as any)?.style);
      if (flatStyle && flatStyle.position === 'absolute') {
        overlayChildren.push(child);
        return;
      }
    }
    regularChildren.push(child);
  });

  const flatInnerStyle = StyleSheet.flatten([styles.defaultInner, style]);
  const containerWidth = flatInnerStyle?.width || 40;
  const containerHeight = flatInnerStyle?.height || 40;

  const handlePressIn = (e: any) => {
    if (disabled) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);

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
    <Animated.View
      style={[
        styles.containerBase,
        { width: containerWidth, height: containerHeight },
        containerStyle,
        { transform: [{ scale }] },
      ]}
    >
      <LiquidGlass style={[styles.defaultInner, style]} interactive={true} isDark={isDark}>
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
          {regularChildren}
        </Pressable>
      </LiquidGlass>
      {badge}
      {overlayChildren}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  containerBase: {
    position: 'relative',
    overflow: 'visible',
  },
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
