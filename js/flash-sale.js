import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard 
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cấu hình phân trang
const PAGE_SIZE = 10; // Hiển thị 10 sản phẩm mỗi trang
let lastVisible = null; // Document cuối cùng của trang hiện tại
let firstVisible = null; // Document đầu tiên của trang hiện tại
let currentPage = 1;

// Hàm toggle yêu thích (dùng chung cho các trang hiển thị sản phẩm)
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, fetchFlashSaleProducts); // Cập nhật lại danh sách sau khi toggle
};

// Hàm chính để lấy và hiển thị sản phẩm Flash Sale
async function fetchFlashSaleProducts(navigation = 'init') {
    const productGrid = document.getElementById('flash-sale-grid');
    const noProductsMsg = document.getElementById('no-flash-sale-products');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    // Hiển thị skeleton loading ngay lập tức
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
        let currentSort = document.getElementById('sort-by')?.value || 'sale-desc';

        // Reset khi đổi bộ lọc hoặc khởi tạo
        if (navigation === 'init') {
            lastVisible = null;
            firstVisible = null;
            currentPage = 1;
        }

        // LUÔN LUÔN LỌC SẢN PHẨM ĐANG SALE
        productsQuery = query(productsQuery, where("sale", ">", 0));

        // Apply sorting
        switch (currentSort) {
            case 'price-asc':
                productsQuery = query(productsQuery, orderBy("price", "asc"));
                break;
            case 'price-desc':
                productsQuery = query(productsQuery, orderBy("price", "desc"));
                break;
            case 'rating-desc':
                productsQuery = query(productsQuery, orderBy("rating", "desc"));
                break;
            case 'newest':
                productsQuery = query(productsQuery, orderBy("updatedAt", "desc"));
                break;
            case 'sale-desc':
            default:
                productsQuery = query(productsQuery, orderBy("sale", "desc")); // Sắp xếp theo % giảm giá nhiều nhất
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
                currentPage--; // Quay lại trang trước nếu không có sản phẩm ở trang kế tiếp
            }
            productGrid.innerHTML = '';
            noProductsMsg.style.display = 'block';
            // Vô hiệu hóa nút phân trang nếu không có sản phẩm
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            if (pageInfo) pageInfo.innerText = `Trang ${currentPage}`;
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
        
        // Cập nhật trạng thái nút phân trang
        if (pageInfo) pageInfo.innerText = `Trang ${currentPage}`;
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        // Để biết có trang sau hay không, ta cần thử query thêm 1 sản phẩm nữa
        const nextQueryCheck = query(productsQuery, startAfter(lastVisible), limit(1));
        const nextSnap = await getDocs(nextQueryCheck);
        if (nextBtn) nextBtn.disabled = nextSnap.empty;

    } catch (error) {
        console.error("Lỗi lấy dữ liệu Flash Sale:", error);
        productGrid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 5rem; color: red;">Không thể tải sản phẩm Flash Sale. Vui lòng thử lại sau.</p>';
        noProductsMsg.style.display = 'none'; // Đảm bảo ẩn thông báo không có sản phẩm nếu có lỗi
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', (user) => {
        fetchFlashSaleProducts();

        // Gán sự kiện cho sắp xếp
        document.getElementById('sort-by')?.addEventListener('change', () => fetchFlashSaleProducts('init'));

        // Gán sự kiện cho phân trang
        document.getElementById('next-page')?.addEventListener('click', () => {
            currentPage++;
            fetchFlashSaleProducts('next');
        });
        document.getElementById('prev-page')?.addEventListener('click', () => {
            currentPage--;
            fetchFlashSaleProducts('prev');
        });
    });
});