import { 
    db, auth, toggleFavoriteLogic, initHeader, PRODUCT_CATEGORIES, renderProductCard
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cấu hình phân trang
const PAGE_SIZE = 25; // 5 hàng x 5 sản phẩm
let lastVisible = null; // Document cuối cùng của trang hiện tại
let firstVisible = null; // Document đầu tiên của trang hiện tại
let currentPage = 1;
let activeSubCategory = null; // Lưu trữ danh mục con từ URL
let searchTimeout; // Biến để xử lý debounce cho tìm kiếm

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

// Hàm render danh mục sản phẩm (Dạng ô vuông có chữ ở giữa)
function renderCategoryGrid() {
    const container = document.getElementById('category-grid-display');
    if (!container) return;

    // Map ảnh cho các danh mục (Bạn có thể thay link ảnh thật ở đây)
    const categoryImages = {
        "Nghệ thuật Bàn ăn": "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=400",
        "Home Decor": "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?q=80&w=400",
        "Gốm & Đời sống": "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?q=80&w=400",
        "Tạp vật Tinh tế": "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?q=80&w=400"
    };

    let html = `
        <div class="category-square-item active" data-filter-category="all">
            <div class="category-square-content">
                <img src="https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=400" alt="Tất cả">
                <span>Tất cả</span>
            </div>
        </div>
    `;

    for (const [group, subs] of Object.entries(PRODUCT_CATEGORIES)) {
        html += `
            <div class="category-square-item" data-filter-category="${group}">
                <div class="category-square-content">
                    <img src="${categoryImages[group] || 'https://via.placeholder.com/400'}" alt="${group}">
                    <span>${group}</span>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    setupCategoryEvents();
}

// Hàm chính để lấy và hiển thị sản phẩm
async function fetchProducts(navigation = 'init', categoryOverride = null) {
    const productGrid = document.getElementById('all-product-grid');
    const noProductsMsg = document.getElementById('no-products-found');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    if (navigation === 'init') productGrid.innerHTML = Array(PAGE_SIZE).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text skeleton-title"></div>
            <div class="skeleton skeleton-text skeleton-small"></div>
            <div class="skeleton skeleton-text skeleton-price"></div>
        </div>
    `).join('');
    noProductsMsg.style.display = 'none';

    try {
        let productsQuery = collection(db, "products");
        if (navigation === 'init') activeSubCategory = categoryOverride;
        
        let currentCategory = activeSubCategory || document.querySelector('.category-square-item.active')?.dataset.filterCategory || 'all';
        let currentSort = document.getElementById('sort-by')?.value || 'newest';
        let filterSale = document.querySelector('.filter-list a[data-filter-sale].active')?.dataset.filterSale;
        let searchTerm = document.getElementById('search-name')?.value.trim() || '';
        let minPrice = Number(document.getElementById('price-min')?.value) || 0;
        let maxPrice = Number(document.getElementById('price-max')?.value) || 0;

        // Reset khi đổi bộ lọc hoặc khởi tạo
        if (navigation === 'init') {
            lastVisible = null;
            firstVisible = null;
            currentPage = 1;
        }

        // Tối ưu SEO: Cập nhật Title và Meta Description theo danh mục đang xem
        const categoryDisplay = currentCategory !== 'all' ? currentCategory : 'Tất cả sản phẩm';
        const seoTitle = `${categoryDisplay} | Tiệm Nhà Gốm - Gốm Sứ & Decor Thủ Công`;
        const seoDesc = `Khám phá bộ sưu tập ${categoryDisplay.toLowerCase()} tinh tế tại Tiệm Nhà Gốm. Sản phẩm thủ công chất lượng cao, thiết kế mộc mạc cho không gian sống.`;
        
        document.title = seoTitle;
        updateMetaTag('name', 'description', seoDesc);
        updateMetaTag('property', 'og:title', seoTitle);
        updateMetaTag('property', 'og:description', seoDesc);

        // Apply filters
        if (searchTerm) {
            // Tìm kiếm theo tên (Prefix search)
            // Lưu ý: Firestore prefix search yêu cầu orderBy trường đó đầu tiên
            productsQuery = query(productsQuery, 
                where("name", ">=", searchTerm), 
                where("name", "<=", searchTerm + '\uf8ff'));
        }

        // Chỉ áp dụng lọc giá nếu KHÔNG đang tìm kiếm theo tên (Hạn chế của Firestore)
        if (!searchTerm) {
            const hasPriceFilter = minPrice > 0 || maxPrice > 0;
            if (minPrice > 0) productsQuery = query(productsQuery, where("price", ">=", minPrice));
            if (maxPrice > 0) productsQuery = query(productsQuery, where("price", "<=", maxPrice));
            
            // Lọc theo trạng thái Sale
            // Lưu ý: Firestore không cho phép lọc inequality trên nhiều field khác nhau (price và sale) trong 1 query
            if (filterSale === 'true' && !hasPriceFilter) {
                productsQuery = query(productsQuery, where("sale", ">", 0));
            } else if (filterSale === 'false') {
                productsQuery = query(productsQuery, where("sale", "==", 0));
            }
        }

        // Lọc theo Category (Hỗ trợ cả Group hoặc Sub-category)
        if (currentCategory !== 'all') {
            // Nếu currentCategory là group (VD: Dụng cụ Bếp), ta cần lấy các sub-categories của nó
            if (PRODUCT_CATEGORIES[currentCategory]) {
                productsQuery = query(productsQuery, where("category", "in", PRODUCT_CATEGORIES[currentCategory]));
            } else {
                productsQuery = query(productsQuery, where("category", "==", currentCategory));
            }
        }

        // Apply sorting logic
        if (searchTerm) {
            productsQuery = query(productsQuery, orderBy("name"));
        } else if (minPrice > 0 || maxPrice > 0) {
            const priceDir = currentSort === 'price-desc' ? 'desc' : 'asc';
            productsQuery = query(productsQuery, orderBy("price", priceDir));
        }

        switch (currentSort) {
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
                break;
        }

        // Thêm logic phân trang vào Query
        let finalQuery;
        if (navigation === 'next' && lastVisible) {
            finalQuery = query(productsQuery, startAfter(lastVisible), limit(PAGE_SIZE));
        } else if (navigation === 'prev' && firstVisible) {
            finalQuery = query(productsQuery, endBefore(firstVisible), limitToLast(PAGE_SIZE));
        } else {
            finalQuery = query(productsQuery, limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(finalQuery);
        
        if (querySnapshot.empty) {
            if (navigation === 'next') {
                currentPage--;
                return;
            }
            productGrid.innerHTML = '';
            noProductsMsg.style.display = 'block';
            return;
        }

        // Lưu vết documents để phân trang lần sau
        firstVisible = querySnapshot.docs[0];
        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

        let htmlContent = '';
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        querySnapshot.forEach((doc) => {
            htmlContent += renderProductCard(doc.data(), doc.id, favs, '../product/index.html');
        });

        productGrid.innerHTML = htmlContent;
        
        // Cập nhật trạng thái nút
        if (pageInfo) pageInfo.innerText = `Trang ${currentPage}`;
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = querySnapshot.docs.length < PAGE_SIZE;

    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm:", error);
        productGrid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 5rem; color: red;">Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

function setupCategoryEvents() {
    document.querySelectorAll('.category-square-item').forEach(item => {
        item.onclick = () => {
            document.querySelectorAll('.category-square-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            activeSubCategory = null; // Xóa ghi đè danh mục con khi người dùng chọn nhóm lớn tay
            window.history.replaceState({}, '', window.location.pathname);
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

document.addEventListener('DOMContentLoaded', () => {
    renderCategoryGrid();

    // 2. Xử lý lọc theo danh mục từ URL (nếu khách click từ Header/Menu)
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category');
    let initialCategory = null;

    if (catParam) {
        document.querySelectorAll('.category-square-item').forEach(l => l.classList.remove('active'));
        const targetLink = document.querySelector(`.category-square-item[data-filter-category="${catParam}"]`);
        if (targetLink) {
            targetLink.classList.add('active');
        } else {
            // Nếu là danh mục con, highlight nhóm cha nhưng lọc theo tên con
            initialCategory = catParam;
            for (const [group, subs] of Object.entries(PRODUCT_CATEGORIES)) {
                if (subs.includes(catParam)) {
                    const groupLink = document.querySelector(`.category-square-item[data-filter-category="${group}"]`);
                    if (groupLink) groupLink.classList.add('active');
                    break;
                }
            }
        }
    }

    // 3. Xử lý từ khóa tìm kiếm từ Header
    const searchParam = urlParams.get('search');
    if (searchParam) {
        const sidebarSearch = document.getElementById('search-name');
        if (sidebarSearch) sidebarSearch.value = searchParam;
    }

    // 4. Khởi tạo Header và lắng nghe Auth (để cập nhật icon tim)
    initHeader('../', (user) => {
        // Chỉ fetch lại nếu trạng thái auth thay đổi để cập nhật icon tim theo user
        fetchProducts('init');
    });

    // 5. Lần đầu tải sản phẩm
    fetchProducts('init', initialCategory);

    // 6. Gán sự kiện cho bộ lọc sale
    document.querySelectorAll('#mobile-filter-modal .filter-list a[data-filter-sale]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('#mobile-filter-modal .filter-list a[data-filter-sale]').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            // Chỉ toggle class, việc fetch sẽ đợi người dùng nhấn nút "Áp dụng"
        });
    });

    // 7. Khởi tạo logic popup mobile
    initMobileFilter();

    // Gán sự kiện cho Sort select
    document.getElementById('sort-by')?.addEventListener('change', () => fetchProducts('init'));
});
