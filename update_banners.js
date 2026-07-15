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
    'trang-tri-su-kien/index.html'
];

const workspacePath = 'd:/tiemnhagom-project';

const heroCSS = `
    <style>
        #col-hero {
            background-attachment: scroll;
            background-position: center;
            background-size: cover;
            width: 100%;
            height: 30vh;
            min-height: 300px;
            margin-top: -80px;
        }
    </style>
</head>`;

files.forEach(file => {
    const fullPath = path.join(workspacePath, file);
    if (!fs.existsSync(fullPath)) {
        console.log('Skip not found:', file);
        return;
    }
    
    let content = fs.readFileSync(fullPath, 'utf8');
    let updated = false;
    
    // Add home-page class to body
    content = content.replace(/<body([^>]*)>/, (match, p1) => {
        if (!p1.includes('home-page')) {
            updated = true;
            if (p1.includes('class="')) {
                return `<body${p1.replace('class="', 'class="home-page ')}>`;
            } else {
                return `<body class="home-page"${p1}>`;
            }
        }
        return match;
    });

    // Inject CSS
    if (!content.includes('#col-hero {') && !content.includes('id="col-hero"')) {
        content = content.replace('</head>', heroCSS);
        updated = true;
    }
    
    // Extract background image from old banner
    const bannerRegex = /<section\s+class="product-banner"[^>]*style="[^"]*url\('([^']+)'\)[^>]*>([\s\S]*?)<\/section>/i;
    const match = content.match(bannerRegex);
    
    if (match) {
        let imageUrl = match[1];
        let innerHtml = match[2];
        
        // Try to extract h1
        let titleMatch = innerHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        let title = 'Tiệm Nhà Gốm';
        if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        }
        
        const newBanner = `<!-- Banner đầu trang full chiều ngang, phong cách tối giản -->
        <section id="col-hero" style="background-image: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url('${imageUrl}'); display: flex; align-items: center; justify-content: center; position: relative;">
            <h1 id="hero-banner-title" style="color: #fff; font-size: 1.4rem; font-weight: 600; letter-spacing: 1px; text-transform: lowercase; z-index: 10; text-align: center;">${title}</h1>
        </section>`;
        
        content = content.replace(bannerRegex, newBanner);
        updated = true;
    }
    
    // Bypass cache utils.js -> utils.js?v=7
    content = content.replace(/utils\.js(\?v=\d+)?/g, 'utils.js?v=7');
    content = content.replace(/main\.js(\?v=\d+)?/g, 'main.js?v=7');
    content = content.replace(/products\.js(\?v=\d+)?/g, 'products.js?v=7');
    
    if (updated || content.includes('?v=7')) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated', file);
    }
});
