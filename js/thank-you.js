import { db, auth, initHeader } from "./utils.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function initThankYouPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    const orderIdDisplay = document.getElementById('order-id-display');

    if (!orderId) {
        window.location.href = "../index.html";
        return;
    }

    if (orderIdDisplay) orderIdDisplay.innerText = orderId;

    try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (orderSnap.exists()) {
            const order = orderSnap.data();
            
            // Hiển thị tóm tắt đơn hàng (Sản phẩm, giá, địa chỉ)
            renderOrderSummary(order);

            // Hiển thị nút xem đơn hàng nếu user đã login
            if (order.userId !== 'guest') {
                const viewBtn = document.getElementById('view-orders-btn');
                if (viewBtn) viewBtn.style.display = 'inline-block';
            }

            // Xử lý mã QR nếu là thanh toán chuyển khoản
            if (order.paymentMethod === 'bank_transfer') {
                renderBankQR(order, orderId);
            }
        }
    } catch (e) { console.error(e); }
}

function renderOrderSummary(order) {
    const container = document.querySelector('.checkout-section');
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'order-summary-details';
    // Style trực tiếp để đồng bộ với theme
    summaryDiv.style = "max-width: 600px; margin: 2rem auto; text-align: left; background: #fff; padding: 2rem; border-radius: 12px; border: 1px solid #eee; box-shadow: 0 5px 15px rgba(0,0,0,0.02);";

    const itemsHtml = order.items.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #f9f9f9;">
            <div style="display: flex; align-items: center; gap: 15px; min-width: 0;">
                <img src="${item.image}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">
                <div style="min-width: 0;">
                    <h5 style="margin: 0; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</h5>
                    <p style="margin: 0; font-size: 0.8rem; color: #888;">${item.variant || 'Mặc định'} x ${item.quantity}</p>
                </div>
            </div>
            <span style="font-weight: 600; white-space: nowrap; margin-left: 10px;">${new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}đ</span>
        </div>
    `).join('');

    summaryDiv.innerHTML = `
        <h4 style="margin-bottom: 1.5rem; border-bottom: 1px solid #eee; padding-bottom: 10px; font-family: var(--font-serif);">Tóm tắt đơn hàng</h4>
        ${itemsHtml}
        <div style="margin-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 8px;">
                <span>Phí vận chuyển:</span>
                <span>${new Intl.NumberFormat('vi-VN').format(order.shippingFee || 0)}đ</span>
            </div>
            ${order.discountAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 8px; color: #27ae60;">
                <span>Giảm giá (Coupon):</span>
                <span>-${new Intl.NumberFormat('vi-VN').format(order.discountAmount)}đ</span>
            </div>` : ''}
            ${order.membershipDiscount > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 8px; color: #27ae60;">
                <span>Ưu đãi thành viên:</span>
                <span>-${new Intl.NumberFormat('vi-VN').format(order.membershipDiscount)}đ</span>
            </div>` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.2rem; border-top: 2px solid #eee; padding-top: 15px; margin-top: 15px;">
                <span>Tổng thanh toán:</span>
                <span style="color: #c0392b;">${new Intl.NumberFormat('vi-VN').format(order.totalAmount)}đ</span>
            </div>
        </div>
        
        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #eee;">
            <h5 style="margin-bottom: 10px; font-size: 0.85rem; text-transform: uppercase; color: #888; letter-spacing: 1px;">Thông tin nhận hàng</h5>
            <p style="font-size: 0.9rem; color: #333; margin: 0;"><strong>${order.shippingAddress.fullName}</strong> | ${order.shippingAddress.phone}</p>
            <p style="font-size: 0.85rem; color: #666; margin: 5px 0 0;">${order.shippingAddress.address}</p>
            <p style="font-size: 0.85rem; color: #666; margin: 8px 0 0;">Hình thức: <strong>${order.paymentMethod === 'COD' ? 'Thanh toán khi nhận hàng (COD)' : 'Chuyển khoản ngân hàng'}</strong></p>
        </div>
    `;

    const actions = document.querySelector('.cart-actions');
    container.insertBefore(summaryDiv, actions);
}

function renderBankQR(order, orderId) {
    const container = document.querySelector('.checkout-section');
    const qrDiv = document.createElement('div');
    qrDiv.style = "margin-top: 2rem; padding: 2rem; background: #fffcf5; border: 1px dashed #f1c40f; border-radius: 12px; max-width: 600px; margin-left: auto; margin-right: auto;";
    
    // Thông tin ngân hàng của bạn (Thay đổi thông số ở đây)
    const BANK_ID = "970436"; // Mã NAPAS của ngân hàng Vietcombank
    const ACCOUNT_NO = "1059447798"; // Số tài khoản
    const ACCOUNT_NAME = "HO KINH DOANH TIEM NHA GOM"; // Tên chủ tài khoản
    const BRANCH = "VCB TAN BINH - PGD ETOWN";
    const amount = order.totalAmount;
    const description = `${orderId} - ${order.shippingAddress.phone}`;
    
    // Sử dụng API VietQR để tạo link ảnh QR
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    qrDiv.innerHTML = `
        <h3 style="font-family: var(--font-serif); margin-bottom: 1.5rem; text-align: center;">Quét mã QR để thanh toán</h3>
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <img src="${qrUrl}" alt="Mã QR Thanh toán" style="max-width: 250px; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        </div>
        <div style="font-size: 0.9rem; line-height: 1.6; color: #555;">
            <p>Ngân hàng: <strong>Vietcombank (VCB)</strong></p>
            <p>Chi nhánh: <strong>${BRANCH}</strong></p>
            <p>Chủ tài khoản: <strong>${ACCOUNT_NAME}</strong></p>
            <p>Số tài khoản: <strong style="font-size: 1.1rem; color: #000;">${ACCOUNT_NO}</strong></p>
            <p>Số tiền: <strong style="color: #c0392b;">${new Intl.NumberFormat('vi-VN').format(amount)}đ</strong></p>
            <p>Nội dung: <strong style="background: #eee; padding: 2px 6px; border-radius: 4px;">${description}</strong></p>
        </div>
    `;
    const actions = document.querySelector('.cart-actions');
    container.insertBefore(qrDiv, actions);
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', initThankYouPage);
});