import { 
    db, auth, initHeader, updateCartCount, showToast
} from "./utils.js";
import { 
    doc, getDoc, setDoc, collection, addDoc, serverTimestamp, updateDoc, increment,
    query, where, getDocs, limit 
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

    // Tính toán giảm giá
    let discountAmount = 0;
    if (appliedCoupon) {
        discountAmount = appliedCoupon.type === 'percent' ? (total * appliedCoupon.value / 100) : appliedCoupon.value;
    }
    const finalTotal = Math.max(0, total - discountAmount);

    totalPriceEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: flex-end;">
            ${discountAmount > 0 ? `<span style="font-size: 0.9rem; color: #888; text-decoration: line-through; font-weight: 400; margin-bottom: 2px;">${new Intl.NumberFormat('vi-VN').format(total)}đ</span>` : ''}
            ${discountAmount > 0 ? `<span style="font-size: 0.9rem; color: #27ae60; font-weight: 600; margin-bottom: 8px;">Tiết kiệm: -${new Intl.NumberFormat('vi-VN').format(discountAmount)}đ</span>` : ''}
            <span style="display: block;">${new Intl.NumberFormat('vi-VN').format(finalTotal)}đ</span>
        </div>
    `;

    // Hiển thị Form thông tin giao hàng nếu chưa có
    renderCheckoutForm();
}

function renderCheckoutForm() {
    const cartFooter = document.querySelector('.cart-footer');
    if (!cartFooter || document.getElementById('checkout-form')) return;

    const formHtml = `
        <div id="checkout-form" style="margin-top: 3rem; border-top: 1px dashed #ddd; padding-top: 2rem; width: 100%;">
            <div id="available-coupons-container">
                <h4 style="font-family: var(--font-serif); margin-bottom: 1rem; font-size: 0.9rem; text-transform: uppercase; color: #888;">Ưu đãi dành cho bạn</h4>
                <div class="available-coupons" id="coupons-list-render">
                    <!-- Danh sách coupon sẽ render tại đây -->
                </div>
            </div>

            <div style="display: flex; gap: 10px; align-items: flex-end; margin-bottom: 2.5rem; max-width: 400px;">
                <div style="flex: 1;">
                    <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase; color: #888;">Mã ưu đãi</label>
                    <input type="text" id="coupon-input" placeholder="TIEMNHAGOM10, CHAOBAN..." value="${appliedCoupon ? appliedCoupon.code : ''}" 
                           style="width: 100%; padding: 0.8rem; border: 1px solid #ddd; border-radius: 4px; font-family: inherit;">
                </div>
                <button onclick="applyCoupon()" class="btn-minimal" style="height: 46px; white-space: nowrap; padding: 0 1.5rem;">Áp dụng</button>
            </div>

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
    fetchAvailableCoupons();
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
    let discountAmount = 0;
    if (appliedCoupon) {
        discountAmount = appliedCoupon.type === 'percent' ? (total * appliedCoupon.value / 100) : appliedCoupon.value;
    }
    const finalTotal = Math.max(0, total - discountAmount);

    const orderData = {
        userId: auth.currentUser ? auth.currentUser.uid : 'guest',
        productNames: cart.map(item => item.name), // Thêm mảng tên sản phẩm để dễ tìm kiếm
        items: cart,
        totalAmount: finalTotal,
        discountAmount: discountAmount,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
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

        // 3. Gửi thông báo qua Zalo (Copy thông tin và redirect)
        sendOrderToZalo(docRef.id, cart, finalTotal, orderData.shippingAddress, discountAmount);

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

function sendOrderToZalo(orderId, items, total, address, discount = 0) {
    const shopPhone = "0901234567"; // Thay bằng SĐT Zalo thật của shop bạn
    let msg = `*ĐƠN HÀNG MỚI: #${orderId}*\n`;
    msg += `👤 Khách hàng: ${address.fullName}\n`;
    msg += `📞 Số điện thoại: ${address.phone}\n`;
    msg += `📍 Địa chỉ: ${address.address}\n`;
    msg += `📦 Danh sách sản phẩm:\n`;
    items.forEach(item => { msg += `- ${item.name} x ${item.quantity}\n`; });
    if (discount > 0) msg += `📉 Giảm giá: -${new Intl.NumberFormat('vi-VN').format(discount)}đ\n`;
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