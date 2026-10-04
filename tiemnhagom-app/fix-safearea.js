const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if(file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('app').concat(walk('src'));
let fixed = 0;
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if(content.includes('SafeAreaView') && !content.includes('react-native-safe-area-context')) {
    const rx = /import\s+{([^}]*?SafeAreaView[^}]*?)}\s+from\s+['"]react-native['"]/s;
    const match = content.match(rx);
    if(match) {
       const inner = match[1];
       const newInner = inner.split(',').map(s=>s.trim()).filter(s => s && s!=='SafeAreaView').join(',\n  ');
       const newImport = 'import {\n  ' + newInner + '\n} from \'react-native\';\nimport { SafeAreaView } from \'react-native-safe-area-context\';';
       content = content.replace(rx, newImport);
       fs.writeFileSync(f, content, 'utf8');
       console.log('Fixed ' + f);
       fixed++;
    }
  }
});
console.log('Total fixed: ' + fixed);
