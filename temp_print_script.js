window.printPOSReceipt = function(orderId, customer, items, total, subtotal = 0, discount = 0, shipping = 0) {
    let printArea = document.getElementById('receipt-print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'receipt-print-area';
        document.body.appendChild(printArea);
    }
    
    const now = new Date().toLocaleString('vi-VN');
    
    printArea.innerHTML = `
        <div class="receipt-header">
            <img src="../Asset/images/logo.webp" class="receipt-logo" alt="Logo Tiệm Nhà Gốm">
            <h2>TIỆM NHÀ GỐM</h2>
            <p>Gốm & Decor</p>
            <p>37 Nguyễn Duy, Phường Gia Định, TP.HCM</p>
            <p>SĐT: 033 769 6231 - 090 938 0652</p>
        </div>
        <div class="receipt-info">
            <p><strong>Mã ĐH:</strong> #${orderId}</p>
            <p><strong>Ngày:</strong> ${now}</p>
            <p><strong>Khách hàng:</strong> ${customer?.name || 'Khách vãng lai'}</p>
            <p><strong>SĐT:</strong> ${customer?.phone || ''}</p>
        </div>
        <table class="receipt-table">
            <thead>
                <tr>
                    <th>SP</th>
                    <th>SL</th>
                    <th>Giá</th>
                    <th>Thành tiền</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(i => `
                    <tr>
                        <td>${i.name} ${i.color?`(${i.color})`:''} ${i.pattern?`(${i.pattern})`:''}</td>
                        <td>${i.quantity}</td>
                        <td>${new Intl.NumberFormat('vi-VN').format(i.price)}</td>
                        <td>${new Intl.NumberFormat('vi-VN').format(i.price * i.quantity)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${discount > 0 ? `<div class="receipt-discount" style="text-align: right;">Giảm giá: -${new Intl.NumberFormat('vi-VN').format(discount)}đ</div>` : ''}
        ${shipping > 0 ? `<div class="receipt-shipping" style="text-align: right;">Phí ship: +${new Intl.NumberFormat('vi-VN').format(shipping)}đ</div>` : ''}
        <div class="receipt-total" style="font-weight:bold; font-size: 1.2rem; margin-top: 10px;">TỔNG CỘNG: ${new Intl.NumberFormat('vi-VN').format(total)}đ</div>
        <div class="receipt-qr-section" style="text-align:center; margin-top:15px;">
            <p style="margin-bottom: 5px; font-weight: bold;">Quét mã theo dõi Tiệm:</p>
            <img src="../Asset/images/fb-qr.webp" class="receipt-qr" alt="Facebook QR" style="width:100px; height:100px;">
            <p style="margin-top: 5px; font-size: 14px; font-weight: bold;">www.tiemnhagom.vn</p>
        </div>
        <div class="receipt-footer" style="text-align:center; margin-top:10px;">Cảm ơn Quý khách. Hẹn gặp lại!</div>
    `;

    window.print();
};
// To support both window.printPOSReceipt and direct printPOSReceipt call at line 2671
window.printPOSReceipt = window.printPOSReceipt;
function printPOSReceipt(orderId, customer, items, total, subtotal = 0, discount = 0, shipping = 0) {
    window.printPOSReceipt(orderId, customer, items, total, subtotal, discount, shipping);
}
