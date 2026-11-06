import React from 'react';
import { StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { BlurButton } from './BlurButton';
import { useThemeColor, checkIsDark } from '../constants/theme';
import { useSettings } from '../context/SettingsContext';

export interface HeaderBackButtonProps {
  onPress?: () => void;
  tintColor?: any;
  isDark?: boolean;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const HeaderBackButton: React.FC<HeaderBackButtonProps> = ({
  onPress,
  tintColor,
  isDark: customIsDark,
  style,
  containerStyle,
  accessibilityLabel,
}) => {
  const router = useRouter();
  const themeColors = useThemeColor();
  const isDark = customIsDark !== undefined ? customIsDark : checkIsDark(themeColors);
  const { t } = useSettings();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const resolvedTintColor = tintColor || themeColors.textPrimary;

  return (
    <BlurButton
      isDark={isDark}
      style={[styles.button, style]}
      containerStyle={[
        styles.container,
        Platform.OS === 'android' ? styles.androidContainer : undefined,
        containerStyle,
      ]}
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel || t('back') || 'Quay lại'}
    >
      <SymbolView
        name="chevron.left"
        size={20}
        tintColor={resolvedTintColor}
        fallback={
          <Ionicons
            name="chevron-back"
            size={22}
            color={resolvedTintColor}
            style={styles.fallbackIcon}
          />
        }
      />
    </BlurButton>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    overflow: 'visible',
  },
  androidContainer: {
    marginLeft: 0,
    marginRight: 4,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    marginLeft: -1,
  },
});

export default HeaderBackButton;
