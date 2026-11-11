// js/noel-page.js
import {
    db, auth, initHeader, toggleFavoriteLogic, renderProductCardWithVariants, showToast
} from "./utils.js";
import {
    collection, getDocs, doc, getDoc, query, where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let allNoelProducts = [];
let activeCategory = 'all';
let activeBudget = 'all';
let activeSort = 'featured';

const SAMPLE_WISHES = [
    "Giáng Sinh an lành nhé! Mong chiếc cốc gốm nhỏ này sẽ luôn giữ ấm đôi tay và mang lại thật nhiều niềm vui cho bạn mỗi sáng mùa đông.",
    "Merry Christmas! Chúc bạn một mùa lễ hội tràn ngập tiếng cười, bình an và thật nhiều khoảnh khắc ấm áp bên những người thân yêu.",
    "Gửi đến gia đình mình chút hơi ấm từ Tiệm Nhà Gốm. Chúc cả nhà một mùa Giáng Sinh sum vầy, an khang và ngập tràn yêu thương!",
    "Ho Ho Ho! Một món quà bất ngờ từ Secret Santa gửi tới bạn. Chúc bạn luôn rạng rỡ, hạnh phúc và gặp thật nhiều may mắn trong năm mới sắp tới nhé!"
];

function classifyProductForNoel(product = {}) {
    if (typeof window.classifyNoelSubCategory === 'function') {
        return window.classifyNoelSubCategory(product);
    }
    if (product.noelTag && product.noelTag !== 'all') return product.noelTag;
    const text = `${product.name || ''} ${product.category || ''} ${(product.collections || []).join(' ')} ${product.description || ''}`.toLowerCase();
    if (product.isCombo || /combo|set quà|hộp quà|quà tặng|gift/i.test(text)) return 'gifts';
    if (/ly|cốc|tách|mug|cup|ấm trà|tách trà/i.test(text)) return 'cups';
    if (/bình|lọ|nến|decor|trang trí|tượng|chuông|cây thông|đèn/i.test(text)) return 'decor';
    if (/đĩa|dĩa|tô|chén|bát|khay|bàn ăn|thố/i.test(text)) return 'dining';
    return 'gifts';
}

function getEffectivePrice(product = {}) {
    if (product.salePrice && Number(product.salePrice) > 0) return Number(product.salePrice);
    const base = Number(product.price) || 0;
    const salePct = Number(product.sale) || 0;
    if (salePct > 0 && base > 0) return Math.round(base * (1 - salePct / 100));
    return base;
}

function startNoelPageCountdown() {
    const dEl = document.getElementById('noel-page-cd-days');
    const hEl = document.getElementById('noel-page-cd-hours');
    const mEl = document.getElementById('noel-page-cd-mins');
    const sEl = document.getElementById('noel-page-cd-secs');
    if (!dEl || !hEl || !mEl || !sEl) return;

    const tick = () => {
        const now = new Date();
        let year = now.getFullYear();
        let target = new Date(year, 11, 24, 23, 59, 59);
        if (now > new Date(year, 11, 26, 0, 0, 0)) {
            target = new Date(year + 1, 11, 24, 23, 59, 59);
        }
        const diff = Math.max(0, target.getTime() - now.getTime());
        dEl.textContent = String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0');
        hEl.textContent = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
        mEl.textContent = String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0');
        sEl.textContent = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
    };
    tick();
    setInterval(tick, 1000);
}

function updateCategoryCounters() {
    const counts = { all: allNoelProducts.length, cups: 0, dining: 0, gifts: 0, decor: 0 };
    allNoelProducts.forEach(item => {
        const cat = classifyProductForNoel(item.data);
        if (counts[cat] !== undefined) counts[cat]++;
    });
    Object.keys(counts).forEach(key => {
        const el = document.getElementById(`noel-count-${key}`);
        if (el) el.textContent = `(${counts[key]})`;
    });
}

async function renderNoelCatalog() {
    const grid = document.getElementById('noel-page-product-grid');
    if (!grid) return;

    let favs = [];
    if (auth.currentUser) {
        try {
            const snap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (snap.exists()) favs = snap.data().productIds || [];
        } catch (e) {}
    } else {
        favs = JSON.parse(localStorage.getItem('favorites')) || [];
    }

    let list = allNoelProducts.filter(item => {
        const d = item.data;
        if (activeCategory !== 'all' && classifyProductForNoel(d) !== activeCategory) {
            return false;
        }
        const price = getEffectivePrice(d);
        if (activeBudget === 'under200' && price >= 200000) return false;
        if (activeBudget === '200to500' && (price < 200000 || price > 500000)) return false;
        if (activeBudget === 'over500' && price <= 500000) return false;
        return true;
    });

    list.sort((a, b) => {
        if (activeSort === 'price-asc') return getEffectivePrice(a.data) - getEffectivePrice(b.data);
        if (activeSort === 'price-desc') return getEffectivePrice(b.data) - getEffectivePrice(a.data);
        if (activeSort === 'sold-desc') return (Number(b.data.sold) || 0) - (Number(a.data.sold) || 0);
        // featured: ưu tiên sản phẩm được Admin gắn tag isNoel trước, sau đó đến lượt bán
        const aNoel = a.data.isNoel ? 1 : 0;
        const bNoel = b.data.isNoel ? 1 : 0;
        if (bNoel !== aNoel) return bNoel - aNoel;
        return (Number(b.data.sold) || 0) - (Number(a.data.sold) || 0);
    });

    if (list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem 1rem; background:#fff; border-radius:8px; border:1px dashed #D6D3D1;">
                <div style="font-size:2.4rem; margin-bottom:10px;"><i class="ti ti-deer"></i></div>
                <h4 style="margin:0 0 6px 0; color:#4A151B;">Chưa có món gốm nào khớp bộ lọc này</h4>
                <p style="margin:0 0 14px 0; color:#78716C; font-size:0.9rem;">Bạn thử chọn mức ngân sách hoặc danh mục khác để xem thêm nhé!</p>
                <button type="button" class="btn-noel-primary" onclick="window.resetNoelFilters()" style="border:none; cursor:pointer; padding:10px 20px;">
                    Xem toàn bộ Kệ Gốm Giáng Sinh
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = list.map(item =>
        renderProductCardWithVariants({ ...item.data, isNoel: true }, item.id, favs, '../product/index.html')
    ).join('');

    if (window.updateMembershipPrices) window.updateMembershipPrices();
}

window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, () => {
        renderNoelCatalog();
    });
};

