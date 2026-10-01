// src/components/BannerSlider.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { BannerSlide, getHeroBanners } from '../services/productService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Chiều cao banner full màn hình chuẩn theo giao diện mobile web (chiếm trọn khung nhìn)
export const HERO_BANNER_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 680);

interface BannerSliderProps {
  onBannerPress?: (slide: BannerSlide) => void;
}

export const BannerSlider: React.FC<BannerSliderProps> = ({ onBannerPress }) => {
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const autoPlayTimer = useRef<any>(null);

  // Animated value theo dõi vị trí cuộn x (cho animation mượt mà theo cử chỉ ngón tay)
  const scrollX = useRef(new Animated.Value(0)).current;

  // Nạp danh sách banner từ Firestore (ưu tiên mobileImageUrl)
  useEffect(() => {
    let isMounted = true;
    getHeroBanners().then((data) => {
      if (isMounted && data.length > 0) {
        setSlides(data);
        setActiveIndex(0);
        currentIndexRef.current = 0;
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const stopAutoPlay = () => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
  };

  const startAutoPlay = () => {
    stopAutoPlay();
    if (slides.length > 1) {
      autoPlayTimer.current = setInterval(() => {
        const next = (currentIndexRef.current + 1) % slides.length;
        currentIndexRef.current = next;
        setActiveIndex(next);
        scrollViewRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      }, 4500);
    }
  };

  // Tự động chuyển slide sau mỗi 4.5 giây
  useEffect(() => {
    if (slides.length <= 1) return;
    startAutoPlay();
    return () => {
      stopAutoPlay();
    };
  }, [slides.length]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx >= 0 && idx < slides.length) {
      setActiveIndex(idx);
      currentIndexRef.current = idx;
    }
    startAutoPlay();
  };

  const handleDotPress = (index: number) => {
    setActiveIndex(index);
    currentIndexRef.current = index;
    scrollViewRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    startAutoPlay();
  };

  if (slides.length === 0) {
    return (
      <View style={[styles.container, styles.loadingWrap]}>
        <View style={styles.placeholderCard} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 1. Lớp ảnh xếp chồng cố định chuyển mờ dần (Crossfade Layer theo thời gian thực) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {slides.map((item, index) => {
          const bannerSource =
            item.mobileImageUrl && item.mobileImageUrl.trim() !== ''
              ? item.mobileImageUrl
              : item.imageUrl;

          let opacity: Animated.AnimatedInterpolation<number>;
          if (slides.length <= 1) {
            opacity = new Animated.Value(1) as any;
          } else if (index === 0) {
            opacity = scrollX.interpolate({
              inputRange: [0, SCREEN_WIDTH, SCREEN_WIDTH * 1.01],
              outputRange: [1, 1, 0],
              extrapolate: 'clamp',
            });
          } else if (index === slides.length - 1) {
            opacity = scrollX.interpolate({
              inputRange: [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });
          } else {
            opacity = scrollX.interpolate({
              inputRange: [
                (index - 1) * SCREEN_WIDTH,
                index * SCREEN_WIDTH,
                (index + 1) * SCREEN_WIDTH,
                (index + 1.01) * SCREEN_WIDTH,
              ],
              outputRange: [0, 1, 1, 0],
              extrapolate: 'clamp',
            });
          }

          return (
            <Animated.View
              key={item.id || String(index)}
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity,
                  zIndex: index,
                },
              ]}
            >
              <Image
                source={{ uri: bannerSource }}
                style={styles.bannerImage}
                contentFit="cover"
                priority={index === 0 ? 'high' : 'normal'}
                cachePolicy="memory-disk"
              />
            </Animated.View>
          );
        })}
      </View>

      {/* 2. Lớp điều khiển cử chỉ lướt tay ngang (Touch Gesture Scroll Layer) */}
      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        snapToInterval={SCREEN_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
        onScrollBeginDrag={stopAutoPlay}
        onScrollEndDrag={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          if (idx >= 0 && idx < slides.length) {
            setActiveIndex(idx);
            currentIndexRef.current = idx;
          }
          startAutoPlay();
        }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ width: SCREEN_WIDTH * slides.length, height: HERO_BANNER_HEIGHT }}
      >
        {slides.map((item, index) => (
          <TouchableOpacity
            key={item.id || String(index)}
            style={styles.touchSlide}
            activeOpacity={0.96}
            delayPressIn={50}
            onPress={() => onBannerPress?.(item)}
          />
        ))}
      </Animated.ScrollView>

      {/* 3. Dấu chấm chuyển slide với animation chuyển động co dãn mượt mà (Morphing Pill Dots) */}
      <View style={styles.dotsWrap}>
        {slides.map((_, i) => {
          // Animation co dãn theo vị trí cuộn x trực tiếp từ ngón tay người dùng
          const width = scrollX.interpolate({
            inputRange: [
              (i - 1) * SCREEN_WIDTH,
              i * SCREEN_WIDTH,
              (i + 1) * SCREEN_WIDTH,
            ],
            outputRange: [7, 24, 7],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange: [
              (i - 1) * SCREEN_WIDTH,
              i * SCREEN_WIDTH,
              (i + 1) * SCREEN_WIDTH,
            ],
            outputRange: [0.45, 1, 0.45],
            extrapolate: 'clamp',
          });

          return (
            <TouchableOpacity
              key={i}
              onPress={() => handleDotPress(i)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            >
              <Animated.View
                style={[
                  styles.dotBase,
                  {
                    width,
                    opacity,
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: HERO_BANNER_HEIGHT,
    position: 'relative',
    backgroundColor: '#F7F4EF',
    overflow: 'hidden',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderCard: {
    width: SCREEN_WIDTH,
    height: HERO_BANNER_HEIGHT,
    backgroundColor: '#EAE5DC',
  },
  touchSlide: {
    width: SCREEN_WIDTH,
    height: HERO_BANNER_HEIGHT,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  dotsWrap: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  dotBase: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 4,
  },
});
