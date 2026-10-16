import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ScalePressable, ScalePressableProps } from './ScalePressable';
import { LiquidGlass } from './LiquidGlass';
import { useThemeColor } from '../constants/theme';

export interface BlurButtonProps extends Omit<ScalePressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export const BlurButton: React.FC<BlurButtonProps> = ({
  style,
  containerStyle,
  children,
  onPress,
  ...rest
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';

  const handlePress = (e: any) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (onPress) onPress(e);
  };

  return (
    <ScalePressable
      style={containerStyle}
      activeScale={0.90}
      onPress={handlePress}
      {...rest}
    >
      <LiquidGlass style={[styles.defaultInner, style]} interactive={true}>
        <View style={styles.content}>{children}</View>
      </LiquidGlass>
    </ScalePressable>
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
