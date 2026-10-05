const fs = require('fs');

function fixBorders(filePath) {
  let f = fs.readFileSync(filePath, 'utf8');
  
  // Fix inline colors
  f = f.replace(/color="#18181B"/g, "color={Colors.textPrimary}");
  f = f.replace(/color="#71717A"/g, "color={Colors.textMuted}");
  
  // Fix border colors
  f = f.replace(/borderColor: '#E4E4E7'/g, "borderColor: Colors.border");
  f = f.replace(/borderTopColor: '#F4F4F5'/g, "borderTopColor: Colors.borderLight");
  f = f.replace(/borderBottomColor: '#F4F4F5'/g, "borderBottomColor: Colors.borderLight");
  f = f.replace(/borderColor: '#ECE7DF'/g, "borderColor: Colors.border");
  f = f.replace(/borderBottomColor: '#F3EFE9'/g, "borderBottomColor: Colors.borderLight");
  f = f.replace(/borderTopColor: '#ECE7DF'/g, "borderTopColor: Colors.borderLight");
  f = f.replace(/borderColor: 'rgba\\(0, 0, 0, 0.08\\)'/g, "borderColor: Colors.border");
  
  // Fix some text colors
  f = f.replace(/color: '#9C3615'/g, "color: Colors.badgeSale");
  
  fs.writeFileSync(filePath, f);
}

try {
  fixBorders('app/(tabs)/index.tsx');
  fixBorders('src/components/Header.tsx');
  fixBorders('src/components/ProductCard.tsx');
} catch (e) {
  console.log(e);
}
