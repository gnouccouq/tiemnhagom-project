import { db, auth, analytics, storage, googleProvider, rtdb } from './config.js';
export { db, auth, analytics, storage, googleProvider, rtdb };
import {
    ref, onValue, onDisconnect, set, serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
    collection, query, where, limit, getDocs, onSnapshot, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
    RecaptchaVerifier, signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import * as emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';

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

// 1.1 Cấu hình hạng thành viên (Membership Tiers)
export const MEMBERSHIP_TIERS = [
    { 
        id: 'null', name: "Gốm Mộc", min: 0, discount: 0, color: '#95a5a6', 
        icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
        freeShipping: false,
        categoryDiscounts: {},
        tierUpVoucher: 0,
        birthdayVoucher: 0,
        friendVoucher: false
    },
    { 
        id: 'new', name: "Gốm Nung", min: 1000000, discount: 1, color: '#3498db', 
        icon: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
        freeShipping: false,
        categoryDiscounts: { "KitchenWare": 0.5, "HomeDecor": 1 },
        tierUpVoucher: 50000,
        birthdayVoucher: 50000,
        friendVoucher: false
    },
    { 
        id: 'mem', name: "Gốm Men", min: 5000000, discount: 3, color: '#f1c40f', 
        icon: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>',
        freeShipping: true,
        categoryDiscounts: { "Túi, móc khoá, lót ly": 0.5, "KitchenWare": 1, "HomeDecor": 3 },
        tierUpVoucher: 100000,
        birthdayVoucher: 200000,
        friendVoucher: true
    },
    { 
        id: 'vip', name: "Gốm Độc Bản", min: 10000000, discount: 5, color: '#e74c3c', 
        icon: '<path d="M5 16L3 5l5.5 5L12 2l3.5 8L21 5l-2 11H5zm14 3c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2v-1h14v1z"/>',
        freeShipping: true,
        categoryDiscounts: { "Túi, móc khoá, lót ly": 1, "KitchenWare": 3, "HomeDecor": 5 },
        tierUpVoucher: 300000,
        birthdayVoucher: 500000,
        friendVoucher: true
    }
];

export function getMembershipTier(totalSpent) {
    return MEMBERSHIP_TIERS.find((t, idx) => {
        const nextTier = MEMBERSHIP_TIERS[idx + 1];
        if (!nextTier) return true; // Hạng cao nhất
        return totalSpent >= t.min && totalSpent < nextTier.min;
    }) || MEMBERSHIP_TIERS[0];
}

// 1.1 Quản lý trạng thái Flash Sale toàn cục
export let globalFlashSaleSettings = null;

export async function fetchFlashSaleSettings(forceRefresh = false) {
    if (globalFlashSaleSettings && !forceRefresh) return globalFlashSaleSettings;
    if (!db) return null;
    const fsRef = doc(db, "settings", "flash_sale");
    const fsSnap = await getDoc(fsRef);
    if (fsSnap.exists()) {
        globalFlashSaleSettings = fsSnap.data();
    }
    return globalFlashSaleSettings;
}

// 1.2 Khởi tạo Scroll Reveal Observer toàn cục để dùng cho các phần tử nạp động (ví dụ bộ sưu tập ở trang chủ)
export const revealObserver = (typeof IntersectionObserver !== 'undefined') ? new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 }) : null;

// Gán vào window để các module nạp dữ liệu động (như main.js) có thể sử dụng
if (revealObserver) window.revealObserver = revealObserver;

export function getProductCurrentPrice(product, fsSettings = globalFlashSaleSettings) {
    const now = new Date();
    const isFsRunning = fsSettings && fsSettings.isActive &&
        (!fsSettings.startTime || now >= fsSettings.startTime.toDate()) &&
        (!fsSettings.endTime || now <= fsSettings.endTime.toDate());

    if (isFsRunning && product.flashSaleGroup) {
        return product.flashSaleGroup;
    }
    if (product.sale > 0) {
        return Math.round(product.price * (1 - product.sale / 100));
    }
    return product.price;
}

export function getProductEffectiveSale(product, fsSettings = globalFlashSaleSettings) {
    const now = new Date();
    const isFsRunning = fsSettings && fsSettings.isActive &&
        (!fsSettings.startTime || now >= fsSettings.startTime.toDate()) &&
        (!fsSettings.endTime || now <= fsSettings.endTime.toDate());

    return product.sale || 0;
}

