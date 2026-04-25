import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, limit, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
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
export const db = getFirestore(app);
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
        await signInWithPopup(auth, googleProvider);
        showToast("Đăng nhập thành công!");
    } catch (error) {
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
export async function updateCartCount() {
    let cart = [];
    if (auth.currentUser) {
        const cartSnap = await getDoc(doc(db, "carts", auth.currentUser.uid));
        if (cartSnap.exists()) cart = cartSnap.data().items || [];
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }
    const total = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const countEl = document.getElementById('cart-count');
    if (countEl) {
        countEl.innerText = total;
        countEl.style.display = total > 0 ? 'flex' : 'none';
    }
}

// 6. Logic Yêu thích: Cập nhật số lượng
export async function updateFavoriteCount() {
    let favs = [];
    if (auth.currentUser) {
        const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
        if (favSnap.exists()) favs = favSnap.data().productIds || [];
    } else {
        favs = JSON.parse(localStorage.getItem('favorites')) || [];
    }
    const countEl = document.getElementById('favorite-count');
    if (countEl) {
        countEl.innerText = favs.length;
        countEl.style.display = favs.length > 0 ? 'flex' : 'none';
    }
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
            
            // Cập nhật giao diện Header (Tên user và nút đăng xuất)
            const profilePath = pathPrefix === './' ? 'profile/' : `${pathPrefix}profile/`;

            // Xác định trạng thái active ban đầu dựa trên URL và Hash
            const isProfilePage = window.location.pathname.includes('profile');
            const isOrdersTab = window.location.hash === '#orders';

            authSection.innerHTML = `
                <div class="user-dropdown">
                    <a href="${profilePath}" class="user-icon-link" title="Tài khoản">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </a>
                    <ul class="user-dropdown-menu">
                        <li><a href="${profilePath}" class="${isProfilePage && !isOrdersTab ? 'active' : ''}">Trang cá nhân</a></li>
                        <li><a href="${profilePath}#orders" class="${isProfilePage && isOrdersTab ? 'active' : ''}">Lịch sử đơn hàng</a></li>
                        <li><hr></li>
                        <li><button id="btn-logout-header" class="btn-minimal">Đăng xuất</button></li>
                    </ul>
                </div>
            `;
            document.getElementById('btn-logout-header').onclick = logout;

            // Lắng nghe thay đổi hash để cập nhật trạng thái active tức thì khi đang ở trang profile
            window.addEventListener('hashchange', () => {
                if (window.location.pathname.includes('profile')) {
                    const currentIsOrders = window.location.hash === '#orders';
                    const links = authSection.querySelectorAll('.user-dropdown-menu a');
                    links.forEach(link => {
                        const isLinkForOrders = link.getAttribute('href').includes('#orders');
                        link.classList.toggle('active', isLinkForOrders === currentIsOrders);
                    });
                }
            });
        } else {
            const loginPath = pathPrefix === './' ? 'login/' : `${pathPrefix}login/`;
            authSection.innerHTML = `<a href="${loginPath}" class="btn-minimal" style="text-decoration:none">Đăng nhập</a>`;
        }

        // Luôn cập nhật con số trên icon giỏ hàng/yêu thích
        updateCartCount();
        updateFavoriteCount();

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
            if (pathPrefix === './') return html;
            return html
                .replace(/src="Asset\//g, `src="${pathPrefix}Asset/`)
                .replace(/href="\.\/"/g, `href="${pathPrefix}"`)
                .replace(/href="products\/"/g, `href="${pathPrefix}products/"`)
                .replace(/href="cart\/"/g, `href="${pathPrefix}cart/"`)
                .replace(/href="profile\/"/g, `href="${pathPrefix}profile/"`);
        };

        if (h.ok) {
            const headerHTML = fixPaths(await h.text());
            document.getElementById('header-placeholder').innerHTML = headerHTML;
            const prefix = pathPrefix === './' ? '' : pathPrefix;
            
            // Kích hoạt menu mobile sau khi load xong HTML
            const toggle = document.getElementById('menu-toggle');
            const nav = document.getElementById('nav-links');
            
            if (toggle && nav) {
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    const isActive = toggle.classList.toggle('active');
                    toggle.setAttribute('aria-expanded', isActive);
                    nav.classList.toggle('active');
                    // Cấm cuộn trang khi menu mở
                    document.body.classList.toggle('no-scroll', isActive);
                });

                // Logic cho nút đóng menu mới
                const closeBtn = document.getElementById('menu-close');
                const closeMenu = () => {
                    toggle.classList.remove('active');
                    nav.classList.remove('active');
                    toggle.setAttribute('aria-expanded', 'false');
                    document.body.classList.remove('no-scroll');
                };

                if (closeBtn) closeBtn.onclick = closeMenu;

                // Đóng menu khi nhấn vào một link
                nav.querySelectorAll('a').forEach(link => {
                    link.onclick = () => {
                        closeMenu();
                    };
                });
            }

            // Logic tìm kiếm nhanh trên Header
            const searchInput = document.getElementById('header-search-input');
            const searchBtn = document.getElementById('header-search-btn');
            if (searchInput && searchBtn) {
                const performSearch = () => {
                    const q = searchInput.value.trim();
                    if (q) {
                        const target = pathPrefix === './' ? 'products/' : `${pathPrefix}products/`;
                        window.location.href = `${target}?search=${encodeURIComponent(q)}`;
                    }
                };
                searchBtn.onclick = performSearch;
                searchInput.onkeydown = (e) => { if (e.key === 'Enter') performSearch(); };
            }

            // Logic gợi ý sản phẩm tức thì (Autocomplete)
            const suggestionsBox = document.getElementById('search-suggestions');
            let typingTimer;
            if (searchInput && suggestionsBox) {
                searchInput.setAttribute('aria-autocomplete', 'list');
                searchInput.setAttribute('aria-controls', 'search-suggestions');
                suggestionsBox.setAttribute('role', 'listbox');

                searchInput.addEventListener('input', () => {
                    clearTimeout(typingTimer);
                    const val = searchInput.value.trim();
                    
                    if (val.length < 2) {
                        suggestionsBox.style.display = 'none';
                        return;
                    }

                    typingTimer = setTimeout(async () => {
                        const q = query(collection(db, "products"), 
                            where("name", ">=", val), 
                            where("name", "<=", val + '\uf8ff'), 
                            limit(5));
                        const snap = await getDocs(q);
                        
                        if (snap.empty) {
                            suggestionsBox.style.display = 'none';
                            return;
                        }

                        suggestionsBox.innerHTML = snap.docs.map(doc => {
                            const p = doc.data();
                            return `
                                <a href="${prefix}product/index.html?id=${doc.id}" class="suggestion-item" role="option">
                                    <img src="${p.imageUrl}" alt="${p.name}">
                                    <div class="suggestion-info">
                                        <h5>${p.name}</h5>
                                        <p>${new Intl.NumberFormat('vi-VN').format(p.price)}đ</p>
                                    </div>
                                </a>
                            `;
                        }).join('');
                        suggestionsBox.style.display = 'block';
                    }, 300);
                });

                // Đóng box khi click ra ngoài
                document.addEventListener('click', (e) => {
                    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                        suggestionsBox.style.display = 'none';
                    }
                });
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