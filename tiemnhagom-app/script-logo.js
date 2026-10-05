const fs = require('fs');
let h = fs.readFileSync('src/components/Header.tsx', 'utf8');

// 1. Add useColorScheme
if (!h.includes('useColorScheme')) {
  h = h.replace(/import\s*\{[^}]*View,[^}]*Text,[^}]*\}\s*from\s*'react-native';/, (match) => {
    if (!match.includes('useColorScheme')) {
      return match.replace('View,', 'View, useColorScheme,');
    }
    return match;
  });
}

// 2. Add isDark definition
if (!h.includes('const isDark =')) {
  h = h.replace(/const insets = useSafeAreaInsets\(\);/, "const insets = useSafeAreaInsets();\n  const isDark = useColorScheme() === 'dark';");
}

// 3. Update black logo opacity
h = h.replace(/style=\{\[styles\.logoImage, \{ opacity: progress \}\]\}/g, "style={[styles.logoImage, { opacity: isDark ? 0 : progress }]}");

// 4. Update white logo opacity
h = h.replace(/opacity: 1 - progress,/g, "opacity: isDark ? 1 : (1 - progress),");

fs.writeFileSync('src/components/Header.tsx', h);
