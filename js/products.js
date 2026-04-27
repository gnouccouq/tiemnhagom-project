import { 
    db, auth, toggleFavoriteLogic, initHeader 
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cấu hình phân trang
const PAGE_SIZE = 10; // Đổi thành 10 để hiển thị tròn 2 hàng (mỗi hàng 5 món)
let lastVisible = null; // Document cuối cùng của trang hiện tại
let firstVisible = null; // Document đầu tiên của trang hiện tại
let currentPage = 1;
let searchTimeout; // Biến để xử lý debounce cho tìm kiếm

// Hàm toggle yêu thích (dùng chung cho các trang hiển thị sản phẩm)
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, fetchProducts);
};

// Hàm bổ trợ render thẻ sản phẩm (dùng chung cho cả 2 section)
function renderProductCard(product, id, favsList = []) {
    const rating = product.rating || 5;
    let starsHtml = '';
    for(let i = 1; i <= 5; i++) starsHtml += i <= Math.round(rating) ? '★' : '☆';

    const hasSale = product.sale > 0;
    const isOutOfStock = (product.stock || 0) <= 0;
    const soldCount = product.sold || 0;
    const currentPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
    
    const priceHtml = hasSale 
        ? `<p class="price"><span class="old-price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</span> ${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</p>`
        : `<p class="price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</p>`;

    const saleBadge = hasSale ? `<div class="sale-badge">-${product.sale}%</div>` : '';
    const stockBadge = isOutOfStock ? `<div class="out-of-stock-badge">Hết hàng</div>` : '';

    const isFav = favsList.includes(id);
    const sparkleClass = hasSale ? 'sale-sparkle' : '';
    const outOfStockClass = isOutOfStock ? 'is-out-of-stock' : '';

    return `
        <a href="../product/index.html?id=${id}" class="product-link" style="text-decoration: none; color: inherit;">
            <div class="product-card ${sparkleClass} ${outOfStockClass}" style="position: relative;">
                ${isOutOfStock ? stockBadge : saleBadge}
                <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${id}')">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" 
                     alt="${product.name}"
                     loading="lazy"
                     style="width:100%; object-fit: cover; aspect-ratio: 1/1;">
                <h3>${product.name}</h3>
                <div class="rating" style="color: #f1c40f; margin-bottom: 0.5rem; font-size: 0.9rem;">
                    ${starsHtml}
                    <span style="color: #666; font-size: 0.75rem; margin-left: 5px; font-weight: 400;">(Đã bán ${soldCount})</span>
                </div>
                ${priceHtml}
            </div>
        </a>
    `;
}

// Hàm chính để lấy và hiển thị sản phẩm
async function fetchProducts(navigation = 'init') {
    const productGrid = document.getElementById('all-product-grid');
    const noProductsMsg = document.getElementById('no-products-found');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    productGrid.innerHTML = Array(PAGE_SIZE).fill(0).map(() => `
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
        let currentCategory = document.querySelector('.filter-list a.active')?.dataset.filterCategory || 'all';
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
            if (minPrice > 0) productsQuery = query(productsQuery, where("price", ">=", minPrice));
            if (maxPrice > 0) productsQuery = query(productsQuery, where("price", "<=", maxPrice));
        }

        if (currentCategory !== 'all') {
            productsQuery = query(productsQuery, where("category", "==", currentCategory));
        }
        if (filterSale === 'true') {
            productsQuery = query(productsQuery, where("sale", ">", 0));
        } else if (filterSale === 'false') {
            productsQuery = query(productsQuery, where("sale", "==", 0));
        }

        // Apply sorting
        // Nếu đang có search term, Firestore bắt buộc phải orderBy("name") trước
        // Nếu đang lọc giá, Firestore bắt buộc phải orderBy("price") trước
        if (searchTerm) {
            productsQuery = query(productsQuery, orderBy("name"));
        } else if (minPrice > 0 || maxPrice > 0) {
            // Firestore yêu cầu field dùng trong inequality filter (price) phải được orderBy đầu tiên.
            // Ta lồng luôn logic chọn direction từ currentSort để tránh bị duplicate orderBy field price.
            const priceDir = currentSort === 'price-desc' ? 'desc' : 'asc';
            productsQuery = query(productsQuery, orderBy("price", priceDir));
        }

        switch (currentSort) {
            case 'price-asc':
            case 'price-desc':
                // Chỉ thêm orderBy price nếu trước đó chưa thêm (do không có lọc khoảng giá)
                if (!(minPrice > 0 || maxPrice > 0)) {
                    productsQuery = query(productsQuery, orderBy("price", currentSort === 'price-asc' ? 'asc' : 'desc'));
                }
                break;
            case 'rating-desc':
                productsQuery = query(productsQuery, orderBy("rating", "desc"));
                break;
            case 'sale-desc':
                productsQuery = query(productsQuery, orderBy("sale", "desc"));
                break;
            case 'newest':
            default:
                productsQuery = query(productsQuery, orderBy("updatedAt", "desc"));
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
            htmlContent += renderProductCard(doc.data(), doc.id, favs);
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

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', (user) => {
        // Xử lý lọc theo danh mục từ URL (nếu có)
        const urlParams = new URLSearchParams(window.location.search);
        const catParam = urlParams.get('category');
        if (catParam) {
            document.querySelectorAll('#category-filters a').forEach(l => l.classList.remove('active'));
            const targetLink = document.querySelector(`#category-filters a[data-filter-category="${catParam}"]`);
            if (targetLink) targetLink.classList.add('active');
        }

        // Xử lý từ khóa tìm kiếm từ Header
        const searchParam = urlParams.get('search');
        if (searchParam) {
            const sidebarSearch = document.getElementById('search-name');
            if (sidebarSearch) sidebarSearch.value = searchParam;
        }

        fetchProducts();

        // Gán sự kiện cho bộ lọc danh mục
        document.querySelectorAll('#category-filters a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('#category-filters a').forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                document.querySelector('.filter-list a[data-filter-sale].active')?.classList.remove('active'); // Bỏ chọn filter sale khi đổi category
                fetchProducts();
            });
        });

        // Gán sự kiện cho bộ lọc sale
        document.querySelectorAll('.filter-list a[data-filter-sale]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.filter-list a[data-filter-sale]').forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                fetchProducts();
            });
        });

        // Gán sự kiện cho sắp xếp
        document.getElementById('sort-by').addEventListener('change', () => fetchProducts('init'));

        // Gán sự kiện cho lọc giá (với debounce)
        ['price-min', 'price-max'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    fetchProducts('init');
                }, 800);
            });
        });

        // Gán sự kiện cho ô tìm kiếm với kỹ thuật Debounce (chờ người dùng gõ xong 500ms mới tìm)
        const searchInput = document.getElementById('search-name');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    fetchProducts('init');
                }, 500);
            });
        }

        // Gán sự kiện cho phân trang
        document.getElementById('next-page').addEventListener('click', () => {
            currentPage++;
            fetchProducts('next');
        });
        document.getElementById('prev-page').addEventListener('click', () => {
            currentPage--;
            fetchProducts('prev');
        });
    });
});