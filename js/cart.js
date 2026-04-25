import { 
    db, auth, loginWithGoogle, logout, updateCartCount, loadSharedComponents 
} from "./utils.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Logic xử lý giỏ hàng ---

async function renderCart() {
    let cart = [];
    if (auth.currentUser) {
        const snap = await getDoc(doc(db, "carts", auth.currentUser.uid));
        if (snap.exists()) cart = snap.data().items || [];
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    const cartItemsContainer = document.getElementById('cart-items');
    const emptyMsg = document.getElementById('empty-cart-msg');
    const cartGrid = document.getElementById('cart-content');
    const totalPriceEl = document.getElementById('total-price');

    if (cart.length === 0) {
        cartGrid.style.display = 'none';
        emptyMsg.style.display = 'block';
        return;
    }

    cartGrid.style.display = 'block';
    emptyMsg.style.display = 'none';

    let total = 0;
    cartItemsContainer.innerHTML = cart.map((item, index) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        return `
            <div class="cart-item">
                <div class="item-info">
                    <img src="${item.image}" alt="${item.name}">
                    <div>
                        <h4>${item.name}</h4>
                    </div>
                </div>
                <div class="item-price">${new Intl.NumberFormat('vi-VN').format(item.price)}đ</div>
                <div class="item-quantity">
                    <div class="quantity-controls">
                        <button class="q-btn" onclick="changeQty(${index}, -1)">-</button>
                        <input type="number" value="${item.quantity}" readonly>
                        <button class="q-btn" onclick="changeQty(${index}, 1)">+</button>
                    </div>
                </div>
                <div class="item-subtotal">${new Intl.NumberFormat('vi-VN').format(subtotal)}đ</div>
                <div class="item-remove">
                    <button onclick="removeItem(${index})" title="Xóa">&times;</button>
                </div>
            </div>
        `;
    }).join('');

    totalPriceEl.innerText = new Intl.NumberFormat('vi-VN').format(total) + 'đ';
}

// Đưa các hàm ra phạm vi window để gọi được từ HTML (do dùng type="module")
window.changeQty = async (index, delta) => {
    let cart = [];
    if (auth.currentUser) {
        const snap = await getDoc(doc(db, "carts", auth.currentUser.uid));
        cart = snap.data().items;
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    cart[index].quantity += delta;
    if (cart[index].quantity < 1) cart[index].quantity = 1;

    if (auth.currentUser) {
        await setDoc(doc(db, "carts", auth.currentUser.uid), { items: cart });
    } else {
        localStorage.setItem('cart', JSON.stringify(cart));
    }
    renderCart();
    updateCartCount();
};

window.removeItem = async (index) => {
    if (confirm("Xóa sản phẩm này khỏi giỏ hàng?")) {
        let cart = [];
        if (auth.currentUser) {
            const snap = await getDoc(doc(db, "carts", auth.currentUser.uid));
            cart = snap.data().items;
        } else {
            cart = JSON.parse(localStorage.getItem('cart')) || [];
        }

        cart.splice(index, 1);
        if (auth.currentUser) await setDoc(doc(db, "carts", auth.currentUser.uid), { items: cart });
        else localStorage.setItem('cart', JSON.stringify(cart));

        renderCart();
        updateCartCount();
    }
};

// --- Đồng bộ Header/Auth ---

function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const authSection = document.getElementById('auth-section');
        const navLinks = document.querySelector('.nav-links');

        // Xóa các nút cũ để reset giao diện
        const existingAdminLink = document.getElementById('admin-link');
        if (existingAdminLink) existingAdminLink.remove();

        if (authSection) {
            if (user) {
                // Sync logic
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
                renderCart();
                updateCartCount();

                authSection.innerHTML = `
                    <a href="../profile/" class="user-info-link">Chào, ${user.displayName || user.email.split('@')[0]}!</a>
                    <button id="btn-logout" class="btn-minimal">Đăng xuất</button>
                `;
                document.getElementById('btn-logout').addEventListener('click', logout);
            } else {
                authSection.innerHTML = `
                    <button id="btn-login" class="btn-minimal">Đăng nhập</button>
                `;
                document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, googleProvider));
            }
        }
    });
}

async function loadCartComponents() {
    try {
        const [h, f] = await Promise.all([
            fetch('../components/header.html'),
            fetch('../components/footer.html')
        ]);
        const fixPaths = (html) => {
            return html
                .replace(/src="Asset\//g, 'src="../Asset/')
                .replace(/href="\.\/"/g, 'href="../"')
                .replace(/href="products\/"/g, 'href="../products/"') // Trang này là cart, products ở ngoài 1 cấp
                .replace(/href="cart\/"/g, 'href="../cart/"')
                .replace(/href="profile\/"/g, 'href="../profile/"')
                .replace(/href="favorites\/"/g, 'href="../profile/"');
        };
        if (h.ok) {
            document.getElementById('header-placeholder').innerHTML = fixPaths(await h.text());
            setupAuthListener();
            updateCartCount();
        }
        if (f.ok) document.getElementById('footer-placeholder').innerHTML = fixPaths(await f.text());
    } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCartComponents();
    renderCart();
});