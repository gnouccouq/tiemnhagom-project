// js/main.js
import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, renderProductCardWithVariants, expandProductsWithVariants, initAutocomplete,
    DEFAULT_PRODUCT_CATEGORIES, toCategorySlug, escapeHTML
} from "./utils.js";
import { collection, getDocs, doc, getDoc, query, where, setDoc, limit, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Hàm toggle yêu thích
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, () => {
        fetchFeaturedProducts();
        initFlashSaleSync(); // Đồng bộ lại trạng thái sau khi toggle
        if (window.renderHomeNoelGrid) window.renderHomeNoelGrid();
    });
};

// Hàm trích xuất thời gian tạo sản phẩm chuẩn xác (ưu tiên createdAt)
function parseCreatedTimeMs(item) {
    if (!item) return 0;
    const candidates = [item.createdAt, item.createdDate, item.date, item.timestamp, item.updatedAt];
    for (const d of candidates) {
        if (!d) continue;
        if (typeof d === 'number') return d < 1e11 ? d * 1000 : d;
        if (typeof d === 'string') {
            const num = Number(d);
            if (!isNaN(num) && num > 1000000) return num < 1e11 ? num * 1000 : num;
            const ms = Date.parse(d);
            if (!isNaN(ms) && ms > 0) return ms;
        }
        if (d instanceof Date) {
            const ms = d.getTime();
            if (!isNaN(ms) && ms > 0) return ms;
        }
        if (typeof d.toMillis === 'function') {
            try { const ms = d.toMillis(); if (typeof ms === 'number' && ms > 0) return ms; } catch (_) {}
        }
        if (typeof d.toDate === 'function') {
            try { const ms = d.toDate().getTime(); if (typeof ms === 'number' && ms > 0) return ms; } catch (_) {}
        }
        if (typeof d.seconds === 'number' && d.seconds > 0) {
            return d.seconds * 1000 + Math.round((d.nanoseconds || 0) / 1e6);
        }
    }
    return 0;
}

// Hàm lấy sản phẩm Mới lên kệ (Sắp xếp theo thời gian tạo createdAt mới nhất)
async function fetchFeaturedProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    try {
        // Hiển thị skeleton loading trong khi chờ query Firestore
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        // Lấy các sản phẩm có ngày tạo (createdAt) mới nhất
        const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(50));
        
        // Lấy yêu thích song song để tránh blocking
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []);
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);
        
        const rawProducts = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.isHidden || data.isOnlyEvent) return;
            rawProducts.push({ id: docSnap.id, ...data });
        });

        // Tách sản phẩm chính và biến thể độc lập (showOnProductPage) rồi lọc các món còn hàng
        const expandedItems = expandProductsWithVariants(rawProducts).filter(item => {
            let isOut = Boolean(item.manualOutOfStock) || Boolean(item.isOutOfStock) || (Number(item.stock) || 0) <= 0;
            if (!item.isIndependentVariant && item.isCombo && Array.isArray(item.comboVariants) && item.comboVariants.length > 0) {
                const hasAnyAvailable = item.comboVariants.some(v => {
                    const hasOwn = (v.stock !== undefined && v.stock !== null && v.stock !== '');
                    const vStock = hasOwn ? Number(v.stock) : (Number(item.stock) || 0);
                    return !v.manualOutOfStock && !v.isOutOfStock && vStock > 0;
                });
                isOut = !hasAnyAvailable;
            }
            return !isOut;
        });

        // Sắp xếp chuẩn theo thời gian tạo mới nhất (createdAt giảm dần)
        expandedItems.sort((a, b) => {
            const timeDiff = parseCreatedTimeMs(b) - parseCreatedTimeMs(a);
            if (timeDiff !== 0) return timeDiff;
            return (b.id || '').localeCompare(a.id || '');
        });

        const newestItems = expandedItems.slice(0, 14);
        const htmlContent = newestItems.map(item => {
            if (item.isIndependentVariant) {
                return renderProductCard(item.parentProduct, item.parentId, favs, 'product/index.html', item.variantOverride);
            }
            return renderProductCard(item, item.id, favs, 'product/index.html');
        }).join('');

        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm nào.</p>';
        if (window.updateMembershipPrices) window.updateMembershipPrices();
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm mới lên kệ:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm lấy sản phẩm bán chạy (Xếp chung cả sản phẩm chính và biến thể độc lập theo thứ tự Đã bán giảm dần)
async function fetchBestSellingProducts() {
    const grid = document.getElementById('best-selling-grid');
    if (!grid) return;
    
    try {
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        const q = query(collection(db, "products"), orderBy("sold", "desc"), limit(50));
        
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []);
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);
        
        const rawProducts = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.isHidden || data.isOnlyEvent) return;
            rawProducts.push({ id: docSnap.id, ...data });
        });

        // Tách sản phẩm chính và từng biến thể độc lập (showOnProductPage) thành các mục riêng biệt
        const expandedItems = expandProductsWithVariants(rawProducts);

        // Lọc các mục đạt chuẩn bán chạy & còn hàng, sau đó sắp xếp theo số lượng Đã bán từ cao xuống thấp
        const bestSellerItems = expandedItems.filter(item => {
            let isOut = Boolean(item.manualOutOfStock) || Boolean(item.isOutOfStock) || (Number(item.stock) || 0) <= 0;
            if (!item.isIndependentVariant && item.isCombo && Array.isArray(item.comboVariants) && item.comboVariants.length > 0) {
                const hasAnyAvailable = item.comboVariants.some(v => {
                    const hasOwn = (v.stock !== undefined && v.stock !== null && v.stock !== '');
                    const vStock = hasOwn ? Number(v.stock) : (Number(item.stock) || 0);
                    return !v.manualOutOfStock && !v.isOutOfStock && vStock > 0;
                });
                isOut = !hasAnyAvailable;
            }
            const soldCount = Number(item.sold) || 0;
            return !isOut && (soldCount >= 5 || Boolean(item.isBestSeller));
        });

        bestSellerItems.sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0));

        const topItems = bestSellerItems.slice(0, 14);
        const htmlContent = topItems.map(item => {
            if (item.isIndependentVariant) {
                return renderProductCard(item.parentProduct, item.parentId, favs, 'product/index.html', item.variantOverride);
            }
            return renderProductCard(item, item.id, favs, 'product/index.html');
        }).join('');

        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm bán chạy.</p>';
        if (window.updateMembershipPrices) window.updateMembershipPrices();
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm bán chạy:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm lấy sản phẩm Combo
async function fetchComboProducts() {
    const grid = document.getElementById('combo-grid');
    if (!grid) return;
    
    try {
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        const q = query(collection(db, "products"), where("isCombo", "==", true), limit(10));
        
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []);
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);
        
        let htmlContent = '';
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden || doc.data().isOnlyEvent) return;
            if (count >= 10) return;
            htmlContent += renderProductCardWithVariants(doc.data(), doc.id, favs, 'product/index.html');
            count++;
        });
        grid.innerHTML = htmlContent || '<p>Hiện chưa có Combo nào.</p>';
        if (window.updateMembershipPrices) window.updateMembershipPrices();
    } catch (error) {
        console.error("Lỗi lấy dữ liệu Combo:", error);
        grid.innerHTML = '<p>Không thể tải Combo. Vui lòng thử lại sau.</p>';
    }
}

