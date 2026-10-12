// src/components/ShimmerSkeleton.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface ShimmerSkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * ShimmerSkeleton: Khung xương tải dữ liệu ánh sóng gốm mộc (Warm Glaze Shimmer)
 * Tạo cảm giác tải mượt mà, đồng điệu với thẩm mỹ gốm thủ công của Tiệm Nhà Gốm.
 */
export const ShimmerSkeleton: React.FC<ShimmerSkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmerAnimation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1300,
        useNativeDriver: true,
      })
    );
    shimmerAnimation.start();
    return () => shimmerAnimation.stop();
  }, [animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 250],
  });

  return (
    <View style={[styles.container, { width, height, borderRadius }, style]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

/**
 * ProductCardSkeleton: Khung xương cho thẻ sản phẩm dạng lưới
 */
export const ProductCardSkeleton: React.FC<{ cardWidth?: number }> = ({ cardWidth = 170 }) => {
  return (
    <View style={[styles.productCard, { width: cardWidth }]}>
      <ShimmerSkeleton width="100%" height={cardWidth * 1.15} borderRadius={16} />
      <View style={styles.cardPadding}>
        <ShimmerSkeleton width="85%" height={15} borderRadius={6} style={{ marginBottom: 6 }} />
        <ShimmerSkeleton width="55%" height={13} borderRadius={6} style={{ marginBottom: 10 }} />
        <View style={styles.rowBetween}>
          <ShimmerSkeleton width="50%" height={18} borderRadius={6} />
          <ShimmerSkeleton width={32} height={32} borderRadius={16} />
        </View>
      </View>
    </View>
  );
};

/**
 * OrderCardSkeleton: Khung xương cho thẻ đơn hàng trong lịch sử
 */
export const OrderCardSkeleton: React.FC = () => {
  return (
    <View style={styles.orderCard}>
      <View style={styles.rowBetween}>
        <ShimmerSkeleton width="45%" height={14} borderRadius={6} />
        <ShimmerSkeleton width={80} height={24} borderRadius={12} />
      </View>
      <ShimmerSkeleton width="60%" height={16} borderRadius={6} style={{ marginTop: 10, marginBottom: 12 }} />
      <View style={styles.thumbnailsRow}>
        {[1, 2, 3].map((key) => (
          <ShimmerSkeleton key={key} width={54} height={54} borderRadius={12} style={{ marginRight: 8 }} />
        ))}
      </View>
      <View style={[styles.rowBetween, { marginTop: 14 }]}>
        <ShimmerSkeleton width="40%" height={14} borderRadius={6} />
        <ShimmerSkeleton width="30%" height={18} borderRadius={6} />
      </View>
      <View style={[styles.rowBetween, { marginTop: 14 }]}>
        <ShimmerSkeleton width="48%" height={38} borderRadius={19} />
        <ShimmerSkeleton width="48%" height={38} borderRadius={19} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EBE5DE',
    overflow: 'hidden',
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    overflow: 'hidden',
    marginBottom: 14,
  },
  cardPadding: {
    padding: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E1D8',
    padding: 16,
    marginBottom: 14,
  },
  thumbnailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
