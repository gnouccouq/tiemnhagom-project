// src/components/BannerSlider.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BannerSlide, getHeroBanners } from '../services/productService';
import { useSettings } from '../context/SettingsContext';
import { LiquidGlass } from './LiquidGlass';
import { ScalePressable } from './ScalePressable';
import { BlurButton } from './BlurButton';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Chiều cao banner full màn hình chuẩn theo giao diện mobile web (chiếm trọn khung nhìn)
export const HERO_BANNER_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 680);

const videoSource = require('../../assets/videos/video_banner_xmas.mp4');

interface BannerSliderProps {
  onBannerPress?: (slide: BannerSlide) => void;
  scrollY?: number;
}

export const BannerSlider: React.FC<BannerSliderProps> = ({ onBannerPress, scrollY }) => {
  const { t } = useSettings();
  const pathname = usePathname();
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const autoPlayTimer = useRef<any>(null);

  // Video mặc định theo yêu cầu người dùng
  const [bannerMode, setBannerMode] = useState<'image' | 'video'>('video');
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const userPausedRef = useRef(false);
  const isScreenFocusedRef = useRef(true);
  const scrollYRef = useRef(scrollY);
  scrollYRef.current = scrollY;
  const bannerModeRef = useRef(bannerMode);
  bannerModeRef.current = bannerMode;

  // Khởi tạo Video Player tự động chạy lặp (loop) và tắt tiếng (muted) mặc định
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

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
    if (slides.length > 1 && bannerMode === 'image') {
      autoPlayTimer.current = setInterval(() => {
        const next = (currentIndexRef.current + 1) % slides.length;
        currentIndexRef.current = next;
        setActiveIndex(next);
        scrollViewRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      }, 4500);
    }
  };

  // Tự động chuyển slide khi ở chế độ 'image'
  useEffect(() => {
    if (slides.length <= 1 || bannerMode === 'video') {
      stopAutoPlay();
      return;
    }
    startAutoPlay();
    return () => {
      stopAutoPlay();
    };
  }, [slides.length, bannerMode]);

  // 1. Tự động dừng video khi người dùng chuyển sang trang khác hoặc tab khác (React Navigation Blur)
  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      if (bannerModeRef.current === 'video') {
        if ((scrollYRef.current === undefined || scrollYRef.current <= 140) && !userPausedRef.current) {
          try {
            player.play();
            setIsPlaying(true);
          } catch (e) {}
        }
      } else {
        startAutoPlay();
      }

      return () => {
        isScreenFocusedRef.current = false;
        try {
          if (player) {
            player.pause();
            setIsPlaying(false);
          }
        } catch (e) {}
        stopAutoPlay();
      };
    }, [player])
  );

  // 2. Theo dõi route pathname tức thời: Khi pathname không còn ở trang chủ -> dừng video ngay lập tức
  useEffect(() => {
    const isHome = pathname === '/' || pathname === '' || pathname === '/(tabs)' || pathname === '/(tabs)/';
    if (!isHome) {
      isScreenFocusedRef.current = false;
      try {
        if (player && player.playing) {
          player.pause();
          setIsPlaying(false);
        }
      } catch (e) {}
      stopAutoPlay();
    }
  }, [pathname, player]);

  // 3. Theo dõi trạng thái ứng dụng (AppState): Khi chuyển sang app khác hoặc tắt màn hình -> dừng video
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') {
        try {
          if (player) {
            player.pause();
            setIsPlaying(false);
          }
        } catch (e) {}
        stopAutoPlay();
      } else {
        if (isScreenFocusedRef.current && bannerModeRef.current === 'video') {
          if ((scrollYRef.current === undefined || scrollYRef.current <= 140) && !userPausedRef.current) {
            try {
              player.play();
              setIsPlaying(true);
            } catch (e) {}
          }
        } else if (isScreenFocusedRef.current && bannerModeRef.current === 'image') {
          startAutoPlay();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  // 4. Tự động dừng video khi người dùng cuộn xuống xem sản phẩm & phát lại khi cuộn về đầu trang
  useEffect(() => {
    if (scrollY === undefined || !player) return;
    if (!isScreenFocusedRef.current) return;

    if (bannerMode === 'video') {
      if (scrollY > 180) {
        // Lướt xuống dưới xem sản phẩm -> tự động dừng video
        if (player.playing) {
          player.pause();
          setIsPlaying(false);
        }
      } else if (scrollY <= 140) {
        // Lướt lên lại đầu trang -> tự động phát tiếp video nếu chưa bị bấm dừng thủ công
        if (!player.playing && !userPausedRef.current) {
          player.play();
          setIsPlaying(true);
        }
      }
    }
  }, [scrollY, bannerMode, player]);

  // Chuyển đổi qua lại giữa Ảnh và Video
  const handleModeChange = (mode: 'image' | 'video') => {
    if (mode === bannerMode) return;
    setBannerMode(mode);
    if (mode === 'video') {
      stopAutoPlay();
      userPausedRef.current = false;
      player.play();
      setIsPlaying(true);
    } else {
      player.pause();
      setIsPlaying(false);
      startAutoPlay();
    }
  };

  const handleToggleMode = () => {
    const nextMode = bannerMode === 'video' ? 'image' : 'video';
    handleModeChange(nextMode);
  };

  // Bật / Tắt âm thanh video
  const toggleMute = () => {
    const next = !isMuted;
    player.muted = next;
    setIsMuted(next);
  };

  // Tạm dừng / Tiếp tục phát video khi chạm vào màn hình
  const togglePlayPause = () => {
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
      userPausedRef.current = true;
    } else {
      player.play();
      setIsPlaying(true);
      userPausedRef.current = false;
    }
  };

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

  return (
    <View style={styles.container}>
      {/* ================= 0. LỚP VIDEO BANNER CHẠY LOOP (MẶC ĐỊNH) ================= */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: bannerMode === 'video' ? 1 : 0,
            zIndex: bannerMode === 'video' ? 10 : -1,
          },
        ]}
        pointerEvents={bannerMode === 'video' ? 'auto' : 'none'}
      >
        <TouchableOpacity
          activeOpacity={0.96}
          onPress={togglePlayPause}
          style={StyleSheet.absoluteFill}
        >
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            nativeControls={false}
            contentFit="cover"
            allowsPictureInPicture={false}
          />
        </TouchableOpacity>
      </View>

      {/* ================= 1. LỚP ẢNH XẾP CHỒNG CROSSFADE LAYER ================= */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: bannerMode === 'image' ? 1 : 0,
            zIndex: bannerMode === 'image' ? 5 : -2,
          },
        ]}
        pointerEvents="none"
      >
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
                cachePolicy="disk"
                recyclingKey={bannerSource}
              />
            </Animated.View>
          );
        })}
      </View>

      {/* ================= 2. LỚP ĐIỀU KHIỂN CỬ CHỈ LƯỚT TAY KHI Ở CHẾ ĐỘ ẢNH ================= */}
      {bannerMode === 'image' && (
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
          style={[StyleSheet.absoluteFill, { zIndex: 6 }]}
          contentContainerStyle={{ width: SCREEN_WIDTH * Math.max(slides.length, 1), height: HERO_BANNER_HEIGHT }}
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
      )}

      {/* ================= 3. ĐIỀU KHIỂN ÂM THANH TRÒN (GÓC TRÁI - KHI Ở CHẾ ĐỘ VIDEO) ================= */}
      {bannerMode === 'video' && (
        <BlurButton
          style={styles.circleBtnInner}
          containerStyle={styles.circleBtnWrapLeft}
          onPress={toggleMute}
          accessibilityLabel={isMuted ? (t('unmuteVideo') || 'Bật âm thanh') : (t('muteVideo') || 'Tắt âm thanh')}
        >
          <Ionicons
            name={isMuted ? 'volume-mute-outline' : 'volume-high'}
            size={19}
            color="#FFFFFF"
          />
        </BlurButton>
      )}

      {/* ================= 4. DẤU CHẤM CHUYỂN SLIDE (Ở GIỮA - KHI Ở CHẾ ĐỘ ẢNH) ================= */}
      {bannerMode === 'image' && slides.length > 1 && (
        <View style={styles.dotsWrap}>
          {slides.map((_, i) => {
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
      )}

      {/* ================= 5. NÚT TRÒN TẠM DỪNG / TIẾP TỤC (Ở TRÊN NÚT ĐỔI ẢNH/VIDEO) ================= */}
      {bannerMode === 'video' && (
        <BlurButton
          style={styles.circleBtnInner}
          containerStyle={styles.circleBtnWrapRightTop}
          onPress={togglePlayPause}
          accessibilityLabel={
            isPlaying
              ? (t('pauseVideo') || 'Tạm dừng video')
              : (t('resumeVideo') || 'Tiếp tục phát video')
          }
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color="#FFFFFF"
            style={!isPlaying ? { marginLeft: 2 } : undefined}
          />
        </BlurButton>
      )}

      {/* ================= 6. NÚT CHUYỂN ĐỔI CHẾ ĐỘ TRÒN (GÓC PHẢI DƯỚI) ================= */}
      <BlurButton
        style={styles.circleBtnInner}
        containerStyle={styles.circleBtnWrapRight}
        onPress={handleToggleMode}
        accessibilityLabel={
          bannerMode === 'video'
            ? (t('bannerModeImage') || 'Chuyển sang xem ảnh')
            : (t('bannerModeVideo') || 'Chuyển sang xem video')
        }
      >
        <Ionicons
          name={bannerMode === 'video' ? 'images-outline' : 'videocam'}
          size={20}
          color="#FFFFFF"
        />
      </BlurButton>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: HERO_BANNER_HEIGHT,
    position: 'relative',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  touchSlide: {
    width: SCREEN_WIDTH,
    height: HERO_BANNER_HEIGHT,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  // Nút tròn Tạm dừng / Tiếp tục ở trên nút chuyển đổi chế độ
  circleBtnWrapRightTop: {
    position: 'absolute',
    bottom: 84,
    right: 16,
    zIndex: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  dotsWrap: {
    position: 'absolute',
    bottom: 34,
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
  // Nút tròn âm thanh bên trái (Liquid Glass 40x40 tròn)
  circleBtnWrapLeft: {
    position: 'absolute',
    bottom: 34,
    left: 16,
    zIndex: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  // Nút tròn chuyển đổi bên phải (Liquid Glass 40x40 tròn)
  circleBtnWrapRight: {
    position: 'absolute',
    bottom: 34,
    right: 16,
    zIndex: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  circleBtnInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
