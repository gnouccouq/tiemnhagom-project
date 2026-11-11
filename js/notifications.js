// js/notifications.js
// Hệ thống thông báo Web Tiệm Nhà Gốm — Đồng bộ 100% tính năng & dữ liệu với Mobile App (tiemnhagom-app)
// Tuân thủ triệt để bảng màu Đen - Trắng (Monochrome) tối giản & thanh lịch trên Web

import { db, auth } from './config.js';
import {
    collection, query, where, orderBy, limit, getDocs, onSnapshot, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Các khóa lưu trữ cục bộ (Khớp 100% với Mobile App)
const READ_IDS_KEY = 'tiemnhagom_read_notification_ids';
const DELETED_NOTIFS_KEY = 'tiemnhagom_deleted_notifications';

// Trạng thái nội bộ
let feedItems = [];
let currentFilter = 'all'; // 'all' | 'news' | 'promo' | 'order' | 'system'
let pathPrefixGlobal = '';
let isDropdownOpen = false;
let hasInitialized = false;

// Nội dung trạng thái rỗng (Khớp 100% với getEmptyStateContent() trên App)
// Chuẩn hóa link điều hướng trên Web (Chuyển đổi route mobile app như /order-detail?orderId=... sang tra-cuu-don-hang.html?orderId=...)
function normalizeWebLink(link, pathPrefix = '') {
    if (!link) return null;
    const str = String(link).trim();
    if (str.includes('order-detail')) {
        const queryIdx = str.indexOf('?');
        const queryStr = queryIdx !== -1 ? str.substring(queryIdx) : '';
        return `${pathPrefix}tra-cuu-don-hang.html${queryStr}`;
    }
    return str;
}

const EMPTY_STATES = {
    news: {
        icon: 'ti-news',
        title: 'Chưa có bài viết mới',
        desc: 'Các câu chuyện gốm sứ và tin tức tiệm sẽ được cập nhật liên tục tại đây.'
    },
    promo: {
        icon: 'ti-tag',
        title: 'Chưa có ưu đãi mới',
        desc: 'Theo dõi thường xuyên để không bỏ lỡ các voucher giảm giá độc quyền nhé.'
    },
    order: {
        icon: 'ti-package',
        title: 'Chưa có thông báo đơn hàng',
        desc: 'Trạng thái vận chuyển và đóng gói đồ gốm sẽ hiển thị tại đây khi bạn đặt hàng.'
    },
    system: {
        icon: 'ti-shield-check',
        title: 'Hệ thống ổn định',
        desc: 'Chưa có thông báo nâng cấp hoặc kỹ thuật nào.'
    },
    all: {
        icon: 'ti-bell-off',
        title: 'Không có thông báo nào',
        desc: 'Các thông báo về đơn hàng và ưu đãi sẽ xuất hiện tại đây.'
    }
};

// Định dạng tiền tệ VND
function formatVND(amount) {
    if (!amount || isNaN(amount)) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
}

// Chuyển đổi Timestamp Firestore thành chuỗi thời gian thân thiện
function formatFriendlyTime(timestamp) {
    let date = new Date();
    let ms = Date.now();
    if (timestamp) {
        try {
            if (typeof timestamp.toDate === 'function') {
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'number') {
                date = new Date(timestamp);
            } else if (typeof timestamp === 'string') {
                date = new Date(timestamp);
            } else if (timestamp.seconds) {
                date = new Date(timestamp.seconds * 1000);
            }
            ms = date.getTime();
        } catch (_) { }
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    let timeStr = 'Vừa xong';
    if (diffMin < 1) timeStr = 'Vừa xong';
    else if (diffMin < 60) timeStr = `${diffMin} phút trước`;
    else if (diffHr < 24) timeStr = `${diffHr} giờ trước`;
    else if (diffDay < 7) timeStr = `${diffDay} ngày trước`;
    else {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        timeStr = `${day}/${month}/${year}`;
    }

    return { timeStr, ms };
}

// Lấy danh sách ID đã đọc từ localStorage
function getStoredReadIds() {
    try {
        const raw = localStorage.getItem(READ_IDS_KEY);
        if (raw) return new Set(JSON.parse(raw));
    } catch (_) { }
    return new Set();
}

// Lưu danh sách ID đã đọc vào localStorage
function saveStoredReadIds(readIdsSet) {
    try {
        localStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(readIdsSet)));
    } catch (_) { }
}

