import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, dynamicCategories, DEFAULT_PRODUCT_CATEGORIES, removeVietnameseTones
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
    const catParam = urlParams.get('category') || 'all';

    // Tìm nhóm chính đang active
    let activeGroup = null;
    if (catParam !== 'all') {
        activeGroup = dynamicCategories.find(g => g.name === catParam || (g.subs && g.subs.includes(catParam)));
    }
    if (!activeGroup && activeSubCategory) {
        activeGroup = dynamicCategories.find(g => g.subs && g.subs.includes(activeSubCategory));
    }

    let mainCatHtml = `
        <div class="minimal-category-list">
            <a href="javascript:void(0)" class="minimal-cat-item ${catParam === 'all' && !activeSubCategory ? 'active' : ''}" data-filter-category="all" id="cat-all">
                tất cả <span class="cat-count">(...)</span>
            </a>
    `;

    dynamicCategories.forEach(group => {
        const isGroupActive = activeGroup && activeGroup.name === group.name;
        mainCatHtml += `
            <a href="javascript:void(0)" class="minimal-cat-item ${isGroupActive ? 'active' : ''}" data-filter-category="${group.name}" id="cat-${group.name.replace(/\s+/g, '-')}">
                ${group.name.toLowerCase()} <span class="cat-count">(...)</span>
            </a>
        `;
    });
    mainCatHtml += `</div>`;

    // Render danh mục con nếu nhóm đang được chọn
    let subCatHtml = '';
    if (activeGroup && activeGroup.subs && activeGroup.subs.length > 0) {
        subCatHtml += `<div class="sub-category-list">`;
        const isAllSubActive = !activeSubCategory;
        subCatHtml += `
            <a href="javascript:void(0)" class="minimal-subcat-item ${isAllSubActive ? 'active' : ''}" data-filter-subcategory="group-all" data-parent-group="${activeGroup.name}">
                tất cả ${activeGroup.name.toLowerCase()}
            </a>
        `;
        activeGroup.subs.forEach(sub => {
            const isSubActive = activeSubCategory === sub || catParam === sub;
            subCatHtml += `
                <a href="javascript:void(0)" class="minimal-subcat-item ${isSubActive ? 'active' : ''}" data-filter-subcategory="${sub}" id="subcat-${sub.replace(/\s+/g, '-')}">
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

        dynamicCategories.forEach(group => {
            const el = document.getElementById(`cat-${group.name.replace(/\s+/g, '-')}`);
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
                    const subEl = document.getElementById(`subcat-${sub.replace(/\s+/g, '-')}`);
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
        
        let currentCategory = activeSubCategory || document.querySelector('.minimal-cat-item.active')?.dataset.filterCategory || 'all';
        let currentSort = document.getElementById('sort-by')?.value || 'newest';
        let filterSale = document.querySelector('.filter-list a[data-filter-sale].active')?.dataset.filterSale;
        let searchTerm = document.getElementById('search-name')?.value.trim() || '';
        let hasSearchTerm = !!searchTerm;
        let minPrice = Number(document.getElementById('price-min')?.value) || 0;
        let maxPrice = Number(document.getElementById('price-max')?.value) || 0;
        let collectionParam = new URLSearchParams(window.location.search).get('collection');

        // Reset khi đổi bộ lọc hoặc khởi tạo
        if (navigation === 'init') {
            lastVisible = null;
        }

        // Tối ưu SEO: Cập nhật Title và Meta Description theo danh mục đang xem
        const categoryDisplay = collectionParam ? `Bộ sưu tập: ${collectionParam}` : (currentCategory !== 'all' ? currentCategory : 'Tất cả sản phẩm');
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
        // Nếu KHÔNG có từ khóa tìm kiếm, mới áp dụng lọc Danh mục / BST / Sale / Giá
        if (!hasSearchTerm) {
            if (collectionParam) {
                productsQuery = query(productsQuery, where("collections", "array-contains", collectionParam));
            } else if (currentCategory !== 'all') {
                const selectedGroup = dynamicCategories.find(g => g.name === currentCategory);
                if (selectedGroup) {
                    if (selectedGroup.subs && selectedGroup.subs.length > 0) {
                        productsQuery = query(productsQuery, where("category", "in", selectedGroup.subs));
                    } else {
                        productsQuery = query(productsQuery, where("category", "==", currentCategory));
                    }
                } else {
                    productsQuery = query(productsQuery, where("category", "==", currentCategory));
                }
            }

            if (filterSale === 'true') {
                productsQuery = query(productsQuery, where("sale", ">", 0));
            } else if (filterSale === 'false') {
                productsQuery = query(productsQuery, where("sale", "==", 0));
            }

            if (minPrice > 0) productsQuery = query(productsQuery, where("price", ">=", minPrice));
            if (maxPrice > 0) productsQuery = query(productsQuery, where("price", "<=", maxPrice));
        }

        // Apply sorting logic
        // Firestore yêu cầu orderBy phải khớp với where clause đầu tiên nếu có
        // Hoặc nếu có range filter (price), orderBy phải là price
        if (hasSearchTerm) {
            productsQuery = query(productsQuery, limit(500)); 
        } else if (minPrice > 0 || maxPrice > 0) { // Nếu có lọc giá
            const priceDirection = (currentSort === 'price-desc') ? 'desc' : 'asc';
            productsQuery = query(productsQuery, orderBy("price", priceDirection)); // Bắt buộc phải order by price
        } else { // Không có search term và không có lọc giá, có thể sắp xếp tự do
            switch (currentSort) {
                case 'name-asc': productsQuery = query(productsQuery, orderBy("name", "asc")); break;
                case 'name-desc': productsQuery = query(productsQuery, orderBy("name", "desc")); break;
                case 'popular': productsQuery = query(productsQuery, orderBy("sold", "desc")); break;
                case 'price-asc': productsQuery = query(productsQuery, orderBy("price", "asc")); break;
                case 'price-desc': productsQuery = query(productsQuery, orderBy("price", "desc")); break;
                default: productsQuery = query(productsQuery, orderBy("updatedAt", "desc")); break;
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

        if (navigation === 'load-more' && lastVisible) {
            finalQuery = query(productsQuery, startAfter(lastVisible), limit(FETCH_LIMIT));
        } else {
            finalQuery = query(productsQuery, limit(FETCH_LIMIT));
            currentLoadedCount = 0;
        }

        const querySnapshot = await getDocs(finalQuery);
        
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

        // Lọc Substring client-side nếu có search term và lọc sản phẩm bị ẩn
        const allDocs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data(), _ref: d })).filter(p => !p.isHidden && !p.isOnlyEvent);
        const termClean = removeVietnameseTones(searchTerm);
        const termRaw = searchTerm.toLowerCase();
        let finalResults = hasSearchTerm 
            ? allDocs.filter(p => {
                const nameRaw = (p.name || '').toLowerCase();
                const nameClean = removeVietnameseTones(p.name || '');
                const sku = (p.id || '').toLowerCase();
                return nameRaw.includes(termRaw) || nameClean.includes(termClean) || sku.includes(termClean);
            })
            : allDocs;

        // Sắp xếp lại danh sách trả về theo giá cuối cùng (đã giảm) nếu user chọn sort giá
        if (currentSort === 'price-asc' || currentSort === 'price-desc') {
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
            let cardsHtml = renderProductCard(p, p.id, favs, '../product/index.html');
            
            // Render independent color variants
            if (p.colorVariants && Array.isArray(p.colorVariants)) {
                p.colorVariants.forEach(v => {
                    if (v.showOnProductPage) {
                        cardsHtml += renderProductCard(p, p.id, favs, '../product/index.html', {
                            type: 'color',
                            name: v.name,
                            imageUrl: v.imageUrl,
                            price: v.price,
                            stock: v.stock,
                            isOutOfStock: v.isOutOfStock
                        });
                    }
                });
            }
            
            // Render independent pattern variants
            if (p.patternVariants && Array.isArray(p.patternVariants)) {
                p.patternVariants.forEach(v => {
                    if (v.showOnProductPage) {
                        cardsHtml += renderProductCard(p, p.id, favs, '../product/index.html', {
                            type: 'pattern',
                            name: v.name,
                            imageUrl: v.imageUrl,
                            price: v.price,
                            stock: v.stock,
                            isOutOfStock: v.isOutOfStock
                        });
                    }
                });
            }

            // Render independent combo variants
            if (p.comboVariants && Array.isArray(p.comboVariants)) {
                p.comboVariants.forEach(v => {
                    if (v.showOnProductPage) {
                        cardsHtml += renderProductCard(p, p.id, favs, '../product/index.html', {
                            type: 'combo',
                            name: v.name,
                            imageUrl: v.imageUrl || v.thumbUrl,
                            price: v.price,
                            stock: v.stock,
                            isOutOfStock: v.isOutOfStock
                        });
                    }
                });
            }
            
            return cardsHtml;
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
        productGrid.classList.remove('loading-fade');
        
        // Kiểm tra xem có sản phẩm tiếp theo không để hiện/ẩn nút Xem thêm
        if (loadMoreBtn) {
            if (querySnapshot.docs.length === FETCH_LIMIT && !hasSearchTerm) {
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
            activeSubCategory = null;
            if (cat === 'all') {
                window.history.replaceState({}, '', window.location.pathname);
            } else {
                window.history.replaceState({}, '', `${window.location.pathname}?category=${encodeURIComponent(cat)}`);
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
                window.history.replaceState({}, '', `${window.location.pathname}?category=${encodeURIComponent(parentGroup)}`);
            } else {
                activeSubCategory = sub;
                window.history.replaceState({}, '', `${window.location.pathname}?category=${encodeURIComponent(sub)}`);
            }
            renderCategoryGrid();
            fetchProducts('init');
        };
    });
}

// Logic xử lý Popup Bộ lọc Mobile
function initMobileFilter() {
    const modal = document.getElementById('mobile-filter-modal');
    const openBtn = document.getElementById('mobile-filter-btn');
    const closeBtn = document.querySelector('.close-filter-modal');
    const applyBtn = document.getElementById('apply-filter-btn');
    const resetBtn = document.getElementById('reset-filter-btn');

    if (!modal || !openBtn) return;

    openBtn.onclick = () => modal.classList.add('active');
    closeBtn.onclick = () => modal.classList.remove('active');
    
    // Đóng khi click ra ngoài vùng content
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('active');
    };

    applyBtn.onclick = () => {
        fetchProducts('init');
        modal.classList.remove('active');
    };

    resetBtn.onclick = () => {
        const minInput = document.getElementById('price-min');
        const maxInput = document.getElementById('price-max');
        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
        
        document.querySelectorAll('#mobile-filter-modal .filter-list a[data-filter-sale]').forEach(l => {
            l.classList.toggle('active', l.dataset.filterSale === 'all');
        });

        fetchProducts('init');
        modal.classList.remove('active');
    };
}

// Hàm xử lý tham số URL và trạng thái ban đầu sau khi đã có danh mục
function handleInitialFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category');
    const collParam = urlParams.get('collection');
    
    if (catParam && !collParam) {
        let isGroup = dynamicCategories.some(g => g.name === catParam);
        if (!isGroup) {
            for (const group of dynamicCategories) {
                if (group.subs && group.subs.includes(catParam)) {
                    activeSubCategory = catParam;
                    break;
                }
            }
        } else {
            activeSubCategory = null;
        }
    }

    const searchParam = urlParams.get('search');
    if (searchParam) {
        const sidebarSearch = document.getElementById('search-name');
        if (sidebarSearch) sidebarSearch.value = searchParam;
    }

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

    initMobileFilter();

    // Thêm listener cho bộ lọc sắp xếp
    const sortBy = document.getElementById('sort-by');
    if (sortBy) {
        sortBy.addEventListener('change', () => fetchProducts('init'));
    }

    // Thêm listener cho ô tìm kiếm
    const searchInput = document.getElementById('search-name');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => fetchProducts('init'), 500);
        });
    }

    // Tải gợi ý AI cá nhân hóa
    renderPersonalizedRecommendations('ai-personalized-recommendations');
});
