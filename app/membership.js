import { auth, db } from '../js/config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { applyAppLanguage } from './i18n.js';

let currentUser = null;

// Cấu hình hạng thành viên đồng bộ chuẩn xác từ Website Tiệm Nhà Gốm
const MEMBERSHIP_TIERS = [
    { id: 'null', name: "Gốm Mộc", min: 0, discount: 0, color: '#95a5a6' },
    { id: 'new', name: "Gốm Nung", min: 1000000, discount: 1, color: '#3498db' },
    { id: 'mem', name: "Gốm Men", min: 5000000, discount: 3, color: '#f1c40f' },
    { id: 'vip', name: "Gốm Độc Bản", min: 10000000, discount: 5, color: '#e74c3c' }
];

document.addEventListener('DOMContentLoaded', () => {
    applyAppLanguage();
    initNetworkMonitor();
    initAuthObserver();
    initModals();
});

function hideSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (splash) splash.classList.add('fade-out');
}

function initNetworkMonitor() {
    const splash = document.getElementById('app-splash-screen');
    const subText = document.getElementById('splash-sub-text');

    window.addEventListener('offline', () => {
        if (splash) {
            if (subText) subText.innerText = "Đang kết nối lại mạng...";
            splash.classList.remove('fade-out');
        }
    });

    window.addEventListener('online', () => {
        if (splash) {
            if (subText) subText.innerText = "Đã kết nối";
            setTimeout(() => {
                splash.classList.add('fade-out');
                if (subText) subText.innerText = "ceramics & craft decor";
            }, 600);
        }
    });
}



function initModals() {
    const qrTrigger = document.getElementById('profile-open-qr');
    const qrSheet = document.getElementById('qr-bottom-sheet');
    const qrOverlay = document.getElementById('qr-modal-overlay');
    const closeQr = document.getElementById('btn-close-qr-sheet');

    const benefitsTrigger = document.getElementById('btn-view-benefits');
    const benefitsSheet = document.getElementById('benefits-bottom-sheet');
    const benefitsOverlay = document.getElementById('benefits-modal-overlay');
    const closeBenefits = document.getElementById('btn-close-benefits-sheet');

    const vouchersTrigger = document.getElementById('card-wallet-vouchers');
    const vouchersSheet = document.getElementById('vouchers-bottom-sheet');
    const vouchersOverlay = document.getElementById('vouchers-modal-overlay');
    const closeVouchers = document.getElementById('btn-close-vouchers-sheet');

    const orderDetailSheet = document.getElementById('order-detail-bottom-sheet');
    const orderDetailOverlay = document.getElementById('order-detail-modal-overlay');
    const closeOrderDetail = document.getElementById('btn-close-order-detail-sheet');

    function closeAllModals() {
        document.querySelectorAll('.app-bottom-sheet').forEach(sheet => sheet.classList.remove('active'));
        document.querySelectorAll('.app-sheet-overlay').forEach(overlay => overlay.classList.remove('active'));
    }

    function openModal(sheet, overlay) {
        closeAllModals(); // Đóng tất cả các modal khác trước khi mở modal mới
        if (sheet && overlay) {
            sheet.classList.add('active');
            overlay.classList.add('active');
        }
    }

    function closeModal(sheet, overlay) {
        if (sheet) sheet.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }

    if (qrTrigger) qrTrigger.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(qrSheet, qrOverlay);
    };
    if (closeQr) closeQr.onclick = () => closeModal(qrSheet, qrOverlay);
    if (qrOverlay) qrOverlay.onclick = () => closeModal(qrSheet, qrOverlay);

    if (benefitsTrigger) benefitsTrigger.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(benefitsSheet, benefitsOverlay);
    };
    if (closeBenefits) closeBenefits.onclick = () => closeModal(benefitsSheet, benefitsOverlay);
    if (benefitsOverlay) benefitsOverlay.onclick = () => closeModal(benefitsSheet, benefitsOverlay);

    if (vouchersTrigger) {
        vouchersTrigger.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal(vouchersSheet, vouchersOverlay);
        };
    }
    if (closeVouchers) closeVouchers.onclick = () => closeModal(vouchersSheet, vouchersOverlay);
    if (vouchersOverlay) vouchersOverlay.onclick = () => closeModal(vouchersSheet, vouchersOverlay);

    if (closeOrderDetail) closeOrderDetail.onclick = () => closeModal(orderDetailSheet, orderDetailOverlay);
    if (orderDetailOverlay) orderDetailOverlay.onclick = () => closeModal(orderDetailSheet, orderDetailOverlay);

    window.openOrderModal = (order) => {
        renderOrderDetailContent(order);
        openModal(orderDetailSheet, orderDetailOverlay);
    };

}

function initAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            window.location.href = './login.html';
            return;
        }

        const emailEl = document.getElementById('profile-user-email');
        const avatarEl = document.getElementById('profile-user-avatar');

        if (emailEl) emailEl.innerText = user.email || user.displayName || "gốm lover";
        if (avatarEl) avatarEl.src = user.photoURL || '../Asset/images/default-avatar.png';

        generateCodes(user);
        await loadUserData(user);
    });
}

function generateCodes(user) {
    const memberCode = `TNG-${(user.uid || "").substring(0, 8).toUpperCase()}`;
    const codeLabel = document.getElementById('qr-member-code');
    if (codeLabel) codeLabel.innerText = memberCode;

    const qrCanvas = document.getElementById('qr-canvas');
    if (qrCanvas && window.QRCode) {
        QRCode.toCanvas(qrCanvas, memberCode, {
            width: 170,
            margin: 1,
            color: { dark: '#1a1a19', light: '#ffffff' }
        });
    }

    const barcodeSvg = document.getElementById('barcode-svg');
    if (barcodeSvg && window.JsBarcode) {
        try {
            JsBarcode(barcodeSvg, memberCode, {
                format: "CODE128",
                width: 1.6,
                height: 45,
                displayValue: false,
                lineColor: "#1a1a19",
                background: "transparent",
                margin: 0
            });
        } catch (e) { console.error(e); }
    }
}

