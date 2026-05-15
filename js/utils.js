import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, query, where, limit, getDocs, onSnapshot, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
    RecaptchaVerifier, signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// 1. Cấu hình & Khởi tạo Firebase (Duy nhất một nơi)
const firebaseConfig = {
    apiKey: "AIzaSyAl-Hlzfu4naiUMIuwJTnw8bXsDB4wY7zs",
    authDomain: "tiemnhagom-project.firebaseapp.com",
    projectId: "tiemnhagom-project",
    storageBucket: "tiemnhagom-project.firebasestorage.app",
    messagingSenderId: "571834989973",
    appId: "1:571834989973:web:4cf2d4e9aa832327afca9c",
    measurementId: "G-4FNKRZ13JC"
};

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase Initialization Error: Có thể SDK bị chặn bởi Ad-blocker.", error);
}

// Khởi tạo Firestore với cấu hình cache mới (thay thế enableIndexedDbPersistence)
export const db = app ? initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
}) : null;

export const auth = app ? getAuth(app) : null;
export const analytics = app ? getAnalytics(app) : null;
export const storage = app ? getStorage(app) : null;
export const googleProvider = new GoogleAuthProvider();

// Default/initial category structure (used if Firestore document doesn't exist)
export const DEFAULT_PRODUCT_CATEGORIES = [
    { name: "Dining Decor", order: 1, subs: ["Bát & Chén", "Dĩa & Khay", "Thìa Muỗng & Đũa", "Gia Vị & Nước Chấm", "Gác Đũa & Phụ Kiện"] },
    { name: "Teatime & Drinks", order: 2, subs: ["Ấm Trà", "Ly & Tách", "Lót Ly & Đế Lót"] },
    { name: "Home Decor", order: 3, subs: ["Lọ Hoa Nghệ Thuật", "Đèn & Tượng Decor", "Khay Bánh Mứt"] },
    { name: "Kitchenware", order: 4, subs: ["Nồi & Chảo", "Dao & Kéo", "Thớt", "Dụng Cụ Sơ Chế"] },
    { name: "Lifestyle", order: 5, subs: ["Phụ Kiện Phòng Tắm", "Tạp Vật Tinh Tế", "Vật Phẩm Cá Nhân"] }
];

// Biến toàn cục để lưu trữ danh mục động, được cập nhật từ Firestore
export let dynamicCategories = [];

// Ánh xạ màu sắc sang mã hex để hiển thị swatch (Dùng chung)
export const COLOR_MAP = {
    "Trắng": "#FFFFFF",
    "Đen": "#000000",
    "Xám": "#808080",
    "Xanh": "#0000FF",
    "Đỏ": "#FF0000",
    "Vàng": "#FFFF00",
    "Hồng": "#FFC0CB",
    "Tím": "#800080",
    "Nâu": "#A52A2A",
    "Kem": "#FFFDD0",
    "Beige": "#F5F5DC",
    "Xanh lá": "#008000"
    // Thêm các màu khác nếu cần
};


// Hàm để lấy danh mục hiện tại (có thể dùng trong các module khác)
export function getDynamicCategories() {
    return dynamicCategories;
}

// Hàm hỗ trợ bảo mật: Chống tấn công XSS bằng cách mã hóa các ký tự đặc biệt
export function escapeHTML(str) { // Đảm bảo hàm này được export
    if (!str) return "";
    return str.toString().replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

// Hàm hỗ trợ định dạng số điện thoại về chuẩn +84
export function formatPhoneNumber(phone) { // Đảm bảo hàm này được export
    if (!phone) return '';
    phone = phone.replace(/\s/g, ''); // Xóa khoảng trắng
    if (phone.startsWith('0')) {
        return '+84' + phone.substring(1);
    }
    if (!phone.startsWith('+')) {
        return '+' + phone; // Giả định là định dạng quốc tế nếu không bắt đầu bằng +
    }
    return phone;
}
// 2. Logic UI: Thông báo Toast
export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Logic UI: Xem ảnh toàn màn hình dùng chung cho Gallery
export function setupFullScreenImages() {
    window.openFullScreen = (src) => {
        let overlay = document.getElementById('fullscreen-image-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'fullscreen-image-overlay';
            overlay.className = 'fullscreen-overlay';
            overlay.innerHTML = `<img src="" alt="Toàn màn hình">`;
            overlay.onclick = () => overlay.style.display = 'none';
            document.body.appendChild(overlay);
        }
        const img = overlay.querySelector('img');
        img.src = src;
        overlay.style.display = 'flex';
    };
}

// 3. Logic UI: Nút cuộn lên đầu trang
export function setupScrollToTop() {
    const btnScrollTop = document.getElementById('btn-scroll-top');
    if (!btnScrollTop) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) btnScrollTop.classList.add('show');
        else btnScrollTop.classList.remove('show');
    });
    btnScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// 4. Logic Auth: Đăng nhập & Đăng xuất
