// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';

export default function TabLayout() {
  const { unreadCount } = useNotificationBadge();
  const { cartCount } = useCart();
  const { t } = useSettings();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000000',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      {/* 1. Trang chủ */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={focused ? 44 : 42}
              color={color}
            />
          ),
        }}
      />

      {/* 2. Danh mục */}
      <Tabs.Screen
        name="products"
        options={{
          title: t('categories'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={focused ? 42 : 40}
              color={color}
            />
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
              <Ionicons
                name={focused ? 'cart' : 'cart-outline'}
                size={focused ? 44 : 42}
                color={color}
              />
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
            <Ionicons
              name={focused ? 'pricetag' : 'pricetag-outline'}
              size={focused ? 42 : 40}
              color={color}
            />
          ),
        }}
      />

      {/* 5. Tài khoản */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={focused ? 44 : 42}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    height: Platform.OS === 'ios' ? 96 : 74,
    paddingTop: 5,
    paddingBottom: Platform.OS === 'ios' ? 22 : 6,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  tabBarItem: {
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  iconWithBadge: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCount: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'ElleGaborStd',
  },
});
