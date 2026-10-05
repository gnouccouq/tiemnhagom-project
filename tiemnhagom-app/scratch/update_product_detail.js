const fs = require('fs');
const path = require('path');

const file = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'app', 'product', '[id].tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace("import { ScalePressable } from '../../src/components/ScalePressable';", "import { ScalePressable } from '../../src/components/ScalePressable';\nimport { BlurButton } from '../../src/components/BlurButton';");

content = content.replace(/<ScalePressable/g, '<BlurButton');
content = content.replace(/<\/ScalePressable>/g, '</BlurButton>');

// Replace styles.headerBtn
content = content.replace(/headerBtn: \{[\s\S]*?\},/g, `headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },`);

fs.writeFileSync(file, content, 'utf8');
console.log('product/[id].tsx updated');
