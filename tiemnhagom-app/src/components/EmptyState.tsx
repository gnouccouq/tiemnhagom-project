// src/components/EmptyState.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor, Typography, Spacing, BorderRadius } from '../constants/theme';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  buttonText?: string;
  onButtonPress?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'basket-outline',
  title,
  message,
  buttonText,
  onButtonPress,
}) => {
  const Colors = useThemeColor();
  const themeStyles = getStyles(Colors);
  return (
    <View style={themeStyles.container}>
      <View style={themeStyles.iconCircle}>
        <Ionicons name={icon as any} size={48} color={Colors.primary} />
      </View>
      <Text style={themeStyles.title}>{title}</Text>
      {message && <Text style={themeStyles.message}>{message}</Text>}
      {buttonText && onButtonPress && (
        <TouchableOpacity style={themeStyles.button} onPress={onButtonPress} activeOpacity={0.85}>
          <Text style={themeStyles.buttonText}>{buttonText}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.textInverse} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const getStyles = (Colors: any) => StyleSheet.create({
  container: {
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    maxWidth: 260,
  },
  button: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 24,
    marginTop: Spacing.sm,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: 15,
  },
});
