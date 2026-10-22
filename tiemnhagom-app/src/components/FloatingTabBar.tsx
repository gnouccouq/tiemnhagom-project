import { useThemeColor } from '../constants/theme';
// src/components/FloatingTabBar.tsx
// Floating "pill" bottom tab bar with frosted-glass background and a sliding active indicator.
// Supports tap-to-switch AND press-and-drag: slide your finger across the bar, the pill follows,
// release to jump to the tab under your finger.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';
import { LiquidGlass } from './LiquidGlass';


const BAR_HEIGHT = 64;
const BAR_PADDING = 6;
const DRAG_THRESHOLD = 6;
const BAR_ZOOM = 1.05; // zoom while dragging (bouncy)
const TAP_ZOOM = 1.015; // zoom on a simple tap (subtle)

type Props = {
  state: any;
  descriptors: Record<string, any>;
  navigation: any;
};

export default function FloatingTabBar({ state, descriptors, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const ACTIVE_COLOR = Colors.textPrimary;
  const INACTIVE_COLOR = Colors.textMuted;
  const [barWidth, setBarWidth] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const barScale = useRef(new Animated.Value(1)).current;
  const barRef = useRef<View>(null);
  const barPageX = useRef(0);
  const isDragging = useRef(false);

  const { cartBounceKey } = useCart();
  const cartIconScale = useRef(new Animated.Value(1)).current;

  // Hiệu ứng nảy giỏ hàng (Cart Bounce Pop) khi thêm sản phẩm thành công
  useEffect(() => {
    if (cartBounceKey > 0) {
      Animated.sequence([
        Animated.timing(cartIconScale, {
          toValue: 1.45,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(cartIconScale, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [cartBounceKey]);

  // Zoom of the whole bar: subtle on tap, bouncy while dragging
  const zoomBar = (mode: 'tap' | 'drag' | 'release') => {
    const config =
      mode === 'drag'
        ? { toValue: BAR_ZOOM, friction: 4, tension: 180 }
        : mode === 'tap'
          ? { toValue: TAP_ZOOM, friction: 12, tension: 300 }
          : isDragging.current
            ? { toValue: 1, friction: 3.5, tension: 180 } // bounce back after drag
            : { toValue: 1, friction: 12, tension: 300 }; // gentle return after tap
    Animated.spring(barScale, { ...config, useNativeDriver: true }).start();
  };

  const routes = state.routes.filter((r: any) => {
    const opts = descriptors[r.key]?.options;
    return opts?.href !== null && opts?.tabBarItemStyle?.display !== 'none';
  });
  const tabCount = routes.length;
  const itemWidth = barWidth > 0 ? (barWidth - BAR_PADDING * 2) / tabCount : 0;
  const activeRouteKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(0, routes.findIndex((r: any) => r.key === activeRouteKey));

  // Keep latest values for the gesture handlers (PanResponder is memoized)
  const latest = useRef({ itemWidth, tabCount, activeIndex, routes, navigation, barWidth });
  latest.current = { itemWidth, tabCount, activeIndex, routes, navigation, barWidth };

  const springTo = (index: number) => {
    Animated.spring(translateX, {
      toValue: index * latest.current.itemWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
    }).start();
  };

  useEffect(() => {
    if (!itemWidth || dragIndex !== null) return;
    springTo(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, itemWidth]);

  const goToIndex = (index: number) => {
    const { routes: rs, navigation: nav, activeIndex: current } = latest.current;
    const route = rs[index];
    if (!route) return;
    const event = nav.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (index !== current && !event.defaultPrevented) {
      nav.navigate(route.name, route.params);
    }
  };

  const panResponder = useMemo(() => {
    // Convert absolute finger X to pill offset & tab index
    const resolve = (pageX: number) => {
      const { itemWidth: w, tabCount: n, barWidth: bw } = latest.current;
      // Undo the zoom so the pill stays under the finger while the bar is scaled up
      const center = barPageX.current + bw / 2;
      const unscaledX = center + (pageX - center) / BAR_ZOOM;
      const localX = unscaledX - barPageX.current - BAR_PADDING;
      const maxOffset = (n - 1) * w;
      const offset = Math.min(Math.max(localX - w / 2, 0), maxOffset);
      const index = Math.min(Math.max(Math.floor(localX / w), 0), n - 1);
      return { offset, index };
    };

    return PanResponder.create({
      // Let taps go to the Pressables; only take over once the finger moves horizontally
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD && Math.abs(g.dx) > Math.abs(g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => {
        translateX.stopAnimation();
        isDragging.current = true;
        zoomBar('drag');
        Animated.spring(pillScale, { toValue: 1.1, useNativeDriver: true, friction: 6 }).start();
        const { offset, index } = resolve(g.moveX);
        translateX.setValue(offset);
        setDragIndex(index);
      },
      onPanResponderMove: (_, g) => {
        const { offset, index } = resolve(g.moveX);
        translateX.setValue(offset);
        setDragIndex((prev) => (prev === index ? prev : index));
      },
      onPanResponderRelease: (_, g) => {
        const { index } = resolve(g.moveX);
        zoomBar('release');
        isDragging.current = false;
        Animated.spring(pillScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
        springTo(index);
        setDragIndex(null);
        goToIndex(index);
      },
      onPanResponderTerminate: () => {
        zoomBar('release');
        isDragging.current = false;
        Animated.spring(pillScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
        springTo(latest.current.activeIndex);
        setDragIndex(null);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide the bar if the focused screen requests it
  const focusedOptions = descriptors[activeRouteKey]?.options;
  if (focusedOptions?.tabBarStyle?.display === 'none') return null;

  const onLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
    barRef.current?.measureInWindow((x) => {
      barPageX.current = x;
    });
  };

  const highlightedIndex = dragIndex ?? activeIndex;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: Math.max(insets.bottom - 10, 6) }]}
    >
      <Animated.View
        ref={barRef}
        style={[styles.shadow, { transform: [{ scale: barScale }] }]}
        onLayout={onLayout}
      >
        <LiquidGlass style={styles.bar} {...panResponder.panHandlers}>
          {/* Sliding Apple Liquid Glass active pill */}
          {itemWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activePill,
                dragIndex !== null && styles.activePillDragging,
                { width: itemWidth, transform: [{ translateX }, { scale: pillScale }] },
              ]}
            >
              {/* Viền quang học kính Apple Liquid Glass (Pure Crystal Rim) */}
              <LinearGradient
                colors={
                  isDark
                    ? [
                      'rgba(255, 255, 255, 0.45)',
                      'rgba(255, 255, 255, 0.15)',
                      'rgba(232, 204, 178, 0.20)',
                      'rgba(255, 255, 255, 0.10)',
                      'rgba(255, 255, 255, 0.35)',
                    ]
                    : [
                      'rgba(255, 255, 255, 0.95)',
                      'rgba(255, 255, 255, 0.60)',
                      'rgba(232, 204, 178, 0.30)',
                      'rgba(255, 255, 255, 0.50)',
                      'rgba(255, 255, 255, 0.90)',
                    ]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pillIridescentRim}
              >
                <View style={styles.pillLiquidInner}>
                  {/* Thấu kính mờ quang học (Frosted Glass Refraction) */}
                  <BlurView
                    intensity={Platform.OS === 'ios' ? 45 : 32}
                    tint={isDark ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Lớp nền men gốm bán trong suốt */}
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255, 255, 255, 0.10)'
                          : 'rgba(255, 255, 255, 0.48)',
                      },
                    ]}
                  />

                  {/* Vệt sáng bóng bề mặt chất lỏng (Specular Gloss Highlight) */}
                  <LinearGradient
                    colors={[
                      isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.88)',
                      isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.22)',
                      'rgba(255, 255, 255, 0)',
                    ]}
                    locations={[0, 0.45, 1]}
                    style={styles.pillTopGloss}
                  />

                  {/* Ánh phản chiếu viền đáy */}
                  <View style={styles.pillBottomReflect} />
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : options.title ?? route.name;
            const isFocused = index === highlightedIndex;
            const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={index === activeIndex ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                testID={`tab-${route.name}`}
                onPress={() => goToIndex(index)}
                onPressIn={() => zoomBar('tap')}
                onPressOut={() => {
                  if (!isDragging.current) zoomBar('release');
                }}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={styles.item}
              >
                {route.name === 'cart' ? (
                  <Animated.View style={{ transform: [{ scale: cartIconScale }] }}>
                    {options.tabBarIcon?.({ focused: isFocused, color, size: 24 })}
                  </Animated.View>
                ) : (
                  options.tabBarIcon?.({ focused: isFocused, color, size: 24 })
                )}
                <Text
                  numberOfLines={1}
                  style={[styles.label, { color, fontWeight: isFocused ? '700' : '500' }]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </LiquidGlass>
      </Animated.View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  shadow: {
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: 'transparent',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: Colors.cardBackground === '#FFFFFF' ? 0.08 : 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_PADDING,
    overflow: 'hidden',
  },
  glassOverlay: {
    backgroundColor: Colors.cardBackground === '#FFFFFF'
      ? (Platform.OS === 'ios' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.35)')
      : (Platform.OS === 'ios' ? 'rgba(30,30,30,0.25)' : 'rgba(30,30,30,0.35)'),
  },
  activePill: {
    position: 'absolute',
    left: BAR_PADDING,
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    borderRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2,
    shadowColor: isDark ? '#000000' : '#9C7156',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.38 : 0.20,
    shadowRadius: 7,
    elevation: 4,
  },
  activePillDragging: {
    shadowOpacity: isDark ? 0.48 : 0.28,
    shadowRadius: 10,
  },
  pillIridescentRim: {
    flex: 1,
    borderRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2,
    padding: 1.4,
  },
  pillLiquidInner: {
    flex: 1,
    borderRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2 - 1.4,
    overflow: 'hidden',
    position: 'relative',
  },
  pillTopGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    borderTopLeftRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2 - 1.4,
    borderTopRightRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2 - 1.4,
  },
  pillBottomReflect: {
    position: 'absolute',
    bottom: 0.5,
    left: '22%',
    right: '22%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 1,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.1,
  },
});