export async function loginWithGoogle() {
    try {
        // Dùng Popup cho Desktop, nếu lỗi trình duyệt không an toàn (mobile/in-app) 
        // thì Firebase sẽ có gợi ý dùng Redirect.
        await signInWithPopup(auth, googleProvider);
        showToast("Đăng nhập thành công!");
    } catch (error) {
        console.error(error);
        showToast("Lỗi đăng nhập: " + error.message, "error");
    }
}

// Đăng nhập bằng Email/Password
export async function loginEmail(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Đăng nhập thành công!");
        window.location.href = "../";
    } catch (error) {
        throw error;
    }
}

// Đăng ký tài khoản mới
export async function registerEmail(email, password) {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("Đăng ký tài khoản thành công!");
        window.location.href = "../";
    } catch (error) {
        throw error;
    }
}

// Quên mật khẩu
export async function resetPassword(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Link đặt lại mật khẩu đã được gửi vào Email của bạn.");
    } catch (error) {
        throw error;
    }
}

export async function logout() {
    try {
        await signOut(auth);
        localStorage.removeItem('tng_user_hint'); // Xóa gợi ý khi logout
        showToast("Đã đăng xuất");
    } catch (error) {
        showToast("Đăng xuất thất bại!", "error");
    }
}

// 5. Logic Giỏ hàng: Cập nhật số lượng
export async function updateCartCount(user = auth.currentUser) {
    let cart = [];
    if (user) {
        const cartSnap = await getDoc(doc(db, "carts", user.uid));
        if (cartSnap.exists()) cart = cartSnap.data().items || [];
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }
    const total = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const countEls = document.querySelectorAll('.cart-count-badge');
    countEls.forEach(el => {
        el.innerText = total;
        el.style.display = total > 0 ? 'flex' : 'none';
    });
}

// 6. Logic Yêu thích: Cập nhật số lượng
export async function updateFavoriteCount(user = auth.currentUser) {
    let favs = [];
    if (user) {
        const favSnap = await getDoc(doc(db, "favorites", user.uid));
        if (favSnap.exists()) favs = favSnap.data().productIds || [];
    } else {
        favs = JSON.parse(localStorage.getItem('favorites')) || [];
    }
    const countEls = document.querySelectorAll('.fav-count-badge');
    countEls.forEach(el => {
        el.innerText = favs.length;
        el.style.display = favs.length > 0 ? 'flex' : 'none';
    });
}

// 7. Logic Yêu thích: Toggle
export async function toggleFavoriteLogic(productId, callback) {
    let favs = [];
    const user = auth.currentUser;
    if (user) {
        const favRef = doc(db, "favorites", user.uid);
        const favSnap = await getDoc(favRef);
        favs = favSnap.exists() ? favSnap.data().productIds : [];
        if (favs.includes(productId)) favs = favs.filter(id => id !== productId);
        else favs.push(productId);
        await setDoc(favRef, { productIds: favs });
    } else {
        favs = JSON.parse(localStorage.getItem('favorites')) || [];
        if (favs.includes(productId)) favs = favs.filter(id => id !== productId);
        else favs.push(productId);
        localStorage.setItem('favorites', JSON.stringify(favs));
    }
    await updateFavoriteCount();
    if (callback) callback();
}

