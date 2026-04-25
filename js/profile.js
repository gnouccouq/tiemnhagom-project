import { 
    db, auth, loginWithGoogle, logout, updateCartCount, 
    showToast, loadSharedComponents 
} from "./utils.js";
import { 
    doc, getDoc, collection, query, where, getDocs, orderBy, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Hàm điều khiển Tab
function setupTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.profile-section');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });
}

window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;

    const favRef = doc(db, "favorites", user.uid);
    const favSnap = await getDoc(favRef);
    let favs = favSnap.exists() ? favSnap.data().productIds : [];

    if (favs.includes(productId)) {
        favs = favs.filter(id => id !== productId);
        showToast("Đã bỏ yêu thích");
    } else {
        favs.push(productId);
        showToast("Đã thêm vào yêu thích");
    }

    await setDoc(favRef, { productIds: favs });
    fetchFavorites(user.uid); // Tải lại danh sách yêu thích
};

// Hàm tải danh sách sản phẩm yêu thích từ Firestore
async function fetchFavorites(userId) {
    const container = document.getElementById('favorites-list');
    const noFavsMsg = document.getElementById('no-favorites-msg');
    
    try {
        const favSnap = await getDoc(doc(db, "favorites", userId));
        if (!favSnap.exists() || favSnap.data().productIds.length === 0) {
            container.style.display = 'none';
            noFavsMsg.style.display = 'block';
            return;
        }

        const productIds = favSnap.data().productIds;
        let htmlContent = '';
        
        for (const pid of productIds) {
            const pSnap = await getDoc(doc(db, "products", pid));
            if (pSnap.exists()) {
                htmlContent += renderProductCard(pSnap.data(), pid);
            }
        }

        container.innerHTML = htmlContent;
        container.style.display = 'grid';
        noFavsMsg.style.display = 'none';
    } catch (error) {
        console.error("Lỗi tải yêu thích:", error);
    }
}

// Hàm tạo HTML cho thẻ sản phẩm trong mục yêu thích
function renderProductCard(product, id) {
    const hasSale = product.sale > 0;
    const currentPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
    const saleBadge = hasSale ? `<div class="sale-badge">-${product.sale}%</div>` : '';

    return `
        <a href="../product/index.html?id=${id}" class="product-link" style="text-decoration: none; color: inherit;">
            <div class="product-card" style="position: relative; min-height: 350px;">
                ${saleBadge}
                <button class="favorite-btn active" onclick="toggleFavorite(event, '${id}')">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" 
                     alt="${product.name}" 
                     style="width:100%; object-fit: cover; aspect-ratio: 1/1;">
                <h3>${product.name}</h3>
                <p class="price">${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</p>
            </div>
        </a>
    `;
}

