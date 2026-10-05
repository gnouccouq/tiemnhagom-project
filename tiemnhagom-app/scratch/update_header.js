const fs = require('fs');
const path = require('path');

const file = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'src', 'components', 'Header.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace("import { ScalePressable } from './ScalePressable';", "import { ScalePressable } from './ScalePressable';\nimport { BlurButton } from './BlurButton';");

content = content.replace(/<ScalePressable\s+style=\{styles\.iconButton\}/g, '<BlurButton\n                style={styles.iconButton}');
content = content.replace(/<\/ScalePressable>/g, '</BlurButton>');

// Replace styles.iconButton
content = content.replace(/iconButton: \{[\s\S]*?\},/g, `iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },`);

fs.writeFileSync(file, content, 'utf8');
console.log('Header.tsx updated');
