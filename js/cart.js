import { 
    db, auth, initHeader, updateCartCount, showToast
} from "./utils.js";
import { 
    doc, getDoc, setDoc, collection, addDoc, serverTimestamp, updateDoc, increment,
    query, where, getDocs, limit, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Logic xử lý giỏ hàng ---

let appliedCoupon = null; // { code: '...', type: 'percent'|'fixed', value: 10 }

async function renderCart() {
    let cart = [];
    if (auth.currentUser) {
        const snap = await getDoc(doc(db, "carts", auth.currentUser.uid));
        if (snap.exists()) cart = snap.data().items || [];
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    const cartItemsContainer = document.getElementById('cart-items-summary');
    const checkoutFormContainer = document.getElementById('checkout-form-container');
    const emptyMsg = document.getElementById('empty-cart-msg');
    const cartGrid = document.getElementById('cart-content');
    const priceBreakdownEl = document.getElementById('price-breakdown');

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
            <div class="summary-item">
                <img src="${item.image}" alt="${item.name}" class="summary-item-img">
                <div class="summary-item-details">
                    <h4>${item.name}</h4>
                    <p class="summary-item-variant">${item.variant || 'Mặc định'}</p>
                    <div class="quantity-controls">
                        <button class="q-btn" onclick="changeQty(${index}, -1)">-</button>
                        <span class="qty-value">${item.quantity}</span>
                        <button class="q-btn" onclick="changeQty(${index}, 1)">+</button>
                    </div>
                </div>
                <div class="summary-item-price">
                    <p>${new Intl.NumberFormat('vi-VN').format(subtotal)}đ</p>
                    <button class="btn-remove-small" onclick="removeItem(${index})">Xóa</button>
                </div>
            </div>
        `;
    }).join('');

    let discountAmount = 0;
    if (appliedCoupon) {
        discountAmount = appliedCoupon.type === 'percent' ? (total * appliedCoupon.value / 100) : appliedCoupon.value;
    }
    
    // Phí ship: 30k nếu giao tận nơi, 0đ nếu nhận tại tiệm
    const shippingMethod = document.querySelector('input[name="shipping-method"]:checked')?.value || 'delivery';
    const shippingFee = shippingMethod === 'pickup' ? 0 : 30000;
    
    const finalTotal = Math.max(0, total + shippingFee - discountAmount);

    priceBreakdownEl.innerHTML = `
        <div class="price-row"><span>Tạm tính (Gồm VAT)</span><span>${new Intl.NumberFormat('vi-VN').format(total)}đ</span></div>
        <div class="price-row"><span>Phí vận chuyển</span><span>${new Intl.NumberFormat('vi-VN').format(shippingFee)}đ</span></div>
        ${discountAmount > 0 ? `<div class="price-row discount"><span>Discount</span><span>-${new Intl.NumberFormat('vi-VN').format(discountAmount)}đ</span></div>` : ''}
        <div class="price-row total"><span>Total</span><span>${new Intl.NumberFormat('vi-VN').format(finalTotal)}đ</span></div>
    `;

    if (checkoutFormContainer) {
        renderCheckoutForm(checkoutFormContainer);
        fetchAvailableCoupons();
    }
}

function renderCheckoutForm(container) {
    // Kiểm tra xem một phần tử đặc trưng của form đã tồn tại chưa thay vì kiểm tra innerHTML
    if (document.getElementById('shipping-name')) return; 
    
    container.innerHTML = `
        <div class="checkout-section">
            <h3 class="checkout-title">Billing information | Thông tin thanh toán</h3>
            <div class="form-row">
                <div class="form-group"><label>Full Name *</label><input type="text" id="shipping-name" required></div>
                <div class="form-group"><label>Email Address</label><input type="email" id="shipping-email"></div>
            </div>
            <div class="form-group"><label>Phone Number *</label><input type="tel" id="shipping-phone" required></div>
            <div class="form-group"><label>Shipping Address | Địa chỉ nhận hàng *</label><input type="text" id="shipping-address" required></div>
            <div class="form-group"><label>Order Note</label><textarea id="order-note" rows="3"></textarea></div>
            
            <div class="form-group">
                <label>Delivery Method | Phương thức nhận hàng</label>
                <div class="radio-group">
                    <label class="radio-container">Giao hàng tận nơi
                        <input type="radio" name="shipping-method" value="delivery" checked>
                        <span class="radio-checkmark"></span>
                    </label>
                    <label class="radio-container">Nhận tại cửa hàng
                        <input type="radio" name="shipping-method" value="pickup">
                        <span class="radio-checkmark"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="checkout-section">
            <h3 class="checkout-title">Payment method | Thanh toán</h3>
            <div class="radio-group">
                <label class="radio-container">Cash on Delivery ( COD )
                    <input type="radio" name="payment-method" value="COD" checked>
                    <span class="radio-checkmark"></span>
                </label>
                <label class="radio-container">Bank transfer | Chuyển khoản
                    <input type="radio" name="payment-method" value="bank_transfer">
                    <span class="radio-checkmark"></span>
                </label>
            </div>
        </div>
    `;

    // Lắng nghe thay đổi để cập nhật phí vận chuyển ngay lập tức
    container.querySelectorAll('input[name="shipping-method"]').forEach(radio => {
        radio.addEventListener('change', renderCart);
    });
}

async function fetchAvailableCoupons() {
    const listContainer = document.getElementById('coupons-list-render');
    if (!listContainer) return;

    try {
        const q = query(collection(db, "coupons"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const validCoupons = [];
        snap.forEach(doc => {
            const data = doc.data();
            const id = doc.id;

            // Kiểm tra hạn sử dụng
            if (data.expiryDate && new Date(data.expiryDate) < today) return;
            // Kiểm tra lượt dùng
            if (data.limit > 0 && (data.usedCount || 0) >= data.limit) return;

            validCoupons.push({ id, ...data });
        });

        if (validCoupons.length === 0) {
            document.getElementById('available-coupons-container').style.display = 'none';
            return;
        }

        listContainer.innerHTML = validCoupons.map(c => {
            const desc = c.type === 'percent' ? `Giảm ${c.value}%` : `Giảm ${new Intl.NumberFormat('vi-VN').format(c.value)}đ`;
            const minOrderDesc = c.minOrder > 0 ? ` cho đơn từ ${new Intl.NumberFormat('vi-VN').format(c.minOrder)}đ` : '';
            const isActive = appliedCoupon && appliedCoupon.code === c.id;

            return `
                <div class="coupon-card ${isActive ? 'active' : ''}" onclick="window.selectCoupon('${c.id}')">
                    <div class="coupon-info">
                        <h5>${c.id}</h5>
                        <p>${desc}${minOrderDesc}</p>
                        ${c.expiryDate ? `<p style="color: #e74c3c; font-size: 0.7rem;">HSD: ${new Date(c.expiryDate).toLocaleDateString('vi-VN')}</p>` : ''}
                    </div>
                    <div class="btn-use-coupon">${isActive ? 'Đang dùng' : 'Dùng ngay'}</div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error("Lỗi tải mã giảm giá:", e); }
}

window.selectCoupon = (code) => {
    const input = document.getElementById('coupon-input');
    if (input) {
        input.value = code;
        window.applyCoupon();
    }
};

// Đưa các hàm ra phạm vi window để gọi được từ HTML (do dùng type="module")
window.applyCoupon = async () => {
    const input = document.getElementById('coupon-input');
    const code = input.value.trim().toUpperCase();
    
    if (!code) {
        appliedCoupon = null;
        renderCart();
        return;
    }

    try {
        const couponSnap = await getDoc(doc(db, "coupons", code));
        if (couponSnap.exists()) {
            const data = couponSnap.data();
            
            // Lấy subtotal hiện tại của giỏ hàng
            let cart = [];
            if (auth.currentUser) {
                const snap = await getDoc(doc(db, "carts", auth.currentUser.uid));
                cart = snap.data()?.items || [];
            } else {
                cart = JSON.parse(localStorage.getItem('cart')) || [];
            }
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            // Kiểm tra ngày hết hạn
            if (data.expiryDate) {
                const expiry = new Date(data.expiryDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Chỉ so sánh ngày, không so sánh giờ
                if (expiry < today) {
                    showToast("Mã giảm giá này đã hết hạn", "error");
                    appliedCoupon = null;
                    renderCart();
                    return;
                }
            }

            // Kiểm tra giới hạn 1 lần sử dụng cho mỗi khách hàng (Thành viên)
            if (auth.currentUser) {
                const qUsed = query(
                    collection(db, "orders"), 
                    where("userId", "==", auth.currentUser.uid), 
                    where("couponCode", "==", code), 
                    limit(1)
                );
                const usedSnap = await getDocs(qUsed);
                if (!usedSnap.empty) {
                    showToast("Bạn đã sử dụng mã giảm giá này cho một đơn hàng trước đó", "error");
                    appliedCoupon = null;
                    renderCart();
                    return;
                }
            }

            // Kiểm tra giới hạn số lần sử dụng
            if (data.limit > 0 && (data.usedCount || 0) >= data.limit) {
                showToast("Mã giảm giá này đã hết lượt sử dụng", "error");
                appliedCoupon = null;
                renderCart();
                return;
            }

            if (subtotal < data.minOrder) {
                showToast(`Đơn hàng tối thiểu ${new Intl.NumberFormat('vi-VN').format(data.minOrder)}đ để dùng mã này`, "error");
                appliedCoupon = null;
            } else {
                appliedCoupon = { code, ...data };
                showToast(`Đã áp dụng mã giảm giá ${code}`);
            }
        } else {
            showToast("Mã giảm giá không hợp lệ hoặc đã hết hạn", "error");
            appliedCoupon = null;
        }
        renderCart();
        fetchAvailableCoupons(); // Cập nhật lại danh sách để hiện trạng thái active và chạy animation

        // Thêm hiệu ứng nhịp đập cho phần tổng tiền khi giá thay đổi
        const priceEl = document.getElementById('total-price');
        if (priceEl) {
            priceEl.classList.add('heartbeat-anim');
            setTimeout(() => priceEl.classList.remove('heartbeat-anim'), 400);
        }
    } catch (e) {
        showToast("Lỗi hệ thống khi kiểm tra mã", "error");
    }
};

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
    const name = document.getElementById('shipping-name')?.value.trim();
    const phone = document.getElementById('shipping-phone')?.value.trim();
    const email = document.getElementById('shipping-email')?.value.trim();
    const address = document.getElementById('shipping-address')?.value.trim();
    const note = document.getElementById('order-note')?.value.trim();
    const termsAccepted = document.getElementById('terms-agreement')?.checked;
    
    const shippingMethod = document.querySelector('input[name="shipping-method"]:checked')?.value;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;

    if (!name || !phone || !address) {
        showToast("Vui lòng nhập đầy đủ Tên, Số điện thoại và Địa chỉ", "error");
        return;
    }

    if (!termsAccepted) {
        const termsLabel = document.querySelector('.terms-agreement');
        termsLabel.classList.add('heartbeat-anim');
        setTimeout(() => termsLabel.classList.remove('heartbeat-anim'), 400);
        showToast("Vui lòng đồng ý với điều khoản dịch vụ", "error");
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
    let discountAmount = 0;
    if (appliedCoupon) {
        discountAmount = appliedCoupon.type === 'percent' ? (total * appliedCoupon.value / 100) : appliedCoupon.value;
    }

    const shippingFee = shippingMethod === 'pickup' ? 0 : 30000;
    const finalTotal = Math.max(0, total + shippingFee - discountAmount);

    const orderData = {
        userId: auth.currentUser ? auth.currentUser.uid : 'guest',
        productNames: cart.map(item => item.name),
        items: cart,
        totalAmount: finalTotal,
        shippingFee: shippingFee,
        discountAmount: discountAmount,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        status: "Đang xử lý",
        orderDate: serverTimestamp(),
        shippingAddress: {
            fullName: name,
            phone: phone,
            address: address
        },
        shippingMethod: shippingMethod,
        paymentMethod: paymentMethod || "COD"
    };

    try {
        const btn = document.querySelector('.btn-place-order');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-small"></span> Đang xử lý...';

        // 0. Kiểm tra cuối cùng: Mã giảm giá 1 lần sử dụng (Đặc biệt cho khách vãng lai check qua SĐT)
        if (appliedCoupon) {
            const checkField = auth.currentUser ? "userId" : "shippingAddress.phone";
            const checkVal = auth.currentUser ? auth.currentUser.uid : phone;
            
            const qReCheck = query(
                collection(db, "orders"),
                where(checkField, "==", checkVal),
                where("couponCode", "==", appliedCoupon.code),
                limit(1)
            );
            const reCheckSnap = await getDocs(qReCheck);
            if (!reCheckSnap.empty) {
                showToast("Mã giảm giá này chỉ được sử dụng một lần duy nhất cho mỗi khách hàng", "error");
                btn.disabled = false;
                btn.innerHTML = "Xác nhận đặt hàng";
                return;
            }
        }

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

        // 3. Cập nhật lượt dùng mã giảm giá (nếu có áp dụng)
        if (appliedCoupon) {
            const couponRef = doc(db, "coupons", appliedCoupon.code);
            await updateDoc(couponRef, {
                usedCount: increment(1)
            });
        }

        // 2. Xóa giỏ hàng sau khi đặt thành công
        if (auth.currentUser) {
            await setDoc(doc(db, "carts", auth.currentUser.uid), { items: [] });
        } else {
            localStorage.removeItem('cart');
        }

        showToast("Đặt hàng thành công!");
        updateCartCount();

        setTimeout(() => {
            window.location.href = `thank-you.html?id=${docRef.id}`;
        }, 1500);
    } catch (error) {
        showToast("Lỗi đặt hàng: " + error.message, "error");
        console.error(error);
    }
};


document.addEventListener('DOMContentLoaded', () => {
    // Bảo mật: Ngăn chặn index trang giỏ hàng và thanh toán
    let robotsTag = document.querySelector('meta[name="robots"]');
    if (!robotsTag) {
        robotsTag = document.createElement('meta');
        robotsTag.setAttribute('name', 'robots');
        document.head.appendChild(robotsTag);
    }
    robotsTag.setAttribute('content', 'noindex, nofollow');

    initHeader('../', (user) => {
        renderCart();

        // Thêm sự kiện nhấn Enter cho ô nhập mã giảm giá
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && document.activeElement.id === 'coupon-input') {
                window.applyCoupon();
            }
        });
    });
});