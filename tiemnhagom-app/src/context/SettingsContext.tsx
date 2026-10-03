// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'vi' | 'en' | 'zh';
export type FontSize = 'small' | 'normal' | 'large';

interface SettingsContextType {
  language: Language;
  fontSize: FontSize;
  fontScale: number;
  isAppLockEnabled: boolean;
  isPushNotificationEnabled: boolean;
  setLanguage: (lang: Language) => Promise<void>;
  setFontSize: (size: FontSize) => Promise<void>;
  setAppLockEnabled: (enabled: boolean) => Promise<void>;
  setPushNotificationEnabled: (enabled: boolean) => Promise<void>;
  t: (key: string) => string;
}

import { setGlobalFontScale } from '../utils/textScaler';

const STORAGE_KEY_LANGUAGE = '@tiemnhagom_language';
const STORAGE_KEY_FONT_SIZE = '@tiemnhagom_font_size';
const STORAGE_KEY_APP_LOCK = '@tiemnhagom_app_lock';
const STORAGE_KEY_PUSH_NOTI = '@tiemnhagom_push_noti';

import { vi } from '../locales/vi';
import { en } from '../locales/en';
import { zh } from '../locales/zh';

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  vi,
  en,
  zh,
};

const SettingsContext = createContext<SettingsContextType>({
  language: 'vi',
  fontSize: 'normal',
  fontScale: 1.0,
  isAppLockEnabled: false,
  isPushNotificationEnabled: true,
  setLanguage: async () => {},
  setFontSize: async () => {},
  setAppLockEnabled: async () => {},
  setPushNotificationEnabled: async () => {},
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
  const [isAppLockEnabled, setIsAppLockEnabled] = useState<boolean>(false);
  const [isPushNotificationEnabled, setIsPushNotificationEnabled] = useState<boolean>(true);

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
        const savedAppLock = await AsyncStorage.getItem(STORAGE_KEY_APP_LOCK);
        if (savedAppLock === 'true') {
          setIsAppLockEnabled(true);
        }
        const savedPushNoti = await AsyncStorage.getItem(STORAGE_KEY_PUSH_NOTI);
        if (savedPushNoti === 'false') {
          setIsPushNotificationEnabled(false);
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

  const setAppLockEnabled = async (enabled: boolean) => {
    setIsAppLockEnabled(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_APP_LOCK, enabled ? 'true' : 'false');
    } catch (err) {
      console.warn('Lỗi lưu appLock:', err);
    }
  };

  const setPushNotificationEnabled = async (enabled: boolean) => {
    setIsPushNotificationEnabled(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_PUSH_NOTI, enabled ? 'true' : 'false');
    } catch (err) {
      console.warn('Lỗi lưu pushNoti:', err);
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
        isAppLockEnabled,
        isPushNotificationEnabled,
        setLanguage,
        setFontSize,
        setAppLockEnabled,
        setPushNotificationEnabled,
        t,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