// Lấy danh sách ID đã xóa từ localStorage
function getStoredDeletedIds() {
    try {
        const raw = localStorage.getItem(DELETED_NOTIFS_KEY);
        if (raw) return new Set(JSON.parse(raw));
    } catch (_) { }
    return new Set();
}

// Lưu danh sách ID đã xóa vào localStorage
function saveStoredDeletedIds(deletedIdsSet) {
    try {
        localStorage.setItem(DELETED_NOTIFS_KEY, JSON.stringify(Array.from(deletedIdsSet)));
    } catch (_) { }
}

// Chuyển đổi đơn hàng của khách thành thông báo (Khớp orderNotificationService.ts)
function generateOrderNotifications(orders, readIds, deletedIds, pathPrefix) {
    if (!Array.isArray(orders) || orders.length === 0) return [];
    const items = [];

    for (const order of orders) {
        const orderId = order.id;
        if (!orderId) continue;

        const orderCode = (order.orderCode || order.orderId || order.code || orderId).toString();
        const upperCode = orderCode.toUpperCase();
        const totalAmount = Number(order.totalAmount || order.total || order.subtotal || 0);
        const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null;
        const imageUrl = firstItem?.resolvedImage || firstItem?.imageUrl || firstItem?.image || undefined;
        const { timeStr, ms } = formatFriendlyTime(order.createdAt || order.orderDate);

        const isRental = order.orderType === 'rental' || Boolean(order.rentalInfo);
        const isPos = !isRental && (order.source === 'pos' || order.orderSource === 'pos' || order.channel === 'pos' || order.inStore || upperCode.startsWith('POS'));
        const statusRaw = (order.status || '').toString().toLowerCase();

        if (isRental) {
            const notifId = `order_${orderId}_rental`;
            if (!deletedIds.has(notifId)) {
                let title = `Hợp đồng thuê gốm #${orderCode}`;
                let message = `Tiệm Nhà Gốm đã tiếp nhận yêu cầu thuê đồ gốm sự kiện trị giá ${formatVND(totalAmount)}. Tiệm đang chuẩn bị các tác phẩm theo concept cho bạn.`;
                let icon = 'ti-calendar';

                if (statusRaw.includes('xác nhận') || statusRaw.includes('duyệt')) {
                    title = `Hợp đồng thuê gốm #${orderCode} đã xác nhận`;
                    message = `Yêu cầu thuê đồ gốm sự kiện của bạn đã được xác nhận. Tiệm sẽ chuẩn bị sẵn sàng trước ngày tổ chức.`;
                    icon = 'ti-circle-check';
                } else if (statusRaw.includes('giao') || statusRaw.includes('vận chuyển') || statusRaw.includes('bàn giao')) {
                    title = `Đồ gốm sự kiện #${orderCode} đang bàn giao`;
                    message = `Đội ngũ Tiệm Nhà Gốm đang vận chuyển đồ gốm đến địa điểm tiệc để bàn giao cho bạn.`;
                    icon = 'ti-truck-delivery';
                } else if (statusRaw.includes('hoàn tất') || statusRaw.includes('trả') || statusRaw.includes('hoàn thành')) {
                    title = `Hợp đồng thuê gốm #${orderCode} đã hoàn tất`;
                    message = `Tiệm Nhà Gốm đã nhận hoàn trả đồ gốm sự kiện và hoàn tất hợp đồng. Cảm ơn bạn đã tin chọn dịch vụ của Tiệm!`;
                    icon = 'ti-circle-check';
                } else if (statusRaw.includes('hủy')) {
                    title = `Hợp đồng thuê gốm #${orderCode} đã bị hủy`;
                    message = `Yêu cầu thuê đồ gốm sự kiện #${orderCode} đã được cập nhật trạng thái hủy bỏ trên hệ thống.`;
                    icon = 'ti-circle-x';
                }

                items.push({
                    id: notifId,
                    kind: 'notification',
                    type: 'order',
                    title,
                    message,
                    time: timeStr,
                    createdAtMs: ms,
                    isRead: readIds.has(notifId),
                    link: `${pathPrefix}tra-cuu-don-hang.html?orderId=${encodeURIComponent(orderCode)}`,
                    imageUrl,
                    icon,
                    totalAmount
                });
            }
        } else if (isPos) {
            const notifId = `order_${orderId}_pos`;
            if (!deletedIds.has(notifId)) {
                items.push({
                    id: notifId,
                    kind: 'notification',
                    type: 'order',
                    title: `Mua sắm tại quầy #${orderCode}`,
                    message: totalAmount > 0
                        ? `Cảm ơn bạn đã ghé showroom Tiệm Nhà Gốm! Đơn hàng trị giá ${formatVND(totalAmount)} và điểm tích lũy đã được ghi nhận vào tài khoản.`
                        : `Cảm ơn bạn đã ghé showroom Tiệm Nhà Gốm! Đơn hàng #${orderCode} và điểm tích lũy đã được ghi nhận vào tài khoản.`,
                    time: timeStr,
                    createdAtMs: ms,
                    isRead: readIds.has(notifId),
                    link: `${pathPrefix}profile/#orders`,
                    imageUrl,
                    icon: 'ti-building-store',
                    totalAmount
                });
            }
        } else {
            let stage = 'created';
            let title = `Đặt hàng thành công #${orderCode}`;
            let message = `Đơn hàng trực tuyến trị giá ${formatVND(totalAmount)} đã được Tiệm Nhà Gốm tiếp nhận và đang tiến hành đóng gói an toàn.`;
            let icon = 'ti-package';

            if (statusRaw.includes('hủy') || statusRaw.includes('cancel')) {
                stage = 'cancelled';
                title = `Đơn hàng #${orderCode} đã bị hủy`;
                message = `Đơn hàng #${orderCode} đã được cập nhật trạng thái hủy. Nếu cần hỗ trợ thêm, bạn vui lòng liên hệ hotline Tiệm Nhà Gốm nhé.`;
                icon = 'ti-circle-x';
            } else if (statusRaw.includes('hoàn tất') || statusRaw.includes('thành công') || statusRaw.includes('completed') || statusRaw.includes('delivered')) {
                stage = 'completed';
                title = `Giao hàng thành công #${orderCode}`;
                message = `Đơn hàng đồ gốm #${orderCode} đã giao thành công đến bạn! Cảm ơn bạn đã lựa chọn những tác phẩm từ Tiệm Nhà Gốm.`;
                icon = 'ti-circle-check';
            } else if (statusRaw.includes('giao') || statusRaw.includes('shipping') || statusRaw.includes('vận chuyển') || statusRaw.includes('đang chuyển')) {
                stage = 'shipping';
                title = `Đơn hàng #${orderCode} đang được giao`;
                message = `Đơn hàng #${orderCode} đã được đóng gói bọc xốp chống sốc và bàn giao cho đơn vị vận chuyển. Bạn chú ý điện thoại nhé!`;
                icon = 'ti-truck-delivery';
            }

            const notifId = `order_${orderId}_${stage}`;
            if (!deletedIds.has(notifId)) {
                items.push({
                    id: notifId,
                    kind: 'notification',
                    type: 'order',
                    title,
                    message,
                    time: timeStr,
                    createdAtMs: ms,
                    isRead: readIds.has(notifId),
                    link: `${pathPrefix}tra-cuu-don-hang.html?orderId=${encodeURIComponent(orderCode)}`,
                    imageUrl,
                    icon,
                    totalAmount
                });
            }
        }
    }

    return items;
}

