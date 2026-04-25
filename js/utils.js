import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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

        if (h.ok) document.getElementById('header-placeholder').innerHTML = fixPaths(await h.text());
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