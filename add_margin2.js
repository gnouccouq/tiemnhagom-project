const fs = require('fs');
const path = require('path');

const files = [
    'buying-guide.html',
    'chinh-sach-gia.html',
    'giai-quyet-khieu-nai.html',
    'ho-tro-truc-tuyen.html',
    'payment-policy.html',
    'privacy-policy.html',
    'return-refund-policy.html',
    'shipping-policy.html',
    'terms-of-service.html',
    'about/index.html',
    'blog/index.html',
    'contact/index.html',
    'hoa-nha-gom/index.html',
    'trang-tri-su-kien/index.html',
    'products/index.html',
    'collections/index.html',
    'flash-sale/index.html'
];

const workspacePath = 'd:/tiemnhagom-project';

files.forEach(file => {
    const fullPath = path.join(workspacePath, file);
    if (!fs.existsSync(fullPath)) return;
    
    let content = fs.readFileSync(fullPath, 'utf8');
    
    if (content.includes('margin-top: -80px;') && !content.includes('margin-top: -80px;\n            margin-bottom: 4rem;')) {
        content = content.replace(/margin-top:\s*-80px;/, 'margin-top: -80px;\n            margin-bottom: 4rem;');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated', file);
    }
});
