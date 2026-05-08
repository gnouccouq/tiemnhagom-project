import { 
    db, auth, initHeader, updateCartCount, showToast
} from "./utils.js";
import {
    doc, getDoc, setDoc, collection, addDoc, serverTimestamp, updateDoc, increment, runTransaction,
    query, where, getDocs, limit, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Logic xử lý giỏ hàng ---

// API Endpoints
const PROVINCES_API_URL = "https://production.cas.so/address-kit/2025-07-01/provinces";
const COMMUNES_API_URL = "https://production.cas.so/address-kit/2025-07-01/communes";

let appliedCoupon = null; // { code: '...', type: 'percent'|'fixed', value: 10 }

// Cache for location data to avoid repeated API calls
let cachedProvinces = [];
let cachedCommunes = {}; // { provinceId: [commune1, commune2, ...] }

// Hàm hỗ trợ tính phí ship dựa trên phương thức và tỉnh thành
function calculateShippingFee(method, provinceName) { // Changed parameter name to provinceName
    if (method === 'pickup') return 0;
    if (!provinceName) return 30000; // Phí mặc định khi chưa chọn tỉnh
    
    const innerCities = ["Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ", "Hải Phòng"]; // Expanded inner cities
    if (innerCities.includes(provinceName)) return 30000; // Phí nội thành
    return 40000; // Phí đi tỉnh
}

// Function to fetch provinces from API
async function fetchProvinces() {
    if (cachedProvinces.length > 0) {
        return cachedProvinces;
    }
    try {
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        const response = await fetch(proxyUrl + encodeURIComponent(PROVINCES_API_URL));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        cachedProvinces = data;
        return data;
    } catch (error) {
        console.error("Error fetching provinces:", error);
        showToast("Không thể tải danh sách tỉnh thành. Vui lòng thử lại.", "error");
        return [];
    }
}

// Function to fetch communes by province ID from API
async function fetchCommunesByProvinceId(provinceId) {
    if (cachedCommunes[provinceId]) {
        return cachedCommunes[provinceId];
    }
    try {
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        const targetUrl = `${COMMUNES_API_URL}?provinceId=${provinceId}`;
        const response = await fetch(proxyUrl + encodeURIComponent(targetUrl));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        cachedCommunes[provinceId] = data;
        return data;
    } catch (error) {
        console.error(`Error fetching communes for province ${provinceId}:`, error);
        showToast("Không thể tải danh sách phường/xã. Vui lòng thử lại.", "error");
        return [];
    }
}

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
                        <button class="q-btn" onclick="window.changeQty(${index}, -1)">-</button>
                        <span class="qty-value">${item.quantity}</span>
                        <button class="q-btn" onclick="window.changeQty(${index}, 1)">+</button>
                    </div>
                </div>
                <div class="summary-item-price">
                    <p>${new Intl.NumberFormat('vi-VN').format(subtotal)}đ</p>
                    <button class="btn-remove-small" onclick="window.removeItem(${index})">Xóa</button>
                </div>
            </div>
        `;
    }).join('');

    let discountAmount = 0;
    if (appliedCoupon) {
        discountAmount = appliedCoupon.type === 'percent' ? (total * appliedCoupon.value / 100) : appliedCoupon.value;
    }
    
    const shippingMethod = document.querySelector('input[name="shipping-method"]:checked')?.value || 'delivery';
    const selectedProvinceOption = document.getElementById('shipping-province')?.options[document.getElementById('shipping-province').selectedIndex];
    const selectedProvinceName = selectedProvinceOption ? selectedProvinceOption.textContent : null; // Get name for shipping fee calculation
    
    const shippingFee = calculateShippingFee(shippingMethod, selectedProvinceName); // Pass name
    
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

async function renderCheckoutForm(container) {
    // Kiểm tra xem một phần tử đặc trưng của form đã tồn tại chưa thay vì kiểm tra innerHTML
    if (document.getElementById('shipping-name')) return; 
    
    // Lấy thông tin user hiện tại nếu có login để auto-fill
    let userData = { displayName: '', email: '', phone: '' };
    if (auth.currentUser) {
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userSnap.exists()) {
            const d = userSnap.data();
            userData = {
                displayName: auth.currentUser.displayName || d.displayName || '',
                email: auth.currentUser.email || d.email || '',
                phone: d.phone || auth.currentUser.phoneNumber || ''
            };
        }
    }

    container.innerHTML = `
        <div class="checkout-section">
            <h3 class="checkout-title">Billing information | Thông tin thanh toán</h3>
            <div class="form-row">
                <div class="form-group"><label>Full Name *</label><input type="text" id="shipping-name" value="${userData.displayName}" required></div>
                <div class="form-group"><label>Email Address</label><input type="email" id="shipping-email" value="${userData.email}"></div>
            </div>
            <div class="form-group"><label>Phone Number *</label><input type="tel" id="shipping-phone" value="${userData.phone}" required></div>
            <div class="form-group">
                <label>Province / City | Tỉnh thành *</label>
                <select id="shipping-province" required>
                    <option value="">-- Chọn tỉnh thành --</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Ward | Phường / Xã *</label>
                    <select id="shipping-ward" required disabled>
                        <option value="">-- Chọn Phường/Xã --</option>
                    </select>
                </div>
            </div>
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
            <div id="bank-transfer-info" style="display: none; margin-top: 15px; padding: 15px; background: #fcfbf8; border: 1px dashed #ccc; border-radius: 4px; font-size: 0.85rem;">
                <p><strong>💡 Lưu ý:</strong> Mã QR thanh toán kèm <strong>đúng số tiền</strong> và <strong>nội dung chuyển khoản</strong> sẽ hiển thị sau khi bạn nhấn nút "Đặt hàng".</p>
            </div>
        </div>
    `;

    // Lắng nghe thay đổi để cập nhật phí vận chuyển ngay lập tức
    container.querySelectorAll('input[name="shipping-method"]').forEach(radio => {
        radio.addEventListener('change', renderCart);
    });

    const provinceSelect = document.getElementById('shipping-province');
    const wardSelect = document.getElementById('shipping-ward');

    // Populate provinces
    provinceSelect.innerHTML = '<option value="">-- Đang tải tỉnh thành --</option>';
    const provinces = await fetchProvinces();
    provinceSelect.innerHTML = '<option value="">-- Chọn tỉnh thành --</option>';
    provinces.forEach(p => {
        provinceSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    // Logic xử lý chọn Tỉnh -> Hiện Phường/Xã
    provinceSelect?.addEventListener('change', async (e) => {
        const provinceId = e.target.value;
        wardSelect.innerHTML = '<option value="">-- Đang tải Phường/Xã --</option>';
        wardSelect.disabled = true;

        if (provinceId) {
            const communes = await fetchCommunesByProvinceId(provinceId);
            wardSelect.innerHTML = '<option value="">-- Chọn Phường/Xã --</option>';
            communes.forEach(c => {
                wardSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
            });
            wardSelect.disabled = false;
        } else {
            wardSelect.innerHTML = '<option value="">-- Chọn Phường/Xã --</option>';
        }
        renderCart(); // Cập nhật phí ship
    });

    // Lắng nghe thay đổi phương thức thanh toán để hiện thông báo bank transfer
    container.querySelectorAll('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const infoBox = document.getElementById('bank-transfer-info');
            if (infoBox) infoBox.style.display = e.target.value === 'bank_transfer' ? 'block' : 'none';
        });
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
        cart = snap.exists() ? (snap.data().items || []) : [];
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
            cart = snap.exists() ? (snap.data().items || []) : [];
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
    
    const provinceSelect = document.getElementById('shipping-province');
    const provinceId = provinceSelect?.value;
    const provinceName = provinceSelect?.options[provinceSelect.selectedIndex]?.textContent;

    const wardSelect = document.getElementById('shipping-ward');
    const wardId = wardSelect?.value;
    const wardName = wardSelect?.options[wardSelect.selectedIndex]?.textContent;

    const address = document.getElementById('shipping-address')?.value.trim();
    const note = document.getElementById('order-note')?.value.trim();
    const termsAccepted = document.getElementById('terms-agreement')?.checked;
    
    const shippingMethod = document.querySelector('input[name="shipping-method"]:checked')?.value;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;

    if (!name || !phone || !address || !provinceId || !wardId) { // Check for IDs now
        showToast("Vui lòng nhập đầy đủ thông tin giao hàng", "error");
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

    const shippingFee = calculateShippingFee(shippingMethod, provinceName); // Pass name
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
            email: email, // Added email to shipping address
            provinceId: provinceId, // Store ID
            province: provinceName, // Store Name
            wardId: wardId, // Store ID
            ward: wardName, // Store Name
            address: `${address}, ${wardName}, ${provinceName}` // Full address string
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
                showToast("Mã giảm giá này chỉ được sử dụng một lần duy nhất cho mỗi khách hàng.", "error");
                btn.disabled = false;
                btn.innerHTML = "Đặt hàng ngay";
                return;
            }
        }

        // 1. Thực hiện Transaction để đảm bảo trừ kho và tạo đơn đồng thời
        const orderId = await runTransaction(db, async (transaction) => {
            const newOrderRef = doc(collection(db, "orders")); // Tạo reference mới cho đơn hàng

            let finalSubtotal = 0;
            const processedOrderItems = [];
            const productNames = [];

            // Duyệt qua từng item trong giỏ hàng để lấy giá THẬT và kiểm tra tồn kho
            for (const item of cart) {
                const productRef = doc(db, "products", item.id);
                const productSnap = await transaction.get(productRef);

                if (!productSnap.exists()) {
                    throw new Error(`Sản phẩm ID ${item.id} không tồn tại.`);
                }

                const product = productSnap.data();
                let currentStock = product.stock || 0;
                let variantImage = product.imageUrl;

                // Kiểm tra tồn kho biến thể màu sắc
                if (item.color && Array.isArray(product.colorVariants)) {
                    const variant = product.colorVariants.find(v => v.name === item.color);
                    if (!variant) throw new Error(`Biến thể màu "${item.color}" của sản phẩm ${product.name} không tồn tại.`);
                    currentStock = variant.stock || 0;
                    if (variant.imageUrl) variantImage = variant.imageUrl;
                }
                // Kiểm tra tồn kho biến thể họa tiết
                if (item.pattern && Array.isArray(product.patternVariants)) {
                    const variant = product.patternVariants.find(v => v.name === item.pattern);
                    if (!variant) throw new Error(`Biến thể họa tiết "${item.pattern}" của sản phẩm ${product.name} không tồn tại.`);
                    currentStock = variant.stock || 0;
                    if (variant.imageUrl) variantImage = variant.imageUrl;
                }

                if (currentStock < item.quantity) {
                    throw new Error(`Sản phẩm "${product.name}" (biến thể ${item.color || item.pattern || 'mặc định'}) đã hết hàng hoặc không đủ số lượng. Chỉ còn ${currentStock} sản phẩm.`);
                }

                const hasSale = product.sale > 0;
                const currentUnitPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
                finalSubtotal += currentUnitPrice * item.quantity;

                processedOrderItems.push({
                    id: item.id,
                    name: product.name,
                    price: currentUnitPrice,
                    image: variantImage,
                    quantity: item.quantity,
                    color: item.color || null,
                    pattern: item.pattern || null,
                    variant: [item.color, item.pattern].filter(Boolean).join(' / ') || null
                });
                productNames.push(product.name);

                // Cập nhật tồn kho sản phẩm/biến thể
                let updateProductData = {
                    stock: increment(-item.quantity),
                    sold: increment(item.quantity)
                };

                if (item.color && Array.isArray(product.colorVariants)) {
                    const updatedColorVariants = product.colorVariants.map(v => {
                        if (v.name === item.color) return { ...v, stock: (v.stock || 0) - item.quantity };
                        return v;
                    });
                    updateProductData.colorVariants = updatedColorVariants;
                }
                if (item.pattern && Array.isArray(product.patternVariants)) {
                    const updatedPatternVariants = product.patternVariants.map(v => {
                        if (v.name === item.pattern) return { ...v, stock: (v.stock || 0) - item.quantity };
                        return v;
                    });
                    updateProductData.patternVariants = updatedPatternVariants;
                }
                transaction.update(productRef, updateProductData);
            }

            // Cập nhật lượt dùng mã giảm giá
            if (appliedCoupon) {
                const couponRef = doc(db, "coupons", appliedCoupon.code);
                transaction.update(couponRef, { usedCount: increment(1) });
            }

            // Lưu đơn hàng
            transaction.set(newOrderRef, { ...orderData, items: processedOrderItems, productNames, totalAmount: finalTotal });
            return newOrderRef.id;
        });

        if (orderId) {
            // 2. Xóa giỏ hàng sau khi đặt thành công
            if (auth.currentUser) {
                await setDoc(doc(db, "carts", auth.currentUser.uid), { items: [] });
            } else {
                localStorage.removeItem('cart');
            }
            showToast("Đặt hàng thành công! Đang chuyển hướng...", "success");
            updateCartCount();
            setTimeout(() => {
                window.location.href = `thank-you.html?id=${orderId}`;
            }, 1500);
        }
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