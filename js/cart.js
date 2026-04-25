import { 
    db, auth, initHeader, updateCartCount, showToast
} from "./utils.js";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

    // Hiển thị Form thông tin giao hàng nếu chưa có
    renderCheckoutForm();
}

function renderCheckoutForm() {
    const cartFooter = document.querySelector('.cart-footer');
    if (!cartFooter || document.getElementById('checkout-form')) return;

    const formHtml = `
        <div id="checkout-form" style="margin-top: 3rem; border-top: 1px dashed #ddd; padding-top: 2rem; width: 100%;">
            <h3 style="font-family: var(--font-serif); margin-bottom: 1.5rem;">Thông tin giao hàng</h3>
            <div class="form-group">
                <label>Họ và tên người nhận</label>
                <input type="text" id="shipping-name" placeholder="Nhập họ tên đầy đủ" required>
            </div>
            <div class="form-group">
                <label>Số điện thoại</label>
                <input type="tel" id="shipping-phone" placeholder="Nhập số điện thoại liên lạc" required>
            </div>
            <div class="form-group">
                <label>Địa chỉ nhận hàng</label>
                <textarea id="shipping-address" rows="3" placeholder="Số nhà, tên đường, phường/xã, quận/huyện..." required></textarea>
            </div>
            <div style="margin: 1.5rem 0; padding: 1rem; background: #fdfdfd; border: 1px solid #eee; border-radius: 4px;">
                <p style="font-size: 0.9rem;"><strong>Phương thức thanh toán:</strong> Thanh toán khi nhận hàng (COD)</p>
            </div>
            <button onclick="placeOrder()" class="btn-dark" style="width: 100%; height: 50px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Xác nhận đặt hàng</button>
        </div>
    `;
    cartFooter.insertAdjacentHTML('beforebegin', formHtml);
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

window.placeOrder = async () => {
    const name = document.getElementById('shipping-name').value.trim();
    const phone = document.getElementById('shipping-phone').value.trim();
    const address = document.getElementById('shipping-address').value.trim();

    if (!name || !phone || !address) {
        showToast("Vui lòng điền đầy đủ thông tin giao hàng", "error");
        return;
    }

    let cart = [];
    if (auth.currentUser) {
        const snap = await getDoc(doc(db, "carts", auth.currentUser.uid));
        cart = snap.data().items;
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderData = {
        userId: auth.currentUser ? auth.currentUser.uid : 'guest',
        productNames: cart.map(item => item.name), // Thêm mảng tên sản phẩm để dễ tìm kiếm
        items: cart,
        totalAmount: total,
        status: "Đang xử lý",
        orderDate: serverTimestamp(),
        shippingAddress: {
            fullName: name,
            phone: phone,
            address: address
        },
        paymentMethod: "COD"
    };

    try {
        const btn = document.querySelector('#checkout-form button');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-small"></span> Đang xử lý...';

        // 1. Lưu đơn hàng vào Firestore (Dành cho Admin quản lý)
        const docRef = await addDoc(collection(db, "orders"), orderData);
        
        // 2. Cập nhật tồn kho và số lượng đã bán của sản phẩm
        const updatePromises = cart.map(item => {
            const productRef = doc(db, "products", item.id);
            return updateDoc(productRef, {
                stock: increment(-item.quantity), // Giảm tồn kho
                sold: increment(item.quantity)    // Tăng số lượng đã bán
            });
        });
        await Promise.all(updatePromises);

        // 3. Gửi thông báo qua Zalo (Copy thông tin và redirect)
        sendOrderToZalo(docRef.id, cart, total, orderData.shippingAddress);

        // 3. Xóa giỏ hàng sau khi đặt thành công
        if (auth.currentUser) {
            await setDoc(doc(db, "carts", auth.currentUser.uid), { items: [] });
        } else {
            localStorage.removeItem('cart');
        }

        showToast("Đặt hàng thành công!");
        updateCartCount();

        setTimeout(() => {
            window.location.href = auth.currentUser ? '../profile/#orders' : '../';
        }, 2000);
    } catch (error) {
        showToast("Lỗi đặt hàng: " + error.message, "error");
        console.error(error);
    }
};

function sendOrderToZalo(orderId, items, total, address) {
    const shopPhone = "0901234567"; // Thay bằng SĐT Zalo thật của shop bạn
    let msg = `*ĐƠN HÀNG MỚI: #${orderId}*\n`;
    msg += `👤 Khách hàng: ${address.fullName}\n`;
    msg += `📞 Số điện thoại: ${address.phone}\n`;
    msg += `📍 Địa chỉ: ${address.address}\n`;
    msg += `📦 Danh sách sản phẩm:\n`;
    items.forEach(item => { msg += `- ${item.name} x ${item.quantity}\n`; });
    msg += `💰 *Tổng thanh toán: ${new Intl.NumberFormat('vi-VN').format(total)}đ*`;
    msg += `\n*Phương thức: COD*`;
    
    // Copy vào clipboard và mở Zalo để khách gửi cho shop
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(() => {
            showToast("Đã copy chi tiết đơn hàng! Vui lòng gửi cho shop qua Zalo để xác nhận.");
            setTimeout(() => window.open(`https://zalo.me/${shopPhone}`, '_blank'), 1500);
        });
    } else {
        window.open(`https://zalo.me/${shopPhone}`, '_blank');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', (user) => {
        renderCart();
    });
});