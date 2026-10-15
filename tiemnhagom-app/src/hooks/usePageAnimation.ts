/**
 * usePageAnimation - Hook hoạt ảnh chung cho tất cả các trang.
 * Cung cấp:
 * - pageStyle: style fade + slide-up cho root container
 * - getItemStyle(index): style cho từng item trong danh sách (stagger từng cái)
 * - runEntrance(): gọi thủ công nếu cần trigger lại
 */
import { useRef, useEffect, useCallback } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface PageAnimationOptions {
  /** Delay trước khi bắt đầu animation (ms). Mặc định: 0 */
  delay?: number;
  /** Slide offset theo trục Y (px). Mặc định: 22 */
  slideOffset?: number;
  /** Thời gian fade in (ms). Mặc định: 280 */
  duration?: number;
  /** Số lượng item để stagger. Mặc định: 10 */
  itemCount?: number;
  /** Khoảng cách giữa mỗi stagger item (ms). Mặc định: 55 */
  staggerDelay?: number;
}

export function usePageAnimation(options: PageAnimationOptions = {}) {
  const {
    delay = 0,
    slideOffset = 22,
    duration = 280,
    itemCount = 12,
    staggerDelay = 55,
  } = options;

  // pageOpacity khởi tạo là 1 để nền trang không bị trong suốt làm lộ nền sáng phía dưới
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageTranslateY = useRef(new Animated.Value(slideOffset)).current;

  // Tạo animated values cho từng item stagger
  const itemAnims = useRef(
    Array.from({ length: itemCount }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(16),
    }))
  ).current;

  const runEntrance = useCallback(() => {
    // Giữ pageOpacity luôn là 1 để nền trang không bị trong suốt gây loé sáng
    pageOpacity.setValue(1);
    pageTranslateY.setValue(slideOffset);
    itemAnims.forEach(a => {
      a.opacity.setValue(0);
      a.translateY.setValue(16);
    });

    // Animate page container với chuyển động trượt nhẹ
    Animated.spring(pageTranslateY, {
      toValue: 0,
      damping: 22,
      stiffness: 200,
      mass: 0.8,
      delay,
      useNativeDriver: true,
    }).start();

    // Stagger từng item
    const staggeredAnims = itemAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: 220,
          delay: delay + 80 + i * staggerDelay,
          useNativeDriver: true,
        }),
        Animated.spring(anim.translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 220,
          delay: delay + 80 + i * staggerDelay,
          useNativeDriver: true,
        }),
      ])
    );
    Animated.parallel(staggeredAnims).start();
  }, [delay, slideOffset, duration, staggerDelay]);

  useEffect(() => {
    runEntrance();
  }, []);

  /** Style cho root page container */
  const pageStyle = {
    opacity: pageOpacity,
    transform: [{ translateY: pageTranslateY }],
  };

  /** Style cho từng item theo index (clamp để không vượt quá itemCount) */
  const getItemStyle = (index: number): { opacity: any; transform: any } => {
    const safeIndex = Math.min(index, itemAnims.length - 1);
    return {
      opacity: itemAnims[safeIndex].opacity,
      transform: [{ translateY: itemAnims[safeIndex].translateY }],
    };
  };

  return { pageStyle, getItemStyle, runEntrance };
}
