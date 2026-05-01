import { initHeader } from "./utils.js";

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo Header và kiểm tra trạng thái đăng nhập
    initHeader('../', (user) => {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('id');
        
        if (orderId) {
            document.getElementById('order-id-display').innerText = `#${orderId}`;
        }

        // Hiển thị nút "Xem đơn hàng" nếu người dùng đã đăng nhập
        if (user) {
            document.getElementById('view-orders-btn').style.display = 'inline-block';
        }
    });
});
