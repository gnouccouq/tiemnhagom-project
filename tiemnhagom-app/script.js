const fs = require('fs');
let f = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');

// 1. Add import for useThemeColor
if (!f.includes('useThemeColor')) {
  f = f.replace(
    /import \{ useAuth \} from '\.\.\/\.\.\/src\/context\/AuthContext';/,
    "import { useThemeColor } from '../../src/constants/theme';\nimport { useAuth } from '../../src/context/AuthContext';"
  );
}

// 2. Add Colors hook in HomeScreen
if (!f.includes('const Colors = useThemeColor();')) {
  f = f.replace(
    /export default function HomeScreen\(\) \{/,
    "export default function HomeScreen() {\n  const Colors = useThemeColor();\n  const styles = getStyles(Colors);"
  );
}

// 3. Change StyleSheet.create to getStyles
if (f.includes('const styles = StyleSheet.create({')) {
  f = f.replace(/const styles = StyleSheet\.create\(\{/, 'const getStyles = (Colors: any) => StyleSheet.create({');
}

// 4. Replace hardcoded colors in styles
f = f.replace(/backgroundColor: '#FAF8F5'/g, 'backgroundColor: Colors.background');
f = f.replace(/backgroundColor: '#FFFFFF'/g, 'backgroundColor: Colors.cardBackground');
f = f.replace(/color: '#111111'/g, 'color: Colors.textPrimary');
f = f.replace(/color: '#18181B'/g, 'color: Colors.textPrimary');
f = f.replace(/color: '#52525B'/g, 'color: Colors.textSecondary');
f = f.replace(/color: '#71717A'/g, 'color: Colors.textMuted');
f = f.replace(/color: '#FFFFFF'/g, 'color: Colors.textInverse');
f = f.replace(/borderColor: '#F4F4F5'/g, 'borderColor: Colors.borderLight');
f = f.replace(/borderColor: '#E5E7EB'/g, 'borderColor: Colors.border');
f = f.replace(/backgroundColor: '#F4F4F5'/g, 'backgroundColor: Colors.surface');
f = f.replace(/backgroundColor: '#111111'/g, 'backgroundColor: Colors.primary');
f = f.replace(/backgroundColor: '#18181B'/g, 'backgroundColor: Colors.primary');

fs.writeFileSync('app/(tabs)/index.tsx', f);
