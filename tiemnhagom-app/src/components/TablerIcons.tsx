// src/components/TablerIcons.tsx
// Bộ icon Tabler chính thức cho Tiệm Nhà Gốm
// Thiết kế nét stroke đều đặn 1.8 - 2.0, bo tròn mềm mại, đồng điệu với phong cách gốm mộc.
import React from 'react';
import { ColorValue } from 'react-native';
import {
  IconSmartHome,
  IconLayoutGrid,
  IconTag,
  IconShoppingBag,
  IconUser,
  IconHome,
  IconCategory,
  IconDiscount,
  IconBasket,
  IconUserCircle,
} from '@tabler/icons-react-native';

export interface TablerIconProps {
  size?: number;
  color?: string | ColorValue | any;
  stroke?: number;
  focused?: boolean;
}

/**
 * 1. Trang chủ: icon-smart-home (hoặc icon-home)
 * Biểu tượng ngôi nhà tối giản, tạo cảm giác ấm cúng, thân thuộc như ở nhà.
 */
export const TablerHomeIcon: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
}) => (
  <IconSmartHome
    size={size}
    color={color}
    stroke={focused ? Math.max(stroke + 0.3, 2.1) : stroke}
  />
);

/**
 * 2. Danh mục: icon-layout-grid (hoặc icon-category)
 * Các ô vuông đều đặn, tượng trưng cho việc trưng bày các kệ gốm sứ ngăn nắp.
 */
export const TablerCategoryIcon: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
}) => (
  <IconLayoutGrid
    size={size}
    color={color}
    stroke={focused ? Math.max(stroke + 0.3, 2.1) : stroke}
  />
);

/**
 * 3. Ưu đãi / Săn sale: icon-tag (hoặc icon-discount)
 * Nhãn giảm giá với đường cong mềm mại, thu hút ánh nhìn nhưng không bị thô.
 */
export const TablerDealsIcon: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
}) => (
  <IconTag
    size={size}
    color={color}
    stroke={focused ? Math.max(stroke + 0.3, 2.1) : stroke}
  />
);

/**
 * 4. Giỏ hàng: icon-shopping-bag (hoặc icon-basket)
 * Chiếc túi xách mua sắm quen thuộc, rất hợp với văn hóa mua sắm đồ decor, gốm sứ.
 */
export const TablerCartIcon: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
}) => (
  <IconShoppingBag
    size={size}
    color={color}
    stroke={focused ? Math.max(stroke + 0.3, 2.1) : stroke}
  />
);

/**
 * 5. Cá nhân: icon-user (hoặc icon-user-circle)
 * Biểu tượng tài khoản gọn gàng, chuẩn form giao diện e-commerce hiện đại.
 */
export const TablerProfileIcon: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
}) => (
  <IconUser
    size={size}
    color={color}
    stroke={focused ? Math.max(stroke + 0.3, 2.1) : stroke}
  />
);

// Export các biến thể phụ (fallback / alternatives)
export {
  IconHome,
  IconSmartHome,
  IconCategory,
  IconLayoutGrid,
  IconDiscount,
  IconTag,
  IconBasket,
  IconShoppingBag,
  IconUserCircle,
  IconUser,
};