window.setNoelPageCategory = function(cat, btnEl) {
    activeCategory = cat || 'all';
    const container = document.getElementById('noel-page-tabs');
    if (container) {
        container.querySelectorAll('.noel-tab-btn').forEach(b => b.classList.remove('active'));
    }
    if (btnEl) btnEl.classList.add('active');
    renderNoelCatalog();
};

window.setNoelPageBudget = function(budget, btnEl) {
    activeBudget = budget || 'all';
    const container = document.getElementById('noel-budget-pills');
    if (container) {
        container.querySelectorAll('.noel-price-pill').forEach(b => b.classList.remove('active'));
    }
    if (btnEl) btnEl.classList.add('active');
    renderNoelCatalog();
};

window.setNoelPageSort = function(sortVal) {
    activeSort = sortVal || 'featured';
    renderNoelCatalog();
};

window.resetNoelFilters = function() {
    activeCategory = 'all';
    activeBudget = 'all';
    activeSort = 'featured';
    document.querySelectorAll('#noel-page-tabs .noel-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('#noel-budget-pills .noel-price-pill').forEach((b, i) => b.classList.toggle('active', i === 0));
    const sortEl = document.getElementById('noel-sort-select');
    if (sortEl) sortEl.value = 'featured';
    renderNoelCatalog();
};

// --- GÓC VIẾT THIỆP GIÁNG SINH MIỄN PHÍ ---
window.fillSampleNoelWish = function(idx) {
    const msgEl = document.getElementById('noel-card-message');
    if (msgEl && SAMPLE_WISHES[idx]) {
        msgEl.value = SAMPLE_WISHES[idx];
        msgEl.focus();
    }
};

function loadSavedNoelGiftNote() {
    try {
        const raw = localStorage.getItem('tng_noel_gift_note_data');
        const statusEl = document.getElementById('noel-card-saved-status');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const toEl = document.getElementById('noel-card-to');
        const fromEl = document.getElementById('noel-card-from');
        const msgEl = document.getElementById('noel-card-message');
        if (toEl && parsed.to) toEl.value = parsed.to;
        if (fromEl && parsed.from) fromEl.value = parsed.from;
        if (msgEl && parsed.message) msgEl.value = parsed.message;
        if (statusEl && parsed.formatted) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = '<i class="ti ti-circle-check-filled"></i> Đã lưu lời chúc Giáng Sinh! Lời chúc sẽ tự động hiển thị tại mục Ghi chú khi bạn Thanh toán.';
        }
    } catch (e) {}
}

