import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, dynamicCategories, DEFAULT_PRODUCT_CATEGORIES // Import dynamicCategories directly
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cấu hình phân trang
const PAGE_SIZE = 25; // 5 hàng x 5 sản phẩm
let lastVisible = null; // Document cuối cùng của trang hiện tại
let firstVisible = null; // Document đầu tiên của trang hiện tại
let currentPage = 1;
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

// Hàm render danh mục sản phẩm (Dạng ô vuông có chữ ở giữa)
function renderCategoryGrid() {
    const container = document.getElementById('category-grid-display');
    if (!container) return;

    let html = `
        <div class="category-square-item active" data-filter-category="all">
            <div class="category-square-content">
                <img src="../Asset/images/481662171_945340464390670_9004286649668063676_n.jpg" alt="Tất cả">
                <span>Tất cả</span>
            </div>
        </div>
    `;

    dynamicCategories.forEach(group => {
        html += ` 
            <div class="category-square-item" data-filter-category="${group.name}">
                <div class="category-square-content">
                    <img src="${group.imageUrl || 'https://via.placeholder.com/400'}" alt="${group.name}">
                    <span>${group.name}</span>
                </div>
            </div>
        `;
    });
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
        let hasSearchTerm = !!searchTerm;
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
        updateMetaTag('name', 'robots', 'index, follow');
        updateMetaTag('property', 'og:title', seoTitle);
        updateMetaTag('property', 'og:description', seoDesc);

        // Apply filters
        // Lọc theo Category (Hỗ trợ cả Group hoặc Sub-category)
        if (currentCategory !== 'all') {
            // Nếu currentCategory là group (VD: Dụng cụ Bếp), ta cần lấy các sub-categories của nó
            const selectedGroup = dynamicCategories.find(g => g.name === currentCategory);
            if (selectedGroup) {
                productsQuery = query(productsQuery, where("category", "in", selectedGroup.subs));
            } else {
                productsQuery = query(productsQuery, where("category", "==", currentCategory)); // Nếu là sub-category trực tiếp
            } 
        }

        // Lọc theo trạng thái Sale
        if (filterSale === 'true') {
            productsQuery = query(productsQuery, where("sale", ">", 0));
        } else if (filterSale === 'false') {
            productsQuery = query(productsQuery, where("sale", "==", 0));
        }

        // Lọc theo giá (chỉ áp dụng nếu KHÔNG đang tìm kiếm theo tên)
        // Firestore không cho phép lọc inequality trên nhiều field khác nhau (name, price, sale) trong 1 query
        // Để đơn giản, nếu có searchTerm, ta ưu tiên tìm kiếm theo tên và bỏ qua lọc giá/sale
        if (!hasSearchTerm) { // Nếu không tìm kiếm theo tên
            if (minPrice > 0) productsQuery = query(productsQuery, where("price", ">=", minPrice));
            if (maxPrice > 0) productsQuery = query(productsQuery, where("price", "<=", maxPrice));
        }

        // Tìm kiếm theo tên (Prefix search) - Phải là orderBy đầu tiên nếu có where trên name
        if (hasSearchTerm) {
            productsQuery = query(productsQuery, 
                where("name", ">=", searchTerm), 
                where("name", "<=", searchTerm + '\uf8ff'));
        }

        // Apply sorting logic
        // Firestore yêu cầu orderBy phải khớp với where clause đầu tiên nếu có
        // Hoặc nếu có range filter (price), orderBy phải là price
        if (hasSearchTerm) {
            productsQuery = query(productsQuery, orderBy("name", "asc")); // Bắt buộc phải order by name cho prefix search
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
    // 4. Khởi tạo Header và lắng nghe Auth (để cập nhật icon tim)
    initHeader('../', (user) => {
        // Lắng nghe danh mục động để render Grid ô vuông
        onSnapshot(doc(db, "settings", "product_categories"), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                // Cập nhật lại biến toàn cục (nếu cần) và render
                // dynamicCategories đã được xử lý bởi utils.js, ở đây ta chỉ cần gọi render
                renderCategoryGrid();
            }
        });

        // Xử lý logic highlight danh mục từ URL sau khi dynamicCategories được tải
        const urlParams = new URLSearchParams(window.location.search);
        const catParam = urlParams.get('category');
        if (catParam) {
            document.querySelectorAll('.category-square-item').forEach(l => l.classList.remove('active'));
            const targetLink = document.querySelector(`.category-square-item[data-filter-category="${catParam}"]`);
            if (targetLink) {
                targetLink.classList.add('active');
            } else {
                // Nếu là danh mục con, tìm nhóm cha trong dynamicCategories (array)
                for (const group of dynamicCategories) { // Iterate over array
                    if (group.subs && group.subs.includes(catParam)) {
                        const groupLink = document.querySelector(`.category-square-item[data-filter-category="${group.name}"]`);
                        if (groupLink) groupLink.classList.add('active');
                        activeSubCategory = catParam;
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

        // Fetch products after categories are rendered and initial category is set
        fetchProducts('init');
    });

    // 5. Lần đầu tải sản phẩm

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
