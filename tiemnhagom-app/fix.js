const fs = require('fs');
['en.ts', 'vi.ts', 'zh.ts'].forEach(file => {
    const p = 'src/locales/' + file;
    if(!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    const newLines = lines.map(line => {
        return line.replace(/^(\s*[a-zA-Z0-9_]+_2)(\s*')/, '$1: $2');
    });
    fs.writeFileSync(p, newLines.join('\n'));
});
