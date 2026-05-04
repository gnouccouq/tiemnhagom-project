import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, query, where, limit, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
    RecaptchaVerifier, signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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

// Hàm để lấy danh mục hiện tại (có thể dùng trong các module khác)
export function getDynamicCategories() {
    return dynamicCategories;
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
let allProductsCache = null; // Đưa ra ngoài để cache toàn cục, tránh tải lại khi chuyển trang

export async function initAutocomplete(inputId, suggestionsId, pathPrefix = '') {
    const input = document.getElementById(inputId);
    const box = document.getElementById(suggestionsId);
    let timer;

    if (!input || !box) return;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const val = input.value.trim().toLowerCase();
        if (!val) { box.style.display = 'none'; return; }

        timer = setTimeout(async () => {
            box.innerHTML = `<div style="padding: 15px; text-align: center;"><div class="spinner"></div></div>`;
            box.style.display = 'block';

            try {
                if (!allProductsCache) {
                    const snap = await getDocs(collection(db, "products"));
                    allProductsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                }

                let results = allProductsCache.filter(p => 
                    (p.name || "").toLowerCase().includes(val) || p.id.toLowerCase().includes(val)
                ).sort((a, b) => {
                    // Ưu tiên khớp mã sản phẩm (ID) trước, sau đó tới tên bắt đầu bằng từ khóa
                    const aIdMatch = a.id.toLowerCase().startsWith(val);
                    const bIdMatch = b.id.toLowerCase().startsWith(val);
                    const aNameStart = (a.name || "").toLowerCase().startsWith(val);
                    const bNameStart = (b.name || "").toLowerCase().startsWith(val);

                    if (aIdMatch && !bIdMatch) return -1;
                    if (!aIdMatch && bIdMatch) return 1;
                    if (aNameStart && !bNameStart) return -1;
                    if (!aNameStart && bNameStart) return 1;
                    return (a.name || "").localeCompare(b.name || "");
                }).slice(0, 6);

                if (results.length === 0) {
                    box.innerHTML = `<div style="padding: 15px; text-align: center; color: #888; font-size: 0.85rem;">Không tìm thấy sản phẩm phù hợp</div>`;
                    return;
                }

                box.innerHTML = results.map(p => {
                    const hasSale = p.sale > 0;
                    const currentPrice = hasSale ? p.price * (1 - p.sale / 100) : p.price;
                    return `
                        <a href="${pathPrefix}product/index.html?id=${p.id}" class="suggestion-item">
                            <img src="${p.imageUrl}" alt="${p.name}">
                            <div class="suggestion-info">
                                <h5>${p.name}</h5>
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
        <div class="cookie-text">
            <p style="font-size: 0.85rem; margin: 0; color: #555;">
                <strong>🍪 Tiệm Nhà Gốm:</strong> Chúng tôi sử dụng cookie để mang lại trải nghiệm tốt nhất. Bằng cách tiếp tục, bạn đồng ý với 
                <a href="${pathPrefix}privacy-policy.html" style="color: var(--text-black); font-weight: 600; text-decoration: underline;">Chính sách bảo mật</a> của chúng tôi.
            </p>
        </div>
        <div class="cookie-actions" style="display: flex; gap: 10px;">
            <button id="btn-decline-cookie" class="btn-outline" style="margin: 0; padding: 0.6rem 1.5rem; font-size: 0.8rem; border-radius: 30px; white-space: nowrap;">Từ chối</button>
            <button id="btn-accept-cookie" class="btn-dark" style="margin: 0; padding: 0.6rem 2rem; font-size: 0.8rem; border-radius: 30px; white-space: nowrap;">Chấp nhận</button>
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
                <div class="rating-mini">${starsHtml}</div>
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

    const existingItem = cart.find(item => item.id === productData.id);
    if (existingItem) existingItem.quantity += productData.quantity;
    else cart.push(productData);

    if (user) await setDoc(doc(db, "carts", user.uid), { items: cart });
    else localStorage.setItem('cart', JSON.stringify(cart));

    updateCartCount();
    showToast(`Đã thêm ${productData.quantity} ${productData.name} vào giỏ hàng!`);
}

// 8. Logic Tổng hợp: Khởi tạo Header & Auth cho mọi trang
export async function initHeader(pathPrefix = './', onAuthChangeCallback = null) {
    // Bước 1: Tải Header/Footer
    const success = await loadSharedComponents(pathPrefix);
    if (!success) return;

    // Bước 2: Thiết lập lắng nghe trạng thái đăng nhập
    onAuthStateChanged(auth, async (user) => {
        const authSection = document.getElementById('auth-section');
        if (!authSection) return;

        if (user) {
            // Bọc logic xử lý dữ liệu trong try-catch để không làm treo UI Header
            try {
                // Tự động đồng bộ dữ liệu từ máy lên server khi vừa đăng nhập
                await syncLocalToCloud(user.uid);

                // Logic Liên kết tài khoản: Kiểm tra xem có dữ liệu "chờ" từ Admin không
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);

                if (!userSnap.exists()) {
                    // Nếu là user mới tinh trên hệ thống Auth, tìm kiếm trong "Ghost records"
                    let ghostData = {};
                    let ghostDocId = null;

                    // Tìm theo SĐT hoặc Email
                    const phone = user.phoneNumber;
                    const email = user.email;
                    const qGhost = query(collection(db, "users"), 
                        where("isGhost", "==", true),
                        where("identifiers", "array-contains-any", [phone, email].filter(Boolean)));
                    
                    const ghostSnaps = await getDocs(qGhost);
                    if (!ghostSnaps.empty) {
                        ghostData = ghostSnaps.docs[0].data();
                        ghostDocId = ghostSnaps.docs[0].id;
                    }

                    await setDoc(userRef, {
                        ...ghostData, // Gộp dữ liệu cũ (nếu có)
                        uid: user.uid,
                        email: email || ghostData.email || null,
                        phoneNumber: phone || ghostData.phone || null,
                        displayName: user.displayName || ghostData.displayName || null,
                        isGhost: false, // Chính thức trở thành tài khoản thật
                        lastLogin: new Date().toISOString()
                    }, { merge: true });

                    // Xóa bỏ tài khoản ghost cũ để tránh trùng lặp
                    if (ghostDocId) await deleteDoc(doc(db, "users", ghostDocId));
                } else {
                    await updateDoc(userRef, { lastLogin: new Date().toISOString() });
                }
            } catch (dataError) {
                console.error("Lỗi đồng bộ dữ liệu người dùng:", dataError);
            }
            
            // Cập nhật giao diện Header (Tên user và nút đăng xuất)
            const profilePath = pathPrefix === './' ? 'profile/' : `${pathPrefix}profile/`;
            const adminPath = pathPrefix === './' ? 'admin/' : `${pathPrefix}admin/`;

            // Xác định trạng thái active ban đầu dựa trên URL và Hash
            const isProfilePage = window.location.pathname.includes('profile');
            const isOrdersTab = window.location.hash === '#orders';
            const isFavsTab = window.location.hash === '#favs';

            // Kiểm tra quyền Admin để hiển thị menu quản trị
            let isAdmin = false;
            try {
                const adminSnap = await getDoc(doc(db, "admins", user.uid));
                isAdmin = adminSnap.exists();
            } catch (e) { console.error("Lỗi kiểm tra quyền admin:", e); }

            authSection.innerHTML = `
                <div class="user-dropdown">
                    <a href="${profilePath}" class="user-icon-link" title="${isAdmin ? 'Tài khoản Quản trị' : 'Tài khoản'}">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${isAdmin ? `
                        <span class="admin-badge" title="Quản trị viên">
                            <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                            </svg>
                        </span>` : ''}
                    </a>
                    <ul class="user-dropdown-menu">
                        <li class="dropdown-user-info">
                            <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-black); display: flex; align-items: center;">
                                ${user.displayName || user.email.split('@')[0]} ${isAdmin ? `<span class="admin-text-badge">Admin</span>` : ''}
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
                        ${isAdmin ? `<li><a href="${adminPath}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            Trang quản trị
                        </a></li>` : ''}
                        <li><hr></li>
                        <li><button id="btn-logout-header" class="btn-minimal">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                            Đăng xuất
                        </button></li>
                    </ul>
                </div>
            `;
            document.getElementById('btn-logout-header').onclick = logout;

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
        }

        // Luôn cập nhật con số trên icon giỏ hàng/yêu thích
        updateCartCount(user);
        updateFavoriteCount(user);

        // Khởi tạo popup Cookie
        setupCookieConsent(pathPrefix);

        // Khởi tạo tính năng xem ảnh full screen
        setupFullScreenImages();

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

        // Chạy logic riêng của từng trang (nếu có)
        if (onAuthChangeCallback) onAuthChangeCallback(user);
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
            const existing = firebaseCart.find(i => i.id === localItem.id);
            if (existing) existing.quantity += localItem.quantity;
            else firebaseCart.push(localItem);
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
                .replace(/href="flash-sale\//g, `href="${pathPrefix}flash-sale/`)
                .replace(/href="cart\//g, `href="${pathPrefix}cart/`)
                .replace(/href="profile\//g, `href="${pathPrefix}profile/`)
                .replace(/href="hoa-nha-gom\//g, `href="${pathPrefix}hoa-nha-gom/`)
                .replace(/href="trang-tri-su-kien\//g, `href="${pathPrefix}trang-tri-su-kien/`)
                .replace(/href="contact\//g, `href="${pathPrefix}contact/`)
                .replace(/href="index\.html"/g, `href="${pathPrefix}index.html"`)
                .replace(/href="privacy-policy\.html"/g, `href="${pathPrefix}privacy-policy.html"`)
                .replace(/href="terms-of-service\.html"/g, `href="${pathPrefix}terms-of-service.html"`);
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
                // Sắp xếp các nhóm theo trường 'order'
                dynamicCategories = data.groups.sort((a, b) => a.order - b.order);
            } else {
                // Nếu chưa có trên cloud, dùng mặc định làm khởi đầu và tạo document
                dynamicCategories = DEFAULT_PRODUCT_CATEGORIES;
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
                            <h4>${group.name}</h4>
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
                        