// Tải danh sách thông báo từ Firestore
export async function loadNotificationFeed(pathPrefix = '') {
    if (!db) return [];

    const readIds = getStoredReadIds();
    const deletedIds = getStoredDeletedIds();
    const currentUser = auth ? auth.currentUser : null;
    const allItems = [];

    try {
        const queries = [
            // 1. Tin tức / Bài viết
            getDocs(query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(25))),
            // 2. Thông báo chung toàn hệ thống
            getDocs(query(collection(db, 'global_notifications'), orderBy('createdAt', 'desc'), limit(25)))
        ];

        // 3. Nếu user đã đăng nhập: Thông báo riêng & Đơn hàng của user
        if (currentUser && currentUser.uid) {
            queries.push(getDocs(query(collection(db, 'users', currentUser.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50))));
            queries.push(getDocs(query(collection(db, 'orders'), where('userId', '==', currentUser.uid), limit(25))));
        }

        const results = await Promise.allSettled(queries);

        // A. Xử lý bài viết tin tức
        if (results[0].status === 'fulfilled' && results[0].value) {
            results[0].value.docs.forEach((docSnap) => {
                if (deletedIds.has(docSnap.id)) return;
                const data = docSnap.data();
                const { timeStr, ms } = formatFriendlyTime(data.createdAt);
                const plainText = (data.content || '').replace(/<[^>]*>?/gm, '').trim();
                const excerpt = plainText.length > 110 ? plainText.substring(0, 110) + '...' : plainText;

                allItems.push({
                    id: docSnap.id,
                    kind: 'article',
                    type: 'news',
                    title: data.title || 'Bài viết từ Tiệm Nhà Gốm',
                    message: excerpt,
                    time: timeStr,
                    createdAtMs: ms,
                    isRead: readIds.has(docSnap.id),
                    imageUrl: data.imageUrl || 'Asset/images/hero-bg.jpg',
                    link: `${pathPrefix}blog/article.html?id=${encodeURIComponent(docSnap.id)}`,
                    icon: 'ti-news'
                });
            });
        }

        // B. Xử lý thông báo chung
        if (results[1].status === 'fulfilled' && results[1].value) {
            results[1].value.docs.forEach((docSnap) => {
                if (deletedIds.has(docSnap.id)) return;
                const data = docSnap.data();
                const { timeStr, ms } = formatFriendlyTime(data.createdAt);
                const notifType = data.type || 'promo';

                let icon = 'ti-tag';
                if (notifType === 'order') icon = 'ti-package';
                else if (notifType === 'system') icon = 'ti-shield-check';

                let link = normalizeWebLink(data.link, pathPrefix);
                if (!link && notifType === 'promo') link = `${pathPrefix}flash-sale/`;

                allItems.push({
                    id: docSnap.id,
                    kind: 'notification',
                    type: notifType,
                    title: data.title || 'Thông báo từ Tiệm Nhà Gốm',
                    message: data.body || data.message || '',
                    time: timeStr,
                    createdAtMs: ms,
                    isRead: readIds.has(docSnap.id),
                    imageUrl: data.imageUrl,
                    link,
                    icon
                });
            });
        }

        // C. Xử lý thông báo riêng của User
        if (results[2] && results[2].status === 'fulfilled' && results[2].value) {
            results[2].value.docs.forEach((docSnap) => {
                if (deletedIds.has(docSnap.id)) return;
                const data = docSnap.data();
                const { timeStr, ms } = formatFriendlyTime(data.createdAt);
                const notifType = data.type || 'system';

                let icon = 'ti-bell';
                if (notifType === 'order') icon = 'ti-package';
                else if (notifType === 'promo') icon = 'ti-tag';
                else if (notifType === 'gift' || data.isGift) icon = 'ti-gift';

                allItems.push({
                    id: docSnap.id,
                    kind: 'notification',
                    type: notifType,
                    title: data.title || 'Thông báo riêng cho bạn',
                    message: data.body || data.message || '',
                    time: timeStr,
                    createdAtMs: ms,
                    isRead: readIds.has(docSnap.id) || Boolean(data.isRead),
                    imageUrl: data.imageUrl,
                    link: normalizeWebLink(data.link, pathPrefix),
                    icon
                });
            });
        }

        // D. Xử lý thông báo từ đơn hàng
        if (results[3] && results[3].status === 'fulfilled' && results[3].value) {
            const rawOrders = results[3].value.docs.map(d => ({ id: d.id, ...d.data() }));
            const orderNotifs = generateOrderNotifications(rawOrders, readIds, deletedIds, pathPrefix);
            allItems.push(...orderNotifs);
        }

        // Sắp xếp theo thời gian mới nhất lên đầu
        allItems.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        feedItems = allItems;
    } catch (e) {
        console.warn('Lỗi tải danh sách thông báo Web:', e);
    }

    return feedItems;
}

