const fs = require('fs');
let content = fs.readFileSync('app/settings.tsx', 'utf8');

// 1. Add themeMode to useSettings
content = content.replace(
  'const { \n    language',
  'const { \n    themeMode,\n    setThemeMode,\n    language'
);

// 2. Add Theme Options block
const themeOptionsBlock = `
        {/* GIAO DIỆN */}
        <View style={styles.settingsGroup}>
          <Text style={styles.settingsGroupTitle}>{t('appTheme') || 'Giao diện'}</Text>
          <Text style={styles.settingsGroupSubtitle}>
            {t('chooseTheme') || 'Chọn chế độ hiển thị sáng/tối'}
          </Text>
          <View style={styles.optionsList}>
            <TouchableOpacity 
              style={[styles.settingOptionCard, themeMode === 'system' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setThemeMode('system')}
            >
              <View style={styles.settingOptionLeft}>
                <Ionicons name="phone-portrait-outline" size={20} color={themeMode === 'system' ? Colors.primary : Colors.textMuted} style={styles.themeIcon} />
                <View>
                  <Text style={[styles.settingOptionName, themeMode === 'system' && styles.settingOptionNameActive]}>{t('systemTheme') || 'Theo hệ thống'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, themeMode === 'system' && styles.radioCircleActive]}>
                {themeMode === 'system' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingOptionCard, themeMode === 'light' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setThemeMode('light')}
            >
              <View style={styles.settingOptionLeft}>
                <Ionicons name="sunny-outline" size={20} color={themeMode === 'light' ? Colors.primary : Colors.textMuted} style={styles.themeIcon} />
                <View>
                  <Text style={[styles.settingOptionName, themeMode === 'light' && styles.settingOptionNameActive]}>{t('lightTheme') || 'Sáng (Light)'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, themeMode === 'light' && styles.radioCircleActive]}>
                {themeMode === 'light' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingOptionCard, themeMode === 'dark' && styles.settingOptionCardActive]} 
              activeOpacity={0.8}
              onPress={() => setThemeMode('dark')}
            >
              <View style={styles.settingOptionLeft}>
                <Ionicons name="moon-outline" size={20} color={themeMode === 'dark' ? Colors.primary : Colors.textMuted} style={styles.themeIcon} />
                <View>
                  <Text style={[styles.settingOptionName, themeMode === 'dark' && styles.settingOptionNameActive]}>{t('darkTheme') || 'Tối (Dark)'}</Text>
                </View>
              </View>
              <View style={[styles.radioCircle, themeMode === 'dark' && styles.radioCircleActive]}>
                {themeMode === 'dark' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 1. BẢO MẬT */}
`;
content = content.replace('{/* 1. BẢO MẬT */}', themeOptionsBlock);

// 3. Inject useThemeColor
content = content.replace("import { useSettings }", "import { useThemeColor } from '../src/constants/theme';\nimport { useSettings }");
content = content.replace(
  "export default function SettingsScreen() {",
  "export default function SettingsScreen() {\n  const Colors = useThemeColor();\n  const styles = getStyles(Colors);"
);

// 4. Update StyleSheet -> getStyles
content = content.replace("const styles = StyleSheet.create({", "const getStyles = (Colors: any) => StyleSheet.create({");

// 5. Replace hardcoded colors in getStyles
content = content.replace(/backgroundColor: '#FAF8F5'/g, 'backgroundColor: Colors.background');
content = content.replace(/color: '#2D3B34'/g, 'color: Colors.textPrimary');
content = content.replace(/color: '#3B4D45'/g, 'color: Colors.primary');
content = content.replace(/color: '#5D6160'/g, 'color: Colors.textSecondary');
content = content.replace(/color: '#9E968D'/g, 'color: Colors.textMuted');
content = content.replace(/backgroundColor: '#FFFFFF'/g, 'backgroundColor: Colors.cardBackground');
content = content.replace(/backgroundColor: '#EEF3EB'/g, 'backgroundColor: Colors.surface');
content = content.replace(/borderColor: '#E1E8DF'/g, 'borderColor: Colors.borderLight');
content = content.replace(/borderColor: '#3B4D45'/g, 'borderColor: Colors.primary');
content = content.replace(/backgroundColor: '#FDECEB'/g, 'backgroundColor: Colors.surface'); // Logout bg
content = content.replace(/color: '#D84040'/g, 'color: Colors.error');
content = content.replace(/backgroundColor: '#E1E8DF'/g, 'backgroundColor: Colors.border'); // switch track
content = content.replace(/backgroundColor: '#F3F4F6'/g, 'backgroundColor: Colors.surface'); // Cache bg

// Remove any inline color="#2D3B34" from the rendering logic in JSX
content = content.replace(/color="#2D3B34"/g, 'color={Colors.textPrimary}');
content = content.replace(/color="#3B4D45"/g, 'color={Colors.primary}');
content = content.replace(/color="#5D6160"/g, 'color={Colors.textSecondary}');
content = content.replace(/backgroundColor="#FAF8F5"/g, 'backgroundColor={Colors.background}');

// Switch tracks
content = content.replace(/trackColor=\{\{ false: '#E1E8DF', true: '#3B4D45' \}\}/g, 'trackColor={{ false: Colors.borderLight, true: Colors.primary }}');
content = content.replace(/thumbColor=\{'#FFFFFF'\}/g, 'thumbColor={Colors.textInverse}');

// Add themeIcon style
const themeIconStyle = `
  themeIcon: {
    marginRight: 8,
  },
  langFlagImage:`;
content = content.replace("langFlagImage:", themeIconStyle);

fs.writeFileSync('app/settings.tsx', content);
console.log('Settings refactored');
