import React from 'react';
import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';

export default function TabLayout() {
  const router = useRouter();
  const Colors = useThemeColor();
  const { cartCount } = useCart();
  const { t } = useSettings();

  const cartTabListeners = React.useMemo(
    () => ({
      tabPress: () => {
        router.push('/cart');
      },
    }),
    [router]
  );

  return (
    <NativeTabs
      tintColor="#9C7156"
      backgroundColor={Colors.background}
      minimizeBehavior="automatic"
      labelVisibilityMode="unlabeled"
    >
      {/* 4 Icon nằm trong thanh viên thuốc dài bên trái (ẩn chữ, chỉ hiện icon tròn) */}
      {/* 1. Trang chủ: icon-smart-home */}
      <NativeTabs.Trigger name="index" accessibilityLabel={t('home')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          src={{
            default: require('../../assets/icons/tabler/tabler_home.png'),
            selected: require('../../assets/icons/tabler/tabler_home_selected.png'),
          }}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* 2. Danh mục: icon-layout-grid */}
      <NativeTabs.Trigger name="products" accessibilityLabel={t('categories')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          src={{
            default: require('../../assets/icons/tabler/tabler_grid.png'),
            selected: require('../../assets/icons/tabler/tabler_grid_selected.png'),
          }}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* 3. Ưu đãi: icon-tag */}
      <NativeTabs.Trigger name="deals" accessibilityLabel={t('deals')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          src={{
            default: require('../../assets/icons/tabler/tabler_tag.png'),
            selected: require('../../assets/icons/tabler/tabler_tag_selected.png'),
          }}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      {/* 4. Tài khoản: icon avatar tròn 28px chuẩn tỉ lệ không bị vỡ khung */}
      <NativeTabs.Trigger name="profile" accessibilityLabel={t('profile')}>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          src={{
            default: require('../../assets/icons/tabler/tabler_user.png'),
            selected: require('../../assets/icons/tabler/tabler_user_selected.png'),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      {/* 5. Nút Giỏ hàng tách rời thành viên bi kính tròn bên phải nhờ role="search", khi chạm mở trang /cart độc lập */}
      <NativeTabs.Trigger
        name="cart-tab"
        role="search"
        disabled
        listeners={cartTabListeners}
        accessibilityLabel={t('cartTab')}
      >
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          src={{
            default: require('../../assets/icons/tabler/tabler_cart.png'),
            selected: require('../../assets/icons/tabler/tabler_cart_selected.png'),
          }}
          renderingMode="template"
        />
        {cartCount > 0 && (
          <NativeTabs.Trigger.Badge>{cartCount > 99 ? '99+' : String(cartCount)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