// --- GỢI Ý 1: KHÔNG GIAN TRƯNG BÀY HÀNG NOEL TRÊN TRANG CHỦ ---
let homeNoelProductsCache = [];
let currentHomeNoelTab = 'all';
let noelCountdownTimerId = null;

function classifyNoelProductLocal(product = {}) {
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

function startNoelCountdown() {
    const dEl = document.getElementById('noel-cd-days');
    const hEl = document.getElementById('noel-cd-hours');
    const mEl = document.getElementById('noel-cd-mins');
    const sEl = document.getElementById('noel-cd-secs');
    if (!dEl || !hEl || !mEl || !sEl) return;

    const updateTimer = () => {
        const now = new Date();
        let targetYear = now.getFullYear();
        let xmas = new Date(targetYear, 11, 24, 23, 59, 59);
        if (now > new Date(targetYear, 11, 26, 0, 0, 0)) {
            xmas = new Date(targetYear + 1, 11, 24, 23, 59, 59);
        }
        const diff = Math.max(0, xmas.getTime() - now.getTime());
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const mins = Math.floor((diff / 1000 / 60) % 60);
        const secs = Math.floor((diff / 1000) % 60);

        dEl.textContent = String(days).padStart(2, '0');
        hEl.textContent = String(hours).padStart(2, '0');
        mEl.textContent = String(mins).padStart(2, '0');
        sEl.textContent = String(secs).padStart(2, '0');
    };

    updateTimer();
    if (noelCountdownTimerId) clearInterval(noelCountdownTimerId);
    noelCountdownTimerId = setInterval(updateTimer, 1000);
}

window.renderHomeNoelGrid = async function() {
    const grid = document.getElementById('noel-product-grid');
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

    const filtered = homeNoelProductsCache.filter(item => {
        if (currentHomeNoelTab === 'all') return true;
        return classifyNoelProductLocal(item.data) === currentHomeNoelTab;
    });

    const displayList = filtered.slice(0, 12);
    if (displayList.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#78716C; padding:2rem;">Chưa có sản phẩm Noel nào trong danh mục này.</p>';
        return;
    }

    grid.innerHTML = displayList.map(item =>
        renderProductCardWithVariants(item.data, item.id, favs, 'product/index.html')
    ).join('');

    if (window.updateMembershipPrices) window.updateMembershipPrices();
};

window.filterHomeNoelTab = function(tabKey, btnEl) {
    currentHomeNoelTab = tabKey || 'all';
    const tabsContainer = document.getElementById('noel-home-tabs');
    if (tabsContainer) {
        tabsContainer.querySelectorAll('.noel-tab-btn').forEach(btn => btn.classList.remove('active'));
    }
    if (btnEl) btnEl.classList.add('active');
    window.renderHomeNoelGrid();
};

async function initNoelShowcase() {
    const section = document.getElementById('noel-showcase-section');
    const grid = document.getElementById('noel-product-grid');
    if (!section || !grid) return;

    startNoelCountdown();

    try {
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        // Kiểm tra cấu hình hệ thống trước khi hiển thị
        const sysSnap = await getDoc(doc(db, "settings", "system")).catch(() => null);
        if (sysSnap && sysSnap.exists()) {
            const sysData = sysSnap.data();
            const hs = sysData.holidaySeason || {};
            if (hs.showShowcase === false) {
                section.style.display = 'none';
                return;
            }
            if (hs.showcaseTitle) {
                const tEl = document.getElementById('noel-showcase-title-text');
                if (tEl) tEl.textContent = hs.showcaseTitle;
            }
            if (hs.showcaseSubtitle) {
                const sEl = document.getElementById('noel-showcase-subtitle-text');
                if (sEl) sEl.textContent = hs.showcaseSubtitle;
            }
        }

        // Chỉ lấy danh sách sản phẩm đã được Admin tick chọn trưng bày Noel (isNoel == true)
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

        homeNoelProductsCache = explicitNoel;
        await window.renderHomeNoelGrid();
    } catch (err) {
        console.error("Lỗi khởi tạo Góc Giáng Sinh:", err);
    }
}

// Hàm đồng bộ cấu hình Flash Sale từ Firestore và kiểm tra thời hạn
async function initFlashSaleSync() {
    const saleSection = document.getElementById('sale-section');
    const saleGrid = document.getElementById('sale-product-grid');
    if (!saleSection || !saleGrid) return;

    try {
        // 1. Nạp cấu hình từ Firestore (đồng bộ với trang Flash Sale)
        const fsRef = doc(db, "settings", "flash_sale");
        const fsSnap = await getDoc(fsRef);
        
        if (!fsSnap.exists()) {
            saleSection.style.display = 'none';
            return;
        }

        const settings = fsSnap.data();
        const now = new Date();
        const startTime = settings.startTime?.toDate ? settings.startTime.toDate() : (settings.startTime ? new Date(settings.startTime) : null);
        const endTime = settings.endTime?.toDate ? settings.endTime.toDate() : (settings.endTime ? new Date(settings.endTime) : null);
        const isExpired = endTime && now > endTime;

        // 2. Kiểm tra trạng thái sale
        if (!settings.isActive || isExpired) {
            saleSection.style.display = 'none';
            return;
        }

        const isUpcoming = startTime && now < startTime;
        const shimmer = saleSection.querySelector('.shimmer-title');
        const subtitle = saleSection.querySelector('.section-subtitle');

        if (isUpcoming) {
            if (shimmer) shimmer.innerHTML = `<i class="ti ti-alarm"></i> ${settings.title || "Siêu Sale 9.9"} - Sắp Diễn Ra!`;
            if (subtitle) subtitle.innerText = `Chính thức mở bán lúc ${startTime.toLocaleString('vi-VN')} - Săn deal số lượng có hạn!`;
            initDynamicCountdown(startTime);
            fetchSaleProducts(true, settings); // Nạp danh sách xem trước (chỉ sản phẩm 9.9)
        } else {
            if (shimmer) shimmer.innerHTML = `<i class="ti ti-flame-filled"></i> ${settings.title || "Flash Sale"} <img src="https://theme.hstatic.net/200000588671/1001020156/14/flashsale-hot.png?v=2949" alt="Hot" class="fire-icon">`;
            if (subtitle) subtitle.innerText = settings.subtitle || "Cơ hội sở hữu những tác phẩm tinh xảo với mức giá tốt nhất";
            initDynamicCountdown(endTime);
            fetchSaleProducts(false, settings); // Nạp danh sách sale đang chạy
        }

    } catch (e) {
        console.error("Lỗi đồng bộ Flash Sale trang chủ:", e);
        saleSection.style.display = 'none';
    }
}

async function fetchSaleProducts(isUpcoming = false, fsSettings = null) {
    const saleGrid = document.getElementById('sale-product-grid');
    if (!saleGrid) return;

    // Hiển thị skeleton loading
    saleGrid.innerHTML = Array(4).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text skeleton-title"></div>
            <div class="skeleton skeleton-text skeleton-small"></div>
            <div class="skeleton skeleton-text skeleton-price"></div>
        </div>
    `).join('');

    try {
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        const fsItemIds = (fsSettings && fsSettings.items) ? Object.keys(fsSettings.items) : [];
        let productsToRender = [];

        if (isUpcoming) {
            // Khi sắp diễn ra: Lấy các sản phẩm tham gia 9.9
            if (fsItemIds.length > 0) {
                const fsItemPromises = fsItemIds.slice(0, 8).map(pid => getDoc(doc(db, "products", pid)));
                const snaps = await Promise.all(fsItemPromises);
                snaps.forEach(snap => {
                    if (snap.exists() && !snap.data().isHidden && !snap.data().isOnlyEvent) {
                        productsToRender.push({ id: snap.id, ...snap.data() });
                    }
                });
            } else {
                // Nếu admin chưa chọn sản phẩm riêng trong items, tạm lấy các sản phẩm sale > 0 để preview
                const q = query(collection(db, "products"), where("sale", ">", 0), limit(8));
                const qSnap = await getDocs(q);
                qSnap.forEach(docSnap => {
                    const d = docSnap.data();
                    if (!d.isHidden && !d.isOnlyEvent) {
                        productsToRender.push({ id: docSnap.id, ...d });
                    }
                });
            }
        } else {
            // Khi đang diễn ra: Ưu tiên nạp các sản phẩm trong Flash Sale Campaign trước
            if (fsItemIds.length > 0) {
                const fsItemPromises = fsItemIds.slice(0, 8).map(pid => getDoc(doc(db, "products", pid)));
                const snaps = await Promise.all(fsItemPromises);
                snaps.forEach(snap => {
                    if (snap.exists() && !snap.data().isHidden && !snap.data().isOnlyEvent) {
                        productsToRender.push({ id: snap.id, ...snap.data() });
                    }
                });
            }

            // Nếu ít hơn 8 sản phẩm, bù thêm sản phẩm sale thông thường
            if (productsToRender.length < 8) {
                const q = query(collection(db, "products"), where("sale", ">", 0), limit(20));
                const qSnap = await getDocs(q);
                const existingIds = new Set(productsToRender.map(p => p.id));
                qSnap.forEach(docSnap => {
                    if (productsToRender.length < 8 && !existingIds.has(docSnap.id)) {
                        const d = docSnap.data();
                        if (!d.isHidden && !d.isOnlyEvent) {
                            productsToRender.push({ id: docSnap.id, ...d });
                            existingIds.add(docSnap.id);
                        }
                    }
                });
            }
        }

        const saleSec = document.getElementById('sale-section');
        if (saleSec) {
            if (productsToRender.length > 0) {
                saleGrid.innerHTML = productsToRender.map(p => renderProductCardWithVariants(p, p.id, favs, 'product/index.html')).join('');
                if (window.updateMembershipPrices) window.updateMembershipPrices();
                saleSec.style.display = 'block';
            } else {
                saleSec.style.display = 'none';
            }
        }
    } catch (error) {
        console.error("Lỗi lấy sản phẩm sale:", error);
        document.getElementById('sale-section').style.display = 'none';
    }
}

// Hàm lấy danh sách Bộ sưu tập (Banner trang chủ)
async function fetchCollections() {
    const container = document.getElementById('collection-grid');
    if (!container) return;

    try {
        const snap = await getDoc(doc(db, "settings", "collections"));
        const collections = (snap.exists() && snap.data().items) ? snap.data().items.filter(c => c.showOnHome).slice(0, 6) : [];

        if (collections.length > 0) {
            container.innerHTML = collections.map(c => `
                <a href="collections/detail.html?name=${encodeURIComponent(c.name)}" class="collection-banner reveal-on-scroll">
                    <img src="${c.imageUrl}" alt="${c.name}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                    <div class="collection-overlay">
                        <h3>${c.name}</h3>
                        <span class="btn-minimal">Khám phá ngay</span>
                    </div>
                </a>
            `).join('');

            // Kích hoạt lại Observer cho các phần tử mới nạp động
            const newItems = container.querySelectorAll('.reveal-on-scroll');
            if (window.revealObserver) {
                newItems.forEach(item => window.revealObserver.observe(item));
            } else {
                newItems.forEach(item => item.classList.add('is-visible'));
            }
        } else {
            container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: #999; padding: 2rem;">Bộ sưu tập đang được cập nhật...</p>';
        }
    } catch (e) { 
        console.error("Lỗi lấy bộ sưu tập:", e); 
        container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: #e74c3c;">Không thể kết nối đến máy chủ.</p>';
    }
}

// Hàm gợi ý sản phẩm dựa trên lịch sử xem (Categories đã xem)
async function fetchRecommendations() {
    const recSection = document.getElementById('recommendation-section');
    const recGrid = document.getElementById('recommendation-grid');
    const history = JSON.parse(localStorage.getItem('viewed_products')) || [];
    
    if (history.length === 0) return;

    // 0. Hiển thị skeleton loading trong khi chờ query Firestore
    recSection.style.display = 'block';
    recGrid.innerHTML = Array(5).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text skeleton-title"></div>
            <div class="skeleton skeleton-text skeleton-small"></div>
            <div class="skeleton skeleton-text skeleton-price"></div>
        </div>
    `).join('');

    try {
        // 1. Lấy trực tiếp categories từ LocalStorage (Đã được lưu ở trang chi tiết)
        // Việc này giúp loại bỏ hoàn toàn các lượt đọc Firestore không cần thiết tại đây
        const recentCategories = new Set();
        history.slice(0, 3).forEach(item => {
            if (item && item.category) recentCategories.add(item.category);
        });

        if (recentCategories.size === 0) return;

        // 2. Query sản phẩm thuộc các categories này
        let htmlContent = '';
        const cats = Array.from(recentCategories);
        const historyIds = history.map(item => typeof item === 'string' ? item : item.id);
        
        const q = query(collection(db, "products"), where("category", "in", cats), limit(4));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden || doc.data().isOnlyEvent) return;
            // Không hiện lại sản phẩm đã nằm trong lịch sử xem gần đây
            if (!historyIds.slice(0, 4).includes(doc.id)) {
                htmlContent += renderProductCardWithVariants(doc.data(), doc.id, [], 'product/index.html');
            }
        });

        if (htmlContent) {
            recGrid.innerHTML = htmlContent;
            if (window.updateMembershipPrices) window.updateMembershipPrices();
        } else {
            recSection.style.display = 'none'; // Ẩn nếu không có dữ liệu thực tế phù hợp
        }
    } catch (error) {
        console.error("Lỗi lấy gợi ý:", error);
        recSection.style.display = 'none';
    }
}

