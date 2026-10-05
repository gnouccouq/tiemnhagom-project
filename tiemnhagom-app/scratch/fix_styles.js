const fs = require('fs');
const path = require('path');

function fixFiles() {
  // Fix Header.tsx
  const headerFile = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'src', 'components', 'Header.tsx');
  let header = fs.readFileSync(headerFile, 'utf8');
  // Use regex to replace iconButton
  header = header.replace(/iconButton:\s*\{[\s\S]*?borderColor:\s*'#F0ECE6',\s*\}/, `iconButton: {\n    width: 40,\n    height: 40,\n    borderRadius: 20,\n  }`);
  fs.writeFileSync(headerFile, header, 'utf8');

  // Fix ProductCard.tsx
  const cardFile = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'src', 'components', 'ProductCard.tsx');
  let card = fs.readFileSync(cardFile, 'utf8');
  // Use regex for favoriteButton
  card = card.replace(/favoriteButton:\s*\{[\s\S]*?elevation:\s*2,\s*\}/, `favoriteButton: {\n    width: 30,\n    height: 30,\n    borderRadius: 15,\n  }`);
  // Use regex for quickAddButton
  card = card.replace(/quickAddButton:\s*\{[\s\S]*?elevation:\s*2,\s*\}/, `quickAddButton: {\n    width: 32,\n    height: 32,\n    borderRadius: 16,\n    marginLeft: 6,\n  }`);
  // Use regex for disabled
  card = card.replace(/quickAddButtonDisabled:\s*\{[\s\S]*?\},/, `quickAddButtonDisabled: {\n    opacity: 0.5,\n  },`);
  
  fs.writeFileSync(cardFile, card, 'utf8');
  console.log('Fixed both files with regex');
}
fixFiles();
