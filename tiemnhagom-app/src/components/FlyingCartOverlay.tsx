// src/components/FlyingCartOverlay.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface FlyingItemData {
  id: string;
  imageUri: string;
  startX: number;
  startY: number;
  targetX?: number;
  targetY?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_SIZE = 50;

interface FlyingItemProps {
  item: FlyingItemData;
  defaultTargetX: number;
  defaultTargetY: number;
  onFinish: (id: string) => void;
}

const FlyingItemView: React.FC<FlyingItemProps> = React.memo(({ item, defaultTargetX, defaultTargetY, onFinish }) => {
  const progress = useRef(new Animated.Value(0)).current;

  const startX = item.startX;
  const startY = item.startY;
  const targetX = typeof item.targetX === 'number' ? item.targetX : defaultTargetX;
  const targetY = typeof item.targetY === 'number' ? item.targetY : defaultTargetY;

  // Arc path interpolations
  const deltaX = targetX - startX;
  const arcControlX = (startX + targetX) / 2 + (deltaX > 0 ? -25 : 25);
  const midY = Math.min(startY - 55, (startY + targetY) / 2 - 35);

  const translateX = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [
      startX - ITEM_SIZE / 2,
      arcControlX - ITEM_SIZE / 2,
      targetX - ITEM_SIZE / 2,
    ],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: [
      startY - ITEM_SIZE / 2,
      midY - ITEM_SIZE / 2,
      startY + (targetY - startY) * 0.72 - ITEM_SIZE / 2,
      targetY - ITEM_SIZE / 2,
    ],
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.2, 0.75, 1],
    outputRange: [0.55, 1.18, 0.82, 0.16],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.88, 1],
    outputRange: [0, 1, 1, 0],
  });

  const rotate = progress.interpolate({
    inputRange: [0, 0.4, 0.8, 1],
    outputRange: ['0deg', '-14deg', '10deg', '0deg'],
  });

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 620,
      easing: Easing.bezier(0.22, 0.7, 0.25, 1),
      useNativeDriver: true,
    }).start(() => {
      onFinish(item.id);
    });
  }, [item.id, onFinish, progress]);

  return (
    <Animated.View
      style={[
        styles.flyingContainer,
        {
          opacity,
          transform: [
            { translateX },
            { translateY },
            { scale },
            { rotate },
          ],
        },
      ]}
    >
      <View style={styles.thumbnailWrapper}>
        <Image
          source={{ uri: item.imageUri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="disk"
        />
        <View style={styles.plusBadge}>
          <Ionicons name="add" size={11} color="#FFFFFF" />
        </View>
      </View>
    </Animated.View>
  );
});

interface FlyingCartOverlayProps {
  items: FlyingItemData[];
  onFinish: (id: string) => void;
}

export const FlyingCartOverlay: React.FC<FlyingCartOverlayProps> = ({ items, onFinish }) => {
  const insets = useSafeAreaInsets();

  // Điểm đích mặc định: icon giỏ hàng ở giữa thanh FloatingTabBar (tab 3/5)
  const defaultTargetX = SCREEN_WIDTH / 2;
  // Thanh FloatingTabBar có bottom khoảng max(insets.bottom - 10, 6) và cao 64px
  const defaultTargetY = SCREEN_HEIGHT - Math.max(insets.bottom - 10, 6) - 34;

  if (!items || items.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((item) => (
        <FlyingItemView
          key={item.id}
          item={item}
          defaultTargetX={defaultTargetX}
          defaultTargetY={defaultTargetY}
          onFinish={onFinish}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  flyingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    zIndex: 99999,
  },
  thumbnailWrapper: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#9C7156', // Nâu Đất Nung Gốm Mộc
    overflow: 'visible',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 12,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: ITEM_SIZE / 2 - 2,
  },
  plusBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#9C7156',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