// Cập nhật số lượng huy hiệu thông báo chưa đọc
function updateBadgeCount() {
    const badgeEl = document.getElementById('notif-count-badge');
    const pillEl = document.getElementById('notif-unread-pill-count');

    const totalUnread = feedItems.filter(it => !it.isRead).length;

    if (badgeEl) {
        if (totalUnread > 0) {
            badgeEl.innerText = totalUnread > 99 ? '99+' : totalUnread;
            badgeEl.style.display = 'flex';
        } else {
            badgeEl.style.display = 'none';
        }
    }

    if (pillEl) {
        pillEl.innerText = totalUnread > 0 ? `${totalUnread} mới` : 'Đã đọc hết';
    }

    // Cập nhật số badge trên các tab
    const tabs = ['all', 'news', 'promo', 'order', 'system'];
    tabs.forEach(tabId => {
        const tabBadge = document.getElementById(`notif-tab-badge-${tabId}`);
        if (tabBadge) {
            let count = 0;
            if (tabId === 'all') count = totalUnread;
            else if (tabId === 'news') count = feedItems.filter(it => it.kind === 'article' && !it.isRead).length;
            else count = feedItems.filter(it => it.kind === 'notification' && it.type === tabId && !it.isRead).length;

            if (count > 0) {
                tabBadge.innerText = count > 99 ? '99+' : count;
                tabBadge.style.display = 'inline-block';
            } else {
                tabBadge.style.display = 'none';
            }
        }
    });
}

