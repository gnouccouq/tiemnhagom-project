// src/components/FloatingTabBar.tsx
// Thanh điều hướng đáy chuẩn Apple Liquid Glass (Mục 5 GEMINI.md - Cách 2)
// Kết hợp trọn bộ 5 icon Tabler Icons: icon-smart-home, icon-layout-grid, icon-tag, icon-user, icon-shopping-bag
// Bố cục 2 khối: Thanh viên thuốc 4 tab bên trái + Nút tròn giỏ hàng độc lập bên phải
// Bọc trong LiquidGlassContainerView spacing={18} tạo hiệu ứng kéo giãn giọt nước khi chạm/nhấn giữ
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useThemeColor } from '../constants/theme';
import { useCart } from '../context/CartContext';
import { LiquidGlass, LiquidGlassContainerView } from './LiquidGlass';
import {
  TablerHomeIcon,
  TablerCategoryIcon,
  TablerDealsIcon,
  TablerProfileIcon,
  TablerCartIcon,
} from './TablerIcons';

const BAR_HEIGHT = 60;
const CART_BUTTON_SIZE = 60;
const PILL_PADDING = 5;

type Props = {
  state: any;
  descriptors: Record<string, any>;
  navigation: any;
};

export default function FloatingTabBar({ state, descriptors, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);

  // Màu sắc thương hiệu Tiệm Nhà Gốm
  const ACTIVE_COLOR = isDark ? '#E8CCB2' : '#9C7156';
  const INACTIVE_COLOR = isDark ? '#9E968D' : '#6E665D';

  const { cartCount, cartBounceKey } = useCart();
  const [leftBarWidth, setLeftBarWidth] = useState(0);

  // Animation values
  const translateX = useRef(new Animated.Value(0)).current;
  const cartIconScale = useRef(new Animated.Value(1)).current;
  const cartButtonScale = useRef(new Animated.Value(1)).current;

  // 4 tab nằm trong thanh viên thuốc bên trái
  const allRoutes = state.routes.filter((r: any) => {
    const opts = descriptors[r.key]?.options;
    return opts?.href !== null && opts?.tabBarItemStyle?.display !== 'none';
  });

  const leftRoutes = allRoutes.filter((r: any) => r.name !== 'cart');
  const activeRouteKey = state.routes[state.index]?.key;
  const leftActiveIndex = leftRoutes.findIndex((r: any) => r.key === activeRouteKey);
  const leftItemWidth = leftBarWidth > 0 ? (leftBarWidth - PILL_PADDING * 2) / Math.max(leftRoutes.length, 1) : 0;

  // Trượt bọt kính (Sliding Indicator) mượt mà đến vị trí tab đang chọn
  useEffect(() => {
    if (leftItemWidth > 0 && leftActiveIndex !== -1) {
      Animated.spring(translateX, {
        toValue: leftActiveIndex * leftItemWidth,
        useNativeDriver: true,
        damping: 20,
        stiffness: 220,
        mass: 0.8,
      }).start();
    }
  }, [leftActiveIndex, leftItemWidth]);

  // Hiệu ứng nảy giỏ hàng (Cart Bounce Pop) khi thêm sản phẩm thành công
  useEffect(() => {
    if (cartBounceKey > 0) {
      Animated.sequence([
        Animated.timing(cartIconScale, {
          toValue: 1.38,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(cartIconScale, {
          toValue: 1,
          friction: 3.5,
          tension: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [cartBounceKey]);

  // Điều hướng tab
  const handleTabPress = (route: any, isCurrentlyActive: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isCurrentlyActive && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  // Hiệu ứng kéo giãn giọt nước khi nhấn giữ/chạm vào nút giỏ hàng (iOS 26 Liquid Droplet Stretch)
  const onCartPressIn = () => {
    Animated.spring(cartButtonScale, {
      toValue: 1.12,
      friction: 5,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const onCartPressOut = () => {
    Animated.spring(cartButtonScale, {
      toValue: 1,
      friction: 5,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  // Ẩn thanh tab nếu màn hình con yêu cầu
  const focusedOptions = descriptors[activeRouteKey]?.options;
  if (focusedOptions?.tabBarStyle?.display === 'none') return null;

  // Render icon Tabler cho từng tab tương ứng
  const renderTablerIcon = (routeName: string, focused: boolean, color: string) => {
    const iconSize = 24;
    const strokeWidth = focused ? 2.1 : 1.8;

    switch (routeName) {
      case 'index':
        return (
          <TablerHomeIcon
            size={iconSize}
            color={color}
            stroke={strokeWidth}
            focused={focused}
          />
        );
      case 'products':
        return (
          <TablerCategoryIcon
            size={iconSize}
            color={color}
            stroke={strokeWidth}
            focused={focused}
          />
        );
      case 'deals':
        return (
          <TablerDealsIcon
            size={iconSize}
            color={color}
            stroke={strokeWidth}
            focused={focused}
          />
        );
      case 'profile':
        return (
          <TablerProfileIcon
            size={iconSize}
            color={color}
            stroke={strokeWidth}
            focused={focused}
          />
        );
      case 'cart':
        return (
          <TablerCartIcon
            size={iconSize + 1}
            color={color}
            stroke={strokeWidth}
            focused={focused}
          />
        );
      default:
        return (
          <TablerHomeIcon
            size={iconSize}
            color={color}
            stroke={strokeWidth}
            focused={focused}
          />
        );
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: Math.max(insets.bottom - 4, 10) }]}
    >
      {/* Container chuẩn Apple Liquid Glass nối kết giọt nước với spacing={18} */}
      <LiquidGlassContainerView spacing={18} style={styles.containerRow}>
        {/* 1. THANH VIÊN THUỐC BÊN TRÁI: Chứa 4 tab mộc mạc (Trang chủ, Danh mục, Ưu đãi, Cá nhân) */}
        <View
          style={styles.leftPillWrapper}
          onLayout={(e) => setLeftBarWidth(e.nativeEvent.layout.width)}
        >
          <LiquidGlass
            interactive={true}
            effect="regular"
            style={styles.leftPillBar}
          >
            {/* Bọt kính trượt nhẹ nhàng giữa các tab (tuyệt đối không dùng 4 lớp giả kính) */}
            {leftItemWidth > 0 && leftActiveIndex !== -1 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.slidingIndicator,
                  {
                    width: leftItemWidth,
                    transform: [{ translateX }],
                  },
                ]}
              >
                <View style={styles.indicatorPill} />
              </Animated.View>
            )}

            {/* Danh sách 4 icon Tabler */}
            <View style={styles.leftItemsRow}>
              {leftRoutes.map((route: any, index: number) => {
                const { options } = descriptors[route.key];
                const isFocused = index === leftActiveIndex;
                const iconColor = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;
                const label =
                  typeof options.tabBarLabel === 'string'
                    ? options.tabBarLabel
                    : options.title ?? route.name;

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={isFocused ? { selected: true } : {}}
                    accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                    testID={`tab-${route.name}`}
                    onPress={() => handleTabPress(route, isFocused)}
                    style={styles.tabItem}
                  >
                    <View style={styles.iconContainer}>
                      {renderTablerIcon(route.name, isFocused, iconColor)}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </LiquidGlass>
        </View>

        {/* 2. VIÊN BI KÍNH TRÒN GIỎ HÀNG BÊN PHẢI: Nút tròn độc lập tách rời với hiệu ứng đàn hồi giọt nước */}
        <Animated.View
          style={[
            styles.cartWrapper,
            {
              transform: [
                { scale: Animated.multiply(cartButtonScale, cartIconScale) },
              ],
            },
          ]}
        >
          <LiquidGlass
            interactive={true}
            effect="regular"
            style={styles.cartCircle}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Giỏ hàng"
              testID="tab-cart"
              onPressIn={onCartPressIn}
              onPressOut={onCartPressOut}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch {}
                router.push('/cart');
              }}
              style={styles.cartPressable}
            >
              <View style={styles.cartIconWrapper}>
                {renderTablerIcon('cart', false, isDark ? '#F5F5F5' : '#2B2928')}
                {/* Badge số lượng sản phẩm trên giỏ hàng */}
                {cartCount > 0 && (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>
                      {cartCount > 99 ? '99+' : cartCount}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          </LiquidGlass>
        </Animated.View>
      </LiquidGlassContainerView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 14,
      right: 14,
      alignItems: 'center',
    },
    containerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      width: '100%',
    },
    leftPillWrapper: {
      flex: 1,
      height: BAR_HEIGHT,
      borderRadius: BAR_HEIGHT / 2,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 10,
      elevation: 6,
    },
    leftPillBar: {
      height: BAR_HEIGHT,
      borderRadius: BAR_HEIGHT / 2,
      paddingHorizontal: PILL_PADDING,
      overflow: 'hidden',
    },
    slidingIndicator: {
      position: 'absolute',
      top: PILL_PADDING,
      bottom: PILL_PADDING,
      left: PILL_PADDING,
      justifyContent: 'center',
      alignItems: 'center',
    },
    indicatorPill: {
      width: '88%',
      height: '84%',
      borderRadius: (BAR_HEIGHT - PILL_PADDING * 2) / 2,
      backgroundColor: isDark
        ? 'rgba(232, 204, 178, 0.16)'
        : 'rgba(156, 113, 86, 0.12)',
    },
    leftItemsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    tabItem: {
      flex: 1,
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconContainer: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartWrapper: {
      width: CART_BUTTON_SIZE,
      height: CART_BUTTON_SIZE,
      borderRadius: CART_BUTTON_SIZE / 2,
      shadowColor: isDark ? '#000000' : '#9C7156',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.40 : 0.20,
      shadowRadius: 10,
      elevation: 8,
    },
    cartCircle: {
      width: CART_BUTTON_SIZE,
      height: CART_BUTTON_SIZE,
      borderRadius: CART_BUTTON_SIZE / 2,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartCircleActive: {
      borderWidth: 1.5,
      borderColor: '#9C7156',
    },
    cartPressable: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartIconWrapper: {
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartBadge: {
      position: 'absolute',
      top: -6,
      right: -10,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#9C7156',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: isDark ? '#121212' : '#FFFFFF',
    },
    cartBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
  });
