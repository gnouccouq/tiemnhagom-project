const fs = require('fs');

function fixTextColors(filePath) {
  let f = fs.readFileSync(filePath, 'utf8');
  
  // Replace dark colors for texts
  f = f.replace(/color: '#18181B'/g, "color: Colors.textPrimary");
  f = f.replace(/color: '#111111'/g, "color: Colors.textPrimary");
  f = f.replace(/color: '#27272A'/g, "color: Colors.textPrimary");
  f = f.replace(/color: '#3F3F46'/g, "color: Colors.textPrimary");
  f = f.replace(/color: '#52525B'/g, "color: Colors.textSecondary");
  f = f.replace(/color: '#71717A'/g, "color: Colors.textMuted");
  f = f.replace(/color: '#A1A1AA'/g, "color: Colors.textMuted");
  
  fs.writeFileSync(filePath, f);
}

try {
  fixTextColors('app/(tabs)/index.tsx');
} catch (e) {
  console.log(e);
}
