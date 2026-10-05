const fs = require('fs');

// 1. Fix ProductCard.tsx colors
let pc = fs.readFileSync('src/components/ProductCard.tsx', 'utf8');
pc = pc.replace(/color: '#18181B'/g, 'color: Colors.textPrimary');
pc = pc.replace(/color: '#A1A1AA'/g, 'color: Colors.textMuted');
fs.writeFileSync('src/components/ProductCard.tsx', pc);

// 2. Make Header permanently transparent
let h = fs.readFileSync('src/components/Header.tsx', 'utf8');
h = h.replace(/backgroundColor: Colors\.background/g, "backgroundColor: 'transparent'");
h = h.replace(/backgroundColor: 'rgba\(250, 248, 245, 0\.98\)'/g, "backgroundColor: 'transparent'");
h = h.replace(/borderBottomWidth: 1,/g, "borderBottomWidth: 0,");
h = h.replace(/elevation: 4,/g, "elevation: 0,");
h = h.replace(/shadowOpacity: 0\.07,/g, "shadowOpacity: 0,");
fs.writeFileSync('src/components/Header.tsx', h);
