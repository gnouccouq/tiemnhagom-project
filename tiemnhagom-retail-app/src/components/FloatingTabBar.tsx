// src/components/FloatingTabBar.tsx
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
import { useThemeColor } from '../constants/theme';
import { usePOS } from '../context/POSContext';
import { useAuth } from '../context/AuthContext';
import { LiquidGlass } from './LiquidGlass';

const BAR_HEIGHT = 64;
const BAR_PADDING = 6;
const DRAG_THRESHOLD = 6;
const BAR_ZOOM = 1.05;
const TAP_ZOOM = 1.015;

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
  const { checkPermission } = useAuth();
  const [barWidth, setBarWidth] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const barScale = useRef(new Animated.Value(1)).current;
  const barRef = useRef<View>(null);
  const barPageX = useRef(0);
  const isDragging = useRef(false);

  const { cart } = usePOS();
  const posCartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const zoomBar = (mode: 'tap' | 'drag' | 'release') => {
    const config =
      mode === 'drag'
        ? { toValue: BAR_ZOOM, friction: 4, tension: 180 }
        : mode === 'tap'
          ? { toValue: TAP_ZOOM, friction: 12, tension: 300 }
          : isDragging.current
            ? { toValue: 1, friction: 3.5, tension: 180 }
            : { toValue: 1, friction: 12, tension: 300 };
    Animated.spring(barScale, { ...config, useNativeDriver: true }).start();
  };

  const routes = useMemo(() => {
    const filtered = state.routes.filter((r: any) => {
      const opts = descriptors[r.key]?.options;
      if (opts?.tabBarStyle?.display === 'none') return false;
      if (r.name === 'index') return checkPermission('overview');
      if (r.name === 'orders') return checkPermission('orders');
      if (r.name === 'pos') return checkPermission('pos');
      if (r.name === 'inventory') return checkPermission('inventory');
      if (r.name === 'more') return true;
      return true;
    });
    return filtered.length > 0 ? filtered : state.routes;
  }, [state.routes, descriptors, checkPermission]);

  const tabCount = routes.length;
  const itemWidth = barWidth > 0 && tabCount > 0 ? (barWidth - BAR_PADDING * 2) / tabCount : 0;
  const activeRouteKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(0, routes.findIndex((r: any) => r.key === activeRouteKey));

  const latest = useRef({ itemWidth, tabCount, activeIndex, routes, navigation, barWidth });
  latest.current = { itemWidth, tabCount, activeIndex, routes, navigation, barWidth };

  const springTo = (index: number) => {
    Animated.spring(translateX, {
      toValue: index * itemWidth,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (barWidth > 0 && !isDragging.current) {
      springTo(activeIndex);
    }
  }, [activeIndex, barWidth, itemWidth]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > DRAG_THRESHOLD && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (evt) => {
          isDragging.current = true;
          zoomBar('drag');
          Animated.spring(pillScale, {
            toValue: 0.92,
            friction: 5,
            tension: 200,
            useNativeDriver: true,
          }).start();
          barRef.current?.measure((_x, _y, _w, _h, pageX) => {
            barPageX.current = pageX;
            updateDragFromTouch(evt.nativeEvent.pageX);
          });
        },
        onPanResponderMove: (evt) => {
          updateDragFromTouch(evt.nativeEvent.pageX);
        },
        onPanResponderRelease: () => {
          finishDrag();
        },
        onPanResponderTerminate: () => {
          finishDrag();
        },
      }),
    [itemWidth, tabCount]
  );

  const updateDragFromTouch = (pageX: number) => {
    const { itemWidth: iw, tabCount: count, barWidth: bw } = latest.current;
    if (iw <= 0 || count <= 0) return;
    const relX = pageX - barPageX.current - BAR_PADDING;
    const clampedX = Math.max(0, Math.min(bw - BAR_PADDING * 2 - iw, relX - iw / 2));
    translateX.setValue(clampedX);
    const rawTarget = Math.round(clampedX / iw);
    if (!isNaN(rawTarget)) {
      const targetIdx = Math.max(0, Math.min(count - 1, rawTarget));
      setDragIndex(targetIdx);
    }
  };

  const finishDrag = () => {
    const { itemWidth: iw, routes: rts, navigation: nav, activeIndex: currIdx } = latest.current;
    zoomBar('release');
    isDragging.current = false;
    Animated.spring(pillScale, {
      toValue: 1,
      friction: 5,
      tension: 180,
      useNativeDriver: true,
    }).start();

    if (!rts || rts.length === 0 || iw <= 0) {
      setDragIndex(null);
      return;
    }

    translateX.stopAnimation((finalX) => {
      const rawIdx = Math.round(finalX / iw);
      if (isNaN(rawIdx)) {
        setDragIndex(null);
        return;
      }
      const targetIdx = Math.max(0, Math.min(rts.length - 1, rawIdx));
      setDragIndex(null);
      springTo(targetIdx);
      if (targetIdx !== currIdx) {
        const route = rts[targetIdx];
        if (route && route.key) {
          const event = nav.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!event.defaultPrevented) {
            nav.navigate(route.name);
          }
        }
      }
    });
  };

  const handlePress = (index: number, route: any, isFocused: boolean) => {
    if (!route || !route.key) return;
    zoomBar('tap');
    setTimeout(() => zoomBar('release'), 140);
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setBarWidth(w);
  };

  const activePillIndex = dragIndex !== null ? dragIndex : activeIndex;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outerContainer,
        {
          bottom: Math.max(insets.bottom - 4, 8),
        },
      ]}
    >
      <Animated.View
        ref={barRef}
        style={[styles.barWrapper, { transform: [{ scale: barScale }] }]}
        onLayout={onLayout}
      >
        <LiquidGlass style={styles.bar} {...panResponder.panHandlers}>
          {barWidth > 0 && tabCount > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.slidingPill,
                {
                  width: itemWidth,
                  transform: [{ translateX }, { scale: pillScale }],
                },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? [
                        'rgba(255, 255, 255, 0.70)',
                        'rgba(232, 204, 178, 0.45)',
                        'rgba(156, 113, 86, 0.35)',
                        'rgba(160, 210, 255, 0.45)',
                        'rgba(255, 255, 255, 0.60)',
                      ]
                    : [
                        'rgba(255, 255, 255, 0.95)',
                        'rgba(255, 185, 130, 0.75)',
                        'rgba(240, 120, 150, 0.55)',
                        'rgba(130, 210, 255, 0.65)',
                        'rgba(255, 255, 255, 0.95)',
                      ]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pillCausticBorder}
              >
                <View style={styles.pillLiquidInner}>
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(255, 255, 255, 0.38)', 'rgba(255, 255, 255, 0.08)', 'transparent']
                        : ['rgba(255, 255, 255, 0.88)', 'rgba(255, 255, 255, 0.22)', 'transparent']
                    }
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.pillTopGloss}
                  />
                  <View style={styles.pillBottomEdge} />
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          <View style={styles.tabRow}>
            {routes.map((route: any, index: number) => {
              if (!route || !route.key) return null;
              const descriptor = descriptors[route.key];
              if (!descriptor) return null;
              const { options } = descriptor;
              const isFocused = index === activeIndex;
              const isVisualActive = index === activePillIndex;
              const label =
                options.tabBarLabel !== undefined
                  ? options.tabBarLabel
                  : options.title !== undefined
                  ? options.title
                  : route.name;

              const isPOS = route.name === 'pos';

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  onPress={() => handlePress(index, route, isFocused)}
                  style={styles.tabItem}
                >
                  <View style={styles.iconWrap}>
                    {options.tabBarIcon &&
                      options.tabBarIcon({
                        focused: isVisualActive,
                        color: isVisualActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                        size: 22,
                      })}
                    {isPOS && posCartCount > 0 && (
                      <View style={styles.badgeWrap}>
                        <Text style={styles.badgeText}>{posCartCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      {
                        color: isVisualActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                        fontWeight: isVisualActive ? '700' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </LiquidGlass>
      </Animated.View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    outerContainer: {
      position: 'absolute',
      left: 14,
      right: 14,
      alignItems: 'center',
      zIndex: 9999,
    },
    barWrapper: {
      width: '100%',
      maxWidth: 520,
    },
    bar: {
      width: '100%',
      height: BAR_HEIGHT,
      borderRadius: BAR_HEIGHT / 2,
      padding: BAR_PADDING,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(18, 18, 18, 0.72)' : 'rgba(255, 255, 255, 0.82)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.85)',
      shadowColor: isDark ? '#000000' : '#9C7156',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.45 : 0.16,
      shadowRadius: 14,
      elevation: 8,
    },
    tabRow: {
      flex: 1,
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      alignItems: 'center',
    },
    tabItem: {
      flex: 1,
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    iconWrap: {
      position: 'relative',
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeWrap: {
      position: 'absolute',
      top: -4,
      right: -10,
      backgroundColor: '#9C7156',
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: '700',
    },
    tabLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      marginTop: 2,
    },
    slidingPill: {
      position: 'absolute',
      top: BAR_PADDING,
      bottom: BAR_PADDING,
      left: BAR_PADDING,
      borderRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2,
      zIndex: 1,
      overflow: 'hidden',
    },
    pillCausticBorder: {
      flex: 1,
      padding: 1.4,
      borderRadius: (BAR_HEIGHT - BAR_PADDING * 2) / 2,
    },
    pillLiquidInner: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.85)',
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
    },
    pillBottomEdge: {
      position: 'absolute',
      bottom: 2,
      left: '20%',
      right: '20%',
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.45)',
    },
  });
