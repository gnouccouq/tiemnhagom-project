const fs = require('fs');
let code = fs.readFileSync('d:/tiemnhagom-project/js/products.js', 'utf8');

const oldFuncStart = code.indexOf('// Hàm render danh mục sản phẩm (Dạng text đơn giản)');
const nextFuncStart = code.indexOf('// Hàm chính để lấy và hiển thị sản phẩm');

if (oldFuncStart !== -1 && nextFuncStart !== -1) {
    const newFunc = `// Hàm render danh mục sản phẩm (Dạng text đơn giản)
function renderCategoryGrid() {
    const container = document.getElementById('category-grid-display');
    if (!container) return;

    container.className = 'minimal-category-list';

    // Lấy lại danh mục đã chọn từ URL nếu có
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category') || 'all';

    let html = \`
        <a href="javascript:void(0)" class="minimal-cat-item \${catParam === 'all' ? 'active' : ''}" data-filter-category="all" id="cat-all">
            tất cả <span class="cat-count">(...)</span>
        </a>
    \`;

    dynamicCategories.forEach(group => {
        const isActive = catParam === group.name || (group.subs && group.subs.includes(catParam));
        html += \`
            <a href="javascript:void(0)" class="minimal-cat-item \${isActive ? 'active' : ''}" data-filter-category="\${group.name}" id="cat-\${group.name.replace(/\\s+/g, '-')}">
                \${group.name.toLowerCase()} <span class="cat-count">(...)</span>
            </a>
        \`;
    });
    
    container.innerHTML = html;
    setupCategoryEvents();

    // Tải số lượng bất đồng bộ
    fetchCategoryCounts();
}

async function fetchCategoryCounts() {
    try {
        const snap = await getCountFromServer(collection(db, "products"));
        const el = document.getElementById('cat-all');
        if (el) el.querySelector('.cat-count').textContent = \`(\${snap.data().count})\`;
    } catch (e) {
        console.error("Lỗi đếm số lượng tất cả:", e);
    }

    dynamicCategories.forEach(async (group) => {
        try {
            let q;
            if (group.subs && group.subs.length > 0) {
                q = query(collection(db, "products"), where("category", "in", group.subs));
            } else {
                q = query(collection(db, "products"), where("category", "==", group.name));
            }
            const snap = await getCountFromServer(q);
            const el = document.getElementById(\`cat-\${group.name.replace(/\\s+/g, '-')}\`);
            if (el) el.querySelector('.cat-count').textContent = \`(\${snap.data().count})\`;
        } catch (e) {
            console.error("Lỗi đếm số lượng " + group.name + ":", e);
        }
    });
}

`;
    
    code = code.substring(0, oldFuncStart) + newFunc + code.substring(nextFuncStart);
    fs.writeFileSync('d:/tiemnhagom-project/js/products.js', code);
    console.log('Updated products.js successfully');
} else {
    console.log('Could not find function bounds in products.js');
}
