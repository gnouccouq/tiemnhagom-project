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

function renderBankQR(order, orderId) {
    const container = document.querySelector('.checkout-section');
    const qrDiv = document.createElement('div');
    qrDiv.style = "margin-top: 3rem; padding-top: 3rem; border-top: 1px solid #eee;";
    
    // Thông tin ngân hàng của bạn (Thay đổi thông số ở đây)
    const BANK_ID = "970436"; // Mã NAPAS của ngân hàng (VCB là 970436)
    const ACCOUNT_NO = "1047972265"; 
    const ACCOUNT_NAME = "NGUYEN TAN QUOC CUONG";
    const amount = order.totalAmount;
    const description = `${orderId} - ${order.shippingAddress.phone}`;
    
    // Sử dụng API VietQR để tạo link ảnh QR
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    qrDiv.innerHTML = `
        <h3 style="font-family: var(--font-serif); margin-bottom: 1.5rem;">Quét mã QR để thanh toán</h3>
        <img src="${qrUrl}" alt="Mã QR Thanh toán" style="max-width: 300px; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <p style="margin-top: 1.5rem; font-weight: 600; color: #c0392b;">Số tiền: ${new Intl.NumberFormat('vi-VN').format(amount)}đ</p>
        <p style="font-size: 0.9rem; color: #666;">Nội dung: <strong>${description}</strong></p>
    `;
    container.appendChild(qrDiv);
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', initThankYouPage);
});