// src/components/CategoryChip.tsx
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor, Colors, Typography, Spacing, BorderRadius } from '../constants/theme';

interface CategoryChipProps {
  id: string;
  name: string;
  icon?: string;
  isSelected: boolean;
  onPress: () => void;
}

export const CategoryChip: React.FC<CategoryChipProps> = ({
  name,
  icon,
  isSelected,
  onPress,
}) => {
  const Colors = useThemeColor();
  const themeStyles = getStyles(Colors);
  return (
    <TouchableOpacity
      style={[themeStyles.chip, isSelected && themeStyles.selectedChip]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && (
        <Ionicons
          name={icon as any}
          size={16}
          color={isSelected ? Colors.textInverse : Colors.textSecondary}
          style={themeStyles.icon}
        />
      )}
      <Text style={[themeStyles.text, isSelected && themeStyles.selectedText]}>
        {name}
      </Text>
    </TouchableOpacity>
  );
};

const getStyles = (Colors: any) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9.5,
    borderRadius: 22,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  selectedChip: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  selectedText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textInverse,
    fontWeight: '700',
  },
});

// fix cache