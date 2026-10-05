import React from 'react';
import { StyleSheet, View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { ScalePressable, ScalePressableProps } from './ScalePressable';
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
    <ScalePressable style={[styles.shadowContainer, containerStyle]} {...rest}>
      <View style={[styles.inner, style]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 85 : 70}
          tint={isDark ? "dark" : "light"}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inner: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  glassOverlay: {
    backgroundColor: isDark 
      ? (Platform.OS === 'ios' ? 'rgba(30, 30, 30, 0.45)' : 'rgba(30, 30, 30, 0.65)')
      : (Platform.OS === 'ios' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.65)'),
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
