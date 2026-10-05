const fs = require('fs');
let content = fs.readFileSync('src/constants/theme.ts', 'utf8');

const oldCode = `export function useThemeColor() {
  const theme = useColorScheme() ?? 'light';
  return theme === 'dark' ? DarkColors : LightColors;
}`;

const newCode = `import { useSettings } from '../context/SettingsContext';

export function useThemeColor() {
  const { themeMode } = useSettings();
  const systemTheme = useColorScheme() ?? 'light';
  const theme = themeMode === 'system' ? systemTheme : themeMode;
  return theme === 'dark' ? DarkColors : LightColors;
}`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/constants/theme.ts', content);
console.log('theme.ts updated');