// Hàm đếm ngược thời gian dựa trên cài đặt Admin
function initDynamicCountdown(endTime) {
    const update = () => {
        const now = new Date();
        const diff = endTime - now;
        if (diff <= 0) {
            if (window.fsHomeTimer) clearInterval(window.fsHomeTimer);
            initFlashSaleSync(); // Gọi lại sync để tự động nạp sản phẩm khi từ Sắp bắt đầu -> Đang diễn ra
            return;
        }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if(document.getElementById('days')) {
            document.getElementById('days').innerText = d.toString().padStart(2, '0');
            document.getElementById('hours').innerText = h.toString().padStart(2, '0');
            document.getElementById('minutes').innerText = m.toString().padStart(2, '0');
            document.getElementById('seconds').innerText = s.toString().padStart(2, '0');
        }
    };
    if (window.fsHomeTimer) clearInterval(window.fsHomeTimer);
    window.fsHomeTimer = setInterval(update, 1000);
    update();
}

// Logic cho Hero Carousel
async function initHeroCarousel() {
    const container = document.getElementById('hero-carousel-container');
    const dotsContainer = document.getElementById('hero-carousel-dots');
    if (!container || !dotsContainer) return;

    let slidesData = [];
    try {
        const snap = await getDoc(doc(db, "settings", "banners"));
        if (snap.exists()) slidesData = snap.data().slides || [];
    } catch (e) { console.error("Load banner error:", e); }

    // Fallback nếu không có data hoặc lỗi
    if (slidesData.length === 0) {
        slidesData = [
            { imageUrl: 'Asset/images/hero-bg.webp', link: 'products/' },
            { imageUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?q=100&w=2560', link: 'products/' }
        ];
    }

    // Inject HTML
    container.innerHTML = slidesData.map((s, idx) => {
        const slideInner = `
            <picture>
                <source media="(max-width: 768px)" srcset="${s.mobileImageUrl || s.imageUrl}">
                <img src="${s.imageUrl}" alt="Banner Tiệm Nhà Gốm" ${idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} style="width:100%; height:100%; object-fit:cover;">
            </picture>`;
        
        return s.link 
            ? `<a href="${s.link}" class="carousel-slide ${idx === 0 ? 'active' : ''}">${slideInner}</a>`
            : `<div class="carousel-slide ${idx === 0 ? 'active' : ''}">${slideInner}</div>`;
    }).join('');

    dotsContainer.innerHTML = slidesData.map((_, idx) => `
        <div class="carousel-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></div>
    `).join('');

    const slides = container.querySelectorAll('.carousel-slide');
    const dots = dotsContainer.querySelectorAll('.carousel-dot');

    let currentIndex = 0;
    let slideInterval;
    const slideDuration = 4000;

    const showSlide = (index) => {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));

        slides[index].classList.add('active');
        dots[index].classList.add('active');

        currentIndex = index;
    };

    const startAutoSlide = () => {
        slideInterval = setInterval(() => {
            showSlide((currentIndex + 1) % slides.length);
        }, slideDuration);
    };

    // Logic kéo chuột/vuốt màn hình để đổi slide
    let startX = 0;
    let preventClick = false;
    const threshold = 50; // Khoảng cách tối thiểu (pixel) để nhận diện hành động kéo

    const handleStart = (e) => {
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        preventClick = false;
    };

    const handleMove = (e) => {
        if (!startX) return;
        const currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        const diff = startX - currentX;
        if (Math.abs(diff) > 5) preventClick = true;
    };

    const handleEnd = (e) => {
        if (!startX) return;
        const endX = e.type.includes('mouse') ? e.pageX : (e.changedTouches ? e.changedTouches[0].clientX : 0);
        const diff = startX - endX;

        if (Math.abs(diff) > threshold) {
            if (diff > 0) showSlide((currentIndex + 1) % slides.length);
            else showSlide((currentIndex - 1 + slides.length) % slides.length);
            if (slideInterval) { clearInterval(slideInterval); startAutoSlide(); }
        }
        startX = 0;
    };

    container.addEventListener('mousedown', handleStart);
    container.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    container.addEventListener('touchstart', handleStart, { passive: true });
    container.addEventListener('touchmove', handleMove, { passive: true });
    container.addEventListener('touchend', handleEnd);

    // Ngăn hành vi kéo link mặc định của trình duyệt để có thể vuốt được
    container.addEventListener('dragstart', (e) => e.preventDefault());
    
    // Ngăn việc vô tình click vào link khi đang vuốt ảnh
    container.addEventListener('click', (e) => {
        if (preventClick) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            if (preventClick) return;
            const index = parseInt(e.currentTarget.dataset.index);
            showSlide(index);
            if (slideInterval) { clearInterval(slideInterval); startAutoSlide(); }
        });
    });

    startAutoSlide();
    showSlide(0);
}

