import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, limit, getDocs 
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

const app = initializeApp(firebaseConfig);

// Khởi tạo Firestore với cấu hình cache mới (thay thế enableIndexedDbPersistence)
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager() // Tự động xử lý khi mở nhiều tab
    })
});

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

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
        <a href="${linkBase}?id=${id}" class="product-link" style="text-decoration: none; color: inherit;">
            <div class="product-card ${sparkleClass} ${outOfStockClass}" style="position: relative;">
                ${isOutOfStock ? stockBadge : saleBadge}
                <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${id}')" 
                        aria-label="${isFav ? 'Xóa khỏi yêu thích' : 'Thêm vào yêu thích'}" aria-pressed="${isFav}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" 
                     alt="${product.name}" 
                     loading="lazy"
                     decoding="async"
                     width="300" height="300"
                     style="width:100%; height: auto; object-fit: cover; aspect-ratio: 1/1; background-color: #f0f0f0;">
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
                    <a href="${profilePath}" class="user-icon-link" title="Tài khoản">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </a>
                    <ul class="user-dropdown-menu">
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
                .replace(/href="products\/"/g, `href="${pathPrefix}products/"`)
                .replace(/href="cart\/"/g, `href="${pathPrefix}cart/"`)
                .replace(/href="profile\/"/g, `href="${pathPrefix}profile/"`)
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
            }

            // Logic Tìm kiếm Overlay
            const btnOpenSearch = document.getElementById('btn-open-search');
            const btnCloseSearch = document.getElementById('btn-close-search');
            const searchOverlay = document.getElementById('search-overlay');
            const searchInput = document.getElementById('header-search-input');

            if (btnOpenSearch && searchOverlay) {
                btnOpenSearch.onclick = () => {
                    searchOverlay.classList.add('active');
                    searchInput.focus();
                };
                btnCloseSearch.onclick = () => {
                    searchOverlay.classList.remove('active');
                    document.getElementById('search-suggestions').style.display = 'none';
                };
                // Khởi tạo tìm kiếm cho Header Overlay
                initAutocomplete('header-search-input', 'search-suggestions', prefix);
            }
        }
        if (f.ok) {
            document.getElementById('footer-placeholder').innerHTML = fixPaths(await f.text());
            setupScrollToTop();
        }
        
        return true;
    } catch (e) {
        console.error("Lỗi tải component dùng chung:", e);
        return false;
    }
}