// Hàm thiết lập listener cho trạng thái đăng nhập và hiển thị thông tin người dùng
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const authSection = document.getElementById('auth-section');
        const navLinks = document.querySelector('.nav-links');
        const profileInfo = document.getElementById('profile-info');
        const notLoggedInMsg = document.getElementById('not-logged-in-msg');
        const btnLoginProfile = document.getElementById('btn-login-profile');
        const btnLogoutProfile = document.getElementById('btn-logout-profile');

        // Xóa nút admin cũ nếu có
        const existingAdminLink = document.getElementById('admin-link');
        if (existingAdminLink) existingAdminLink.remove();

        if (user) {
            // Đồng bộ giỏ hàng từ localStorage lên Firestore khi vừa đăng nhập
            const localCart = JSON.parse(localStorage.getItem('cart')) || [];
            if (localCart.length > 0) {
                const cartRef = doc(db, "carts", user.uid);
                const cartSnap = await getDoc(cartRef);
                let firebaseCart = cartSnap.exists() ? cartSnap.data().items : [];
                localCart.forEach(localItem => {
                    const existing = firebaseCart.find(i => i.id === localItem.id);
                    if (existing) existing.quantity += localItem.quantity;
                    else firebaseCart.push(localItem);
                });
                await setDoc(cartRef, { items: firebaseCart });
                localStorage.removeItem('cart');
            }
            updateCartCount();

            // Hiển thị thông tin người dùng
            document.getElementById('user-email').innerText = user.email;
            document.getElementById('user-display-name').innerText = user.displayName || "Chưa cập nhật";
            profileInfo.style.display = 'block';
            notLoggedInMsg.style.display = 'none';
            if (btnLogoutProfile) btnLogoutProfile.onclick = logout;

            // Kiểm tra quyền Admin và thêm link Admin nếu có
            const adminRef = doc(db, "admins", user.uid);
            const adminSnap = await getDoc(adminRef);
            if (adminSnap.exists()) {
                const adminContainer = document.getElementById('admin-action-container');
                if (adminContainer) {
                    adminContainer.innerHTML = `
                        <p style="color: #27ae60; font-weight: 600; font-size: 0.8rem; margin-bottom: 0.5rem;">QUYỀN QUẢN TRỊ VIÊN</p>
                        <a href="../admin/" class="btn-dark" style="display: block; text-align: center; margin-top: 0;">Vào bảng điều khiển Admin</a>
                    `;
                    adminContainer.style.display = 'block';
                }
            }

            // Cập nhật UI Header
            authSection.innerHTML = `
                <a href="./" class="user-info-link">Chào, ${user.displayName || user.email.split('@')[0]}!</a>
                <button id="btn-logout" class="btn-minimal">Đăng xuất</button>
            `;
            document.getElementById('btn-logout').addEventListener('click', logout);

            // Tải sản phẩm yêu thích
            fetchFavorites(user.uid);

            // Tải lịch sử đơn hàng
            fetchOrderHistory(user.uid);

        } else {
            // Người dùng chưa đăng nhập
            profileInfo.style.display = 'none';
            document.getElementById('order-history-list').innerHTML = '';
            document.getElementById('no-orders-msg').style.display = 'none';
            notLoggedInMsg.style.display = 'block';
            if (btnLoginProfile) btnLoginProfile.onclick = loginWithGoogle;

            authSection.innerHTML = `
                <button id="btn-login" class="btn-minimal">Đăng nhập</button>
            `;
            document.getElementById('btn-login').addEventListener('click', loginWithGoogle);
        }
    });
}

// Hàm tải lịch sử đơn hàng
async function fetchOrderHistory(userId) {
    const orderListContainer = document.getElementById('order-history-list');
    const noOrdersMsg = document.getElementById('no-orders-msg');
    orderListContainer.innerHTML = '<p style="text-align: center;">Đang tải lịch sử đơn hàng...</p>';

    try {
        const q = query(collection(db, "orders"), where("userId", "==", userId), orderBy("orderDate", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            orderListContainer.style.display = 'none';
            noOrdersMsg.style.display = 'block';
            return;
        }

        let htmlContent = '';
        querySnapshot.forEach((doc) => {
            const order = doc.data();
            const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleString('vi-VN') : 'N/A';
            const totalAmount = new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0);
            const status = order.status || 'Đang xử lý';

            htmlContent += `
                <div class="order-item">
                    <div class="order-header">
                        <span><strong>Mã đơn hàng:</strong> ${doc.id}</span>
                        <span><strong>Ngày đặt:</strong> ${orderDate}</span>
                        <span><strong>Trạng thái:</strong> <span class="order-status-${status.toLowerCase().replace(/\s/g, '-')}">${status}</span></span>
                    </div>
                    <div class="order-details">
                        <h4>Sản phẩm:</h4>
                        <ul>
                            ${order.items.map(item => `
                                <li>${item.name} x ${item.quantity} (${new Intl.NumberFormat('vi-VN').format(item.price)}đ)</li>
                            `).join('')}
                        </ul>
                        <p><strong>Tổng tiền:</strong> ${totalAmount}đ</p>
                    </div>
                </div>
            `;
        });
        orderListContainer.innerHTML = htmlContent;
        orderListContainer.style.display = 'block';
        noOrdersMsg.style.display = 'none';

    } catch (error) {
        console.error("Lỗi khi tải lịch sử đơn hàng:", error);
        orderListContainer.innerHTML = '<p style="color: red;">Không thể tải lịch sử đơn hàng. Vui lòng thử lại.</p>';
    }
}

// Hàm tải các component dùng chung (header, footer)
async function loadProfileComponents() {
    const success = await loadSharedComponents('../');
    if (success) {
        setupAuthListener();
        updateCartCount();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProfileComponents();
    setupTabs();
});
