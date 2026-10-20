// src/context/SettingsContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vi } from '../locales/vi';
import { en } from '../locales/en';
import { zh } from '../locales/zh';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Language = 'vi' | 'en' | 'zh';

interface SettingsContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY_LANGUAGE = '@tiemnhagom_retail_lang';
const STORAGE_KEY_THEME_MODE = '@tiemnhagom_retail_theme';
const STORAGE_KEY_HAPTICS = '@tiemnhagom_retail_haptics';

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  vi,
  en,
  zh,
};

const SettingsContext = createContext<SettingsContextType>({
  themeMode: 'system',
  setThemeMode: async () => {},
  language: 'vi',
  setLanguage: async () => {},
  hapticsEnabled: true,
  setHapticsEnabled: async () => {},
  t: (key: string) => key,
});

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(STORAGE_KEY_THEME_MODE);
        if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
          setThemeModeState(savedTheme);
        }
        const savedLang = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);
        if (savedLang === 'vi' || savedLang === 'en' || savedLang === 'zh') {
          setLanguageState(savedLang as Language);
        }
        const savedHaptics = await AsyncStorage.getItem(STORAGE_KEY_HAPTICS);
        if (savedHaptics !== null) {
          setHapticsEnabledState(savedHaptics === 'true');
        }
      } catch (err) {
        console.warn('Lỗi tải cài đặt retail:', err);
      }
    };
    loadSettings();
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_THEME_MODE, mode);
    } catch (e) {
      console.warn(e);
    }
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, lang);
    } catch (e) {
      console.warn(e);
    }
  };

  const setHapticsEnabled = async (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_HAPTICS, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn(e);
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = TRANSLATIONS[language] || vi;
    let text = dict[key] || vi[key] || key;
    if (params) {
      Object.keys(params).forEach((paramKey) => {
        text = text.replace(new RegExp(`{${paramKey}}`, 'g'), String(params[paramKey]));
      });
    }
    return text;
  };

  return (
    <SettingsContext.Provider
      value={{
        themeMode,
        setThemeMode,
        language,
        setLanguage,
        hapticsEnabled,
        setHapticsEnabled,
        t,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
export default SettingsContext;
