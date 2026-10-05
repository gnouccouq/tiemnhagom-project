const fs = require('fs');

function refactorFile(filePath, isFloatingBar) {
  let f = fs.readFileSync(filePath, 'utf8');

  // Add useThemeColor import if missing
  if (!f.includes('useThemeColor')) {
    if (f.includes('../constants/theme')) {
      f = f.replace(/import \{.*?\} from '\.\.\/constants\/theme';/, "import { useThemeColor, Typography, Spacing } from '../constants/theme';");
    } else if (f.includes('../../src/constants/theme')) {
      f = f.replace(/import \{.*?\} from '\.\.\/\.\.\/src\/constants\/theme';/, "import { useThemeColor } from '../../src/constants/theme';");
    } else {
      f = "import { useThemeColor } from '../constants/theme';\n" + f;
    }
  }

  // Inject Colors hook
  if (filePath.includes('Header.tsx')) {
    if (!f.includes('const Colors = useThemeColor();')) {
      f = f.replace(/const router = useRouter\(\);/, "const router = useRouter();\n  const Colors = useThemeColor();\n  const styles = getStyles(Colors);");
    }
  } else if (filePath.includes('FloatingTabBar.tsx')) {
    if (!f.includes('const Colors = useThemeColor();')) {
      f = f.replace(/const insets = useSafeAreaInsets\(\);/, "const insets = useSafeAreaInsets();\n  const Colors = useThemeColor();\n  const styles = getStyles(Colors);\n  const ACTIVE_COLOR = Colors.textPrimary;\n  const INACTIVE_COLOR = Colors.textMuted;");
      f = f.replace(/const ACTIVE_COLOR = '#111111';\nconst INACTIVE_COLOR = '#6B6B70';\n/, "");
    }
  } else if (filePath.includes('ProductCard.tsx')) {
    if (!f.includes('const Colors = useThemeColor();')) {
      f = f.replace(/const router = useRouter\(\);/, "const router = useRouter();\n  const Colors = useThemeColor();\n  const styles = getStyles(Colors);");
    }
  }

  // Replace StyleSheet.create
  if (f.includes('const styles = StyleSheet.create({')) {
    f = f.replace(/const styles = StyleSheet\.create\(\{/, 'const getStyles = (Colors: any) => StyleSheet.create({');
  }

  // Replace hardcoded colors
  f = f.replace(/backgroundColor: '#FAF8F5'/g, 'backgroundColor: Colors.background');
  f = f.replace(/backgroundColor: '#FFFFFF'/g, 'backgroundColor: Colors.cardBackground');
  f = f.replace(/backgroundColor: 'rgba\(255, 255, 255/g, "backgroundColor: Colors.cardBackground === '#FFFFFF' ? 'rgba(255, 255, 255' : 'rgba(30, 30, 30'");
  f = f.replace(/backgroundColor: 'rgba\(255,255,255/g, "backgroundColor: Colors.cardBackground === '#FFFFFF' ? 'rgba(255,255,255' : 'rgba(30,30,30'");
  f = f.replace(/color: '#111111'/g, 'color: Colors.textPrimary');
  f = f.replace(/color: '#27272A'/g, 'color: Colors.textPrimary');
  f = f.replace(/color: '#3F3F46'/g, 'color: Colors.textPrimary');
  f = f.replace(/color: '#52525B'/g, 'color: Colors.textSecondary');
  f = f.replace(/color: '#71717A'/g, 'color: Colors.textMuted');
  f = f.replace(/color: '#FFFFFF'/g, 'color: Colors.textInverse');
  f = f.replace(/borderColor: '#F4F4F5'/g, 'borderColor: Colors.borderLight');
  f = f.replace(/borderColor: '#EEEEEE'/g, 'borderColor: Colors.borderLight');
  f = f.replace(/borderColor: '#E5E7EB'/g, 'borderColor: Colors.border');
  f = f.replace(/backgroundColor: '#F4F4F5'/g, 'backgroundColor: Colors.surface');
  f = f.replace(/backgroundColor: '#111111'/g, 'backgroundColor: Colors.primary');
  f = f.replace(/backgroundColor: '#18181B'/g, 'backgroundColor: Colors.primary');
  f = f.replace(/backgroundColor: '#27272A'/g, 'backgroundColor: Colors.surface');
  f = f.replace(/backgroundColor: '#F0ECE6'/g, 'backgroundColor: Colors.surface');

  // Specific for BlurView in FloatingTabBar
  if (isFloatingBar) {
    f = f.replace(/tint="light"/, 'tint={Colors.cardBackground === "#FFFFFF" ? "light" : "dark"}');
    f = f.replace(/backgroundColor: 'rgba\(0,0,0,0.07\)'/, "backgroundColor: Colors.cardBackground === '#FFFFFF' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)'");
    f = f.replace(/backgroundColor: 'rgba\(0,0,0,0.11\)'/, "backgroundColor: Colors.cardBackground === '#FFFFFF' ? 'rgba(0,0,0,0.11)' : 'rgba(255,255,255,0.15)'");
    f = f.replace(/borderColor: 'rgba\(0,0,0,0.08\)'/, "borderColor: Colors.border");
  }

  // Handle color={favorite ? '#E11D48' : '#27272A'} in ProductCard
  if (filePath.includes('ProductCard.tsx')) {
    f = f.replace(/color=\{favorite \? '#E11D48' : '#27272A'\}/g, "color={favorite ? Colors.badgeSale : Colors.textPrimary}");
  }

  fs.writeFileSync(filePath, f);
}

refactorFile('src/components/Header.tsx', false);
refactorFile('src/components/FloatingTabBar.tsx', true);
refactorFile('src/components/ProductCard.tsx', false);