// 8. Logic Lịch sử: Lưu sản phẩm đã xem
export function addToHistory(productId, category = null) {
    let history = JSON.parse(localStorage.getItem('viewed_products')) || [];
    // Lọc bỏ mục cũ (hỗ trợ cả định dạng chuỗi cũ và object mới để tránh lỗi dữ liệu)
    history = history.filter(item => {
        const id = typeof item === 'string' ? item : item.id;
        return id !== productId;
    });
    // Lưu object kèm category để trang chủ không cần query lại Firestore
    history.unshift({ id: productId, category: category });
    if (history.length > 10) history.pop(); // Giữ tối đa 10 sản phẩm gần nhất
    localStorage.setItem('viewed_products', JSON.stringify(history));
}

// 9. Logic Tìm kiếm tức thì dùng chung (Autocomplete)
export async function initAutocomplete(inputId, suggestionsId, pathPrefix = '') {
    const input = document.getElementById(inputId);
    const box = document.getElementById(suggestionsId);
    let timer;

    if (!input || !box) return;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const val = input.value.trim().toLowerCase(); // Chuyển sang chữ thường để tìm kiếm
        // Chỉ tìm kiếm khi người dùng nhập từ 2 ký tự trở lên để tránh query quá rộng
        if (val.length < 2) { box.style.display = 'none'; return; }

        timer = setTimeout(async () => {
            box.innerHTML = `<div style="padding: 15px; text-align: center;"><div class="spinner"></div></div>`;
            box.style.display = 'block';

            try {
                // Để hỗ trợ tìm kiếm "chữ cái bất kỳ" (substring search) như "đũa" trong "gác đũa",
                // chúng ta sẽ lấy một số lượng lớn sản phẩm (ví dụ 100) được sắp xếp theo tên,
                // sau đó lọc client-side bằng includes().
                // LƯU Ý: Cách này có giới hạn. Nếu sản phẩm chứa từ khóa nằm ngoài 100 sản phẩm đầu tiên
                // theo thứ tự alphabet, nó sẽ không được tìm thấy. Để tìm kiếm chính xác hơn trên toàn bộ dữ liệu,
                // cần sử dụng dịch vụ tìm kiếm chuyên biệt như Algolia hoặc triển khai N-grams.
                const q = query(
                    collection(db, "products"),
                    orderBy("name_lowercase"),
                    limit(100) // Tăng giới hạn để tăng khả năng tìm thấy substring trong tập dữ liệu lớn hơn
                );

                const snap = await getDocs(q);
                // Lọc client-side để tìm kiếm "chữ cái bất kỳ" (substring search)
                const results = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(p => (p.name_lowercase || p.name.toLowerCase()).includes(val)) // Sử dụng includes()
                    .slice(0, 6); // Chỉ hiển thị 6 gợi ý hàng đầu

                if (results.length === 0) {
                    box.innerHTML = `<div style="padding: 15px; text-align: center; color: #888; font-size: 0.85rem;">Không tìm thấy sản phẩm phù hợp</div>`;
                    return;
                }

                box.innerHTML = results.map(p => {
                    const hasSale = p.sale > 0;
                    const currentPrice = hasSale ? p.price * (1 - p.sale / 100) : p.price;
                    const safeName = escapeHTML(p.name);
                    return `
                        <a href="${pathPrefix}product/index.html?id=${p.id}" class="suggestion-item">
                            <img src="${p.imageUrl}" alt="${p.name}">
                            <div class="suggestion-info">
                                <h5>${safeName}</h5>
                                <div class="suggestion-price-container">
                                    ${hasSale ? `<span class="suggestion-old-price">${new Intl.NumberFormat('vi-VN').format(p.price)}đ</span>` : ''}
                                    <span class="suggestion-current-price ${hasSale ? 'sale' : ''}">${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</span>
                                    ${hasSale ? `<span class="suggestion-sale-tag">-${p.sale}%</span>` : ''}
                                </div>
                            </div>
                        </a>`;
                }).join('');
            } catch (e) { console.error(e); }
        }, 200);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !box.contains(e.target)) box.style.display = 'none';
    });
}

