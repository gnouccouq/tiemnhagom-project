// src/components/InAppNotificationBanner.tsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { inAppNotification, InAppNotificationPayload } from '../services/inAppNotificationService';
import { useNotificationBadge } from '../context/NotificationBadgeContext';
import { useThemeColor, checkIsDark } from '../constants/theme';
import { useSettings } from '../context/SettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const InAppNotificationBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const themeColors = useThemeColor();
  const isDark = checkIsDark(themeColors);
  const { t } = useSettings();
  const { markAsRead } = useNotificationBadge();

  const [notification, setNotification] = useState<InAppNotificationPayload | null>(null);
  const [visible, setVisible] = useState<boolean>(false);

  const translateYAnim = useRef(new Animated.Value(-160)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoHideTimerRef = useRef<any>(null);
  const isDraggingRef = useRef<boolean>(false);

  // Tính toán top offset dựa trên Dynamic Island / Tai thỏ / Notch / Android status bar
  const topOffset = useMemo(() => {
    if (insets.top > 0) {
      return insets.top + (Platform.OS === 'android' ? 6 : 4);
    }
    return Platform.OS === 'android' ? 24 : 14;
  }, [insets.top]);

  const clearTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const hideBanner = useCallback((callback?: () => void) => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateYAnim, {
        toValue: -180,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setNotification(null);
      if (callback) callback();
    });
  }, [clearTimer, translateYAnim, opacityAnim]);

  const showBanner = useCallback((payload: InAppNotificationPayload) => {
    clearTimer();
    setNotification(payload);
    setVisible(true);

    translateYAnim.setValue(-160);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(translateYAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 240,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    // Hẹn giờ tự động ẩn
    const duration = payload.duration || 4800;
    autoHideTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current) {
        hideBanner();
      }
    }, duration);
  }, [clearTimer, hideBanner, translateYAnim, opacityAnim]);

  // Lắng nghe sự kiện hiển thị từ InAppNotificationManager
  useEffect(() => {
    const unsubShow = inAppNotification.onShow((payload) => {
      showBanner(payload);
    });

    const unsubDismiss = inAppNotification.onDismiss(() => {
      hideBanner();
    });

    return () => {
      unsubShow();
      unsubDismiss();
      clearTimer();
    };
  }, [showBanner, hideBanner, clearTimer]);

  const handlePress = useCallback(() => {
    if (!notification) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const target = notification;
    hideBanner(() => {
      if (target.id) {
        markAsRead(target.id).catch(() => {});
      }

      if (target.link) {
        try {
          router.push(target.link as any);
          return;
        } catch {}
      }

      // Điều hướng thông minh theo loại thông báo
      if (target.type === 'order') {
        router.push('/(tabs)/profile' as any);
      } else {
        router.push('/notifications' as any);
      }
    });
  }, [notification, hideBanner, markAsRead, router]);

  // Bộ bắt cử chỉ vuốt lên để ẩn & chạm để mở
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return Math.abs(gestureState.dy) > 4;
        },
        onPanResponderGrant: () => {
          isDraggingRef.current = true;
          clearTimer();
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (gestureState.dy < 0) {
            // Kéo lên
            translateYAnim.setValue(gestureState.dy);
          } else {
            // Kháng lực nhẹ khi kéo xuống
            translateYAnim.setValue(gestureState.dy * 0.25);
          }
        },
        onPanResponderRelease: (_evt, gestureState) => {
          isDraggingRef.current = false;

          // Nếu di chuyển rất nhỏ, coi như là cú chạm (Tap)
          if (Math.abs(gestureState.dy) <= 6 && Math.abs(gestureState.dx) <= 6) {
            handlePress();
            return;
          }

          // Nếu vuốt lên nhanh hoặc vượt qua ngưỡng -20px
          if (gestureState.dy < -20 || gestureState.vy < -0.45) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            hideBanner();
          } else {
            // Bật nảy lại vị trí cũ
            Animated.spring(translateYAnim, {
              toValue: 0,
              damping: 18,
              stiffness: 260,
              useNativeDriver: true,
            }).start();

            // Khởi động lại hẹn giờ ẩn sau khi người dùng thả tay
            autoHideTimerRef.current = setTimeout(() => {
              hideBanner();
            }, 3500);
          }
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          Animated.spring(translateYAnim, {
            toValue: 0,
            damping: 18,
            stiffness: 260,
            useNativeDriver: true,
          }).start();
        },
      }),
    [clearTimer, hideBanner, handlePress, translateYAnim]
  );

  if (!visible || !notification) {
    return null;
  }

  // Xác định icon hiển thị
  const renderIcon = () => {
    if (notification.imageUrl) {
      return (
        <Image
          source={{ uri: notification.imageUrl }}
          style={styles.thumbnailImg}
          contentFit="cover"
          transition={200}
        />
      );
    }

    let iconName: any = 'notifications';
    if (notification.icon) {
      iconName = notification.icon;
    } else if (notification.type === 'order') {
      iconName = 'cube';
    } else if (notification.type === 'promo') {
      iconName = 'pricetag';
    } else if (notification.type === 'news') {
      iconName = 'newspaper';
    }

    return (
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: isDark ? 'rgba(156, 113, 86, 0.24)' : '#F7EFE6',
          },
        ]}
      >
        <Ionicons name={iconName} size={20} color="#9C7156" />
      </View>
    );
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topOffset,
          opacity: opacityAnim,
          transform: [{ translateY: translateYAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#1C1A18' : '#FFFFFF',
            borderColor: isDark ? 'rgba(232, 204, 178, 0.24)' : '#E8CCB2',
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Header hàng trên: Logo thương hiệu + Tên app + Thời gian + Nút X */}
        <View style={styles.topRow}>
          <View style={styles.brandGroup}>
            <Image
              source={require('../../assets/images/LOGO_2_PNG.png')}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <Text style={styles.brandName}>TIỆM NHÀ GỐM</Text>
            <View style={styles.dotSeparator} />
            <Text style={[styles.timeText, { color: isDark ? '#A0988E' : '#8E867E' }]}>
              {t('justNow') || 'Vừa xong'}
            </Text>
          </View>

          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => hideBanner()}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={16} color={isDark ? '#A0988E' : '#8E867E'} />
          </TouchableOpacity>
        </View>

        {/* Nội dung thông báo: Icon/Ảnh + Tiêu đề + Nội dung tóm tắt */}
        <View style={styles.contentRow}>
          {renderIcon()}

          <View style={styles.textCol}>
            <Text
              style={[
                styles.title,
                { color: isDark ? '#F5F5F5' : '#2B2928' },
              ]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <Text
              style={[
                styles.message,
                { color: isDark ? '#BDB7AF' : '#6E665D' },
              ]}
              numberOfLines={2}
            >
              {notification.message}
            </Text>
          </View>
        </View>

        {/* Thanh gạt nhỏ dưới đáy báo hiệu vuốt lên */}
        <View
          style={[
            styles.bottomHandle,
            { backgroundColor: isDark ? '#383430' : '#E8E1D8' },
          ]}
        />
      </View>
    </Animated.View>
  );
};

export default InAppNotificationBanner;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 99999,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 6,
  },
  brandName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#9C7156',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#C8B89A',
    marginHorizontal: 6,
  },
  timeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '500',
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  thumbnailImg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: '#FAF8F5',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  message: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    lineHeight: 17,
  },
  bottomHandle: {
    width: 32,
    height: 3.5,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 4,
  },
});