async function loadUserData(user) {
    try {
        let totalSpent = 0;
        let points = 0;
        let phone = "";

        // 1. Quét thông tin user doc
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let userData = {};

        if (userSnap.exists()) {
            userData = userSnap.data();
            phone = userData.phone || "";
            points = userData.points || 0;
        }

        // Cập nhật Thông Tin Chi Tiết Người Dùng
        const nameEl = document.getElementById('profile-detail-name');
        const userEmailEl = document.getElementById('profile-detail-email');
        const phoneEl = document.getElementById('profile-detail-phone');
        const dobEl = document.getElementById('profile-detail-dob');
        const genderEl = document.getElementById('profile-detail-gender');
        const joinedEl = document.getElementById('profile-detail-joined');

        const fullName = userData.name || userData.displayName || user.displayName || 'Khách hàng';
        const userEmail = userData.email || user.email || 'Chưa cập nhật';
        const userPhone = phone || user.phoneNumber || 'Chưa cập nhật';
        const userDob = userData.dob || userData.birthday || 'Chưa cập nhật';
        const userGender = userData.gender || 'Chưa cập nhật';
        
        let joinedDateStr = 'Chưa cập nhật';
        if (userData.createdAt) {
            joinedDateStr = formatOrderDate(userData.createdAt).split(' - ')[1] || formatOrderDate(userData.createdAt);
        } else if (user.metadata && user.metadata.creationTime) {
            joinedDateStr = new Date(user.metadata.creationTime).toLocaleDateString('vi-VN');
        }

        if (nameEl) nameEl.innerText = fullName;
        if (userEmailEl) userEmailEl.innerText = userEmail;
        if (phoneEl) phoneEl.innerText = userPhone;
        if (dobEl) dobEl.innerText = userDob;
        if (genderEl) genderEl.innerText = userGender;
        if (joinedEl) joinedEl.innerText = joinedDateStr;


        // 2. Lấy đơn hàng để tính chi tiêu và mã coupon đã dùng
        const ordersRef = collection(db, "orders");
        const orderDocs = [];
        const qUid = query(ordersRef, where("userId", "==", user.uid));
        const snapUid = await getDocs(qUid);
        snapUid.forEach(d => orderDocs.push({ id: d.id, orderId: d.data().orderId || d.id, ...d.data() }));

        if (phone) {
            const phoneClean = phone.replace(/\D/g, '');
            const phone84 = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;
            const qPhone = query(ordersRef, where("phone", "in", [phone, phoneClean, phone84]));
            const snapPhone = await getDocs(qPhone);
            snapPhone.forEach(d => {
                const oid = d.data().orderId || d.id;
                if (!orderDocs.some(o => (o.orderId === oid || o.id === d.id))) {
                    orderDocs.push({ id: d.id, orderId: oid, ...d.data() });
                }
            });
        }


        const usedCoupons = new Set();
        orderDocs.forEach(o => {
            if (o.couponCode) usedCoupons.add(o.couponCode);
            const status = (o.status || "").toLowerCase();
            if (status.includes("hoàn thành") || status.includes("thành công") || status.includes("completed")) {
                totalSpent += Number(o.totalAmount || o.total || 0);
            }
        });

        // Điểm Dots: Lấy trực tiếp từ trường Điểm tích lũy (points) của khách hàng trong Firebase
        if (userData.points !== undefined && userData.points !== null) {
            points = Number(userData.points);
        } else if (points === 0 && totalSpent > 0) {
            points = Math.floor(totalSpent / 100000);
        }



        // 3. Lấy danh sách Voucher từ Firestore "coupons" collection (Đồng bộ với Website)
        let validVouchers = [];
        try {
            const couponsRef = collection(db, "coupons");
            const snapCoupons = await getDocs(couponsRef);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            snapCoupons.forEach(d => {
                const cData = d.data();
                const code = d.id;

                // Bỏ qua mã đã hết hạn
                if (cData.expiryDate && new Date(cData.expiryDate) < today) return;
                // Bỏ qua mã hết lượt
                if (cData.limit > 0 && (cData.usedCount || 0) >= cData.limit) return;
                // Bỏ qua mã user đã dùng
                if (usedCoupons.has(code)) return;
                // Nếu là mã riêng tư tự động
                if (cData.isAutoGenerated && cData.assignedTo !== user.uid && cData.assignedBy !== user.uid) return;

                let discountTitle = "";
                if (cData.discountType === 'percent') discountTitle = `Giảm ${cData.discountValue}%`;
                else if (cData.discountValue) discountTitle = `Giảm ${Number(cData.discountValue).toLocaleString('vi-VN')}đ`;
                else discountTitle = cData.title || `Voucher Tiệm Nhà Gốm`;

                validVouchers.push({
                    code: code,
                    title: discountTitle,
                    desc: cData.description || cData.conditions || (cData.minSpend ? `Đơn tối thiểu ${Number(cData.minSpend).toLocaleString('vi-VN')}đ` : 'Áp dụng cho mọi đơn hàng')
                });
            });
        } catch (e) {
            console.warn("Lỗi tải coupons từ Firestore:", e);
        }

        // Nếu Firestore chưa có coupons, tạo voucher chào mừng mặc định
        if (validVouchers.length === 0) {
            validVouchers = [
                {
                    code: "CHAO-MUNG-GOM",
                    title: "Voucher Chào Mừng Hội Viên",
                    desc: "Giảm 10% cho đơn hàng đầu tiên từ 300.000đ"
                }
            ];
        }

        renderVouchersList(validVouchers);

        // Cập nhật Danh sách Lịch sử mua hàng
        renderOrdersHistory(orderDocs);

        // Cập nhật DOM Wallet
        const dotsEl = document.getElementById('wallet-dots-val');
        const vouchersEl = document.getElementById('wallet-vouchers-val');
        if (dotsEl) dotsEl.innerText = points.toLocaleString('vi-VN');
        if (vouchersEl) vouchersEl.innerText = validVouchers.length;

        // Tính hạng thành viên theo chuẩn Web Tiệm Nhà Gốm
        let currentTier = MEMBERSHIP_TIERS[0];
        let nextTier = MEMBERSHIP_TIERS[1];

        for (let i = MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
            if (totalSpent >= MEMBERSHIP_TIERS[i].min) {
                currentTier = MEMBERSHIP_TIERS[i];
                nextTier = MEMBERSHIP_TIERS[i + 1] || null;
                break;
            }
        }

        // Cập nhật thông tin thẻ
        const tierNameEl = document.getElementById('profile-tier-name');
        const tierDiscountEl = document.getElementById('profile-tier-discount');
        const tierHintEl = document.getElementById('profile-tier-hint');
        const spentTotalEl = document.getElementById('profile-spent-total');
        const pointsBadgeEl = document.getElementById('profile-points-badge');
        const progressFill = document.getElementById('profile-progress-fill');
        const progressThumb = document.getElementById('profile-progress-thumb');

        if (tierNameEl) tierNameEl.innerText = currentTier.name;
        if (tierDiscountEl) tierDiscountEl.innerText = `Ưu đãi ${currentTier.discount}%`;
        if (spentTotalEl) spentTotalEl.innerText = `${totalSpent.toLocaleString('vi-VN')}đ`;
        if (pointsBadgeEl) pointsBadgeEl.innerText = `${points.toLocaleString('vi-VN')} Dots`;

        if (nextTier) {
            const needed = (nextTier.min - totalSpent).toLocaleString('vi-VN');
            if (tierHintEl) tierHintEl.innerText = `Chi thêm ${needed}đ để thăng hạng ${nextTier.name}`;
            const prevMin = currentTier.min;
            const pct = Math.min(100, Math.max(5, ((totalSpent - prevMin) / (nextTier.min - prevMin)) * 100));
            if (progressFill) progressFill.style.width = `${pct}%`;
            if (progressThumb) progressThumb.style.left = `${pct}%`;
        } else {
            if (tierHintEl) tierHintEl.innerText = "Hội viên cao cấp nhất - Gốm Độc Bản";
            if (progressFill) progressFill.style.width = `100%`;
            if (progressThumb) progressThumb.style.left = `100%`;
        }

    } catch (e) {
        console.error("Lỗi cập nhật thông tin profile:", e);
    } finally {
        hideSplashScreen();
    }
}