// ----------------------------------------------------
// STORY SLIDER (KHỐI VỀ TIỆM NHÀ GỐM TRANG CHỦ)
// ----------------------------------------------------
function initStorySlider() {
    const slides = document.querySelectorAll('.story-slide');
    const dotsContainer = document.getElementById('story-dots');
    if (!slides || slides.length === 0) return;

    let currentStoryIdx = 0;
    let storyTimer = null;

    // Render dots
    if (dotsContainer) {
        dotsContainer.innerHTML = Array.from(slides).map((_, i) => `
            <div class="story-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
        `).join('');

        const dots = dotsContainer.querySelectorAll('.story-dot');
        dots.forEach((dot, idx) => {
            dot.addEventListener('click', () => {
                showStorySlide(idx);
                resetStoryTimer();
            });
        });
    }

    function showStorySlide(idx) {
        if (idx >= slides.length) idx = 0;
        if (idx < 0) idx = slides.length - 1;
        currentStoryIdx = idx;

        slides.forEach((s, i) => {
            s.classList.toggle('active', i === currentStoryIdx);
        });

        if (dotsContainer) {
            const dots = dotsContainer.querySelectorAll('.story-dot');
            dots.forEach((d, i) => {
                d.classList.toggle('active', i === currentStoryIdx);
            });
        }
    }

    function moveStorySlide(step) {
        showStorySlide(currentStoryIdx + step);
        resetStoryTimer();
    }

    function startStoryTimer() {
        if (slides.length > 1) {
            storyTimer = setInterval(() => {
                showStorySlide(currentStoryIdx + 1);
            }, 4500);
        }
    }

    function resetStoryTimer() {
        if (storyTimer) clearInterval(storyTimer);
        startStoryTimer();
    }

    // Gán ra window để dự phòng
    window.moveStorySlide = moveStorySlide;

    // Gán Event Listener trực tiếp cho 2 nút mũi tên
    const btnPrev = document.getElementById('btn-story-prev');
    const btnNext = document.getElementById('btn-story-next');
    if (btnPrev) {
        btnPrev.addEventListener('click', (e) => {
            e.preventDefault();
            moveStorySlide(-1);
        });
    }
    if (btnNext) {
        btnNext.addEventListener('click', (e) => {
            e.preventDefault();
            moveStorySlide(1);
        });
    }

    startStoryTimer();
}

