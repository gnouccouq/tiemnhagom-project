// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'vi' | 'en';
export type FontSize = 'small' | 'normal' | 'large';

interface SettingsContextType {
  language: Language;
  fontSize: FontSize;
  fontScale: number;
  setLanguage: (lang: Language) => Promise<void>;
  setFontSize: (size: FontSize) => Promise<void>;
  t: (key: string) => string;
}

import { setGlobalFontScale } from '../utils/textScaler';

const STORAGE_KEY_LANGUAGE = '@tiemnhagom_language';
const STORAGE_KEY_FONT_SIZE = '@tiemnhagom_font_size';

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  vi: {
    // Bottom Bar & Headers
    home: 'Trang chủ',
    products: 'Sản phẩm',
    notifications: 'Thông báo',
    deals: 'Ưu đãi',
    profile: 'Tài khoản',

    // Settings Modal
    settingsTitle: 'Cài Đặt Ứng Dụng',
    settingsDesc: 'Tùy chỉnh ngôn ngữ và giao diện hiển thị theo ý thích của bạn.',
    languageSection: 'Ngôn ngữ hiển thị',
    fontSizeSection: 'Cỡ chữ hiển thị',
    fontSizePreview: 'Xem trước cỡ chữ',
    previewText: 'Chào mừng bạn đến với Tiệm Nhà Gốm. Nơi lưu giữ nét đẹp gốm mộc thủ công tinh tế.',
    small: 'Nhỏ (90%)',
    normal: 'Vừa (Chuẩn 100%)',
    large: 'Lớn (115%)',
    vietnamese: 'Tiếng Việt',
    english: 'English (Tiếng Anh)',
    saveSettings: 'Lưu thay đổi',
    close: 'Đóng',
    cacheSection: 'Bộ nhớ tạm & Thông báo',
    pushNotification: 'Nhận thông báo ưu đãi',
    clearCache: 'Xóa bộ nhớ đệm (Cache)',
    cacheCleared: 'Đã dọn dẹp bộ nhớ tạm thành công',

    // Profile Page
    memberCard: 'THẺ THÀNH VIÊN SỐ',
    holder: 'CHỦ THẺ',
    memberCode: 'MÃ HỘI VIÊN',
    totalSpent: 'Tổng chi tiêu',
    accumulatedPoints: 'Điểm tích lũy',
    orderDiscount: 'Ưu đãi đơn hàng',
    orderHistory: 'Lịch sử & Tra cứu đơn hàng',
    favoriteProducts: 'Sản phẩm yêu thích',
    myCart: 'Giỏ hàng của tôi',
    systemSettings: 'Cài đặt hệ thống',
    supportContact: 'Hỗ trợ & Liên hệ',
    hotline: 'Hotline tư vấn',
    officialWebsite: 'Website chính thức',
    address: '37 Nguyễn Duy, Phường Gia Định, Tp.Hồ Chí Minh',
    openingHours: 'Mở cửa 10:00 - 21:00',
    logout: 'Đăng xuất tài khoản',
    editProfile: 'Chỉnh Sửa Thông Tin',
    qrMember: 'Mã QR Thành Viên',
    guest: 'Khách hàng thân thiết',
  },
  en: {
    // Bottom Bar & Headers
    home: 'Home',
    products: 'Shop',
    notifications: 'Notifications',
    deals: 'Deals & VIP',
    profile: 'Account',

    // Settings Modal
    settingsTitle: 'App Settings',
    settingsDesc: 'Customize language and display options to your preference.',
    languageSection: 'Display Language',
    fontSizeSection: 'Font Size',
    fontSizePreview: 'Font Size Preview',
    previewText: 'Welcome to Tiem Nha Gom. Preserving the beauty of handcrafted ceramics.',
    small: 'Small (90%)',
    normal: 'Medium (Default 100%)',
    large: 'Large (115%)',
    vietnamese: 'Tiếng Việt (Vietnamese)',
    english: 'English',
    saveSettings: 'Save Changes',
    close: 'Close',
    cacheSection: 'Storage & Notifications',
    pushNotification: 'Promotional Notifications',
    clearCache: 'Clear Cache',
    cacheCleared: 'Cache cleared successfully',

    // Profile Page
    memberCard: 'DIGITAL MEMBER CARD',
    holder: 'CARD HOLDER',
    memberCode: 'MEMBER ID',
    totalSpent: 'Total Spent',
    accumulatedPoints: 'Reward Points',
    orderDiscount: 'Member Discount',
    orderHistory: 'Order History & Tracking',
    favoriteProducts: 'Favorite Items',
    myCart: 'My Shopping Cart',
    systemSettings: 'System Settings',
    supportContact: 'Support & Contact',
    hotline: 'Consultation Hotline',
    officialWebsite: 'Official Website',
    address: '37 Nguyen Duy, Gia Dinh Ward, Ho Chi Minh City',
    openingHours: 'Opening hours 10:00 - 21:00',
    logout: 'Sign Out Account',
    editProfile: 'Edit Profile Information',
    qrMember: 'Member QR Code',
    guest: 'Valued Customer',
  },
};

const SettingsContext = createContext<SettingsContextType>({
  language: 'vi',
  fontSize: 'normal',
  fontScale: 1.0,
  setLanguage: async () => {},
  setFontSize: async () => {},
  t: (key: string) => key,
});

const getScaleFromSize = (size: FontSize): number => {
  if (size === 'large') return 1.32;
  if (size === 'small') return 0.9;
  return 1.1; // Tăng nhẹ kích thước chuẩn để toàn app luôn dễ đọc, không bị nhỏ xíu
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi');
  const [fontSize, setFontSizeState] = useState<FontSize>('normal');

  useEffect(() => {
    // Khởi tạo ngay kích thước dễ đọc
    setGlobalFontScale(getScaleFromSize('normal'));

    // Phục hồi cài đặt từ AsyncStorage khi mở app
    const loadSettings = async () => {
      try {
        const savedLang = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);
        if (savedLang === 'vi' || savedLang === 'en') {
          setLanguageState(savedLang);
        }
        const savedFontSize = await AsyncStorage.getItem(STORAGE_KEY_FONT_SIZE);
        if (savedFontSize === 'small' || savedFontSize === 'normal' || savedFontSize === 'large') {
          setFontSizeState(savedFontSize);
          setGlobalFontScale(getScaleFromSize(savedFontSize));
        }
      } catch (err) {
        console.warn('Lỗi đọc settings:', err);
      }
    };
    loadSettings();
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, lang);
    } catch (err) {
      console.warn('Lỗi lưu language:', err);
    }
  };

  const setFontSize = async (size: FontSize) => {
    setFontSizeState(size);
    setGlobalFontScale(getScaleFromSize(size));
    try {
      await AsyncStorage.setItem(STORAGE_KEY_FONT_SIZE, size);
    } catch (err) {
      console.warn('Lỗi lưu fontSize:', err);
    }
  };

  const fontScale = getScaleFromSize(fontSize);

  const t = (key: string): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS['vi'][key] || key;
  };

  return (
    <SettingsContext.Provider
      value={{
        language,
        fontSize,
        fontScale,
        setLanguage,
        setFontSize,
        t,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
