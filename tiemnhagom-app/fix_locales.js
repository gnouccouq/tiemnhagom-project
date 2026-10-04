const fs = require('fs');
['en.ts', 'vi.ts', 'zh.ts'].forEach(file => {
    const p = 'src/locales/' + file;
    if(!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    const keys = new Set();
    for(let i=0; i<lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\s*)([a-zA-Z0-9_]+)(\s*:)/);
        if(match) {
            let k = match[2];
            if(keys.has(k)) {
                let count = 2;
                while(keys.has(k + '_' + count)) count++;
                let newK = k + '_' + count;
                keys.add(newK);
                lines[i] = line.replace(/^(\s*)([a-zA-Z0-9_]+)(\s*:)/, (m, p1, p2, p3) => p1 + newK + p3);
            } else {
                keys.add(k);
            }
        }
    }
    fs.writeFileSync(p, lines.join('\n'), 'utf8');
});
console.log("Fixed duplicates successfully");
