const fs = require('fs');

let content = fs.readFileSync('src/context/SettingsContext.tsx', 'utf8');

content = content.replace("export type Language = 'vi' | 'en' | 'zh';", "export type ThemeMode = 'system' | 'light' | 'dark';\nexport type Language = 'vi' | 'en' | 'zh';");

content = content.replace("language: Language;", "themeMode: ThemeMode;\n  setThemeMode: (mode: ThemeMode) => Promise<void>;\n  language: Language;");

content = content.replace("const STORAGE_KEY_LANGUAGE = '@tiemnhagom_language';", "const STORAGE_KEY_LANGUAGE = '@tiemnhagom_language';\nconst STORAGE_KEY_THEME_MODE = '@tiemnhagom_theme_mode';");

content = content.replace("language: 'vi',", "themeMode: 'system',\n  setThemeMode: async () => {},\n  language: 'vi',");

content = content.replace("const [language, setLanguageState] = useState<Language>('vi');", "const [language, setLanguageState] = useState<Language>('vi');\n  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');");

content = content.replace("const savedLang = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);", "const savedTheme = await AsyncStorage.getItem(STORAGE_KEY_THEME_MODE);\n        if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {\n          setThemeModeState(savedTheme);\n        }\n        const savedLang = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);");

content = content.replace("const setLanguage = async (lang: Language) => {", "const setThemeMode = async (mode: ThemeMode) => {\n    setThemeModeState(mode);\n    try {\n      await AsyncStorage.setItem(STORAGE_KEY_THEME_MODE, mode);\n    } catch (err) {\n      console.warn('Lỗi lưu themeMode:', err);\n    }\n  };\n\n  const setLanguage = async (lang: Language) => {");

content = content.replace("language,", "themeMode,\n        setThemeMode,\n        language,");

fs.writeFileSync('src/context/SettingsContext.tsx', content);
console.log('SettingsContext updated');
