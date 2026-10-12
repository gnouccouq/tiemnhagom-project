// src/components/CartItemCard.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScalePressable } from './ScalePressable';
import { useThemeColor, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { CartItem } from '../types';
import { formatCurrency } from '../utils/format';

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export const CartItemCard: React.FC<CartItemCardProps> = ({
  item,
  onUpdateQuantity,
  onRemove,
}) => {
  const Colors = useThemeColor();
  const themeStyles = getStyles(Colors);
  const imageUri = item.variant?.imageUrl || item.imageUrl || 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?q=80&w=300&auto=format&fit=crop';

  return (
    <View style={themeStyles.card}>
      <Image source={{ uri: imageUri }} style={themeStyles.image} contentFit="cover" />

      <View style={themeStyles.info}>
        <View style={themeStyles.topRow}>
          <Text style={themeStyles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <ScalePressable onPress={onRemove} style={themeStyles.removeButton} activeScale={0.85}>
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          </ScalePressable>
        </View>

        {item.variant && item.variant.name && (
          <View style={themeStyles.variantBadge}>
            <Text style={themeStyles.variantText}>
              {item.variant.type === 'color' ? 'Màu sắc' : item.variant.type === 'pattern' ? 'Họa tiết' : item.variant.type === 'combo' ? 'Combo' : 'Phân loại'}: {item.variant.name}
            </Text>
          </View>
        )}

        <View style={themeStyles.bottomRow}>
          <Text style={themeStyles.price}>{formatCurrency(item.price)}</Text>

          {/* Stepper with Spring Pressable */}
          <View style={themeStyles.stepper}>
            <ScalePressable
              style={themeStyles.stepBtn}
              onPress={() => onUpdateQuantity(item.quantity - 1)}
              disabled={item.quantity <= 1}
              activeScale={0.82}
            >
              <Ionicons
                name="remove"
                size={14}
                color={item.quantity <= 1 ? Colors.textMuted : Colors.textPrimary}
              />
            </ScalePressable>

            <Text style={themeStyles.qtyText}>{item.quantity}</Text>

            <ScalePressable
              style={themeStyles.stepBtn}
              onPress={() => onUpdateQuantity(item.quantity + 1)}
              disabled={item.quantity >= item.maxStock}
              activeScale={0.82}
            >
              <Ionicons
                name="add"
                size={14}
                color={item.quantity >= item.maxStock ? Colors.textMuted : Colors.textPrimary}
              />
            </ScalePressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const getStyles = (Colors: any) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#F3EFEA',
  },
  info: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  name: {
    flex: 1,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
    marginRight: 8,
  },
  removeButton: {
    padding: 4,
    marginRight: -4,
    marginTop: -4,
  },
  variantBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  variantText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textMuted,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  price: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderRadius: 18,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    minWidth: 26,
    textAlign: 'center',
  },
});