// ----------------------------------------------------
// FETCH HOME BLOG CAROUSEL
// ----------------------------------------------------
async function initHomeBlog() {
    const carousel = document.getElementById('home-blog-carousel');
    const dotsContainer = document.getElementById('home-blog-dots');
    const prevBtn = document.getElementById('home-blog-prev');
    const nextBtn = document.getElementById('home-blog-next');
    const bottomBar = document.querySelector('.home-blog-bottom');
    const section = document.querySelector('.home-blog-section');
    if (!carousel || !dotsContainer) return;

    try {
        const q = query(collection(db, "news"), orderBy("createdAt", "desc"), limit(12));
        const querySnapshot = await getDocs(q);

        const publishedDocs = [];
        querySnapshot.forEach(docSnap => {
            const article = docSnap.data();
            if (article.status && article.status !== 'published') return;
            if (publishedDocs.length < 9) {
                publishedDocs.push({ id: docSnap.id, article });
            }
        });

        if (publishedDocs.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }

        let html = '';
        publishedDocs.forEach(({ id, article }) => {
            const date = article.createdAt && typeof article.createdAt.toDate === 'function'
                ? new Date(article.createdAt.toDate()).toLocaleDateString('vi-VN')
                : '';

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = article.content || '';
            const rawText = (article.excerpt || tempDiv.textContent || tempDiv.innerText || '').trim();
            const excerpt = rawText.length > 100 ? rawText.substring(0, 100) + '...' : rawText;

            const author = String(article.author || article.authorName || article.createdByName || '').trim() || 'Tiệm Nhà Gốm';
            const views = Math.max(0, Number(article.views) || 0);
            const titleText = String(article.title || '');
            const coverAlt = String(article.coverAlt || titleText || 'Bài viết Tiệm Nhà Gốm').trim();
            const isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
            const articleKey = encodeURIComponent(article.slug || id);
            const articleHref = isLocalHost ? `blog/article.html?id=${articleKey}` : `/blog/${articleKey}`;

            html += `
                <a href="${articleHref}" class="home-blog-card" draggable="false">
                    <div class="home-blog-img-wrapper">
                        <img src="${escapeHTML(article.imageUrl || '')}" alt="${escapeHTML(coverAlt)}" loading="lazy" draggable="false">
                        <div class="home-blog-overlay">
                            <div class="home-blog-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                            </div>
                        </div>
                    </div>
                    <div class="home-blog-content">
                        <h3>${escapeHTML(titleText)}</h3>
                        <p class="home-blog-excerpt">${escapeHTML(excerpt)}</p>
                        <span class="home-blog-meta">${date ? `${date} | ` : ''}${escapeHTML(author)} · ${views.toLocaleString('vi-VN')} lượt xem</span>
                    </div>
                </a>
            `;
        });

        carousel.innerHTML = html;

        const cards = carousel.querySelectorAll('.home-blog-card');
        if (cards.length === 0) return;

        let currentItem = 0;
        let autoScrollInterval = null;
        let dots = [];
        let isHovered = false;
        let isPointerDown = false;
        let hasDragged = false;
        let startX = 0;
        let startScrollLeft = 0;
        let suppressClickUntil = 0;
        let scrollRaf = null;
        let resizeTimer = null;

        const getMetrics = () => {
            const style = getComputedStyle(carousel);
            const gap = parseFloat(style.columnGap || style.gap) || 28;
            const cardWidth = cards[0].getBoundingClientRect().width;
            const stepWidth = Math.max(1, cardWidth + gap);
            const maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
            const maxIndex = maxScroll <= 4 ? 0 : Math.max(1, Math.round(maxScroll / stepWidth));
            return { stepWidth, maxScroll, maxIndex };
        };

        const updateControls = (activeIdx, maxIndex) => {
            dots.forEach((d, idx) => {
                const isActive = idx === activeIdx;
                d.classList.toggle('active', isActive);
                if (isActive) {
                    d.setAttribute('aria-current', 'true');
                } else {
                    d.removeAttribute('aria-current');
                }
            });
            if (prevBtn) prevBtn.disabled = activeIdx <= 0;
            if (nextBtn) nextBtn.disabled = activeIdx >= maxIndex;
        };

        const syncActiveFromScroll = () => {
            const { stepWidth, maxScroll, maxIndex } = getMetrics();
            let idx = 0;
            if (maxScroll > 4) {
                if (carousel.scrollLeft >= maxScroll - 4) {
                    idx = maxIndex;
                } else {
                    idx = Math.max(0, Math.min(maxIndex, Math.round(carousel.scrollLeft / stepWidth)));
                }
            }
            currentItem = idx;
            updateControls(idx, maxIndex);
            return idx;
        };

        const scrollToIndex = (idx, smooth = true) => {
            const { stepWidth, maxScroll, maxIndex } = getMetrics();
            const clampedIdx = maxIndex === 0 ? 0 : Math.max(0, Math.min(maxIndex, idx));
            currentItem = clampedIdx;
            const targetLeft = clampedIdx >= maxIndex ? maxScroll : Math.min(clampedIdx * stepWidth, maxScroll);
            carousel.scrollTo({
                left: targetLeft,
                behavior: smooth ? 'smooth' : 'auto'
            });
            updateControls(clampedIdx, maxIndex);
        };

        const stopAutoScroll = () => {
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }
        };

        const startAutoScroll = () => {
            stopAutoScroll();
            if (isHovered || isPointerDown) return;
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const { maxIndex } = getMetrics();
            if (maxIndex <= 0) return;

            autoScrollInterval = setInterval(() => {
                const metrics = getMetrics();
                if (metrics.maxIndex <= 0) return;
                const nextIdx = currentItem >= metrics.maxIndex ? 0 : currentItem + 1;
                scrollToIndex(nextIdx, true);
            }, 5000);
        };

        const renderDots = () => {
            const { maxIndex } = getMetrics();
            if (maxIndex <= 0) {
                dotsContainer.innerHTML = '';
                dots = [];
                if (bottomBar) bottomBar.hidden = true;
                if (prevBtn) prevBtn.hidden = true;
                if (nextBtn) nextBtn.hidden = true;
                currentItem = 0;
                stopAutoScroll();
                return;
            }

            if (bottomBar) bottomBar.hidden = false;
            if (prevBtn) prevBtn.hidden = false;
            if (nextBtn) nextBtn.hidden = false;

            const activeIdx = Math.max(0, Math.min(maxIndex, currentItem));
            let dotHtml = '';
            for (let i = 0; i <= maxIndex; i++) {
                dotHtml += `<button type="button" class="home-blog-dot ${i === activeIdx ? 'active' : ''}" data-index="${i}" aria-label="Trang bài viết ${i + 1}"></button>`;
            }
            dotsContainer.innerHTML = dotHtml;
            dots = Array.from(dotsContainer.querySelectorAll('.home-blog-dot'));

            dots.forEach(dot => {
                dot.addEventListener('click', () => {
                    const idx = parseInt(dot.dataset.index, 10);
                    if (Number.isNaN(idx)) return;
                    stopAutoScroll();
                    scrollToIndex(idx, true);
                    startAutoScroll();
                });
            });

            updateControls(activeIdx, maxIndex);
        };

        // Click điều hướng Prev / Next
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                stopAutoScroll();
                scrollToIndex(currentItem - 1, true);
                startAutoScroll();
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                stopAutoScroll();
                scrollToIndex(currentItem + 1, true);
                startAutoScroll();
            });
        }

        // Kéo qua kéo lại bằng chuột trên Desktop
        carousel.addEventListener('dragstart', (e) => e.preventDefault());

        carousel.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isPointerDown = true;
            hasDragged = false;
            startX = e.pageX;
            startScrollLeft = carousel.scrollLeft;
            stopAutoScroll();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isPointerDown) return;
            const dx = e.pageX - startX;
            if (!hasDragged && Math.abs(dx) > 5) {
                hasDragged = true;
                carousel.classList.add('is-dragging');
            }
            if (hasDragged) {
                carousel.scrollLeft = startScrollLeft - dx;
                syncActiveFromScroll();
            }
        });

        const finishPointerDrag = () => {
            if (!isPointerDown) return;
            isPointerDown = false;
            carousel.classList.remove('is-dragging');
            if (hasDragged) {
                suppressClickUntil = Date.now() + 140;
                const nearest = syncActiveFromScroll();
                scrollToIndex(nearest, true);
            }
            hasDragged = false;
            startAutoScroll();
        };

        window.addEventListener('mouseup', finishPointerDrag);
        window.addEventListener('blur', finishPointerDrag);

        carousel.addEventListener('click', (e) => {
            if (Date.now() < suppressClickUntil) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        // Đồng bộ dot theo thời gian thực khi vuốt touch / trackpad / scroll
        carousel.addEventListener('scroll', () => {
            if (hasDragged || scrollRaf) return;
            scrollRaf = requestAnimationFrame(() => {
                scrollRaf = null;
                syncActiveFromScroll();
            });
        }, { passive: true });

        carousel.addEventListener('touchstart', stopAutoScroll, { passive: true });
        carousel.addEventListener('touchend', startAutoScroll, { passive: true });

        carousel.addEventListener('mouseenter', () => {
            isHovered = true;
            stopAutoScroll();
        });
        carousel.addEventListener('mouseleave', () => {
            isHovered = false;
            startAutoScroll();
        });

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                renderDots();
                syncActiveFromScroll();
                startAutoScroll();
            }, 150);
        });

        renderDots();
        syncActiveFromScroll();
        startAutoScroll();

    } catch (error) {
        console.error("Lỗi khi tải Blog:", error);
    }
}


