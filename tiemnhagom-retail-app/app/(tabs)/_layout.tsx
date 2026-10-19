// app/(tabs)/_layout.tsx
import React from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSettings } from '../../src/context/SettingsContext';
import { useAuth } from '../../src/context/AuthContext';
import { usePOS } from '../../src/context/POSContext';
import { useThemeColor } from '../../src/constants/theme';

export default function TabsLayout() {
  const Colors = useThemeColor();
  const { t } = useSettings();
  const { checkPermission, adminProfile } = useAuth();
  const { cart } = usePOS();
  const posCartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  // Quyền hạn từng tab
  const canOverview = !adminProfile || checkPermission('overview');
  const canOrders = !adminProfile || checkPermission('orders');
  const canPOS = !adminProfile || checkPermission('pos');
  const canInventory = !adminProfile || checkPermission('inventory');

  return (
    <NativeTabs
      tintColor="#9C7156"
      backgroundColor={Colors.background}
      minimizeBehavior="automatic"
    >
      {/* 1. Tổng quan */}
      {canOverview && (
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>{t('navOverview')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} />
        </NativeTabs.Trigger>
      )}

      {/* 2. Đơn hàng */}
      {canOrders && (
        <NativeTabs.Trigger name="orders">
          <NativeTabs.Trigger.Label>{t('navOrders')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} />
        </NativeTabs.Trigger>
      )}

      {/* 3. Bán tại quầy (POS) */}
      {canPOS && (
        <NativeTabs.Trigger name="pos">
          <NativeTabs.Trigger.Label>{t('navPOS')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'cart', selected: 'cart.fill' }} />
          {posCartCount > 0 && (
            <NativeTabs.Trigger.Badge>{posCartCount > 99 ? '99+' : String(posCartCount)}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>
      )}

      {/* 4. Kho hàng */}
      {canInventory && (
        <NativeTabs.Trigger name="inventory">
          <NativeTabs.Trigger.Label>{t('navInventory')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'cube.box', selected: 'cube.box.fill' }} />
        </NativeTabs.Trigger>
      )}

      {/* 5. Mở rộng & Nhân sự */}
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>{t('navMore')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
