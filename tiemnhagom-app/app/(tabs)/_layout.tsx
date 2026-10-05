// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { House, SquaresFour, Handbag, Tag, User } from 'phosphor-react-native';
import { View, Text, StyleSheet } from 'react-native';
import FloatingTabBar from '../../src/components/FloatingTabBar';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '../../src/constants/theme';

export default function TabLayout() {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const { unreadCount } = useNotificationBadge();
  const { cartCount } = useCart();
  const { t } = useSettings();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* 1. Trang chủ */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, focused }) => (
            <House size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />

      {/* 2. Danh mục */}
      <Tabs.Screen
        name="products"
        options={{
          title: t('categories'),
          tabBarIcon: ({ color, focused }) => (
            <SquaresFour size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />

      {/* 3. Giỏ hàng */}
      <Tabs.Screen
        name="cart"
        options={{
          title: t('cartTab'),
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWithBadge}>
              <Handbag size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />
              {cartCount > 0 && (
                <View style={styles.badgeCount}>
                  <Text style={styles.badgeCountText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      {/* 4. Ưu đãi */}
      <Tabs.Screen
        name="deals"
        options={{
          title: t('deals'),
          tabBarIcon: ({ color, focused }) => (
            <Tag size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />

      {/* 5. Tài khoản */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, focused }) => (
            <User size={25} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
    </Tabs>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    elevation: 6,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  tabBarItem: {
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  iconWithBadge: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCount: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.badgeSale,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.cardBackground,
  },
  badgeCountText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: '700',
  },
});
