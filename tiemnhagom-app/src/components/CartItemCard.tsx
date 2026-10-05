// src/components/CartItemCard.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
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
          <TouchableOpacity onPress={onRemove} style={themeStyles.removeButton}>
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
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

          {/* Stepper */}
          <View style={themeStyles.stepper}>
            <TouchableOpacity
              style={themeStyles.stepBtn}
              onPress={() => onUpdateQuantity(item.quantity - 1)}
              disabled={item.quantity <= 1}
            >
              <Ionicons
                name="remove"
                size={14}
                color={item.quantity <= 1 ? Colors.textMuted : Colors.textPrimary}
              />
            </TouchableOpacity>

            <Text style={themeStyles.qtyText}>{item.quantity}</Text>

            <TouchableOpacity
              style={themeStyles.stepBtn}
              onPress={() => onUpdateQuantity(item.quantity + 1)}
              disabled={item.quantity >= item.maxStock}
            >
              <Ionicons
                name="add"
                size={14}
                color={item.quantity >= item.maxStock ? Colors.textMuted : Colors.textPrimary}
              />
            </TouchableOpacity>
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
    borderRadius: 16,
    backgroundColor: Colors.surface,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  name: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 18,
    marginRight: Spacing.sm,
  },
  removeButton: {
    padding: 2,
  },
  variantBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginVertical: 4,
  },
  variantText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  price: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    overflow: 'hidden',
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontFamily: 'ElleGaborStd',
    minWidth: 26,
    textAlign: 'center',
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
