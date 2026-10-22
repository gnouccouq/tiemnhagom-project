// src/types/tabler-icons.d.ts
import React from 'react';
import { SvgProps } from 'react-native-svg';

declare module '@tabler/icons-react-native' {
  export interface TablerIconProps extends SvgProps {
    size?: number | string;
    stroke?: number | string;
    color?: string | any;
  }

  export type TablerIcon = React.FC<TablerIconProps>;

  export const IconHome: TablerIcon;
  export const IconSmartHome: TablerIcon;
  export const IconCategory: TablerIcon;
  export const IconLayoutGrid: TablerIcon;
  export const IconDiscount: TablerIcon;
  export const IconTag: TablerIcon;
  export const IconBasket: TablerIcon;
  export const IconShoppingBag: TablerIcon;
  export const IconUserCircle: TablerIcon;
  export const IconUser: TablerIcon;

  export interface IconIndex {
    [key: string]: TablerIcon;
  }

  const icons: IconIndex;
  export default icons;
}
