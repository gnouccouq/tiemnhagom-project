import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, renderProductCardWithVariants, 
    dynamicCategories, DEFAULT_PRODUCT_CATEGORIES, removeVietnameseTones, searchAndRankProducts, expandProductsWithVariants,
    toCategorySlug, resolveCategoryFromParam
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore, onSnapshot, getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { renderPersonalizedRecommendations } from "./ai-recommendations.js";

// Cấu hình phân trang
const PAGE_SIZE = 10; // Tải mỗi lần 10 sản phẩm
let lastVisible = null; // Document cuối cùng của trang hiện tại
let currentTotalCount = 0; // Tổng số sản phẩm của query hiện tại
let currentLoadedCount = 0; // Số sản phẩm đã tải
let activeSubCategory = null; // Lưu trữ danh mục con từ URL
let filterSaleOnly = false;
let filterComboOnly = false;
let filterInStockOnly = false;
let filterMinPrice = 0;
let filterMaxPrice = 0;

function syncSortPillsUI(sortVal) {
    const sortBy = document.getElementById('sort-by');
    if (sortBy && sortVal) sortBy.value = sortVal;
    const current = sortVal || (sortBy ? sortBy.value : 'newest') || 'newest';
    document.querySelectorAll('#app-sort-pills .app-sort-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === current);
    });
    window.tngRefreshSlidingPills?.();
}