// Đánh dấu 1 thông báo đã đọc
export async function markAsRead(id) {
    const item = feedItems.find(it => it.id === id);
    if (!item) return;
    item.isRead = true;

    const readIds = getStoredReadIds();
    readIds.add(id);
    saveStoredReadIds(readIds);

    updateBadgeCount();
    renderNotificationList();
}

// Đánh dấu tất cả là đã đọc
export async function markAllAsRead() {
    const readIds = getStoredReadIds();
    feedItems.forEach(it => {
        it.isRead = true;
        readIds.add(it.id);
    });
    saveStoredReadIds(readIds);

    updateBadgeCount();
    renderNotificationList();
}

// Xóa 1 thông báo khỏi danh sách
export async function deleteNotification(id, event) {
    if (event) event.stopPropagation();

    feedItems = feedItems.filter(it => it.id !== id);

    const deletedIds = getStoredDeletedIds();
    deletedIds.add(id);
    saveStoredDeletedIds(deletedIds);

    // Nếu có trong Firestore cá nhân thì xóa thầm lặng
    if (auth && auth.currentUser) {
        try {
            deleteDoc(doc(db, 'users', auth.currentUser.uid, 'notifications', id)).catch(() => { });
        } catch (_) { }
    }

    updateBadgeCount();
    renderNotificationList();
}

