const fs = require('fs');
const path = require('path');

const file = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'src', 'components', 'ProductCard.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace("import { ScalePressable } from './ScalePressable';", "import { ScalePressable } from './ScalePressable';\nimport { BlurButton } from './BlurButton';");

content = content.replace(/<ScalePressable\n\s*style=\{styles\.favoriteButton\}/, '<BlurButton\n            style={styles.favoriteButton}');
content = content.replace(/<\/ScalePressable>\s*<\/Animated\.View>/, '</BlurButton>\n        </Animated.View>');

content = content.replace(/<ScalePressable\n\s*style=\{\[styles\.quickAddButton, isSoldOut && styles\.quickAddButtonDisabled\]\}/, '<BlurButton\n              style={[styles.quickAddButton, isSoldOut && styles.quickAddButtonDisabled]}');
content = content.replace(/<Ionicons name="bag-add" size=\{15\} color="#FFFFFF" \/>\n\s*<\/ScalePressable>/, '<Ionicons name="bag-add" size={15} color="#18181B" />\n            </BlurButton>');

// Replace styles.favoriteButton
content = content.replace(/favoriteButton: \{[\s\S]*?\},/g, `favoriteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },`);

// Replace styles.quickAddButton
content = content.replace(/quickAddButton: \{[\s\S]*?\},/g, `quickAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 6,
  },`);

// Modify disabled button style since we removed background
content = content.replace(/quickAddButtonDisabled: \{[\s\S]*?\},/g, `quickAddButtonDisabled: {
    opacity: 0.5,
  },`);

fs.writeFileSync(file, content, 'utf8');
console.log('ProductCard.tsx updated');
