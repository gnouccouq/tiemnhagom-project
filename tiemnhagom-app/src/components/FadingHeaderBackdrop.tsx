import React from 'react';
import { View, StyleSheet, Platform, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '../constants/theme';

interface FadingHeaderBackdropProps {
  height?: number;
}

/**
 * Lớp phủ LinearGradient mờ dần từ trên xuống dưới chuẩn GEMINI.md
 * Đặt dưới thanh điều hướng gốc UINavigationBar Liquid Glass để tạo độ tương phản mượt mà, liền mạch
 */
export const FadingHeaderBackdrop: React.FC<FadingHeaderBackdropProps> = ({ height }) => {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';

  const defaultHeight =
    (insets.top > 0
      ? insets.top
      : Platform.OS === 'android'
      ? StatusBar.currentHeight || 24
      : 44) + 56 + 24;

  const targetHeight = height || defaultHeight;

  return (
    <View
      style={[styles.container, { height: targetHeight }]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={
          isDark
            ? [
                'rgba(0,0,0,0.85)',
                'rgba(0,0,0,0.72)',
                'rgba(0,0,0,0.45)',
                'rgba(0,0,0,0.15)',
                'rgba(0,0,0,0)',
              ]
            : [
                'rgba(250,248,245,0.88)',
                'rgba(250,248,245,0.75)',
                'rgba(250,248,245,0.45)',
                'rgba(250,248,245,0.15)',
                'rgba(250,248,245,0)',
              ]
        }
        locations={[0, 0.4, 0.7, 0.88, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
});

export default FadingHeaderBackdrop;