// Hàm hiển thị cụm 6 Danh mục sản phẩm cha trên Trang chủ (Sử dụng bộ Tabler Icons & số lượng thực tế)
async function fetchHomeCategories() {
    const grid = document.getElementById('home-category-grid');
    if (!grid) return;

    const CATEGORY_STYLE_PRESETS = [
        { icon: 'ti-tools-kitchen-2', bg: 'linear-gradient(135deg, #18181b, #3f3f46)', shadow: 'rgba(24, 24, 27, 0.22)' },
        { icon: 'ti-coffee', bg: 'linear-gradient(135deg, #9C7156, #7c5841)', shadow: 'rgba(156, 113, 86, 0.28)' },
        { icon: 'ti-flower', bg: 'linear-gradient(135deg, #b45309, #92400e)', shadow: 'rgba(180, 83, 9, 0.26)' },
        { icon: 'ti-flame', bg: 'linear-gradient(135deg, #9a3412, #7c2d12)', shadow: 'rgba(154, 52, 18, 0.26)' },
        { icon: 'ti-shopping-bag', bg: 'linear-gradient(135deg, #57534e, #44403c)', shadow: 'rgba(87, 83, 78, 0.24)' },
        { icon: 'ti-gift', bg: 'linear-gradient(135deg, #854d0e, #713f12)', shadow: 'rgba(133, 77, 14, 0.25)' }
    ];

    const pickCategoryIcon = (name = '', fallbackIdx = 0) => {
        const lower = String(name).toLowerCase();
        if (lower.includes('dining') || lower.includes('bàn ăn') || lower.includes('bát') || lower.includes('chén')) return CATEGORY_STYLE_PRESETS[0];
        if (lower.includes('tea') || lower.includes('drink') || lower.includes('trà') || lower.includes('ly')) return CATEGORY_STYLE_PRESETS[1];
        if (lower.includes('home') || lower.includes('decor') || lower.includes('hoa') || lower.includes('trang trí')) return CATEGORY_STYLE_PRESETS[2];
        if (lower.includes('kitchen') || lower.includes('bếp') || lower.includes('nồi') || lower.includes('dụng cụ')) return CATEGORY_STYLE_PRESETS[3];
        if (lower.includes('lifestyle') || lower.includes('phong cách')) return CATEGORY_STYLE_PRESETS[4];
        if (lower.includes('value') || lower.includes('pack') || lower.includes('combo') || lower.includes('set') || lower.includes('quà')) return CATEGORY_STYLE_PRESETS[5];
        return CATEGORY_STYLE_PRESETS[fallbackIdx % CATEGORY_STYLE_PRESETS.length];
    };

    try {
        const [catSnap, prodSnap] = await Promise.all([
            getDoc(doc(db, "settings", "product_categories")).catch(() => null),
            getDocs(collection(db, "products")).catch(() => null)
        ]);

        let groups = [...DEFAULT_PRODUCT_CATEGORIES];
        if (catSnap && catSnap.exists() && Array.isArray(catSnap.data().groups) && catSnap.data().groups.length > 0) {
            groups = [...catSnap.data().groups].sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        // Nếu trong Firestore đang có 5 danh mục cha (chưa có Value Packs), bổ sung danh mục cha thứ 6 Value Packs
        if (groups.length < 6 && !groups.some(g => /value|combo/i.test(g.name || ''))) {
            groups.push({ name: "Value Packs", order: 6, subs: ["Combo Bàn Ăn", "Set Matcha & Trà Đạo"] });
        }

        const publicDocs = prodSnap
            ? prodSnap.docs.map(d => d.data()).filter(p => !p.isHidden && !p.isOnlyEvent)
            : [];

        const countCards = (docs) => {
            let count = 0;
            docs.forEach(p => {
                count += 1;
                if (Array.isArray(p.comboVariants)) count += p.comboVariants.filter(v => v && v.showOnProductPage).length;
                if (Array.isArray(p.colorVariants)) count += p.colorVariants.filter(v => v && v.showOnProductPage).length;
                if (Array.isArray(p.patternVariants)) count += p.patternVariants.filter(v => v && v.showOnProductPage).length;
            });
            return count;
        };

        // Chỉ lấy đúng 6 danh mục cha
        const parentGroups = groups.slice(0, 6);
        const displayItems = parentGroups.map((g) => {
            const slug = toCategorySlug(g.name);
            const subNames = Array.isArray(g.subs) ? g.subs : [];
            const isValuePack = /value|combo/i.test(g.name || '');
            const matchingDocs = publicDocs.filter(p => {
                if (p.category === g.name || subNames.includes(p.category)) return true;
                if (isValuePack && Boolean(p.isCombo)) return true;
                return false;
            });
            return {
                name: g.name,
                url: `products/?category=${slug}`,
                count: countCards(matchingDocs)
            };
        });

        grid.innerHTML = displayItems.map((cat, idx) => {
            const preset = pickCategoryIcon(cat.name, idx);
            return `
                <a href="${cat.url}" class="tng-home-cat-card">
                    <div class="tng-home-cat-icon" style="--cat-icon-bg: ${preset.bg}; --cat-icon-shadow: ${preset.shadow};">
                        <i class="ti ${preset.icon}"></i>
                    </div>
                    <div class="tng-home-cat-info">
                        <h3 class="tng-home-cat-name">${escapeHTML(cat.name)}</h3>
                        <span class="tng-home-cat-count">${cat.count} sản phẩm</span>
                    </div>
                </a>
            `;
        }).join('');
    } catch (err) {
        console.error("Lỗi tải danh mục trang chủ:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('./');
    
    // Kích hoạt ngay lập tức mà không cần chờ Auth để tăng tốc độ load
    initHeroCarousel();
    fetchHomeCategories();
    initNoelShowcase();
    fetchFeaturedProducts();
    fetchBestSellingProducts();
    fetchComboProducts();
    initFlashSaleSync();
    fetchRecommendations();
    fetchCollections();
    initStorySlider();
    initHomeBlog();
    
    // Khởi tạo tìm kiếm ở trang chủ
    initAutocomplete('home-search-input', 'home-search-suggestions', './');
});
      