// Hiển thị modal xem chi tiết thông báo
export function showNotificationDetailModal(item) {
    let modalBackdrop = document.getElementById('notif-detail-modal');
    if (!modalBackdrop) {
        modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'notif-detail-modal';
        modalBackdrop.className = 'notif-modal-backdrop';
        document.body.appendChild(modalBackdrop);
    }

    let typeLabel = 'Thông báo';
    if (item.type === 'order') typeLabel = 'Đơn hàng';
    else if (item.type === 'promo') typeLabel = 'Ưu đãi & Khuyến mãi';
    else if (item.type === 'news') typeLabel = 'Tin tức gốm sứ';
    else if (item.type === 'system') typeLabel = 'Hệ thống';

    modalBackdrop.innerHTML = `
        <div class="notif-modal-card">
            <div class="notif-modal-header">
                <span class="notif-modal-tag"><i class="ti ${item.icon || 'ti-bell'}"></i> ${typeLabel}</span>
                <button type="button" class="notif-modal-close" onclick="window.closeNotifModal()">&times;</button>
            </div>
            <div class="notif-modal-body">
                ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}" class="notif-modal-img">` : ''}
                <h3 class="notif-modal-title">${item.title}</h3>
                <span class="notif-modal-time">${item.time}</span>
                <div class="notif-modal-text">${item.message}</div>
            </div>
            <div class="notif-modal-footer">
                ${item.link ? `<a href="${normalizeWebLink(item.link, pathPrefixGlobal)}" class="notif-modal-btn primary">Xem chi tiết &rarr;</a>` : ''}
                <button type="button" class="notif-modal-btn secondary" onclick="window.closeNotifModal()">Đóng</button>
            </div>
        </div>
    `;

    modalBackdrop.style.display = 'flex';
    modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) window.closeNotifModal();
    };
}

window.closeNotifModal = function () {
    const modalBackdrop = document.getElementById('notif-detail-modal');
    if (modalBackdrop) modalBackdrop.style.display = 'none';
};

// Hiển thị Toast thông báo nổi trên góc phải màn hình
export function showWebNotificationToast(item) {
    let toast = document.getElementById('web-notif-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'web-notif-toast';
        toast.className = 'web-notif-toast';
        document.body.appendChild(toast);
    }

    toast.className = 'web-notif-toast';
    toast.innerHTML = `
        <div class="toast-icon-wrap"><i class="ti ${item.icon || 'ti-bell'}"></i></div>
        <div class="toast-body" style="cursor: pointer;" onclick="window.handleNotifItemClick('${item.id}')">
            <h4 class="toast-title">${item.title}</h4>
            <p class="toast-message">${item.message}</p>
        </div>
        <button type="button" class="toast-close-btn" onclick="document.getElementById('web-notif-toast').classList.add('hiding')">&times;</button>
    `;

    setTimeout(() => {
        if (toast) toast.classList.add('hiding');
    }, 5000);
}

// Xử lý khi bấm vào 1 mục thông báo
window.handleNotifItemClick = async function (id) {
    const item = feedItems.find(it => it.id === id);
    if (!item) return;

    await markAsRead(id);

    // Đóng dropdown thông báo
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    isDropdownOpen = false;

    // Điều hướng theo loại
    if (item.link) {
        window.location.href = normalizeWebLink(item.link, pathPrefixGlobal);
        return;
    }

    // Nếu không có link, mở modal xem chi tiết
    showNotificationDetailModal(item);
};

window.handleDeleteNotif = function (id, event) {
    deleteNotification(id, event);
};

// Render danh sách thông báo theo filter đang chọn
function renderNotificationList() {
    const listEl = document.getElementById('notif-list-container');
    if (!listEl) return;

    // Lọc theo tab
    const filtered = feedItems.filter(item => {
        if (currentFilter === 'all') return true;
        if (currentFilter === 'news') return item.kind === 'article';
        return item.kind === 'notification' && item.type === currentFilter;
    });

    if (filtered.length === 0) {
        const empty = EMPTY_STATES[currentFilter] || EMPTY_STATES.all;
        listEl.innerHTML = `
            <div class="notif-empty-state">
                <div class="notif-empty-icon"><i class="ti ${empty.icon}"></i></div>
                <div class="notif-empty-title">${empty.title}</div>
                <p class="notif-empty-desc">${empty.desc}</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = filtered.map(item => {
        const isUnread = !item.isRead;
        return `
            <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="window.handleNotifItemClick('${item.id}')">
                <div class="notif-icon-box">
                    <i class="ti ${item.icon || 'ti-bell'}"></i>
                </div>
                <div class="notif-item-body">
                    <div class="notif-item-header">
                        <h4 class="notif-item-title">${item.title}</h4>
                        ${isUnread ? '<span class="notif-unread-dot"></span>' : ''}
                    </div>
                    <p class="notif-item-message">${item.message}</p>
                    <div class="notif-item-footer">
                        <span class="notif-item-time">${item.time}</span>
                        <button type="button" class="notif-btn-delete" title="Xóa thông báo" onclick="window.handleDeleteNotif('${item.id}', event)">
                            <i class="ti ti-trash"></i>
                        </button>
                    </div>
                </div>
                ${item.imageUrl && item.kind === 'article' ? `
                    <img src="${item.imageUrl}" alt="${item.title}" class="notif-item-thumb">
                ` : ''}
            </div>
        `;
    }).join('');
}

// Chuyển đổi tab lọc
window.switchNotifTab = function (tabId) {
    currentFilter = tabId;

    // Cập nhật class active cho nút tab
    const tabChips = document.querySelectorAll('.notif-tab-chip');
    tabChips.forEach(chip => {
        if (chip.getAttribute('data-tab') === tabId) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });

    renderNotificationList();
};

window.handleMarkAllNotifsRead = function () {
    markAllAsRead();
};

