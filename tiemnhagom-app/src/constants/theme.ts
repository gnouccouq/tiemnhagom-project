// src/constants/theme.ts

import { useColorScheme } from 'react-native';
import { useSettings } from '../context/SettingsContext';

export const LightColors = {
  primary: '#111111',       
  primaryDark: '#000000',
  primaryLight: '#E5E5E5',
  primaryHover: '#333333',
  background: '#FAF8F5',    
  cardBackground: '#FFFFFF',
  surface: '#F4EFEB',
  border: '#E8E1D8',
  borderLight: '#F0ECE6',
  textPrimary: '#231B15',   
  textSecondary: '#6E665D', 
  textMuted: '#9E968D',
  textInverse: '#FFFFFF',
  accentGreen: '#9C7156',   
  accentOlive: '#9C7156',
  accentGold: '#D89E3A',    
  badgeSale: '#D32F2F',     
  success: '#9C7156',
  warning: '#ED6C02',
  error: '#D32F2F',
  info: '#9C7156',
  sageLight: '#F6F4EC',     
  sageBorder: '#E8CCB2',    
  sageDark: '#9C7156',      
  slateDark: '#5d6160',     
  glassBg: 'rgba(255, 255, 255, 0.82)',
  glassDark: 'rgba(26, 26, 25, 0.88)',
  glassBorder: 'rgba(255, 255, 255, 0.95)',
  overlay: 'rgba(0, 0, 0, 0.4)',
  divider: '#EBE5DD',
  skeleton: '#ECE7E0',
  // Official Brand Guidelines Palette (TiemNhaGom_Brand Guideline.pdf)
  brandTerracotta: '#9C7156',
  brandCharcoal: '#2B2928',
  brandCream: '#F6F4EC',
  brandSand: '#E8CCB2',
  brandWhite: '#FFFFFF',
};

export const DarkColors = {
  primary: '#FFFFFF',       
  primaryDark: '#E5E5E5',
  primaryLight: '#333333',
  primaryHover: '#DDDDDD',
  background: '#121212',    
  cardBackground: '#1E1E1E',
  surface: '#2C2C2C',
  border: '#333333',
  borderLight: '#2A2A2A',
  textPrimary: '#F5F5F5',   
  textSecondary: '#B0B0B0', 
  textMuted: '#888888',
  textInverse: '#111111',
  accentGreen: '#9C7156',   
  accentOlive: '#9C7156',
  accentGold: '#EFC050',    
  badgeSale: '#EF5350',     
  success: '#9C7156',
  warning: '#FF9800',
  error: '#EF5350',
  info: '#9C7156',
  sageLight: '#2C2A28',     
  sageBorder: '#3A3633',    
  sageDark: '#E8CCB2',      
  slateDark: '#a1a6a5',     
  glassBg: 'rgba(30, 30, 30, 0.82)',
  glassDark: 'rgba(26, 26, 25, 0.88)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  divider: '#333333',
  skeleton: '#2C2C2C',
  // Official Brand Guidelines Palette (TiemNhaGom_Brand Guideline.pdf)
  brandTerracotta: '#C86432',
  brandCharcoal: '#1A1817',
  brandCream: '#F6F4EC',
  brandSand: '#E8CCB2',
  brandWhite: '#FFFFFF',
};

// Export fallback Colors for gradual migration without breaking existing files
export const Colors = LightColors;

export function useThemeColor() {
  let themeMode: 'system' | 'light' | 'dark' = 'system';
  try {
    const settings = useSettings();
    if (settings?.themeMode) {
      themeMode = settings.themeMode;
    }
  } catch {
    // fallback if outside context
  }
  const systemTheme = useColorScheme() ?? 'light';
  const theme = themeMode === 'system' ? systemTheme : themeMode;
  return theme === 'dark' ? DarkColors : LightColors;
}


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
