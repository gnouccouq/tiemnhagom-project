// app/(tabs)/_layout.tsx
// Thanh điều hướng đáy chuẩn Liquid Glass kết hợp bộ 5 Tabler Icons chính thức
// 1. Trang chủ: icon-smart-home
// 2. Danh mục: icon-layout-grid
// 3. Ưu đãi: icon-tag
// 4. Cá nhân: icon-user
// 5. Giỏ hàng: icon-shopping-bag (Tách riêng thành viên bi tròn bên phải)
import React from 'react';
import { Tabs } from 'expo-router';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';
import FloatingTabBar from '../../src/components/FloatingTabBar';
import {
  TablerHomeIcon,
  TablerCategoryIcon,
  TablerDealsIcon,
  TablerCartIcon,
  TablerProfileIcon,
} from '../../src/components/TablerIcons';

export default function TabLayout() {
  const Colors = useThemeColor();
  const { cartCount } = useCart();
  const { t } = useSettings();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      {/* 1. Trang chủ: icon-smart-home (hoặc icon-home) */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarLabel: t('home'),
          tabBarIcon: ({ color, focused }) => (
            <TablerHomeIcon size={24} color={color} stroke={1.8} focused={focused} />
          ),
        }}
      />

      {/* 2. Danh mục: icon-layout-grid (hoặc icon-category) */}
      <Tabs.Screen
        name="products"
        options={{
          title: t('categories'),
          tabBarLabel: t('categories'),
          tabBarIcon: ({ color, focused }) => (
            <TablerCategoryIcon size={24} color={color} stroke={1.8} focused={focused} />
          ),
        }}
      />

      {/* 3. Ưu đãi: icon-tag (hoặc icon-discount) */}
      <Tabs.Screen
        name="deals"
        options={{
          title: t('deals'),
          tabBarLabel: t('deals'),
          tabBarIcon: ({ color, focused }) => (
            <TablerDealsIcon size={24} color={color} stroke={1.8} focused={focused} />
          ),
        }}
      />

      {/* 4. Cá nhân: icon-user (hoặc icon-user-circle) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarLabel: t('profile'),
          tabBarIcon: ({ color, focused }) => (
            <TablerProfileIcon size={24} color={color} stroke={1.8} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
