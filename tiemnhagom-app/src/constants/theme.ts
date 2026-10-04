// src/constants/theme.ts

export const Colors = {
  // Brand Terracotta & Earth Tones (Changed to Black/Grey theme per user directive)
  primary: '#111111',       // Black theme
  primaryDark: '#000000',
  primaryLight: '#E5E5E5',
  primaryHover: '#333333',

  // Neutrals & Backgrounds
  background: '#FAF8F5',    // Màu kem gốm ấm áp (warm cream)
  cardBackground: '#FFFFFF',
  surface: '#F4EFEB',
  border: '#E8E1D8',
  borderLight: '#F0ECE6',

  // Typography
  textPrimary: '#231B15',   // Đen nâu đậm tinh tế
  textSecondary: '#6E665D', // Xám ấm
  textMuted: '#9E968D',
  textInverse: '#FFFFFF',

  // Status & Accents
  accentGreen: '#4A6B53',   // Xanh rêu gốm mộc
  accentOlive: '#7B8854',
  accentGold: '#D89E3A',    // Vàng đồng
  badgeSale: '#D32F2F',     // Đỏ sale
  success: '#2E7D32',
  warning: '#ED6C02',
  error: '#D32F2F',
  info: '#0288D1',

  // Celadon Sage & Slate Glass (Phong cách gốm mộc từ app/app.css)
  sageLight: '#eef3eb',     // Nền card xanh gốm celadon thanh lịch
  sageBorder: '#e1e8df',    // Viền xanh nhạt
  sageDark: '#3b4d45',      // Màu chữ xanh rêu đậm sang trọng
  slateDark: '#5d6160',     // Màu nút xám than đá phiến
  glassBg: 'rgba(255, 255, 255, 0.82)',
  glassDark: 'rgba(26, 26, 25, 0.88)',
  glassBorder: 'rgba(255, 255, 255, 0.95)',

  // Helpers
  overlay: 'rgba(0, 0, 0, 0.4)',
  divider: '#EBE5DD',
  skeleton: '#ECE7E0',
};

import { Platform } from 'react-native';

export const SYSTEM_SANS_SERIF = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export const Typography = {
  fontFamily: {
    serif: SYSTEM_SANS_SERIF,
    brand: SYSTEM_SANS_SERIF,
    regular: SYSTEM_SANS_SERIF,
    medium: SYSTEM_SANS_SERIF,
    semiBold: SYSTEM_SANS_SERIF,
    bold: SYSTEM_SANS_SERIF,
    sans: SYSTEM_SANS_SERIF,
  },
  fontSize: {
    xs: 12.5,
    sm: 14,
    base: 16,
    md: 17,
    lg: 19,
    xl: 22,
    xxl: 26,
    display: 30,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  xs: 8,
  sm: 14,
  md: 20,
  lg: 26,
  xl: 32,
  pill: 24,
  card: 28,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#231B15',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#231B15',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#231B15',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
};