function renderVouchersList(vouchers) {
    const container = document.getElementById('vouchers-list-container');
    if (!container) return;

    if (!vouchers || vouchers.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 16px; color: #888;">
                <p>Bạn chưa có voucher nào trong ví</p>
            </div>
        `;
        return;
    }

    container.innerHTML = vouchers.map(v => {
        const code = v.code || (typeof v === 'string' ? v : 'TNG-VOUCHER');
        const title = v.title || `Voucher Tiệm Nhà Gốm`;
        const desc = v.desc || `Áp dụng giảm giá khi mua hàng online & tại quầy`;

        return `
            <div class="voucher-ticket-card">
                <div class="voucher-ticket-left">
                    <div class="voucher-ticket-title">${title}</div>
                    <div class="voucher-ticket-desc">${desc}</div>
                    <div class="voucher-ticket-code">${code}</div>
                </div>
                <button class="voucher-ticket-btn" onclick="navigator.clipboard.writeText('${code}'); alert('Đã sao chép mã voucher: ${code}');">Sao chép</button>
            </div>
        `;
    }).join('');
}

function formatOrderDate(timestamp) {
    if (!timestamp) return 'Vừa xong';
    try {
        let d = null;
        if (timestamp.toDate) d = timestamp.toDate();
        else if (timestamp.seconds) d = new Date(timestamp.seconds * 1000);
        else if (typeof timestamp === 'string' || typeof timestamp === 'number') d = new Date(timestamp);

        if (d && !isNaN(d.getTime())) {
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${hours}:${minutes} - ${day}/${month}/${year}`;
        }
    } catch (e) { console.error(e); }
    return 'Vừa xong';
}