// Khởi tạo giao diện dropdown trung tâm thông báo
function buildNotificationDropdownUI(dropdownEl) {
    if (!dropdownEl) return;

    dropdownEl.innerHTML = `
        <div class="notif-dropdown-header">
            <div class="notif-title-group">
                <h3 class="notif-header-title">Thông báo</h3>
                <span class="notif-unread-pill" id="notif-unread-pill-count">0 mới</span>
            </div>
            <button type="button" class="notif-mark-read-btn" onclick="window.handleMarkAllNotifsRead()" title="Đánh dấu tất cả đã đọc">
                <i class="ti ti-checks"></i>
                <span>Đã đọc tất cả</span>
            </button>
        </div>

        <div class="notif-tabs-bar">
            <button type="button" class="notif-tab-chip active" data-tab="all" onclick="window.switchNotifTab('all')">
                <span>Tất cả</span>
                <span class="notif-tab-badge" id="notif-tab-badge-all" style="display: none;">0</span>
            </button>
            <button type="button" class="notif-tab-chip" data-tab="news" onclick="window.switchNotifTab('news')">
                <span>Tin tức &amp; Gốm</span>
                <span class="notif-tab-badge" id="notif-tab-badge-news" style="display: none;">0</span>
            </button>
            <button type="button" class="notif-tab-chip" data-tab="promo" onclick="window.switchNotifTab('promo')">
                <span>Khuyến mãi</span>
                <span class="notif-tab-badge" id="notif-tab-badge-promo" style="display: none;">0</span>
            </button>
            <button type="button" class="notif-tab-chip" data-tab="order" onclick="window.switchNotifTab('order')">
                <span>Đơn hàng</span>
                <span class="notif-tab-badge" id="notif-tab-badge-order" style="display: none;">0</span>
            </button>
            <button type="button" class="notif-tab-chip" data-tab="system" onclick="window.switchNotifTab('system')">
                <span>Hệ thống</span>
                <span class="notif-tab-badge" id="notif-tab-badge-system" style="display: none;">0</span>
            </button>
        </div>

        <div class="notif-list-container" id="notif-list-container">
            <div class="notif-empty-state">
                <div class="notif-empty-icon"><i class="ti ti-bell"></i></div>
                <div class="notif-empty-title">Đang đồng bộ thông báo...</div>
            </div>
        </div>

        <div class="notif-dropdown-footer">
            <a href="${pathPrefixGlobal}blog/" class="notif-footer-link">
                <span>Khám phá tin tức &amp; ưu đãi Tiệm Nhà Gốm</span>
                <i class="ti ti-arrow-right"></i>
            </a>
        </div>
    `;
}

// Bật / Tắt Dropdown thông báo
export function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    const btn = document.getElementById('btn-open-notifications');
    if (!dropdown || !btn) return;

    isDropdownOpen = !isDropdownOpen;
    if (isDropdownOpen) {
        dropdown.style.display = 'flex';
        btn.setAttribute('aria-expanded', 'true');
        renderNotificationList();
        updateBadgeCount();
    } else {
        dropdown.style.display = 'none';
        btn.setAttribute('aria-expanded', 'false');
    }
}

// Lắng nghe sự kiện click ngoài màn hình để đóng dropdown
function setupClickOutsideListeners() {
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('header-notif-wrapper');
        const dropdown = document.getElementById('notification-dropdown');
        if (!wrapper || !dropdown) return;

        if (isDropdownOpen && !wrapper.contains(e.target)) {
            dropdown.style.display = 'none';
            isDropdownOpen = false;
            const btn = document.getElementById('btn-open-notifications');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDropdownOpen) {
            const dropdown = document.getElementById('notification-dropdown');
            if (dropdown) dropdown.style.display = 'none';
            isDropdownOpen = false;
        }
    });
}

// Khởi tạo toàn bộ Hệ thống Thông báo trên Web
export async function initWebNotifications(pathPrefix = '') {
    pathPrefixGlobal = pathPrefix;

    const btnOpen = document.getElementById('btn-open-notifications');
    const dropdown = document.getElementById('notification-dropdown');

    if (btnOpen && !btnOpen.dataset.bound) {
        btnOpen.dataset.bound = 'true';
        btnOpen.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleNotificationDropdown();
        });
    }

    if (dropdown) {
        buildNotificationDropdownUI(dropdown);
    }

    if (!hasInitialized) {
        setupClickOutsideListeners();
        hasInitialized = true;
    }

    // Tải dữ liệu ban đầu
    await loadNotificationFeed(pathPrefix);
    updateBadgeCount();
    renderNotificationList();

    // Lắng nghe đăng nhập / đăng xuất để làm mới feed
    if (auth && !window.__notifAuthBound) {
        window.__notifAuthBound = true;
        auth.onAuthStateChanged(async (user) => {
            await loadNotificationFeed(pathPrefixGlobal);
            updateBadgeCount();
            renderNotificationList();
        });
    }
}

// Gắn sẵn vào window để tiện gọi từ utils.js hoặc console
window.initWebNotifications = initWebNotifications;