// Hàm để lấy danh mục hiện tại (có thể dùng trong các module khác)
export function getDynamicCategories() {
    return dynamicCategories;
}

// Hàm hỗ trợ bảo mật: Chống tấn công XSS bằng cách mã hóa các ký tự đặc biệt
export function escapeHTML(str) { // Đảm bảo hàm này được export
    if (!str) return "";
    return str.toString().replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

// Hàm hỗ trợ định dạng số điện thoại về chuẩn Việt Nam (bắt đầu bằng 0)
export function formatPhoneNumber(phone) {
    if (!phone) return '';
    // Xóa tất cả ký tự không phải số và dấu +
    let cleaned = phone.toString().replace(/[^\d+]/g, '');

    // Nếu bắt đầu bằng +84, đổi thành 0
    if (cleaned.startsWith('+84')) {
        return '0' + cleaned.substring(3);
    }
    // Nếu bắt đầu bằng 84 (không có +) và có vẻ là số di động VN (10-11 số)
    if (cleaned.startsWith('84') && cleaned.length >= 10) {
        return '0' + cleaned.substring(2);
    }
    // Nếu người dùng nhập 9xx... (thiếu số 0), thêm 0 vào đầu
    if (/^[1-9]/.test(cleaned) && cleaned.length >= 9 && cleaned.length <= 11) {
        return '0' + cleaned;
    }
    return cleaned;
}

/**
 * Hàm tạo Mã đơn hàng an toàn cho hệ thống lớn: 
 * Định dạng: TNG + DDMMYYYY + HHMMSSlll (mili giây) + -XXXX (ngẫu nhiên 4 ký tự chữ/số)
 */
export function generateOrderId() {
    const now = new Date();
    const pad = (n, l = 2) => String(n).padStart(l, '0');
    const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
    // Sử dụng chuỗi ngẫu nhiên alphanumeric để tăng entropy (độ hỗn loạn), tránh trùng lặp
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TNG${dateStr}${timeStr}-${randomSuffix}`;
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

/**
 * Saves a contact message to Firestore.
 * @param {string} name - The name of the sender.
 * @param {string} phone - The phone number of the sender.
 * @param {string} message - The message content.
 */
export async function saveContactMessage(name, phone, message) {
    if (!db) {
        console.error("Firestore is not initialized.");
        throw new Error("Firestore not available.");
    }
    try {
        await addDoc(collection(db, "contact_messages"), {
            name: name,
            phone: phone,
            message: message,
            timestamp: serverTimestamp(),
            status: "new" // e.g., new, read, replied
        });
        console.log("Contact message saved to Firestore.");
    } catch (error) {
        console.error("Error saving contact message to Firestore:", error);
        throw error;
    }
}

/**
 * Hàm gửi Email thông báo dùng chung
 * @param {string} type - Loại thông báo (order, welcome, password, phone, promo)
 * @param {Object} params - Các biến dữ liệu đổ vào template email
 */
export async function sendEmailNotification(type, params) {
    const serviceId = "service_tiemnhagom"; // Cấu hình Service ID trong EmailJS gắn với gmail của bạn
    let templateId = "";

    switch (type) {
        case 'order': templateId = "template_order_confirm"; break;
        case 'welcome': templateId = "template_welcome"; break;
        case 'password': templateId = "template_password_reset"; break;
        case 'phone': templateId = "template_phone_update"; break;
        case 'promo': templateId = "template_promotion"; break;
    }

    try {
        await emailjs.send(serviceId, templateId, params);
    } catch (error) {
        console.error("Lỗi gửi email:", error);
    }
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

// 3.1 Logic UI: Xử lý hiệu ứng header trong suốt khi ở đầu trang (áp dụng cho trang có Hero)
export function setupHeaderScroll() {
    const nav = document.querySelector('.navbar');
    const bottomNav = document.querySelector('.mobile-bottom-nav');
    if (!nav) return;

    // Kiểm tra xem trang có Hero Section (như trang chủ) không
    const hasHero = document.querySelector('.hero-carousel') || document.querySelector('.hero');

    const handleScroll = () => {
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
            nav.classList.remove('transparent');
            if (hasHero && bottomNav) bottomNav.classList.add('scrolled-show');
        } else {
            if (hasHero) {
                nav.classList.add('transparent');
                if (bottomNav) bottomNav.classList.remove('scrolled-show');
            }
            nav.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Cập nhật trạng thái ngay khi khởi tạo
}

// 3.2 Logic: Tự động liên kết đơn hàng vãng lai/tại shop vào UID tài khoản dựa trên SĐT
export async function autoLinkOrdersByPhone(userId, phone) {
    if (!phone || !db) return 0;
    try {
        const p0 = formatPhoneNumber(phone);
        const p84 = p0.startsWith('0') ? '+84' + p0.substring(1) : p0;

        // Tìm tất cả đơn hàng có SĐT này
        const q = query(collection(db, "orders"), where("shippingAddress.phone", "in", [p0, p84]));
        const snap = await getDocs(q);

        const updatePromises = [];
        snap.forEach(docSnap => {
            // Nếu đơn hàng chưa thuộc về userId này, tiến hành liên kết
            if (docSnap.data().userId !== userId) {
                updatePromises.push(updateDoc(docSnap.ref, { userId: userId }));
            }
        });

        if (updatePromises.length > 0) await Promise.all(updatePromises);
        return updatePromises.length;
    } catch (e) { console.error("Auto-link orders error:", e); return 0; }
}

// 4. Logic Auth: Đăng nhập & Đăng xuất
export async function loginWithGoogle() {
    try {
        await signInWithPopup(auth, googleProvider);
        showToast("Đăng nhập thành công!");
        await new Promise(r => setTimeout(r, 500)); // Đợi Firebase cập nhật IndexedDB
        return true;
    } catch (error) {
        console.error(error);
        showToast("Lỗi đăng nhập: " + error.message, "error");
        return false;
    }
}

// Đăng nhập bằng Email/Password
export async function loginEmail(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Đăng nhập thành công!");
        await new Promise(r => setTimeout(r, 500)); // Đợi Firebase cập nhật IndexedDB
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
        sessionStorage.removeItem('tng_current_tier'); // Xóa cache hạng thẻ
        showToast("Đã đăng xuất");
        await new Promise(r => setTimeout(r, 500)); // Quan trọng: Đợi IndexedDB lưu trạng thái đăng xuất trước khi reload trang
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
                    .filter(p => (p.name_lowercase || p.name.toLowerCase()).includes(val) || p.id.toLowerCase().includes(val)) // Tìm theo tên hoặc mã SKU
                    .slice(0, 6); // Chỉ hiển thị 6 gợi ý hàng đầu

                if (results.length === 0) {
                    box.innerHTML = `<div style="padding: 15px; text-align: center; color: #888; font-size: 0.85rem;">Không tìm thấy sản phẩm phù hợp</div>`;
                    return;
                }

                box.innerHTML = results.map(p => {
                    const hasSale = p.sale > 0;
                    const currentPrice = hasSale ? p.price * (1 - p.sale / 100) : p.price;
                    const safeName = escapeHTML(p.name);
                    const isOutOfStock = (p.stock || 0) <= 0;
                    return `
                        <a href="${pathPrefix}product/index.html?id=${p.id}" class="suggestion-item">
                            <img src="${p.imageUrl}" alt="${p.name}">
                            <div class="suggestion-info">
                                <h5>${safeName}</h5>
                                <div style="display: flex; gap: 10px; font-size: 0.7rem; margin-bottom: 2px;">
                                    <span style="color: #888;">Mã: ${p.id}</span>
                                    <span style="color: ${isOutOfStock ? '#e74c3c' : '#27ae60'}; font-weight: 600;">${isOutOfStock ? 'Hết hàng' : 'Còn hàng'}</span>
                                </div>
                                <div class="suggestion-price-container">
                                    ${hasSale ? `<span class="suggestion-old-price">${new Intl.NumberFormat('vi-VN').format(p.price)} VND</span>` : ''}
                                    <span class="suggestion-current-price ${hasSale ? 'sale' : ''}">${new Intl.NumberFormat('vi-VN').format(currentPrice)} VND</span>
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
export function updateMembershipPrices(tier) {
    if (!tier || tier.discount <= 0) return;
    const containers = document.querySelectorAll('.dynamic-membership-price:empty');
    containers.forEach(container => {
        const currentPrice = parseInt(container.getAttribute('data-price'));
        if (!currentPrice) return;
        const memPrice = Math.round(currentPrice * (1 - tier.discount / 100));
        container.innerHTML = `
            <div style="font-size: 0.75rem; display: flex; justify-content: space-between; align-items: center; padding: 3px 8px; border-radius: 6px; border: 1px solid #eee; background: #fafafa; margin-top: 6px;">
                <span style="color: ${tier.color}; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                    ${tier.name}
                </span> 
                <strong style="color: #e74c3c;">${new Intl.NumberFormat('vi-VN').format(memPrice)}đ</strong>
            </div>`;
    });
}
window.updateMembershipPrices = updateMembershipPrices;

export function renderProductCard(product, id, favsList = [], linkBase = 'product/index.html') {
    const currentPrice = getProductCurrentPrice(product);
    const displaySale = getProductEffectiveSale(product);
    const hasSale = displaySale > 0;
    const isOutOfStock = (product.stock || 0) <= 0;
    const soldCount = product.sold || 0;
    const priceHtml = hasSale
        ? `<p class="price" style="margin-bottom: 2px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;"><span class="old-price" style="text-decoration: line-through; color: #999; font-size: 0.85em;">${new Intl.NumberFormat('vi-VN').format(product.price)} VND</span> <span style="white-space: nowrap;">${new Intl.NumberFormat('vi-VN').format(currentPrice)} VND</span></p>`
        : `<p class="price" style="margin-bottom: 2px; white-space: nowrap;">${new Intl.NumberFormat('vi-VN').format(product.price)} VND</p>`;

    let memPriceHtml = `<div class="dynamic-membership-price" data-price="${currentPrice}"></div>`;
    try {
        const tierStr = sessionStorage.getItem('tng_current_tier');
        if (tierStr) {
            const tier = JSON.parse(tierStr);
            if (tier && tier.discount > 0) {
                const memPrice = Math.round(currentPrice * (1 - tier.discount / 100));
                memPriceHtml = `
                <div class="dynamic-membership-price" data-price="${currentPrice}">
                    <div style="font-size: 0.75rem; display: flex; justify-content: space-between; align-items: center; padding: 3px 8px; border-radius: 6px; border: 1px solid #eee; background: #fafafa; margin-top: 6px;">
                        <span style="color: ${tier.color}; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                            ${tier.name}
                        </span> 
                        <strong style="color: #e74c3c;">${new Intl.NumberFormat('vi-VN').format(memPrice)}đ</strong>
                    </div>
                </div>`;
            }
        }
    } catch(e) {}

    const saleBadge = hasSale ? `<div class="sale-badge">-${displaySale}%</div>` : '';
    const stockBadge = isOutOfStock ? `<div class="out-of-stock-badge">Hết hàng</div>` : '';
    const isFav = favsList.includes(id);
    const sparkleClass = hasSale ? 'sale-sparkle' : '';
    const outOfStockClass = isOutOfStock ? 'is-out-of-stock' : '';

    let finalImageUrl = product.thumbUrl || product.imageUrl;
    const isPlaceholder = !finalImageUrl || finalImageUrl.includes('placehold.co') || finalImageUrl.includes('via.placeholder.com');
    
    if (isPlaceholder) {
        let variantImage = null;
        if (product.colorVariants && product.colorVariants.length > 0) {
            const firstColorWithImage = product.colorVariants.find(v => v && v.imageUrl);
            if (firstColorWithImage) variantImage = firstColorWithImage.imageUrl;
        }
        if (!variantImage && product.patternVariants && product.patternVariants.length > 0) {
            const firstPatternWithImage = product.patternVariants.find(v => v && v.imageUrl);
            if (firstPatternWithImage) variantImage = firstPatternWithImage.imageUrl;
        }
        if (!variantImage && product.patterns && typeof product.patterns[0] === 'object') {
            const firstPatternWithImage = product.patterns.find(v => v && v.imageUrl);
            if (firstPatternWithImage) variantImage = firstPatternWithImage.imageUrl;
        }
        
        if (variantImage) {
            finalImageUrl = variantImage;
        } else if (!finalImageUrl) {
            finalImageUrl = 'https://placehold.co/300x300?text=No+Image';
        }
    }

    return `
    <div class="product-card ${sparkleClass} ${outOfStockClass}">
        <div class="product-card-image">
            <a href="${linkBase}?id=${id}">
                <img src="${finalImageUrl}" 
                     alt="${product.name}" loading="lazy" width="300" height="300">
            </a>
            ${isOutOfStock ? stockBadge : saleBadge}
            <div class="product-card-actions">
                <button class="action-icon-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${id}')" title="Yêu thích">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <button class="quick-add-btn" onclick="addToCart({id: '${id}', name: '${product.name.replace(/'/g, "\\'")}', price: ${currentPrice}, image: '${finalImageUrl}', quantity: 1, category: '${product.category}'})" title="Thêm nhanh vào giỏ">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"></path>
                    </svg>
                </button>
            </div>
        </div>
        <div class="product-card-info">
            <div class="product-sku" style="font-size: 0.7rem; margin-bottom: 4px; letter-spacing: 1px;">Mã: ${id}</div>
            <a href="${linkBase}?id=${id}" class="product-title-link">
                <h3>${product.name}</h3>
            </a>
            <div class="product-price-block">
                ${priceHtml}
                ${memPriceHtml}
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

// 8. Logic Tổng hợp: Khởi tạo Header & Auth cho mọi trang
export async function initHeader(pathPrefix = './', onAuthChangeCallback = null) {
    // HIỂN THỊ NHANH: Kiểm tra gợi ý đăng nhập từ localStorage để hiện icon ngay lập tức (Skeleton/Placeholder)
    const userHint = JSON.parse(localStorage.getItem('tng_user_hint'));

    // Chạy song song: Tải component và Lắng nghe Auth
    const componentsPromise = loadSharedComponents(pathPrefix);

    // Tải trước cài đặt Flash Sale để render thẻ sản phẩm đúng giá
    const fsPromise = fetchFlashSaleSettings();

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

        // Đợi cài đặt Flash Sale xong để render giá chính xác
        await fsPromise;

        // Kích hoạt quan sát cho các phần tử có sẵn trong DOM ngay khi khởi tạo Header
        document.querySelectorAll('.reveal-on-scroll').forEach(r => window.revealObserver?.observe(r));

        // LUÔN chạy callback sớm nhất có thể để trang web load dữ liệu chính (Sản phẩm,...)
        // Không để các tác vụ Admin/Sync bên dưới làm chậm việc hiển thị dữ liệu
        if (onAuthChangeCallback) onAuthChangeCallback(user);

        const authSection = document.getElementById('auth-section');
        if (!authSection) return;

        if (user) {
            // Lưu hint để lần sau vào web sẽ hiện icon đăng nhập nhanh
            localStorage.setItem('tng_user_hint', JSON.stringify({
                loggedIn: true,
                displayName: user.displayName || (user.email ? user.email.split('@')[0] : (user.phoneNumber || 'Thành viên'))
            }));

            const profilePath = pathPrefix === './' ? 'profile/' : `${pathPrefix}profile/`;
            const adminPath = pathPrefix === './' ? 'admin/' : `${pathPrefix}admin/`;
            const membershipPath = pathPrefix === './' ? 'membership/' : `${pathPrefix}membership/`;
            const displayName = user.displayName || (user.email ? user.email.split('@')[0] : (user.phoneNumber || 'Thành viên'));

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
                        <li><a href="${membershipPath}" class="${window.location.pathname.includes('membership') ? 'active' : ''}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 10px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                            Gốm Membership
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

                    // Lấy hạng thành viên và cập nhật UI thẻ sản phẩm
                    let currentTierStr = sessionStorage.getItem('tng_current_tier');
                    if (!currentTierStr) {
                        try {
                            const q = query(collection(db, "orders"), where("userId", "==", user.uid), where("status", "==", "Đã hoàn thành"));
                            const snap = await getDocs(q);
                            let totalSpent = 0;
                            snap.forEach(doc => totalSpent += (doc.data().totalAmount || 0));
                            const tier = getMembershipTier(totalSpent);
                            currentTierStr = JSON.stringify(tier);
                            sessionStorage.setItem('tng_current_tier', currentTierStr);
                        } catch(e) {
                            console.error("Lỗi lấy hạng thành viên:", e);
                        }
                    }
                    if (currentTierStr) {
                        if (window.updateMembershipPrices) {
                            window.updateMembershipPrices(JSON.parse(currentTierStr));
                        }
                    }

                    // Đồng bộ dữ liệu & ghost records
                    await syncLocalToCloud(user.uid);
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    if (!userSnap.exists()) {
                        const identifiers = [];
                        if (user.email) identifiers.push(user.email);
                        if (user.phoneNumber) {
                            const p0 = formatPhoneNumber(user.phoneNumber);
                            const p84 = p0.startsWith('0') ? '+84' + p0.substring(1) : p0;
                            identifiers.push(p0, p84);
                        }

                        await setDoc(userRef, {
                            uid: user.uid,
                            email: user.email,
                            phone: user.phoneNumber ? formatPhoneNumber(user.phoneNumber) : '',
                            identifiers: identifiers,
                            isGhost: false,
                            lastLogin: new Date().toISOString()
                        }, { merge: true });

                        // Liên kết đơn hàng cho user mới nếu có SĐT (ví dụ login bằng phone)
                        if (user.phoneNumber) await autoLinkOrdersByPhone(user.uid, user.phoneNumber);
                    } else {
                        const userData = userSnap.data();
                        await updateDoc(userRef, { lastLogin: new Date().toISOString() });
                        // Tự động cập nhật liên kết đơn hàng nếu user đã có SĐT lưu sẵn
                        if (userData.phone) await autoLinkOrdersByPhone(user.uid, userData.phone);
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

        // Khởi tạo thanh tìm kiếm chính trong Header Overlay
        initAutocomplete('header-search-input', 'search-suggestions', pathPrefix);
        
        // Setup logic cho Header Search Overlay
        const btnOpenSearch = document.getElementById('btn-open-search');
        const searchOverlay = document.getElementById('search-overlay');
        const btnCloseSearch = document.getElementById('btn-close-search');
        const headerSearchInput = document.getElementById('header-search-input');
        if (btnOpenSearch && searchOverlay && btnCloseSearch) {
            const closeHeaderSearch = () => {
                searchOverlay.classList.remove('active');
                document.body.style.overflow = '';
            };
            btnOpenSearch.addEventListener('click', (e) => {
                e.preventDefault();
                searchOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
                setTimeout(() => headerSearchInput?.focus(), 100);
            });
            btnCloseSearch.addEventListener('click', closeHeaderSearch);
            searchOverlay.addEventListener('click', (e) => {
                if (e.target === searchOverlay) closeHeaderSearch();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && searchOverlay.classList.contains('active')) {
                    closeHeaderSearch();
                }
            });
        }

        // Khởi tạo nút cuộn lên đầu trang
        setupScrollToTop();

        // Khởi tạo hiệu ứng Header trong suốt khi ở đầu trang
        setupHeaderScroll();

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
        const cacheBuster = `?v=${new Date().getTime()}`;
        const [h, f] = await Promise.all([
            fetch(`${pathPrefix}components/header.html${cacheBuster}`),
            fetch(`${pathPrefix}components/footer.html${cacheBuster}`)
        ]);

        const fixPaths = (html) => {
            // Tự động điều chỉnh đường dẫn dựa trên vị trí trang
            return html
                .replace(/src="Asset\//g, `src="${pathPrefix}Asset/`)
                .replace(/href="\.\/"/g, `href="${pathPrefix}"`)
                .replace(/href="products\//g, `href="${pathPrefix}products/`)
                .replace(/href="collections\//g, `href="${pathPrefix}collections/`)
                .replace(/href="about\//g, `href="${pathPrefix}about/`)
                .replace(/href="membership\//g, `href="${pathPrefix}membership/`)
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

            // Tự động thêm class active cho link đang mở
            const currentPath = window.location.pathname;
            const links = document.querySelectorAll('.nav-links .nav-item');
            links.forEach(link => {
                const href = link.getAttribute('href');
                // Nếu path hiện tại chứa href của link (và href không phải là trang chủ)
                if (href !== './' && currentPath.includes(href.replace('../', ''))) {
                    link.classList.add('active');
                }
            });

            // Kích hoạt menu mobile sau khi load xong HTML
            const menuToggle = document.getElementById('menu-toggle');
            const bottomMenuToggle = document.getElementById('mobile-bottom-menu-btn');
            const navLinks = document.getElementById('nav-links');

            if (navLinks) {
                const toggleMenu = () => {
                    const isActive = navLinks.classList.toggle('active');
                    if (menuToggle) menuToggle.classList.toggle('active', isActive);
                    if (bottomMenuToggle) bottomMenuToggle.classList.toggle('active', isActive);
                    document.body.classList.toggle('menu-open', isActive);
                };

                if (menuToggle) menuToggle.onclick = toggleMenu;
                if (bottomMenuToggle) bottomMenuToggle.onclick = toggleMenu;

                // Đóng menu khi click ra ngoài hoặc vào link
                document.addEventListener('click', (e) => {
                    if (navLinks.classList.contains('active') && !navLinks.contains(e.target) && 
                        (!menuToggle || !menuToggle.contains(e.target)) &&
                        (!bottomMenuToggle || !bottomMenuToggle.contains(e.target))) {
                        navLinks.classList.remove('active');
                        if (menuToggle) menuToggle.classList.remove('active');
                        if (bottomMenuToggle) bottomMenuToggle.classList.remove('active');
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

        // Bước 2: Tải và chèn nội dung Footer vào placeholder
        if (f.ok) {
            const footerHTML = fixPaths(await f.text());
            const footerPlaceholder = document.getElementById('footer-placeholder');
            if (footerPlaceholder) {
                footerPlaceholder.innerHTML = footerHTML;
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

            // Render Header Mega Menu Categories
            const megaMenuContainer = document.getElementById('mega-menu-categories');
            if (megaMenuContainer) {
                megaMenuContainer.innerHTML = dynamicCategories.map(group => `
                    <div class="mega-col">
                        <a href="${pathPrefix}products/?category=${encodeURIComponent(group.name)}" class="mega-group-link">
                            <h4>${group.name}</h4>
                        </a>
                        ${group.subs.map(sub => `
                            <a href="${pathPrefix}products/?category=${encodeURIComponent(sub)}">${sub}</a>
                        `).join('')}
                    </div>
                `).join('');
            }
        });
    } catch (err) {
        console.error("Lỗi tải components:", err);
    }
}

// 12. Logic: Quản lý Cooldown gửi OTP (Tránh spam SMS)
export function getOtpCooldown(key, durationSeconds = 60) {
    const lastSent = localStorage.getItem(key);
    if (!lastSent) return 0;
    const diff = Math.floor((Date.now() - parseInt(lastSent, 10)) / 1000);
    return Math.max(0, durationSeconds - diff);
}

export function saveOtpTimestamp(key) {
    localStorage.setItem(key, Date.now().toString());
}

export function startOtpCountdown(btn, key, duration = 60) {
    if (!btn) return;
    const originalText = btn.dataset.originalText || btn.innerText;
    if (!btn.dataset.originalText) btn.dataset.originalText = originalText;

    const update = () => {
        const cooldown = getOtpCooldown(key, duration);
        if (cooldown > 0) {
            btn.disabled = true;
            btn.innerText = `Gửi lại sau ${cooldown}s`;
            return true;
        } else {
            btn.disabled = false;
            btn.innerText = btn.dataset.originalText;
            return false;
        }
    };

    if (update()) {
        const interval = setInterval(() => {
            if (!update()) clearInterval(interval);
        }, 1000);
    }
}

// 13. Logic: Giao diện OTP 6 ô vuông
export function setupOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('.otp-digit');
    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (!/^\d*$/.test(e.target.value)) { e.target.value = ''; return; }
            if (e.target.value && index < inputs.length - 1) { inputs[index + 1].focus(); }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) { inputs[index - 1].focus(); }
        });
        input.addEventListener('paste', (e) => {
            const data = e.clipboardData.getData('text').trim().slice(0, 6);
            if (/^\d+$/.test(data)) {
                data.split('').forEach((char, i) => {
                    if (inputs[i]) inputs[i].value = char;
                });
                const nextFocus = Math.min(data.length, inputs.length - 1);
                inputs[nextFocus].focus();
            }
            e.preventDefault();
        });
    });
}

export function getOtpValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return '';
    return Array.from(container.querySelectorAll('.otp-digit')).map(i => i.value).join('');
}

// 14. Logic: Realtime Presence
export function initPresence() {
    if (!rtdb) return;
    const connectedRef = ref(rtdb, '.info/connected');
    
    // Tạo sessionId duy nhất cho mỗi tab/trình duyệt
    let sessionId = sessionStorage.getItem('tng_session_id');
    if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        sessionStorage.setItem('tng_session_id', sessionId);
    }
    const myConnectionsRef = ref(rtdb, `presence/${sessionId}`);
    
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // Khi kết nối, đăng ký xoá khi mất kết nối
            onDisconnect(myConnectionsRef).remove().then(() => {
                // Sau khi đăng ký onDisconnect thành công, mới ghi dữ liệu online
                set(myConnectionsRef, {
                    online: true,
                    lastChanged: rtdbServerTimestamp()
                });
            });
        }
    });
}

// Tự động khởi chạy khi load utils
initPresence();