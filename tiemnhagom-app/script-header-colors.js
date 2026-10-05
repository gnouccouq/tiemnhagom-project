const fs = require('fs');
let f = fs.readFileSync('src/components/Header.tsx', 'utf8');
f = f.replace(/color="#18181B"/g, 'color={Colors.textPrimary}');
f = f.replace(/color="#71717A"/g, 'color={Colors.textMuted}');
f = f.replace(/placeholderTextColor="#71717A"/g, 'placeholderTextColor={Colors.textMuted}');
fs.writeFileSync('src/components/Header.tsx', f);
