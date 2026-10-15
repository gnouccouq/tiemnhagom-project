import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
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
  ...rest
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  return (
    <ScalePressable
      style={[styles.shadowContainer, containerStyle]}
      activeScale={0.90}
      {...rest}
    >
      <LiquidGlass style={[styles.inner, style]} interactive={true}>
        <View style={styles.content}>{children}</View>
      </LiquidGlass>
    </ScalePressable>
  );
};

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  shadowContainer: {
    backgroundColor: 'transparent',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 5,
    elevation: isDark ? 0 : 1,
  },
  inner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
