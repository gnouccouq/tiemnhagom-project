// app/(tabs)/_layout.tsx
import React from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';

export default function TabLayout() {
  const Colors = useThemeColor();
  const { cartCount } = useCart();
  const { t } = useSettings();

  return (
    <NativeTabs
      tintColor="#9C7156"
      backgroundColor={Colors.background}
      minimizeBehavior="automatic"
    >
      {/* 1. Trang chủ */}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>

      {/* 2. Danh mục */}
      <NativeTabs.Trigger name="products">
        <NativeTabs.Trigger.Label>{t('categories')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
      </NativeTabs.Trigger>

      {/* 3. Giỏ hàng */}
      <NativeTabs.Trigger name="cart">
        <NativeTabs.Trigger.Label>{t('cartTab')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        {cartCount > 0 && (
          <NativeTabs.Trigger.Badge>{cartCount > 99 ? '99+' : String(cartCount)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      {/* 4. Ưu đãi */}
      <NativeTabs.Trigger name="deals">
        <NativeTabs.Trigger.Label>{t('deals')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tag', selected: 'tag.fill' }} />
      </NativeTabs.Trigger>

      {/* 5. Tài khoản */}
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
