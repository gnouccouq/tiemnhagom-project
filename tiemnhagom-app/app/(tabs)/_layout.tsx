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
      labelVisibilityMode="unlabeled"
    >
      {/* 4 Icon nằm trong thanh viên thuốc dài bên trái (ẩn chữ, chỉ hiện icon tròn) */}
      {/* 1. Trang chủ */}
      <NativeTabs.Trigger name="index" accessibilityLabel={t('home')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home' }}
        />
      </NativeTabs.Trigger>

      {/* 2. Danh mục */}
      <NativeTabs.Trigger name="products" accessibilityLabel={t('categories')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md={{ default: 'grid_view', selected: 'grid_view' }}
        />
      </NativeTabs.Trigger>

      {/* 3. Ưu đãi */}
      <NativeTabs.Trigger name="deals" accessibilityLabel={t('deals')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'tag', selected: 'tag.fill' }}
          md={{ default: 'local_offer', selected: 'local_offer' }}
        />
      </NativeTabs.Trigger>

      {/* 4. Tài khoản */}
      <NativeTabs.Trigger name="profile" accessibilityLabel={t('profile')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person', selected: 'person.fill' }}
          md={{ default: 'person', selected: 'person' }}
        />
      </NativeTabs.Trigger>

      {/* 5. Nút Giỏ hàng tách rời thành viên bi kính tròn bên phải nhờ role="search" */}
      <NativeTabs.Trigger
        name="cart"
        role="search"
        accessibilityLabel={t('cartTab')}
      >
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bag', selected: 'bag.fill' }}
          md={{ default: 'shopping_bag', selected: 'shopping_bag' }}
        />
        {cartCount > 0 && (
          <NativeTabs.Trigger.Badge>{cartCount > 99 ? '99+' : String(cartCount)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
