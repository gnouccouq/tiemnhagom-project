const fs = require('fs');
const path = require('path');

function replaceProductCard() {
  const file = path.join('d:', 'tiemnhagom-project', 'tiemnhagom-app', 'src', 'components', 'ProductCard.tsx');
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace("import { ScalePressable } from './ScalePressable';", "import { ScalePressable } from './ScalePressable';\nimport { BlurButton } from './BlurButton';");

  // Favorite button
  content = content.replace(/<ScalePressable\n\s*style=\{styles\.favoriteButton\}/, '<BlurButton\n            style={styles.favoriteButton}');
  content = content.replace(/<\/ScalePressable>\s*<\/Animated\.View>/, '</BlurButton>\n        </Animated.View>');

  // Quick add button
  content = content.replace(/<ScalePressable\n\s*style=\{\[styles\.quickAddButton, isSoldOut && styles\.quickAddButtonDisabled\]\}/, '<BlurButton\n              style={[styles.quickAddButton, isSoldOut && styles.quickAddButtonDisabled]}');
  content = content.replace(/<Ionicons name="bag-add" size=\{15\} color="#FFFFFF" \/>\n\s*<\/ScalePressable>/, '<Ionicons name="bag-add" size={15} color="#18181B" />\n            </BlurButton>');

  // Fix styles.favoriteButton
  const oldFavBtn = `  favoriteButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },`;
  const newFavBtn = `  favoriteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },`;
  content = content.replace(oldFavBtn, newFavBtn);

  // Fix styles.quickAddButton
  const oldQuickAddBtn = `  quickAddButton: {
    backgroundColor: '#18181B',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },`;
  const newQuickAddBtn = `  quickAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 6,
  },`;
  content = content.replace(oldQuickAddBtn, newQuickAddBtn);

  // Fix styles.quickAddButtonDisabled
  const oldDisabled = `  quickAddButtonDisabled: {
    backgroundColor: '#D4D4D8',
  },`;
  const newDisabled = `  quickAddButtonDisabled: {
    opacity: 0.5,
  },`;
  content = content.replace(oldDisabled, newDisabled);

  fs.writeFileSync(file, content, 'utf8');
  console.log('ProductCard.tsx correctly updated');
}

replaceProductCard();