window.saveNoelGiftCardNote = function() {
    const toVal = (document.getElementById('noel-card-to')?.value || '').trim();
    const fromVal = (document.getElementById('noel-card-from')?.value || '').trim();
    const msgVal = (document.getElementById('noel-card-message')?.value || '').trim();

    if (!msgVal) {
        if (typeof showToast === 'function') {
            showToast('Bạn hãy nhập nội dung lời chúc Giáng Sinh trước khi lưu nhé!', 'error');
        }
        return;
    }

    const headerParts = [];
    if (toVal) headerParts.push(`Gửi: ${toVal}`);
    if (fromVal) headerParts.push(`Từ: ${fromVal}`);
    const formatted = `[THIỆP GIÁNG SINH VIẾT TAY${headerParts.length ? ' - ' + headerParts.join(' | ') : ''}]: "${msgVal}"`;

    localStorage.setItem('tng_noel_gift_note', formatted);
    localStorage.setItem('tng_noel_gift_note_data', JSON.stringify({
        to: toVal,
        from: fromVal,
        message: msgVal,
        formatted,
        savedAt: new Date().toISOString()
    }));

    const statusEl = document.getElementById('noel-card-saved-status');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<i class="ti ti-circle-check-filled"></i> Đã lưu lời chúc Giáng Sinh! Khi bạn vào Giỏ hàng đặt mua, lời chúc sẽ tự động đính kèm vào đơn.';
    }
    if (typeof showToast === 'function') {
        showToast('<i class="ti ti-christmas-tree"></i> Đã lưu lời chúc vào Thiệp Giáng Sinh miễn phí!');
    }
};

window.clearNoelGiftCardNote = function() {
    localStorage.removeItem('tng_noel_gift_note');
    localStorage.removeItem('tng_noel_gift_note_data');
    const toEl = document.getElementById('noel-card-to');
    const fromEl = document.getElementById('noel-card-from');
    const msgEl = document.getElementById('noel-card-message');
    const statusEl = document.getElementById('noel-card-saved-status');
    if (toEl) toEl.value = '';
    if (fromEl) fromEl.value = '';
    if (msgEl) msgEl.value = '';
    if (statusEl) statusEl.style.display = 'none';
    if (typeof showToast === 'function') {
        showToast('Đã xóa lời chúc Giáng Sinh đã lưu.');
    }
};

async function initNoelPage() {
    initHeader('../');
    startNoelPageCountdown();
    loadSavedNoelGiftNote();

    try {
        const sysSnap = await getDoc(doc(db, "settings", "system")).catch(() => null);
        if (sysSnap && sysSnap.exists()) {
            const hs = sysSnap.data()?.holidaySeason || {};
            if (hs.showcaseTitle) {
                const tEl = document.getElementById('noel-page-title');
                if (tEl) tEl.textContent = hs.showcaseTitle;
            }
            if (hs.showcaseSubtitle) {
                const sEl = document.getElementById('noel-page-subtitle');
                if (sEl) sEl.textContent = hs.showcaseSubtitle;
            }
        }

        // Chỉ hiển thị các sản phẩm được Admin tick chọn trưng bày Noel (isNoel == true)
        const q = query(collection(db, "products"), where("isNoel", "==", true));
        const snap = await getDocs(q);

        const explicitNoel = [];
        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.isHidden || d.isOnlyEvent) return;
            if (d.isNoel === true) {
                explicitNoel.push({ id: docSnap.id, data: d });
            }
        });

        allNoelProducts = explicitNoel;
        updateCategoryCounters();
        await renderNoelCatalog();
    } catch (err) {
        console.error("Lỗi tải trang Giáng Sinh:", err);
    }
}

document.addEventListener('DOMContentLoaded', initNoelPage);

