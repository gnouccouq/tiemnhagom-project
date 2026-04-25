// js/main.js
import { 
    db, auth, loginWithGoogle, logout, updateCartCount, 
    updateFavoriteCount, toggleFavoriteLogic, loadSharedComponents 
} from "./utils.js";
import { collection, getDocs, doc, getDoc, query, where, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Hàm tải các component dùng chung (header, footer)
async function loadComponents() {
    const success = await loadSharedComponents('./');
    if (success) setupAuthListener();
}

// Hàm toggle yêu thích
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, () => {
        fetchFeaturedProducts();
        fetchSaleProducts();
    });
};

// Hàm lấy sản phẩm tiêu biểu
async function fetchFeaturedProducts() {
    const grid = document.getElementById('product-grid');
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        let htmlContent = ''; // Sử dụng biến tạm để tối ưu hiệu suất

        // Lấy danh sách yêu thích để hiển thị icon đúng
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
        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm nào.</p>';
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm lấy sản phẩm đang giảm giá
async function fetchSaleProducts() {
    const saleSection = document.getElementById('sale-section');
    const saleGrid = document.getElementById('sale-product-grid');
    try {
        const q = query(collection(db, "products"), where("sale", ">", 0));
        const querySnapshot = await getDocs(q);
        
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        let htmlContent = '';
        querySnapshot.forEach((doc) => {
            htmlContent += renderProductCard(doc.data(), doc.id, favs);
        });

        if (htmlContent) {
            saleGrid.innerHTML = htmlContent;
            saleSection.style.display = 'block';
        }
    } catch (error) {
        console.error("Lỗi lấy sản phẩm sale:", error);
    }
}

// Hàm bổ trợ render thẻ sản phẩm (dùng chung cho cả 2 section)
function renderProductCard(product, id, favsList = []) {
    const rating = product.rating || 5;
    let starsHtml = '';
    for(let i = 1; i <= 5; i++) starsHtml += i <= Math.round(rating) ? '★' : '☆';

    const hasSale = product.sale > 0;
    const currentPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
    
    const priceHtml = hasSale 
        ? `<p class="price"><span class="old-price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</span> ${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</p>`
        : `<p class="price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</p>`;

    const saleBadge = hasSale ? `<div class="sale-badge">-${product.sale}%</div>` : '';

    const isFav = favsList.includes(id);
    const sparkleClass = hasSale ? 'sale-sparkle' : '';

    return `
        <a href="product/index.html?id=${id}" class="product-link" style="text-decoration: none; color: inherit;">
            <div class="product-card ${sparkleClass}" style="position: relative;">
                ${saleBadge}
                <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${id}')">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" 
                     alt="${product.name}" 
                     style="width:100%; object-fit: cover; aspect-ratio: 1/1;">
                <h3>${product.name}</h3>
                <div class="rating" style="color: #f1c40f; margin-bottom: 0.5rem; font-size: 0.9rem;">${starsHtml}</div>
                ${priceHtml}
            </div>
        </a>
    `;
}

// Hàm thiết lập listener cho trạng thái đăng nhập
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const authSection = document.getElementById('auth-section');
        const navLinks = document.querySelector('.nav-links');

        // Xóa nút admin cũ nếu có (để tránh lặp lại hoặc xóa khi logout)
        const existingAdminLink = document.getElementById('admin-link');
        if (existingAdminLink) existingAdminLink.remove();

        if (authSection) {
            if (user) {
                // Đồng bộ giỏ hàng từ localStorage lên Firestore khi vừa đăng nhập
                const localCart = JSON.parse(localStorage.getItem('cart')) || [];
                if (localCart.length > 0) {
                    const cartRef = doc(db, "carts", user.uid);
                    const cartSnap = await getDoc(cartRef);
                    let firebaseCart = cartSnap.exists() ? cartSnap.data().items : [];
                    
                    // Hợp nhất đơn giản: thêm đồ từ máy vào giỏ trên mây
                    localCart.forEach(localItem => {
                        const existing = firebaseCart.find(i => i.id === localItem.id);
                        if (existing) existing.quantity += localItem.quantity;
                        else firebaseCart.push(localItem);
                    });
                    await setDoc(cartRef, { items: firebaseCart });
                    localStorage.removeItem('cart');
                }
                updateCartCount();
                
                // Đồng bộ Favorites
                const localFavs = JSON.parse(localStorage.getItem('favorites')) || [];
                if (localFavs.length > 0) {
                    const favRef = doc(db, "favorites", user.uid);
                    const favSnap = await getDoc(favRef);
                    let firebaseFavs = favSnap.exists() ? favSnap.data().productIds : [];
                    localFavs.forEach(id => {
                        if (!firebaseFavs.includes(id)) firebaseFavs.push(id);
                    });
                    await setDoc(favRef, { productIds: firebaseFavs });
                    localStorage.removeItem('favorites');
                }
                updateFavoriteCount();
                fetchSaleProducts(); // Cập nhật lại danh sách để hiện tim đúng
                fetchFeaturedProducts();

                // Người dùng đã đăng nhập
                authSection.innerHTML = `
                    <a href="profile/" class="user-info-link">Xin chào, ${user.displayName || user.email.split('@')[0]}!</a>
                    <button id="btn-logout" class="btn-minimal">Đăng xuất</button>
                `;
                document.getElementById('btn-logout').addEventListener('click', logout);
            } else {
                // Người dùng chưa đăng nhập
                authSection.innerHTML = `
                    <button id="btn-login" class="btn-minimal">Đăng nhập</button>
                `;
                document.getElementById('btn-login').addEventListener('click', loginWithGoogle);
            }
        }
    });
}

// Chạy các hàm khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', () => {
    loadComponents().then(() => {
        // Sau khi components được tải và auth listener được setup,
        // mới gọi fetchFeaturedProducts để đảm bảo mọi thứ sẵn sàng
        updateCartCount();
        updateFavoriteCount();
        fetchSaleProducts();
        fetchFeaturedProducts();
    });
});
