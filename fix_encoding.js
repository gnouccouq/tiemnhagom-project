const fs = require('fs');
const iconv = require('iconv-lite');

const filePath = 'css/style.css';
let content = fs.readFileSync(filePath, 'utf8');

try {
    // 1. Encode the JS string back to Windows-1252 bytes.
    // If the file was originally UTF-8 bytes but interpreted as Win-1252,
    // this will recover the original UTF-8 bytes.
    const originalBytes = iconv.encode(content, 'win1252');
    
    // 2. Decode the original bytes as UTF-8.
    const fixedContent = iconv.decode(originalBytes, 'utf8');
    
    if (fixedContent.includes('Tăng toàn bộ') || fixedContent.includes('hiệu ứng')) {
        fs.writeFileSync(filePath, fixedContent, 'utf8');
        console.log("Successfully fixed double-encoded UTF-8 in style.css");
    } else {
        console.log("Not double-encoded or fix failed.");
    }
} catch (err) {
    console.error("Error fixing encoding:", err);
}
