const fs = require('fs');
let f = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
f = f.replace(/color: Colors\.textMuted \},/g, "color: '#71717A' },");
fs.writeFileSync('app/(tabs)/index.tsx', f);