// 10. Logic: Cookie Consent Popup
function setupCookieConsent(pathPrefix) {
    if (localStorage.getItem('cookie_choice_v1')) return;

    const consentDiv = document.createElement('div');
    consentDiv.className = 'cookie-consent';
    consentDiv.innerHTML = `
        <div class="cookie-content">
            <div class="cookie-text">
                <p>
                    <strong>🍪 Tiệm Nhà Gốm:</strong> Chúng tôi sử dụng cookie để mang lại trải nghiệm tốt nhất. Bằng cách tiếp tục, bạn đồng ý với 
                    <a href="${pathPrefix}privacy-policy.html">Chính sách bảo mật</a> của chúng tôi.
                </p>
            </div>
            <div class="cookie-actions">
                <button id="btn-decline-cookie" class="btn-outline">Từ chối</button>
                <button id="btn-accept-cookie" class="btn-dark">Chấp nhận</button>
            </div>
        </div>
    `;
    document.body.appendChild(consentDiv);

    setTimeout(() => consentDiv.classList.add('show'), 2000);

    const handleChoice = (choice) => {
        localStorage.setItem('cookie_choice_v1', choice);
        consentDiv.classList.remove('show');
        setTimeout(() => consentDiv.remove(), 600);
    };

    document.getElementById('btn-accept-cookie').onclick = () => handleChoice('accepted');
    document.getElementById('btn-decline-cookie').onclick = () => handleChoice('declined');
}

