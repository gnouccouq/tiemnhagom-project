const fs = require('fs');
const path = require('path');

function replaceHeader() {
  const file = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'src', 'components', 'Header.tsx');
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace("import { ScalePressable } from './ScalePressable';", "import { ScalePressable } from './ScalePressable';\nimport { BlurButton } from './BlurButton';");

  // Replace ScalePressable with BlurButton for the iconButtons
  content = content.replace(/<ScalePressable\s+style=\{styles\.iconButton\}/g, '<BlurButton\n                style={styles.iconButton}');
  content = content.replace(/<ScalePressable\s+style=\{\[styles\.iconButton,\s*\{\s*marginRight:\s*8\s*\}\]\}/g, '<BlurButton\n                style={[styles.iconButton, { marginRight: 8 }]}');
  content = content.replace(/<\/ScalePressable>/g, '</BlurButton>');

  // Fix styles.iconButton
  const oldIconBtn = `  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0ECE6',
  },`;
  const newIconBtn = `  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },`;
  content = content.replace(oldIconBtn, newIconBtn);

  fs.writeFileSync(file, content, 'utf8');
  console.log('Header.tsx correctly updated');
}

replaceHeader();
