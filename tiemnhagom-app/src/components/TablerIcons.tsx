// src/components/TablerIcons.tsx
// Bộ icon Tabler chính thức cho Tiệm Nhà Gốm
// Thiết kế nét stroke chuẩn mực 1.8 - 2.1, bo tròn các đầu nét mộc mạc và thanh thoát.
// Dựng trực tiếp bằng react-native-svg với mã vector nguyên bản từ Tabler Icons,
// đảm bảo Metro bundler đóng gói tức thì, hoạt động 100% mượt mà trên iOS, Android và Web.
import React from 'react';
import { ColorValue } from 'react-native';
import Svg, { Path, SvgProps } from 'react-native-svg';

export interface TablerIconProps extends Omit<SvgProps, 'stroke'> {
  size?: number | string;
  color?: string | ColorValue | any;
  stroke?: number | string;
  focused?: boolean;
}

/**
 * 1. Trang chủ: icon-smart-home
 * Biểu tượng ngôi nhà tối giản, tạo cảm giác ấm cúng, thân thuộc như ở nhà.
 */
export const IconSmartHome: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M19 8.71l-5.333 -4.148a2.666 2.666 0 0 0 -3.274 0l-5.334 4.148a2.665 2.665 0 0 0 -1.029 2.105v7.2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-7.2c0 -.823 -.38 -1.6 -1.03 -2.105" />
      <Path d="M16 15c-2.21 1.333 -5.792 1.333 -8 0" />
    </Svg>
  );
};
export const TablerHomeIcon = IconSmartHome;

/**
 * Trang chủ biến thể: icon-home
 */
export const IconHome: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M5 12l-2 0l9 -9l9 9l-2 0" />
      <Path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
      <Path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
    </Svg>
  );
};

/**
 * 2. Danh mục: icon-layout-grid
 * Các ô vuông đều đặn, tượng trưng cho việc trưng bày các kệ gốm sứ ngăn nắp.
 */
export const IconLayoutGrid: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <Path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <Path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <Path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
    </Svg>
  );
};
export const TablerCategoryIcon = IconLayoutGrid;

/**
 * Danh mục biến thể: icon-category
 */
export const IconCategory: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M4 4h6v6h-6l0 -6" />
      <Path d="M14 4h6v6h-6l0 -6" />
      <Path d="M4 14h6v6h-6l0 -6" />
      <Path d="M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    </Svg>
  );
};

/**
 * 3. Ưu đãi / Săn sale: icon-tag
 * Nhãn giảm giá với đường cong mềm mại, thu hút ánh nhìn nhưng không bị thô.
 */
export const IconTag: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <Path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3" />
    </Svg>
  );
};
export const TablerDealsIcon = IconTag;

/**
 * Ưu đãi biến thể: icon-discount
 */
export const IconDiscount: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M9 15l6 -6" />
      <Path d="M9 9.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0" fill={color as string} />
      <Path d="M14 14.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0" fill={color as string} />
      <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    </Svg>
  );
};

/**
 * 4. Giỏ hàng: icon-shopping-bag
 * Chiếc túi xách mua sắm quen thuộc, rất hợp với văn hóa mua sắm đồ decor, gốm sứ.
 */
export const IconShoppingBag: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304" />
      <Path d="M9 11v-5a3 3 0 0 1 6 0v5" />
    </Svg>
  );
};
export const TablerCartIcon = IconShoppingBag;

/**
 * Giỏ hàng biến thể: icon-basket
 */
export const IconBasket: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M10 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <Path d="M5.001 8h13.999a2 2 0 0 1 1.977 2.304l-1.255 7.152a3 3 0 0 1 -2.966 2.544h-9.512a3 3 0 0 1 -2.965 -2.544l-1.255 -7.152a2 2 0 0 1 1.977 -2.304" />
      <Path d="M17 10l-2 -6" />
      <Path d="M7 10l2 -6" />
    </Svg>
  );
};

/**
 * 5. Cá nhân: icon-user
 * Biểu tượng tài khoản gọn gàng, chuẩn form giao diện e-commerce hiện đại.
 */
export const IconUser: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <Path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </Svg>
  );
};
export const TablerProfileIcon = IconUser;

/**
 * Cá nhân biến thể: icon-user-circle
 */
export const IconUserCircle: React.FC<TablerIconProps> = ({
  size = 24,
  color = '#9C7156',
  stroke = 1.8,
  focused = false,
  ...props
}) => {
  const effStroke = focused ? Math.max(Number(stroke) + 0.3, 2.1) : stroke;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color as string}
      strokeWidth={effStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <Path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <Path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
    </Svg>
  );
};