// 8. Logic UI: Render thẻ sản phẩm dùng chung
export function renderProductCard(product, id, favsList = [], linkBase = 'product/index.html') {
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
    <div class="product-card ${sparkleClass} ${outOfStockClass}">
        <div class="product-card-image">
            <a href="${linkBase}?id=${id}">
                <img src="${product.thumbUrl || product.imageUrl || 'https://placehold.co/300x300?text=No+Image'}" 
                     alt="${product.name}" loading="lazy" width="300" height="300">
            </a>
            ${isOutOfStock ? stockBadge : saleBadge}
            <div class="product-card-actions">
                <button class="action-icon-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${id}')" title="Yêu thích">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <button class="quick-add-btn" onclick="addToCart({id: '${id}', name: '${product.name.replace(/'/g, "\\'")}', price: ${currentPrice}, image: '${product.imageUrl}', quantity: 1})" title="Thêm nhanh vào giỏ">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"></path>
                    </svg>
                </button>
            </div>
        </div>
        <div class="product-card-info">
            <a href="${linkBase}?id=${id}" class="product-title-link">
                <h3>${product.name}</h3>
            </a>
            <div class="product-rating-row">
                <div class="rating-mini" style="display: none;">${starsHtml}</div>
                <span class="sold-count">Đã bán ${soldCount}</span>
            </div>
            <div class="product-price-block">
                ${priceHtml}
            </div>
        </div>
    </div>
    `;
}

// 9. Logic Giỏ hàng: Thêm sản phẩm
export async function addToCart(productData) {
    let cart = [];
    const user = auth.currentUser;

    if (user) {
        const cartRef = doc(db, "carts", user.uid);
        const cartSnap = await getDoc(cartRef);
        cart = cartSnap.exists() ? cartSnap.data().items : [];
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    const variantStr = productData.variant || '';
    const existingItem = cart.find(item => item.id === productData.id && (item.variant || '') === variantStr);
    if (existingItem) existingItem.quantity += productData.quantity;
    else cart.push(productData);

    if (user) await setDoc(doc(db, "carts", user.uid), { items: cart });
    else localStorage.setItem('cart', JSON.stringify(cart));

    updateCartCount();
    showToast(`Đã thêm ${productData.quantity} ${productData.name} vào giỏ hàng!`);
}

// Logic cho Popup Tìm kiếm từ nút nổi (Di chuyển từ main.js)
export function setupSearchFloat() {
    const btnOpen = document.getElementById('btn-open-search-float');
    const overlay = document.getElementById('home-search-overlay');
    const btnClose = document.getElementById('btn-close-home-search');
    const input = document.getElementById('home-popup-search-input');

    if (!btnOpen || !overlay) return;

    btnOpen.onclick = () => {
        overlay.classList.add('active');
        input.focus();
    };

    btnClose.onclick = () => overlay.classList.remove('active');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };

    // Khởi tạo autocomplete trên input mới của popup
    initAutocomplete('home-popup-search-input', 'home-popup-search-suggestions', '');
}

// 8. Logic Tổng hợp: Khởi tạo Header & Auth cho mọi trang
export async function initHeader(pathPrefix = './', onAuthChangeCallback = null) {
    // HIỂN THỊ NHANH: Kiểm tra gợi ý đăng nhập từ localStorage để hiện icon ngay lập tức (Skeleton/Placeholder)
    const userHint = JSON.parse(localStorage.getItem('tng_user_hint'));
    
    // Chạy song song: Tải component và Lắng nghe Auth
    const componentsPromise = loadSharedComponents(pathPrefix);

    // KIỂM TRA CHẾ ĐỘ BẢO TRÌ (Chạy độc lập để redirect nhanh nhất có thể cho cả khách và thành viên)
    const maintenancePromise = (async () => {
        try {
            const systemSnap = await getDoc(doc(db, "settings", "system"));
            if (systemSnap.exists()) {
                const settings = systemSnap.data();
                const now = new Date();
                const countdownDate = settings.countdownDate ? settings.countdownDate.toDate() : null;
                // Bảo trì hoạt động khi: Mode bật VÀ (không có ngày hẹn HOẶC chưa tới ngày hẹn)
                const isMaintenanceActive = settings.maintenanceMode && (!countdownDate || now < countdownDate);

                if (isMaintenanceActive) {
                    // Nếu đang ở trang bảo trì/admin/login thì không redirect nữa để tránh vòng lặp
                    const isExcludedPage = window.location.pathname.includes('/maintenance/') || 
                                         window.location.pathname.includes('/admin/') || 
                                         window.location.pathname.includes('/login/');
                    if (isExcludedPage) return false;

                    return true; // Trả về true để báo hiệu cần kiểm tra quyền admin trước khi redirect
                }
            }
        } catch (err) { 
            console.error("Lỗi kiểm tra trạng thái hệ thống:", err); 
        }
        return false;
    })();

    onAuthStateChanged(auth, async (user) => {
        // Đợi component load xong để có chỗ inject HTML, nhưng không đợi Admin check
        await componentsPromise;
        
        // LUÔN chạy callback sớm nhất có thể để trang web load dữ liệu chính (Sản phẩm,...)
        // Không để các tác vụ Admin/Sync bên dưới làm chậm việc hiển thị dữ liệu
        if (onAuthChangeCallback) onAuthChangeCallback(user);

        const authSection = document.getElementById('auth-section');
        if (!authSection) return;

        if (user) {
            // Lưu hint để lần sau vào web sẽ hiện icon đăng nhập nhanh
            localStorage.setItem('tng_user_hint', JSON.stringify({ 
                loggedIn: true, 
                displayName: user.displayName || user.email.split('@')[0] 
            }));
            
            const profilePath = pathPrefix === './' ? 'profile/' : `${pathPrefix}profile/`;
            const adminPath = pathPrefix === './' ? 'admin/' : `${pathPrefix}admin/`;
            const displayName = user.displayName || user.email.split('@')[0];

            const isProfilePage = window.location.pathname.includes('profile');
            const isOrdersTab = window.location.hash === '#orders';
            const isFavsTab = window.location.hash === '#favs';

            // HIỂN THỊ NGAY icon người dùng (Chưa cần biết có phải admin hay không)
            authSection.innerHTML = `
                <div class="user-dropdown">
                    <a href="${profilePath}" class="user-icon-link" title="Tài khoản">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span id="admin-badge-placeholder"></span>
                    </a>
                    <ul class="user-dropdown-menu">
                        <li class="dropdown-user-info">
                            <div id="user-name-display" style="font-weight: 300; font-size: 0.85rem; color: var(--text-black); display: flex; align-items: center;">
                                ${displayName}
                            </div>
                        </li>
                        <li><a href="${profilePath}" class="${isProfilePage && !isOrdersTab && !isFavsTab ? 'active' : ''}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Trang cá nhân
                        </a></li>
                        <li><a href="${profilePath}#favs" class="${isProfilePage && isFavsTab ? 'active' : ''}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                            Danh sách yêu thích
                        </a></li>
                        <li><a href="${profilePath}#orders" class="${isProfilePage && isOrdersTab ? 'active' : ''}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                            Lịch sử đơn hàng
                        </a></li>
                        <li id="admin-link-placeholder"></li>
                        <li><hr></li>
                        <li><button id="btn-logout-header" class="btn-minimal">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                            Đăng xuất
                        </button></li>
                    </ul>
                </div>
            `;
            document.getElementById('btn-logout-header').onclick = () => logout().then(() => window.location.href = `${pathPrefix}index.html`);

            // CHẠY NGẦM: Kiểm tra quyền Admin và các xử lý dữ liệu nặng
            (async () => {
                try {
                    const adminSnap = await getDoc(doc(db, "admins", user.uid));
                    if (adminSnap.exists()) {
                        // Cập nhật Badge Admin
                        document.getElementById('admin-badge-placeholder').innerHTML = `
                            <span class="admin-badge" title="Quản trị viên">
                                <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                            </span>`;
                        document.getElementById('user-name-display').innerHTML += `<span class="admin-text-badge">Admin</span>`;
                        document.getElementById('admin-link-placeholder').innerHTML = `
                            <a href="${adminPath}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                Trang quản trị
                            </a>`;
                    }

                    // Xử lý kết quả kiểm tra bảo trì cho user đã đăng nhập
                    const needsRedirect = await maintenancePromise;
                    if (needsRedirect && !adminSnap.exists()) {
                        window.location.href = pathPrefix + "maintenance/";
                    }

                    // Đồng bộ dữ liệu & ghost records
                    await syncLocalToCloud(user.uid);
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    if (!userSnap.exists()) {
                        // Logic ghost record cũ ở đây...
                        await setDoc(userRef, { uid: user.uid, email: user.email, isGhost: false, lastLogin: new Date().toISOString() }, { merge: true });
                    } else {
                        await updateDoc(userRef, { lastLogin: new Date().toISOString() });
                    }
                } catch (e) { console.error("Background auth tasks error:", e); }
            })();

            // Lắng nghe thay đổi hash để cập nhật trạng thái active tức thì khi đang ở trang profile
            window.addEventListener('hashchange', () => {
                if (window.location.pathname.includes('profile')) {
                    const hash = window.location.hash;
                    const links = authSection.querySelectorAll('.user-dropdown-menu a');
                    links.forEach(link => {
                        const href = link.getAttribute('href');
                        const isOrders = hash === '#orders' && href.includes('#orders');
                        const isFavs = hash === '#favs' && href.includes('#favs');
                        const isProfile = !hash && !href.includes('#') && href.includes('profile');
                        link.classList.toggle('active', isOrders || isFavs || isProfile);
                    });
                }
            });
        } else {
            const loginPath = pathPrefix === './' ? 'login/' : `${pathPrefix}login/`;
            authSection.innerHTML = `<a href="${loginPath}" class="btn-minimal" style="text-decoration:none">Đăng nhập</a>`;

            // Xử lý kết quả kiểm tra bảo trì cho khách (vãng lai)
            const needsRedirect = await maintenancePromise;
            if (needsRedirect) {
                window.location.href = pathPrefix + "maintenance/";
            }
        }


        // Luôn cập nhật con số trên icon giỏ hàng/yêu thích
        updateCartCount(user);
        updateFavoriteCount(user);

        // Khởi tạo popup Cookie
        setupCookieConsent(pathPrefix);

        // Khởi tạo tính năng xem ảnh full screen
        setupFullScreenImages();

        // Khởi tạo nút tìm kiếm nổi và popup tìm kiếm
        setupSearchFloat();

        // Khởi tạo nút cuộn lên đầu trang
        setupScrollToTop();

        // Khởi tạo hiệu ứng Scroll Reveal nếu có class reveal-on-scroll
        const reveals = document.querySelectorAll('.reveal-on-scroll');
        if (reveals.length > 0) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15 });
            reveals.forEach(r => observer.observe(r));
        }
    });
}


// Hàm phụ: Đồng bộ dữ liệu LocalStorage lên Firestore
async function syncLocalToCloud(userId) {
    // Đồng bộ Giỏ hàng
    const localCart = JSON.parse(localStorage.getItem('cart')) || [];
    if (localCart.length > 0) {
        const cartRef = doc(db, "carts", userId);
        const cartSnap = await getDoc(cartRef);
        let firebaseCart = cartSnap.exists() ? cartSnap.data().items : [];
        localCart.forEach(localItem => {
            const variantStr = localItem.variant || '';
            const existing = firebaseCart.find(i => i.id === localItem.id && (i.variant || '') === variantStr);
            if (existing) {
                existing.quantity += localItem.quantity;
            } else {
                firebaseCart.push(localItem);
            }
        });
        await setDoc(cartRef, { items: firebaseCart });
        localStorage.removeItem('cart');
    }

    // Đồng bộ Yêu thích
    const localFavs = JSON.parse(localStorage.getItem('favorites')) || [];
    if (localFavs.length > 0) {
        const favRef = doc(db, "favorites", userId);
        const favSnap = await getDoc(favRef);
        let firebaseFavs = favSnap.exists() ? favSnap.data().productIds : [];
        localFavs.forEach(id => {
            if (!firebaseFavs.includes(id)) firebaseFavs.push(id);
        });
        await setDoc(favRef, { productIds: firebaseFavs });
        localStorage.removeItem('favorites');
    }
}

// 11. Logic SEO: Cập nhật Meta tags dùng chung
export function updateSEO(title, description, imageUrl, url = window.location.href) {
    document.title = title;
    const metaMap = [
        { attr: 'name', key: 'robots', content: 'index, follow' },
        { attr: 'name', key: 'description', content: description },
        { attr: 'property', key: 'og:title', content: title },
        { attr: 'property', key: 'og:description', content: description },
        { attr: 'property', key: 'og:image', content: imageUrl },
        { attr: 'property', key: 'og:url', content: url },
        { attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
        { attr: 'name', key: 'twitter:title', content: title },
        { attr: 'name', key: 'twitter:description', content: description },
        { attr: 'name', key: 'twitter:image', content: imageUrl }
    ];

    metaMap.forEach(({ attr, key, content }) => {
        if (!content) return;
        let el = document.querySelector(`meta[${attr}="${key}"]`);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content);
    });

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
}

// 8. Logic Component: Tải Header/Footer dùng chung
export async function loadSharedComponents(pathPrefix = './') {
    try {
        const [h, f] = await Promise.all([
            fetch(`${pathPrefix}components/header.html`),
            fetch(`${pathPrefix}components/footer.html`)
        ]);

        const fixPaths = (html) => {
            // Tự động điều chỉnh đường dẫn dựa trên vị trí trang
            return html
                .replace(/src="Asset\//g, `src="${pathPrefix}Asset/`)
                .replace(/href="\.\/"/g, `href="${pathPrefix}"`)
                .replace(/href="products\//g, `href="${pathPrefix}products/`)
                .replace(/href="about\//g, `href="${pathPrefix}about/`)
                .replace(/href="flash-sale\//g, `href="${pathPrefix}flash-sale/`)
                .replace(/href="blog\//g, `href="${pathPrefix}blog/`)
                .replace(/href="maintenance\//g, `href="${pathPrefix}maintenance/`)
                .replace(/href="cart\//g, `href="${pathPrefix}cart/`)
                .replace(/href="checkout\//g, `href="${pathPrefix}checkout/`)
                .replace(/href="search\//g, `href="${pathPrefix}search/`)
                .replace(/href="profile\//g, `href="${pathPrefix}profile/`)
                .replace(/href="hoa-nha-gom\//g, `href="${pathPrefix}hoa-nha-gom/`)
                .replace(/href="trang-tri-su-kien\//g, `href="${pathPrefix}trang-tri-su-kien/`)
                .replace(/href="contact\//g, `href="${pathPrefix}contact/`)
                .replace(/href="index\.html"/g, `href="${pathPrefix}index.html"`)
                .replace(/href="privacy-policy\.html"/g, `href="${pathPrefix}privacy-policy.html"`)
                .replace(/href="terms-of-service\.html"/g, `href="${pathPrefix}terms-of-service.html"`)
                .replace(/href="buying-guide\.html"/g, `href="${pathPrefix}buying-guide.html"`)
                .replace(/href="payment-policy\.html"/g, `href="${pathPrefix}payment-policy.html"`)
                .replace(/href="shipping-policy\.html"/g, `href="${pathPrefix}shipping-policy.html"`)
                .replace(/href="return-refund-policy\.html"/g, `href="${pathPrefix}return-refund-policy.html"`);
        };

        if (h.ok) {
            const headerHTML = fixPaths(await h.text());
            document.getElementById('header-placeholder').innerHTML = headerHTML;
            const prefix = pathPrefix === './' ? '' : pathPrefix;
            
            // Kích hoạt menu mobile sau khi load xong HTML
            const menuToggle = document.getElementById('menu-toggle');
            const navLinks = document.getElementById('nav-links');

            if (menuToggle && navLinks) {
                menuToggle.onclick = () => {
                    const isActive = navLinks.classList.toggle('active');
                    menuToggle.classList.toggle('active');
                    document.body.classList.toggle('menu-open', isActive);
                };
                // Đóng menu khi click ra ngoài hoặc vào link
                document.addEventListener('click', (e) => {
                    if (navLinks.classList.contains('active') && !navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
                        navLinks.classList.remove('active');
                        menuToggle.classList.remove('active');
                        document.body.classList.remove('menu-open');
                    }
                });

                // Logic Accordion cho menu danh mục trên Mobile
                const dropdowns = navLinks.querySelectorAll('.dropdown');
                dropdowns.forEach(dropdown => {
                    const toggleBtn = dropdown.querySelector('.nav-item');
                    if (toggleBtn) {
                        toggleBtn.addEventListener('click', (e) => {
                            if (window.innerWidth <= 992) {
                                e.preventDefault(); // Ngăn chuyển trang ngay lập tức
                                dropdown.classList.toggle('mobile-expanded');
                            }
                        });
                    }
                });
            }
        }

        // Bước 3: Lắng nghe và render danh mục động từ Firestore
        onSnapshot(doc(db, "settings", "product_categories"), async (snapshot) => {
            const data = snapshot.data();
            if (snapshot.exists() && data && data.groups) {
                const sorted = data.groups.sort((a, b) => a.order - b.order);
                // Cập nhật mảng tại chỗ (in-place) để giữ nguyên tham chiếu cho các module khác
                dynamicCategories.length = 0;
                dynamicCategories.push(...sorted);
            } else {
                // Fallback về mặc định nếu không có dữ liệu
                dynamicCategories.length = 0;
                dynamicCategories.push(...DEFAULT_PRODUCT_CATEGORIES);
                // Lưu lại cấu trúc mặc định vào Firestore
                await setDoc(doc(db, "settings", "product_categories"), { groups: dynamicCategories });
            }

            // Render Footer Categories
            const footerList = document.getElementById('footer-categories');
            if (footerList) {
                let footerHtml = `
                    <li><a href="${pathPrefix}products/">Tất cả sản phẩm</a></li>
                    <li><a href="${pathPrefix}flash-sale/">Flash Sale</a></li>
                `;
                dynamicCategories.forEach(group => { // Iterate over array
                    footerHtml += `<li><a href="${pathPrefix}products/?category=${encodeURIComponent(group.name)}">${group.name}</a></li>`;
                });
                footerList.innerHTML = footerHtml;
            }
            
            // Render Header Mega Menu Categories (assuming header.html has a mega-menu-categories div)
            const megaMenuContainer = document.getElementById('mega-menu-categories');
            if (megaMenuContainer) {
                let megaMenuHtml = ''; // Reset HTML
                dynamicCategories.forEach(group => { // Iterate over array
                    megaMenuHtml += `
                        <div class="mega-col">
                            <h4><a href="${pathPrefix}products/?category=${encodeURIComponent(group.name)}" style="color: inherit; text-decoration: none; border: none; padding: 0 !important; font-weight: inherit; opacity: 1;">${group.name}</a></h4>
                            ${group.subs.map(sub => `<a href="${pathPrefix}products/?category=${encodeURIComponent(sub)}">${sub}</a>`).join('')}
                        </div>
                    `;
                });
                megaMenuContainer.innerHTML = megaMenuHtml;
            }

            // Cập nhật lại các thành phần UI khác có thể phụ thuộc vào danh mục
            // Ví dụ: Nếu có hàm renderCategoryGrid() ở trang products, nó sẽ được gọi lại
            // hoặc các hàm populateCategorySelect() ở admin.js
            // (Các module khác sẽ tự động nhận dynamicCategories mới nhất qua getDynamicCategories() hoặc onSnapshot riêng của chúng)
        });



        if (f.ok) {
            const footerHTML = fixPaths(await f.text());
            const footerPlaceholder = document.getElementById('footer-placeholder');
            if (footerPlaceholder) footerPlaceholder.innerHTML = footerHTML;
        }

        return true;
    } catch (error) {
        console.error("Lỗi tải component dùng chung:", error);
        return false;
    }
}
                        