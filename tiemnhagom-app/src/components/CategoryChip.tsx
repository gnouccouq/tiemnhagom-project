import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScalePressable } from './ScalePressable';
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
    <ScalePressable
      style={[themeStyles.chip, isSelected && themeStyles.selectedChip]}
      onPress={onPress}
      activeScale={0.92}
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
    </ScalePressable>
  );
};

const getStyles = (Colors: any) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9.5,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    marginRight: 8,
    shadowColor: '#2B2928',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  selectedChip: {
    backgroundColor: '#9C7156',
    borderColor: '#9C7156',
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#6E665D',
    fontWeight: '600',
  },
  selectedText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

// fix cache