function renderOrdersHistory(orders) {
    const listContainer = document.getElementById('profile-orders-list');
    const countBadge = document.getElementById('profile-orders-count');
    if (!listContainer) return;

    if (countBadge) countBadge.innerText = `${orders.length} đơn`;

    if (!orders || orders.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 30px 16px; background: #ffffff; border-radius: 16px; border: 1px dashed rgba(0,0,0,0.1); color: #888;">
                <p style="font-size: 0.84rem; margin: 0;">Bạn chưa có đơn hàng nào tại Tiệm Nhà Gốm</p>
            </div>
        `;
        return;
    }

    // Sắp xếp đơn hàng mới nhất lên đầu
    const sortedOrders = [...orders].sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime()) : 0;
        const timeB = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime()) : 0;
        return timeB - timeA;
    });

    const loadMoreBtn = document.getElementById('btn-load-more-orders');
    let displayedCount = 3;

    function renderOrderItems() {
        const visibleOrders = sortedOrders.slice(0, displayedCount);

        listContainer.innerHTML = visibleOrders.map((order, idx) => {
            const orderId = order.orderId || order.id || `TNG-${idx + 1}`;
            const rawStatus = (order.status || 'Đang xử lý').toLowerCase();
            
            let statusClass = 'status-pending';
            let statusLabel = 'Đang xử lý';
            if (rawStatus.includes('hoàn thành') || rawStatus.includes('thành công') || rawStatus.includes('completed')) {
                statusClass = 'status-completed';
                statusLabel = 'Hoàn thành';
            } else if (rawStatus.includes('giao') || rawStatus.includes('shipping') || rawStatus.includes('delivering')) {
                statusClass = 'status-shipping';
                statusLabel = 'Đang giao';
            } else if (rawStatus.includes('hủy') || rawStatus.includes('cancel')) {
                statusClass = 'status-cancelled';
                statusLabel = 'Đã hủy';
            }

            const total = Number(order.totalAmount || order.total || 0).toLocaleString('vi-VN');
            const itemsCount = (order.items && Array.isArray(order.items)) ? order.items.length : 1;
            const dateFormatted = formatOrderDate(order.createdAt || order.orderDate || order.date);

            return `
                <div class="profile-order-card" id="order-card-idx-${idx}">
                    <div class="profile-order-card-top">
                        <span class="profile-order-id">#${orderId}</span>
                        <span class="profile-order-status ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="profile-order-details">
                        <div>
                            <div>${itemsCount} món đồ gốm</div>
                            <div style="font-size: 0.72rem; color: #888888; margin-top: 3px; font-weight: 500;">${dateFormatted}</div>
                        </div>
                        <span class="profile-order-price">${total}đ</span>
                    </div>
                </div>
            `;
        }).join('');

        visibleOrders.forEach((order, idx) => {
            const el = document.getElementById(`order-card-idx-${idx}`);
            if (el) el.onclick = () => window.openOrderModal(order);
        });

        if (loadMoreBtn) {
            if (sortedOrders.length > displayedCount) {
                loadMoreBtn.style.display = 'block';
                loadMoreBtn.innerText = `Xem thêm ${sortedOrders.length - displayedCount} đơn hàng`;
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }
    }

    if (loadMoreBtn) {
        loadMoreBtn.onclick = () => {
            displayedCount += 5;
            renderOrderItems();
        };
    }

    renderOrderItems();
}



function renderOrderDetailContent(order) {
    const container = document.getElementById('order-detail-body-content');
    const headerTitle = document.getElementById('order-detail-header-title');
    if (!container) return;

    const orderId = order.orderId || (order.id ? order.id.substring(0, 8).toUpperCase() : 'TNG-ORDER');
    if (headerTitle) headerTitle.innerText = `Đơn Hàng #${orderId}`;

    const rawStatus = (order.status || 'Đang xử lý').toLowerCase();
    let statusClass = 'status-pending';
    let statusLabel = 'Đang xử lý';
    if (rawStatus.includes('hoàn thành') || rawStatus.includes('thành công') || rawStatus.includes('completed')) {
        statusClass = 'status-completed';
        statusLabel = 'Hoàn thành';
    } else if (rawStatus.includes('giao') || rawStatus.includes('shipping') || rawStatus.includes('delivering')) {
        statusClass = 'status-shipping';
        statusLabel = 'Đang giao';
    } else if (rawStatus.includes('hủy') || rawStatus.includes('cancel')) {
        statusClass = 'status-cancelled';
        statusLabel = 'Đã hủy';
    }

    const items = order.items || [];
    const shipping = order.shippingAddress || {};
    const recipientName = order.customerName || order.recipientName || shipping.name || order.name || 'Khách hàng';
    const recipientPhone = order.customerPhone || order.phone || shipping.phone || 'Chưa cập nhật';
    const addressStr = order.address || shipping.fullAddress || shipping.address || 'Giao hàng tận nơi';
    const dateFormatted = formatOrderDate(order.createdAt || order.orderDate || order.date);

    const subtotal = Number(order.subtotal || order.totalAmount || order.total || 0).toLocaleString('vi-VN');
    const total = Number(order.totalAmount || order.total || 0).toLocaleString('vi-VN');
    const discountAmount = order.discountAmount ? Number(order.discountAmount).toLocaleString('vi-VN') : 0;
    const shippingFee = order.shippingFee ? `${Number(order.shippingFee).toLocaleString('vi-VN')}đ` : 'Miễn phí';


    const itemsHtml = items.map(it => {
        const title = it.name || it.title || 'Sản phẩm gốm mộc';
        const price = Number(it.price || 0).toLocaleString('vi-VN');
        const qty = it.quantity || 1;
        const img = it.image || it.imageUrl || it.thumb || 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=200';
        return `
            <div class="order-detail-item-row">
                <img class="order-detail-item-thumb" src="${img}" alt="${title}" onerror="this.src='https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=200'">
                <div class="order-detail-item-info">
                    <div class="order-detail-item-name">${title}</div>
                    <div class="order-detail-item-sub">Số lượng: x${qty}</div>
                </div>
                <div class="order-detail-item-price">${price}đ</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="order-detail-meta-box">
            <div>
                <div style="font-size: 0.72rem; color: #888;">Thời gian đặt hàng</div>
                <div style="font-size: 0.84rem; font-weight: 700; color: #1a1a19;">${dateFormatted}</div>
            </div>
            <span class="order-detail-status-pill ${statusClass}">${statusLabel}</span>
        </div>

        <div class="order-detail-section-card">
            <div class="order-detail-section-title">Sản phẩm (${items.length} món)</div>
            <div class="order-detail-items-list">
                ${itemsHtml || '<div style="font-size: 0.8rem; color: #888;">Danh sách sản phẩm gốm mộc</div>'}
            </div>
        </div>

        <div class="order-detail-section-card">
            <div class="order-detail-section-title">Thông tin giao nhận</div>
            <div style="font-size: 0.8rem; color: #333; line-height: 1.5;">
                <div><b>Người nhận:</b> ${recipientName} (${recipientPhone})</div>
                <div style="margin-top: 3px;"><b>Địa chỉ:</b> ${addressStr}</div>
                ${order.paymentMethod ? `<div style="margin-top: 3px;"><b>Phương thức:</b> ${order.paymentMethod.toUpperCase()}</div>` : ''}
            </div>
        </div>

        <div class="order-detail-section-card">
            <div class="order-detail-section-title">Thanh toán</div>
            <div class="order-detail-info-line">
                <span>Tạm tính</span>
                <span>${subtotal}đ</span>
            </div>
            <div class="order-detail-info-line">
                <span>Phí vận chuyển</span>
                <span>${shippingFee}</span>
            </div>
            ${discountAmount ? `
            <div class="order-detail-info-line" style="color: #27ae60;">
                <span>Giảm giá (Voucher / Hội viên)</span>
                <span>-${discountAmount}đ</span>
            </div>` : ''}
            <div class="order-detail-total-line">
                <span>Tổng cộng</span>
                <span style="color: #c57d56;">${total}đ</span>
            </div>
        </div>
    `;
}