function updateActiveFilterBadge() {
    let count = 0;
    if (filterMinPrice > 0 || filterMaxPrice > 0) count++;
    if (filterSaleOnly) count++;
    if (filterComboOnly) count++;
    if (filterInStockOnly) count++;

    const openBtn = document.getElementById('app-open-filter-btn');
    const badge = document.getElementById('app-active-filter-badge');
    const clearBtn = document.getElementById('app-clear-filters-btn');
    if (openBtn) openBtn.classList.toggle('has-active', count > 0);
    if (badge) {
        badge.textContent = String(count);
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (clearBtn) {
        const hasSearch = Boolean((document.getElementById('search-name')?.value || '').trim());
        clearBtn.style.display = (count > 0 || hasSearch) ? 'inline-flex' : 'none';
    }
}
let searchTimeout; // Biến để xử lý debounce cho tìm kiếm (no change)
// dynamicCategories is now imported directly from utils.js

// Hàm hỗ trợ cập nhật thẻ Meta cho SEO
function updateMetaTag(attr, value, content) {
    let element = document.querySelector(`meta[${attr}="${value}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, value);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

// Hàm toggle yêu thích (dùng chung cho các trang hiển thị sản phẩm)
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, fetchProducts);
};

// Hàm hiển thị thông báo khi không có sản phẩm
function showEmptyProductsMessage(container, currentCategory, activeSubCategory, hasSearchTerm, searchTerm) {
    if (!container) return;
    let msgText = 'Không tìm thấy sản phẩm nào phù hợp.';
    if (hasSearchTerm) {
        msgText = `Không tìm thấy sản phẩm nào phù hợp với từ khóa "${searchTerm}".`;
    } else if (activeSubCategory || currentCategory !== 'all') {
        msgText = 'không có sản phẩm ở danh mục này';
    }
    container.innerHTML = `<p style="font-size: 1rem; color: #666; font-weight: 500; text-transform: lowercase;">${msgText}</p>`;
    container.style.display = 'block';
}

// Hàm render danh mục sản phẩm (Bao gồm danh mục chính và danh mục con)
function renderCategoryGrid() {
    const container = document.getElementById('category-grid-display');
    if (!container) return;

    // Lấy danh mục từ URL
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter') || '';
    const catParam = (filterParam === 'combo') ? 'combo' : (urlParams.get('category') || 'all');
    const isComboFilter = (catParam === 'combo' || activeSubCategory === 'combo');

    // Dùng resolveCategoryFromParam để tìm nhóm chính & danh mục con đang active
    const resolved = isComboFilter ? { isAll: false, group: null } : resolveCategoryFromParam(catParam, dynamicCategories);
    let activeGroup = resolved.group;
    if (!activeGroup && activeSubCategory && !isComboFilter) {
        const subResolved = resolveCategoryFromParam(activeSubCategory, dynamicCategories);
        activeGroup = subResolved.group;
    }

    const getCatIcon = (name) => {
        const lower = (name || '').toLowerCase();
        if (lower.includes('dining') || lower.includes('bàn ăn') || lower.includes('chén') || lower.includes('đĩa')) return 'ti-tools-kitchen-2';
        if (lower.includes('tea') || lower.includes('drink') || lower.includes('trà') || lower.includes('ly') || lower.includes('cốc')) return 'ti-coffee';
        if (lower.includes('home') || lower.includes('decor') || lower.includes('hoa') || lower.includes('trang trí')) return 'ti-flower';
        if (lower.includes('kitchen') || lower.includes('bếp')) return 'ti-flame';
        if (lower.includes('lifestyle') || lower.includes('túi') || lower.includes('phụ kiện')) return 'ti-shopping-bag';
        if (lower.includes('value') || lower.includes('combo') || lower.includes('bộ')) return 'ti-gift';
        return 'ti-tag';
    };

    let mainCatHtml = `
        <div class="minimal-category-list">
            <a href="javascript:void(0)" class="minimal-cat-item ${resolved.isAll && !activeSubCategory && !isComboFilter ? 'active' : ''}" data-filter-category="all" id="cat-all">
                <i class="ti ti-tag"></i><span>tất cả</span> <span class="cat-count">(...)</span>
            </a>
    `;

    dynamicCategories.forEach(group => {
        const isGroupActive = !isComboFilter && activeGroup && activeGroup.name === group.name;
        const iconClass = getCatIcon(group.name);
        mainCatHtml += `
            <a href="javascript:void(0)" class="minimal-cat-item ${isGroupActive ? 'active' : ''}" data-filter-category="${group.name}" data-category-slug="${toCategorySlug(group.name)}" id="cat-${toCategorySlug(group.name)}">
                <i class="ti ${iconClass}"></i><span>${group.name.toLowerCase()}</span> <span class="cat-count">(...)</span>
            </a>
        `;
    });

    mainCatHtml += `
        <a href="javascript:void(0)" class="minimal-cat-item ${isComboFilter ? 'active' : ''}" data-filter-category="combo" data-category-slug="combo" id="cat-combo">
            <i class="ti ti-gift"></i><span>bộ sản phẩm (combo)</span> <span class="cat-count">(...)</span>
        </a>
    </div>`;

    // Render danh mục con nếu nhóm đang được chọn
    let subCatHtml = '';
    if (activeGroup && activeGroup.subs && activeGroup.subs.length > 0) {
        subCatHtml += `<div class="sub-category-list">`;
        const isAllSubActive = !activeSubCategory && resolved.isGroup;
        subCatHtml += `
            <a href="javascript:void(0)" class="minimal-subcat-item ${isAllSubActive ? 'active' : ''}" data-filter-subcategory="group-all" data-parent-group="${activeGroup.name}">
                tất cả ${activeGroup.name.toLowerCase()}
            </a>
        `;
        activeGroup.subs.forEach(sub => {
            const isSubActive = (activeSubCategory && (activeSubCategory === sub || toCategorySlug(activeSubCategory) === toCategorySlug(sub))) || (resolved.isSub && resolved.sub === sub);
            subCatHtml += `
                <a href="javascript:void(0)" class="minimal-subcat-item ${isSubActive ? 'active' : ''}" data-filter-subcategory="${sub}" data-subcategory-slug="${toCategorySlug(sub)}" id="subcat-${toCategorySlug(sub)}">
                    ${sub.toLowerCase()} <span class="subcat-count">(...)</span>
                </a>
            `;
        });
        subCatHtml += `</div>`;
    }

    container.innerHTML = mainCatHtml + subCatHtml;
    setupCategoryEvents();

    // Tải số lượng bất đồng bộ
    fetchCategoryCounts();
}

async function fetchCategoryCounts() {
    try {
        const snap = await getDocs(collection(db, "products"));
        const allDocs = snap.docs.map(d => d.data());
        const publicDocs = allDocs.filter(p => !p.isHidden && !p.isOnlyEvent);
        
        const countCards = (docs) => {
            let count = 0;
            docs.forEach(p => {
                count += 1;
                if (p.comboVariants && Array.isArray(p.comboVariants)) {
                    count += p.comboVariants.filter(v => v.showOnProductPage).length;
                }
                if (p.colorVariants && Array.isArray(p.colorVariants)) {
                    count += p.colorVariants.filter(v => v.showOnProductPage).length;
                }
                if (p.patternVariants && Array.isArray(p.patternVariants)) {
                    count += p.patternVariants.filter(v => v.showOnProductPage).length;
                }
            });
            return count;
        };

        const elAll = document.getElementById('cat-all');
        if (elAll && elAll.querySelector('.cat-count')) {
            elAll.querySelector('.cat-count').textContent = `(${countCards(publicDocs)})`;
        }

        const elCombo = document.getElementById('cat-combo');
        if (elCombo && elCombo.querySelector('.cat-count')) {
            const comboDocs = publicDocs.filter(p => Boolean(p.isCombo));
            elCombo.querySelector('.cat-count').textContent = `(${countCards(comboDocs)})`;
        }

        dynamicCategories.forEach(group => {
            const el = document.getElementById(`cat-${toCategorySlug(group.name)}`);
            if (el && el.querySelector('.cat-count')) {
                let catDocs = [];
                if (group.subs && group.subs.length > 0) {
                    catDocs = publicDocs.filter(p => group.subs.includes(p.category));
                } else {
                    catDocs = publicDocs.filter(p => p.category === group.name);
                }
                el.querySelector('.cat-count').textContent = `(${countCards(catDocs)})`;
            }

            if (group.subs && Array.isArray(group.subs)) {
                group.subs.forEach(sub => {
                    const subEl = document.getElementById(`subcat-${toCategorySlug(sub)}`);
                    if (subEl && subEl.querySelector('.subcat-count')) {
                        const subDocs = publicDocs.filter(p => p.category === sub);
                        subEl.querySelector('.subcat-count').textContent = `(${countCards(subDocs)})`;
                    }
                });
            }
        });
    } catch (e) {
        console.error("Lỗi đếm số lượng:", e);
    }
}

// Hàm chính để lấy và hiển thị sản phẩm
async function fetchProducts(navigation = 'init', categoryOverride = null) {
    const productGrid = document.getElementById('all-product-grid');
    const noProductsMsg = document.getElementById('no-products-found');
    const loadMoreBtn = document.getElementById('load-more-btn');

    if (navigation === 'init') {
        // Áp dụng hiệu ứng mờ chỉ khi tải mới
        productGrid.classList.add('loading-fade');
        productGrid.innerHTML = Array(PAGE_SIZE).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');
        // Cuộn mượt về khu vực danh sách sản phẩm để người dùng thấy rõ kết quả lọc
        window.scrollTo({ top: productGrid.offsetTop - 150, behavior: 'smooth' });
    }
    noProductsMsg.style.display = 'none';

    try {
        let productsQuery = collection(db, "products");
        // Chỉ ghi đè activeSubCategory nếu categoryOverride được truyền vào cụ thể (không phải null)
        if (navigation === 'init' && categoryOverride !== null) activeSubCategory = categoryOverride;
        
        const urlParamsNow = new URLSearchParams(window.location.search);
        const filterParam = urlParamsNow.get('filter') || '';
        const sortParam = urlParamsNow.get('sort') || '';

        let currentCategory = activeSubCategory || document.querySelector('.minimal-cat-item.active')?.dataset.filterCategory || 'all';
        if (filterParam === 'combo' || urlParamsNow.get('category') === 'combo') {
            currentCategory = 'combo';
        }
        let currentSort = document.getElementById('sort-by')?.value || sortParam || 'newest';
        let searchTerm = document.getElementById('search-name')?.value.trim() || '';
        let hasSearchTerm = !!searchTerm;
        let minPrice = filterMinPrice > 0 ? filterMinPrice : (Number(document.getElementById('price-min')?.value) || 0);
        let maxPrice = filterMaxPrice > 0 ? filterMaxPrice : (Number(document.getElementById('price-max')?.value) || 0);
        const hasAdvancedFilter = minPrice > 0 || maxPrice > 0 || filterSaleOnly || filterComboOnly || filterInStockOnly;
        let collectionParam = urlParamsNow.get('collection');

        // Reset khi đổi bộ lọc hoặc khởi tạo
        if (navigation === 'init') {
            lastVisible = null;
        }

        // Tối ưu SEO: Cập nhật Title và Meta Description theo danh mục / bộ lọc đang xem
        let categoryDisplay = 'Tất cả sản phẩm';
        if (collectionParam) {
            categoryDisplay = `Bộ sưu tập: ${collectionParam}`;
        } else if (currentCategory === 'combo') {
            categoryDisplay = 'Bộ sản phẩm (Combo)';
        } else if (filterParam === 'recommended') {
            categoryDisplay = 'Dành riêng cho bạn';
        } else if (currentCategory !== 'all') {
            categoryDisplay = currentCategory;
        } else if (currentSort === 'popular') {
            categoryDisplay = 'Sản phẩm bán chạy';
        } else if (sortParam === 'newest') {
            categoryDisplay = 'Mới lên kệ';
        }
        const seoTitle = `${categoryDisplay} | Tiệm Nhà Gốm - Gốm Sứ & Decor Thủ Công`;

        const bannerTitleH1 = document.getElementById('hero-banner-title');
        if (bannerTitleH1) {
            bannerTitleH1.innerText = categoryDisplay.replace('Bộ sưu tập: ', '').toLowerCase();
        }

        const seoDesc = `Khám phá bộ sưu tập ${categoryDisplay.toLowerCase()} tinh tế tại Tiệm Nhà Gốm. Sản phẩm thủ công chất lượng cao, thiết kế mộc mạc cho không gian sống.`;
        
        document.title = seoTitle;
        updateMetaTag('name', 'description', seoDesc);
        updateMetaTag('name', 'robots', 'index, follow');
        updateMetaTag('property', 'og:title', seoTitle);
        updateMetaTag('property', 'og:description', seoDesc);

        // Apply filters
        // Nếu KHÔNG có từ khóa tìm kiếm, áp dụng lọc Danh mục / BST trên Firestore; các bộ lọc nâng cao lọc client-side để tránh thiếu composite index
        if (!hasSearchTerm) {
            if (collectionParam) {
                productsQuery = query(productsQuery, where("collections", "array-contains", collectionParam));
            } else if (currentCategory === 'combo') {
                productsQuery = query(productsQuery, where("isCombo", "==", true));
            } else if (filterParam === 'recommended') {
                const history = JSON.parse(localStorage.getItem('viewed_products')) || [];
                const viewedCats = [...new Set(history.map(h => typeof h === 'object' ? h.category : null).filter(Boolean))].slice(0, 10);
                if (viewedCats.length > 0) {
                    productsQuery = query(productsQuery, where("category", "in", viewedCats));
                }
            } else if (currentCategory !== 'all') {
                const resolved = resolveCategoryFromParam(currentCategory, dynamicCategories);
                const selectedGroup = resolved.isGroup ? resolved.group : dynamicCategories.find(g => g.name === currentCategory);
                if (selectedGroup) {
                    if (selectedGroup.subs && selectedGroup.subs.length > 0) {
                        productsQuery = query(productsQuery, where("category", "in", [selectedGroup.name, ...selectedGroup.subs]));
                    } else {
                        productsQuery = query(productsQuery, where("category", "==", selectedGroup.name));
                    }
                } else {
                    const actualName = resolved.isSub ? resolved.sub : (resolved.name || currentCategory);
                    const subMatches = [actualName];
                    if (actualName === 'Lọ Hoa Nghệ Thuật' || currentCategory === 'Lọ Hoa Nghệ Thuật') subMatches.push('Bình & Lọ Hoa', 'Bình hoa', 'Lọ hoa');
                    if (actualName === 'Bát & Chén' || currentCategory === 'Bát & Chén') subMatches.push('Tô, Bát & Chén', 'Chén bát', 'Bát đĩa');
                    if (actualName === 'Dĩa & Khay' || currentCategory === 'Dĩa & Khay') subMatches.push('Đĩa Ăn & Decor');
                    if (actualName === 'Đĩa Ăn & Decor' || currentCategory === 'Đĩa Ăn & Decor') subMatches.push('Dĩa & Khay');
                    if (actualName === 'Ly & Tách' || currentCategory === 'Ly & Tách') subMatches.push('Cốc, Ly & Phụ Kiện');
                    if (actualName === 'Ấm Trà' || currentCategory === 'Ấm Trà') subMatches.push('Ấm chén', 'Bộ ấm chén');
                    productsQuery = query(productsQuery, where("category", "in", Array.from(new Set(subMatches))));
                }
            }
        }

        // Apply sorting logic
        // Khi có search hoặc bộ lọc nâng cao (giá/sale/combo/còn hàng), bỏ orderBy Firestore để lấy batch 500 rồi lọc & sắp xếp client-side
        if (hasSearchTerm || hasAdvancedFilter) {
            productsQuery = query(productsQuery, limit(500));
        } else {
            switch (currentSort) {
                case 'name-asc': productsQuery = query(productsQuery, orderBy("name", "asc")); break;
                case 'name-desc': productsQuery = query(productsQuery, orderBy("name", "desc")); break;
                case 'popular': productsQuery = query(productsQuery, orderBy("sold", "desc")); break;
                case 'price-asc': productsQuery = query(productsQuery, orderBy("price", "asc")); break;
                case 'price-desc': productsQuery = query(productsQuery, orderBy("price", "desc")); break;
                default:
                    // Với bộ lọc "mới nhất", sắp xếp theo createdAt giảm dần (sản phẩm mới tạo lên đầu)
                    if (currentCategory === 'all' && !collectionParam) {
                        try {
                            productsQuery = query(productsQuery, orderBy("createdAt", "desc"));
                        } catch (_) {}
                    }
                    break;
            }
        }

        /* OLD SORTING LOGIC - REMOVED
        switch (currentSort) { // This block is problematic as it might conflict with previous orderBy
            case 'name-asc':
                if (!searchTerm) productsQuery = query(productsQuery, orderBy("name", "asc"));
                break;
            case 'name-desc':
                if (!searchTerm) productsQuery = query(productsQuery, orderBy("name", "desc"));
                break;
            case 'popular':
                productsQuery = query(productsQuery, orderBy("sold", "desc"));
                break;
            case 'price-asc':
                if (!(minPrice > 0 || maxPrice > 0)) productsQuery = query(productsQuery, orderBy("price", "asc"));
                break;
            case 'price-desc':
                if (!(minPrice > 0 || maxPrice > 0)) productsQuery = query(productsQuery, orderBy("price", "desc"));
                break;
            default:
                if (!searchTerm && !(minPrice > 0 || maxPrice > 0)) productsQuery = query(productsQuery, orderBy("updatedAt", "desc"));
                break; // END OLD SORTING LOGIC
        } */

        // Thêm logic tải thêm vào Query
        let localBuffer = [];
        let finalQuery;
        const DISPLAY_BATCH_SIZE = 24;
        const FETCH_LIMIT = 60; // Tải dư 60 sản phẩm mỗi lần để không bị sót sản phẩm

        if (navigation === 'init') {
            lastVisible = null;
        }

        if (hasSearchTerm || hasAdvancedFilter) {
            finalQuery = query(productsQuery, limit(500));
        } else if (navigation === 'load-more' && lastVisible) {
            finalQuery = query(productsQuery, startAfter(lastVisible), limit(FETCH_LIMIT));
        } else {
            finalQuery = query(productsQuery, limit(FETCH_LIMIT));
            currentLoadedCount = 0;
        }

        let querySnapshot;
        try {
            querySnapshot = await getDocs(finalQuery);
        } catch (queryErr) {
            console.warn("Lỗi Firestore query (có thể thiếu index), thử truy vấn dự phòng:", queryErr);
            // Fallback: truy vấn cơ bản theo limit
            try {
                const fallbackLimit = (hasSearchTerm || hasAdvancedFilter) ? 500 : FETCH_LIMIT;
                const fallbackQuery = query(collection(db, "products"), limit(fallbackLimit));
                querySnapshot = await getDocs(fallbackQuery);
            } catch (fallbackErr) {
                throw queryErr;
            }
        }
        
        if (querySnapshot.empty) {
            if (navigation === 'init') {
                productGrid.innerHTML = '';
                showEmptyProductsMessage(noProductsMsg, currentCategory, activeSubCategory, hasSearchTerm, searchTerm);
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            } else if (loadMoreBtn) {
                loadMoreBtn.style.display = 'none';
            }
            productGrid.classList.remove('loading-fade');
            return;
        }

        let htmlContent = '';
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        // Lọc thông minh client-side: Hỗ trợ đảo từ, không dấu, từ không liền nhau
        const allDocs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data(), _ref: d })).filter(p => !p.isHidden && !p.isOnlyEvent);
        const shouldExpandVariants = hasSearchTerm || hasAdvancedFilter || ['popular', 'newest', 'price-asc', 'price-desc'].includes(currentSort);
        let finalResults = [];
        if (hasSearchTerm) {
            // Mở rộng tìm kiếm cả sản phẩm biến thể độc lập (showOnProductPage === true)
            const expandedDocs = expandProductsWithVariants(allDocs);
            finalResults = searchAndRankProducts(expandedDocs, searchTerm, 1000);
        } else if (shouldExpandVariants) {
            // Tách sản phẩm chính và từng biến thể độc lập để xếp & lọc chuẩn xác
            finalResults = expandProductsWithVariants(allDocs);
        } else {
            finalResults = allDocs;
        }

        if (hasAdvancedFilter) {
            finalResults = finalResults.filter(p => {
                const rawPrice = Number(p.price) || 0;
                const salePct = Number(p.sale) || 0;
                const effectivePrice = (p.salePrice && Number(p.salePrice) > 0)
                    ? Number(p.salePrice)
                    : Math.round(rawPrice * (1 - salePct / 100));

                if (minPrice > 0 && effectivePrice < minPrice) return false;
                if (maxPrice > 0 && effectivePrice > maxPrice) return false;

                if (filterSaleOnly) {
                    const isOnSale = salePct > 0 || (Number(p.salePrice) > 0 && Number(p.salePrice) < rawPrice);
                    if (!isOnSale) return false;
                }

                if (filterComboOnly) {
                    const isComboItem = Boolean(p.isCombo) || (Array.isArray(p.comboVariants) && p.comboVariants.length > 0);
                    if (!isComboItem) return false;
                }

                if (filterInStockOnly) {
                    let isAvailable = !Boolean(p.manualOutOfStock) && !Boolean(p.isOutOfStock) && (Number(p.stock) || 0) > 0;
                    if (p.isIndependentVariant) {
                        isAvailable = !Boolean(p.variantOverride?.manualOutOfStock) && !Boolean(p.isOutOfStock) && (Number(p.stock) || 0) > 0;
                    } else if (p.isCombo && Array.isArray(p.comboVariants) && p.comboVariants.length > 0) {
                        isAvailable = p.comboVariants.some(v => {
                            const hasOwn = (v.stock !== undefined && v.stock !== null && v.stock !== '');
                            const vStock = hasOwn ? Number(v.stock) : (Number(p.stock) || 0);
                            return !Boolean(v.manualOutOfStock) && !Boolean(v.isOutOfStock) && vStock > 0;
                        });
                    }
                    if (!isAvailable) return false;
                }

                return true;
            });
        }

        // Trích xuất timestamp chính xác hỗ trợ mọi định dạng (ISO string, Timestamp, Date, ms)
        const parseProductTime = (item) => {
            if (!item) return 0;
            const candidates = [item.createdAt, item.updatedAt, item.createdDate, item.date, item.timestamp];
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
                if (typeof d._seconds === 'number' && d._seconds > 0) {
                    return d._seconds * 1000 + Math.round((d._nanoseconds || 0) / 1e6);
                }
            }
            const digits = (item.id || '').replace(/\D/g, '');
            if (digits.length >= 4) {
                const num = Number(digits);
                if (!isNaN(num)) return num;
            }
            return 0;
        };

        // Sắp xếp client-side đảm bảo luôn chuẩn xác theo tiêu chí được chọn
        // Nếu đang tìm kiếm và người dùng để sort mặc định ("newest"), giữ nguyên thứ tự ưu tiên độ liên quan của searchAndRankProducts
        if (currentSort === 'newest') {
            if (!hasSearchTerm) {
                finalResults.sort((a, b) => {
                    const timeA = parseProductTime(a);
                    const timeB = parseProductTime(b);
                    if (timeB !== timeA) return timeB - timeA;
                    return (b.id || '').localeCompare(a.id || '');
                });
            }
        } else if (currentSort === 'popular') {
            finalResults.sort((a, b) => {
                const soldDiff = (Number(b.sold) || 0) - (Number(a.sold) || 0);
                if (soldDiff !== 0) return soldDiff;
                return parseProductTime(b) - parseProductTime(a);
            });
        } else if (currentSort === 'name-asc') {
            finalResults.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
        } else if (currentSort === 'name-desc') {
            finalResults.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'vi'));
        } else if (currentSort === 'price-asc' || currentSort === 'price-desc') {
            finalResults.sort((a, b) => {
                const priceA = a.salePrice || Math.round(a.price * (1 - (a.sale || 0) / 100));
                const priceB = b.salePrice || Math.round(b.price * (1 - (b.sale || 0) / 100));
                return currentSort === 'price-desc' ? priceB - priceA : priceA - priceB;
            });
        }

        // Lưu vết document cuối cùng để phân trang Firestore
        if (querySnapshot.docs.length > 0) {
            lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        }

        // Hiển thị toàn bộ các sản phẩm đã lọc trong đợt này (không bị cắt xén thủ công gây mất sản phẩm)
        htmlContent = finalResults.map((p) => {
            if (shouldExpandVariants || p.isIndependentVariant) {
                if (p.isIndependentVariant) {
                    return renderProductCard(p.parentProduct, p.parentId, favs, '../product/index.html', p.variantOverride);
                }
                return renderProductCard(p, p.id, favs, '../product/index.html');
            }
            return renderProductCardWithVariants(p, p.id, favs, '../product/index.html');
        }).join('');

        if (finalResults.length === 0 || !htmlContent.trim()) {
            if (navigation === 'init') {
                productGrid.innerHTML = '';
                showEmptyProductsMessage(noProductsMsg, currentCategory, activeSubCategory, hasSearchTerm, searchTerm);
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            } else if (loadMoreBtn) {
                loadMoreBtn.style.display = 'none';
            }
            productGrid.classList.remove('loading-fade');
            return;
        }

        // Hiển thị nội dung
        if (navigation === 'init') {
            productGrid.innerHTML = htmlContent;
            // Reset animation fade-in cho grid
            productGrid.classList.remove('fade-in-content');
            void productGrid.offsetWidth; // Force reflow
            productGrid.classList.add('fade-in-content');
        } else {
            // Nối thêm vào cuối grid
            productGrid.insertAdjacentHTML('beforeend', htmlContent);
        }
        if (window.updateMembershipPrices) window.updateMembershipPrices();
        productGrid.classList.remove('loading-fade');
        
        // Kiểm tra xem có sản phẩm tiếp theo không để hiện/ẩn nút Xem thêm
        if (loadMoreBtn) {
            if (querySnapshot.docs.length === FETCH_LIMIT && !hasSearchTerm && !hasAdvancedFilter) {
                loadMoreBtn.style.display = 'block';
                loadMoreBtn.innerHTML = `Xem thêm sản phẩm`;
                loadMoreBtn.onclick = () => {
                    loadMoreBtn.innerHTML = '<span class="spinner-small"></span> Đang tải...';
                    loadMoreBtn.disabled = true;
                    fetchProducts('load-more').then(() => {
                        loadMoreBtn.disabled = false;
                    });
                };
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }

    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm:", error);
        productGrid.classList.remove('loading-fade');
        productGrid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 5rem; color: red;">Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }
}

function setupCategoryEvents() {
    document.querySelectorAll('.minimal-cat-item').forEach(item => {
        item.onclick = () => {
            const cat = item.dataset.filterCategory;
            activeSubCategory = cat === 'combo' ? 'combo' : null;
            if (cat === 'all') {
                window.history.replaceState({}, '', window.location.pathname);
            } else if (cat === 'combo') {
                window.history.replaceState({}, '', `${window.location.pathname}?category=combo`);
            } else {
                const slug = toCategorySlug(cat);
                window.history.replaceState({}, '', `${window.location.pathname}?category=${slug}`);
            }
            renderCategoryGrid();
            fetchProducts('init');
        };
    });

    document.querySelectorAll('.minimal-subcat-item').forEach(item => {
        item.onclick = () => {
            const sub = item.dataset.filterSubcategory;
            if (sub === 'group-all') {
                const parentGroup = item.dataset.parentGroup;
                activeSubCategory = null;
                const slug = toCategorySlug(parentGroup);
                window.history.replaceState({}, '', `${window.location.pathname}?category=${slug}`);
            } else {
                activeSubCategory = sub;
                const slug = toCategorySlug(sub);
                window.history.replaceState({}, '', `${window.location.pathname}?category=${slug}`);
            }
            renderCategoryGrid();
            fetchProducts('init');
        };
    });
}

// Logic xử lý Bộ lọc nâng cao, Pill sắp xếp & Nút xóa tìm kiếm chuẩn App
function initAppFilters() {
    const modal = document.getElementById('app-filter-modal');
    const openBtn = document.getElementById('app-open-filter-btn');
    const closeBtn = document.getElementById('app-close-filter-modal');
    const applyBtn = document.getElementById('apply-filter-btn');
    const resetBtn = document.getElementById('reset-filter-btn');
    const clearAllBtn = document.getElementById('app-clear-filters-btn');
    const minInput = document.getElementById('price-min');
    const maxInput = document.getElementById('price-max');
    const salePill = document.getElementById('filter-pill-sale');
    const comboPill = document.getElementById('filter-pill-combo');
    const clearSearchBtn = document.getElementById('btn-clear-search-name');
    const searchInput = document.getElementById('search-name');

    let draftSaleOnly = filterSaleOnly;
    let draftComboOnly = filterComboOnly;
    let draftInStockOnly = filterInStockOnly;

    const syncPricePresetPills = (minVal, maxVal) => {
        document.querySelectorAll('#app-price-preset-pills .app-modal-pill').forEach(btn => {
            const pMin = Number(btn.dataset.min) || 0;
            const pMax = Number(btn.dataset.max) || 0;
            btn.classList.toggle('active', pMin === minVal && pMax === maxVal);
        });
    };

    const syncModalUI = () => {
        if (minInput) minInput.value = filterMinPrice > 0 ? String(filterMinPrice) : '';
        if (maxInput) maxInput.value = filterMaxPrice > 0 ? String(filterMaxPrice) : '';
        syncPricePresetPills(filterMinPrice, filterMaxPrice);
        if (salePill) salePill.classList.toggle('active', draftSaleOnly);
        if (comboPill) comboPill.classList.toggle('active', draftComboOnly);
        document.querySelectorAll('#app-stock-pills .app-modal-pill').forEach(btn => {
            const wantInStock = btn.dataset.stock === 'instock';
            btn.classList.toggle('active', wantInStock === draftInStockOnly);
        });
    };

    const closeModal = () => {
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    };

    const openModal = () => {
        if (!modal) return;
        draftSaleOnly = filterSaleOnly;
        draftComboOnly = filterComboOnly;
        draftInStockOnly = filterInStockOnly;
        syncModalUI();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    };

    const resetAllFilters = (includeSearch = false) => {
        filterMinPrice = 0;
        filterMaxPrice = 0;
        filterSaleOnly = false;
        filterComboOnly = false;
        filterInStockOnly = false;
        draftSaleOnly = false;
        draftComboOnly = false;
        draftInStockOnly = false;

        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
        if (includeSearch && searchInput) searchInput.value = '';
        if (clearSearchBtn && searchInput) {
            clearSearchBtn.style.display = searchInput.value.trim() ? 'inline-flex' : 'none';
        }
        syncModalUI();
        updateActiveFilterBadge();
    };

    if (openBtn && modal) {
        openBtn.onclick = openModal;
        if (closeBtn) closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });
    }

    document.querySelectorAll('#app-price-preset-pills .app-modal-pill').forEach(btn => {
        btn.onclick = () => {
            const pMin = Number(btn.dataset.min) || 0;
            const pMax = Number(btn.dataset.max) || 0;
            if (minInput) minInput.value = pMin > 0 ? String(pMin) : '';
            if (maxInput) maxInput.value = pMax > 0 ? String(pMax) : '';
            syncPricePresetPills(pMin, pMax);
        };
    });

    const onCustomPriceInput = () => {
        const curMin = Number(minInput?.value) || 0;
        const curMax = Number(maxInput?.value) || 0;
        syncPricePresetPills(curMin, curMax);
    };
    if (minInput) minInput.addEventListener('input', onCustomPriceInput);
    if (maxInput) maxInput.addEventListener('input', onCustomPriceInput);

    if (salePill) {
        salePill.onclick = () => {
            draftSaleOnly = !draftSaleOnly;
            salePill.classList.toggle('active', draftSaleOnly);
        };
    }

    if (comboPill) {
        comboPill.onclick = () => {
            draftComboOnly = !draftComboOnly;
            comboPill.classList.toggle('active', draftComboOnly);
        };
    }

    document.querySelectorAll('#app-stock-pills .app-modal-pill').forEach(btn => {
        btn.onclick = () => {
            draftInStockOnly = btn.dataset.stock === 'instock';
            document.querySelectorAll('#app-stock-pills .app-modal-pill').forEach(item => {
                item.classList.toggle('active', item === btn);
            });
        };
    });

    if (applyBtn) {
        applyBtn.onclick = () => {
            filterMinPrice = Math.max(0, Number(minInput?.value) || 0);
            filterMaxPrice = Math.max(0, Number(maxInput?.value) || 0);
            filterSaleOnly = draftSaleOnly;
            filterComboOnly = draftComboOnly;
            filterInStockOnly = draftInStockOnly;
            updateActiveFilterBadge();
            closeModal();
            fetchProducts('init');
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            resetAllFilters(false);
            closeModal();
            fetchProducts('init');
        };
    }

    if (clearAllBtn) {
        clearAllBtn.onclick = () => {
            resetAllFilters(true);
            fetchProducts('init');
        };
    }

    // Pill sắp xếp ngang chuẩn App
    document.querySelectorAll('#app-sort-pills .app-sort-chip').forEach(chip => {
        chip.onclick = () => {
            const sortVal = chip.dataset.sort || 'newest';
            syncSortPillsUI(sortVal);
            const params = new URLSearchParams(window.location.search);
            params.set('sort', sortVal);
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
            fetchProducts('init');
        };
    });

    // Nút X xóa nhanh từ khóa tìm kiếm
    if (clearSearchBtn && searchInput) {
        clearSearchBtn.onclick = () => {
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            updateActiveFilterBadge();
            searchInput.focus();
            fetchProducts('init');
        };
    }
}

// Hàm xử lý tham số URL và trạng thái ban đầu sau khi đã có danh mục
function handleInitialFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter') || '';
    let catParam = (filterParam === 'combo') ? 'combo' : urlParams.get('category');
    const collParam = urlParams.get('collection');
    const sortParam = urlParams.get('sort');

    if (sortParam) {
        const sortSelect = document.getElementById('sort-by');
        if (sortSelect && Array.from(sortSelect.options).some(opt => opt.value === sortParam)) {
            sortSelect.value = sortParam;
        }
    }
    
    if (catParam === 'combo') {
        activeSubCategory = 'combo';
    } else if (catParam && !collParam) {
        const resolved = resolveCategoryFromParam(catParam, dynamicCategories);
        if (resolved.isGroup) {
            activeSubCategory = null;
        } else if (resolved.isSub) {
            activeSubCategory = resolved.sub;
        } else if (resolved.isCustom) {
            activeSubCategory = resolved.name;
        }

        // Tự động chuẩn hóa URL sang slug đẹp không chứa ký tự % hay tiếng Việt thô
        if (resolved.canonicalSlug && resolved.canonicalSlug !== 'all') {
            const currentCatParam = urlParams.get('category');
            if (currentCatParam !== resolved.canonicalSlug) {
                const newParams = new URLSearchParams(window.location.search);
                newParams.set('category', resolved.canonicalSlug);
                window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
            }
        }
    }

    const searchParam = urlParams.get('search') || urlParams.get('q');
    const clearSearchBtn = document.getElementById('btn-clear-search-name');
    if (searchParam) {
        const sidebarSearch = document.getElementById('search-name');
        if (sidebarSearch) sidebarSearch.value = searchParam;
        if (clearSearchBtn) clearSearchBtn.style.display = 'inline-flex';
    } else if (clearSearchBtn) {
        clearSearchBtn.style.display = 'none';
    }

    const currentSortVal = document.getElementById('sort-by')?.value || 'newest';
    syncSortPillsUI(currentSortVal);
    updateActiveFilterBadge();

    renderCategoryGrid();
    fetchProducts('init');
}

let categoriesInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    // 4. Khởi tạo Header
    initHeader('../');

    // 5. Lắng nghe danh mục động (Duy nhất 1 listener độc lập)
    onSnapshot(doc(db, "settings", "product_categories"), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data && data.groups) {
                // Cập nhật mảng dùng chung
                dynamicCategories.length = 0;
                dynamicCategories.push(...data.groups);
                renderCategoryGrid();
                if (!categoriesInitialized) {
                    categoriesInitialized = true;
                    handleInitialFilters();
                }
            }
        }
    });

    initAppFilters();

    // Thêm listener cho bộ lọc sắp xếp
    const sortBy = document.getElementById('sort-by');
    if (sortBy) {
        sortBy.addEventListener('change', () => {
            syncSortPillsUI(sortBy.value);
            const params = new URLSearchParams(window.location.search);
            params.set('sort', sortBy.value);
            window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
            fetchProducts('init');
        });
    }

    // Thêm listener cho ô tìm kiếm
    const searchInput = document.getElementById('search-name');
    const clearSearchBtn = document.getElementById('btn-clear-search-name');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (clearSearchBtn) {
                clearSearchBtn.style.display = searchInput.value.trim() ? 'inline-flex' : 'none';
            }
            updateActiveFilterBadge();
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => fetchProducts('init'), 500);
        });
    }

    // Tải gợi ý AI cá nhân hóa
    renderPersonalizedRecommendations('ai-personalized-recommendations');
});
