import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    db, auth, rtdb, storage, showToast, logout, DEFAULT_PRODUCT_CATEGORIES, formatPhoneNumber,
    fetchFlashSaleSettings, getProductCurrentPrice, globalFlashSaleSettings, getMembershipTier, generateOrderId, COLOR_MAP
} from "./utils.js";
import {
    doc, setDoc, deleteDoc, collection, onSnapshot, getDoc, getDocs, query, orderBy,
    limit, startAfter, endBefore, limitToLast, where, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { ref as dbRef, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

// Biến cục bộ để lưu trữ danh mục động
let adminDynamicCategories = []; // adminDynamicCategories sẽ là một MẢNG các đối tượng nhóm danh mục
let adminCollections = []; // Mảng chứa danh sách bộ sưu tập
let adminEvents = []; // Mảng chứa danh sách dự án sự kiện
let inventoryLogsLocal = []; // Mảng chứa dữ liệu nhật ký kho để lọc nhanh
let posUsersLocal = []; // Danh sách khách hàng để tìm kiếm nhanh trong POS
let userOrderCounts = {}; // Lưu trữ số lượng đơn hàng theo userId: { uid: count }
let userTotalSpentLocal = {}; // Lưu trữ tổng chi tiêu theo userId để thăng hạng
let currentReportData = null; // Lưu trữ dữ liệu báo cáo hiện tại để xuất Excel
let currentAdminRole = 'staff'; // Quyền mặc định
let bluetoothDevice = null;
let btCharacteristic = null;
let lastCreatedOrderId = null; // Lưu ID đơn vừa tạo để in lại nhanh

// Lắng nghe dữ liệu người dùng trực tuyến (Realtime Presence & Page View Tracking)
function listenToOnlineUsers() {
    if (!rtdb) return;
    const presenceRef = dbRef(rtdb, 'presence');
    onValue(presenceRef, (snap) => {
        let totalCount = 0;
        let mobileCount = 0;
        let desktopCount = 0;
        let memberCount = 0;
        let usersList = [];

        if (snap.exists()) {
            const data = snap.val();
            const keys = Object.keys(data);
            totalCount = keys.length;

            usersList = keys.map(key => {
                const item = data[key] || {};
                const device = item.deviceType || 'Desktop';
                if (device === 'Mobile' || device === 'Tablet') {
                    mobileCount++;
                } else {
                    desktopCount++;
                }

                if (item.isGuest === false || item.userEmail) {
                    memberCount++;
                }

                return {
                    id: key,
                    userName: item.userName || 'Khách vãng lai',
                    userEmail: item.userEmail || null,
                    isGuest: item.isGuest !== false,
                    pageTitle: item.pageTitle || 'Đang duyệt web',
                    pageUrl: item.pageUrl || '/',
                    os: item.os || 'Khác',
                    browser: item.browser || 'Trình duyệt',
                    deviceType: item.deviceType || 'Desktop',
                    referrer: item.referrer || 'Trực tiếp',
                    location: item.location || 'Chưa rõ',
                    cartCount: Number(item.cartCount) || 0,
                    cartTotal: Number(item.cartTotal) || 0,
                    utmSource: item.utmSource || null,
                    utmCampaign: item.utmCampaign || null,
                    journeyHistory: Array.isArray(item.journeyHistory) ? item.journeyHistory : [item.pageTitle || 'Trang chủ'],
                    startTime: item.startTime || item.lastChanged || Date.now(),
                    lastChanged: item.lastChanged || Date.now()
                };
            });
        }

        // Cập nhật các con số thống kê
        const countEl = document.getElementById('online-users-count');
        if (countEl) countEl.innerText = totalCount;

        const mobileEl = document.getElementById('online-mobile-count');
        if (mobileEl) mobileEl.innerText = mobileCount;

        const desktopEl = document.getElementById('online-desktop-count');
        if (desktopEl) desktopEl.innerText = desktopCount;

        const memberEl = document.getElementById('online-member-count');
        if (memberEl) memberEl.innerText = memberCount;

        const updatedEl = document.getElementById('online-last-updated');
        if (updatedEl) {
            const now = new Date();
            updatedEl.innerText = `Cập nhật: ${now.toLocaleTimeString('vi-VN')}`;
        }

        const statEl = document.getElementById('stat-online-users');
        if (statEl) statEl.innerText = totalCount;

        // Render bảng chi tiết
        renderOnlineUsersTable(usersList);
    });
}

function safeHtmlStr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatOnlineTimeAgo(timestamp) {
    if (!timestamp) return 'Vừa xong';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 10) return 'Vừa xong';
    if (diff < 60) return `${diff} giây trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    return `${Math.floor(diff / 3600)} giờ trước`;
}

function renderOnlineUsersTable(usersList) {
    const tbody = document.getElementById('online-users-table-body');
    if (!tbody) return;

    if (usersList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #888;">
                    Chưa có người dùng nào đang trực tuyến.
                </td>
            </tr>
        `;
        return;
    }

    // Sắp xếp người mới vào hoặc mới tương tác lên đầu
    usersList.sort((a, b) => b.startTime - a.startTime);

    tbody.innerHTML = usersList.map(u => {
        const timeAgo = formatOnlineTimeAgo(u.startTime);
        const deviceIcon = u.deviceType === 'Mobile' ? '📱' : (u.deviceType === 'Tablet' ? '📟' : '💻');
        const userAvatar = u.isGuest ? '👤' : '⭐';
        const userBadge = u.isGuest 
            ? `<span style="font-size:0.75rem; background:#f0f0f0; color:#666; padding:2px 8px; border-radius:4px;">Khách</span>`
            : `<span style="font-size:0.75rem; background:#e3f2fd; color:#1565c0; padding:2px 8px; border-radius:4px; font-weight:600;">Thành viên</span>`;

        let osColor = '#555';
        if (u.os === 'iOS' || u.os === 'macOS') osColor = '#111';
        else if (u.os === 'Android') osColor = '#2e7d32';
        else if (u.os === 'Windows') osColor = '#0277bd';

        const cartBadge = u.cartCount > 0
            ? `<span style="background:#e8f5e9; color:#2e7d32; padding:4px 10px; border-radius:6px; font-weight:600; font-size:0.82rem; border:1px solid #c8e6c9; display:inline-block;">🛒 ${u.cartCount} món (${u.cartTotal.toLocaleString('vi-VN')}đ)</span>`
            : `<span style="color:#aaa; font-size:0.8rem;">Trống (0đ)</span>`;

        const journeyStr = u.journeyHistory.map(p => safeHtmlStr(p)).join(' ➔ ');

        const utmDisplay = u.utmSource
            ? `<div style="font-size:0.78rem; color:#e65100; font-weight:600; margin-bottom:2px;">🎯 QC: ${safeHtmlStr(u.utmSource)} ${u.utmCampaign ? `(${safeHtmlStr(u.utmCampaign)})` : ''}</div>`
            : '';

        return `
            <tr style="border-bottom: 1px solid #f0f0f0; font-size: 0.88rem;">
                <td style="padding: 12px 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.3rem;">${userAvatar}</span>
                        <div>
                            <div style="font-weight: 600; color: #333;">${safeHtmlStr(u.userName)}</div>
                            <div style="display: flex; gap: 6px; align-items: center; margin-top: 3px;">
                                ${userBadge}
                                ${u.userEmail ? `<span style="font-size: 0.75rem; color: #666;">${safeHtmlStr(u.userEmail)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </td>
                <td style="padding: 12px 10px; max-width: 250px;">
                    <div style="font-weight: 600; color: #2e7d32; display: flex; align-items: center; gap: 4px;">
                        <span>📄</span> <span>${safeHtmlStr(u.pageTitle)}</span>
                    </div>
                    <a href="${safeHtmlStr(u.pageUrl)}" target="_blank" style="font-size: 0.75rem; color: #1976d2; text-decoration: none; word-break: break-all; display: inline-block; margin-top: 2px;">
                        ${safeHtmlStr(u.pageUrl)} ↗
                    </a>
                    ${u.journeyHistory.length > 1 ? `<div style="font-size:0.73rem; color:#777; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${journeyStr}">🗺️ ${journeyStr}</div>` : ''}
                </td>
                <td style="padding: 12px 10px;">
                    ${cartBadge}
                </td>
                <td style="padding: 12px 10px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 1.1rem;">${deviceIcon}</span>
                        <div>
                            <span style="font-weight: 600; color: ${osColor};">${safeHtmlStr(u.os)}</span>
                            <span style="color: #666; font-size: 0.8rem;"> • ${safeHtmlStr(u.browser)}</span>
                        </div>
                    </div>
                </td>
                <td style="padding: 12px 10px;">
                    ${utmDisplay}
                    <span style="background: #f5f5f5; color: #444; padding: 3px 8px; border-radius: 10px; font-size: 0.78rem; border: 1px solid #eee; display: inline-block;">
                        🌐 ${safeHtmlStr(u.referrer)}
                    </span>
                </td>
                <td style="padding: 12px 10px;">
                    <span style="color: #333; font-weight: 500; font-size: 0.83rem;">
                        📍 ${safeHtmlStr(u.location)}
                    </span>
                </td>
                <td style="padding: 12px 10px; color: #666; font-size: 0.82rem;">
                    ${timeAgo}
                </td>
                <td style="padding: 12px 10px; text-align: center;">
                    <span style="display: inline-flex; align-items: center; gap: 4px; color: #2e7d32; font-weight: 600; font-size: 0.8rem; background: #e8f5e9; padding: 4px 10px; border-radius: 12px; border: 1px solid #c8e6c9;">
                        <span style="width: 6px; height: 6px; background: #2e7d32; border-radius: 50%;"></span> Online
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

listenToOnlineUsers();

let currentAdminPermissions = []; // Danh sách các ID section được phép truy cập

// Danh sách tất cả các phân hệ có trong hệ thống
const ALL_SECTIONS = [
    { id: 'overview-section', label: 'Tổng quan' },
    { id: 'product-section', label: 'Sản phẩm' },
    { id: 'banner-section', label: 'Banner' },
    { id: 'pos-section', label: 'Bán tại shop (POS)' },
    { id: 'order-section', label: 'Đơn hàng' },
    { id: 'rental-order-section', label: 'Đơn thuê đồ' },
    { id: 'coupon-section', label: 'Mã giảm giá' },
    { id: 'category-section', label: 'Danh mục' },
    { id: 'user-section', label: 'Người dùng' },
    { id: 'admin-account-section', label: 'Quản trị viên' },
    { id: 'stats-section', label: 'Thống kê' },
    { id: 'flash-sale-settings-section', label: 'Cài đặt Flash Sale' },
    { id: 'inventory-log-section', label: 'Nhật ký kho' },
    { id: 'news-section', label: 'Tin tức' },
    { id: 'collections-section', label: 'Bộ sưu tập' },
    { id: 'events-section', label: 'Dự án sự kiện' },
    { id: 'online-users-section', label: 'Lượng truy cập' },
    { id: 'maintenance-section', label: 'Bảo trì' }
];

// Cấu hình phân quyền mặc định theo Role (Fallback)
const ROLE_PERMISSIONS = {
    super_admin: ALL_SECTIONS.map(s => s.id), // Tự động bao gồm tất cả các section cho super_admin
    staff: ['overview-section', 'pos-section', 'order-section', 'rental-order-section', 'flash-sale-settings-section', 'product-section'] // Thêm mục Sale và Sản phẩm cho Staff
};

// --- Logic chuyển đổi Tab Admin ---
function setupAdminTabs() {
    const tabs = document.querySelectorAll('.admin-tab-btn');
    const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');
    const sections = document.querySelectorAll('.admin-section');
    const titleEl = document.getElementById('current-tab-title');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-target');

            // Kiểm tra quyền truy cập tab
            if (!currentAdminPermissions.includes(targetId)) {
                showToast("Bạn không có quyền truy cập chức năng này", "error");
                return;
            }

            // Xóa trạng thái active của tất cả các tab và section
            tabs.forEach(t => t.classList.remove('active'));
            bottomNavBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            // Tự động đóng tất cả dropdown menu
            document.querySelectorAll('.kiot-nav-item').forEach(item => item.classList.remove('open'));

            // Kích hoạt tab và section được chọn
            tab.classList.add('active');
            document.querySelectorAll('.kiot-nav-item').forEach(item => item.classList.remove('active'));
            const parentNavItem = tab.closest('.kiot-nav-item');
            if (parentNavItem) parentNavItem.classList.add('active');

            const correspondingBottomBtn = document.querySelector(`.bottom-nav-btn[data-target="${targetId}"]`);
            if (correspondingBottomBtn) correspondingBottomBtn.classList.add('active');

            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
                // Cập nhật tiêu đề trang tương ứng với Tab
                if (titleEl) titleEl.innerText = tab.innerText.replace(/[^\w\sÀ-ỹ]/g, '').trim();
            }

            if (targetId === 'overview-section') {
                initOverview();
            }

            if (targetId === 'banner-section') {
                initBannerManagement();
            }

            if (targetId === 'category-section') {
                initCategoryManagement();
            }

            // Nếu chuyển sang tab Thống kê, khởi tạo lại biểu đồ để tránh lỗi hiển thị (ID tab là stats-section)
            if (targetId === 'stats-section') {
                initFullReport();
            }

            if (targetId === 'maintenance-section') {
                initMaintenanceSettings();
            }

            if (targetId === 'admin-account-section') {
                initAdminAccountListener();
            }

            if (targetId === 'news-section') {
                initNewsManagement();
            }

            if (targetId === 'collections-section') {
                initCollectionManagement();
            }

            if (targetId === 'events-section') {
                initEventManagement();
            }

            if (targetId === 'flash-sale-settings-section') {
                initFlashSaleSettings();
            }

            if (targetId === 'pos-section') {
                if (typeof window.initPOSBills === 'function') window.initPOSBills();
            }
        });
    });

    // Xử lý bật/tắt Dropdown khi BẤM MỞ hoặc BẤM NGOÀI
    document.querySelectorAll('.kiot-nav-item').forEach(navItem => {
        const btn = navItem.querySelector('.kiot-nav-btn');
        const dropdown = navItem.querySelector('.kiot-dropdown-menu');

        if (btn && dropdown) {
            btn.addEventListener('click', (e) => {
                // Nếu là nút kích hoạt Dropdown (không có data-target trực tiếp)
                if (!btn.getAttribute('data-target')) {
                    e.stopPropagation();
                    const isOpen = navItem.classList.contains('open');
                    document.querySelectorAll('.kiot-nav-item').forEach(i => i.classList.remove('open'));
                    if (!isOpen) navItem.classList.add('open');
                }
            });
        }
    });

    // Đóng dropdown khi bấm bất kỳ đâu ngoài Topbar
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.kiot-nav-item')) {
            document.querySelectorAll('.kiot-nav-item').forEach(i => i.classList.remove('open'));
        }
    });
}

function closeAdminSidebar() {
    const adminSidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('admin-sidebar-overlay');
    if (adminSidebar) adminSidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

// Thiết lập Auth Listener để cập nhật UI Header và kiểm tra quyền Admin
async function checkAdminRights(user) {
    // 1. Chuyển hướng ngay lập tức nếu chưa đăng nhập
    if (!user) {
        window.location.href = "../index.html";
        return;
    }

    try {
        // Kiểm tra xem UID của user có trong collection 'admins' không
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            window.location.href = "../index.html";
        } else {
            const adminData = adminSnap.data();
            if (adminData.isLocked) {
                showToast("Tài khoản của bạn hiện đang bị khóa tạm thời.", "error");
                logout().then(() => window.location.href = "../index.html");
                return;
            }
            currentAdminRole = adminData.role || 'staff'; // Lấy vai trò hiện tại

            if (currentAdminRole === 'super_admin') {
                const allSectionIds = ALL_SECTIONS.map(s => s.id);
                // Đảm bảo super_admin luôn có tất cả các quyền
                currentAdminPermissions = allSectionIds;
            } else {
                // Với các vai trò khác, ưu tiên quyền chi tiết đã lưu, nếu không thì dùng quyền mặc định theo vai trò
                currentAdminPermissions = adminData.permissions || ROLE_PERMISSIONS[currentAdminRole] || ROLE_PERMISSIONS['staff'];
            }

            // Nếu đúng là admin thì mới hiển thị nội dung trang
            const adminBody = document.querySelector('.admin-dashboard-layout');
            if (adminBody) {
                adminBody.style.display = "block";
                // Không áp dụng hiệu ứng có transform lên body vì sẽ làm hỏng position: fixed của sidebar.
                // Thay vào đó, áp dụng hiệu ứng cho phần nội dung chính.
                const mainContent = document.querySelector('.admin-main-content');
                if (mainContent) mainContent.classList.add('fade-in-content');
            }
            updateAdminSidebarProfile(user, adminData);
            applyRoleToSidebar();
        }
    } catch (e) { console.error(e); }
}

function updateAdminSidebarProfile(user, adminData) {
    const container = document.getElementById('admin-user-info');
    if (!container) return;
    const roleNames = { super_admin: 'Quản trị tối cao', manager: 'Quản lý', staff: 'Nhân viên' };
    container.innerHTML = `
        <p style="font-weight:600; font-size:0.9rem; margin-bottom:4px;">${user.displayName || user.email}</p>
        <p style="font-size:0.7rem; color:#f1c40f; font-weight:600;">${roleNames[currentAdminRole] || 'Nhân viên'}</p>
    `;
}

function applyRoleToSidebar() {
    const tabs = document.querySelectorAll('.admin-tab-btn');

    tabs.forEach(tab => {
        const target = tab.getAttribute('data-target');
        if (!currentAdminPermissions.includes(target)) {
            tab.style.display = 'none'; // Ẩn các tab không có quyền
        } else {
            tab.style.display = 'flex';
        }
    });

    // Ẩn nhóm kiot-nav-item nếu tất cả sub-tab bên trong đều bị ẩn theo quyền
    document.querySelectorAll('.kiot-nav-item').forEach(navItem => {
        const subTabs = navItem.querySelectorAll('.admin-tab-btn');
        if (subTabs.length > 0) {
            const hasVisibleSubTab = Array.from(subTabs).some(t => t.style.display !== 'none');
            navItem.style.display = hasVisibleSubTab ? 'flex' : 'none';
        }
    });
}

// --- Logic Thông báo Đơn hàng mới ---
function setupNewOrderNotification() {
    if (!("Notification" in window) || !db) return;

    // Khởi tạo đối tượng âm thanh
    const notificationSound = new Audio('../Asset/sounds/new-order.mp3');

    // Biến để bỏ qua lần đọc dữ liệu đầu tiên (Firestore trả về dữ liệu hiện có ngay khi gắn listener)
    let isInitialLoad = true;

    // Lắng nghe đơn hàng mới nhất
    const q = query(collection(db, "orders"), orderBy("orderDate", "desc"), limit(1));

    onSnapshot(q, (snapshot) => {
        if (isInitialLoad) {
            isInitialLoad = false;
            return;
        }

        snapshot.docChanges().forEach((change) => {
            // Chỉ xử lý khi có tài liệu mới được thêm vào
            if (change.type === "added") {
                const order = change.doc.data();
                const customerName = order.shippingAddress?.fullName || "Khách hàng";
                const total = new Intl.NumberFormat('vi-VN').format(order.totalAmount) + 'đ';

                // Phát âm thanh thông báo
                notificationSound.play().catch(e => console.warn("Trình duyệt chặn tự động phát âm thanh:", e));

                showToast(`🔔 Đơn hàng mới từ ${customerName}: ${total}`, "success");

                if (Notification.permission === "granted") {
                    new Notification("Tiệm Nhà Gốm: Đơn hàng mới!", {
                        body: `Khách hàng: ${customerName}\nTổng cộng: ${total}`,
                        icon: "../Asset/icons/favicon.png"
                    });
                }
            }
        });
    }, (error) => {
        console.error("New order notification listener error:", error);
    });
}

// Lắng nghe số lượng đơn hàng "Đang xử lý" để cập nhật badge sidebar
function initUnprocessedOrderBadge() {
    const badge = document.getElementById('order-count-badge');
    if (!badge || !db) return;

    const q = query(collection(db, "orders"), where("status", "==", "Đang xử lý"));
    onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }, (error) => {
        console.error("Order badge listener error:", error);
    });
}

// Hàm hiệu ứng số nhảy từ 0 đến giá trị đích
function animateNumber(id, target, isCurrency = false, duration = 1000) {
    const el = document.getElementById(id);
    if (!el) return;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * target);

        if (isCurrency) {
            el.innerText = new Intl.NumberFormat('vi-VN').format(current) + ' VND';
        } else {
            el.innerText = new Intl.NumberFormat('vi-VN').format(current);
        }

        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

let overviewCharts = {};
let overviewOrdersData = [];
let activeRevenueTab = 'day';

async function initOverview() {
    try {
        // Lấy dữ liệu thực tế từ cả Đơn mua hàng & Đơn thuê đồ Decor
        const [orderSnap, rentalSnap] = await Promise.all([
            getDocs(collection(db, "orders")),
            getDocs(collection(db, "rental_orders")).catch(() => ({ docs: [] }))
        ]);

        const standardOrders = orderSnap.docs.map(d => ({ id: d.id, orderType: 'standard', ...d.data() }));
        const rentalOrders = rentalSnap.docs ? rentalSnap.docs.map(d => ({ id: d.id, orderType: 'rental', ...d.data() })) : [];

        overviewOrdersData = [...standardOrders, ...rentalOrders];

        // 1. Cập nhật chỉ số Kết quả bán hàng hôm nay
        updateTodayMetrics(overviewOrdersData);

        // 2. Biểu đồ Doanh Thu Thuần
        const revPeriod = document.getElementById('kiot-revenue-period-filter')?.value || 'month';
        renderNetRevenueChart(overviewOrdersData, revPeriod, activeRevenueTab);

        // 3. Biểu đồ Top 10 Hàng Bán Chạy
        const prodPeriod = document.getElementById('kiot-top-product-period')?.value || 'month';
        renderTopProductsChart(overviewOrdersData, prodPeriod);

        // 4. Biểu đồ Top 10 Khách Mua Nhiều Nhất
        const custPeriod = document.getElementById('kiot-top-customer-period')?.value || 'month';
        renderTopCustomersChart(overviewOrdersData, custPeriod);

        // 5. Live Feed Hoạt Động Gần Đây
        renderRecentActivities(overviewOrdersData);

        // 6. Đăng ký Sự kiện Tương tác Thời Gian Thực cho Bộ Lọc
        bindOverviewEventListeners();

    } catch (e) {
        console.error("Lỗi khởi tạo KiotViet Overview:", e);
    }
}

// Cập nhật Chỉ số Kết quả bán hàng hôm nay & Tăng trưởng
function updateTodayMetrics(orders) {
    const todayStr = new Date().toLocaleDateString('en-GB');

    let todayRevenue = 0;
    let todayOrderCount = 0;
    let yesterdayRevenue = 0;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-GB');

    orders.forEach(o => {
        if (o.status === "Đã hủy") return;
        const dateStr = o.orderDate ? o.orderDate.toDate().toLocaleDateString('en-GB') : null;
        const amount = Number(o.totalAmount) || 0;

        if (dateStr === todayStr) {
            todayOrderCount++;
            todayRevenue += amount;
        } else if (dateStr === yesterdayStr) {
            yesterdayRevenue += amount;
        }
    });

    // Tỷ lệ tăng trưởng so với hôm qua
    let growthToday = 0;
    if (yesterdayRevenue > 0) {
        growthToday = Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100);
    } else if (todayRevenue > 0) {
        growthToday = 100;
    }

    const elTodayRev = document.getElementById('kiot-today-revenue');
    if (elTodayRev) elTodayRev.innerText = `${new Intl.NumberFormat('vi-VN').format(todayRevenue)} VND`;

    const elTodayOrders = document.getElementById('kiot-today-orders-count');
    if (elTodayOrders) elTodayOrders.innerText = `${todayOrderCount} hóa đơn`;

    const elGrowthToday = document.getElementById('kiot-revenue-growth-today');
    if (elGrowthToday) {
        elGrowthToday.innerText = `${growthToday >= 0 ? '+' : ''}${growthToday}%`;
        elGrowthToday.className = `metric-value ${growthToday >= 0 ? 'green-text' : 'red-text'}`;
    }
}

// Đăng ký Event Listeners cho tất cả bộ lọc trên Overview
function bindOverviewEventListeners() {
    // A. Bộ lọc thời gian cho Biểu đồ Doanh Thu Thuần
    const revPeriodSelect = document.getElementById('kiot-revenue-period-filter');
    if (revPeriodSelect) {
        revPeriodSelect.onchange = (e) => {
            renderNetRevenueChart(overviewOrdersData, e.target.value, activeRevenueTab);
        };
    }

    // B. Tab Chuyển đổi Đơn vị (Theo ngày / Theo giờ / Theo thứ)
    const tabButtons = document.querySelectorAll('.kiot-tab-bar .kiot-tab-item');
    tabButtons.forEach(btn => {
        btn.onclick = (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeRevenueTab = e.currentTarget.getAttribute('data-chart-tab') || 'day';
            const period = document.getElementById('kiot-revenue-period-filter')?.value || 'month';
            renderNetRevenueChart(overviewOrdersData, period, activeRevenueTab);
        };
    });

    // C. Bộ lọc Top 10 Hàng bán chạy
    const prodPeriodSelect = document.getElementById('kiot-top-product-period');
    if (prodPeriodSelect) {
        prodPeriodSelect.onchange = (e) => {
            renderTopProductsChart(overviewOrdersData, e.target.value);
        };
    }

    // D. Bộ lọc Top 10 Khách mua nhiều nhất
    const custPeriodSelect = document.getElementById('kiot-top-customer-period');
    if (custPeriodSelect) {
        custPeriodSelect.onchange = (e) => {
            renderTopCustomersChart(overviewOrdersData, e.target.value);
        };
    }

    // E. Đăng ký sự kiện click cho các Widget sidebar
    const widgetCards = document.querySelectorAll('.kiot-widget-card');
    if (widgetCards.length >= 3) {
        widgetCards[0].onclick = () => document.querySelector('.admin-tab-btn[data-target="pos-section"]')?.click();
        widgetCards[1].onclick = () => document.querySelector('.admin-tab-btn[data-target="coupon-section"]')?.click();
        widgetCards[2].onclick = () => document.querySelector('.admin-tab-btn[data-target="maintenance-section"]')?.click();
    }
}

// Lọc đơn hàng theo khoảng thời gian
function filterOrdersByPeriod(orders, period) {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-GB');

    return orders.filter(o => {
        if (!o.orderDate || o.status === "Đã hủy") return false;
        const d = o.orderDate.toDate();

        if (period === 'today') {
            return d.toLocaleDateString('en-GB') === todayStr;
        }
        if (period === 'week') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            return d >= oneWeekAgo;
        }
        if (period === 'month') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (period === 'year') {
            return d.getFullYear() === now.getFullYear();
        }
        return true; // 'all'
    });
}

// Render Biểu đồ Doanh Thu Thuần
function renderNetRevenueChart(orders, period = 'month', viewTab = 'day') {
    const ctx = document.getElementById('overview-net-revenue-chart');
    if (!ctx) return;

    const filteredOrders = filterOrdersByPeriod(orders, period);

    let labels = [];
    let dataValues = [];

    if (viewTab === 'hour') {
        // Group by Hour (00h..23h)
        labels = Array.from({ length: 24 }, (_, i) => `${i < 10 ? '0' + i : i}:00`);
        dataValues = new Array(24).fill(0);

        filteredOrders.forEach(o => {
            const h = o.orderDate.toDate().getHours();
            dataValues[h] += Number(o.totalAmount) || 0;
        });

    } else if (viewTab === 'weekday') {
        // Group by Day of Week (Thứ 2..Chủ Nhật)
        labels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
        dataValues = new Array(7).fill(0);

        filteredOrders.forEach(o => {
            const dayIdx = o.orderDate.toDate().getDay(); // 0 = Sun, 1 = Mon...
            const targetIdx = dayIdx === 0 ? 6 : dayIdx - 1;
            dataValues[targetIdx] += Number(o.totalAmount) || 0;
        });

    } else {
        // Default: Group by Day of Month
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        labels = Array.from({ length: daysInMonth }, (_, i) => i < 9 ? `0${i + 1}` : `${i + 1}`);
        dataValues = new Array(daysInMonth).fill(0);

        filteredOrders.forEach(o => {
            const dayNum = o.orderDate.toDate().getDate();
            if (dayNum <= daysInMonth) {
                dataValues[dayNum - 1] += Number(o.totalAmount) || 0;
            }
        });
    }

    const totalNetRevenue = dataValues.reduce((sum, val) => sum + val, 0);
    const totalBadge = document.getElementById('kiot-net-revenue-total');
    if (totalBadge) totalBadge.innerText = `${new Intl.NumberFormat('vi-VN').format(totalNetRevenue)} VND`;

    if (overviewCharts.netRevenue) {
        overviewCharts.netRevenue.destroy();
    }

    overviewCharts.netRevenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Doanh thu thuần',
                data: dataValues,
                backgroundColor: '#0066cc',
                borderRadius: 4,
                borderSkipped: false,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeOutQuart',
                delay: (context) => {
                    let delay = 0;
                    if (context.type === 'data' && context.mode === 'default') {
                        delay = context.dataIndex * 35;
                    }
                    return delay;
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${new Intl.NumberFormat('vi-VN').format(context.raw)} VND`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                },
                y: {
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { size: 11 },
                        callback: (val) => val >= 1000000 ? (val / 1000000) + ' tr' : val
                    }
                }
            }
        }
    });
}

// Render Biểu đồ Top 10 Hàng Bán Chạy (Horizontal Bar Chart)
function renderTopProductsChart(orders, period = 'month') {
    const ctx = document.getElementById('overview-top-products-chart');
    if (!ctx) return;

    const filteredOrders = filterOrdersByPeriod(orders, period);
    const productSalesMap = {};

    filteredOrders.forEach(o => {
        if (!Array.isArray(o.items)) return;
        o.items.forEach(item => {
            const name = item.name || 'Sản phẩm không tên';
            const revenue = (Number(item.price) || 0) * (Number(item.quantity) || 1);
            productSalesMap[name] = (productSalesMap[name] || 0) + revenue;
        });
    });

    const sortedProducts = Object.entries(productSalesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedProducts.length > 0 ? sortedProducts.map(p => p[0].length > 20 ? p[0].substring(0, 18) + '...' : p[0]) : ['Chưa có dữ liệu'];
    const values = sortedProducts.length > 0 ? sortedProducts.map(p => p[1]) : [0];

    if (overviewCharts.topProducts) {
        overviewCharts.topProducts.destroy();
    }

    overviewCharts.topProducts = new Chart(ctx, {
        type: 'bar',
        indexAxis: 'y',
        data: {
            labels: labels,
            datasets: [{
                label: 'Doanh thu sản phẩm',
                data: values,
                backgroundColor: '#0066cc',
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeOutQuart',
                delay: (context) => {
                    let delay = 0;
                    if (context.type === 'data' && context.mode === 'default') {
                        delay = context.dataIndex * 50;
                    }
                    return delay;
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${new Intl.NumberFormat('vi-VN').format(ctx.raw)} VND`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { size: 10 },
                        callback: (val) => val >= 1000000 ? (val / 1000000) + ' tr' : val
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

// Render Biểu đồ Top 10 Khách Mua Nhiều Nhất (Horizontal Bar Chart)
function renderTopCustomersChart(orders, period = 'month') {
    const ctx = document.getElementById('overview-top-customers-chart');
    if (!ctx) return;

    const filteredOrders = filterOrdersByPeriod(orders, period);
    const customerSpentMap = {};

    filteredOrders.forEach(o => {
        const name = o.shippingAddress?.fullName || o.customerName || 'Khách vãng lai';
        const amount = Number(o.totalAmount) || 0;
        customerSpentMap[name] = (customerSpentMap[name] || 0) + amount;
    });

    const sortedCustomers = Object.entries(customerSpentMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedCustomers.length > 0 ? sortedCustomers.map(c => c[0].length > 18 ? c[0].substring(0, 16) + '...' : c[0]) : ['Chưa có dữ liệu'];
    const values = sortedCustomers.length > 0 ? sortedCustomers.map(c => c[1]) : [0];

    if (overviewCharts.topCustomers) {
        overviewCharts.topCustomers.destroy();
    }

    overviewCharts.topCustomers = new Chart(ctx, {
        type: 'bar',
        indexAxis: 'y',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tổng chỉ tiêu',
                data: values,
                backgroundColor: '#0066cc',
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeOutQuart',
                delay: (context) => {
                    let delay = 0;
                    if (context.type === 'data' && context.mode === 'default') {
                        delay = context.dataIndex * 50;
                    }
                    return delay;
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${new Intl.NumberFormat('vi-VN').format(ctx.raw)} VND`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { size: 10 },
                        callback: (val) => val >= 1000000 ? (val / 1000000) + ' tr' : val
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

// Render Timeline Hoạt Động Gần Đây (Có liên kết mở chi tiết Đơn hàng)
function renderRecentActivities(orders) {
    const container = document.getElementById('overview-recent-activities');
    if (!container) return;

    const recentOrders = [...orders]
        .sort((a, b) => (b.orderDate?.toDate() || 0) - (a.orderDate?.toDate() || 0))
        .slice(0, 8);

    if (recentOrders.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; font-size: 0.8rem; text-align: center; padding: 10px;">Chưa có hoạt động mới.</p>';
        return;
    }

    container.innerHTML = recentOrders.map(o => {
        const customerName = o.shippingAddress?.fullName || o.customerName || 'Khách vãng lai';
        const amountStr = `${new Intl.NumberFormat('vi-VN').format(o.totalAmount || 0)} VND`;
        const timeAgo = o.orderDate ? getTimeAgo(o.orderDate.toDate()) : 'Gần đây';
        const isRental = o.orderType === 'rental';

        return `
            <div class="activity-item" style="cursor: pointer;" onclick="document.querySelector('.admin-tab-btn[data-target=\'${isRental ? 'rental-order-section' : 'order-section'}\']')?.click()" title="Bấm để xem đơn hàng">
                <div class="activity-avatar">${isRental ? '🛋️' : '🛒'}</div>
                <div class="activity-content">
                    <strong>${customerName}</strong> vừa đặt ${isRental ? 'đơn thuê Decor' : 'đơn mua hàng'} trị giá <strong>${amountStr}</strong>
                    <div class="activity-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
}

let sparklines = {};
function renderSparkline(canvasId, data, color) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (sparklines[canvasId]) sparklines[canvasId].destroy();

    sparklines[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data,
            datasets: [{
                data: data,
                borderColor: color,
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
}

// Hàm hỗ trợ chuyển đổi file ảnh sang WebP để tối ưu dung lượng
async function convertToWebP(file, targetSize = 1000, cropSquare = true) {
    let currentFile = file;

    // 1. Xử lý định dạng HEIC/HEIF từ iPhone
    const isHEIC = file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif") || file.type === "image/heic";
    if (isHEIC && typeof heic2any === "function") {
        try {
            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.7
            });
            // Nếu trả về mảng (trường hợp file HEIC chứa nhiều ảnh), lấy ảnh đầu tiên
            const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            currentFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
        } catch (e) {
            console.error("Lỗi chuyển đổi HEIC:", e);
        }
    }

    return new Promise((resolve) => {
        if (!currentFile.type.startsWith('image/')) return resolve(currentFile);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Tối ưu hóa chất lượng render của canvas để chống răng cưa
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                if (cropSquare) {
                    // Tính toán để cắt lấy hình vuông ở giữa ảnh gốc (Dành cho sản phẩm)
                    let sWidth = img.width;
                    let sHeight = img.height;
                    let sx = 0, sy = 0;

                    if (sWidth > sHeight) {
                        sx = (sWidth - sHeight) / 2;
                        sWidth = sHeight;
                    } else if (sHeight > sWidth) {
                        sy = (sHeight - sWidth) / 2;
                        sHeight = sWidth;
                    }

                    let finalSize = Math.min(sWidth, targetSize);
                    canvas.width = finalSize;
                    canvas.height = finalSize;
                    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, finalSize, finalSize);
                } else {
                    // Giữ nguyên tỷ lệ ảnh và chỉ giới hạn chiều rộng (Dành cho Banner)
                    const scale = Math.min(1, targetSize / img.width);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                canvas.toBlob((blob) => {
                    const newFile = new File([blob], currentFile.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });
                    resolve(newFile);
                }, 'image/webp', 0.9); // Tăng chất lượng lên 90% để giữ độ chi tiết cao, tránh nhòe/răng cưa
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(currentFile);
    });
}

// Hàm hỗ trợ tải ảnh lên Storage hoặc tự động fallback sang Data URL nếu dính lỗi 403 / Phân quyền
async function uploadOrConvertImage(file, storagePath, targetSize = 1200) {
    const webpFile = await convertToWebP(file, targetSize, false);
    try {
        const storageRef = ref(storage, storagePath);
        const snap = await uploadBytes(storageRef, webpFile);
        return await getDownloadURL(snap.ref);
    } catch (err) {
        console.warn("Lỗi Firebase Storage 403/Forbidden, tự động chuyển sang DataURL:", err);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(webpFile);
        });
    }
}

// Quản lý trạng thái kho hàng để phát hiện thay đổi tức thì
const stockTracker = new Map();
let posProductsLocal = []; // KHẮC PHỤC LỖI: Khai báo mảng chứa sản phẩm để tìm kiếm POS

function notifyOutOfStock(productName) {
    // 1. Hiển thị thông báo Toast trong UI Admin
    showToast(`CẢNH BÁO: "${productName}" vừa hết hàng!`, "error");

    // 2. Gửi thông báo hệ thống (Browser Push Notification)
    if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification("Tiệm Nhà Gốm - Cảnh báo kho", {
                body: `Sản phẩm "${productName}" đã chạm mốc 0. Hãy nhập thêm hàng ngay!`,
                icon: "../Asset/images/hero-bg.jpg"
            });
        } catch (e) { console.error("Lỗi gửi thông báo:", e); }
    }
}

const productForm = document.getElementById('product-form');
const productListTable = document.getElementById('admin-product-list');

// --- Quản lý Modal Sản Phẩm ---
const productModal = document.getElementById('product-modal');
const btnOpenProductModal = document.getElementById('btn-open-add-product');
const btnCloseProductModal = document.getElementById('btn-close-product-modal');

// --- Global Quill Editor Instance ---
window.quillProductEditor = null;
document.addEventListener('DOMContentLoaded', () => {
    const qContainer = document.getElementById('quill-editor-container');
    if (qContainer && typeof Quill !== 'undefined' && !window.quillProductEditor) {
        window.quillProductEditor = new Quill('#quill-editor-container', {
            theme: 'snow',
            placeholder: 'Nhập mô tả sản phẩm chi tiết, chèn ảnh, câu chuyện thiết kế...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });
    }
});

window.openProductModal = function () {
    if (productModal) {
        productModal.classList.add('active');
        productModal.style.display = 'flex';
        // Activate default first tab (Thông tin)
        document.querySelectorAll('.product-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.product-tab-pane').forEach(pane => pane.classList.remove('active'));
        const defaultTabBtn = document.querySelector('.product-tab-btn[data-tab="tab-product-basic"]');
        const defaultTabPane = document.getElementById('tab-product-basic');
        if (defaultTabBtn) defaultTabBtn.classList.add('active');
        if (defaultTabPane) defaultTabPane.classList.add('active');
    }
};

window.closeProductModal = function () {
    if (productModal) {
        productModal.classList.remove('active');
        productModal.style.display = 'none';
    }
    if (productForm) {
        productForm.reset();
        document.getElementById('variant-items-container').innerHTML = '';
        document.getElementById('pattern-variant-items-container').innerHTML = '';
        document.getElementById('image-preview-container').innerHTML = '';
        if (window.quillProductEditor) window.quillProductEditor.root.innerHTML = '';
        delete document.getElementById('productId').dataset.currentImageUrl;
        delete document.getElementById('productId').dataset.currentAdditionalImages;
        delete document.getElementById('productId').dataset.currentThumbUrl;
        document.getElementById('productId').readOnly = false;

        const costInput = document.getElementById('cost');
        if (costInput) {
            costInput.disabled = false;
            costInput.style.background = '#ffffff';
        }

        window.comboVariants = [{ name: 'Mặc định', items: [] }];
        window.currentComboVariantIndex = 0;

        const titleEl = document.getElementById('product-modal-title');
        if (titleEl) {
            titleEl.innerText = 'Tạo hàng hóa';
        }

        const additiveCheckbox = document.getElementById('stock-additive');
        const stockInput = document.getElementById('stock');
        if (additiveCheckbox) additiveCheckbox.checked = false;
        if (stockInput) {
            stockInput.disabled = false;
            stockInput.placeholder = "0";
        }
        if (additiveCheckbox) additiveCheckbox.disabled = false;

        // Reset luôn giao diện combo
        if (typeof window.toggleComboSection === 'function') {
            window.toggleComboSection();
        }
    }
};

if (btnOpenProductModal) {
    btnOpenProductModal.addEventListener('click', () => {
        window.closeProductModal(); // clean form
        window.openProductModal();
    });
}
if (btnCloseProductModal) {
    btnCloseProductModal.addEventListener('click', window.closeProductModal);
}
const btnCloseProductModalFooter = document.getElementById('btn-close-product-modal-footer');
if (btnCloseProductModalFooter) {
    btnCloseProductModalFooter.addEventListener('click', window.closeProductModal);
}

// Xử lý chuyển đổi Tab trong Modal sản phẩm
document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.product-tab-btn');
    if (tabBtn) {
        e.preventDefault();
        const targetTabId = tabBtn.getAttribute('data-tab');
        if (targetTabId) {
            document.querySelectorAll('.product-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.product-tab-pane').forEach(pane => pane.classList.remove('active'));
            tabBtn.classList.add('active');
            const targetPane = document.getElementById(targetTabId);
            if (targetPane) targetPane.classList.add('active');
        }
    }
});

// Logic hiển thị nút Floating Action Button (Thêm sản phẩm) theo Tab
const productSection = document.getElementById('product-section');
if (productSection && btnOpenProductModal) {
    // Check initial state
    btnOpenProductModal.style.display = productSection.classList.contains('active') ? 'flex' : 'none';

    // Observe tab changes
    const tabObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const isActive = productSection.classList.contains('active');
                btnOpenProductModal.style.display = isActive ? 'flex' : 'none';
            }
        });
    });
    tabObserver.observe(productSection, { attributes: true });
}


// Hàm hiển thị danh sách ảnh đang có trong Form (khi sửa)
function renderImagePreviews() {
    const productIdEl = document.getElementById('productId');
    const container = document.getElementById('image-preview-container');
    const mainSlot = document.querySelector('.kiot-image-upload-main');
    const sideSlotsContainer = document.getElementById('kiot-image-side-slots');

    if (container) container.innerHTML = '';
    if (!productIdEl) return;

    const mainUrl = productIdEl.dataset.currentImageUrl;
    const additionalUrls = JSON.parse(productIdEl.dataset.currentAdditionalImages || '[]');

    // Cập nhật slot ảnh chính
    if (mainSlot) {
        if (mainUrl && !mainUrl.includes('placeholder') && !mainUrl.includes('via.')) {
            mainSlot.innerHTML = `
                <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                    <img src="${mainUrl}" alt="Ảnh chính" style="max-width: 100%; max-height: 140px; object-fit: contain; border-radius: 6px;">
                    <button type="button" onclick="event.stopPropagation(); window.removeMainProductImage();" title="Xóa ảnh chính" style="position: absolute; top: 4px; right: 4px; background: rgba(220,38,38,0.85); color: #fff; border: none; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">&times;</button>
                </div>`;
        } else {
            mainSlot.innerHTML = `
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 4px;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <button type="button" class="kiot-btn-outline" style="padding: 3px 10px; font-size: 0.78rem; pointer-events: none;">Thêm ảnh</button>
                <span style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">Mỗi ảnh không quá 2 MB</span>
                <span style="font-size: 0.65rem; color: #cbd5e1;">(Hỗ trợ cả tệp HEIC)</span>`;
        }
    }

    // Cập nhật 4 slot thumbnail phụ đứng bên phải
    if (sideSlotsContainer) {
        const slots = sideSlotsContainer.querySelectorAll('.kiot-thumb-slot');
        slots.forEach((slot, idx) => {
            if (additionalUrls[idx]) {
                slot.innerHTML = `
                    <div style="position: relative; width: 100%; height: 100%;">
                        <img src="${additionalUrls[idx]}" alt="Thumb ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
                        <button type="button" onclick="event.stopPropagation(); window.removeAdditionalProductImage(${idx});" title="Xóa ảnh này" style="position: absolute; top: 1px; right: 1px; background: rgba(0,0,0,0.6); color: #fff; border: none; width: 14px; height: 14px; border-radius: 50%; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center;">&times;</button>
                    </div>`;
            } else {
                slot.innerHTML = `🖼️`;
            }
        });
    }
}

window.removeMainProductImage = function () {
    const productIdEl = document.getElementById('productId');
    if (productIdEl) {
        productIdEl.dataset.currentImageUrl = '';
        renderImagePreviews();
    }
};

window.removeAdditionalProductImage = function (index) {
    const productIdEl = document.getElementById('productId');
    if (productIdEl) {
        const additionalUrls = JSON.parse(productIdEl.dataset.currentAdditionalImages || '[]');
        additionalUrls.splice(index, 1);
        productIdEl.dataset.currentAdditionalImages = JSON.stringify(additionalUrls);
        renderImagePreviews();
    }
};

// --- Logic Quản lý Biến thể Màu sắc & Ảnh ---
window.addVariantRow = (name = '', imageUrl = '', stock = 0, showOnProductPage = false, price = '') => {
    const container = document.getElementById('variant-items-container');
    if (!container) return;

    // Tạo datalist cho màu sắc nếu chưa có
    let datalist = document.getElementById('color-suggestions');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'color-suggestions';
        const colorOptions = Object.keys(COLOR_MAP).map(colorName => `<option value="${colorName}">`).join('');
        datalist.innerHTML = colorOptions;
        document.body.appendChild(datalist);
    }

    const row = document.createElement('div');
    row.className = 'variant-row';
    row.style = 'display: flex; gap: 10px; align-items: center; background: #f9f9f9; padding: 10px; border-radius: 4px; border: 1px solid #eee;';
    row.dataset.currentUrl = imageUrl;

    row.innerHTML = `
        <div style="flex: 1;">
            <input type="text" list="color-suggestions" class="variant-name" value="${name}" placeholder="Tên màu (VD: Trắng)" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div style="width: 90px;">
            <input type="number" class="variant-price" value="${price}" placeholder="Giá riêng" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div style="width: 70px;">
            <input type="number" class="variant-stock" value="${stock}" placeholder="Kho" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;" title="Hiện độc lập trên trang Danh sách sản phẩm">
            <input type="checkbox" class="variant-show-independent" ${showOnProductPage ? 'checked' : ''} style="cursor: pointer;">
            <label style="font-size: 0.75rem; cursor: pointer; color: #555;">Độc lập</label>
        </div>
        <div class="variant-img-preview" style="width: 40px; height: 40px; background: #eee; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; cursor: pointer; position: relative;" title="Chọn ảnh cho màu này">
            ${imageUrl ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:20px; color:#999;">+</div>'}
        </div>
        <input type="file" class="variant-file-input" accept="image/*" style="display: none;">
        <button type="button" class="btn-delete-variant" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:1.5rem; line-height: 1; padding: 0 5px;">&times;</button>
    `;

    const preview = row.querySelector('.variant-img-preview');
    const fileInput = row.querySelector('.variant-file-input');

    preview.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => { preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`; };
            reader.readAsDataURL(file);
        }
    };

    row.querySelector('.btn-delete-variant').onclick = () => row.remove();
    container.appendChild(row);
};

window.addPatternVariantRow = (name = '', imageUrl = '', stock = 0, showOnProductPage = false, price = '') => {
    const container = document.getElementById('pattern-variant-items-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'pattern-variant-row';
    row.style = 'display: flex; gap: 10px; align-items: center; background: #f9f9f9; padding: 10px; border-radius: 4px; border: 1px solid #eee;';
    row.dataset.currentUrl = imageUrl;

    row.innerHTML = `
        <div style="flex: 1;">
            <input type="text" class="variant-name" value="${name}" placeholder="Tên họa tiết (VD: Nhám)" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div style="width: 90px;">
            <input type="number" class="variant-price" value="${price}" placeholder="Giá riêng" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div style="width: 70px;">
            <input type="number" class="variant-stock" value="${stock}" placeholder="Kho" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;" title="Hiện độc lập trên trang Danh sách sản phẩm">
            <input type="checkbox" class="variant-show-independent" ${showOnProductPage ? 'checked' : ''} style="cursor: pointer;">
            <label style="font-size: 0.75rem; cursor: pointer; color: #555;">Độc lập</label>
        </div>
        <div class="variant-img-preview" style="width: 40px; height: 40px; background: #eee; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; cursor: pointer; position: relative;" title="Chọn ảnh cho họa tiết này">
            ${imageUrl ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:20px; color:#999;">+</div>'}
        </div>
        <input type="file" class="variant-file-input" accept="image/*" style="display: none;">
        <button type="button" class="btn-delete-variant" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:1.5rem; line-height: 1; padding: 0 5px;">&times;</button>
    `;

    const preview = row.querySelector('.variant-img-preview');
    const fileInput = row.querySelector('.variant-file-input');

    preview.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => { preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`; };
            reader.readAsDataURL(file);
        }
    };

    row.querySelector('.btn-delete-variant').onclick = () => row.remove();
    container.appendChild(row);
};

// --- Logic Quản lý Banner ---
let currentBanners = [];
async function initBannerManagement() {
    const form = document.getElementById('banner-form');
    const listContainer = document.getElementById('admin-banner-list');
    if (!form || !listContainer) return;

    const bannerRef = doc(db, "settings", "banners");

    const renderBanners = () => {
        listContainer.innerHTML = currentBanners.map((b, idx) => `
            <div class="admin-card" style="margin-bottom: 10px; padding: 15px; display: flex; gap: 15px; align-items: center;">
                <img src="${b.imageUrl}" title="Desktop" style="width: 80px; height: 45px; object-fit: cover; border-radius: 4px;">
                <img src="${b.mobileImageUrl || b.imageUrl}" title="Mobile" style="width: 35px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
                <div style="flex: 1;">
                    <p style="font-size: 0.75rem; color: #666; margin: 5px 0;">Link: ${b.link || '<em style="color:#ccc">(Trống)</em>'}</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn-minimal" style="font-size: 0.7rem; padding: 4px 8px;" onclick="window.moveBannerUp(${idx})" ${idx === 0 ? 'disabled' : ''} title="Lên trên">▲</button>
                    <button class="btn-minimal" style="font-size: 0.7rem; padding: 4px 8px;" onclick="window.moveBannerDown(${idx})" ${idx === currentBanners.length - 1 ? 'disabled' : ''} title="Xuống dưới">▼</button>
                    <button class="btn-minimal" style="font-size: 0.7rem; padding: 4px 8px;" onclick="window.editBanner(${idx})">Sửa</button>
                    <button class="btn-delete" style="font-size: 0.7rem;" onclick="window.deleteBanner(${idx})">Xóa</button>
                </div>
            </div>
        `).join('') || '<p style="text-align:center; color:#999;">Chưa có slide nào.</p>';
    };

    const snap = await getDoc(bannerRef);
    if (snap.exists()) currentBanners = snap.data().slides || [];
    renderBanners();

    window.editBanner = (idx) => {
        const b = currentBanners[idx];
        document.getElementById('banner-index').value = idx;
        document.getElementById('banner-link').value = b.link || '';
        document.getElementById('banner-image-preview').innerHTML = `<img src="${b.imageUrl}" style="width: 150px; border-radius: 4px;">`;
        document.getElementById('banner-image-mobile-preview').innerHTML = b.mobileImageUrl ? `<img src="${b.mobileImageUrl}" style="width: 60px; border-radius: 4px;">` : "";
        form.dataset.currentImageUrl = b.imageUrl;
        form.dataset.currentMobileImageUrl = b.mobileImageUrl || '';
        window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
    };

    window.deleteBanner = async (idx) => {
        if (!confirm("Xóa slide này?")) return;
        currentBanners.splice(idx, 1);
        await setDoc(bannerRef, { slides: currentBanners });
        showToast("Đã xóa slide banner");
        renderBanners();
    };

    window.moveBannerUp = async (idx) => {
        if (idx <= 0) return;
        const temp = currentBanners[idx];
        currentBanners[idx] = currentBanners[idx - 1];
        currentBanners[idx - 1] = temp;
        await setDoc(bannerRef, { slides: currentBanners });
        renderBanners();
    };

    window.moveBannerDown = async (idx) => {
        if (idx >= currentBanners.length - 1) return;
        const temp = currentBanners[idx];
        currentBanners[idx] = currentBanners[idx + 1];
        currentBanners[idx + 1] = temp;
        await setDoc(bannerRef, { slides: currentBanners });
        renderBanners();
    };

    document.getElementById('btn-reset-banner-form').onclick = () => {
        form.reset();
        document.getElementById('banner-index').value = "-1";
        document.getElementById('banner-image-preview').innerHTML = "";
        document.getElementById('banner-image-mobile-preview').innerHTML = "";
        delete form.dataset.currentImageUrl;
        delete form.dataset.currentMobileImageUrl;
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const idx = parseInt(document.getElementById('banner-index').value);
        const link = document.getElementById('banner-link').value.trim();
        const pcFile = document.getElementById('banner-image').files[0];
        const mbFile = document.getElementById('banner-image-mobile').files[0];
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';
            let imageUrl = form.dataset.currentImageUrl || '';
            let mobileImageUrl = form.dataset.currentMobileImageUrl || '';

            if (pcFile) {
                const webpFile = await convertToWebP(pcFile, 1920, false);
                const storageRef = ref(storage, `banners/pc_${Date.now()}_${webpFile.name}`);
                const snapshot = await uploadBytes(storageRef, webpFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            if (mbFile) {
                const webpFile = await convertToWebP(mbFile, 1080, false);
                const storageRef = ref(storage, `banners/mb_${Date.now()}_${webpFile.name}`);
                const snapshot = await uploadBytes(storageRef, webpFile);
                mobileImageUrl = await getDownloadURL(snapshot.ref);
            }

            if (!imageUrl) throw new Error("Chưa có ảnh banner");
            const slideData = { link, imageUrl, mobileImageUrl };
            if (idx === -1) currentBanners.push(slideData);
            else currentBanners[idx] = slideData;
            await setDoc(bannerRef, { slides: currentBanners });
            showToast("Đã lưu banner thành công!");
            document.getElementById('btn-reset-banner-form').click();
            renderBanners();
        } catch (err) { showToast("Lỗi: " + err.message, "error"); }
        finally { submitBtn.disabled = false; submitBtn.innerText = "Lưu Slide"; }
    };
}

// --- Logic Quản lý Bộ sưu tập ---
async function initCollectionManagement() {
    const listContainer = document.getElementById('admin-collection-list');
    const form = document.getElementById('collection-form');
    if (!listContainer || !form) return;

    onSnapshot(doc(db, "settings", "collections"), (snapshot) => {
        if (snapshot.exists()) {
            adminCollections = snapshot.data().items || [];
        } else {
            adminCollections = [];
        }
        renderCollectionList(listContainer);
        populateCollectionCheckboxes();
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('collection-name').value.trim();
        const description = document.getElementById('collection-description').value.trim();
        const file = document.getElementById('collection-image').files[0];
        const galleryFiles = document.getElementById('collection-gallery').files;
        const submitBtn = form.querySelector('button[type="submit"]');
        const showHome = document.getElementById('collection-show-home').checked;
        const editIndex = parseInt(document.getElementById('collection-edit-index').value);

        if (!name) return;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';
            let imageUrl = form.dataset.currentImageUrl || '';
            let galleryUrls = JSON.parse(form.dataset.currentGalleryUrls || '[]');

            if (file) {
                const webpFile = await convertToWebP(file, 1200, false);
                const storageRef = ref(storage, `collections/${Date.now()}_${webpFile.name}`);
                const snap = await uploadBytes(storageRef, webpFile);
                imageUrl = await getDownloadURL(snap.ref);
            }

            if (galleryFiles.length > 0) {
                const galleryPromises = Array.from(galleryFiles).map(async (f) => {
                    const webp = await convertToWebP(f, 1200, false);
                    const gRef = ref(storage, `collections/gallery/${Date.now()}_${webp.name}`);
                    const gSnap = await uploadBytes(gRef, webp);
                    return await getDownloadURL(gSnap.ref);
                });
                const newGalleryUrls = await Promise.all(galleryPromises);
                galleryUrls = [...galleryUrls, ...newGalleryUrls];
            }

            if (!imageUrl) throw new Error("Vui lòng chọn ảnh cho bộ sưu tập");

            const collectionData = {
                name,
                imageUrl,
                description,
                galleryUrls,
                showOnHome: showHome,
                order: editIndex > -1 ? adminCollections[editIndex].order : (adminCollections.length + 1)
            };

            if (editIndex > -1) adminCollections[editIndex] = collectionData;
            else adminCollections.push(collectionData);

            await setDoc(doc(db, "settings", "collections"), { items: adminCollections });
            showToast("Đã lưu bộ sưu tập thành công!");
            form.reset();
            document.getElementById('collection-edit-index').value = "-1";
            document.getElementById('collection-show-home').checked = false;
            document.getElementById('collection-image-preview').innerHTML = "";
            document.getElementById('collection-gallery-preview').innerHTML = "";
            delete form.dataset.currentImageUrl;
            delete form.dataset.currentGalleryUrls;
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Lưu bộ sưu tập";
        }
    };
}

function renderCollectionList(container) {
    container.innerHTML = adminCollections.map((c, idx) => `
        <div class="admin-card" style="margin-bottom: 10px; padding: 15px; display: flex; gap: 15px; align-items: center;">
            <img src="${c.imageUrl}" style="width: 100px; height: 60px; object-fit: cover; border-radius: 4px;">
            <div style="flex: 1;">
                <h4 style="margin: 0;">${c.name} ${c.showOnHome ? '<span class="stock-badge" style="background:#e8f5e9; color:#2e7d32; margin-left:10px; font-size:10px;">Trang chủ</span>' : ''}</h4>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-minimal" onclick="window.editCollection(${idx})">Sửa</button>
                <button class="btn-delete" onclick="window.deleteCollection(${idx})">Xóa</button>
            </div>
        </div>
    `).join('') || '<p style="text-align:center; color:#999;">Chưa có bộ sưu tập nào.</p>';
}

window.editCollection = (idx) => {
    const c = adminCollections[idx];
    document.getElementById('collection-edit-index').value = idx;
    document.getElementById('collection-name').value = c.name;
    document.getElementById('collection-description').value = c.description || '';
    document.getElementById('collection-show-home').checked = c.showOnHome || false;
    document.getElementById('collection-image-preview').innerHTML = `<img src="${c.imageUrl}" style="width: 150px; border-radius: 4px;">`;

    // Hiển thị preview gallery hiện có
    const galleryPreview = document.getElementById('collection-gallery-preview');
    galleryPreview.innerHTML = (c.galleryUrls || []).map((url, gIdx) => `
        <div class="preview-item">
            <img src="${url}">
            <button type="button" class="remove-preview" onclick="window.removeCollectionGalleryImage(${idx}, ${gIdx})">&times;</button>
        </div>
    `).join('');

    const form = document.getElementById('collection-form');
    form.dataset.currentImageUrl = c.imageUrl;
    form.dataset.currentGalleryUrls = JSON.stringify(c.galleryUrls || []);
    window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
};

// Hàm xóa ảnh trong gallery khi đang sửa
window.removeCollectionGalleryImage = async (colIdx, imgIdx) => {
    if (!confirm("Xóa ảnh này khỏi gallery?")) return;
    const col = adminCollections[colIdx];
    col.galleryUrls.splice(imgIdx, 1);

    try {
        await setDoc(doc(db, "settings", "collections"), { items: adminCollections });
        showToast("Đã xóa ảnh gallery");
        window.editCollection(colIdx); // Refresh form
    } catch (e) { showToast("Lỗi: " + e.message, "error"); }
};

window.deleteCollection = async (idx) => {
    if (!confirm("Xóa bộ sưu tập này?")) return;
    adminCollections.splice(idx, 1);
    await setDoc(doc(db, "settings", "collections"), { items: adminCollections });
    showToast("Đã xóa bộ sưu tập");
};

// --- Logic Quản lý Dự Án Sự Kiện ---
async function initEventManagement() {
    const listContainer = document.getElementById('admin-event-list');
    const form = document.getElementById('event-form');
    if (!listContainer || !form) return;

    onSnapshot(doc(db, "settings", "events"), (snapshot) => {
        if (snapshot.exists()) {
            adminEvents = snapshot.data().items || [];
        } else {
            adminEvents = [];
        }
        renderEventList(listContainer);
        populateEventCheckboxes();
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('event-name').value.trim();
        const description = document.getElementById('event-description').value.trim();
        const file = document.getElementById('event-image').files[0];
        const galleryFiles = document.getElementById('event-gallery').files;
        const submitBtn = form.querySelector('button[type="submit"]');
        const editIndex = parseInt(document.getElementById('event-edit-index').value);

        if (!name) return;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';
            let imageUrl = form.dataset.currentImageUrl || '';
            let galleryUrls = JSON.parse(form.dataset.currentGalleryUrls || '[]');

            if (file) {
                imageUrl = await uploadOrConvertImage(file, `events/${Date.now()}_${file.name}`, 1200);
            }

            if (galleryFiles.length > 0) {
                const galleryPromises = Array.from(galleryFiles).map(async (f, idx) => {
                    return await uploadOrConvertImage(f, `events/gallery/${Date.now()}_${idx}_${f.name}`, 1200);
                });
                const newGalleryUrls = await Promise.all(galleryPromises);
                galleryUrls = [...galleryUrls, ...newGalleryUrls];
            }

            if (!imageUrl && editIndex === -1) throw new Error("Vui lòng chọn ảnh cho dự án");

            const eventData = {
                name,
                imageUrl,
                description,
                galleryUrls,
                order: editIndex > -1 ? adminEvents[editIndex].order : (adminEvents.length + 1)
            };

            if (editIndex > -1) adminEvents[editIndex] = eventData;
            else adminEvents.push(eventData);

            await setDoc(doc(db, "settings", "events"), { items: adminEvents });
            showToast("Đã lưu dự án thành công!");
            form.reset();
            document.getElementById('event-edit-index').value = "-1";
            document.getElementById('event-image-preview').innerHTML = "";
            document.getElementById('event-gallery-preview').innerHTML = "";
            delete form.dataset.currentImageUrl;
            delete form.dataset.currentGalleryUrls;
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Lưu dự án";
        }
    };
}

function renderEventList(container) {
    container.innerHTML = adminEvents.map((c, idx) => `
        <div class="admin-card" style="margin-bottom: 10px; padding: 15px; display: flex; gap: 15px; align-items: center;">
            <img src="${c.imageUrl}" style="width: 100px; height: 60px; object-fit: cover; border-radius: 4px;">
            <div style="flex: 1;">
                <h4 style="margin: 0;">${c.name}</h4>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-minimal" onclick="window.editEvent(${idx})">Sửa</button>
                <button class="btn-delete" onclick="window.deleteEvent(${idx})">Xóa</button>
            </div>
        </div>
    `).join('') || '<p style="text-align:center; color:#999;">Chưa có dự án nào.</p>';
}

window.editEvent = (idx) => {
    const c = adminEvents[idx];
    document.getElementById('event-edit-index').value = idx;
    document.getElementById('event-name').value = c.name;
    document.getElementById('event-description').value = c.description || '';
    document.getElementById('event-image-preview').innerHTML = `<img src="${c.imageUrl}" style="width: 150px; border-radius: 4px;">`;

    const galleryPreview = document.getElementById('event-gallery-preview');
    galleryPreview.innerHTML = (c.galleryUrls || []).map((url, gIdx) => `
        <div class="preview-item">
            <img src="${url}">
            <button type="button" class="remove-preview" onclick="window.removeEventGalleryImage(${idx}, ${gIdx})">&times;</button>
        </div>
    `).join('');

    const form = document.getElementById('event-form');
    form.dataset.currentImageUrl = c.imageUrl;
    form.dataset.currentGalleryUrls = JSON.stringify(c.galleryUrls || []);
    window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
};

window.removeEventGalleryImage = async (eventIdx, imgIdx) => {
    if (!confirm("Xóa ảnh này khỏi gallery?")) return;
    const ev = adminEvents[eventIdx];
    ev.galleryUrls.splice(imgIdx, 1);

    try {
        await setDoc(doc(db, "settings", "events"), { items: adminEvents });
        showToast("Đã xóa ảnh gallery");
        window.editEvent(eventIdx);
    } catch (e) { showToast("Lỗi: " + e.message, "error"); }
};

window.deleteEvent = async (idx) => {
    if (!confirm("Xóa dự án này?")) return;
    adminEvents.splice(idx, 1);
    await setDoc(doc(db, "settings", "events"), { items: adminEvents });
    showToast("Đã xóa dự án");
};

// --- Logic Quản lý Danh mục Động ---
let categoryUnsubscribe = null;

function initCategoryManagement() {
    const treeContainer = document.getElementById('admin-category-tree');
    const datalist = document.getElementById('existing-groups');
    const form = document.getElementById('category-management-form');

    if (!treeContainer || !form || !db) return;

    // Thiết lập lắng nghe bộ sưu tập và sự kiện để hiện checkbox trong form sản phẩm
    initCollectionManagement();
    initEventManagement();

    if (!categoryUnsubscribe) {
        categoryUnsubscribe = onSnapshot(doc(db, "settings", "product_categories"), (snapshot) => {
            if (snapshot.exists() && snapshot.data().groups) {
                // Sắp xếp các nhóm theo trường 'order'
                adminDynamicCategories = snapshot.data().groups.sort((a, b) => a.order - b.order);
            } else {
                // Fallback nếu chưa có data trên cloud
                adminDynamicCategories = DEFAULT_PRODUCT_CATEGORIES;
                // Cố gắng lưu lại cấu trúc mặc định nếu chưa có
                setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories }).catch(console.error);
            }

            // Cập nhật datalist cho ô nhập nhóm
            if (datalist) {
                datalist.innerHTML = adminDynamicCategories.map(g => `<option value="${g.name}">`).join('');
            }

            // Tự động render lại cây danh mục khi dữ liệu thay đổi
            renderCategoryTree(treeContainer);

            // Cập nhật datalist cho ô nhập nhóm
            if (datalist) {
                datalist.innerHTML = adminDynamicCategories.map(g => `<option value="${g.name}">`).join('');
            }

            // Cập nhật dropdown chọn danh mục trong form sản phẩm
            populateCategorySelect();
        }, (error) => {
            console.error("Category management listener error:", error);
        });
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const group = document.getElementById('cat-group-name').value.trim();
        const sub = document.getElementById('cat-sub-name').value.trim();

        if (!group || !sub) {
            showToast("Vui lòng nhập cả tên nhóm và phân loại con", "error");
            return;
        }

        let groupIndex = adminDynamicCategories.findIndex(g => g.name === group);

        if (groupIndex === -1) {
            // Nhóm mới, thêm vào cuối danh sách với order mới
            adminDynamicCategories.push({
                name: group,
                order: adminDynamicCategories.length > 0 ? Math.max(...adminDynamicCategories.map(g => g.order)) + 1 : 1,
                subs: [sub]
            });
            showToast(`Đã thêm nhóm "${group}" và phân loại "${sub}"`);
        } else {
            // Nhóm đã tồn tại
            if (!adminDynamicCategories[groupIndex].subs.includes(sub)) {
                adminDynamicCategories[groupIndex].subs.push(sub);
                showToast(`Đã thêm "${sub}" vào nhóm "${group}"`);
            } else {
                showToast("Phân loại này đã tồn tại trong nhóm", "error");
                return; // Không cần lưu nếu không có thay đổi
            }
        }

        try {
            // Lưu toàn bộ mảng groups đã cập nhật vào Firestore
            await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
            form.reset();
        } catch (err) { showToast("Lỗi lưu danh mục: " + err.message, "error"); }
    }; // End of form.onsubmit
}

// Hàm chọn nhóm nhanh khi click vào cây danh mục
window.quickSelectGroup = (groupName) => {
    const groupInput = document.getElementById('cat-group-name');
    const subInput = document.getElementById('cat-sub-name');
    if (groupInput && subInput) {
        groupInput.value = groupName;
        subInput.focus();
        showToast(`Đã chọn nhóm: ${groupName}. Hãy nhập phân loại con.`);
    }
};

// --- Drag & Drop Category Logic ---
window.handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleGroupDragStart = (e, index) => {
    // Nếu đang kéo tag con thì không kích hoạt kéo nhóm cha
    if (e.target.closest('.category-tag-admin') || e.target.closest('button')) return;
    e.dataTransfer.setData('groupIndex', index);
    e.target.style.opacity = '0.4';
};

window.handleGroupDrop = async (e, targetIndex) => {
    e.preventDefault();
    const sourceIndex = e.dataTransfer.getData('groupIndex');
    if (sourceIndex === "" || sourceIndex == targetIndex) return;

    const [movedItem] = adminDynamicCategories.splice(sourceIndex, 1);
    adminDynamicCategories.splice(targetIndex, 0, movedItem);

    // Cập nhật lại thuộc tính order
    adminDynamicCategories.forEach((group, idx) => { group.order = idx + 1; });

    try {
        await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
        showToast("Đã cập nhật thứ tự nhóm");
    } catch (err) { showToast("Lỗi: " + err.message, "error"); }
};

window.handleSubDragStart = (e, groupName, subIndex) => {
    e.stopPropagation(); // Ngăn sự kiện drag lan lên nhóm cha
    e.dataTransfer.setData('sourceGroupName', groupName);
    e.dataTransfer.setData('subIndex', subIndex);
    e.target.style.opacity = '0.4';
};

window.handleSubDrop = async (e, targetGroupName, targetSubIndex = null) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceGroupName = e.dataTransfer.getData('sourceGroupName');
    const subIndexStr = e.dataTransfer.getData('subIndex');

    if (sourceGroupName === "" || subIndexStr === "") return;
    const subIndex = parseInt(subIndexStr);

    const sourceGroup = adminDynamicCategories.find(g => g.name === sourceGroupName);
    const targetGroup = adminDynamicCategories.find(g => g.name === targetGroupName);

    if (!sourceGroup || !targetGroup) return;

    const [subToMove] = sourceGroup.subs.splice(subIndex, 1);

    // Kiểm tra trùng lặp nếu chuyển nhóm
    if (sourceGroupName !== targetGroupName && targetGroup.subs.includes(subToMove)) {
        showToast(`"${subToMove}" đã có trong nhóm "${targetGroupName}"`, "error");
        sourceGroup.subs.splice(subIndex, 0, subToMove); // Trả lại chỗ cũ
        renderCategoryTree(document.getElementById('admin-category-tree'));
        return;
    }

    if (targetSubIndex === null) {
        targetGroup.subs.push(subToMove);
    } else {
        targetGroup.subs.splice(targetSubIndex, 0, subToMove);
    }

    try {
        await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
    } catch (err) { showToast("Lỗi: " + err.message, "error"); }
};

window.editGroupName = (event, oldName, index) => {
    event.stopPropagation();
    const target = event.currentTarget;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'edit-group-input';
    input.style.cssText = 'font-family: inherit; font-weight: bold; font-size: 1rem; padding: 4px 8px; border: 1px solid var(--text-black); border-radius: 4px; width: 200px;';

    const originalContent = target.innerHTML;
    target.innerHTML = '';
    target.appendChild(input);
    input.focus();
    input.select();

    let finished = false;

    const finishEdit = async (save) => {
        if (finished) return;
        finished = true;

        const newName = input.value.trim();
        if (save && newName && newName !== oldName) {
            // Kiểm tra trùng tên
            if (adminDynamicCategories.some((g, i) => i !== index && g.name === newName)) {
                showToast("Tên nhóm này đã tồn tại", "error");
                target.innerHTML = originalContent;
            } else {
                adminDynamicCategories[index].name = newName;
                try {
                    await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
                    showToast(`Đã đổi tên nhóm thành "${newName}"`);
                } catch (err) {
                    showToast("Lỗi: " + err.message, "error");
                    target.innerHTML = originalContent;
                }
            }
        } else {
            target.innerHTML = originalContent;
        }
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') finishEdit(true);
        if (e.key === 'Escape') finishEdit(false);
    };
    input.onblur = () => finishEdit(true);
};

window.editSubCategoryName = (event, groupName, oldSubName, subIdx) => {
    event.stopPropagation();
    const target = event.currentTarget;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldSubName;
    input.style.cssText = 'font-size: 0.85rem; padding: 2px 4px; border: 1px solid var(--text-black); border-radius: 4px; width: 120px; font-family: inherit;';

    const originalContent = target.innerHTML;
    target.innerHTML = '';
    target.appendChild(input);
    input.focus();
    input.select();

    let finished = false;

    const finishEdit = async (save) => {
        if (finished) return;
        finished = true;

        const newSubName = input.value.trim();
        if (save && newSubName && newSubName !== oldSubName) {
            const group = adminDynamicCategories.find(g => g.name === groupName);
            if (!group) { target.innerHTML = originalContent; return; }

            if (group.subs.includes(newSubName)) {
                showToast("Tên phân loại này đã tồn tại trong nhóm", "error");
                target.innerHTML = originalContent;
                return;
            }

            try {
                // 1. Tìm sản phẩm bị ảnh hưởng trước để xác nhận
                const q = query(collection(db, "products"), where("category", "==", oldSubName));
                const snap = await getDocs(q);
                const affectedCount = snap.size;

                if (affectedCount > 0) {
                    const ok = confirm(`Phân loại này đang có ${affectedCount} sản phẩm. Bạn có chắc chắn muốn đổi tên thành "${newSubName}" và cập nhật toàn bộ sản phẩm này?`);
                    if (!ok) { target.innerHTML = originalContent; return; }
                }

                showToast("Đang đồng bộ dữ liệu...", "info");

                // Cập nhật cấu trúc danh mục
                group.subs[subIdx] = newSubName;
                await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });

                if (affectedCount > 0) {
                    const updatePromises = snap.docs.map(d => updateDoc(doc(db, "products", d.id), { category: newSubName }));
                    await Promise.all(updatePromises);
                    showToast(`Đã đổi tên thành "${newSubName}" và cập nhật ${affectedCount} sản phẩm.`);
                } else {
                    showToast(`Đã đổi tên thành "${newSubName}".`);
                }
            } catch (err) {
                showToast("Lỗi: " + err.message, "error");
                target.innerHTML = originalContent;
            }
        } else {
            target.innerHTML = originalContent;
        }
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') finishEdit(true);
        if (e.key === 'Escape') finishEdit(false);
    };
    input.onblur = () => finishEdit(true);
};

// --- Logic Upload Ảnh Danh mục ---
window.triggerCatImageUpload = (groupName, index) => {
    let fileInput = document.getElementById('cat-image-hidden-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'cat-image-hidden-input';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showToast(`Đang nén và tải ảnh cho "${groupName}"...`, "info");
            const webpFile = await convertToWebP(file, 600); // Ảnh danh mục không cần quá to
            const storageRef = ref(storage, `categories/${groupName.replace(/\s+/g, '_')}_${Date.now()}.webp`);
            const snapshot = await uploadBytes(storageRef, webpFile);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Cập nhật mảng local và lưu Firestore
            adminDynamicCategories[index].imageUrl = downloadURL;
            await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
            showToast(`Đã cập nhật ảnh cho nhóm "${groupName}"!`);
        } catch (err) { showToast("Lỗi upload: " + err.message, "error"); }
    };
    fileInput.click();
};

function renderCategoryTree(container) {
    let html = '';
    if (adminDynamicCategories.length === 0) {
        html = '<p style="text-align:center; color:#999; padding: 2rem;">Chưa có danh mục nào.</p>';
    } else {
        adminDynamicCategories.forEach((group, index) => {
            html += `
                <div class="category-group-card" draggable="true" ondragstart="window.handleGroupDragStart(event, ${index})" ondragover="window.handleDragOver(event)" ondrop="window.handleGroupDrop(event, ${index})" ondragend="this.style.opacity='1'" style="margin-bottom: 1.5rem; border: 1px solid #eee; border-radius: 8px; overflow: hidden; cursor: grab;">
                    <div style="background: #f8f9fa; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div onclick="window.triggerCatImageUpload('${group.name}', ${index})" title="Click để tải ảnh đại diện" style="width: 45px; height: 45px; border-radius: 6px; overflow: hidden; background: #e0e0e0; cursor: pointer; border: 1px solid #ddd; flex-shrink: 0; position: relative;">
                                <img src="${group.imageUrl || 'https://placehold.co/100x100?text=No+Image'}" style="width: 100%; height: 100%; object-fit: cover;">
                                <div style="position: absolute; bottom: 0; left: 0; width: 100%; background: rgba(0,0,0,0.5); color: #fff; font-size: 8px; text-align: center; padding: 2px 0;">Sửa</div>
                            </div>
                            <button type="button" class="btn-minimal" style="font-family: var(--font-serif); font-weight: bold; margin: 0; padding: 5px 12px; font-size: 1rem;" onclick="window.quickSelectGroup('${group.name}')" ondblclick="window.editGroupName(event, '${group.name}', ${index})" title="Double-click để đổi tên">${group.name} +</button>
                        </div>
                        <div style="display: flex; gap: 10px; pointer-events: auto;">
                            <button class="btn-minimal" style="font-size: 0.7rem; padding: 2px 8px;" ${index === 0 ? 'disabled' : ''} onclick="window.moveCategoryGroup('${group.name}', -1)">▲ Lên</button>
                            <button class="btn-minimal" style="font-size: 0.7rem; padding: 2px 8px;" ${index === adminDynamicCategories.length - 1 ? 'disabled' : ''} onclick="window.moveCategoryGroup('${group.name}', 1)">▼ Xuống</button>
                            <button class="btn-delete" style="font-size: 0.7rem;" onclick="window.deleteCategoryGroup('${group.name}')">Xóa nhóm</button>
                        </div>
                    </div>
                    <div class="subs-container" ondragover="window.handleDragOver(event)" ondrop="window.handleSubDrop(event, '${group.name}')" style="padding: 10px 15px; display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px;">
                        ${group.subs.map((sub, subIdx) => `
                            <span class="category-tag-admin" draggable="true" ondragstart="window.handleSubDragStart(event, '${group.name}', ${subIdx})" ondragover="window.handleDragOver(event)" ondrop="window.handleSubDrop(event, '${group.name}', ${subIdx})" ondragend="this.style.opacity='1'" ondblclick="window.editSubCategoryName(event, '${group.name}', '${sub}', ${subIdx})" title="Double-click để đổi tên" style="display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #ddd; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; cursor: move;">
                                ${sub}
                                <span style="cursor: pointer; color: #e74c3c; font-weight: bold;" onclick="window.deleteSubCategory('${group.name}', '${sub}')">&times;</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        });
    }
    container.innerHTML = html;
}

window.moveCategoryGroup = async (groupName, direction) => {
    const index = adminDynamicCategories.findIndex(g => g.name === groupName);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < adminDynamicCategories.length) {
        // Hoán đổi vị trí và cập nhật order
        const [movedItem] = adminDynamicCategories.splice(index, 1);
        adminDynamicCategories.splice(newIndex, 0, movedItem);

        // Cập nhật lại trường 'order' cho tất cả các nhóm
        adminDynamicCategories.forEach((group, idx) => {
            group.order = idx + 1;
        });

        try {
            await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
            showToast(`Đã di chuyển nhóm "${groupName}"`);
        } catch (err) { showToast("Lỗi di chuyển danh mục: " + err.message, "error"); }
    }
};

window.deleteSubCategory = async (groupName, subName) => {
    if (!confirm(`Xóa phân loại "${subName}" khỏi nhóm "${groupName}"?`)) return;
    const groupIndex = adminDynamicCategories.findIndex(g => g.name === groupName);
    if (groupIndex === -1) return;

    adminDynamicCategories[groupIndex].subs = adminDynamicCategories[groupIndex].subs.filter(s => s !== subName);
    try {
        await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
        showToast("Đã xóa phân loại");
    } catch (err) { showToast("Lỗi xóa phân loại: " + err.message, "error"); }
};

window.deleteCategoryGroup = async (groupName) => {
    if (!confirm(`CẢNH BÁO: Bạn đang xóa toàn bộ nhóm "${groupName}" bao gồm tất cả phân loại bên trong. Tiếp tục?`)) return;
    adminDynamicCategories = adminDynamicCategories.filter(g => g.name !== groupName);
    try {
        await setDoc(doc(db, "settings", "product_categories"), { groups: adminDynamicCategories });
        showToast("Đã xóa nhóm danh mục");
    } catch (err) { showToast("Lỗi xóa nhóm danh mục: " + err.message, "error"); }
};

async function populateCategorySelect() {
    const categorySelect = document.getElementById('category');
    const filterSelect = document.getElementById('admin-product-category-filter');
    const couponCategorySelect = document.getElementById('coupon-category');

    let html = '<option value="">-- Chọn danh mục --</option>';
    let filterHtml = '<option value="all">Tất cả danh mục</option>';
    let couponCategoryHtml = '<option value="all">Tất cả danh mục</option>';

    adminDynamicCategories.forEach(group => { // Iterate over array
        html += `<optgroup label="${group.name}">`;
        group.subs.forEach(sub => {
            html += `<option value="${sub}">${sub}</option>`;
            filterHtml += `<option value="${sub}">${sub}</option>`;
            couponCategoryHtml += `<option value="${sub}">${sub}</option>`;
        });
        html += `</optgroup>`;
    });

    if (categorySelect) categorySelect.innerHTML = html;
    if (filterSelect) filterSelect.innerHTML = filterHtml;
    if (couponCategorySelect) couponCategorySelect.innerHTML = couponCategoryHtml;
}

function populateCollectionCheckboxes() {
    const container = document.getElementById('product-collections-list');
    if (!container) return;

    container.innerHTML = adminCollections.map(c => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; background: #f5f5f5; padding: 5px 10px; border-radius: 20px;">
            <input type="checkbox" class="collection-checkbox" value="${c.name}">
            ${c.name}
        </label>
    `).join('');
}

function populateEventCheckboxes() {
    const container = document.getElementById('product-events-list');
    if (!container) return;

    container.innerHTML = adminEvents.map(c => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; background: #f5f5f5; padding: 5px 10px; border-radius: 20px;">
            <input type="checkbox" class="event-checkbox" value="${c.name}">
            ${c.name}
        </label>
    `).join('');
}

// Hàm Migration: Cập nhật toàn bộ sản phẩm cũ sang danh mục mới (Chạy 1 lần duy nhất)
window.migrateProductCategories = async () => {
    if (!confirm("Hành động này sẽ cập nhật lại toàn bộ danh mục của sản phẩm trong Database để khớp với UI mới. Bạn có chắc chắn?")) return;

    const mapping = {
        // Map các danh mục từ cấu trúc cũ sang cấu trúc mới nhất
        "Nghệ thuật Bàn ăn": "Dining Decor",
        "Điểm nhấn Không gian": "Home Decor",
        "Gốm & Đời sống": "Lifestyle",
        "Tạp vật Tinh tế": "Lifestyle",

        "Bộ đồ ăn (Chén, Dĩa)": "Bát & Chén",
        "Phụ kiện bàn tiệc": "Gác Đũa & Phụ Kiện",
        "Hũ gia vị gốm sứ": "Gia Vị & Nước Chấm",
        "Khay & Thớt gỗ": "Thớt",
        "Dụng cụ pha chế": "Ly & Tách",
        "Lọ hoa nghệ thuật": "Lọ Hoa Nghệ Thuật",
        "Ấm trà & Thưởng thức": "Ấm Trà",
        "Đèn gốm trang trí": "Đèn & Tượng Decor",
        "Tượng & Vật phẩm decor": "Đèn & Tượng Decor",
        "Khay bánh mứt": "Khay Bánh Mứt",
        "Hộp khăn giấy cao cấp": "Tạp Vật Tinh Tế",
        "Phụ kiện phòng tắm": "Phụ Kiện Phòng Tắm",
        "Lót ly thủ công": "Lót Ly & Đế Lót",
        "Đế lót gốm sứ": "Lót Ly & Đế Lót"
    };

    try {
        showToast("Đang bắt đầu chuyển đổi dữ liệu...", "info");
        const q = query(collection(db, "products"));
        const snap = await getDocs(q);
        let count = 0;

        for (const productDoc of snap.docs) {
            const data = productDoc.data();
            // Find the correct sub-category name from the new structure
            let newCategory = null;
            for (const group of adminDynamicCategories) { // Iterate over the array
                if (group.subs.includes(mapping[data.category] || data.category)) {
                    newCategory = mapping[data.category] || data.category;
                    break;
                }
            }

            if (newCategory) {
                await updateDoc(doc(db, "products", productDoc.id), {
                    category: newCategory
                });
                count++;
            } else if (mapping[data.category]) { // Fallback if old category maps to a new sub-category
                await updateDoc(doc(db, "products", productDoc.id), {
                    category: mapping[data.category]
                });
                count++;
            }
        }
        showToast(`Thành công! Đã cập nhật ${count} sản phẩm sang danh mục mới.`, "success");
    } catch (e) {
        console.error(e);
        showToast("Lỗi Migration: " + e.message, "error");
    }
};

// --- Logic Combo Sản Phẩm ---
window.comboVariants = [{ name: 'Mặc định', items: [] }];
window.currentComboVariantIndex = 0;

window.toggleComboSection = function () {
    const checkedRadio = document.querySelector('input[name="product-type"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'normal';
    const comboSection = document.getElementById('combo-section');
    const stockInput = document.getElementById('stock');
    if (comboSection) {
        if (type === 'combo') {
            comboSection.style.display = 'block';
            if (stockInput) stockInput.value = '';
            if (typeof window.renderComboVariantsTabs === 'function') {
                window.renderComboVariantsTabs();
            }
        } else {
            comboSection.style.display = 'none';
        }
    }
};

window.renderComboVariantsTabs = function () {
    const tabsContainer = document.getElementById('combo-variants-tabs');
    const contentContainer = document.getElementById('combo-variant-content');
    if (!tabsContainer || !contentContainer) return;

    if (!window.comboVariants || window.comboVariants.length === 0) {
        tabsContainer.innerHTML = '';
        contentContainer.style.display = 'none';
        return;
    }

    contentContainer.style.display = 'block';

    if (window.currentComboVariantIndex >= window.comboVariants.length) {
        window.currentComboVariantIndex = window.comboVariants.length - 1;
    }

    tabsContainer.innerHTML = window.comboVariants.map((v, idx) => `
        <button type="button" class="btn-minimal ${idx === window.currentComboVariantIndex ? 'active' : ''}" 
                onclick="window.selectComboVariant(${idx})"
                style="${idx === window.currentComboVariantIndex ? 'background: #d35400; color: #fff; border-color: #d35400;' : ''}">
            ${v.name || `Phân loại ${idx + 1}`}
        </button>
    `).join('');

    const currentVariant = window.comboVariants[window.currentComboVariantIndex];
    const nameInput = document.getElementById('combo-variant-name');
    if (nameInput) nameInput.value = currentVariant.name || '';

    const imageInput = document.getElementById('combo-variant-image');
    if (imageInput) imageInput.value = currentVariant.imageUrl || '';

    const showOnCardCheckbox = document.getElementById('combo-variant-show-independent');
    if (showOnCardCheckbox) showOnCardCheckbox.checked = currentVariant.showOnProductPage || false;

    window.renderComboItems();
};

window.addComboVariant = function () {
    window.comboVariants.push({ name: `Phân loại ${window.comboVariants.length + 1}`, items: [], showOnProductPage: false });
    window.currentComboVariantIndex = window.comboVariants.length - 1;
    window.renderComboVariantsTabs();
};

window.selectComboVariant = function (idx) {
    window.currentComboVariantIndex = idx;
    window.renderComboVariantsTabs();
};

window.updateCurrentComboVariantName = function (name) {
    if (window.comboVariants[window.currentComboVariantIndex]) {
        window.comboVariants[window.currentComboVariantIndex].name = name;
        window.renderComboVariantsTabs(); // Rerender to update tab title
        // Re-focus the input
        const input = document.getElementById('combo-variant-name');
        if (input) {
            input.focus();
        }
    }
};

window.updateCurrentComboVariantImage = function (url) {
    if (window.comboVariants[window.currentComboVariantIndex]) {
        window.comboVariants[window.currentComboVariantIndex].imageUrl = url;
    }
};

window.updateCurrentComboVariantShowOnCard = function (checked) {
    if (window.comboVariants[window.currentComboVariantIndex]) {
        window.comboVariants[window.currentComboVariantIndex].showOnProductPage = checked;
    }
};

window.uploadComboVariantImage = async function (input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const storageRef = ref(storage, `products/combo_variants/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const imgInput = document.getElementById('combo-variant-image');
        if (imgInput) imgInput.value = url;
        window.updateCurrentComboVariantImage(url);
        showToast("Đã tải lên ảnh phân loại thành công", "success");
    } catch (e) {
        console.error("Lỗi tải ảnh:", e);
        showToast("Lỗi tải ảnh: " + e.message, "error");
    } finally {
        input.value = ''; // Reset input
    }
};

window.removeCurrentComboVariant = function () {
    if (window.comboVariants.length <= 1) {
        showToast('Phải có ít nhất 1 phân loại combo.', 'error');
        return;
    }
    if (confirm('Xóa phân loại này?')) {
        window.comboVariants.splice(window.currentComboVariantIndex, 1);
        window.currentComboVariantIndex = 0;
        window.renderComboVariantsTabs();
    }
};

window.renderComboItems = function () {
    const list = document.getElementById('combo-items-list');
    if (!list) return;

    const currentVariant = window.comboVariants[window.currentComboVariantIndex];
    if (!currentVariant || !currentVariant.items || currentVariant.items.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #999; font-size: 0.85rem; padding: 10px;">Chưa chọn sản phẩm nào cho phân loại này.</div>';
        return;
    }

    list.innerHTML = currentVariant.items.map((item, idx) => {
        let colorOptions = '';
        if (item.colorVariants && item.colorVariants.length > 0) {
            colorOptions = `
                <select style="margin-top:4px; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.75rem;" onchange="window.updateComboItemVariant(${idx}, 'color', this.value)">
                    <option value="">-- Chọn màu --</option>
                    ${item.colorVariants.map(v => `<option value="${v.name}" ${item.selectedColor === v.name ? 'selected' : ''}>${v.name}</option>`).join('')}
                </select>
            `;
        }

        let patternOptions = '';
        let availablePatterns = (item.patternVariants && item.patternVariants.length > 0) ? item.patternVariants : (item.patterns || []);
        if (availablePatterns.length > 0) {
            patternOptions = `
                <select style="margin-top:4px; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.75rem;" onchange="window.updateComboItemVariant(${idx}, 'pattern', this.value)">
                    <option value="">-- Chọn họa tiết --</option>
                    ${availablePatterns.map(v => {
                const vName = typeof v === 'string' ? v : v.name;
                return `<option value="${vName}" ${item.selectedPattern === vName ? 'selected' : ''}>${vName}</option>`;
            }).join('')}
                </select>
            `;
        }

        return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                <img src="${item.thumbUrl || item.imageUrl || 'https://placehold.co/50'}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
                <div style="display: flex; flex-direction: column;">
                    <div style="font-weight: 600; font-size: 0.85rem;">${item.name}</div>
                    <div style="font-size: 0.75rem; color: #666;">Mã: ${item.id}</div>
                    <div style="display: flex; gap: 5px;">
                        ${colorOptions}
                        ${patternOptions}
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="number" min="1" value="${item.quantity || 1}" onchange="window.updateComboItemQty(${idx}, this.value)" style="width: 60px; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 4px;">
                <button type="button" class="btn-delete" style="padding: 4px 8px; font-size: 0.8rem;" onclick="window.removeComboItem(${idx})">&times;</button>
            </div>
        </div>
        `;
    }).join('');
};

window.addComboItem = function (product) {
    const currentVariant = window.comboVariants[window.currentComboVariantIndex];
    if (!currentVariant) return;
    if (!currentVariant.items) currentVariant.items = [];

    const existing = currentVariant.items.find(i => i.id === product.id);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        currentVariant.items.push({
            id: product.id,
            name: product.name,
            imageUrl: product.imageUrl || product.thumbUrl,
            thumbUrl: product.thumbUrl,
            price: product.price,
            quantity: 1,
            colorVariants: product.colorVariants || [],
            patternVariants: product.patternVariants || [],
            patterns: product.patterns || [],
            selectedColor: '',
            selectedPattern: ''
        });
    }
    window.renderComboItems();
    document.getElementById('combo-product-search').value = '';
    document.getElementById('combo-product-suggestions').innerHTML = '';
};

window.updateComboItemVariant = function (idx, type, value) {
    const currentVariant = window.comboVariants[window.currentComboVariantIndex];
    if (currentVariant && currentVariant.items[idx]) {
        if (type === 'color') currentVariant.items[idx].selectedColor = value;
        if (type === 'pattern') currentVariant.items[idx].selectedPattern = value;
    }
};

window.removeComboItem = function (idx) {
    const currentVariant = window.comboVariants[window.currentComboVariantIndex];
    if (currentVariant && currentVariant.items) {
        currentVariant.items.splice(idx, 1);
        window.renderComboItems();
    }
};

window.updateComboItemQty = function (idx, qty) {
    const currentVariant = window.comboVariants[window.currentComboVariantIndex];
    if (currentVariant && currentVariant.items[idx]) {
        qty = parseInt(qty);
        if (qty > 0) {
            currentVariant.items[idx].quantity = qty;
        }
    }
};

// Gắn event cho ô tìm kiếm combo
document.addEventListener('DOMContentLoaded', () => {
    const comboSearchInput = document.getElementById('combo-product-search');
    if (comboSearchInput) {
        comboSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase().trim();
            const suggs = document.getElementById('combo-product-suggestions');
            if (!val) {
                suggs.innerHTML = '';
                return;
            }
            const results = posProductsLocal.filter(p => !p.isCombo && ((p.name && p.name.toLowerCase().includes(val)) || (p.id && p.id.toLowerCase().includes(val)))).slice(0, 10);
            if (results.length > 0) {
                suggs.innerHTML = results.map(p => `
                    <div class="suggestion-item" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;" onclick='window.addComboItem(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
                        <img src="${p.thumbUrl || p.imageUrl || 'https://placehold.co/40'}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">
                        <div>
                            <div style="font-weight: 600; font-size: 0.85rem;">${p.name}</div>
                            <div style="font-size: 0.75rem; color: #666;">${p.id}</div>
                        </div>
                    </div>
                `).join('');
                suggs.style.display = 'block';
            } else {
                suggs.innerHTML = '<div style="padding: 8px; font-size: 0.85rem; color: #999;">Không tìm thấy sản phẩm phù hợp.</div>';
                suggs.style.display = 'block';
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target !== comboSearchInput && !comboSearchInput.contains(e.target)) {
                const suggs = document.getElementById('combo-product-suggestions');
                if (suggs) suggs.innerHTML = '';
            }
        });
    }
});

// Hàm lưu/cập nhật sản phẩm
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (window.quillProductEditor) {
            document.getElementById('description').value = window.quillProductEditor.root.innerHTML;
        }

        const productId = document.getElementById('productId').value.trim();
        const imageFiles = document.getElementById('imageFile').files;
        const submitBtn = document.getElementById('submit-product-btn'); // Sử dụng ID để tìm nút submit

        if (!productId) {
            showToast("Vui lòng nhập Mã sản phẩm (SKU)", "error");
            return;
        }

        const price = window.getCurrencyValue('price');
        if (price <= 0) {
            showToast("Giá sản phẩm phải lớn hơn 0", "error");
            return;
        }

        if (!db || !storage) {
            showToast("Hệ thống chưa sẵn sàng hoặc bị chặn (Ad-block). Vui lòng tải lại trang.", "error");
            if (submitBtn) submitBtn.disabled = false; // Thêm kiểm tra an toàn
            return;
        }

        if (submitBtn) { // Thêm kiểm tra an toàn
            submitBtn.disabled = true;
        }

        // 1. Tạo hoặc reset khu vực hiển thị tiến trình chi tiết
        let progressContainer = document.getElementById('upload-progress-container');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'upload-progress-container';
            progressContainer.style = "margin: 15px 0; display: none;";
            if (submitBtn && submitBtn.parentNode) { // Đảm bảo submitBtn và phần tử cha của nó tồn tại
                submitBtn.parentNode.insertBefore(progressContainer, submitBtn);
            }
        }
        progressContainer.innerHTML = ''; // Xóa các tiến trình cũ
        if (progressContainer) { // Thêm kiểm tra an toàn
            progressContainer.style.display = 'block';
        }
        submitBtn.innerHTML = '<span class="spinner-small"></span> Đang nén ảnh...';

        try {
            const productRef = doc(db, "products", productId);
            const existingSnap = await getDoc(productRef);
            const isEdit = existingSnap.exists();

            // Lấy các nút và input liên quan đến tồn kho
            const stockInput = document.getElementById('stock');
            const additiveCheckbox = document.getElementById('stock-additive');
            const isAdditive = additiveCheckbox?.checked;
            let finalStock = Number(stockInput.value);

            // Nếu đang sửa và chọn chế độ "Nhập thêm", thực hiện phép cộng
            if (isEdit && isAdditive) {
                finalStock = (existingSnap.data().stock || 0) + finalStock;
            } else if (isEdit && !additiveCheckbox.checked) {
                // Nếu không phải chế độ nhập thêm, giá trị nhập vào là tồn kho mới
                finalStock = Number(stockInput.value);
            } else if (!isEdit) {
                // Nếu là sản phẩm mới, giá trị nhập vào là tồn kho ban đầu
                finalStock = Number(stockInput.value);
            }

            // Tính tổng tồn kho từ các biến thể (nếu có)
            let totalVariantStock = 0;
            let hasVariants = false;

            // Lấy danh sách ảnh cũ còn sót lại sau khi xóa
            let currentMain = document.getElementById('productId').dataset.currentImageUrl || '';
            let currentThumb = document.getElementById('productId').dataset.currentThumbUrl || '';
            let currentAdditionals = JSON.parse(document.getElementById('productId').dataset.currentAdditionalImages || '[]');

            // 1.5 Xử lý upload ảnh biến thể màu sắc
            const variantRows = Array.from(document.querySelectorAll('.variant-row'));
            const variantPromises = variantRows.map(async (row) => {
                const name = row.querySelector('.variant-name').value.trim();
                const stock = Number(row.querySelector('.variant-stock').value || 0);
                const fileInput = row.querySelector('.variant-file-input');
                const file = fileInput.files[0];
                const showOnProductPageCheckbox = row.querySelector('.variant-show-independent');
                const showOnProductPage = showOnProductPageCheckbox ? showOnProductPageCheckbox.checked : false;
                let variantUrl = row.dataset.currentUrl || null;

                if (file) {
                    const webpFile = await convertToWebP(file, 800);
                    const vRef = ref(storage, `products/${productId}/variants/${Date.now()}_${webpFile.name}`);
                    const vSnap = await uploadBytes(vRef, webpFile);
                    variantUrl = await getDownloadURL(vSnap.ref);
                }
                const priceInput = row.querySelector('.variant-price');
                const price = priceInput && priceInput.value ? Number(priceInput.value) : null;
                return { name, imageUrl: variantUrl, stock, showOnProductPage, price };
            });
            const colorVariantsResult = (await Promise.all(variantPromises)).filter(v => v.name);
            if (colorVariantsResult.length > 0) hasVariants = true;
            colorVariantsResult.forEach(v => totalVariantStock += v.stock);

            // 1.6 Xử lý upload ảnh biến thể họa tiết
            const patternRows = Array.from(document.querySelectorAll('.pattern-variant-row'));
            const patternPromises = patternRows.map(async (row) => {
                const name = row.querySelector('.variant-name').value.trim();
                const stock = Number(row.querySelector('.variant-stock').value || 0);
                const fileInput = row.querySelector('.variant-file-input');
                const file = fileInput.files[0];
                const showOnProductPageCheckbox = row.querySelector('.variant-show-independent');
                const showOnProductPage = showOnProductPageCheckbox ? showOnProductPageCheckbox.checked : false;
                let variantUrl = row.dataset.currentUrl || null;

                if (file) {
                    const webpFile = await convertToWebP(file, 800);
                    const vRef = ref(storage, `products/${productId}/patterns/${Date.now()}_${webpFile.name}`);
                    const vSnap = await uploadBytes(vRef, webpFile);
                    variantUrl = await getDownloadURL(vSnap.ref);
                }
                const priceInput = row.querySelector('.variant-price');
                const price = priceInput && priceInput.value ? Number(priceInput.value) : null;
                return { name, imageUrl: variantUrl, stock, showOnProductPage, price };
            });
            const patternVariantsResult = (await Promise.all(patternPromises)).filter(v => v.name);
            if (patternVariantsResult.length > 0) hasVariants = true;
            patternVariantsResult.forEach(v => totalVariantStock += v.stock);

            // 2. Xử lý upload thêm ảnh mới với Progress Bar CHI TIẾT
            if (imageFiles.length > 0) {
                const files = Array.from(imageFiles);
                const totalFiles = files.length;
                const progressMap = new Map(); // Lưu tiến trình của từng file: index -> percent

                const uploadPromises = files.map(async (file, index) => {
                    // Tạo URL xem trước cục bộ cho ảnh
                    const previewUrl = URL.createObjectURL(file);

                    // Tạo UI cho từng file riêng lẻ
                    const fileProgressDiv = document.createElement('div'); // This line was missing in the previous diff, causing the code to be incorrect.
                    fileProgressDiv.style = "margin-bottom: 10px; background: #f9f9f9; padding: 8px; border-radius: 4px; border: 1px solid #eee;";
                    fileProgressDiv.innerHTML = `
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <img src="${previewUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 5px; color: #666;">
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${file.name}</span>
                                <span id="percent-${index}" style="font-weight: 600;">0%</span>
                            </div>
                            <div style="width: 100%; height: 4px; background: #eee; border-radius: 2px; overflow: hidden;">
                                <div id="bar-${index}" style="width: 0%; height: 100%; background: #27ae60; transition: width 0.2s;"></div>
                            </div>
                        </div>
                    </div>
                `;
                    progressContainer.appendChild(fileProgressDiv);

                    // Tạo 2 phiên bản: Ảnh lớn và Thumbnail
                    const webpFile = await convertToWebP(file, 1000); // Main image size // This line was also missing in the previous diff.
                    const thumbWebp = await convertToWebP(file, 400); // Thumbnail size

                    const storageRef = ref(storage, `products/${productId}/${Date.now()}_${webpFile.name}`);
                    const thumbRef = ref(storage, `products/${productId}/thumb_${Date.now()}_${webpFile.name}`);

                    const uploadTask = uploadBytesResumable(storageRef, webpFile);
                    await uploadBytes(thumbRef, thumbWebp);
                    const thumbUrl = await getDownloadURL(thumbRef);

                    return new Promise((resolve, reject) => {
                        uploadTask.on('state_changed',
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;

                                // Cập nhật thanh tiến trình riêng lẻ
                                const bar = document.getElementById(`bar-${index}`);
                                const text = document.getElementById(`percent-${index}`);
                                if (bar) bar.style.width = progress + '%';
                                if (text) text.innerText = Math.round(progress) + '%';

                                progressMap.set(index, progress);

                                // Tính tổng tiến trình trung bình để cập nhật nút Submit
                                let totalProgress = 0;
                                progressMap.forEach(p => totalProgress += p);
                                const overallPercent = totalProgress / totalFiles;

                                // Cập nhật text trên nút
                                submitBtn.innerHTML = `<span class="spinner-small"></span> Đang tải lên: ${Math.round(overallPercent)}%`;
                            },
                            (error) => {
                                // Thu hồi bộ nhớ URL tạm thời khi có lỗi
                                URL.revokeObjectURL(previewUrl);
                                reject(error);
                            },
                            () => {
                                // Thu hồi bộ nhớ URL tạm thời khi thành công
                                URL.revokeObjectURL(previewUrl);
                                getDownloadURL(uploadTask.snapshot.ref).then(fullUrl => resolve({ fullUrl, thumbUrl })).catch(reject);
                            }
                        );
                    });
                });

                const results = await Promise.all(uploadPromises);
                // currentThumb đã được khai báo ở trên, giờ chỉ gán lại giá trị

                if (!currentMain) {
                    currentMain = results[0].fullUrl;
                    currentThumb = results[0].thumbUrl;
                    currentAdditionals = [...currentAdditionals, ...results.slice(1).map(r => r?.fullUrl)];
                } else {
                    currentAdditionals = [...currentAdditionals, ...results.map(r => r?.fullUrl)];
                }
            }

            // Lấy danh sách bộ sưu tập đã chọn
            const collectionsList = Array.from(document.querySelectorAll('.collection-checkbox:checked')).map(cb => cb.value);
            const eventsList = Array.from(document.querySelectorAll('.event-checkbox:checked')).map(cb => cb.value);

            const finalImageUrl = currentMain || 'https://placehold.co/300x300?text=No+Image';

            const isCombo = document.querySelector('input[name="product-type"]:checked').value === 'combo';

            // 2. Lưu thông tin vào Firestore
            const productData = {
                name: document.getElementById('name').value,
                name_lowercase: document.getElementById('name').value.toLowerCase(), // Thêm trường này cho tìm kiếm
                category: document.getElementById('category').value,
                collections: collectionsList,
                events: eventsList,
                price: window.getCurrencyValue('price'), // Base price
                cost: window.getCurrencyValue('cost'),
                rentalPrice: window.getCurrencyValue('rentalPrice'),
                stock: finalStock,
                sale: Number(document.getElementById('sale').value || 0),
                salePrice: document.getElementById('salePrice').value ? window.getCurrencyValue('salePrice') : null,
                dimensions: {
                    length: Number(document.getElementById('dim-length').value || 0),
                    width: Number(document.getElementById('dim-width').value || 0),
                    height: Number(document.getElementById('dim-height').value || 0),
                },
                specs: { // Đổi tên thành specs để chứa các thông số khác ngoài kích thước
                    weight: Number(document.getElementById('weight').value || 0),
                    capacity: Number(document.getElementById('capacity').value || 0)
                },
                usage: {
                    isFoodSafe: document.getElementById('usage-food-safe').checked,
                    isOvenSafe: document.getElementById('usage-oven-safe').checked,
                    isMicrowaveSafe: document.getElementById('usage-microwave-safe').checked
                },
                details: {
                    material: document.getElementById('material').value.trim(),
                    origin: document.getElementById('origin').value.trim()
                },
                flashSaleGroup: document.getElementById('flash-sale-group-select').value ? Number(document.getElementById('flash-sale-group-select').value) : null,
                imageUrl: finalImageUrl,
                thumbUrl: currentThumb, // Add thumbUrl to productData
                additionalImages: currentAdditionals,
                description: document.getElementById('description').value,
                colorVariants: colorVariantsResult,
                patternVariants: patternVariantsResult,
                patterns: patternVariantsResult.map(v => v.name), // Giữ lại patterns dạng string để tương thích ngược
                seoTitle: document.getElementById('seoTitle').value.trim(),
                seoDescription: document.getElementById('seoDescription').value.trim(),
                slug: document.getElementById('slug').value.trim(),
                isHidden: document.getElementById('product-is-hidden').checked,
                isOnlyEvent: document.getElementById('product-only-event').checked,
                isCombo: isCombo,
                comboVariants: isCombo ? window.comboVariants : [],
                comboItems: isCombo && window.comboVariants.length > 0 ? window.comboVariants[0].items : [], // Backward compatibility
                updatedAt: new Date().toISOString(),
                createdAt: isEdit && existingSnap.data().createdAt ? existingSnap.data().createdAt : new Date().toISOString()
            };

            // Nếu có biến thể, tổng tồn kho của sản phẩm sẽ là tổng của các biến thể
            if (hasVariants) {
                productData.stock = totalVariantStock;
            }


            // Nếu là sản phẩm mới, khởi tạo rating mặc định. Nếu là sửa, giữ nguyên rating hiện tại.
            if (!isEdit) {
                productData.rating = 5;
                productData.reviewCount = 0;
                productData.sold = 0;
            } else {
                const oldData = existingSnap.data();
                productData.rating = oldData.rating || 5;
                productData.reviewCount = oldData.reviewCount || 0;
                productData.sold = oldData.sold || 0;
            }

            // Ghi log tồn kho chỉ khi không có biến thể hoặc khi tổng tồn kho thay đổi đáng kể
            if (!hasVariants || (isEdit && existingSnap.data().stock !== productData.stock)) {
                // Log tồn kho
                // ... (existing inventory log logic)
            }


            await setDoc(productRef, productData);
            showToast(`Đã lưu sản phẩm ${productId} thành công!`);

            if (progressContainer) progressContainer.style.display = 'none';

            // Đóng modal, tự động dọn dẹp form
            if (typeof window.closeProductModal === 'function') {
                window.closeProductModal();
            }
        } catch (error) {
            console.error("Lỗi khi lưu:", error);
            showToast("Lỗi lưu dữ liệu: " + error.message, "error");
            if (progressContainer) progressContainer.style.display = 'none';
        } finally {
            submitBtn.disabled = false;
            if (submitBtn) { // Thêm kiểm tra an toàn
                submitBtn.innerHTML = "Lưu sản phẩm";
            }
        }
    });
}

// Lắng nghe danh sách sản phẩm thời gian thực
function initProductListener() {
    onSnapshot(collection(db, "products"), (snapshot) => {
        posProductsLocal = []; // Reset mảng cache mỗi khi dữ liệu Firestore thay đổi
        // Logic theo dõi biến động kho hàng
        snapshot.docChanges().forEach(change => {
            const id = change.doc.id;
            const p = change.doc.data();

            if (change.type === "modified") {
                const prevStock = stockTracker.get(id);
                // Phát hiện kho chuyển từ có hàng (> 0) sang hết hàng (<= 0)
                if (prevStock !== undefined && prevStock > 0 && p.stock <= 0) {
                    notifyOutOfStock(p.name);
                }
            }
            // Cập nhật bộ nhớ đệm kho (chạy cho cả lần load đầu và khi sửa)
            stockTracker.set(id, p.stock);
        });

        snapshot.forEach((doc) => {
            const p = doc.data();
            // Đổ dữ liệu vào mảng local để phục vụ tìm kiếm POS không cần gọi API lại
            posProductsLocal.push({ id: doc.id, ...p });
        });

        renderAdminProductTable(); // Gọi hàm hiển thị bảng
        populateFlashSaleGroupSelect(); // Cập nhật dropdown chọn nhóm sale
        renderAdminFlashSaleList(); // Tự động cập nhật danh sách Flash Sale
    }, (error) => {
        console.error("Product listener error:", error);
    });
}

window.currentSortCol = 'createdAt';
window.currentSortDir = 'desc';

// Quickview Sub-tab switcher
window.switchQuickViewTab = function (productId, tabName, btn) {
    const parentCard = btn.closest('.kiot-quickview-card');
    if (!parentCard) return;

    // Active tab style
    parentCard.querySelectorAll('.qv-tab-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const p = posProductsLocal.find(item => item.id === productId);
    if (!p) return;

    const bodyEl = parentCard.querySelector('.quickview-body');
    if (!bodyEl) return;

    let displayImgUrl = p.thumbUrl || p.imageUrl;
    if (!displayImgUrl || displayImgUrl.includes('placehold.co')) {
        if (p.patternVariants && p.patternVariants.length > 0 && p.patternVariants[0].imageUrl) {
            displayImgUrl = p.patternVariants[0].imageUrl;
        } else if (p.colorVariants && p.colorVariants.length > 0 && p.colorVariants[0].imageUrl) {
            displayImgUrl = p.colorVariants[0].imageUrl;
        }
    }

    if (tabName === 'description') {
        bodyEl.innerHTML = `
            <div style="flex: 1; padding: 10px; font-size: 0.85rem; color: #334155; line-height: 1.6;">
                <h4 style="margin: 0 0 8px 0; color: #0f172a;">Mô tả & Ghi chú sản phẩm</h4>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px;">
                    ${p.description || 'Chưa có thông tin mô tả chi tiết cho sản phẩm này.'}
                </div>
            </div>
        `;
    } else if (tabName === 'card') {
        bodyEl.innerHTML = `
            <div style="flex: 1; padding: 10px; font-size: 0.83rem;">
                <h4 style="margin: 0 0 8px 0; color: #0f172a;">Thẻ kho - Lịch sử xuất nhập hàng</h4>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: #f1f5f9; color: #475569;">
                            <th style="padding: 6px 10px;">Thời gian</th>
                            <th style="padding: 6px 10px;">Loại chứng từ</th>
                            <th style="padding: 6px 10px;">Thay đổi</th>
                            <th style="padding: 6px 10px;">Tồn cuối</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 6px 10px;">${p.createdAt ? new Date(p.createdAt.toDate ? p.createdAt.toDate() : p.createdAt).toLocaleString('vi-VN') : 'Mới tạo'}</td>
                            <td style="padding: 6px 10px;"><span style="color: #0066cc; font-weight: 600;">Khởi tạo sản phẩm</span></td>
                            <td style="padding: 6px 10px; color: #16a34a; font-weight: 700;">+${p.stock || 0}</td>
                            <td style="padding: 6px 10px; font-weight: 700;">${p.stock || 0}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    } else if (tabName === 'stock') {
        bodyEl.innerHTML = `
            <div style="flex: 1; padding: 10px; font-size: 0.83rem;">
                <h4 style="margin: 0 0 8px 0; color: #0f172a;">Tồn kho chi tiết theo biến thể / Chi nhánh</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <div style="background: #f0f7ff; border: 1px solid #bfdbfe; padding: 10px 16px; border-radius: 6px;">
                        <span style="color: #64748b; font-size: 0.78rem;">Tổng tồn kho hiện tại:</span>
                        <div style="font-size: 1.2rem; font-weight: 700; color: #0066cc;">${p.stock || 0} sản phẩm</div>
                    </div>
                    <div style="background: #fcf5e5; border: 1px solid #fde68a; padding: 10px 16px; border-radius: 6px;">
                        <span style="color: #64748b; font-size: 0.78rem;">Khách đã đặt giữ chỗ:</span>
                        <div style="font-size: 1.2rem; font-weight: 700; color: #d97706;">${p.sold || 0} sản phẩm</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Tab 'info' (Mặc định)
        const costPriceStr = p.cost ? `${new Intl.NumberFormat('vi-VN').format(p.cost)} VND` : 'Chưa có';
        const salePriceStr = `${new Intl.NumberFormat('vi-VN').format(p.price)} VND`;
        bodyEl.innerHTML = `
            <img src="${displayImgUrl || 'https://placehold.co/120x120?text=No+Image'}" alt="${p.name}" class="quickview-thumb">
            <div class="quickview-info-col">
                <h2 class="quickview-title">${p.name}</h2>
                <div class="quickview-subtags">
                    <span class="qv-tag">Nhóm hàng: <strong>${p.category || 'Chưa xếp nhóm'}</strong></span>
                    <span class="qv-tag">${p.isCombo ? 'Hàng combo' : 'Hàng hóa thường'}</span>
                    <span class="qv-tag warning">Bán trực tiếp</span>
                    <span class="qv-tag muted">Không tích điểm</span>
                </div>

                <div class="quickview-fields-grid">
                    <div class="qv-field"><span class="qv-label">Mã hàng:</span> <strong>${p.id}</strong></div>
                    <div class="qv-field"><span class="qv-label">Mã vạch:</span> <span>Chưa có</span></div>
                    <div class="qv-field"><span class="qv-label">Thương hiệu:</span> <span>${p.brand || 'Chưa có'}</span></div>
                    <div class="qv-field"><span class="qv-label">Định mức tồn:</span> <span>0 - 10</span></div>

                    <div class="qv-field"><span class="qv-label">Giá vốn:</span> <strong>${costPriceStr}</strong></div>
                    <div class="qv-field"><span class="qv-label">Giá bán:</span> <strong style="color: #0066cc;">${salePriceStr}</strong></div>
                    <div class="qv-field"><span class="qv-label">Trọng lượng:</span> <span>Chưa có</span></div>
                    <div class="qv-field"><span class="qv-label">Vị trí:</span> <span>Chưa có</span></div>
                </div>
            </div>
        `;
    }
};

// Sao chép sản phẩm (Clone)
window.cloneProduct = async function (productId) {
    if (typeof editProduct === 'function') {
        await editProduct(productId);
        const productIdEl = document.getElementById('productId');
        if (productIdEl) {
            productIdEl.value = 'SP' + Math.floor(100000 + Math.random() * 900000);
            productIdEl.readOnly = false;
        }
        const titleEl = document.getElementById('product-modal-title');
        if (titleEl) titleEl.innerText = 'Sao chép sản phẩm mới từ ' + productId;
        showToast(`Đã sao chép thông tin sản phẩm ${productId}. Hãy kiểm tra và lưu lại!`, "info");
    }
};

// In tem mã vạch
window.printBarcodeLabel = function (productId) {
    const p = posProductsLocal.find(item => item.id === productId);
    const pName = p ? p.name : productId;
    showToast(`Đang kết nối máy in để in tem mã vạch cho ${pName}...`, "info");
};

// Quick view expandable row toggle
window.toggleProductQuickView = function (productId, event) {
    if (event) event.stopPropagation();

    const existingDetail = document.getElementById(`product-detail-row-${productId}`);
    const targetRow = document.querySelector(`tr[data-product-id="${productId}"]`);

    if (existingDetail) {
        existingDetail.remove();
        if (targetRow) targetRow.classList.remove('expanded');
        return;
    }

    // Remove any currently open detail rows
    document.querySelectorAll('.kiot-detail-row').forEach(row => row.remove());
    document.querySelectorAll('.product-row').forEach(row => row.classList.remove('expanded'));

    const p = posProductsLocal.find(item => item.id === productId);
    if (!p || !targetRow) return;

    targetRow.classList.add('expanded');

    let displayImgUrl = p.thumbUrl || p.imageUrl;
    if (!displayImgUrl || displayImgUrl.includes('placehold.co')) {
        if (p.patternVariants && p.patternVariants.length > 0 && p.patternVariants[0].imageUrl) {
            displayImgUrl = p.patternVariants[0].imageUrl;
        } else if (p.colorVariants && p.colorVariants.length > 0 && p.colorVariants[0].imageUrl) {
            displayImgUrl = p.colorVariants[0].imageUrl;
        }
    }

    const costPriceStr = p.cost ? `${new Intl.NumberFormat('vi-VN').format(p.cost)} VND` : 'Chưa có';
    const salePriceStr = `${new Intl.NumberFormat('vi-VN').format(p.price)} VND`;

    const detailRow = document.createElement('tr');
    detailRow.id = `product-detail-row-${productId}`;
    detailRow.className = 'kiot-detail-row';
    detailRow.innerHTML = `
        <td colspan="11" style="padding: 0; background: #ffffff;">
            <div class="kiot-quickview-card">
                <div class="quickview-tabs">
                    <button type="button" class="qv-tab-item active" onclick="window.switchQuickViewTab('${p.id}', 'info', this)">Thông tin</button>
                    <button type="button" class="qv-tab-item" onclick="window.switchQuickViewTab('${p.id}', 'description', this)">Mô tả, ghi chú</button>
                    <button type="button" class="qv-tab-item" onclick="window.switchQuickViewTab('${p.id}', 'card', this)">Thẻ kho</button>
                    <button type="button" class="qv-tab-item" onclick="window.switchQuickViewTab('${p.id}', 'stock', this)">Tồn kho</button>
                </div>

                <div class="quickview-body">
                    <img src="${displayImgUrl || 'https://placehold.co/120x120?text=No+Image'}" alt="${p.name}" class="quickview-thumb">
                    <div class="quickview-info-col">
                        <h2 class="quickview-title">${p.name}</h2>
                        <div class="quickview-subtags">
                            <span class="qv-tag">Nhóm hàng: <strong>${p.category || 'Chưa xếp nhóm'}</strong></span>
                            <span class="qv-tag">${p.isCombo ? 'Hàng combo' : 'Hàng hóa thường'}</span>
                            <span class="qv-tag warning">Bán trực tiếp</span>
                            <span class="qv-tag muted">Không tích điểm</span>
                        </div>

                        <div class="quickview-fields-grid">
                            <div class="qv-field"><span class="qv-label">Mã hàng:</span> <strong>${p.id}</strong></div>
                            <div class="qv-field"><span class="qv-label">Mã vạch:</span> <span>Chưa có</span></div>
                            <div class="qv-field"><span class="qv-label">Thương hiệu:</span> <span>${p.brand || 'Chưa có'}</span></div>
                            <div class="qv-field"><span class="qv-label">Định mức tồn:</span> <span>0 - 10</span></div>

                            <div class="qv-field"><span class="qv-label">Giá vốn:</span> <strong>${costPriceStr}</strong></div>
                            <div class="qv-field"><span class="qv-label">Giá bán:</span> <strong style="color: #0066cc;">${salePriceStr}</strong></div>
                            <div class="qv-field"><span class="qv-label">Trọng lượng:</span> <span>Chưa có</span></div>
                            <div class="qv-field"><span class="qv-label">Vị trí:</span> <span>Chưa có</span></div>
                        </div>
                    </div>
                </div>

                <div class="quickview-footer">
                    <div class="left-actions">
                        <button type="button" class="qv-btn-text red" onclick="deleteProduct('${p.id}')">🗑️ Xóa</button>
                        <button type="button" class="qv-btn-text" onclick="window.cloneProduct('${p.id}')">📋 Sao chép</button>
                    </div>
                    <div class="right-actions">
                        <button type="button" class="kiot-btn-primary" onclick="window.editProduct('${p.id}')">✏️ Chỉnh sửa</button>
                        <button type="button" class="kiot-btn-outline" onclick="window.printBarcodeLabel('${p.id}')">🖨️ In tem mã</button>
                    </div>
                </div>
            </div>
        </td>
    `;

    targetRow.parentNode.insertBefore(detailRow, targetRow.nextSibling);
};

window.currentPage = 1;
window.pageSize = 15;

// Hàm chuyển trang & đổi kích thước trang
window.changePageSize = function (size) {
    window.pageSize = parseInt(size) || 15;
    window.currentPage = 1;
    renderAdminProductTable();
};

window.goToPage = function (page) {
    window.currentPage = parseInt(page) || 1;
    renderAdminProductTable();
};

window.changePage = function (delta) {
    window.currentPage += delta;
    renderAdminProductTable();
};

window.goToLastPage = function () {
    const totalItems = posProductsLocal.length;
    const totalPages = Math.ceil(totalItems / window.pageSize) || 1;
    window.currentPage = totalPages;
    renderAdminProductTable();
};

// Reset tất cả bộ lọc hàng hóa
window.resetProductFilters = function () {
    const searchInput = document.getElementById('admin-product-search');
    const catSelect = document.getElementById('admin-product-category-filter');
    const stockSelect = document.getElementById('admin-product-stock-filter');
    const typeSelect = document.getElementById('admin-product-type-filter');
    const statusSelect = document.getElementById('admin-product-status-filter');

    if (searchInput) searchInput.value = '';
    if (catSelect) catSelect.value = 'all';
    if (stockSelect) stockSelect.value = 'all';
    if (typeSelect) typeSelect.value = 'all';
    if (statusSelect) statusSelect.value = 'active';

    window.currentPage = 1;
    renderAdminProductTable();
};

// Hàm hiển thị bảng sản phẩm Admin
function renderAdminProductTable() {
    const listTable = document.getElementById('admin-product-list');
    const searchInput = document.getElementById('admin-product-search');
    const categoryFilter = document.getElementById('admin-product-category-filter');
    const stockFilter = document.getElementById('admin-product-stock-filter');
    const typeFilter = document.getElementById('admin-product-type-filter');
    const statusFilter = document.getElementById('admin-product-status-filter');
    if (!listTable) return;

    // Tự động nạp nhóm danh mục vào Filter bên trái nếu chưa có
    if (categoryFilter && categoryFilter.options.length <= 1 && Array.isArray(adminDynamicCategories) && adminDynamicCategories.length > 0) {
        adminDynamicCategories.forEach(group => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = group.name;
            if (Array.isArray(group.subs)) {
                group.subs.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.innerText = sub;
                    optGroup.appendChild(opt);
                });
            }
            categoryFilter.appendChild(optGroup);
        });
    }

    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const catValue = categoryFilter ? categoryFilter.value : 'all';
    const stockValue = stockFilter ? stockFilter.value : 'all';
    const typeValue = typeFilter ? typeFilter.value : 'all';
    const statusValue = statusFilter ? statusFilter.value : 'all';
    const directPill = document.querySelector('.pill-options .pill-btn.active')?.getAttribute('data-direct') || 'all';

    // Lọc sản phẩm
    let filtered = posProductsLocal.filter(p => {
        const matchesSearch = (p.name || "").toLowerCase().includes(term) || p.id.toLowerCase().includes(term);
        const matchesCategory = catValue === 'all' || p.category === catValue;

        let matchesStock = true;
        const s = Number(p.stock) || 0;
        if (stockValue === 'below-min') matchesStock = s <= 5;
        else if (stockValue === 'above-max') matchesStock = s >= 50;
        else if (stockValue === 'in-stock') matchesStock = s > 0;
        else if (stockValue === 'out-of-stock') matchesStock = s <= 0;

        const matchesType = typeValue === 'all' ||
            (typeValue === 'combo' && p.isCombo) ||
            (typeValue === 'normal' && !p.isCombo);

        let matchesStatus = true;
        if (statusValue === 'active') matchesStatus = !p.isHidden;
        else if (statusValue === 'inactive') matchesStatus = p.isHidden;
        else if (statusValue === 'all') matchesStatus = true;

        let matchesDirect = true;
        if (directPill === 'yes') matchesDirect = !p.isOnlyEvent;
        else if (directPill === 'no') matchesDirect = p.isOnlyEvent;

        return matchesSearch && matchesCategory && matchesStock && matchesType && matchesStatus && matchesDirect;
    });

    // Sắp xếp
    filtered.sort((a, b) => {
        let valA = a[window.currentSortCol];
        let valB = b[window.currentSortCol];

        if (window.currentSortCol === 'createdAt') {
            valA = valA ? (valA.toMillis ? valA.toMillis() : new Date(valA).getTime()) : 0;
            valB = valB ? (valB.toMillis ? valB.toMillis() : new Date(valB).getTime()) : 0;
        } else if (window.currentSortCol === 'name' || window.currentSortCol === 'id') {
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
        } else {
            valA = valA || 0;
            valB = valB || 0;
        }

        if (valA < valB) return window.currentSortDir === 'asc' ? -1 : 1;
        if (valA > valB) return window.currentSortDir === 'asc' ? 1 : -1;
        return 0;
    });

    // Xử lý Phân trang (Pagination)
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / window.pageSize));

    if (window.currentPage > totalPages) window.currentPage = totalPages;
    if (window.currentPage < 1) window.currentPage = 1;

    const startIndex = (window.currentPage - 1) * window.pageSize;
    const endIndex = Math.min(startIndex + window.pageSize, totalItems);
    const pageItems = filtered.slice(startIndex, endIndex);

    // Cập nhật Footer Bar phân trang
    const infoEl = document.getElementById('kiot-pagination-info');
    if (infoEl) {
        infoEl.innerText = totalItems > 0
            ? `${startIndex + 1} - ${endIndex} trong ${totalItems} hàng hóa`
            : `0 - 0 trong 0 hàng hóa`;
    }

    const inputPageEl = document.getElementById('kiot-page-input');
    if (inputPageEl) inputPageEl.value = window.currentPage;

    let htmlContent = '';
    pageItems.forEach((p) => {
        const stockDisplay = p.stock <= 0
            ? `<span class="stock-badge stock-out" style="background:#fee2e2; color:#dc2626; padding:2px 6px; border-radius:4px; font-weight:600;">0</span>`
            : p.stock;

        let displayImgUrl = p.thumbUrl || p.imageUrl;
        if (!displayImgUrl || displayImgUrl.includes('placehold.co')) {
            if (p.patternVariants && p.patternVariants.length > 0 && p.patternVariants[0].imageUrl) {
                displayImgUrl = p.patternVariants[0].imageUrl;
            } else if (p.colorVariants && p.colorVariants.length > 0 && p.colorVariants[0].imageUrl) {
                displayImgUrl = p.colorVariants[0].imageUrl;
            }
        }

        const createdDate = p.createdAt ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) : null;
        const formattedDate = createdDate ?
            `${createdDate.getDate().toString().padStart(2, '0')}/${(createdDate.getMonth() + 1).toString().padStart(2, '0')}/${createdDate.getFullYear()} ${createdDate.getHours().toString().padStart(2, '0')}:${createdDate.getMinutes().toString().padStart(2, '0')}` : '---';

        htmlContent += `
            <tr onclick="window.toggleProductQuickView('${p.id}', event)" style="cursor: pointer;" class="product-row" data-product-id="${p.id}">
                <td style="text-align: center;" onclick="event.stopPropagation();"><input type="checkbox" class="product-row-checkbox" value="${p.id}"></td>
                <td style="text-align: center; color: ${p.isFeatured ? '#f1c40f' : '#ccc'}; cursor: pointer;" class="star-toggle" data-id="${p.id}" onclick="event.stopPropagation();">&#9733;</td>
                <td data-label="Ảnh"><img src="${displayImgUrl || 'https://placehold.co/40'}" alt="${p.name}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                <td data-label="Mã hàng"><span style="color: #0066cc; font-weight: 600;">${p.id}</span></td>
                <td data-label="Tên hàng">
                    <strong style="color: #1e293b;">${p.name}</strong>
                    ${p.isCombo ? '<span style="display:inline-block; margin-left: 6px; padding: 2px 6px; background: #f59e0b; color: #ffffff; font-size: 0.72rem; border-radius: 4px; font-weight: 600;">Combo</span>' : ''}
                    ${p.isHidden ? '<span style="display:inline-block; margin-left: 6px; padding: 2px 6px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-size: 0.72rem; border-radius: 4px; font-weight: 600;">Đã ẩn</span>' : ''}
                    ${p.isOnlyEvent ? '<span style="display:inline-block; margin-left: 6px; padding: 2px 6px; background: #e0f2fe; color: #0284c7; border: 1px solid #7dd3fc; font-size: 0.72rem; border-radius: 4px; font-weight: 600;">Sự kiện</span>' : ''}
                    ${p.isFlashSale ? '<span style="display:inline-block; margin-left: 6px; padding: 2px 6px; background: #ffeaa7; color: #d63031; font-size: 0.72rem; border-radius: 4px; font-weight: 600;">Sale</span>' : ''}
                </td>
                <td data-label="Giá bán">${new Intl.NumberFormat('vi-VN').format(p.price)}</td>
                <td data-label="Giá vốn">${new Intl.NumberFormat('vi-VN').format(p.cost || 0)}</td>
                <td data-label="Tồn kho">${p.isCombo ? '-' : stockDisplay}</td>
                <td data-label="Khách đặt">${p.sold || 0}</td>
                <td data-label="Thời gian tạo">${formattedDate}</td>
                <td data-label="Dự kiến hết hàng">---</td>
            </tr>`;
    });

    listTable.innerHTML = htmlContent || '<tr><td colspan="11" style="text-align:center; padding: 20px; color: #94a3b8;">Không tìm thấy sản phẩm phù hợp.</td></tr>';

    // Update sort icons
    document.querySelectorAll('.sortable-header').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (icon) {
            if (th.getAttribute('data-sort') === window.currentSortCol) {
                icon.textContent = window.currentSortDir === 'asc' ? '↑' : '↓';
            } else {
                icon.textContent = '↕';
            }
        }
    });
}

// Lắng nghe sự kiện click vào các tiêu đề cột để sắp xếp & sự kiện bộ lọc
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sortable-header').forEach(th => {
        th.addEventListener('click', () => {
            const sortCol = th.getAttribute('data-sort');
            if (window.currentSortCol === sortCol) {
                window.currentSortDir = window.currentSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                window.currentSortCol = sortCol;
                window.currentSortDir = 'asc';
            }
            renderAdminProductTable();
        });
    });

    // Event listeners cho các ô lọc Hàng hóa
    const searchInput = document.getElementById('admin-product-search');
    if (searchInput) searchInput.addEventListener('input', renderAdminProductTable);

    ['admin-product-category-filter', 'admin-product-stock-filter', 'admin-product-type-filter', 'admin-product-status-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderAdminProductTable);
    });

    // Pill buttons cho "Bán trực tiếp"
    document.querySelectorAll('.pill-options .pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.pill-options .pill-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderAdminProductTable();
        });
    });
});

// Hàm xuất danh sách sản phẩm hiện tại ra file Excel (CSV)
async function exportProductToExcel() {
    if (posProductsLocal.length === 0) {
        showToast("Không có dữ liệu để xuất", "error");
        return;
    }

    // Lấy các giá trị lọc hiện tại để xuất đúng những gì đang hiển thị trên bảng
    const term = document.getElementById('admin-product-search')?.value.trim().toLowerCase() || '';
    const catValue = document.getElementById('admin-product-category-filter')?.value || 'all';
    const stockValue = document.getElementById('admin-product-stock-filter')?.value || 'all';

    const dataToExport = posProductsLocal.filter(p => {
        const matchesSearch = (p.name || "").toLowerCase().includes(term) || p.id.toLowerCase().includes(term);
        const matchesCategory = catValue === 'all' || p.category === catValue;
        const matchesStock = stockValue === 'all' ||
            (stockValue === 'in-stock' && p.stock > 0) ||
            (stockValue === 'out-of-stock' && p.stock <= 0);
        return matchesSearch && matchesCategory && matchesStock;
    });

    // 1. Định nghĩa tiêu đề cột
    const headers = ["Mã SP (ID)", "Tên sản phẩm", "Danh mục", "Giá bán", "Giá vốn", "Tồn kho", "Sale (%)", "Đánh giá", "Ngày cập nhật"];

    // 2. Tạo nội dung HTML với CSS đặc thù cho Excel
    let excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8"/>
            <style>
                table { border-collapse: collapse; width: 100%; }
                th { background-color: #2c3e50; color: #ffffff; border: 0.5pt solid #000000; padding: 5px; font-weight: bold; }
                td { border: 0.5pt solid #000000; padding: 5px; vertical-align: middle; }
                .text { mso-number-format:"\\@"; } /* Định dạng văn bản để không mất số 0 đầu */
                .number { mso-number-format:"\\#\\,\\#\\#0"; text-align: right; } /* Định dạng số có dấu phẩy */
                .date { text-align: center; }
            </style>
        </head>
        <body>
            <table>
                <thead>
                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${dataToExport.map(p => `
                        <tr>
                            <td class="text">${p.id}</td>
                            <td class="text">${p.name}</td>
                            <td class="text">${p.category}</td>
                            <td class="number">${p.price}</td>
                            <td class="number">${p.cost || 0}</td>
                            <td class="number">${p.stock}</td>
                            <td class="number">${p.sale || 0}</td>
                            <td class="number">${p.rating || 5}</td>
                            <td class="date">${p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN') : ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;

    // 3. Tạo Blob với định dạng .xls (Excel 97-2003)
    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `Danh_sach_san_pham_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Đã xuất file thành công!");
}

async function editProduct(id) {
    try {
        const docRef = doc(db, "products", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const p = docSnap.data();
            const titleEl = document.getElementById('product-modal-title');
            if (titleEl) titleEl.innerText = 'Sửa sản phẩm: ' + (p.name || id);

            // Điền dữ liệu vào form
            document.getElementById('productId').value = id;
            document.getElementById('productId').readOnly = true;
            document.getElementById('name').value = p.name;
            document.getElementById('category').value = p.category;
            document.getElementById('price').value = window.formatCurrencyDisplay(p.price);
            document.getElementById('cost').value = window.formatCurrencyDisplay(p.cost || 0);
            document.getElementById('rentalPrice').value = window.formatCurrencyDisplay(p.rentalPrice || 0);
            document.getElementById('salePrice').value = p.salePrice ? window.formatCurrencyDisplay(p.salePrice) : '';
            document.getElementById('stock').value = p.stock;
            document.getElementById('sale').value = p.sale || 0;
            document.getElementById('flash-sale-group-select').value = p.flashSaleGroup || "";

            // Xử lý nạp dữ liệu Combo
            if (p.isCombo) {
                document.querySelector('input[name="product-type"][value="combo"]').checked = true;
                if (p.comboVariants && p.comboVariants.length > 0) {
                    window.comboVariants = p.comboVariants;
                } else if (p.comboItems && p.comboItems.length > 0) {
                    window.comboVariants = [{ name: 'Mặc định', items: p.comboItems }];
                } else {
                    window.comboVariants = [{ name: 'Mặc định', items: [] }];
                }
                window.currentComboVariantIndex = 0;
            } else {
                document.querySelector('input[name="product-type"][value="normal"]').checked = true;
                window.comboVariants = [{ name: 'Mặc định', items: [] }];
                window.currentComboVariantIndex = 0;
            }
            window.toggleComboSection();

            document.getElementById('dim-length').value = p.dimensions?.length || '';
            document.getElementById('dim-width').value = p.dimensions?.width || '';
            document.getElementById('dim-height').value = p.dimensions?.height || '';
            const elCostPrice = document.getElementById('costPrice');
            if (elCostPrice) elCostPrice.value = window.formatCurrencyDisplay(p.costPrice || 0);
            document.getElementById('product-is-hidden').checked = p.isHidden || false;
            document.getElementById('product-only-event').checked = p.isOnlyEvent || false;
            document.getElementById('stock').value = p.stock || 0;
            document.getElementById('usage-food-safe').checked = p.usage?.isFoodSafe || false;
            document.getElementById('usage-oven-safe').checked = p.usage?.isOvenSafe || false;
            document.getElementById('usage-microwave-safe').checked = p.usage?.isMicrowaveSafe || false;

            document.getElementById('weight').value = p.specs?.weight || '';
            document.getElementById('capacity').value = p.specs?.capacity || '';

            document.getElementById('material').value = p.details?.material || '';
            document.getElementById('origin').value = p.details?.origin || '';

            // Load collections checkbox
            const colCheckboxes = document.querySelectorAll('.collection-checkbox');
            colCheckboxes.forEach(cb => {
                cb.checked = (p.collections || []).includes(cb.value);
            });
            const eventCheckboxes = document.querySelectorAll('.event-checkbox');
            eventCheckboxes.forEach(cb => {
                cb.checked = (p.events || []).includes(cb.value);
            });

            // Vô hiệu hóa trường tồn kho và checkbox "Nhập thêm" nếu có biến thể
            const hasVariants = (p.colorVariants && p.colorVariants.length > 0) || (p.patternVariants && p.patternVariants.length > 0);
            toggleStockInputState(hasVariants);

            // Xóa và nạp lại các hàng biến thể màu sắc
            const variantContainer = document.getElementById('variant-items-container');
            if (variantContainer) {
                variantContainer.innerHTML = '';
                if (p.colorVariants && Array.isArray(p.colorVariants)) {
                    p.colorVariants.forEach(v => window.addVariantRow(v.name, v.imageUrl, v.stock || 0, v.showOnProductPage || false, v.price || ''));
                }
            }

            // Xóa và nạp lại các hàng biến thể họa tiết
            const patternContainer = document.getElementById('pattern-variant-items-container');
            if (patternContainer) {
                patternContainer.innerHTML = '';
                if (p.patternVariants && Array.isArray(p.patternVariants)) {
                    p.patternVariants.forEach(v => window.addPatternVariantRow(v.name, v.imageUrl, v.stock || 0, v.showOnProductPage || false, v.price || ''));
                } else if (p.patterns && Array.isArray(p.patterns)) {
                    // Hỗ trợ migrate dữ liệu cũ từ array string sang variant row (chưa có ảnh/stock)
                    p.patterns.forEach(name => window.addPatternVariantRow(name, '', 0, false, ''));
                }
            }

            // Reset checkbox nhập thêm khi load dữ liệu sửa sản phẩm khác
            const additiveCheckbox = document.getElementById('stock-additive');
            if (additiveCheckbox) additiveCheckbox.checked = false;

            document.getElementById('description').value = p.description || '';
            if (window.quillProductEditor) {
                window.quillProductEditor.root.innerHTML = p.description || '';
            }
            document.getElementById('productId').dataset.currentThumbUrl = p.thumbUrl || ''; // Store thumbUrl for editing
            document.getElementById('seoTitle').value = p.seoTitle || '';
            document.getElementById('seoDescription').value = p.seoDescription || '';
            document.getElementById('slug').value = p.slug || '';
            document.getElementById('product-is-hidden').checked = p.isHidden || false;

            // Lưu URL ảnh hiện tại để không bị mất nếu không upload ảnh mới
            document.getElementById('productId').dataset.currentImageUrl = p.imageUrl;
            document.getElementById('productId').dataset.currentAdditionalImages = JSON.stringify(p.additionalImages || []);

            // Hiển thị xem trước ảnh
            renderImagePreviews();

            // Mở form modal
            if (typeof window.openProductModal === 'function') {
                window.openProductModal();
            }
        }
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu sửa:", error);
    }
}
window.editProduct = editProduct;

// Hàm điều khiển trạng thái của input tồn kho và checkbox "Nhập thêm"
function toggleStockInputState(disable) {
    const stockInput = document.getElementById('stock');
    const additiveCheckbox = document.getElementById('stock-additive');
    if (stockInput) stockInput.disabled = disable;
    if (additiveCheckbox) additiveCheckbox.disabled = disable;
}

async function deleteProduct(id) {
    if (confirm(`Bạn có chắc muốn xóa vĩnh viễn sản phẩm ${id}?`)) {
        try {
            await deleteDoc(doc(db, "products", id));
            showToast(`Đã xóa sản phẩm ${id}`);
        } catch (error) {
            showToast("Lỗi khi xóa: " + error.message, "error");
        }
    }
}

// --- Quản lý đơn hàng cho Admin ---
let unsubscribeOrders = null;
let allOrdersCache = [];
let currentOrderUserIdFilter = '';
const ORDER_PAGE_SIZE = 10;
let currentOrderPage = 1;

function initOrderListener(productNameFilter = '', statusFilter = 'all', navigation = 'init', userIdFilter = '', orderIdFilter = '') {
    currentOrderUserIdFilter = userIdFilter || '';
    if (navigation === 'init') {
        currentOrderPage = 1;
    }

    // Đổ dữ liệu tìm kiếm vào các ô nếu có tham số truyền vào
    const idInput = document.getElementById('order-filter-id');
    if (idInput && orderIdFilter) idInput.value = orderIdFilter;
    const prodInput = document.getElementById('order-filter-product');
    if (prodInput && productNameFilter) prodInput.value = productNameFilter;
    const statSelect = document.getElementById('order-filter-status');
    if (statSelect && statusFilter !== 'all') statSelect.value = statusFilter;

    if (!unsubscribeOrders && db) {
        unsubscribeOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
            allOrdersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderOrdersFiltered();
            if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
        }, (error) => {
            console.error("Order list listener error:", error);
        });
    } else {
        renderOrdersFiltered();
        if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
    }
}

window.currentOrderPage = 1;
window.currentOrderPageSize = 15;

window.changeOrderPageSize = function (size) {
    window.currentOrderPageSize = parseInt(size, 10) || 15;
    window.currentOrderPage = 1;
    renderOrdersFiltered();
};

window.goOrderPage = function (page) {
    const totalPages = window.currentOrderTotalPages || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    window.currentOrderPage = page;
    renderOrdersFiltered();
};

window.selectedDatePreset = 'all';

window.toggleTimePresetPopover = function (event) {
    if (event) event.stopPropagation();
    const presetPop = document.getElementById('time-preset-popover');
    const customPop = document.getElementById('custom-date-popover');
    const btn = document.getElementById('btn-radio-time-preset');

    if (customPop) customPop.classList.remove('show');

    if (presetPop) {
        const willShow = !presetPop.classList.contains('show');
        if (willShow && btn) {
            const rect = btn.getBoundingClientRect();
            presetPop.style.top = Math.max(10, rect.top) + 'px';
            presetPop.style.left = (rect.right + 4) + 'px';
        }
        presetPop.classList.toggle('show');
    }
};

window.toggleCustomDatePopover = function (event) {
    if (event) event.stopPropagation();
    const presetPop = document.getElementById('time-preset-popover');
    const customPop = document.getElementById('custom-date-popover');
    const btn = document.getElementById('btn-radio-time-custom');

    if (presetPop) presetPop.classList.remove('show');

    if (customPop) {
        const willShow = !customPop.classList.contains('show');
        if (willShow && btn) {
            const rect = btn.getBoundingClientRect();
            customPop.style.top = Math.max(10, rect.top) + 'px';
            customPop.style.left = (rect.right + 4) + 'px';
        }
        customPop.classList.toggle('show');
    }
};

window.selectTimePreset = function (presetKey, presetName, btnElem) {
    window.selectedDatePreset = presetKey;
    const label = document.getElementById('order-time-preset-label');
    if (label) label.innerText = '🔵 ' + presetName;

    const btnPreset = document.getElementById('btn-radio-time-preset');
    const btnCustom = document.getElementById('btn-radio-time-custom');
    if (btnPreset) btnPreset.classList.add('active');
    if (btnCustom) btnCustom.classList.remove('active');

    const presetPop = document.getElementById('time-preset-popover');
    if (presetPop) {
        presetPop.querySelectorAll('.popover-pill').forEach(p => p.classList.remove('active'));
        if (btnElem) btnElem.classList.add('active');
        presetPop.classList.remove('show');
    }

    window.currentOrderPage = 1;
    renderOrdersFiltered();
};

window.closeCustomDatePopover = function () {
    const customPop = document.getElementById('custom-date-popover');
    if (customPop) customPop.classList.remove('show');
};

window.setTodayDateRange = function () {
    const todayStr = new Date().toISOString().split('T')[0];
    const fromInput = document.getElementById('order-filter-date-from');
    const toInput = document.getElementById('order-filter-date-to');
    if (fromInput) fromInput.value = todayStr;
    if (toInput) toInput.value = todayStr;
};

window.applyCustomDateRange = function () {
    window.selectedDatePreset = 'custom';
    const label = document.getElementById('order-time-custom-label');
    const fromInput = document.getElementById('order-filter-date-from')?.value;
    const toInput = document.getElementById('order-filter-date-to')?.value;

    if (label && fromInput && toInput) {
        label.innerText = `🔵 Tùy chỉnh (${fromInput} - ${toInput})`;
    }

    const btnPreset = document.getElementById('btn-radio-time-preset');
    const btnCustom = document.getElementById('btn-radio-time-custom');
    if (btnCustom) btnCustom.classList.add('active');
    if (btnPreset) btnPreset.classList.remove('active');

    window.closeCustomDatePopover();
    window.currentOrderPage = 1;
    renderOrdersFiltered();
};

document.addEventListener('click', function (e) {
    if (!e.target.closest('#time-preset-popover') && !e.target.closest('#btn-radio-time-preset')) {
        const pop = document.getElementById('time-preset-popover');
        if (pop) pop.classList.remove('show');
    }
    if (!e.target.closest('#custom-date-popover') && !e.target.closest('#btn-radio-time-custom')) {
        const pop = document.getElementById('custom-date-popover');
        if (pop) pop.classList.remove('show');
    }
});

window.resetOrderFilters = function () {
    const search = document.getElementById('order-search-input');
    if (search) search.value = '';

    document.querySelectorAll('.filter-status-chk').forEach(chk => {
        chk.checked = chk.value === 'Đang xử lý' || chk.value === 'Đã hoàn thành';
    });

    document.querySelectorAll('.filter-type-chk').forEach(chk => chk.checked = true);

    ['order-filter-delivery-status', 'order-filter-carrier', 'order-filter-payment', 'order-filter-creator', 'order-filter-seller', 'order-filter-pricelist', 'order-filter-channel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });

    window.selectTimePreset('this_month', 'Tháng này', null);
};

window.renderOrdersFiltered = function renderOrdersFiltered() {
    const orderListTable = document.getElementById('admin-order-list');
    const prevBtn = document.getElementById('prev-order-page');
    const nextBtn = document.getElementById('next-order-page');
    const firstBtn = document.getElementById('first-order-page');
    const lastBtn = document.getElementById('last-order-page');
    const pageInfo = document.getElementById('order-page-info');
    const countInfo = document.getElementById('order-pagination-count');

    if (!orderListTable) return;

    // Lấy các giá trị bộ lọc
    const idVal = document.getElementById('order-search-input')?.value.trim().toLowerCase() || '';

    const checkedStatuses = Array.from(document.querySelectorAll('.filter-status-chk:checked')).map(c => c.value);
    const checkedTypes = Array.from(document.querySelectorAll('.filter-type-chk:checked')).map(c => c.value);

    const deliveryStatusVal = document.getElementById('order-filter-delivery-status')?.value || 'all';
    const carrierVal = document.getElementById('order-filter-carrier')?.value || 'all';
    const paymentVal = document.getElementById('order-filter-payment')?.value || 'all';
    const creatorVal = document.getElementById('order-filter-creator')?.value || 'all';
    const sellerVal = document.getElementById('order-filter-seller')?.value || 'all';
    const pricelistVal = document.getElementById('order-filter-pricelist')?.value || 'all';
    const channelVal = document.getElementById('order-filter-channel')?.value || 'all';

    const datePreset = window.selectedDatePreset || 'this_month';
    const dateFrom = document.getElementById('order-filter-date-from')?.value;
    const dateTo = document.getElementById('order-filter-date-to')?.value;

    // Lọc đơn hàng
    let filtered = allOrdersCache.filter(order => {
        if (order.orderType === 'rental') return false;

        const matchesId = !idVal || order.id.toLowerCase().includes(idVal) ||
            (order.shippingAddress?.phone && order.shippingAddress.phone.includes(idVal)) ||
            (order.customerPhone && order.customerPhone.includes(idVal)) ||
            (order.shippingAddress?.fullName && order.shippingAddress.fullName.toLowerCase().includes(idVal)) ||
            (order.customerName && order.customerName.toLowerCase().includes(idVal));

        // Checkbox status filter (Đang xử lý, Hoàn thành, Không giao được, Đã hủy)
        const orderStatus = order.status || 'Đang xử lý';
        const matchesStatus = checkedStatuses.length === 0 ? false : checkedStatuses.includes(orderStatus);

        // Checkbox type filter (Không giao hàng / Giao hàng)
        const isDelivery = (order.shippingMethod && order.shippingMethod !== 'pickup') || order.deliveryStatus;
        const orderTypeCategory = isDelivery ? 'delivery' : 'pickup';
        const matchesType = checkedTypes.length === 0 ? false : checkedTypes.includes(orderTypeCategory);

        // Select dropdown filters
        const orderDeliveryStat = order.deliveryStatus || (isDelivery ? 'Chờ giao' : '');
        const matchesDeliveryStatus = deliveryStatusVal === 'all' || orderDeliveryStat === deliveryStatusVal;

        const orderCarrier = order.carrier || order.shippingCarrier || '';
        const matchesCarrier = carrierVal === 'all' || orderCarrier === carrierVal;

        const orderPayment = order.paymentMethod || 'Tiền mặt';
        const matchesPayment = paymentVal === 'all' || orderPayment === paymentVal || (paymentVal === 'COD' && orderPayment.toUpperCase().includes('COD'));

        const orderCreator = order.creatorName || order.sellerName || 'Nguyễn Tân Quốc Cường';
        const matchesCreator = creatorVal === 'all' || orderCreator === creatorVal;

        const orderSeller = order.sellerName || 'Nguyễn Tân Quốc Cường';
        const matchesSeller = sellerVal === 'all' || orderSeller === sellerVal;

        const orderPricelist = order.pricelist || 'Bảng giá chung';
        const matchesPricelist = pricelistVal === 'all' || orderPricelist === pricelistVal;

        const orderChannel = order.channel || (order.id.startsWith('POS') ? 'POS' : 'Website');
        const matchesChannel = channelVal === 'all' || orderChannel === channelVal;
        const matchesUserId = !currentOrderUserIdFilter || order.userId === currentOrderUserIdFilter;

        let matchesDate = true;
        const oDate = order.orderDate ? (order.orderDate.toDate ? order.orderDate.toDate() : new Date(order.orderDate)) : null;
        if (oDate) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (datePreset === 'today') {
                matchesDate = oDate >= today;
            } else if (datePreset === 'yesterday') {
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                matchesDate = oDate >= yesterday && oDate < today;
            } else if (datePreset === 'this_week') {
                const day = today.getDay() || 7;
                const monday = new Date(today); monday.setDate(monday.getDate() - day + 1);
                matchesDate = oDate >= monday;
            } else if (datePreset === 'last_week') {
                const day = today.getDay() || 7;
                const lastMonday = new Date(today); lastMonday.setDate(lastMonday.getDate() - day - 6);
                const thisMonday = new Date(today); thisMonday.setDate(thisMonday.getDate() - day + 1);
                matchesDate = oDate >= lastMonday && oDate < thisMonday;
            } else if (datePreset === 'last_7_days') {
                const d7 = new Date(today); d7.setDate(d7.getDate() - 7);
                matchesDate = oDate >= d7;
            } else if (datePreset === 'this_month') {
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                matchesDate = oDate >= firstDay;
            } else if (datePreset === 'last_month') {
                const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                matchesDate = oDate >= firstDayLastMonth && oDate <= lastDayLastMonth;
            } else if (datePreset === 'last_30_days') {
                const d30 = new Date(today); d30.setDate(d30.getDate() - 30);
                matchesDate = oDate >= d30;
            } else if (datePreset === 'this_quarter') {
                const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
                const firstDay = new Date(now.getFullYear(), quarterMonth, 1);
                matchesDate = oDate >= firstDay;
            } else if (datePreset === 'last_quarter') {
                const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
                const firstDayThisQ = new Date(now.getFullYear(), quarterMonth, 1);
                const firstDayLastQ = new Date(now.getFullYear(), quarterMonth - 3, 1);
                matchesDate = oDate >= firstDayLastQ && oDate < firstDayThisQ;
            } else if (datePreset === 'this_year') {
                const firstDay = new Date(now.getFullYear(), 0, 1);
                matchesDate = oDate >= firstDay;
            } else if (datePreset === 'last_year') {
                const firstDayLastYear = new Date(now.getFullYear() - 1, 0, 1);
                const lastDayLastYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
                matchesDate = oDate >= firstDayLastYear && oDate <= lastDayLastYear;
            } else if (datePreset === 'custom') {
                if (dateFrom) {
                    const from = new Date(dateFrom);
                    matchesDate = matchesDate && (oDate >= from);
                }
                if (dateTo) {
                    const to = new Date(dateTo);
                    to.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && (oDate <= to);
                }
            }
        }

        return matchesId && matchesStatus && matchesType && matchesDeliveryStatus && matchesCarrier && matchesPayment && matchesCreator && matchesSeller && matchesPricelist && matchesChannel && matchesUserId && matchesDate;
    });

    // Cập nhật dòng tổng cộng chuẩn KiotViet
    const sumSubtotal = filtered.reduce((acc, cur) => {
        const items = cur.items || [];
        const sub = items.length > 0 ? items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0) : (cur.totalAmount || 0);
        return acc + sub;
    }, 0);

    const sumDiscount = filtered.reduce((acc, cur) => acc + (cur.discountAmount || cur.discountVal || 0), 0);

    const sumPaid = filtered.reduce((acc, cur) => {
        const items = cur.items || [];
        const sub = items.length > 0 ? items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0) : (cur.totalAmount || 0);
        const ship = cur.shippingFee || 0;
        const disc = cur.discountAmount || cur.discountVal || 0;
        const mem = cur.membershipDiscount || 0;
        const finalT = cur.totalAmount || Math.max(0, sub + ship - disc - mem);
        const paid = cur.cashGiven ? Math.max(finalT, cur.cashGiven) : finalT;
        return acc + paid;
    }, 0);

    const summarySubtotalElem = document.getElementById('summary-subtotal');
    const summaryDiscountElem = document.getElementById('summary-discount');
    const summaryPaidElem = document.getElementById('summary-paid');
    const totalAmountSpan = document.getElementById('order-filtered-total-amount');

    if (summarySubtotalElem) summarySubtotalElem.innerText = formatVND(sumSubtotal);
    if (summaryDiscountElem) summaryDiscountElem.innerText = sumDiscount > 0 ? formatVND(sumDiscount) : '0';
    if (summaryPaidElem) summaryPaidElem.innerText = formatVND(sumPaid);
    if (totalAmountSpan) totalAmountSpan.innerText = formatVND(sumPaid) + ' đ';

    // Sắp xếp theo ngày đặt giảm dần
    filtered.sort((a, b) => {
        const dateA = a.orderDate ? (a.orderDate.toDate ? a.orderDate.toDate() : new Date(a.orderDate)) : new Date(0);
        const dateB = b.orderDate ? (b.orderDate.toDate ? b.orderDate.toDate() : new Date(b.orderDate)) : new Date(0);
        return dateB - dateA;
    });

    // Phân trang
    const pageSize = window.currentOrderPageSize || 15;
    window.currentOrderTotalPages = Math.ceil(filtered.length / pageSize) || 1;
    const totalPages = window.currentOrderTotalPages;
    if (window.currentOrderPage > totalPages) {
        window.currentOrderPage = totalPages;
    }

    const startIndex = (window.currentOrderPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const pageOrders = filtered.slice(startIndex, startIndex + pageSize);

    // Hiển thị các dòng đơn hàng
    renderOrderRows(pageOrders, orderListTable);

    // Cập nhật các nút phân trang
    if (pageInfo) pageInfo.innerText = window.currentOrderPage;
    if (countInfo) countInfo.innerText = filtered.length > 0 ? `${startIndex + 1} - ${endIndex} trong ${filtered.length} hóa đơn` : '0 - 0 trong 0 hóa đơn';
    if (prevBtn) prevBtn.disabled = window.currentOrderPage === 1;
    if (firstBtn) firstBtn.disabled = window.currentOrderPage === 1;
    if (nextBtn) nextBtn.disabled = window.currentOrderPage === totalPages;
    if (lastBtn) lastBtn.disabled = window.currentOrderPage === totalPages;
}

function renderOrderRows(ordersList, tableElement) {
    let htmlContent = '';
    ordersList.forEach((order) => {
        const orderId = order.id;
        const orderDate = order.orderDate
            ? (order.orderDate.toDate ? new Date(order.orderDate.toDate()) : new Date(order.orderDate)).toLocaleString('vi-VN')
            : 'N/A';
        
        const items = order.items || [];
        const subtotal = items.length > 0 ? items.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0) : (order.totalAmount || 0);
        const discount = order.discountVal || 0;
        const finalTotal = order.totalAmount || Math.max(0, subtotal - discount);
        const paidAmount = order.cashGiven ? Math.max(finalTotal, order.cashGiven) : finalTotal;
        
        const custName = order.shippingAddress?.fullName || order.customerName || 'Khách mua tại shop';
        const custPhone = order.shippingAddress?.phone || order.customerPhone || '';
        const custCode = order.userId || order.customerId || 'Khách vãng lai';
        const status = order.status || 'Đang xử lý';

        let tagClass = 'warning';
        if (status === 'Đã hoàn thành') tagClass = 'success';
        else if (status === 'Đã hủy') tagClass = 'danger';

        htmlContent += `
            <tr class="product-row order-row" data-order-id="${orderId}" onclick="window.toggleOrderQuickView('${orderId}', event)" style="cursor: pointer;">
                <td style="text-align: center; padding: 4px;" onclick="event.stopPropagation();"><input type="checkbox" class="order-chk" value="${orderId}"></td>
                <td style="color: #cbd5e1; padding: 4px;" onclick="event.stopPropagation();">☆</td>
                <td style="white-space: nowrap;"><strong style="color: #0066cc; font-size: 0.74rem; display: inline-block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;" title="${orderId}">${orderId}</strong></td>
                <td style="color: #475569; font-size: 0.71rem; white-space: nowrap;">${orderDate}</td>
                <td style="color: #64748b; font-size: 0.71rem; white-space: nowrap;"><span style="max-width: 100px; display: inline-block; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;" title="${custCode}">${custCode}</span></td>
                <td>
                    <strong style="color: #0f172a; font-size: 0.74rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px;" title="${custName}">${custName}</strong>
                    ${custPhone ? `<small style="color: #64748b; font-size: 0.70rem; display: block;">${custPhone}</small>` : ''}
                </td>
                <td style="text-align: right; font-weight: 600; font-size: 0.74rem; white-space: nowrap;">${formatVND(subtotal)}</td>
                <td style="text-align: right; color: #64748b; font-size: 0.74rem; white-space: nowrap;">${discount > 0 ? formatVND(discount) : '0'}</td>
                <td style="text-align: right; font-weight: 700; color: #0f172a; font-size: 0.74rem; white-space: nowrap;">${formatVND(paidAmount)}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <span class="qv-tag ${tagClass}" style="padding: 2px 5px; font-weight: 600; border-radius: 4px; font-size: 0.68rem;">${status}</span>
                </td>
            </tr>
        `;
    });
    tableElement.innerHTML = htmlContent || '<tr><td colspan="10" style="text-align:center; padding: 2rem; color: #94a3b8;">Chưa có hóa đơn nào.</td></tr>';
}

window.toggleOrderQuickView = function (orderId, event) {
    if (event) event.stopPropagation();

    const existingDetail = document.getElementById(`order-detail-row-${orderId}`);
    const targetRow = document.querySelector(`tr[data-order-id="${orderId}"]`);

    if (existingDetail) {
        existingDetail.remove();
        if (targetRow) targetRow.classList.remove('expanded');
        return;
    }

    // Remove any currently open order detail rows
    document.querySelectorAll('.kiot-detail-row').forEach(row => row.remove());
    document.querySelectorAll('.order-row').forEach(row => row.classList.remove('expanded'));

    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order || !targetRow) return;

    targetRow.classList.add('expanded');

    const orderDate = order.orderDate
        ? (order.orderDate.toDate ? new Date(order.orderDate.toDate()) : new Date(order.orderDate)).toLocaleString('vi-VN')
        : 'N/A';

    const items = order.items || [];
    const subtotal = items.length > 0 ? items.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0) : (order.totalAmount || 0);
    const shippingFee = order.shippingFee || 0;
    const discountVal = order.discountAmount || order.discountVal || 0;
    const couponCode = order.couponCode || order.voucherCode || '';
    const memberDiscount = order.membershipDiscount || 0;

    const finalTotal = order.totalAmount || Math.max(0, subtotal + shippingFee - discountVal - memberDiscount);
    const cashPaid = order.cashGiven ? Math.max(finalTotal, order.cashGiven) : finalTotal;
    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

    const custName = order.shippingAddress?.fullName || order.customerName || 'Khách mua tại shop';
    const custPhone = order.shippingAddress?.phone || order.customerPhone || 'Chưa có SĐT';
    const custAddress = order.shippingAddress?.address || 'Bán trực tiếp tại cửa hàng';
    const custCode = order.userId || order.customerId || 'Khách vãng lai';
    const channelName = order.channel || (order.id.startsWith('POS') ? 'Bán trực tiếp (POS)' : 'Website');
    const sellerName = order.sellerName || 'Nguyễn Tân Quốc Cường';
    const status = order.status || 'Đang xử lý';

    let tagClass = 'warning';
    if (status === 'Đã hoàn thành') tagClass = 'success';
    else if (status === 'Đã hủy') tagClass = 'danger';

    const detailRow = document.createElement('tr');
    detailRow.id = `order-detail-row-${orderId}`;
    detailRow.className = 'kiot-detail-row';
    detailRow.innerHTML = `
        <td colspan="10" style="padding: 0; background: #ffffff;">
            <div class="kiot-quickview-card" style="border: 2px solid #0066cc; margin: 8px 0; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 102, 204, 0.12);">
                <!-- Tabs Header -->
                <div class="quickview-tabs">
                    <button type="button" class="qv-tab-item active" onclick="window.switchOrderQuickViewTab('${orderId}', 'info', this)">Thông tin</button>
                    <button type="button" class="qv-tab-item" onclick="window.switchOrderQuickViewTab('${orderId}', 'history', this)">Lịch sử thanh toán</button>
                </div>

                <div class="quickview-body order-qv-info-body" style="flex-direction: column; gap: 14px; padding: 16px 20px;">
                    <!-- Order Header Info Row -->
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <strong style="font-size: 1.05rem; color: #0066cc;">${custCode} - ${custName}</strong>
                            <span style="font-size: 0.85rem; color: #64748b;">📝 ${orderId}</span>
                            <span class="qv-tag ${tagClass}" style="font-weight: 600; padding: 3px 8px;">${status}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #64748b;">Chi nhánh trung tâm</div>
                    </div>

                    <!-- Metadata Grid -->
                    <div class="quickview-fields-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; width: 100%; font-size: 0.85rem; color: #334155;">
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Người tạo:</span> <strong>${sellerName}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Người bán:</span> <span style="font-weight: 600; color: #0f172a;">${sellerName}</span></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Ngày bán:</span> <strong>${orderDate}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Kênh bán:</span> <span style="font-weight: 600; color: #0f172a;">${channelName}</span></div>
                        
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Phí giao hàng:</span> <strong style="color: #0284c7;">${shippingFee > 0 ? formatVND(shippingFee) + ' đ' : '0 đ (Miễn phí)'}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Mã giảm giá:</span> <strong style="color: #dc2626;">${couponCode ? `${couponCode} (-${formatVND(discountVal)} đ)` : (discountVal > 0 ? `-${formatVND(discountVal)} đ` : 'Không có')}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Giảm giá TV:</span> <strong style="color: #16a34a;">${memberDiscount > 0 ? `-${formatVND(memberDiscount)} đ` : '0 đ'}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Giao đến:</span> <span>${custAddress} (${custPhone})</span></div>
                    </div>

                    <!-- Items List Table -->
                    <div style="width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 4px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.83rem;">
                            <thead>
                                <tr style="background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0;">
                                    <th style="padding: 8px 10px; text-align: left;">Mã hàng</th>
                                    <th style="padding: 8px 10px; text-align: left;">Tên hàng</th>
                                    <th style="padding: 8px 10px; text-align: center;">Số lượng</th>
                                    <th style="padding: 8px 10px; text-align: right;">Đơn giá</th>
                                    <th style="padding: 8px 10px; text-align: right;">Giảm giá</th>
                                    <th style="padding: 8px 10px; text-align: right;">Giá bán</th>
                                    <th style="padding: 8px 10px; text-align: right;">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => {
                                    const itemPrice = item.price || 0;
                                    const itemDiscount = item.discount || 0;
                                    const itemSellingPrice = itemPrice - itemDiscount;
                                    const itemLineTotal = itemSellingPrice * (item.quantity || 1);

                                    return `
                                    <tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 8px 10px; color: #0066cc; font-weight: 600;">${item.id || 'SP'}</td>
                                        <td style="padding: 8px 10px; font-weight: 500;">
                                            <strong style="color: #0f172a; display: block; font-size: 0.84rem;">${item.name || 'Sản phẩm gốm'}</strong>
                                            <div style="display: flex; gap: 6px; font-size: 0.74rem; color: #475569; margin-top: 3px; flex-wrap: wrap;">
                                                ${item.color ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">🎨 Màu: <strong style="color: #334155;">${item.color}</strong></span>` : ''}
                                                ${(item.pattern || item.texture || item.patternName) ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">✨ Họa tiết: <strong style="color: #334155;">${item.pattern || item.texture || item.patternName}</strong></span>` : ''}
                                                ${(item.combo || item.comboName || item.isCombo) ? `<span style="background: #e0f2fe; color: #0066cc; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #bae6fd;">🎁 Combo: ${item.combo || item.comboName || 'Bộ gốm sứ'}</span>` : ''}
                                            </div>
                                        </td>
                                        <td style="padding: 8px 10px; text-align: center; font-weight: 600;">${item.quantity || 1}</td>
                                        <td style="padding: 8px 10px; text-align: right;">${formatVND(itemPrice)}</td>
                                        <td style="padding: 8px 10px; text-align: right; color: #64748b;">${itemDiscount > 0 ? formatVND(itemDiscount) : '0'}</td>
                                        <td style="padding: 8px 10px; text-align: right; font-weight: 600;">${formatVND(itemSellingPrice)}</td>
                                        <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a;">${formatVND(itemLineTotal)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Bottom Note & Totals Summary Row -->
                    <div style="display: grid; grid-template-columns: 1fr 340px; gap: 20px; width: 100%; align-items: flex-start; margin-top: 4px;">
                        <div>
                            <textarea placeholder="Ghi chú đơn hàng..." style="width: 100%; height: 95px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font-size: 0.85rem; font-family: inherit; outline: none; resize: vertical;" onchange="window.updateOrderNote('${orderId}', this.value)">${order.note || ''}</textarea>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.88rem; color: #334155; background: #f8fafc; padding: 12px 14px; border-radius: 6px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Tổng tiền hàng (${totalQty}):</span>
                                <strong style="color: #0f172a;">${formatVND(subtotal)}</strong>
                            </div>

                            <div style="display: flex; justify-content: space-between;">
                                <span>Phí vận chuyển (Ship):</span>
                                <strong style="color: #0284c7;">+${formatVND(shippingFee)}</strong>
                            </div>

                            ${discountVal > 0 ? `
                            <div style="display: flex; justify-content: space-between;">
                                <span>Mã giảm giá ${couponCode ? `(${couponCode})` : ''}:</span>
                                <strong style="color: #dc2626;">-${formatVND(discountVal)}</strong>
                            </div>` : ''}

                            ${memberDiscount > 0 ? `
                            <div style="display: flex; justify-content: space-between;">
                                <span>Giảm giá thành viên:</span>
                                <strong style="color: #16a34a;">-${formatVND(memberDiscount)}</strong>
                            </div>` : ''}

                            <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 2px;">
                                <strong style="color: #0f172a;">Khách cần trả:</strong>
                                <strong style="color: #0066cc; font-size: 1.1rem;">${formatVND(finalTotal)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <strong style="color: #0f172a;">Khách đã trả:</strong>
                                <strong style="color: #0f172a; font-size: 1.1rem;">${formatVND(cashPaid)}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="quickview-body order-qv-history-body" style="display: none; padding: 16px 20px;">
                    <div style="font-size: 0.88rem; color: #475569; width: 100%;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8fafc; text-align: left; border-bottom: 1px solid #e2e8f0;">
                                    <th style="padding: 8px;">Mã GD</th>
                                    <th style="padding: 8px;">Thời gian</th>
                                    <th style="padding: 8px;">Phương thức</th>
                                    <th style="padding: 8px; text-align: right;">Tiền thanh toán</th>
                                    <th style="padding: 8px; text-align: center;">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding: 8px; color: #0066cc; font-weight: 600;">TT_${orderId.slice(-6)}</td>
                                    <td style="padding: 8px;">${orderDate}</td>
                                    <td style="padding: 8px;">${order.paymentMethod || 'Tiền mặt'}</td>
                                    <td style="padding: 8px; text-align: right; font-weight: 700;">${formatVND(cashPaid)}</td>
                                    <td style="padding: 8px; text-align: center;"><span class="qv-tag success">Thành công</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Footer Actions Row -->
                <div class="quickview-footer" style="padding: 12px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <div class="left-actions" style="display: flex; gap: 10px;">
                        <button type="button" class="qv-btn-text" style="color: #0066cc; font-weight: 600;" onclick="event.stopPropagation(); window.openEditOrderModal('${orderId}')">✏️ Chỉnh sửa</button>
                        <button type="button" class="qv-btn-text red" onclick="event.stopPropagation(); window.deleteAdminOrder('${orderId}')">🗑️ Hủy đơn</button>
                        <button type="button" class="qv-btn-text" onclick="event.stopPropagation(); window.printOrderBill('${orderId}')">📋 Sao chép</button>
                        <button type="button" class="qv-btn-text" onclick="event.stopPropagation(); window.printOrderBill('${orderId}')">📥 Xuất file</button>
                    </div>
                    <div class="right-actions" style="display: flex; align-items: center; gap: 10px;">
                        <select class="status-select" style="padding: 6px 12px; border: 1px solid #0066cc; color: #0066cc; border-radius: 6px; font-weight: 600; background: #fff; cursor: pointer;" onchange="event.stopPropagation(); window.updateOrderStatus('${orderId}', this.value, this)">
                            <option value="Đang xử lý" ${status === 'Đang xử lý' ? 'selected' : ''}>Đang xử lý</option>
                            <option value="Chờ thanh toán" ${status === 'Chờ thanh toán' ? 'selected' : ''}>Chờ thanh toán</option>
                            <option value="Đã thanh toán" ${status === 'Đã thanh toán' ? 'selected' : ''}>Đã thanh toán</option>
                            <option value="Đang giao hàng" ${status === 'Đang giao hàng' ? 'selected' : ''}>Đang giao hàng</option>
                            <option value="Đã hoàn thành" ${status === 'Đã hoàn thành' ? 'selected' : ''}>Đã hoàn thành</option>
                            <option value="Đã hủy" ${status === 'Đã hủy' ? 'selected' : ''}>Đã hủy</option>
                        </select>
                        <button type="button" class="kiot-btn-primary" onclick="event.stopPropagation(); window.printOrderBill('${orderId}')">🖨️ In bill</button>
                    </div>
                </div>
            </div>
        </td>
    `;

    targetRow.parentNode.insertBefore(detailRow, targetRow.nextSibling);
};

window.currentEditOrderItems = [];

window.openEditOrderModal = function (orderId) {
    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order) {
        showToast("Không tìm thấy thông tin đơn hàng", "error");
        return;
    }

    const modalTitle = document.getElementById('edit-order-modal-title');
    if (modalTitle) modalTitle.innerText = `✏️ Chỉnh sửa đơn hàng ${orderId}`;

    const hiddenId = document.getElementById('edit-order-id-hidden');
    if (hiddenId) hiddenId.value = orderId;

    const nameInput = document.getElementById('edit-order-cust-name');
    if (nameInput) nameInput.value = order.shippingAddress?.fullName || order.customerName || '';

    const phoneInput = document.getElementById('edit-order-cust-phone');
    if (phoneInput) phoneInput.value = order.shippingAddress?.phone || order.customerPhone || '';

    const addrInput = document.getElementById('edit-order-cust-address');
    if (addrInput) addrInput.value = order.shippingAddress?.address || '';

    const statusSel = document.getElementById('edit-order-status');
    if (statusSel) statusSel.value = order.status || 'Đang xử lý';

    const paySel = document.getElementById('edit-order-payment');
    if (paySel) paySel.value = order.paymentMethod || 'Tiền mặt';

    const chanSel = document.getElementById('edit-order-channel');
    if (chanSel) chanSel.value = order.channel || (order.id.startsWith('POS') ? 'POS' : 'Website');

    const shipInput = document.getElementById('edit-order-shipping-fee');
    if (shipInput) shipInput.value = order.shippingFee || 0;

    const discInput = document.getElementById('edit-order-discount');
    if (discInput) discInput.value = order.discountAmount || order.discountVal || 0;

    const couponInput = document.getElementById('edit-order-coupon');
    if (couponInput) couponInput.value = order.couponCode || order.voucherCode || '';

    const noteInput = document.getElementById('edit-order-note');
    if (noteInput) noteInput.value = order.note || '';

    // Clone items array for editing
    window.currentEditOrderItems = JSON.parse(JSON.stringify(order.items || []));
    window.renderEditOrderItemsTable();

    const modal = document.getElementById('edit-order-modal');
    if (modal) modal.style.display = 'block';
};

window.renderEditOrderItemsTable = function () {
    const tbody = document.getElementById('edit-order-items-tbody');
    if (!tbody) return;

    if (!window.currentEditOrderItems || window.currentEditOrderItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 16px; color: #94a3b8;">Đơn hàng chưa có sản phẩm nào. Bấm nút "+ Thêm món mới" bên trên.</td></tr>`;
        window.recalculateEditOrderTotal();
        return;
    }

    let html = '';
    window.currentEditOrderItems.forEach((item, index) => {
        const qty = item.quantity || 1;
        const price = item.price || 0;
        const total = price * qty;
        const color = item.color || '';
        const pattern = item.pattern || item.texture || item.patternName || '';
        const combo = item.combo || item.comboName || '';

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 10px;">
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
                        <strong style="color: #0066cc; font-size: 0.8rem; white-space: nowrap;">${item.id || 'SP' + (index+1)}</strong>
                        <input type="text" value="${item.name || ''}" placeholder="Tên sản phẩm..." style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 6px; font-size: 0.82rem; font-weight: 600; outline: none;" onchange="window.changeEditItemField(${index}, 'name', this.value)">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 4px;">
                        <input type="text" value="${color}" placeholder="🎨 Màu sắc..." style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 0.76rem; outline: none;" onchange="window.changeEditItemField(${index}, 'color', this.value)">
                        <input type="text" value="${pattern}" placeholder="✨ Họa tiết..." style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 0.76rem; outline: none;" onchange="window.changeEditItemField(${index}, 'pattern', this.value)">
                        <input type="text" value="${combo}" placeholder="🎁 Combo / Bộ..." style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 0.76rem; outline: none;" onchange="window.changeEditItemField(${index}, 'combo', this.value)">
                    </div>
                </td>
                <td style="padding: 8px 10px; text-align: center; vertical-align: top;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 4px;">
                        <button type="button" style="width: 24px; height: 24px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: bold; cursor: pointer;" onclick="window.updateEditItemQty(${index}, -1)">-</button>
                        <input type="number" min="1" value="${qty}" style="width: 45px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px; font-size: 0.82rem;" onchange="window.changeEditItemQty(${index}, this.value)">
                        <button type="button" style="width: 24px; height: 24px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: bold; cursor: pointer;" onclick="window.updateEditItemQty(${index}, 1)">+</button>
                    </div>
                </td>
                <td style="padding: 8px 10px; text-align: right; vertical-align: top;">
                    <input type="number" value="${price}" style="width: 95px; text-align: right; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 0.82rem; margin-top: 4px;" onchange="window.changeEditItemPrice(${index}, this.value)">
                </td>
                <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a; vertical-align: top; padding-top: 12px;">
                    ${formatVND(total)}
                </td>
                <td style="padding: 8px 10px; text-align: center; vertical-align: top; padding-top: 10px;">
                    <button type="button" style="border: none; background: none; color: #dc2626; cursor: pointer; font-size: 0.9rem;" onclick="window.removeEditItem(${index})">🗑️</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    window.recalculateEditOrderTotal();
};

window.changeEditItemField = function (index, field, val) {
    if (!window.currentEditOrderItems[index]) return;
    window.currentEditOrderItems[index][field] = val.trim();
};

window.updateEditItemQty = function (index, delta) {
    if (!window.currentEditOrderItems[index]) return;
    let currentQty = window.currentEditOrderItems[index].quantity || 1;
    currentQty += delta;
    if (currentQty < 1) currentQty = 1;
    window.currentEditOrderItems[index].quantity = currentQty;
    window.renderEditOrderItemsTable();
};

window.changeEditItemQty = function (index, val) {
    if (!window.currentEditOrderItems[index]) return;
    let num = parseInt(val) || 1;
    if (num < 1) num = 1;
    window.currentEditOrderItems[index].quantity = num;
    window.renderEditOrderItemsTable();
};

window.changeEditItemPrice = function (index, val) {
    if (!window.currentEditOrderItems[index]) return;
    let price = parseFloat(val) || 0;
    if (price < 0) price = 0;
    window.currentEditOrderItems[index].price = price;
    window.renderEditOrderItemsTable();
};

window.removeEditItem = function (index) {
    if (!window.currentEditOrderItems[index]) return;
    window.currentEditOrderItems.splice(index, 1);
    window.renderEditOrderItemsTable();
};

window.addEditOrderItemPrompt = function () {
    const prodName = prompt("Nhập tên sản phẩm mới:");
    if (!prodName) return;
    const colorStr = prompt("Nhập màu sắc (ví dụ: Men hỏa biến, Trắng ngà...):", "") || "";
    const patternStr = prompt("Nhập họa tiết (ví dụ: Hoa sen chìm, Vẽ tay...):", "") || "";
    const comboStr = prompt("Nhập Combo / Bộ (ví dụ: Bộ 6 chén + 1 tô...):", "") || "";
    const priceStr = prompt("Nhập đơn giá sản phẩm (VNĐ):", "100000");
    const price = parseFloat(priceStr) || 0;
    const qtyStr = prompt("Nhập số lượng:", "1");
    const qty = parseInt(qtyStr) || 1;

    const newItem = {
        id: "SP" + Math.floor(100000 + Math.random() * 900000),
        name: prodName,
        color: colorStr,
        pattern: patternStr,
        combo: comboStr,
        price: price,
        quantity: qty
    };

    window.currentEditOrderItems.push(newItem);
    window.renderEditOrderItemsTable();
};

window.recalculateEditOrderTotal = function () {
    const items = window.currentEditOrderItems || [];
    const subtotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    const shippingFee = parseFloat(document.getElementById('edit-order-shipping-fee')?.value || 0) || 0;
    const discountAmount = parseFloat(document.getElementById('edit-order-discount')?.value || 0) || 0;

    const finalTotal = Math.max(0, subtotal + shippingFee - discountAmount);

    const subtotalElem = document.getElementById('edit-order-calc-subtotal');
    const totalElem = document.getElementById('edit-order-calc-total');

    if (subtotalElem) subtotalElem.innerText = formatVND(subtotal) + ' đ';
    if (totalElem) totalElem.innerText = formatVND(finalTotal) + ' đ';
};

window.closeEditOrderModal = function () {
    const modal = document.getElementById('edit-order-modal');
    if (modal) modal.style.display = 'none';
};

window.saveEditedOrder = async function () {
    const orderId = document.getElementById('edit-order-id-hidden')?.value;
    if (!orderId) return;

    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order) return;

    const custName = document.getElementById('edit-order-cust-name')?.value.trim() || order.customerName;
    const custPhone = document.getElementById('edit-order-cust-phone')?.value.trim() || order.customerPhone;
    const custAddress = document.getElementById('edit-order-cust-address')?.value.trim() || '';
    const status = document.getElementById('edit-order-status')?.value || order.status;
    const paymentMethod = document.getElementById('edit-order-payment')?.value || order.paymentMethod;
    const channel = document.getElementById('edit-order-channel')?.value || order.channel;
    const shippingFee = parseFloat(document.getElementById('edit-order-shipping-fee')?.value || 0) || 0;
    const discountAmount = parseFloat(document.getElementById('edit-order-discount')?.value || 0) || 0;
    const couponCode = document.getElementById('edit-order-coupon')?.value.trim() || '';
    const note = document.getElementById('edit-order-note')?.value.trim() || '';

    // Calculate subtotal and total from updated items
    const items = window.currentEditOrderItems || [];
    const subtotal = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
    const memberDiscount = order.membershipDiscount || 0;
    const newTotalAmount = Math.max(0, subtotal + shippingFee - discountAmount - memberDiscount);

    try {
        const orderRef = doc(db, 'orders', orderId);
        const updatePayload = {
            customerName: custName,
            customerPhone: custPhone,
            'shippingAddress.fullName': custName,
            'shippingAddress.phone': custPhone,
            'shippingAddress.address': custAddress,
            status: status,
            paymentMethod: paymentMethod,
            channel: channel,
            shippingFee: shippingFee,
            discountAmount: discountAmount,
            discountVal: discountAmount,
            couponCode: couponCode,
            note: note,
            items: items,
            totalAmount: newTotalAmount
        };

        await updateDoc(orderRef, updatePayload);

        // Update local object
        order.customerName = custName;
        order.customerPhone = custPhone;
        if (!order.shippingAddress) order.shippingAddress = {};
        order.shippingAddress.fullName = custName;
        order.shippingAddress.phone = custPhone;
        order.shippingAddress.address = custAddress;
        order.status = status;
        order.paymentMethod = paymentMethod;
        order.channel = channel;
        order.shippingFee = shippingFee;
        order.discountAmount = discountAmount;
        order.discountVal = discountAmount;
        order.couponCode = couponCode;
        order.note = note;
        order.items = items;
        order.totalAmount = newTotalAmount;

        showToast(`Đã cập nhật đơn hàng ${orderId} thành công!`, "success");
        window.closeEditOrderModal();
        renderOrdersFiltered();
    } catch (err) {
        console.error("Lỗi cập nhật đơn hàng:", err);
        showToast("Không thể cập nhật đơn hàng: " + err.message, "error");
    }
};

window.switchOrderQuickViewTab = function (orderId, tab, btn) {
    const card = btn.closest('.kiot-quickview-card');
    if (!card) return;
    card.querySelectorAll('.qv-tab-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const infoBody = card.querySelector('.order-qv-info-body');
    const historyBody = card.querySelector('.order-qv-history-body');

    if (tab === 'history') {
        if (infoBody) infoBody.style.display = 'none';
        if (historyBody) historyBody.style.display = 'block';
    } else {
        if (infoBody) infoBody.style.display = 'flex';
        if (historyBody) historyBody.style.display = 'none';
    }
};

window.updateOrderNote = async function (orderId, noteVal) {
    const order = allOrdersCache.find(o => o.id === orderId);
    if (order) {
        order.note = noteVal;
        try {
            if (typeof doc !== 'undefined' && typeof setDoc !== 'undefined' && db) {
                const orderRef = doc(db, "orders", orderId);
                await setDoc(orderRef, { note: noteVal }, { merge: true });
            }
            if (typeof showToast !== 'undefined') showToast("Đã cập nhật ghi chú đơn hàng");
        } catch (e) {
            console.error("Error updating order note:", e);
        }
    }
};

let currentRentalOrderPage = 1;
const RENTAL_ORDER_PAGE_SIZE = 10;

window.toggleCustomDateFilterRental = function (val) {
    const customGroup = document.getElementById('rental-order-custom-date-group');
    if (customGroup) {
        customGroup.style.display = val === 'custom' ? 'flex' : 'none';
    }
    if (val !== 'custom') {
        currentRentalOrderPage = 1;
        renderRentalOrdersFiltered();
    }
};

window.selectedRentalDatePreset = 'all';
window.currentRentalOrderPage = 1;
window.currentRentalOrderPageSize = 15;

window.toggleRentalTimePresetPopover = function (event) {
    if (event) event.stopPropagation();
    const presetPop = document.getElementById('rental-time-preset-popover');
    const customPop = document.getElementById('rental-custom-date-popover');
    const btn = document.getElementById('btn-radio-rental-time-preset');

    if (customPop) customPop.classList.remove('show');

    if (presetPop) {
        const willShow = !presetPop.classList.contains('show');
        if (willShow && btn) {
            const rect = btn.getBoundingClientRect();
            presetPop.style.top = Math.max(10, rect.top) + 'px';
            presetPop.style.left = (rect.right + 4) + 'px';
        }
        presetPop.classList.toggle('show');
    }
};

window.toggleRentalCustomDatePopover = function (event) {
    if (event) event.stopPropagation();
    const presetPop = document.getElementById('rental-time-preset-popover');
    const customPop = document.getElementById('rental-custom-date-popover');
    const btn = document.getElementById('btn-radio-rental-time-custom');

    if (presetPop) presetPop.classList.remove('show');

    if (customPop) {
        const willShow = !customPop.classList.contains('show');
        if (willShow && btn) {
            const rect = btn.getBoundingClientRect();
            customPop.style.top = Math.max(10, rect.top) + 'px';
            customPop.style.left = (rect.right + 4) + 'px';
        }
        customPop.classList.toggle('show');
    }
};

window.selectRentalTimePreset = function (presetKey, presetName, btnElem) {
    window.selectedRentalDatePreset = presetKey;
    const label = document.getElementById('rental-order-time-preset-label');
    if (label) label.innerText = '🔵 ' + presetName;

    const btnPreset = document.getElementById('btn-radio-rental-time-preset');
    const btnCustom = document.getElementById('btn-radio-rental-time-custom');
    if (btnPreset) btnPreset.classList.add('active');
    if (btnCustom) btnCustom.classList.remove('active');

    const presetPop = document.getElementById('rental-time-preset-popover');
    if (presetPop) {
        presetPop.querySelectorAll('.popover-pill').forEach(p => p.classList.remove('active'));
        if (btnElem) btnElem.classList.add('active');
        presetPop.classList.remove('show');
    }

    window.currentRentalOrderPage = 1;
    window.renderRentalOrdersFiltered();
};

window.closeRentalCustomDatePopover = function () {
    const customPop = document.getElementById('rental-custom-date-popover');
    if (customPop) customPop.classList.remove('show');
};

window.setRentalTodayDateRange = function () {
    const todayStr = new Date().toISOString().split('T')[0];
    const fromInput = document.getElementById('rental-order-date-from');
    const toInput = document.getElementById('rental-order-date-to');
    if (fromInput) fromInput.value = todayStr;
    if (toInput) toInput.value = todayStr;
};

window.applyRentalCustomDateRange = function () {
    window.selectedRentalDatePreset = 'custom';
    const label = document.getElementById('rental-order-time-custom-label');
    const fromInput = document.getElementById('rental-order-date-from')?.value;
    const toInput = document.getElementById('rental-order-date-to')?.value;

    if (label && fromInput && toInput) {
        label.innerText = `🔵 Tùy chỉnh (${fromInput} - ${toInput})`;
    }

    const btnPreset = document.getElementById('btn-radio-rental-time-preset');
    const btnCustom = document.getElementById('btn-radio-rental-time-custom');
    if (btnCustom) btnCustom.classList.add('active');
    if (btnPreset) btnPreset.classList.remove('active');

    window.closeRentalCustomDatePopover();
    window.currentRentalOrderPage = 1;
    window.renderRentalOrdersFiltered();
};

window.resetRentalOrderFilters = function () {
    const search = document.getElementById('rental-order-search-input');
    if (search) search.value = '';

    document.querySelectorAll('.filter-rental-status-chk').forEach(chk => {
        chk.checked = true;
    });

    ['rental-filter-event-type', 'rental-filter-payment'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });

    window.selectRentalTimePreset('all', 'Tất cả thời gian', null);
};

window.changeRentalOrderPageSize = function (size) {
    window.currentRentalOrderPageSize = parseInt(size) || 15;
    window.currentRentalOrderPage = 1;
    window.renderRentalOrdersFiltered();
};

window.goRentalOrderPage = function (page) {
    const totalPages = window.currentRentalTotalPages || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    window.currentRentalOrderPage = page;
    window.renderRentalOrdersFiltered();
};

window.renderRentalOrdersFiltered = function () {
    const orderListTable = document.getElementById('admin-rental-order-list');
    const prevBtn = document.getElementById('prev-rental-order-page');
    const nextBtn = document.getElementById('next-rental-order-page');
    const firstBtn = document.getElementById('first-rental-page');
    const lastBtn = document.getElementById('last-rental-page');
    const pageInfo = document.getElementById('rental-order-page-info');
    const countInfo = document.getElementById('rental-pagination-count');

    if (!orderListTable) return;

    // Lấy các giá trị bộ lọc
    const idVal = document.getElementById('rental-order-search-input')?.value.trim().toLowerCase() || '';
    const checkedStatuses = Array.from(document.querySelectorAll('.filter-rental-status-chk:checked')).map(c => c.value);
    const eventTypeVal = document.getElementById('rental-filter-event-type')?.value || 'all';
    const paymentVal = document.getElementById('rental-filter-payment')?.value || 'all';

    const datePreset = window.selectedRentalDatePreset || 'all';
    const dateFrom = document.getElementById('rental-order-date-from')?.value;
    const dateTo = document.getElementById('rental-order-date-to')?.value;

    let filtered = allOrdersCache.filter(order => {
        if (order.orderType !== 'rental') return false;

        const matchesId = !idVal || order.id.toLowerCase().includes(idVal) ||
            (order.rentalInfo?.companyName && order.rentalInfo.companyName.toLowerCase().includes(idVal)) ||
            (order.rentalInfo?.phone && order.rentalInfo.phone.includes(idVal)) ||
            (order.customerName && order.customerName.toLowerCase().includes(idVal));

        const orderStatus = order.status || 'Yêu cầu mới';
        const matchesStatus = checkedStatuses.length === 0 ? false : checkedStatuses.includes(orderStatus);

        const orderEvent = order.rentalInfo?.eventName || order.rentalInfo?.eventType || '';
        const matchesEvent = eventTypeVal === 'all' || orderEvent.includes(eventTypeVal);

        const orderPayment = order.paymentMethod || 'Tiền mặt';
        const matchesPayment = paymentVal === 'all' || orderPayment === paymentVal;

        let matchesDate = true;
        const oDate = order.orderDate ? (order.orderDate.toDate ? order.orderDate.toDate() : new Date(order.orderDate)) : null;
        if (oDate && datePreset !== 'all') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (datePreset === 'today') {
                matchesDate = oDate >= today;
            } else if (datePreset === 'yesterday') {
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                matchesDate = oDate >= yesterday && oDate < today;
            } else if (datePreset === 'this_week') {
                const day = today.getDay() || 7;
                const monday = new Date(today); monday.setDate(monday.getDate() - day + 1);
                matchesDate = oDate >= monday;
            } else if (datePreset === 'this_month') {
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                matchesDate = oDate >= firstDay;
            } else if (datePreset === 'last_month') {
                const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                matchesDate = oDate >= firstDayLastMonth && oDate <= lastDayLastMonth;
            } else if (datePreset === 'custom') {
                if (dateFrom) {
                    const from = new Date(dateFrom);
                    matchesDate = matchesDate && (oDate >= from);
                }
                if (dateTo) {
                    const to = new Date(dateTo);
                    to.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && (oDate <= to);
                }
            }
        }

        return matchesId && matchesStatus && matchesEvent && matchesPayment && matchesDate;
    });

    filtered.sort((a, b) => {
        const dateA = a.orderDate ? (a.orderDate.toDate ? a.orderDate.toDate() : new Date(a.orderDate)) : new Date(0);
        const dateB = b.orderDate ? (b.orderDate.toDate ? b.orderDate.toDate() : new Date(b.orderDate)) : new Date(0);
        return dateB - dateA;
    });

    // Tính tổng doanh thu và tiền cọc
    const sumTotalRental = filtered.reduce((acc, cur) => acc + (cur.totalAmount || cur.rentalInfo?.totalPrice || 0), 0);
    const sumDeposit = filtered.reduce((acc, cur) => acc + (cur.rentalInfo?.depositAmount || cur.deposit || 0), 0);

    const filteredTotalElem = document.getElementById('rental-filtered-total-amount');
    const summaryTotalElem = document.getElementById('rental-summary-total');
    const summaryDepositElem = document.getElementById('rental-summary-deposit');

    if (filteredTotalElem) filteredTotalElem.innerText = formatVND(sumTotalRental) + ' đ';
    if (summaryTotalElem) summaryTotalElem.innerText = formatVND(sumTotalRental);
    if (summaryDepositElem) summaryDepositElem.innerText = formatVND(sumDeposit);

    const pageSize = window.currentRentalOrderPageSize || 15;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    window.currentRentalTotalPages = totalPages;

    if (window.currentRentalOrderPage > totalPages) window.currentRentalOrderPage = totalPages;

    const startIndex = (window.currentRentalOrderPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const pageOrders = filtered.slice(startIndex, endIndex);

    renderRentalOrderRows(pageOrders, orderListTable);

    if (pageInfo) pageInfo.innerText = `${window.currentRentalOrderPage} / ${totalPages}`;
    if (countInfo) countInfo.innerText = filtered.length > 0 ? `${startIndex + 1} - ${endIndex} trong ${filtered.length} đơn thuê` : '0 đơn thuê';

    if (prevBtn) prevBtn.disabled = window.currentRentalOrderPage <= 1;
    if (firstBtn) firstBtn.disabled = window.currentRentalOrderPage <= 1;
    if (nextBtn) nextBtn.disabled = window.currentRentalOrderPage >= totalPages;
    if (lastBtn) lastBtn.disabled = window.currentRentalOrderPage >= totalPages;
};

function renderRentalOrderRows(ordersList, tableElement) {
    let htmlContent = '';
    ordersList.forEach((order) => {
        const orderId = order.id;
        const orderDate = order.orderDate
            ? (order.orderDate.toDate ? new Date(order.orderDate.toDate()) : new Date(order.orderDate)).toLocaleString('vi-VN')
            : 'N/A';
        
        const rInfo = order.rentalInfo || {};
        const items = order.items || [];
        const rentalDays = rInfo.rentalDays || 1;
        const totalRentalPrice = order.totalAmount || (items.reduce((s, i) => s + ((i.rentalPrice || i.price || 0) * (i.quantity || 1)), 0) * rentalDays);
        const depositAmount = rInfo.depositAmount || order.deposit || 0;

        const custName = rInfo.companyName || order.customerName || 'Khách thuê sự kiện';
        const custPhone = rInfo.phone || order.customerPhone || '';
        const custCode = order.userId || 'Khách vãng lai';
        const eventName = rInfo.eventName || rInfo.address || 'Trang trí Sự kiện / Decor';
        const status = order.status || 'Yêu cầu mới';

        let tagClass = 'warning';
        if (status === 'Đã thu hồi' || status === 'Hoàn thành') tagClass = 'success';
        else if (status === 'Đã xác nhận' || status === 'Đang setup') tagClass = 'info';
        else if (status === 'Đã hủy') tagClass = 'danger';

        htmlContent += `
            <tr class="product-row rental-order-row" data-rental-id="${orderId}" onclick="window.toggleRentalQuickView('${orderId}', event)" style="cursor: pointer;">
                <td style="text-align: center; padding: 4px;" onclick="event.stopPropagation();"><input type="checkbox" class="rental-chk" value="${orderId}"></td>
                <td style="color: #cbd5e1; padding: 4px;" onclick="event.stopPropagation();">☆</td>
                <td style="white-space: nowrap;"><strong style="color: #166534; font-size: 0.74rem; display: inline-block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;" title="${orderId}">${orderId}</strong></td>
                <td style="color: #475569; font-size: 0.71rem; white-space: nowrap;">${orderDate}</td>
                <td style="color: #64748b; font-size: 0.71rem; white-space: nowrap;"><span style="max-width: 100px; display: inline-block; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;" title="${custCode}">${custCode}</span></td>
                <td>
                    <strong style="color: #0f172a; font-size: 0.74rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${custName}">${custName}</strong>
                    ${custPhone ? `<small style="color: #64748b; font-size: 0.70rem; display: block;">${custPhone}</small>` : ''}
                </td>
                <td style="color: #334155; font-size: 0.72rem;">
                    <span style="display: block; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;" title="${eventName}">${eventName}</span>
                </td>
                <td style="text-align: right; font-weight: 700; color: #16a34a; font-size: 0.74rem; white-space: nowrap;">${formatVND(totalRentalPrice)}</td>
                <td style="text-align: right; font-weight: 600; color: #0284c7; font-size: 0.74rem; white-space: nowrap;">${formatVND(depositAmount)}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <span class="qv-tag ${tagClass}" style="padding: 2px 5px; font-weight: 600; border-radius: 4px; font-size: 0.68rem;">${status}</span>
                </td>
            </tr>
        `;
    });
    tableElement.innerHTML = htmlContent || '<tr><td colspan="10" style="text-align:center; padding: 2rem; color: #94a3b8;">Chưa có yêu cầu thuê đồ nào.</td></tr>';
}

window.toggleRentalQuickView = function (orderId, event) {
    if (event) event.stopPropagation();

    const existingDetail = document.getElementById(`rental-detail-row-${orderId}`);
    const targetRow = document.querySelector(`tr[data-rental-id="${orderId}"]`);

    if (existingDetail) {
        existingDetail.remove();
        if (targetRow) targetRow.classList.remove('expanded');
        return;
    }

    document.querySelectorAll('.kiot-detail-row').forEach(row => row.remove());
    document.querySelectorAll('.rental-order-row').forEach(row => row.classList.remove('expanded'));

    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order || !targetRow) return;

    targetRow.classList.add('expanded');

    const rInfo = order.rentalInfo || {};
    const orderDate = order.orderDate
        ? (order.orderDate.toDate ? new Date(order.orderDate.toDate()) : new Date(order.orderDate)).toLocaleString('vi-VN')
        : 'N/A';

    const items = order.items || [];
    const rentalDays = rInfo.rentalDays || 1;
    const subtotalDaily = items.reduce((s, i) => s + ((i.rentalPrice || i.price || 0) * (i.quantity || 1)), 0);
    const totalRentalPrice = order.totalAmount || (subtotalDaily * rentalDays);
    const depositAmount = rInfo.depositAmount || order.deposit || 0;
    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

    const custName = rInfo.companyName || order.customerName || 'Khách thuê sự kiện';
    const custPhone = rInfo.phone || order.customerPhone || 'Chưa có SĐT';
    const custAddress = rInfo.address || 'Địa điểm setup theo hợp đồng';
    const eventDateStr = rInfo.rentalDate ? new Date(rInfo.rentalDate).toLocaleDateString('vi-VN') : 'Chưa định ngày';
    const returnDateStr = rInfo.returnDate ? new Date(rInfo.returnDate).toLocaleDateString('vi-VN') : 'Chưa định ngày';
    const custCode = order.userId || 'Khách vãng lai';
    const status = order.status || 'Yêu cầu mới';

    let tagClass = 'warning';
    if (status === 'Đã thu hồi' || status === 'Hoàn thành') tagClass = 'success';
    else if (status === 'Đã xác nhận' || status === 'Đang setup') tagClass = 'info';
    else if (status === 'Đã hủy') tagClass = 'danger';

    const detailRow = document.createElement('tr');
    detailRow.id = `rental-detail-row-${orderId}`;
    detailRow.className = 'kiot-detail-row';
    detailRow.innerHTML = `
        <td colspan="10" style="padding: 0; background: #ffffff;">
            <div class="kiot-quickview-card" style="border: 2px solid #166534; margin: 8px 0; border-radius: 8px; box-shadow: 0 4px 15px rgba(22, 101, 52, 0.12);">
                <div class="quickview-tabs">
                    <button type="button" class="qv-tab-item active">Chi tiết hợp đồng thuê</button>
                </div>

                <div class="quickview-body order-qv-info-body" style="flex-direction: column; gap: 14px; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <strong style="font-size: 1.05rem; color: #166534;">${custCode} - ${custName}</strong>
                            <span style="font-size: 0.85rem; color: #64748b;">🏺 ${orderId}</span>
                            <span class="qv-tag ${tagClass}" style="font-weight: 600; padding: 3px 8px;">${status}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #64748b;">Sự kiện: <strong>${rInfo.eventName || 'Trang trí Sự kiện'}</strong></div>
                    </div>

                    <div class="quickview-fields-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; width: 100%; font-size: 0.85rem; color: #334155;">
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Số điện thoại:</span> <strong>${custPhone}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Địa điểm setup:</span> <span style="font-weight: 600; color: #0f172a;">${custAddress}</span></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Ngày giao đồ:</span> <strong style="color: #0284c7;">${eventDateStr}</strong></div>
                        <div class="qv-field"><span class="qv-label" style="color: #64748b;">Ngày trả đồ:</span> <strong style="color: #dc2626;">${returnDateStr} (${rentalDays} ngày)</strong></div>
                    </div>

                    <!-- Items List Table -->
                    <div style="width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 4px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.83rem;">
                            <thead>
                                <tr style="background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0;">
                                    <th style="padding: 8px 10px; text-align: left;">Mã hàng</th>
                                    <th style="padding: 8px 10px; text-align: left;">Tên món đồ gốm</th>
                                    <th style="padding: 8px 10px; text-align: center;">Số lượng</th>
                                    <th style="padding: 8px 10px; text-align: right;">Giá thuê/ngày</th>
                                    <th style="padding: 8px 10px; text-align: right;">Thành tiền/ngày</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => {
                                    const uPrice = item.rentalPrice || item.price || 0;
                                    const lineTotal = uPrice * (item.quantity || 1);

                                    return `
                                    <tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 8px 10px; color: #166534; font-weight: 600;">${item.id || 'SP'}</td>
                                        <td style="padding: 8px 10px; font-weight: 500;">
                                            <strong style="color: #0f172a; display: block;">${item.name}</strong>
                                            <div style="display: flex; gap: 6px; font-size: 0.74rem; color: #64748b; margin-top: 2px;">
                                                ${item.color ? `<span>🎨 Màu: ${item.color}</span>` : ''}
                                                ${(item.pattern || item.texture) ? `<span>✨ Họa tiết: ${item.pattern || item.texture}</span>` : ''}
                                                ${(item.combo || item.comboName) ? `<span style="color: #0066cc;">🎁 Combo: ${item.combo || item.comboName}</span>` : ''}
                                            </div>
                                        </td>
                                        <td style="padding: 8px 10px; text-align: center; font-weight: 600;">${item.quantity || 1}</td>
                                        <td style="padding: 8px 10px; text-align: right;">${formatVND(uPrice)}</td>
                                        <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a;">${formatVND(lineTotal)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 340px; gap: 20px; width: 100%; align-items: flex-start; margin-top: 4px;">
                        <div>
                            <textarea placeholder="Ghi chú & Yêu cầu setup..." style="width: 100%; height: 85px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font-size: 0.85rem; font-family: inherit; outline: none;" onchange="window.updateOrderNote('${orderId}', this.value)">${order.note || ''}</textarea>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.88rem; color: #334155; background: #f0fdf4; padding: 12px 14px; border-radius: 6px; border: 1px solid #bbf7d0;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Giá thuê 1 ngày (${totalQty} món):</span>
                                <strong style="color: #0f172a;">${formatVND(subtotalDaily)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Số ngày thuê:</span>
                                <strong style="color: #0284c7;">${rentalDays} ngày</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid #bbf7d0; padding-top: 6px;">
                                <strong style="color: #0f172a;">Tổng tiền thuê:</strong>
                                <strong style="color: #16a34a; font-size: 1.1rem;">${formatVND(totalRentalPrice)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <strong style="color: #0f172a;">Đã cọc trước:</strong>
                                <strong style="color: #0284c7; font-size: 1.05rem;">${formatVND(depositAmount)}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="quickview-footer" style="padding: 12px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <div class="left-actions" style="display: flex; gap: 10px;">
                        <button type="button" class="qv-btn-text" style="color: #166534; font-weight: 600;" onclick="event.stopPropagation(); window.openEditRentalOrderModal('${orderId}')">✏️ Chỉnh sửa đơn thuê</button>
                        <button type="button" class="qv-btn-text red" onclick="event.stopPropagation(); window.deleteAdminOrder('${orderId}')">🗑️ Hủy đơn</button>
                    </div>
                    <div class="right-actions" style="display: flex; align-items: center; gap: 10px;">
                        <select class="status-select" style="padding: 6px 12px; border: 1px solid #166534; color: #166534; border-radius: 6px; font-weight: 600; background: #fff; cursor: pointer;" onchange="event.stopPropagation(); window.updateOrderStatus('${orderId}', this.value, this)">
                            <option value="Yêu cầu mới" ${status === 'Yêu cầu mới' ? 'selected' : ''}>Yêu cầu mới</option>
                            <option value="Đã xác nhận" ${status === 'Đã xác nhận' ? 'selected' : ''}>Đã xác nhận</option>
                            <option value="Đang setup" ${status === 'Đang setup' ? 'selected' : ''}>Đang setup</option>
                            <option value="Đã thu hồi" ${status === 'Đã thu hồi' ? 'selected' : ''}>Đã thu hồi</option>
                            <option value="Đã hủy" ${status === 'Đã hủy' ? 'selected' : ''}>Đã hủy</option>
                        </select>
                        <button type="button" class="kiot-btn-primary" style="background: #166534;" onclick="event.stopPropagation(); window.printRentalOrderBill('${orderId}')">🖨️ In hợp đồng thuê</button>
                    </div>
                </div>
            </div>
        </td>
    `;

    targetRow.parentNode.insertBefore(detailRow, targetRow.nextSibling);
};

window.currentEditRentalItems = [];

window.openEditRentalOrderModal = function (orderId) {
    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order) {
        showToast("Không tìm thấy thông tin đơn thuê", "error");
        return;
    }

    const rInfo = order.rentalInfo || {};
    const modalTitle = document.getElementById('edit-rental-modal-title');
    if (modalTitle) modalTitle.innerText = `✏️ Chỉnh sửa đơn thuê ${orderId}`;

    const hiddenId = document.getElementById('edit-rental-id-hidden');
    if (hiddenId) hiddenId.value = orderId;

    const nameInput = document.getElementById('edit-rental-cust-name');
    if (nameInput) nameInput.value = rInfo.companyName || order.customerName || '';

    const phoneInput = document.getElementById('edit-rental-cust-phone');
    if (phoneInput) phoneInput.value = rInfo.phone || order.customerPhone || '';

    const eventInput = document.getElementById('edit-rental-event-name');
    if (eventInput) eventInput.value = rInfo.eventName || '';

    const addrInput = document.getElementById('edit-rental-address');
    if (addrInput) addrInput.value = rInfo.address || '';

    const dateInput = document.getElementById('edit-rental-date');
    if (dateInput) dateInput.value = rInfo.rentalDate ? rInfo.rentalDate.split('T')[0] : '';

    const returnInput = document.getElementById('edit-rental-return-date');
    if (returnInput) returnInput.value = rInfo.returnDate ? rInfo.returnDate.split('T')[0] : '';

    const statusSel = document.getElementById('edit-rental-status');
    if (statusSel) statusSel.value = order.status || 'Yêu cầu mới';

    const depInput = document.getElementById('edit-rental-deposit');
    if (depInput) depInput.value = rInfo.depositAmount || order.deposit || 0;

    const daysInput = document.getElementById('edit-rental-days');
    if (daysInput) daysInput.value = rInfo.rentalDays || 1;

    const paySel = document.getElementById('edit-rental-payment');
    if (paySel) paySel.value = order.paymentMethod || 'Tiền mặt';

    const noteInput = document.getElementById('edit-rental-note');
    if (noteInput) noteInput.value = order.note || '';

    window.currentEditRentalItems = JSON.parse(JSON.stringify(order.items || []));
    window.renderEditRentalOrderItemsTable();

    const modal = document.getElementById('edit-rental-order-modal');
    if (modal) modal.style.display = 'block';
};

window.renderEditRentalOrderItemsTable = function () {
    const tbody = document.getElementById('edit-rental-items-tbody');
    if (!tbody) return;

    if (!window.currentEditRentalItems || window.currentEditRentalItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 16px; color: #94a3b8;">Đơn thuê chưa có món nào. Bấm nút "+ Thêm món thuê mới".</td></tr>`;
        window.recalculateEditRentalTotal();
        return;
    }

    let html = '';
    window.currentEditRentalItems.forEach((item, index) => {
        const qty = item.quantity || 1;
        const price = item.rentalPrice || item.price || 0;
        const total = price * qty;

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 10px;">
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
                        <strong style="color: #166534; font-size: 0.8rem; white-space: nowrap;">${item.id || 'SP' + (index+1)}</strong>
                        <input type="text" value="${item.name || ''}" placeholder="Tên món gốm..." style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 6px; font-size: 0.82rem; font-weight: 600;" onchange="window.changeEditRentalItemField(${index}, 'name', this.value)">
                    </div>
                </td>
                <td style="padding: 8px 10px; text-align: center; vertical-align: top;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 4px;">
                        <button type="button" style="width: 24px; height: 24px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: bold; cursor: pointer;" onclick="window.updateEditRentalItemQty(${index}, -1)">-</button>
                        <input type="number" min="1" value="${qty}" style="width: 45px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 4px; font-size: 0.82rem;" onchange="window.changeEditRentalItemQty(${index}, this.value)">
                        <button type="button" style="width: 24px; height: 24px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: bold; cursor: pointer;" onclick="window.updateEditRentalItemQty(${index}, 1)">+</button>
                    </div>
                </td>
                <td style="padding: 8px 10px; text-align: right; vertical-align: top;">
                    <input type="number" value="${price}" style="width: 95px; text-align: right; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 0.82rem; margin-top: 4px;" onchange="window.changeEditRentalItemPrice(${index}, this.value)">
                </td>
                <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a; vertical-align: top; padding-top: 12px;">
                    ${formatVND(total)}
                </td>
                <td style="padding: 8px 10px; text-align: center; vertical-align: top; padding-top: 10px;">
                    <button type="button" style="border: none; background: none; color: #dc2626; cursor: pointer; font-size: 0.9rem;" onclick="window.removeEditRentalItem(${index})">🗑️</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    window.recalculateEditRentalTotal();
};

window.changeEditRentalItemField = function (index, field, val) {
    if (!window.currentEditRentalItems[index]) return;
    window.currentEditRentalItems[index][field] = val.trim();
};

window.updateEditRentalItemQty = function (index, delta) {
    if (!window.currentEditRentalItems[index]) return;
    let currentQty = window.currentEditRentalItems[index].quantity || 1;
    currentQty += delta;
    if (currentQty < 1) currentQty = 1;
    window.currentEditRentalItems[index].quantity = currentQty;
    window.renderEditRentalOrderItemsTable();
};

window.changeEditRentalItemQty = function (index, val) {
    if (!window.currentEditRentalItems[index]) return;
    let num = parseInt(val) || 1;
    if (num < 1) num = 1;
    window.currentEditRentalItems[index].quantity = num;
    window.renderEditRentalOrderItemsTable();
};

window.changeEditRentalItemPrice = function (index, val) {
    if (!window.currentEditRentalItems[index]) return;
    let price = parseFloat(val) || 0;
    if (price < 0) price = 0;
    window.currentEditRentalItems[index].rentalPrice = price;
    window.currentEditRentalItems[index].price = price;
    window.renderEditRentalOrderItemsTable();
};

window.removeEditRentalItem = function (index) {
    if (!window.currentEditRentalItems[index]) return;
    window.currentEditRentalItems.splice(index, 1);
    window.renderEditRentalOrderItemsTable();
};

window.addEditRentalItemPrompt = function () {
    const prodName = prompt("Nhập tên sản phẩm thuê mới:");
    if (!prodName) return;
    const priceStr = prompt("Nhập giá thuê/ngày (VNĐ):", "50000");
    const price = parseFloat(priceStr) || 0;
    const qtyStr = prompt("Nhập số lượng:", "1");
    const qty = parseInt(qtyStr) || 1;

    const newItem = {
        id: "THUE" + Math.floor(100000 + Math.random() * 900000),
        name: prodName,
        price: price,
        rentalPrice: price,
        quantity: qty
    };

    window.currentEditRentalItems.push(newItem);
    window.renderEditRentalOrderItemsTable();
};

window.recalculateEditRentalTotal = function () {
    const items = window.currentEditRentalItems || [];
    const subtotalDaily = items.reduce((sum, item) => sum + ((item.rentalPrice || item.price || 0) * (item.quantity || 1)), 0);
    const rentalDays = parseInt(document.getElementById('edit-rental-days')?.value || 1) || 1;
    const finalTotal = subtotalDaily * rentalDays;

    const subtotalElem = document.getElementById('edit-rental-calc-subtotal');
    const totalElem = document.getElementById('edit-rental-calc-total');

    if (subtotalElem) subtotalElem.innerText = formatVND(subtotalDaily) + ' đ';
    if (totalElem) totalElem.innerText = formatVND(finalTotal) + ' đ';
};

window.closeEditRentalOrderModal = function () {
    const modal = document.getElementById('edit-rental-order-modal');
    if (modal) modal.style.display = 'none';
};

window.saveEditedRentalOrder = async function () {
    const orderId = document.getElementById('edit-rental-id-hidden')?.value;
    if (!orderId) return;

    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order) return;

    const companyName = document.getElementById('edit-rental-cust-name')?.value.trim() || '';
    const phone = document.getElementById('edit-rental-cust-phone')?.value.trim() || '';
    const eventName = document.getElementById('edit-rental-event-name')?.value.trim() || '';
    const address = document.getElementById('edit-rental-address')?.value.trim() || '';
    const rentalDate = document.getElementById('edit-rental-date')?.value || '';
    const returnDate = document.getElementById('edit-rental-return-date')?.value || '';
    const status = document.getElementById('edit-rental-status')?.value || order.status;
    const depositAmount = parseFloat(document.getElementById('edit-rental-deposit')?.value || 0) || 0;
    const rentalDays = parseInt(document.getElementById('edit-rental-days')?.value || 1) || 1;
    const paymentMethod = document.getElementById('edit-rental-payment')?.value || 'Tiền mặt';
    const note = document.getElementById('edit-rental-note')?.value.trim() || '';

    const items = window.currentEditRentalItems || [];
    const subtotalDaily = items.reduce((s, i) => s + ((i.rentalPrice || i.price || 0) * (i.quantity || 1)), 0);
    const newTotalAmount = subtotalDaily * rentalDays;

    try {
        const orderRef = doc(db, 'orders', orderId);
        const updatePayload = {
            status: status,
            paymentMethod: paymentMethod,
            note: note,
            items: items,
            totalAmount: newTotalAmount,
            'rentalInfo.companyName': companyName,
            'rentalInfo.phone': phone,
            'rentalInfo.eventName': eventName,
            'rentalInfo.address': address,
            'rentalInfo.rentalDate': rentalDate,
            'rentalInfo.returnDate': returnDate,
            'rentalInfo.depositAmount': depositAmount,
            'rentalInfo.rentalDays': rentalDays,
            'rentalInfo.totalPrice': newTotalAmount
        };

        await updateDoc(orderRef, updatePayload);

        // Update local cache object
        order.status = status;
        order.paymentMethod = paymentMethod;
        order.note = note;
        order.items = items;
        order.totalAmount = newTotalAmount;
        if (!order.rentalInfo) order.rentalInfo = {};
        order.rentalInfo.companyName = companyName;
        order.rentalInfo.phone = phone;
        order.rentalInfo.eventName = eventName;
        order.rentalInfo.address = address;
        order.rentalInfo.rentalDate = rentalDate;
        order.rentalInfo.returnDate = returnDate;
        order.rentalInfo.depositAmount = depositAmount;
        order.rentalInfo.rentalDays = rentalDays;

        showToast(`Đã cập nhật đơn thuê ${orderId} thành công!`, "success");
        window.closeEditRentalOrderModal();
        window.renderRentalOrdersFiltered();
    } catch (err) {
        console.error("Lỗi cập nhật đơn thuê:", err);
        showToast("Không thể cập nhật đơn thuê: " + err.message, "error");
    }
};

async function generateTierUpVoucher(userId, tier) {
    if (!tier || tier.tierUpVoucher <= 0) return;

    const code = `UP${tier.id.toUpperCase()}${userId.substring(0, 5).toUpperCase()}`;
    const couponRef = doc(db, "coupons", code);
    const snap = await getDoc(couponRef);
    if (!snap.exists()) {
        await setDoc(couponRef, {
            name: `Voucher thăng hạng ${tier.name}`,
            type: "fixed",
            value: tier.tierUpVoucher,
            limit: 1,
            usedCount: 0,
            category: "all",
            minOrder: 0,
            createdAt: serverTimestamp(),
            isAutoGenerated: true,
            assignedTo: userId
        });
    }
}

window.updateOrderStatus = async (orderId, newStatus, selectElement) => {
    try {
        let oldStatus = null;
        let userId = null;
        let orderTotal = 0;

        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (orderSnap.exists()) {
            const data = orderSnap.data();
            oldStatus = data.status;
            userId = data.userId;
            orderTotal = data.totalAmount || 0;
        }

        if (oldStatus !== "Đã hoàn thành" && newStatus === "Đã hoàn thành" && userId && userId !== 'guest') {
            const qOrders = query(collection(db, "orders"),
                where("userId", "==", userId),
                where("status", "==", "Đã hoàn thành"));
            const orderSnaps = await getDocs(qOrders);
            let totalSpentBefore = 0;
            orderSnaps.forEach(d => {
                if (d.id !== orderId) {
                    totalSpentBefore += (d.data().totalAmount || 0);
                }
            });

            let tierBefore = getMembershipTier(totalSpentBefore);
            let tierAfter = getMembershipTier(totalSpentBefore + orderTotal);

            if (tierBefore.id !== tierAfter.id && tierAfter.tierUpVoucher > 0) {
                await generateTierUpVoucher(userId, tierAfter);
            }
        }

        let trackingLink = "";
        if (newStatus === "Đang giao hàng") {
            trackingLink = prompt("Nhập link theo dõi lộ trình giao hàng (Grab, Ahamove, GHTK...) nếu có (để trống nếu không có):");
            if (trackingLink === null) {
                if (selectElement) selectElement.value = oldStatus;
                return;
            }
        }

        if (newStatus === "Đã hủy") {
            const functions = getFunctions(db.app);
            const cancelOrderSecure = httpsCallable(functions, 'cancelOrderSecure');
            await cancelOrderSecure({ orderId: orderId });
            showToast(`Đã hủy đơn hàng #${orderId} và hoàn lại tồn kho thành công!`, "success");
        } else {
            const updateData = { status: newStatus };
            if (trackingLink) {
                updateData.trackingLink = trackingLink.trim();
            }
            await setDoc(doc(db, "orders", orderId), updateData, { merge: true });
            showToast(`Đã cập nhật trạng thái đơn hàng #${orderId} thành: ${newStatus}`);
        }
    } catch (error) {
        showToast("Lỗi cập nhật: " + error.message, "error");
        if (selectElement && typeof oldStatus !== 'undefined') selectElement.value = oldStatus;
    }
};

window.printOrderBill = async (orderId) => {
    try {
        const docSnap = await getDoc(doc(db, "orders", orderId));
        if (!docSnap.exists()) {
            showToast("Không tìm thấy dữ liệu đơn hàng", "error");
            return;
        }
        const o = docSnap.data();
        const customer = {
            name: o.shippingAddress?.fullName || "Khách vãng lai",
            phone: o.shippingAddress?.phone || "N/A",
            paymentMethod: o.paymentMethod || 'Tiền mặt'
        };
        const subtotal = o.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const shippingFee = o.shippingFee || 0;
        const discountVal = (o.discountAmount || 0) + (o.membershipDiscount || 0);

        printPOSReceipt(orderId, customer, o.items, o.totalAmount, subtotal, discountVal, shippingFee);
    } catch (e) {
        showToast("Lỗi khi chuẩn bị in hóa đơn", "error");
    }
};
window.viewAdminOrderDetail = async (orderId) => {
    try {
        const docSnap = await getDoc(doc(db, "orders", orderId));
        if (!docSnap.exists()) return;
        const order = docSnap.data();

        let modal = document.getElementById('order-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'order-detail-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingFee = order.shippingFee || 0;
        const discountAmount = order.discountAmount || 0;
        const membershipDiscount = order.membershipDiscount || 0;

        let pricingDetailsHtml = `
            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px; color: #555;">
                <span>Tạm tính:</span>
                <span>${new Intl.NumberFormat('vi-VN').format(subtotal)}đ</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px; color: #555;">
                <span>Phí vận chuyển:</span>
                <span>+${new Intl.NumberFormat('vi-VN').format(shippingFee)}đ</span>
            </div>
        `;
        if (order.couponCode && discountAmount > 0) {
            pricingDetailsHtml += `
                <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px; color: #e74c3c;">
                    <span>Khuyến mãi (${order.couponCode}):</span>
                    <span>-${new Intl.NumberFormat('vi-VN').format(discountAmount)}đ</span>
                </div>
            `;
        }
        if (order.trackingLink) { pricingDetailsHtml += `<div style="font-size: 0.95rem; margin-bottom: 8px; color: #2980b9;"><span><strong>Lộ trình giao hàng:</strong> <a href="${order.trackingLink}" target="_blank" style="color: #3498db; text-decoration: underline;">Xem (Grab/Ahamove/...)</a></span></div>`; } if (membershipDiscount > 0) {
            pricingDetailsHtml += `
                <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px; color: #27ae60;">
                    <span>Giảm giá thành viên (VIP):</span>
                    <span>-${new Intl.NumberFormat('vi-VN').format(membershipDiscount)}đ</span>
                </div>
            `;
        }

        if (order.orderType === 'rental') {
            const rInfo = order.rentalInfo || {};
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 900px; position: relative;">
                    <span class="modal-close" style="position: sticky; top: 0; float: right; margin-bottom: -40px; margin-right: -10px; background: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 100;" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                    <h3 style="color: #0d47a1; margin-bottom: 20px;">📄 Chi tiết đơn thuê #${orderId}</h3>
                    
                    <div style="display: flex; gap: 10px; margin: 15px 0;">
                        <button class="btn-dark" style="flex: 1; height: 45px; display: flex; align-items: center; justify-content: center; gap: 10px;" onclick="window.printRentalBill('${orderId}')">
                            🖨️ In Hợp đồng
                        </button>
                        <button class="btn-dark" style="flex: 1; height: 45px; display: flex; align-items: center; justify-content: center; gap: 10px; background-color: #27ae60; border-color: #27ae60;" onclick="window.downloadRentalBillPDF('${orderId}')">
                            ⬇️ Tải PDF
                        </button>
                        <button class="btn-minimal" style="flex: 1; height: 45px; border: 1px solid #27ae60; color: #27ae60; display: flex; align-items: center; justify-content: center; gap: 10px; background: #fff;" onclick="window.exportRentalToExcel('${orderId}')">
                            📊 Xuất Excel
                        </button>
                    </div>

                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h4 style="margin-top: 0; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 5px;">Thông tin khách thuê</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.95rem;">
                            <p style="margin: 5px 0;"><strong>Công ty / Cá nhân:</strong> ${rInfo.companyName || 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong>Mã số thuế:</strong> ${rInfo.taxCode || 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong>Người liên hệ:</strong> ${rInfo.contactName || order.shippingAddress?.fullName || 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong>SĐT:</strong> ${rInfo.phone || order.shippingAddress?.phone || 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${rInfo.email || 'N/A'}</p>
                        </div>
                    </div>

                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h4 style="margin-top: 0; color: #0d47a1; border-bottom: 2px solid #bbdefb; padding-bottom: 5px;">Chi tiết sự kiện</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.95rem;">
                            <p style="margin: 5px 0;"><strong>Ngày cần đồ:</strong> ${rInfo.rentalDate ? new Date(rInfo.rentalDate).toLocaleDateString('vi-VN') : 'N/A'}</p>
                            <p style="margin: 5px 0;"><strong>Ngày trả đồ:</strong> ${rInfo.returnDate ? new Date(rInfo.returnDate).toLocaleDateString('vi-VN') : 'N/A'}</p>
                            <p style="margin: 5px 0; grid-column: 1 / -1;"><strong>Địa chỉ setup:</strong> ${rInfo.address || 'N/A'}</p>
                        </div>
                        ${rInfo.notes ? `<p style="margin: 10px 0 5px 0; font-size: 0.95rem; color: #d35400;"><strong>Ghi chú:</strong> ${rInfo.notes.replace(/\n/g, '<br>')}</p>` : ''}
                    </div>

                    <h4 style="margin-top: 0; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 5px;">Sản phẩm thuê</h4>
                    <ul style="list-style: none; padding: 0;">
                        ${order.items.map(i => `
                            <li style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 1px solid #f9f9f9; padding-bottom: 8px;">
                                <img src="${i.image}" alt="${i.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                                <div>
                                    <div style="font-weight: 600;">${i.name}</div>
                                    <div style="font-size: 0.8rem; color: #555;">Mã SP: ${i.id}</div>
                                    <div style="font-size: 0.85rem; color: #666;">Số lượng: ${i.quantity} | Giá thuê: ${new Intl.NumberFormat('vi-VN').format(i.rentalPrice || i.price || 0)} VND/ngày</div>
                                </div>
                            </li>`).join('')}
                    </ul>
                    
                    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-top: 20px;">
                        <div style="display: flex; justify-content: space-between; font-size: 1rem; margin-bottom: 8px; color: #555;">
                            <span>Tạm tính tiền thuê:</span>
                            <span>${new Intl.NumberFormat('vi-VN').format(subtotal)}đ</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 1rem; margin-bottom: 8px; color: #555;">
                            <span>Tiền cọc dự kiến (50%):</span>
                            <span>${new Intl.NumberFormat('vi-VN').format(Math.round(subtotal / 2))}đ</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: 700; color: #e65100; border-top: 1px solid #ffe0b2; padding-top: 10px; margin-top: 5px;">
                            <span>Tổng thanh toán:</span>
                            <span>${new Intl.NumberFormat('vi-VN').format(order.totalAmount)}đ</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 900px; position: relative;">
                    <span class="modal-close" style="position: sticky; top: 0; float: right; margin-bottom: -40px; margin-right: -10px; background: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 100;" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                    <h3>Chi tiết đơn hàng #${orderId}</h3>
                    
                    <div style="display: flex; gap: 10px; margin: 15px 0;">
                        <button class="btn-dark" style="flex: 1; height: 45px; display: flex; align-items: center; justify-content: center; gap: 10px;" onclick="window.printOrderBill('${orderId}')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg> In hóa đơn (Bill)
                        </button>
                        <button class="btn-minimal" style="flex: 1; height: 45px; border: 1px solid #1e88e5; color: #1e88e5; display: flex; align-items: center; justify-content: center; background: #fff;" onclick="window.editAdminOrder('${orderId}')">
                            Sửa đơn hàng
                        </button>
                    </div>
                    <hr style="margin: 1rem 0;">
                    <p><strong>Khách hàng:</strong> ${order.shippingAddress?.fullName || 'Khách vãng lai'}</p>
                    <p><strong>SĐT:</strong> ${order.shippingAddress?.phone || 'N/A'}</p>
                    <p><strong>Địa chỉ:</strong> ${order.shippingAddress?.address || 'N/A'}</p>
                    <p><strong>Sản phẩm:</strong></p>
                    <ul style="list-style: none; padding: 0;">
                        ${order.items.map(i => `
                            <li style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 1px solid #f9f9f9; padding-bottom: 8px;">
                                <img src="${i.image}" alt="${i.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                                <div>
                                    <div style="font-weight: 600;">${i.name}</div>
                                    <div style="font-size: 0.8rem; color: #555;">Mã SP: ${i.id}</div>
                                    ${i.variant ? `<div style="font-size: 0.8rem; color: #e67e22; margin-bottom: 2px;">Phân loại: ${i.variant}</div>` : ''}
                                    <div style="font-size: 0.85rem; color: #666;">Số lượng: ${i.quantity} | Giá: ${new Intl.NumberFormat('vi-VN').format(i.price)} VND</div>
                                </div>
                            </li>`).join('')}
                    </ul>
                    <hr style="margin: 1rem 0; border: none; border-top: 1px solid #eee;">
                    ${pricingDetailsHtml}
                    <div style="display: flex; justify-content: space-between; font-size: 1.2rem; border-top: 1px solid #eee; padding-top: 10px; font-weight: 700; margin-top: 10px;">
                        <span>Tổng thanh toán:</span>
                        <span style="color: var(--primary-color, #2c3e50);">${new Intl.NumberFormat('vi-VN').format(order.totalAmount)}đ</span>
                    </div>
                </div>
            `;
        }
        modal.classList.add('active');
    } catch (e) { console.error(e); }
};

// --- Quản lý Người dùng ---
function initUserListener() {
    if (!db) return;

    // Lấy danh sách admin để so khớp badge
    getDocs(collection(db, "admins")).then(adminsSnap => {
        const adminDataMap = new Map(adminsSnap.docs.map(d => [d.id, d.data()]));
        window.adminDataMapLocal = adminDataMap; // Lưu để dùng cho render

        onSnapshot(collection(db, "users"), (snapshot) => {
            posUsersLocal = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderAdminUserTable();
        }, (error) => {
            console.error("User list listener error:", error);
        });
    });
}

window.selectedUserDatePreset = 'all';
window.selectedUserType = 'all';
window.selectedUserGender = 'all';
window.currentAdminUserPage = 1;
window.currentAdminUserPageSize = 15;

window.toggleUserTimePresetPopover = function (event) {
    if (event) event.stopPropagation();
    const presetPop = document.getElementById('user-time-preset-popover');
    const customPop = document.getElementById('user-custom-date-popover');
    const btn = document.getElementById('btn-radio-user-time-preset');

    if (customPop) customPop.classList.remove('show');

    if (presetPop) {
        const willShow = !presetPop.classList.contains('show');
        if (willShow && btn) {
            const rect = btn.getBoundingClientRect();
            presetPop.style.top = Math.max(10, rect.top) + 'px';
            presetPop.style.left = (rect.right + 4) + 'px';
        }
        presetPop.classList.toggle('show');
    }
};

window.toggleUserCustomDatePopover = function (event) {
    if (event) event.stopPropagation();
    const presetPop = document.getElementById('user-time-preset-popover');
    const customPop = document.getElementById('user-custom-date-popover');
    const btn = document.getElementById('btn-radio-user-time-custom');

    if (presetPop) presetPop.classList.remove('show');

    if (customPop) {
        const willShow = !customPop.classList.contains('show');
        if (willShow && btn) {
            const rect = btn.getBoundingClientRect();
            customPop.style.top = Math.max(10, rect.top) + 'px';
            customPop.style.left = (rect.right + 4) + 'px';
        }
        customPop.classList.toggle('show');
    }
};

window.selectUserTimePreset = function (presetKey, presetName, btnElem) {
    window.selectedUserDatePreset = presetKey;
    const label = document.getElementById('user-order-time-preset-label');
    if (label) label.innerText = '🔵 ' + presetName;

    const btnPreset = document.getElementById('btn-radio-user-time-preset');
    const btnCustom = document.getElementById('btn-radio-user-time-custom');
    if (btnPreset) btnPreset.classList.add('active');
    if (btnCustom) btnCustom.classList.remove('active');

    const presetPop = document.getElementById('user-time-preset-popover');
    if (presetPop) {
        presetPop.querySelectorAll('.popover-pill').forEach(p => p.classList.remove('active'));
        if (btnElem) btnElem.classList.add('active');
        presetPop.classList.remove('show');
    }

    window.currentAdminUserPage = 1;
    window.renderAdminUserTable();
};

window.closeUserCustomDatePopover = function () {
    const customPop = document.getElementById('user-custom-date-popover');
    if (customPop) customPop.classList.remove('show');
};

window.setUserTodayDateRange = function () {
    const todayStr = new Date().toISOString().split('T')[0];
    const fromInput = document.getElementById('user-date-from');
    const toInput = document.getElementById('user-date-to');
    if (fromInput) fromInput.value = todayStr;
    if (toInput) toInput.value = todayStr;
};

window.applyUserCustomDateRange = function () {
    window.selectedUserDatePreset = 'custom';
    const label = document.getElementById('user-order-time-custom-label');
    const fromInput = document.getElementById('user-date-from')?.value;
    const toInput = document.getElementById('user-date-to')?.value;

    if (label && fromInput && toInput) {
        label.innerText = `🔵 Tùy chỉnh (${fromInput} - ${toInput})`;
    }

    const btnPreset = document.getElementById('btn-radio-user-time-preset');
    const btnCustom = document.getElementById('btn-radio-user-time-custom');
    if (btnCustom) btnCustom.classList.add('active');
    if (btnPreset) btnPreset.classList.remove('active');

    window.closeUserCustomDatePopover();
    window.currentAdminUserPage = 1;
    window.renderAdminUserTable();
};

window.selectUserTypeFilter = function (type, btn) {
    window.selectedUserType = type;
    document.querySelectorAll('.user-type-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window.currentAdminUserPage = 1;
    window.renderAdminUserTable();
};

window.selectUserGenderFilter = function (gender, btn) {
    window.selectedUserGender = gender;
    document.querySelectorAll('.user-gender-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window.currentAdminUserPage = 1;
    window.renderAdminUserTable();
};

window.resetUserFilters = function () {
    const search = document.getElementById('admin-user-search');
    if (search) search.value = '';

    const groupSel = document.getElementById('user-filter-group');
    if (groupSel) groupSel.value = 'all';

    ['user-filter-spent-from', 'user-filter-spent-to', 'user-filter-debt-from', 'user-filter-debt-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    window.selectedUserType = 'all';
    window.selectedUserGender = 'all';
    document.querySelectorAll('.user-type-pill').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.user-gender-pill').forEach((b, i) => b.classList.toggle('active', i === 0));

    window.selectUserTimePreset('all', 'Tất cả thời gian', null);
};

window.changeUserPageSize = function (size) {
    window.currentAdminUserPageSize = parseInt(size) || 15;
    window.currentAdminUserPage = 1;
    window.renderAdminUserTable();
};

window.goUserPage = function (page) {
    const totalPages = window.currentAdminUserTotalPages || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    window.currentAdminUserPage = page;
    window.renderAdminUserTable();
};

function getAllCustomersCombined() {
    const userMap = new Map();

    // 1. Dữ liệu tài khoản trong collection `users`
    (posUsersLocal || []).forEach(u => {
        userMap.set(u.id, {
            id: u.id,
            displayName: u.displayName || u.fullName || u.email || 'Khách hàng',
            phone: u.phoneNumber || u.phone || '',
            email: u.email || '',
            address: u.address || (u.shippingAddress ? u.shippingAddress.address : ''),
            gender: u.gender || '',
            birthday: u.birthday || '',
            createdAt: u.createdAt || null,
            isCompany: u.isCompany || false,
            totalSpent: userTotalSpentLocal[u.id] || u.totalSpent || 0,
            debt: u.debt || 0,
            points: u.points || 0
        });
    });

    // 2. Tự động hợp nhất thêm các khách hàng mua từ collection `orders`
    (allOrdersCache || []).forEach(order => {
        const phone = order.customerPhone || order.shippingAddress?.phone || order.rentalInfo?.phone || '';
        const name = order.customerName || order.shippingAddress?.fullName || order.rentalInfo?.companyName || 'Khách vãng lai';
        const userId = order.userId || (phone ? 'KH_' + phone : order.id);

        const spent = userTotalSpentLocal[userId] || 0;

        if (!userMap.has(userId)) {
            userMap.set(userId, {
                id: userId,
                displayName: name,
                phone: phone,
                email: order.customerEmail || '',
                address: order.shippingAddress?.address || order.rentalInfo?.address || '',
                gender: '',
                birthday: '',
                createdAt: order.orderDate || null,
                isCompany: !!(order.rentalInfo?.companyName),
                totalSpent: spent,
                debt: 0,
                points: Math.floor(spent / 100000)
            });
        } else {
            const existing = userMap.get(userId);
            if (!existing.phone && phone) existing.phone = phone;
            if ((!existing.displayName || existing.displayName === 'Khách hàng') && name) existing.displayName = name;
            if (!existing.address && (order.shippingAddress?.address || order.rentalInfo?.address)) {
                existing.address = order.shippingAddress?.address || order.rentalInfo?.address;
            }
        }
    });

    return Array.from(userMap.values());
}

window.renderAdminUserTable = function renderAdminUserTable() {
    const userListTable = document.getElementById('admin-user-list');
    const searchInput = document.getElementById('admin-user-search');
    const prevBtn = document.getElementById('prev-user-page');
    const nextBtn = document.getElementById('next-user-page');
    const firstBtn = document.getElementById('first-user-page');
    const lastBtn = document.getElementById('last-user-page');
    const pageInfo = document.getElementById('user-page-info');
    const countInfo = document.getElementById('user-pagination-count');

    if (!userListTable) return;

    const allCustomers = getAllCustomersCombined();

    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const groupVal = document.getElementById('user-filter-group')?.value || 'all';
    const spentFrom = parseFloat(document.getElementById('user-filter-spent-from')?.value || 0) || 0;
    const spentTo = parseFloat(document.getElementById('user-filter-spent-to')?.value || 0) || 0;
    const debtFrom = parseFloat(document.getElementById('user-filter-debt-from')?.value || 0) || 0;
    const debtTo = parseFloat(document.getElementById('user-filter-debt-to')?.value || 0) || 0;

    const datePreset = window.selectedUserDatePreset || 'all';
    const dateFrom = document.getElementById('user-date-from')?.value;
    const dateTo = document.getElementById('user-date-to')?.value;

    const filtered = allCustomers.filter(u => {
        const matchesTerm = !term || (u.displayName || "").toLowerCase().includes(term) ||
            (u.phone || "").includes(term) ||
            (u.email || "").toLowerCase().includes(term) ||
            (u.id || "").toLowerCase().includes(term);

        const spent = userTotalSpentLocal[u.id] || u.totalSpent || 0;
        const tier = getMembershipTier(spent);
        const matchesGroup = groupVal === 'all' || tier.name.toLowerCase().includes(groupVal.toLowerCase()) || (groupVal === 'Mới' && spent === 0);

        const isCompany = u.isCompany || (u.displayName && u.displayName.toLowerCase().includes('công ty'));
        let matchesType = true;
        if (window.selectedUserType === 'personal') matchesType = !isCompany;
        else if (window.selectedUserType === 'company') matchesType = isCompany;

        const gender = u.gender || '';
        let matchesGender = true;
        if (window.selectedUserGender !== 'all') {
            matchesGender = (gender.toLowerCase() === window.selectedUserGender.toLowerCase());
        }

        let matchesSpent = true;
        if (spentFrom > 0) matchesSpent = matchesSpent && (spent >= spentFrom);
        if (spentTo > 0) matchesSpent = matchesSpent && (spent <= spentTo);

        const debt = u.debt || 0;
        let matchesDebt = true;
        if (debtFrom > 0) matchesDebt = matchesDebt && (debt >= debtFrom);
        if (debtTo > 0) matchesDebt = matchesDebt && (debt <= debtTo);

        let matchesDate = true;
        const uDate = u.createdAt ? (u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt)) : null;
        if (uDate && datePreset !== 'all') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (datePreset === 'today') {
                matchesDate = uDate >= today;
            } else if (datePreset === 'yesterday') {
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                matchesDate = uDate >= yesterday && uDate < today;
            } else if (datePreset === 'this_month') {
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                matchesDate = uDate >= firstDay;
            } else if (datePreset === 'custom') {
                if (dateFrom) {
                    const from = new Date(dateFrom);
                    matchesDate = matchesDate && (uDate >= from);
                }
                if (dateTo) {
                    const to = new Date(dateTo);
                    to.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && (uDate <= to);
                }
            }
        }

        return matchesTerm && matchesGroup && matchesType && matchesGender && matchesSpent && matchesDebt && matchesDate;
    });

    // Calculate sum totals
    const sumDebt = filtered.reduce((acc, cur) => acc + (cur.debt || 0), 0);
    const sumSpent = filtered.reduce((acc, cur) => acc + (userTotalSpentLocal[cur.id] || cur.totalSpent || 0), 0);

    const countElem = document.getElementById('user-filtered-count');
    const totalSpentElem = document.getElementById('user-filtered-total-spent');
    const summaryDebtElem = document.getElementById('user-summary-debt');
    const summarySpentElem = document.getElementById('user-summary-spent');

    if (countElem) countElem.innerText = filtered.length;
    if (totalSpentElem) totalSpentElem.innerText = formatVND(sumSpent) + ' đ';
    if (summaryDebtElem) summaryDebtElem.innerText = formatVND(sumDebt);
    if (summarySpentElem) summarySpentElem.innerText = formatVND(sumSpent);

    const pageSize = window.currentAdminUserPageSize || 15;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    window.currentAdminUserTotalPages = totalPages;

    if (window.currentAdminUserPage > totalPages) window.currentAdminUserPage = totalPages;

    const startIndex = (window.currentAdminUserPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const pageUsers = filtered.slice(startIndex, endIndex);

    renderAdminUserRows(pageUsers, userListTable);

    if (pageInfo) pageInfo.innerText = `${window.currentAdminUserPage} / ${totalPages}`;
    if (countInfo) countInfo.innerText = filtered.length > 0 ? `${startIndex + 1} - ${endIndex} trong ${filtered.length} khách hàng` : '0 khách hàng';

    if (prevBtn) prevBtn.disabled = window.currentAdminUserPage <= 1;
    if (firstBtn) firstBtn.disabled = window.currentAdminUserPage <= 1;
    if (nextBtn) nextBtn.disabled = window.currentAdminUserPage >= totalPages;
    if (lastBtn) lastBtn.disabled = window.currentAdminUserPage >= totalPages;
};

function renderAdminUserRows(usersList, tableElement) {
    let htmlContent = '';
    usersList.forEach((u) => {
        const spent = userTotalSpentLocal[u.id] || u.totalSpent || 0;
        const points = u.points || Math.floor(spent / 100000);
        const tier = getMembershipTier(spent);
        const debt = u.debt || 0;

        const custCode = u.id || 'N/A';
        const custName = u.displayName || u.fullName || u.email || 'Khách vãng lai';
        const phone = formatPhoneNumber(u.phoneNumber || u.phone) || '---';

        const tierBadge = `<span class="stock-badge" style="background:${tier.color}; color:#fff; border:none; padding: 2px 8px; border-radius: 20px; font-weight: 600; font-size: 0.70rem;">${tier.name}</span>`;

        htmlContent += `
            <tr class="product-row user-row" data-user-id="${u.id}" onclick="window.toggleUserQuickView('${u.id}', event)" style="cursor: pointer;">
                <td style="text-align: center; padding: 4px;" onclick="event.stopPropagation();"><input type="checkbox" class="user-chk" value="${u.id}"></td>
                <td style="color: #cbd5e1; padding: 4px;" onclick="event.stopPropagation();">☆</td>
                <td style="white-space: nowrap;"><strong style="color: #0066cc; font-size: 0.74rem; display: inline-block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;" title="${u.id}">${custCode}</strong></td>
                <td>
                    <strong style="color: #0f172a; font-size: 0.76rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${custName}">${custName}</strong>
                </td>
                <td style="color: #475569; font-size: 0.72rem; white-space: nowrap;">${phone}</td>
                <td style="white-space: nowrap;">${tierBadge}</td>
                <td style="text-align: center; font-weight: 700; color: #0284c7; font-size: 0.74rem; white-space: nowrap;">💎 ${points} điểm</td>
                <td style="text-align: right; font-weight: 600; color: #dc2626; font-size: 0.74rem; white-space: nowrap;">${formatVND(debt)}</td>
                <td style="text-align: right; font-weight: 700; color: #0066cc; font-size: 0.74rem; white-space: nowrap;">${formatVND(spent)}</td>
            </tr>
        `;
    });
    tableElement.innerHTML = htmlContent || '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #94a3b8;">Không tìm thấy khách hàng nào.</td></tr>';
}

window.toggleUserQuickView = function (userId, event) {
    if (event) event.stopPropagation();

    const existingDetail = document.getElementById(`user-detail-row-${userId}`);
    const targetRow = document.querySelector(`tr[data-user-id="${userId}"]`);

    if (existingDetail) {
        existingDetail.remove();
        if (targetRow) targetRow.classList.remove('expanded');
        return;
    }

    document.querySelectorAll('.kiot-detail-row').forEach(row => row.remove());
    document.querySelectorAll('.user-row').forEach(row => row.classList.remove('expanded'));

    const u = posUsersLocal.find(user => user.id === userId);
    if (!u || !targetRow) return;

    targetRow.classList.add('expanded');

    const spent = userTotalSpentLocal[userId] || u.totalSpent || 0;
    const points = u.points || Math.floor(spent / 100000);
    const tier = getMembershipTier(spent);
    const orderCount = userOrderCounts[userId] || 0;

    const custCode = u.id || 'N/A';
    const custName = u.displayName || u.fullName || u.email || 'Khách vãng lai';
    const phone = formatPhoneNumber(u.phoneNumber || u.phone) || 'Chưa có SĐT';
    const email = u.email || 'Chưa có email';
    const address = u.address || (u.shippingAddress ? u.shippingAddress.address : 'Chưa có địa chỉ');
    const birthday = u.birthday ? new Date(u.birthday).toLocaleDateString('vi-VN') : 'Chưa có';
    const gender = u.gender || 'Chưa có';
    const createdAt = u.createdAt ? (u.createdAt.toDate ? new Date(u.createdAt.toDate()).toLocaleDateString('vi-VN') : new Date(u.createdAt).toLocaleDateString('vi-VN')) : '07/08/2026';

    const detailRow = document.createElement('tr');
    detailRow.id = `user-detail-row-${userId}`;
    detailRow.className = 'kiot-detail-row';
    detailRow.innerHTML = `
        <td colspan="9" style="padding: 0; background: #ffffff;">
            <div class="kiot-quickview-card" style="border: 2px solid #0066cc; margin: 8px 0; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 102, 204, 0.12);">
                <div class="quickview-tabs">
                    <button type="button" class="qv-tab-item active">Thông tin khách hàng</button>
                </div>

                <div class="quickview-body order-qv-info-body" style="padding: 20px; display: grid; grid-template-columns: 100px 1fr; gap: 20px; align-items: flex-start;">
                    <!-- Left Avatar & Rank Badge -->
                    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;">
                        <div style="width: 80px; height: 80px; border-radius: 50%; background: ${tier.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            ${custName.charAt(0).toUpperCase()}
                        </div>
                        <span class="stock-badge" style="background:${tier.color}; color:#fff; border:none; padding: 3px 10px; border-radius: 20px; font-weight: 700; font-size: 0.75rem;">${tier.name}</span>
                    </div>

                    <!-- Right Metadata -->
                    <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem; color: #334155;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                            <div>
                                <strong style="font-size: 1.1rem; color: #0066cc;">${custName}</strong>
                                <span style="font-size: 0.85rem; color: #64748b; margin-left: 10px;">${custCode}</span>
                            </div>
                            <div style="font-size: 0.82rem; color: #64748b;">Tạo ngày: <strong>${createdAt}</strong></div>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                            <div><span style="color: #64748b;">Điện thoại:</span> <strong>${phone}</strong></div>
                            <div><span style="color: #64748b;">Sinh nhật:</span> <strong>${birthday}</strong></div>
                            <div><span style="color: #64748b;">Giới tính:</span> <strong>${gender}</strong></div>
                            <div><span style="color: #64748b;">Email:</span> <strong>${email}</strong></div>
                            <div><span style="color: #64748b;">Địa chỉ:</span> <strong>${address}</strong></div>
                            <div><span style="color: #64748b;">Facebook:</span> <span>Chưa có</span></div>
                        </div>

                        <div style="background: #f0f7ff; padding: 10px 14px; border-radius: 6px; border: 1px solid #bae6fd; display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                            <span>🏆 Hạng Membership: <strong style="color: ${tier.color}; font-size: 0.95rem;">${tier.name}</strong></span>
                            <span>💎 Điểm tích lũy: <strong style="color: #0284c7; font-size: 0.95rem;">${points} điểm</strong></span>
                            <span>🛍️ Đã mua: <strong style="color: #0f172a; font-size: 0.95rem;">${orderCount} đơn</strong></span>
                            <span>💰 Tổng chi tiêu: <strong style="color: #0066cc; font-size: 1rem;">${formatVND(spent)} đ</strong></span>
                        </div>
                    </div>
                </div>

                <div class="quickview-footer" style="padding: 12px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                    <div class="left-actions" style="display: flex; gap: 10px;">
                        <button type="button" class="qv-btn-text red" onclick="event.stopPropagation(); window.deleteUser('${userId}')">🗑️ Xóa khách hàng</button>
                    </div>
                    <div class="right-actions" style="display: flex; align-items: center; gap: 10px;">
                        <button type="button" class="kiot-btn-primary" onclick="event.stopPropagation(); window.viewAdminUserDetail('${userId}')">✏️ Chỉnh sửa hồ sơ</button>
                        <button type="button" class="kiot-btn-outline" onclick="event.stopPropagation(); window.viewUserOrders('${userId}')">📜 Xem đơn hàng (${orderCount})</button>
                    </div>
                </div>
            </div>
        </td>
    `;

    targetRow.parentNode.insertBefore(detailRow, targetRow.nextSibling);
};

// Hàm xem chi tiết và sửa thông tin người dùng
window.viewAdminUserDetail = async (uid) => {
    const user = posUsersLocal.find(u => u.id === uid);
    if (!user) return;

    const spent = userTotalSpentLocal[uid] || 0;
    const tier = getMembershipTier(spent);
    const count = userOrderCounts[uid] || 0;

    let modal = document.getElementById('user-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'user-detail-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
            <h3 style="margin-bottom: 1.5rem; font-family: var(--font-serif);">Hồ sơ khách hàng</h3>
            
            <div style="background: #fcfbf8; padding: 20px; border-radius: 12px; border: 1px solid #eee; margin-bottom: 20px; display: flex; align-items: center; gap: 20px;">
                <div style="background: ${tier.color}; color: #fff; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tier.icon}</svg>
                </div>
                <div>
                    <div style="font-weight: 700; color: ${tier.color}; font-size: 1.1rem;">${tier.name}</div>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">Tổng chi tiêu: <strong>${new Intl.NumberFormat('vi-VN').format(spent)} VND</strong></div>
                    <div style="font-size: 0.85rem; color: #666;">Số đơn hoàn thành: <strong>${count} đơn</strong></div>
                </div>
            </div>

            <form id="admin-user-edit-form">
                <input type="hidden" id="edit-user-uid" value="${uid}">
                <div class="form-group">
                    <label>Họ và tên</label>
                    <input type="text" id="edit-user-name" value="${user.displayName || ''}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Số điện thoại</label>
                        <input type="tel" id="edit-user-phone" value="${user.phone || ''}">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="edit-user-email" value="${user.email || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Giới tính</label>
                        <select id="edit-user-gender">
                            <option value="">Chưa chọn</option>
                            <option value="Nam" ${user.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                            <option value="Nữ" ${user.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                            <option value="Khác" ${user.gender === 'Khác' ? 'selected' : ''}>Khác</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Ngày sinh</label>
                        <input type="date" id="edit-user-birthday" value="${user.birthday || ''}">
                    </div>
                </div>
                <button type="submit" class="btn-dark" style="width: 100%; margin-top: 10px;">Lưu thay đổi hồ sơ</button>
            </form>
        </div>
    `;
    modal.classList.add('active');

    document.getElementById('admin-user-edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const uid = document.getElementById('edit-user-uid').value;
        const name = document.getElementById('edit-user-name').value.trim();
        const phone = formatPhoneNumber(document.getElementById('edit-user-phone').value.trim());
        const email = document.getElementById('edit-user-email').value.trim();
        const gender = document.getElementById('edit-user-gender').value;
        const birthday = document.getElementById('edit-user-birthday').value;
        const btn = e.target.querySelector('button');

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span> Đang cập nhật...';

            const phone84 = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;
            const identifiers = [phone, phone84];
            if (email) identifiers.push(email);

            await updateDoc(doc(db, "users", uid), {
                displayName: name, phone, email, gender, birthday,
                identifiers: identifiers,
                updatedAt: new Date().toISOString()
            });

            showToast("Đã cập nhật thông tin khách hàng thành công!");
            modal.classList.remove('active');
        } catch (err) {
            showToast("Lỗi cập nhật: " + err.message, "error");
            btn.disabled = false;
            btn.innerText = "Lưu thay đổi hồ sơ";
        }
    };
};

// Lắng nghe tất cả đơn hàng để đếm số lượng đơn của từng khách hàng (phục vụ POS)
function initUserOrderCountListener() {
    if (!db) return;
    // Lắng nghe toàn bộ collection orders để duy trì bộ đếm thời gian thực
    onSnapshot(collection(db, "orders"), (snapshot) => {
        const counts = {};
        const spent = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const userId = data.userId;
            // Bỏ qua đơn khách vãng lai nếu cần, hoặc đếm theo SĐT nếu muốn phức tạp hơn
            if (userId && userId !== 'guest') {
                counts[userId] = (counts[userId] || 0) + 1;
                if (data.status === "Đã hoàn thành") {
                    spent[userId] = (spent[userId] || 0) + (data.totalAmount || 0);
                }
            }
        });
        userOrderCounts = counts;
        userTotalSpentLocal = spent;
    });
}

// Hàm thêm/gỡ quyền Admin trực tiếp từ danh sách người dùng
window.toggleAdminPrivilege = async (uid, shouldBeAdmin, identifier = '') => {
    const actionText = shouldBeAdmin ? 'GÁN' : 'GỠ';
    if (!confirm(`Bạn có chắc chắn muốn ${actionText} quyền Quản trị viên cho tài khoản này?`)) return;

    try {
        const adminRef = doc(db, "admins", uid);
        if (shouldBeAdmin) {
            const role = prompt("Nhập vai trò (super_admin: Toàn quyền, staff: Nhân viên):", "staff");
            if (!role || !['super_admin', 'staff'].includes(role)) {
                showToast("Quyền hạn không hợp lệ", "error");
                return;
            }
            // Thêm vào danh sách Admin với quyền mặc định của Role đó
            await setDoc(adminRef, {
                email: identifier,
                role: role,
                permissions: role === 'super_admin' ? ALL_SECTIONS.map(s => s.id) : (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['staff']),
                assignedAt: serverTimestamp(),
                assignedBy: auth.currentUser.uid
            });
            showToast("Đã cấp quyền Quản trị viên thành công!");
        } else {
            // Ngăn chặn việc tự gỡ quyền của chính mình để tránh bị lock out
            if (uid === auth.currentUser.uid) {
                return showToast("Bạn không thể tự gỡ quyền Quản trị viên của chính mình!", "error");
            }
            await deleteDoc(adminRef);
            showToast("Đã gỡ quyền Quản trị viên.");
        }
    } catch (e) {
        showToast("Lỗi phân quyền: " + e.message, "error");
    }
};

// --- Logic Quản lý Tài khoản Quản trị/Nhân sự (Internal) ---
function initAdminAccountListener() {
    const listTable = document.getElementById('admin-staff-list');
    if (!listTable || !db) return;

    // Thêm nút tạo nhân viên ở đầu bảng "Quản trị viên"
    const headerActions = document.querySelector('#admin-account-section .header-actions');
    if (headerActions && !document.getElementById('btn-open-create-staff-admin-tab')) {
        const btn = document.createElement('button');
        btn.id = 'btn-open-create-staff-admin-tab';
        btn.className = 'btn-dark';
        btn.style.marginTop = '0';
        btn.innerHTML = '+ Tạo tài khoản nhân viên';
        btn.onclick = window.showCreateStaffModal;
        headerActions.appendChild(btn);
    }

    onSnapshot(collection(db, "admins"), async (snapshot) => {
        const roleNames = { super_admin: 'Quản trị tối cao', staff: 'Nhân viên' };
        let htmlContent = '';

        // Sử dụng Promise.all để lấy thông tin user đồng thời cho nhanh
        const adminRows = await Promise.all(snapshot.docs.map(async (adminDoc) => {
            const a = adminDoc.data();
            const uid = adminDoc.id;

            // Lấy thêm tên hiển thị từ collection users
            const userSnap = await getDoc(doc(db, "users", uid));
            const u = userSnap.exists() ? userSnap.data() : {};

            const isLocked = a.isLocked || false;
            const statusBadge = isLocked
                ? `<span class="stock-badge stock-out" style="text-transform:none; padding:4px 8px;">Đã khóa</span>`
                : `<span class="stock-badge" style="background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9; text-transform:none; padding:4px 8px;">Hoạt động</span>`;

            const permsCount = a.permissions ? a.permissions.length : 0;

            return `
                <tr>
                    <td data-label="Thông tin">
                        <strong>${u.displayName || a.email || 'Thành viên mới'}</strong><br>
                        <small style="color: #888;">${a.email || 'Không có email'}</small>
                    </td>
                    <td data-label="Vai trò">
                        <span style="font-weight:600; color:var(--text-black);">${roleNames[a.role] || 'Nhân viên'}</span>
                    </td>
                    <td data-label="Quyền hạn">
                        <small>${permsCount}/${ALL_SECTIONS.length} chức năng</small>
                    </td>
                    <td data-label="Trạng thái">${statusBadge}</td>
                    <td data-label="Thao tác" style="display: flex; gap: 5px; justify-content: flex-end;">
                        <button class="btn-minimal" style="font-size: 0.7rem; border-color: #3498db; color: #3498db;" onclick="window.editAdminPermissions('${uid}', '${a.email}')">Quyền</button>
                        <button class="btn-minimal" style="font-size: 0.7rem; border-color: ${isLocked ? '#27ae60' : '#f39c12'}; color: ${isLocked ? '#27ae60' : '#f39c12'};" 
                            onclick="window.toggleAccountLock('${uid}', ${!isLocked})">
                            ${isLocked ? 'Mở khóa' : 'Khóa'}
                        </button>
                        ${uid !== auth.currentUser.uid ? `<button class="btn-delete" style="font-size:0.7rem;" onclick="window.toggleAdminPrivilege('${uid}', false)">Gỡ</button>` : ''}
                    </td>
                </tr>
            `;
        }));

        listTable.innerHTML = adminRows.join('') || '<tr><td colspan="5" style="text-align:center;">Chưa có tài khoản quản trị nào.</td></tr>';
    }, (error) => {
        console.error("Admin list listener error:", error);
    });
}

// Hàm khóa/mở khóa tài khoản nhân viên
window.toggleAccountLock = async (uid, shouldLock) => {
    const action = shouldLock ? "KHÓA" : "MỞ KHÓA";
    if (!confirm(`Bạn có chắc chắn muốn ${action} tài khoản này? Nhân viên sẽ không thể vào trang quản trị.`)) return;

    try {
        await updateDoc(doc(db, "admins", uid), { isLocked: shouldLock });
        showToast(`Đã ${action} tài khoản thành công`);
        initUserListener(); // Refresh list
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    }
};

// Hàm hiển thị Modal tạo tài khoản nhân viên mới
window.showCreateStaffModal = () => {
    let modal = document.getElementById('create-staff-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-staff-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
            <h3>Tạo tài khoản nhân viên</h3>
            <p style="font-size: 0.8rem; color: #666; margin-bottom: 1.5rem;">Cấp tài khoản nội bộ cho nhân viên Tiệm.</p>
            <form id="create-staff-form">
                <div class="form-group">
                    <label>Họ tên nhân viên</label>
                    <input type="text" id="staff-new-name" placeholder="VD: Nguyễn Văn A" required>
                </div>
                <div class="form-group">
                    <label>Email đăng nhập</label>
                    <input type="email" id="staff-new-email" placeholder="nhanvien@tiemnhagom.com" required>
                </div>
                <div class="form-group">
                    <label>Mật khẩu tạm thời</label>
                    <input type="password" id="staff-new-password" placeholder="Tối thiểu 6 ký tự" required minlength="6">
                </div>
                <button type="submit" class="btn-dark" style="width: 100%; margin-top: 1rem;">Khởi tạo tài khoản</button>
            </form>
        </div>
    `;
    modal.classList.add('active');

    document.getElementById('create-staff-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('staff-new-name').value.trim();
        const email = document.getElementById('staff-new-email').value.trim();
        const password = document.getElementById('staff-new-password').value;
        const btn = e.target.querySelector('button');

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span> Đang tạo...';

            // Sử dụng Firebase App phụ để tạo user mà không làm Admin hiện tại bị logout
            const secondaryApp = initializeApp(auth.app.options, "Secondary");
            const secondaryAuth = auth.app.options ? onAuthStateChanged(auth, () => { }) : null; // Dùng Auth của instance mới
            // (Lưu ý: createUserWithEmailAndPassword yêu cầu auth instance)
            const { getAuth } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
            const tempAuth = getAuth(secondaryApp);

            const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
            const newUid = userCredential.user.uid;

            // Tạo bản ghi User và Admin đồng thời
            await setDoc(doc(db, "users", newUid), {
                displayName: name,
                email: email,
                createdAt: serverTimestamp(),
                isGhost: false
            });

            await setDoc(doc(db, "admins", newUid), {
                email: email,
                role: 'staff',
                permissions: ROLE_PERMISSIONS['staff'],
                assignedAt: serverTimestamp(),
                isLocked: false
            });

            showToast("Đã tạo tài khoản nhân viên thành công!");
            modal.classList.remove('active');
            // Xóa instance phụ để giải phóng bộ nhớ
            const { deleteApp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js");
            await deleteApp(secondaryApp);
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
            btn.disabled = false;
            btn.innerText = "Khởi tạo tài khoản";
        }
    };
};

// Hàm mở Modal cấu hình quyền chi tiết cho từng nhân viên
window.editAdminPermissions = async (uid, email) => {
    try {
        const adminSnap = await getDoc(doc(db, "admins", uid));
        if (!adminSnap.exists()) return;

        const adminData = adminSnap.data();
        const userPerms = adminData.permissions || [];

        let modal = document.getElementById('permissions-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'permissions-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                <h3>Cấu hình chức năng</h3>
                <p style="font-size: 0.85rem; color: #666; margin-bottom: 1.5rem;">Tài khoản: <strong>${email}</strong></p>
                <form id="perms-edit-form">
                    <div style="display: grid; gap: 12px; margin-bottom: 2rem;">
                        ${ALL_SECTIONS.map(s => `
                            <label class="checkbox-container" style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 5px 0;">
                                <input type="checkbox" name="perm" value="${s.id}" ${userPerms.includes(s.id) ? 'checked' : ''}>
                                <span class="checkmark" style="position: static; flex-shrink: 0;"></span>
                                <span style="font-size: 0.95rem;">${s.label}</span>
                            </label>
                        `).join('')}
                    </div>
                    <button type="submit" class="btn-dark" style="width: 100%;">Cập nhật quyền hạn</button>
                </form>
            </div>
        `;
        modal.classList.add('active');

        document.getElementById('perms-edit-form').onsubmit = async (e) => {
            e.preventDefault();
            const selected = Array.from(e.target.querySelectorAll('input[name="perm"]:checked')).map(cb => cb.value);
            await updateDoc(doc(db, "admins", uid), { permissions: selected });
            showToast("Đã cập nhật quyền hạn nhân viên");
            modal.classList.remove('active');
        };
    } catch (e) { console.error(e); }
};

let editingCouponCode = null;

function initCouponListener() {
    const list = document.getElementById('admin-coupon-list');
    if (!list || !db) return;

    onSnapshot(collection(db, "coupons"), (snapshot) => {
        list.innerHTML = snapshot.docs.map(doc => {
            const c = doc.data();
            const usage = c.limit > 0 ? `${c.usedCount || 0} / ${c.limit}` : `${c.usedCount || 0} / ∞`;
            const expiry = c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('vi-VN') : 'Vô thời hạn';
            const maxDiscountText = c.type === 'percent' ? (c.maxDiscount ? new Intl.NumberFormat('vi-VN').format(c.maxDiscount) + ' VND' : 'Không giới hạn') : 'N/A';
            const categoryText = c.category === 'all' || !c.category ? 'Tất cả' : c.category;
            return `
                <tr>
                    <td><strong>${doc.id}</strong></td>
                    <td>${c.name || 'Chưa đặt tên'}</td>
                    <td>${c.type === 'percent' ? 'Phần trăm' : 'Cố định'}</td>
                    <td>${c.type === 'percent' ? c.value + '%' : new Intl.NumberFormat('vi-VN').format(c.value) + ' VND'}</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(c.minOrder)} VND</td>
                    <td>${maxDiscountText}</td>
                    <td><span class="category-tag-small" style="background:#eef2f5; padding:3px 6px; border-radius:4px; font-size:0.75rem;">${categoryText}</span></td>
                    <td>${usage}</td>
                    <td>${expiry}</td>
                    <td>
                        <button class="btn-outline" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 4px; border-color: #2c3e50; color: #2c3e50; margin-right: 5px; height: auto;" onclick="window.editCoupon('${doc.id}')">Sửa</button>
                        <button class="btn-delete" onclick="window.deleteCoupon('${doc.id}')">Xóa</button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="10" style="text-align:center;">Chưa có mã giảm giá nào.</td></tr>';
    }, (error) => {
        console.error("Coupon listener error:", error);
    });
}

window.deleteCoupon = async (code) => {
    if (confirm(`Bạn có muốn xóa mã giảm giá ${code}?`)) {
        try {
            await deleteDoc(doc(db, "coupons", code));
            showToast(`Đã xóa mã ${code}`);
            if (editingCouponCode === code) window.cancelCouponEdit();
        } catch (e) { showToast("Lỗi xóa mã: " + e.message, "error"); }
    }
};

window.editCoupon = async (code) => {
    try {
        const couponRef = doc(db, "coupons", code);
        const couponSnap = await getDoc(couponRef);
        if (couponSnap.exists()) {
            const c = couponSnap.data();
            editingCouponCode = code;

            // Điền dữ liệu vào form
            document.getElementById('coupon-code').value = code;
            document.getElementById('coupon-code').disabled = true;
            document.getElementById('coupon-name').value = c.name || '';
            document.getElementById('coupon-type').value = c.type;
            document.getElementById('coupon-value').value = window.formatCurrencyDisplay(c.value);
            document.getElementById('coupon-max-discount').value = window.formatCurrencyDisplay(c.maxDiscount || 0);
            document.getElementById('coupon-min-order').value = c.minOrder || 0;
            document.getElementById('coupon-limit').value = c.limit || 0;
            document.getElementById('coupon-expiry').value = c.expiryDate || '';
            document.getElementById('coupon-category').value = c.category || 'all';
            document.getElementById('coupon-conditions').value = c.conditions || '';

            // Cập nhật giao diện
            const title = document.querySelector('#coupon-section h3');
            if (title) title.innerText = `Chỉnh sửa mã giảm giá: ${code}`;

            const submitBtn = document.querySelector('#coupon-form button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerText = "Cập nhật mã giảm giá";
            }

            // Thêm nút Hủy sửa
            let cancelBtn = document.getElementById('btn-cancel-coupon-edit');
            if (!cancelBtn) {
                cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.id = 'btn-cancel-coupon-edit';
                cancelBtn.className = 'btn-minimal';
                cancelBtn.innerText = 'Hủy chỉnh sửa';
                cancelBtn.style.width = '100%';
                cancelBtn.style.marginTop = '10px';
                cancelBtn.onclick = window.cancelCouponEdit;
                submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
            }

            document.getElementById('coupon-form').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (e) {
        showToast("Lỗi tải thông tin mã giảm giá: " + e.message, "error");
    }
};

window.cancelCouponEdit = () => {
    editingCouponCode = null;
    const form = document.getElementById('coupon-form');
    if (form) form.reset();

    document.getElementById('coupon-code').disabled = false;

    const title = document.querySelector('#coupon-section h3');
    if (title) title.innerText = "Thêm mã giảm giá mới";

    const submitBtn = document.querySelector('#coupon-form button[type="submit"]');
    if (submitBtn) submitBtn.innerText = "Lưu mã giảm giá";

    const cancelBtn = document.getElementById('btn-cancel-coupon-edit');
    if (cancelBtn) cancelBtn.remove();
};

const couponForm = document.getElementById('coupon-form');
if (couponForm) {
    couponForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('coupon-code').value.trim().toUpperCase();
        const name = document.getElementById('coupon-name').value.trim();
        const type = document.getElementById('coupon-type').value;
        const value = window.getCurrencyValue('coupon-value');
        const maxDiscount = window.getCurrencyValue('coupon-max-discount');
        const minOrder = Number(document.getElementById('coupon-min-order').value || 0);
        const usageLimit = Number(document.getElementById('coupon-limit').value || 0);
        const expiryDate = document.getElementById('coupon-expiry').value; // YYYY-MM-DD
        const category = document.getElementById('coupon-category').value;
        const conditions = document.getElementById('coupon-conditions').value.trim();

        try {
            if (editingCouponCode) {
                const couponRef = doc(db, "coupons", editingCouponCode);
                await updateDoc(couponRef, {
                    name,
                    type,
                    value,
                    maxDiscount,
                    minOrder,
                    limit: usageLimit,
                    expiryDate,
                    category,
                    conditions
                });
                showToast(`Đã cập nhật mã giảm giá: ${editingCouponCode}`);
                window.cancelCouponEdit();
            } else {
                await setDoc(doc(db, "coupons", code), {
                    name,
                    type,
                    value,
                    maxDiscount,
                    minOrder,
                    limit: usageLimit,
                    usedCount: 0,
                    expiryDate,
                    category,
                    conditions,
                    createdAt: new Date().toISOString()
                });
                showToast(`Đã tạo thành công mã giảm giá: ${code}`);
                couponForm.reset();
            }
        } catch (error) {
            showToast("Lỗi lưu dữ liệu: " + error.message, "error");
        }
    });
}

window.viewUserOrders = (userId) => {
    // Chuyển sang tab đơn hàng
    const orderTabBtn = document.querySelector('.admin-tab-btn[data-target="order-section"]');
    if (orderTabBtn) {
        orderTabBtn.click();

        // Đợi một chút để UI chuyển tab rồi thực hiện lọc
        setTimeout(async () => {
            const orderListTable = document.getElementById('admin-order-list');
            if (!orderListTable) return;

            showToast(`Đang lọc đơn hàng của User: ${userId}`, "info");
            // Ở đây ta gọi lại listener của order nhưng thêm filter userId
            // Lưu ý: Cần cập nhật hàm initOrderListener để nhận thêm filter userId
            initOrderListener('', 'all', 'init', userId);
        }, 100);
    }
};

// --- Logic POS (Bán tại shop) Redesign ---
window.posBills = [];
window.currentBillId = null;

window.initPOSBills = () => {
    const saved = localStorage.getItem('posBills');
    const savedCurrentId = localStorage.getItem('posCurrentBillId');
    if (saved) {
        try {
            window.posBills = JSON.parse(saved);
            if (window.posBills.length > 0) {
                const found = window.posBills.find(b => b.id === savedCurrentId);
                window.currentBillId = found ? found.id : window.posBills[0].id;
            }
        } catch (e) {
            window.posBills = [];
        }
    }
    if (!window.posBills || window.posBills.length === 0) {
        window.posCreateNewBill();
    } else {
        renderPOSTabs();
        renderPOSCart();
    }
};

window.savePOSBills = () => {
    const noteInput = document.getElementById('pos-order-note');
    const bill = window.getCurrentBill();
    if (bill && noteInput) {
        bill.note = noteInput.value;
    }
    localStorage.setItem('posBills', JSON.stringify(window.posBills));
    if (window.currentBillId) {
        localStorage.setItem('posCurrentBillId', window.currentBillId);
    }
};

window.getCurrentBill = () => {
    return window.posBills.find(b => b.id === window.currentBillId);
};

window.posCreateNewBill = () => {
    const newId = 'bill_' + Date.now();
    const count = window.posBills.length + 1;
    window.posBills.push({
        id: newId,
        name: 'Hóa đơn ' + count,
        cart: [],
        customerId: null,
        customerName: '',
        customerPhone: '',
        discountVal: 0, // Giá trị discount tổng (VND)
        paymentMethod: 'Tiền mặt',
        cashGiven: ''
    });
    window.currentBillId = newId;
    window.savePOSBills();
    renderPOSTabs();
    renderPOSCart();
};

window.posSwitchBill = (id) => {
    window.currentBillId = id;
    renderPOSTabs();
    renderPOSCart();
};

window.posCloseBill = (id, event) => {
    if (event) event.stopPropagation();
    window.posBills = window.posBills.filter(b => b.id !== id);
    if (window.posBills.length === 0) {
        window.posCreateNewBill();
    } else if (window.currentBillId === id) {
        window.currentBillId = window.posBills[0].id;
    }
    window.savePOSBills();
    renderPOSTabs();
    renderPOSCart();
};

window.posClearCustomer = () => {
    const bill = window.getCurrentBill();
    if (bill) {
        bill.customerId = null;
        bill.customerName = '';
        bill.customerPhone = '';
        window.savePOSBills();
        renderPOSCart();
    }
};

function formatVND(num) {
    if (!num || isNaN(num)) return '0';
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
}

function parseVND(str) {
    if (!str) return 0;
    const raw = String(str).replace(/,/g, '').replace(/\./g, '').replace(/[^\d]/g, '');
    return parseFloat(raw) || 0;
}

function renderPOSTabs() {
    const container = document.getElementById('pos-tabs-list');
    if (!container) return;
    container.innerHTML = window.posBills.map(bill => `
        <button class="pos-tab ${bill.id === window.currentBillId ? 'active' : ''}" onclick="window.posSwitchBill('${bill.id}')">
            <span>⇄ ${bill.name}</span>
            <span class="close-btn" onclick="window.posCloseBill('${bill.id}', event)" title="Đóng hóa đơn">&times;</span>
        </button>
    `).join('');
}

function renderPOSCart() {
    const bill = window.getCurrentBill();
    if (!bill) return;

    // Render cart items
    const list = document.getElementById('pos-cart-list');
    if (list) {
        if (bill.cart.length === 0) {
            list.innerHTML = '<p style="color: #999; font-size: 0.9rem; text-align: center; margin-top: 2rem;">Chưa có sản phẩm nào được chọn.</p>';
        } else {
            list.innerHTML = bill.cart.map((item, index) => {
                const sellingPrice = item.price - (item.discount || 0);
                const lineTotal = sellingPrice * item.quantity;
                const origPriceText = formatVND(item.price);
                const isDiscounted = (item.discount || 0) > 0;

                return `
                <div class="pos-item-row" style="display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px dashed #e2e8f0; font-size: 0.88rem;">
                    <div class="pos-item-idx" style="width: 20px; color: #64748b; font-size: 0.8rem; text-align: center;">${index + 1}</div>
                    <button class="pos-item-del" onclick="window.removePOSItem(${index})" style="border: none; background: transparent; color: #94a3b8; cursor: pointer; padding: 2px;" title="Xóa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    <div class="pos-item-sku" style="color: #0066cc; font-weight: 600; font-size: 0.8rem; width: 75px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.id}</div>
                    <div class="pos-item-name" style="flex: 1; font-weight: 500; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name} ${item.color ? `(${item.color})` : ''}</div>
                    
                    <!-- Stepper +- cho số lượng dạng pill mềm mại -->
                    <div class="pos-item-qty-stepper" style="display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 20px; background: #f8fafc; height: 28px; padding: 0 2px; transition: all 0.15s ease;">
                        <button type="button" class="qty-btn minus" onclick="event.stopPropagation(); window.stepPOSQty(${index}, -1)" style="border: none; background: #ffffff; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-weight: bold; color: #475569; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.15s ease;">-</button>
                        <input type="number" value="${item.quantity}" min="1" onchange="window.changePOSQtyInput(${index}, this.value)" style="width: 32px; border: none; background: transparent; text-align: center; outline: none; font-size: 0.88rem; font-weight: 700; color: #0f172a; -moz-appearance: textfield;">
                        <button type="button" class="qty-btn plus" onclick="event.stopPropagation(); window.stepPOSQty(${index}, 1)" style="border: none; background: #ffffff; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-weight: bold; color: #475569; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.15s ease;">+</button>
                    </div>

                    <!-- Giá bán & giảm giá -->
                    <div class="pos-item-price" onclick="window.posShowDiscountPopover(${index}, this, event)" style="cursor: pointer; text-align: right; min-width: 85px; padding: 3px 6px; border-radius: 6px; transition: background 0.15s ease;" title="Bấm để sửa đơn giá / giảm giá / giá bán">
                        ${isDiscounted ? `<span style="text-decoration: line-through; color: #94a3b8; font-size: 0.75rem; display: block;">${origPriceText}</span><span style="color: #dc2626; background: #fef2f2; border-radius: 4px; padding: 1px 4px; font-size: 0.72rem; font-weight: 600; display: inline-block; margin-bottom: 2px;">-${formatVND(item.discount)}</span>` : ''}
                        <span style="font-weight: 700; color: #0f172a; display: block;">${formatVND(sellingPrice)}</span>
                    </div>

                    <!-- Thành tiền -->
                    <div class="pos-item-total" style="font-weight: 700; color: #0f172a; text-align: right; min-width: 90px;">${formatVND(lineTotal)}</div>
                    <div><button class="pos-icon-btn" onclick="window.posShowDiscountPopover(${index}, this, event)" style="color: #64748b; background: none; border: none; cursor: pointer; padding: 2px;" title="Chỉnh sửa đơn giá / giảm giá"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button></div>
                </div>`;
            }).join('');
        }
    }

    // Render customer info
    const custSearchBox = document.querySelector('.pos-customer-search-box');
    const custSelected = document.getElementById('pos-selected-customer');
    if (custSearchBox && custSelected) {
        if (bill.customerId) {
            custSearchBox.style.display = 'none';
            custSelected.style.display = 'flex';
            document.getElementById('pos-cust-name-display').innerText = bill.customerName;
            document.getElementById('pos-cust-phone-display').innerText = bill.customerPhone;
        } else {
            custSearchBox.style.display = 'flex';
            custSelected.style.display = 'none';
        }
    }

    // Render summary
    const subtotal = bill.cart.reduce((sum, i) => sum + ((i.price - (i.discount || 0)) * i.quantity), 0);
    const totalQty = bill.cart.reduce((sum, i) => sum + i.quantity, 0);
    const discountVal = bill.discountVal || 0;
    const finalTotal = Math.max(0, subtotal - discountVal);

    document.getElementById('pos-total-qty').innerText = `(${totalQty})`;
    document.getElementById('pos-subtotal').innerText = formatVND(subtotal);
    document.getElementById('pos-bill-discount-input').value = discountVal > 0 ? formatVND(discountVal) : '';

    const totalEl = document.getElementById('pos-total-amount');
    if (totalEl) {
        totalEl.innerText = formatVND(finalTotal);
        totalEl.dataset.val = finalTotal;
    }

    // Payment methods
    document.querySelectorAll('input[name="pos-payment"]').forEach(r => {
        r.checked = (r.value === bill.paymentMethod);
    });

    const cashGivenInput = document.getElementById('pos-cash-given');
    if (cashGivenInput) {
        cashGivenInput.value = bill.cashGiven ? formatVND(bill.cashGiven) : '';
    }

    window.togglePOSCashSection();
}

window.stepPOSQty = (index, delta) => {
    const bill = window.getCurrentBill();
    if (bill && bill.cart[index]) {
        let newQty = (bill.cart[index].quantity || 1) + delta;
        if (newQty < 1) newQty = 1;
        bill.cart[index].quantity = newQty;
        window.savePOSBills();
        renderPOSCart();
    }
};

window.changePOSQtyInput = (index, value) => {
    const bill = window.getCurrentBill();
    if (bill && bill.cart[index]) {
        let val = parseInt(value, 10);
        if (isNaN(val) || val < 1) val = 1;
        bill.cart[index].quantity = val;
        window.savePOSBills();
        renderPOSCart();
    }
};

window.removePOSItem = (index) => {
    const bill = window.getCurrentBill();
    if (bill) {
        bill.cart.splice(index, 1);
        window.savePOSBills();
        renderPOSCart();
    }
};

window.updateBillDiscount = (val) => {
    const bill = window.getCurrentBill();
    if (bill) {
        bill.discountVal = parseVND(val);
        window.savePOSBills();
        renderPOSCart();
    }
};

window.togglePOSCashSection = () => {
    const bill = window.getCurrentBill();
    if (!bill) return;

    const fastCash = document.getElementById('pos-fast-cash-container');
    const returnRow = document.getElementById('pos-return-row');
    const cashGivenInput = document.getElementById('pos-cash-given');
    const isCash = (bill.paymentMethod === 'Tiền mặt');

    if (fastCash) fastCash.style.display = isCash ? 'grid' : 'none';
    if (cashGivenInput) cashGivenInput.disabled = !isCash;

    if (!isCash) {
        bill.cashGiven = '';
        if (returnRow) returnRow.style.display = 'none';
        if (cashGivenInput) cashGivenInput.value = '';
    } else {
        window.calculatePOSChange();
    }

    // Update state based on radio change
    const checkedRadio = document.querySelector('input[name="pos-payment"]:checked');
    if (checkedRadio && checkedRadio.value !== bill.paymentMethod) {
        bill.paymentMethod = checkedRadio.value;
        window.savePOSBills();
        renderPOSCart();
    }
};

window.posSetCashGiven = (amount) => {
    const bill = window.getCurrentBill();
    if (bill) {
        bill.cashGiven = amount;
        window.savePOSBills();
        renderPOSCart();
    }
};

window.calculatePOSChange = (inputElem) => {
    const bill = window.getCurrentBill();
    if (!bill) return;

    const input = inputElem || document.getElementById('pos-cash-given');
    if (!input) return;

    let rawValue = input.value.replace(/,/g, '').replace(/\./g, '').replace(/[^\d]/g, '');
    if (rawValue && inputElem) {
        input.value = formatVND(rawValue);
    } else if (!rawValue && inputElem) {
        input.value = '';
    }

    const cash = parseFloat(rawValue) || 0;
    if (inputElem) {
        bill.cashGiven = cash;
        window.savePOSBills();
    }

    const total = parseFloat(document.getElementById('pos-total-amount')?.dataset?.val || 0);
    const returnRow = document.getElementById('pos-return-row');
    const changeInput = document.getElementById('pos-change-amount');

    if (changeInput && returnRow) {
        if (bill.cashGiven >= total && total > 0) {
            returnRow.style.display = 'flex';
            changeInput.innerText = formatVND(bill.cashGiven - total);
        } else {
            returnRow.style.display = 'none';
        }
    }
};

// Popover Logic
let currentPopoverIndex = -1;

window.posShowDiscountPopover = (index, element, event) => {
    if (event) event.stopPropagation();
    const bill = window.getCurrentBill();
    if (!bill || !bill.cart[index]) return;

    currentPopoverIndex = index;
    const item = bill.cart[index];

    let popover = document.getElementById('pos-discount-popover');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'pos-discount-popover';
        popover.className = 'pos-popover';
        popover.innerHTML = `
            <div class="pos-popover-row">
                <label>Đơn giá</label>
                <input type="text" id="pos-popover-price-input" class="pos-pop-input" oninput="window.posOnUnitPriceChange(this.value)">
            </div>
            <div class="pos-popover-row">
                <label>Giảm giá</label>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="text" id="pos-popover-discount" class="pos-pop-input" oninput="window.posOnDiscountChange(this.value)">
                    <div class="pos-discount-type">
                        <button id="pos-type-vnd" class="active" onclick="window.posSetDiscountType('VND')">VND</button>
                        <button id="pos-type-pct" onclick="window.posSetDiscountType('%')">%</button>
                    </div>
                </div>
            </div>
            <div class="pos-popover-row">
                <label>Giá bán</label>
                <input type="text" id="pos-popover-final-input" class="pos-pop-input" style="font-weight: 700; color: #0066cc;" oninput="window.posOnSellingPriceChange(this.value)">
            </div>
            <div id="pos-popover-cost-warning" style="display: none; color: #dc2626; font-size: 0.78rem; margin-top: 4px; font-weight: 600; text-align: right;">
                ⚠️ Giá bán đang nhỏ hơn giá vốn
            </div>
        `;
        document.body.appendChild(popover);

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (popover && !popover.contains(e.target) && !e.target.closest('.pos-item-price') && !e.target.closest('.pos-icon-btn')) {
                popover.style.display = 'none';
            }
        });
    }

    const rect = element.getBoundingClientRect();
    popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    popover.style.left = Math.max(10, (rect.left + window.scrollX - 220 + rect.width)) + 'px';
    popover.style.display = 'flex';

    popover.dataset.type = 'VND';
    document.getElementById('pos-type-vnd').classList.add('active');
    document.getElementById('pos-type-pct').classList.remove('active');

    const priceInput = document.getElementById('pos-popover-price-input');
    const discountInput = document.getElementById('pos-popover-discount');
    const finalInput = document.getElementById('pos-popover-final-input');

    const sellingPrice = item.price - (item.discount || 0);

    priceInput.value = formatVND(item.price);
    discountInput.value = item.discount > 0 ? formatVND(item.discount) : '';
    finalInput.value = formatVND(sellingPrice);

    window.posCheckCostWarning(item, sellingPrice);

    discountInput.focus();
};

window.posSetDiscountType = (type) => {
    const popover = document.getElementById('pos-discount-popover');
    if (!popover) return;
    popover.dataset.type = type;
    document.getElementById('pos-type-vnd').classList.toggle('active', type === 'VND');
    document.getElementById('pos-type-pct').classList.toggle('active', type === '%');

    if (currentPopoverIndex !== -1) {
        const bill = window.getCurrentBill();
        const item = bill.cart[currentPopoverIndex];
        if (item) {
            const discountInput = document.getElementById('pos-popover-discount');
            if (type === '%') {
                const pct = item.price > 0 ? Math.round(((item.discount || 0) / item.price) * 100) : 0;
                discountInput.value = pct > 0 ? pct : '';
            } else {
                discountInput.value = item.discount > 0 ? formatVND(item.discount) : '';
            }
        }
    }
};

window.posOnUnitPriceChange = (val) => {
    if (currentPopoverIndex === -1) return;
    const bill = window.getCurrentBill();
    const item = bill.cart[currentPopoverIndex];
    if (!item) return;

    let unitPrice = parseVND(val);
    item.price = unitPrice;
    document.getElementById('pos-popover-price-input').value = unitPrice > 0 ? formatVND(unitPrice) : '';

    const popover = document.getElementById('pos-discount-popover');
    const type = popover.dataset.type;
    const discountInput = document.getElementById('pos-popover-discount');
    const discountVal = parseVND(discountInput.value);

    let finalDiscount = 0;
    if (type === '%') {
        let pct = discountVal > 100 ? 100 : discountVal;
        finalDiscount = Math.round(unitPrice * (pct / 100));
    } else {
        finalDiscount = Math.min(unitPrice, discountVal);
    }

    item.discount = finalDiscount;
    const sellingPrice = Math.max(0, unitPrice - finalDiscount);
    document.getElementById('pos-popover-final-input').value = formatVND(sellingPrice);

    window.posCheckCostWarning(item, sellingPrice);
    window.savePOSBills();
    renderPOSCart();
};

window.posOnDiscountChange = (val) => {
    if (currentPopoverIndex === -1) return;
    const bill = window.getCurrentBill();
    const item = bill.cart[currentPopoverIndex];
    if (!item) return;

    const popover = document.getElementById('pos-discount-popover');
    const type = popover.dataset.type;
    let num = parseVND(val);

    let finalDiscount = 0;
    if (type === '%') {
        if (num > 100) num = 100;
        document.getElementById('pos-popover-discount').value = num > 0 ? num : '';
        finalDiscount = Math.round(item.price * (num / 100));
    } else {
        if (num > item.price) num = item.price;
        document.getElementById('pos-popover-discount').value = num > 0 ? formatVND(num) : '';
        finalDiscount = num;
    }

    item.discount = finalDiscount;
    const sellingPrice = Math.max(0, item.price - finalDiscount);
    document.getElementById('pos-popover-final-input').value = formatVND(sellingPrice);

    window.posCheckCostWarning(item, sellingPrice);
    window.savePOSBills();
    renderPOSCart();
};

window.posOnSellingPriceChange = (val) => {
    if (currentPopoverIndex === -1) return;
    const bill = window.getCurrentBill();
    const item = bill.cart[currentPopoverIndex];
    if (!item) return;

    let sellingPrice = parseVND(val);
    document.getElementById('pos-popover-final-input').value = sellingPrice > 0 ? formatVND(sellingPrice) : '';

    const popover = document.getElementById('pos-discount-popover');
    const type = popover.dataset.type;

    if (sellingPrice < item.price) {
        const discountVND = item.price - sellingPrice;
        item.discount = discountVND;

        const discountInput = document.getElementById('pos-popover-discount');
        if (type === '%') {
            const pct = Math.round((discountVND / item.price) * 100);
            discountInput.value = pct > 0 ? pct : '';
        } else {
            discountInput.value = formatVND(discountVND);
        }
    } else {
        item.price = sellingPrice;
        item.discount = 0;
        document.getElementById('pos-popover-price-input').value = formatVND(sellingPrice);
        document.getElementById('pos-popover-discount').value = '';
    }

    window.posCheckCostWarning(item, sellingPrice);
    window.savePOSBills();
    renderPOSCart();
};

window.posCheckCostWarning = (item, sellingPrice) => {
    const warningEl = document.getElementById('pos-popover-cost-warning');
    if (warningEl) {
        if (item.cost && item.cost > 0 && sellingPrice < item.cost) {
            warningEl.style.display = 'block';
        } else {
            warningEl.style.display = 'none';
        }
    }
};

window.addToPOSCart = async (id, name, price, image, category = 'khac', color = null, pattern = null) => {
    const bill = window.getCurrentBill();
    if (!bill) return;

    if (typeof showToast !== 'undefined') showToast(`Đã thêm ${name} vào đơn hàng`);

    // Fetch cost if available
    let cost = 0;
    try {
        const docRef = doc ? doc(db, "products", id) : null;
        if (docRef && getDoc) {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                cost = data.cost || 0;
            }
        }
    } catch (e) { }

    const existing = bill.cart.find(i => i.id === id && i.color === color && i.pattern === pattern);
    if (existing) {
        existing.quantity += 1;
    } else {
        bill.cart.push({ id, name, price, cost, image, quantity: 1, category, color, pattern, discount: 0 });
    }

    window.savePOSBills();
    renderPOSCart();

    const searchInput = document.getElementById('pos-product-search');
    if (searchInput) {
        searchInput.value = '';
        const suggestions = document.getElementById('pos-product-suggestions');
        if (suggestions) suggestions.innerHTML = '';
        searchInput.focus();
    }
};

window.searchCustomerPOS = async () => {
    const q = document.getElementById('pos-customer-search')?.value.trim();
    if (!q) return;

    const suggestions = document.getElementById('pos-customer-suggestions');
    if (suggestions) suggestions.innerHTML = '<div class="suggestion-item">Đang tìm...</div>';

    try {
        if (collection && query && where && getDocs) {
            const usersRef = collection(db, "users");
            const qPhone = query(usersRef, where("phone", "==", q));
            let snap = await getDocs(qPhone);

            if (snap.empty) {
                const qName = query(usersRef, where("displayName", ">=", q), where("displayName", "<=", q + "\uf8ff"));
                snap = await getDocs(qName);
            }

            if (!snap.empty) {
                let html = '';
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    html += `
                        <div class="suggestion-item" style="display:flex; justify-content:space-between; align-items:center;" onclick="window.posSelectCustomer('${docSnap.id}', '${data.displayName.replace(/'/g, "\\'")}', '${data.phone}')">
                            <div>
                                <div style="font-weight:bold;">${data.displayName}</div>
                                <div style="font-size:0.8rem; color:#666;">${data.phone}</div>
                            </div>
                            <button class="btn-minimal" style="padding: 2px 8px;">Chọn</button>
                        </div>
                    `;
                });
                if (suggestions) suggestions.innerHTML = html;
            } else {
                if (suggestions) suggestions.innerHTML = '<div class="suggestion-item">Không tìm thấy khách hàng.</div>';
            }
        }
    } catch (e) {
        console.error(e);
        if (suggestions) suggestions.innerHTML = '<div class="suggestion-item">Lỗi tìm kiếm.</div>';
    }
};

window.posSelectCustomer = (id, name, phone) => {
    const bill = window.getCurrentBill();
    if (bill) {
        bill.customerId = id;
        bill.customerName = name;
        bill.customerPhone = phone;
        window.savePOSBills();
        renderPOSCart();
    }
    const suggestions = document.getElementById('pos-customer-suggestions');
    if (suggestions) suggestions.innerHTML = '';
    const searchInput = document.getElementById('pos-customer-search');
    if (searchInput) searchInput.value = '';
};

window.createPOSOrder = async () => {
    const bill = window.getCurrentBill();
    if (!bill) return;

    if (bill.cart.length === 0) {
        if (typeof showToast !== 'undefined') showToast("Đơn hàng trống!", "error");
        return;
    }

    let total = parseFloat(document.getElementById('pos-total-amount')?.dataset?.val || 0);
    const btn = document.querySelector('.pos-btn-complete');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "Đang xử lý...";
    }

    try {
        const orderId = window.generateOrderId ? window.generateOrderId() : 'POS-' + Date.now();
        const paymentMethod = bill.paymentMethod;
        const discountVal = bill.discountVal || 0;

        let customerId = bill.customerId;
        let customerName = bill.customerName;
        let customerPhone = bill.customerPhone;

        // If no customer selected, default to "Khách lẻ"
        if (!customerId) {
            customerName = "Khách mua tại shop";
            customerPhone = "N/A";
            customerId = "guest_pos";
        }

        const subtotal = bill.cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const orderRef = doc ? doc(db, "orders", orderId) : null;

        const orderData = {
            orderId: orderId,
            userId: customerId,
            shippingAddress: { fullName: customerName, phone: customerPhone },
            productNames: bill.cart.map(i => i.name),
            items: bill.cart,
            totalAmount: total,
            subtotal: subtotal,
            discount: discountVal,
            status: "Đã hoàn thành",
            orderDate: serverTimestamp ? serverTimestamp() : new Date(),
            createdAt: serverTimestamp ? serverTimestamp() : new Date(),
            paymentMethod: paymentMethod,
            paymentStatus: "Đã thanh toán",
            source: 'pos'
        };

        if (setDoc) {
            await setDoc(orderRef, orderData);

            // Update inventory
            const updatePromises = bill.cart.map(async (item) => {
                const productRef = doc(db, "products", item.id);
                const pSnap = await getDoc(productRef);
                if (!pSnap.exists()) return;

                const pData = pSnap.data();
                const updateData = { stock: increment(-item.quantity) };

                // Color variant inventory
                if (item.color && pData.colorVariants) {
                    const updatedVariants = pData.colorVariants.map(v => {
                        if (v.name === item.color) {
                            return { ...v, stock: (v.stock || 0) - item.quantity };
                        }
                        return v;
                    });
                    updateData.colorVariants = updatedVariants;
                }
                // Pattern variant inventory
                if (item.pattern && pData.patternVariants) {
                    const updatedVariants = pData.patternVariants.map(v => {
                        if (v.name === item.pattern) {
                            return { ...v, stock: (v.stock || 0) - item.quantity };
                        }
                        return v;
                    });
                    updateData.patternVariants = updatedVariants;
                }
                return updateDoc(productRef, updateData);
            });
            await Promise.all(updatePromises);
        }

        window.lastCreatedOrderId = orderId;

        // Tự động in hóa đơn
        if (typeof window.printPOSReceipt === 'function') {
            window.printPOSReceipt(orderId, { name: customerName, phone: customerPhone, paymentMethod }, bill.cart, total, subtotal, discountVal);
        }
        if (window.btCharacteristic && typeof window.printLastOrderBT === 'function') {
            window.printLastOrderBT();
        }

        if (typeof showToast !== 'undefined') showToast("Đã lưu đơn hàng thành công!");

        // Đóng bill hiện tại
        window.posCloseBill(bill.id);

    } catch (e) {
        if (typeof showToast !== 'undefined') showToast("Lỗi POS: " + e.message, "error");
        console.error(e);
    } finally {
        const checkBtn = document.getElementById('btn-pos-checkout') || document.querySelector('.pos-btn-complete');
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.innerHTML = "THANH TOÁN";
        }
    }
};

window.posCheckout = window.createPOSOrder;
window.checkoutPOS = window.createPOSOrder;

window.addEventListener('beforeunload', () => {
    if (typeof window.savePOSBills === 'function') {
        window.savePOSBills();
    }
});

window.applyQuickDiscount = () => { }; // Obsolete but keep to avoid errors if called elsewhere

// --- Quản lý Thống kê Nâng cao ---
let mainRevChart = null;
let periodSoldChart = null;
let comparisonChart = null;
let paymentMethodChart = null;

async function initFullReport() {
    const yearSelect = document.getElementById('stats-year-filter');
    const periodSelect = document.getElementById('stats-period-type');
    const btnRefresh = document.getElementById('btn-refresh-stats');
    if (!yearSelect || !periodSelect) return;

    const VAT_RATE = 0.01; // 1%
    const TNCN_RATE = 0.005; // 0.5%

    // 1. Nạp danh sách năm (3 năm gần đây)
    const currentYear = new Date().getFullYear();
    if (yearSelect.options.length === 0) {
        for (let y = currentYear; y >= currentYear - 2; y--) {
            yearSelect.options.add(new Option(y, y));
        }
    }

    const updateReport = async () => {
        const selectedYear = parseInt(yearSelect.value);
        const periodType = periodSelect.value;
        const loadingEl = document.getElementById('stats-detail-loading');

        try {
            if (loadingEl) loadingEl.style.display = 'block';
            document.getElementById('stats-detail-table').innerHTML = ''; // Clear previous data
            showToast("Đang tổng hợp dữ liệu báo cáo...", "info");
            const q = query(collection(db, "orders"), where("status", "==", "Đã hoàn thành"));
            const snap = await getDocs(q);

            const prevYear = selectedYear - 1;
            const orders = snap.docs.map(d => d.data()).filter(o => {
                if (!o.orderDate) return false;
                const y = o.orderDate.toDate().getFullYear();
                return y === selectedYear || y === prevYear;
            });

            // 2. Xử lý gom nhóm dữ liệu (Revenue & Count)
            const statsMap = {}; // Key: "Tháng 01", "Quý 1", hoặc "Ngày 01/01"
            const productMap = {}; // Thống kê sản phẩm bán chạy trong KỲ NÀY
            const paymentMethodMap = {}; // Thống kê theo phương thức thanh toán
            const compCurrentYear = new Array(12).fill(0); // [Jan, Feb, ..., Dec] cho năm chọn
            const compPrevYear = new Array(12).fill(0);    // [Jan, Feb, ..., Dec] cho năm trước
            let totalRev = 0;
            let totalProfit = 0;
            let totalOrders = 0;
            let prevTotalRev = 0;
            let prevTotalProfit = 0;
            let prevTotalOrders = 0;

            orders.forEach(o => {
                const date = o.orderDate.toDate();
                const orderYear = date.getFullYear();
                const monthIdx = date.getMonth();
                let key = '';

                const revGross = (o.totalAmount || 0);
                const vatVal = Math.round(revGross * VAT_RATE);
                const tncnVal = Math.round(revGross * TNCN_RATE);
                const netRev = revGross - (vatVal + tncnVal);
                const orderCost = o.items ? o.items.reduce((sum, i) => sum + ((i.cost || 0) * (i.quantity || 1)), 0) : 0;
                const orderProfit = netRev - orderCost; // Lợi nhuận sau thuế

                if (orderYear === selectedYear) {
                    totalOrders++;
                    if (periodType === 'monthly') {
                        key = `Tháng ${(monthIdx + 1).toString().padStart(2, '0')}`;
                    } else if (periodType === 'quarterly') {
                        key = `Quý ${Math.floor(monthIdx / 3) + 1}`;
                    } else if (periodType === 'daily') {
                        if (monthIdx !== new Date().getMonth()) return;
                        key = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                    }

                    if (key) {
                        if (!statsMap[key]) statsMap[key] = { rev: 0, net: 0, vat: 0, tncn: 0, count: 0, profit: 0 };
                        statsMap[key].rev += revGross;
                        statsMap[key].net += netRev;
                        statsMap[key].vat += vatVal;
                        statsMap[key].tncn += tncnVal;
                        statsMap[key].count++;
                        statsMap[key].profit += orderProfit;
                        totalRev += revGross;
                        totalProfit += orderProfit;

                        // Gom sản phẩm bán chạy cho năm hiện tại
                        o.items.forEach(item => {
                            productMap[item.name] = (productMap[item.name] || 0) + (item.quantity || 1);
                        });

                        // Gom theo phương thức thanh toán (Chỉ lấy các đơn trong năm chọn)
                        const pMethod = o.paymentMethod || 'Khác';
                        if (!paymentMethodMap[pMethod]) paymentMethodMap[pMethod] = 0;
                        paymentMethodMap[pMethod] += (o.totalAmount || 0);
                    }
                    // Lưu dữ liệu so sánh 12 tháng
                    compCurrentYear[monthIdx] += (o.totalAmount || 0);
                } else if (orderYear === prevYear) {
                    // Lưu dữ liệu năm trước
                    compPrevYear[monthIdx] += (o.totalAmount || 0);
                    prevTotalRev += (o.totalAmount || 0);
                    prevTotalProfit += orderProfit;
                    prevTotalOrders++;
                }
            });

            // Hàm hỗ trợ tính growth HTML
            const getGrowthHtml = (current, previous) => {
                if (!previous || previous === 0) return `<span style="color: #888;">--%</span>`;
                const growth = ((current - previous) / previous) * 100;
                const color = growth >= 0 ? '#27ae60' : '#e74c3c';
                const arrow = growth >= 0 ? '↑' : '↓';
                return `<span style="color: ${color}; font-weight: 600;">${arrow}${Math.abs(growth).toFixed(1)}%</span>`;
            };

            // 3. Cập nhật thẻ Summary
            animateNumber('period-revenue', totalRev, true); // Tổng (có thuế)
            animateNumber('period-profit', totalProfit, true);
            animateNumber('period-orders', totalOrders);
            animateNumber('period-avg-order', totalOrders > 0 ? Math.round(totalRev / totalOrders) : 0, true);

            // Cập nhật các chỉ số thuế VAT (1%), TNCN (0.5%) và Tổng (1.5%)
            if (document.getElementById('period-vat-total')) animateNumber('period-vat-total', Math.round(totalRev * VAT_RATE), true);
            if (document.getElementById('period-tncn-total')) animateNumber('period-tncn-total', Math.round(totalRev * TNCN_RATE), true);
            if (document.getElementById('period-tax-total')) animateNumber('period-tax-total', Math.round(totalRev * (VAT_RATE + TNCN_RATE)), true);
            if (document.getElementById('period-net-revenue')) animateNumber('period-net-revenue', totalRev - Math.round(totalRev * (VAT_RATE + TNCN_RATE)), true);

            // Hiển thị % tăng trưởng
            document.getElementById('period-revenue-growth').innerHTML = getGrowthHtml(totalRev, prevTotalRev);
            document.getElementById('period-profit-growth').innerHTML = getGrowthHtml(totalProfit, prevTotalProfit);
            document.getElementById('period-orders-growth').innerHTML = getGrowthHtml(totalOrders, prevTotalOrders);

            const currentAvg = totalOrders > 0 ? totalRev / totalOrders : 0;
            const prevAvg = prevTotalOrders > 0 ? prevTotalRev / prevTotalOrders : 0;
            document.getElementById('period-avg-growth').innerHTML = getGrowthHtml(currentAvg, prevAvg);

            // 4. Vẽ biểu đồ doanh thu
            const labels = Object.keys(statsMap).sort();
            const revData = labels.map(l => statsMap[l].rev);

            if (mainRevChart) mainRevChart.destroy();
            mainRevChart = new Chart(document.getElementById('revenueMainChart'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Doanh thu',
                        data: revData,
                        borderColor: '#2c3e50',
                        backgroundColor: 'rgba(44, 62, 80, 0.05)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            // 4.1 Vẽ biểu đồ so sánh 2 năm
            const monthLabels = ["Tháng 1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
            if (comparisonChart) comparisonChart.destroy();
            comparisonChart = new Chart(document.getElementById('revenueComparisonChart'), {
                type: 'line',
                data: {
                    labels: monthLabels,
                    datasets: [
                        {
                            label: `Năm ${selectedYear}`,
                            data: compCurrentYear,
                            borderColor: '#1a1a1a',
                            backgroundColor: 'transparent',
                            borderWidth: 3,
                            tension: 0.3,
                            fill: false
                        },
                        {
                            label: `Năm ${prevYear}`,
                            data: compPrevYear,
                            borderColor: '#ccc',
                            borderDash: [5, 5],
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { tooltip: { mode: 'index', intersect: false } }
                }
            });

            // 5. Vẽ biểu đồ sản phẩm bán chạy (Top 5)
            const topProducts = Object.entries(productMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (periodSoldChart) periodSoldChart.destroy();
            const chartType = document.getElementById('topSoldType').value;
            periodSoldChart = new Chart(document.getElementById('topSoldPeriodChart'), {
                type: chartType,
                data: {
                    labels: topProducts.map(p => p[0]),
                    datasets: [{
                        data: topProducts.map(p => p[1]),
                        backgroundColor: ['#1a1a1a', '#c0392b', '#27ae60', '#2980b9', '#f1c40f']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: chartType === 'pie' } } }
            });

            // 5.1 Vẽ biểu đồ phương thức thanh toán
            const pmLabels = Object.keys(paymentMethodMap);
            const pmData = pmLabels.map(l => paymentMethodMap[l]);

            if (paymentMethodChart) paymentMethodChart.destroy();
            paymentMethodChart = new Chart(document.getElementById('paymentMethodChart'), {
                type: 'doughnut',
                data: {
                    labels: pmLabels,
                    datasets: [{
                        data: pmData,
                        backgroundColor: ['#2c3e50', '#27ae60', '#2980b9', '#f39c12', '#e74c3c']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });

            // 6. Cập nhật bảng kê chi tiết
            const tableBody = document.getElementById('stats-detail-table');
            const rowsHtml = labels.map(l => `
                <tr>
                    <td><strong>${l}</strong></td>
                    <td>${statsMap[l].count} ĐH</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(statsMap[l].net)} VND</td>
                    <td style="color: #e67e22;">${new Intl.NumberFormat('vi-VN').format(statsMap[l].vat)} VND</td>
                    <td style="color: #d35400;">${new Intl.NumberFormat('vi-VN').format(statsMap[l].tncn)} VND</td>
                    <td style="font-weight: 600;">${new Intl.NumberFormat('vi-VN').format(statsMap[l].vat + statsMap[l].tncn)} VND</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(statsMap[l].rev)} VND</td>
                    <td style="color: #27ae60; font-weight: 600;">${new Intl.NumberFormat('vi-VN').format(statsMap[l].profit)} VND</td>
                </tr>
            `).join('');

            const totalVatAll = Math.round(totalRev * VAT_RATE);
            const totalTncnAll = Math.round(totalRev * TNCN_RATE);
            const totalNetAll = totalRev - (totalVatAll + totalTncnAll);

            tableBody.innerHTML = rowsHtml + `
                <tr style="background: #f8f9fa; font-weight: bold; border-top: 2px solid #ddd;">
                    <td>TỔNG CỘNG</td>
                    <td>${totalOrders} ĐH</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(totalNetAll)} VND</td>
                    <td style="color: #e67e22;">${new Intl.NumberFormat('vi-VN').format(totalVatAll)} VND</td>
                    <td style="color: #d35400;">${new Intl.NumberFormat('vi-VN').format(totalTncnAll)} VND</td>
                    <td style="font-weight: bold;">${new Intl.NumberFormat('vi-VN').format(totalVatAll + totalTncnAll)} VND</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(totalRev)} VND</td>
                    <td style="color: #27ae60;">${new Intl.NumberFormat('vi-VN').format(totalProfit)} VND</td>
                </tr>
            `;

            // Lưu dữ liệu vào biến global để xuất Excel
            currentReportData = {
                labels, statsMap,
                totals: { orders: totalOrders, net: totalNetAll, vat: totalVatAll, tncn: totalTncnAll, gross: totalRev, profit: totalProfit },
                info: { year: selectedYear, type: periodType }
            };

        } catch (err) {
            console.error(err);
            showToast("Lỗi tải báo cáo", "error");
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    };

    btnRefresh.onclick = updateReport;
    document.getElementById('btn-export-stats-excel').onclick = exportStatsToExcel;
    document.getElementById('topSoldType').onchange = updateReport;
    updateReport(); // Lần đầu load
}

async function exportStatsToExcel() {
    if (!currentReportData) return showToast("Vui lòng xem báo cáo trước khi xuất", "error");

    const { labels, statsMap, totals, info } = currentReportData;
    const headers = ["Thời gian", "Số đơn", "DT Thuần (Net)", "Thuế VAT (1%)", "Thuế TNCN (0.5%)", "Tổng Thuế (1.5%)", "Doanh thu (Gross)", "Lợi nhuận (Est)"];

    let excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"/><style>
            th { background-color: #2c3e50; color: #ffffff; border: 0.5pt solid #000; padding: 5px; }
            td { border: 0.5pt solid #000; padding: 5px; }
            .num { mso-number-format:"\\#\\,\\#\\#0"; text-align: right; }
            .bold { font-weight: bold; background-color: #f8f9fa; }
        </style></head>
        <body>
            <h2>BÁO CÁO DOANH THU & THUẾ - TIỆM NHÀ GỐM</h2>
            <p>Năm: ${info.year} | Chế độ: ${info.type === 'monthly' ? 'Từng tháng' : info.type === 'quarterly' ? 'Từng quý' : 'Từng ngày'}</p>
            <table>
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>
                    ${labels.map(l => {
        const s = statsMap[l];
        return `
                        <tr>
                            <td>${l}</td>
                            <td class="num">${s.count}</td>
                            <td class="num">${s.net}</td>
                            <td class="num">${s.vat}</td>
                            <td class="num">${s.tncn}</td>
                            <td class="num">${s.vat + s.tncn}</td>
                            <td class="num">${s.rev}</td>
                            <td class="num">${s.profit}</td>
                        </tr>`;
    }).join('')}
                    <tr class="bold">
                        <td>TỔNG CỘNG</td>
                        <td class="num">${totals.orders}</td>
                        <td class="num">${totals.net}</td>
                        <td class="num">${totals.vat}</td>
                        <td class="num">${totals.tncn}</td>
                        <td class="num">${totals.vat + totals.tncn}</td>
                        <td class="num">${totals.gross}</td>
                        <td class="num">${totals.profit}</td>
                    </tr>
                </tbody>
            </table>
            <p style="font-size: 10px; color: #666;">* Ghi chú: Doanh thu thuần = Gross - (VAT + TNCN). Thuế tính dựa trên mô hình Hộ kinh doanh (1.5%).</p>
        </body></html>
    `;

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bao_cao_Tai_chinh_TNG_${info.year}_${info.type}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Đã xuất báo cáo thành công!");
}

// --- Quản lý Nhật ký kho ---
function initInventoryLogListener() {
    if (!db) return;

    // Lấy 200 bản ghi nhật ký mới nhất để phục vụ việc lọc local
    const q = query(collection(db, "inventory_logs"), orderBy("timestamp", "desc"), limit(200));

    onSnapshot(q, (snapshot) => {
        inventoryLogsLocal = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventoryLogTable();
    }, (error) => console.error("Log listener error:", error));
}

function renderInventoryLogTable() {
    const list = document.getElementById('admin-inventory-log-list');
    const idFilter = document.getElementById('log-filter-product-id')?.value.trim().toLowerCase() || '';
    const dateFilter = document.getElementById('log-filter-date')?.value || ''; // Định dạng YYYY-MM-DD

    if (!list) return;

    const filtered = inventoryLogsLocal.filter(l => {
        const matchesSearch = !idFilter ||
            (l.productId || "").toLowerCase().includes(idFilter) ||
            (l.productName || "").toLowerCase().includes(idFilter);

        let matchesDate = true;
        if (dateFilter && l.timestamp) {
            const logDate = l.timestamp.toDate().toISOString().split('T')[0]; // Chuyển timestamp sang YYYY-MM-DD
            matchesDate = logDate === dateFilter;
        }

        return matchesSearch && matchesDate;
    });

    list.innerHTML = filtered.map(l => {
        const time = l.timestamp ? new Date(l.timestamp.toDate()).toLocaleString('vi-VN') : '...';
        const changeStyle = l.addedQuantity > 0 ? 'color: #27ae60; font-weight: bold;' : 'color: #e74c3c; font-weight: bold;';
        const sign = l.addedQuantity > 0 ? '+' : '';
        return `
                <tr>
                    <td><small>${time}</small></td>
                    <td><strong>${l.productName}</strong><br><small>${l.productId}</small></td>
                    <td style="${changeStyle}">${sign}${l.addedQuantity}</td>
                    <td>${l.previousStock} → ${l.newStock}</td>
                    <td><small>${l.adminEmail}</small></td>
                </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;">Không tìm thấy lịch sử phù hợp.</td></tr>';
}

// --- Quản lý Cài đặt Bảo trì ---
async function initMaintenanceSettings() {
    const toggle = document.getElementById('maintenance-mode-toggle');
    const statusText = document.getElementById('maintenance-status-text');
    const titleInput = document.getElementById('maintenance-title');
    const messageInput = document.getElementById('maintenance-message');
    const dateInput = document.getElementById('maintenance-countdown-date');
    const form = document.getElementById('maintenance-settings-form');

    if (!toggle || !form || !db) return;

    const systemRef = doc(db, "settings", "system");

    // 1. Load cài đặt hiện tại
    const loadSettings = async () => {
        const snap = await getDoc(systemRef);
        if (snap.exists()) {
            const settings = snap.data();
            toggle.checked = settings.maintenanceMode || false;
            statusText.innerText = settings.maintenanceMode ? 'ĐANG BẬT' : 'ĐANG TẮT';
            statusText.style.color = settings.maintenanceMode ? '#e74c3c' : '#27ae60';
            titleInput.value = settings.maintenanceTitle || '';
            messageInput.value = settings.maintenanceMessage || '';
            // Chuyển Firestore Timestamp sang định dạng datetime-local
            if (settings.countdownDate && settings.countdownDate.toDate) {
                const date = settings.countdownDate.toDate();
                dateInput.value = date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
            } else {
                dateInput.value = '';
            }
        }
    };

    // Lắng nghe sự kiện thay đổi của toggle để cập nhật trạng thái text
    toggle.addEventListener('change', () => {
        statusText.innerText = toggle.checked ? 'ĐANG BẬT' : 'ĐANG TẮT';
        statusText.style.color = toggle.checked ? '#e74c3c' : '#27ae60';
    });

    // 2. Lưu cài đặt khi submit form
    form.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await setDoc(systemRef, {
                maintenanceMode: toggle.checked,
                maintenanceTitle: titleInput.value.trim(),
                maintenanceMessage: messageInput.value.trim(),
                countdownDate: dateInput.value ? new Date(dateInput.value) : null,
                lastUpdatedBy: auth.currentUser.email,
                lastUpdatedAt: serverTimestamp()
            }, { merge: true });
            showToast("Đã lưu cài đặt bảo trì thành công!");
        } catch (err) { showToast("Lỗi lưu cài đặt: " + err.message, "error"); }
    };

    loadSettings(); // Load cài đặt khi tab được mở
}

// Hàm đổ dữ liệu vào dropdown chọn nhóm đồng giá trong form sản phẩm
async function populateFlashSaleGroupSelect() {
    const select = document.getElementById('flash-sale-group-select');
    if (!select) return;

    const fsRef = doc(db, "settings", "flash_sale");
    const snap = await getDoc(fsRef);
    if (snap.exists() && snap.data().priceGroups) {
        const groups = snap.data().priceGroups;
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Không tham gia --</option>' +
            groups.map(p => `<option value="${p}">Đồng giá ${p / 1000}k</option>`).join('');
        select.value = currentVal;
    }
}

// --- Quản lý Cài đặt Flash Sale ---
async function initFlashSaleSettings() {
    const form = document.getElementById('flash-sale-settings-form');
    if (!form || !db) return;

    const fsRef = doc(db, "settings", "flash_sale");

    // Load cài đặt hiện tại
    const snap = await getDoc(fsRef);
    if (snap.exists()) {
        const s = snap.data();
        document.getElementById('fs-active-toggle').checked = s.isActive || false;
        document.getElementById('fs-title').value = s.title || '';
        document.getElementById('fs-subtitle').value = s.subtitle || '';
        document.getElementById('fs-groups').value = (s.priceGroups || []).join(', ');
        if (s.startTime) {
            document.getElementById('fs-start-time').value = s.startTime.toDate().toISOString().slice(0, 16);
        }
        if (s.endTime) {
            document.getElementById('fs-end-time').value = s.endTime.toDate().toISOString().slice(0, 16);
        }
        populateFlashSaleGroupSelect();
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const priceGroups = document.getElementById('fs-groups').value.split(',')
            .map(p => parseInt(p.trim()))
            .filter(p => !isNaN(p));

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';

            await setDoc(fsRef, {
                isActive: document.getElementById('fs-active-toggle').checked,
                title: document.getElementById('fs-title').value.trim(),
                subtitle: document.getElementById('fs-subtitle').value.trim(),
                startTime: new Date(document.getElementById('fs-start-time').value),
                endTime: new Date(document.getElementById('fs-end-time').value),
                priceGroups: priceGroups,
                lastUpdated: serverTimestamp()
            });

            showToast("Đã cập nhật cấu hình Flash Sale!");
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerText = "Lưu cấu hình Flash Sale";
        }
    };

    renderAdminFlashSaleList(); // Render lần đầu khi mở tab
}

// Logic tự động tính % giảm giá khi chọn nhóm đồng giá
document.getElementById('flash-sale-group-select')?.addEventListener('change', (e) => {
    const targetPrice = parseInt(e.target.value);
    const originalPrice = window.getCurrencyValue('price');
    const saleInput = document.getElementById('sale');

    if (targetPrice && originalPrice > 0) {
        if (targetPrice >= originalPrice) {
            showToast("Giá đồng giá phải nhỏ hơn giá gốc!", "error");
            e.target.value = "";
            return;
        }
        // Công thức: % Sale = (1 - Giá_mới / Giá_gốc) * 100
        const salePercent = Math.round((1 - targetPrice / originalPrice) * 100);
        saleInput.value = salePercent;
        showToast(`Đã tự tính giảm giá: ${salePercent}%`);
    } else if (e.target.value === "" && saleInput) {
        saleInput.value = 0;
        showToast("Đã hủy tham gia chương trình đồng giá, giảm giá về 0%");
    }
});

// Hàm hiển thị danh sách sản phẩm đang sale trong tab Cấu hình Flash Sale
function renderAdminFlashSaleList() {
    const list = document.getElementById('admin-flash-sale-list');
    if (!list) return;

    // Lọc sản phẩm có phần trăm giảm giá > 0 từ mảng cache local
    const saleProducts = posProductsLocal.filter(p => (p.sale || 0) > 0);

    if (saleProducts.length === 0) {
        list.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #999;">Chưa có sản phẩm nào được thiết lập giảm giá.</td></tr>';
        return;
    }

    list.innerHTML = saleProducts.map(p => {
        // Ưu tiên dùng flashSaleGroup để giá luôn là con số tròn
        const salePrice = p.flashSaleGroup || p.salePrice || Math.round((p.price * (1 - (p.sale || 0) / 100)));
        const stockClass = p.stock <= 0 ? 'color: #e74c3c; font-weight: bold;' : '';

        return `
            <tr>
                <td data-label="Ảnh"><img src="${p.imageUrl}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                <td data-label="Tên"><strong>${p.name}</strong><br><small style="color:#888;">SKU: ${p.id}</small></td>
                <td data-label="Giá gốc">${new Intl.NumberFormat('vi-VN').format(p.price)} VND</td>
                <td data-label="Giảm" style="color: #c0392b; font-weight: 700;">-${p.sale}%</td>
                <td data-label="Giá Sale" style="font-weight: 700; color: #27ae60;">${new Intl.NumberFormat('vi-VN').format(salePrice)} VND ${p.flashSaleGroup ? `<br><small style="color:#e67e22">Đồng giá ${p.flashSaleGroup / 1000}k</small>` : ''}</td>
                <td data-label="Kho" style="${stockClass}">${p.stock}</td>
            </tr>
        `;
    }).join('');
}

// --- Quản lý Tin tức ---
let quillNewsEditor = null;

function initQuillNewsEditor() {
    if (!quillNewsEditor && document.getElementById('quill-editor')) {
        quillNewsEditor = new Quill('#quill-editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'align': [] }],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: function () {
                            const input = document.createElement('input');
                            input.setAttribute('type', 'file');
                            input.setAttribute('accept', 'image/*');
                            input.click();

                            input.onchange = async () => {
                                const file = input.files[0];
                                if (file) {
                                    const range = quillNewsEditor.getSelection(true) || { index: quillNewsEditor.getLength() };
                                    quillNewsEditor.insertText(range.index, 'Đang tải ảnh...', 'italic', true);

                                    try {
                                        const storageRef = ref(storage, `news/content/${Date.now()}_${file.name}`);
                                        const snapshot = await uploadBytes(storageRef, file);
                                        const url = await getDownloadURL(snapshot.ref);

                                        quillNewsEditor.deleteText(range.index, 15);
                                        quillNewsEditor.insertEmbed(range.index, 'image', url);
                                    } catch (error) {
                                        console.error("Lỗi upload ảnh:", error);
                                        quillNewsEditor.deleteText(range.index, 15);
                                        showToast("Lỗi tải ảnh lên", "error");
                                    }
                                }
                            };
                        }
                    }
                }
            }
        });

        quillNewsEditor.on('text-change', function () {
            document.getElementById('news-content').value = quillNewsEditor.root.innerHTML;
        });
    }
}

function initNewsManagement() {
    const form = document.getElementById('news-form');
    const listContainer = document.getElementById('admin-news-list');
    if (!form || !db) return;

    initQuillNewsEditor();

    // Lắng nghe danh sách tin tức
    onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), (snapshot) => {
        listContainer.innerHTML = snapshot.docs.map(doc => {
            const n = doc.data();
            const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : '...';
            return `
                <tr>
                    <td><img src="${n.imageUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;"></td>
                    <td><strong>${n.title}</strong><br><small>${n.status === 'draft' ? '[NHÁP]' : ''}</small></td>
                    <td>${date}</td>
                    <td>
                        <button class="btn-minimal" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.editNews('${doc.id}')">Sửa</button>
                        <button class="btn-delete" style="font-size: 0.7rem;" onclick="window.deleteNews('${doc.id}')">Xóa</button>
                    </td>
                </tr>`;
        }).join('');
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('news-id').value;
        const title = document.getElementById('news-title').value.trim();
        const excerpt = document.getElementById('news-excerpt').value.trim();
        const content = document.getElementById('news-content').value.trim();
        const author = document.getElementById('news-author').value.trim() || "Tiệm Nhà Gốm";
        const status = document.getElementById('news-status').value;
        const file = document.getElementById('news-image').files[0];
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';

            let imageUrl = form.dataset.currentImageUrl || '';

            if (file) {
                const webpFile = await convertToWebP(file, 1200);
                const storageRef = ref(storage, `news/${Date.now()}_${webpFile.name}`);
                const snapshot = await uploadBytes(storageRef, webpFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            if (!imageUrl) {
                showToast("Vui lòng chọn ảnh bìa bài viết", "error");
                submitBtn.disabled = false;
                return;
            }

            const newsData = {
                title,
                excerpt,
                content,
                author,
                status,
                imageUrl,
                slug: title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, 'd').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-'),
                updatedAt: serverTimestamp()
            };

            if (id) {
                await updateDoc(doc(db, "news", id), newsData);
                showToast("Đã cập nhật bài viết!");
            } else {
                let docId = newsData.slug || "bai-viet";
                const checkSnap = await getDoc(doc(db, "news", docId));
                if (checkSnap.exists()) {
                    docId = docId + '-' + Date.now();
                }
                newsData.createdAt = serverTimestamp();
                await setDoc(doc(db, "news", docId), newsData);
                showToast("Đã đăng bài viết mới!");
            }

            form.reset();
            document.getElementById('news-id').value = '';
            document.getElementById('news-image-preview').innerHTML = '';
            if (quillNewsEditor) {
                quillNewsEditor.setContents([]);
                document.getElementById('news-content').value = '';
            }
            delete form.dataset.currentImageUrl;
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Lưu bài viết";
        }
    };
}

window.editNews = async (id) => {
    const docSnap = await getDoc(doc(db, "news", id));
    if (docSnap.exists()) {
        const n = docSnap.data();
        document.getElementById('news-id').value = id;
        document.getElementById('news-title').value = n.title;
        document.getElementById('news-excerpt').value = n.excerpt;
        document.getElementById('news-content').value = n.content;
        if (quillNewsEditor) {
            quillNewsEditor.root.innerHTML = n.content || '';
        }
        document.getElementById('news-author').value = n.author;
        document.getElementById('news-status').value = n.status;

        const preview = document.getElementById('news-image-preview');
        preview.innerHTML = `<img src="${n.imageUrl}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px;">`;

        const form = document.getElementById('news-form');
        form.dataset.currentImageUrl = n.imageUrl;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.deleteNews = async (id) => {
    if (confirm("Xóa bài viết này?")) {
        await deleteDoc(doc(db, "news", id));
        showToast("Đã xóa bài viết.");
    }
};

// Thiết lập listener cho chức năng cộng dồn tồn kho (UI interaction)
function initStockAdditiveLogic() {
    const checkbox = document.getElementById('stock-additive');
    const input = document.getElementById('stock');
    if (!checkbox || !input) return;

    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            input.dataset.prevVal = input.value; // Lưu lại số cũ phòng trường hợp user bỏ tích
            input.value = '';
            input.placeholder = "Nhập số lượng cộng thêm...";
        } else {
            input.value = input.dataset.prevVal || '';
            input.placeholder = "10";
        }
        // Đảm bảo input không bị disabled nếu checkbox được bỏ chọn
        if (!checkbox.checked) {
            input.disabled = false;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Bảo mật & SEO: Ngăn chặn các công cụ tìm kiếm lập chỉ mục trang quản trị
    let robotsTag = document.querySelector('meta[name="robots"]');
    if (!robotsTag) {
        robotsTag = document.createElement('meta');
        robotsTag.setAttribute('name', 'robots');
        document.head.appendChild(robotsTag);
    }
    robotsTag.setAttribute('content', 'noindex, nofollow');

    // Xin quyền gửi thông báo trình duyệt ngay khi Admin truy cập trang
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    setupAdminTabs();
    initStockAdditiveLogic();

    // Gán sự kiện cho nút thêm biến thể
    document.getElementById('btn-add-variant')?.addEventListener('click', () => window.addVariantRow());
    document.getElementById('btn-add-pattern-variant')?.addEventListener('click', () => window.addPatternVariantRow());

    // Gán sự kiện kết nối Bluetooth
    document.getElementById('btn-connect-bt-printer')?.addEventListener('click', () => window.connectBTPrinter());

    // Gán sự kiện tìm kiếm cho bảng sản phẩm Admin
    document.getElementById('admin-product-search')?.addEventListener('input', renderAdminProductTable);
    document.getElementById('admin-product-category-filter')?.addEventListener('change', renderAdminProductTable);
    document.getElementById('admin-product-stock-filter')?.addEventListener('change', renderAdminProductTable);
    document.getElementById('btn-export-excel')?.addEventListener('click', exportProductToExcel);

    // Gán sự kiện tìm kiếm khách hàng
    document.getElementById('admin-user-search')?.addEventListener('input', renderAdminUserTable);

    // Gán sự kiện cho bộ lọc Nhật ký kho
    document.getElementById('log-filter-product-id')?.addEventListener('input', renderInventoryLogTable);
    document.getElementById('log-filter-date')?.addEventListener('change', renderInventoryLogTable);
    document.getElementById('btn-clear-log-filter')?.addEventListener('click', () => {
        document.getElementById('log-filter-product-id').value = '';
        document.getElementById('log-filter-date').value = '';
        renderInventoryLogTable();
    });

    // Gán sự kiện cho bộ lọc đơn hàng
    document.getElementById('order-filter-id')?.addEventListener('input', () => {
        currentOrderUserIdFilter = ''; // Reset user filter when typing manually
        currentOrderPage = 1;
        renderOrdersFiltered();
    });

    document.getElementById('order-filter-product')?.addEventListener('input', () => {
        currentOrderPage = 1;
        renderOrdersFiltered();
    });

    document.getElementById('order-filter-status')?.addEventListener('change', () => {
        currentOrderPage = 1;
        renderOrdersFiltered();
    });

    document.getElementById('btn-apply-order-filters')?.addEventListener('click', () => {
        currentOrderPage = 1;
        renderOrdersFiltered();
    });

    // Phân trang đơn hàng
    document.getElementById('prev-order-page')?.addEventListener('click', () => {
        if (currentOrderPage > 1) {
            currentOrderPage--;
            renderOrdersFiltered();
        }
    });

    document.getElementById('rental-order-search-input')?.addEventListener('input', () => {
        currentRentalOrderPage = 1;
        if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
    });
    document.getElementById('rental-order-filter-status')?.addEventListener('change', () => {
        currentRentalOrderPage = 1;
        if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
    });
    document.getElementById('btn-apply-rental-order-filters')?.addEventListener('click', () => {
        currentRentalOrderPage = 1;
        if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
    });
    document.getElementById('prev-rental-order-page')?.addEventListener('click', () => {
        if (currentRentalOrderPage > 1) {
            currentRentalOrderPage--;
            if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
        }
    });
    document.getElementById('next-rental-order-page')?.addEventListener('click', () => {
        const idVal = document.getElementById('rental-order-search-input')?.value.trim().toLowerCase() || '';
        const statusVal = document.getElementById('rental-order-filter-status')?.value || 'all';
        const filtered = allOrdersCache.filter(order => {
            if (order.orderType !== 'rental') return false;
            const matchesId = !idVal || order.id.toLowerCase().includes(idVal);
            const matchesStatus = statusVal === 'all' || order.status === statusVal;
            return matchesId && matchesStatus;
        });
        const totalPages = Math.ceil(filtered.length / RENTAL_ORDER_PAGE_SIZE) || 1;
        if (currentRentalOrderPage < totalPages) {
            currentRentalOrderPage++;
            if (typeof renderRentalOrdersFiltered === 'function') renderRentalOrdersFiltered();
        }
    });

    document.getElementById('next-order-page')?.addEventListener('click', () => {
        const idVal = document.getElementById('order-filter-id')?.value.trim().toLowerCase() || '';
        const productVal = document.getElementById('order-filter-product')?.value.trim().toLowerCase() || '';
        const statusVal = document.getElementById('order-filter-status')?.value || 'all';
        const filtered = allOrdersCache.filter(order => {
            const matchesId = !idVal || order.id.toLowerCase().includes(idVal);
            const matchesProduct = !productVal || order.items.some(item => (item.name || "").toLowerCase().includes(productVal));
            const matchesStatus = statusVal === 'all' || order.status === statusVal;
            const matchesUserId = !currentOrderUserIdFilter || order.userId === currentOrderUserIdFilter;
            return matchesId && matchesProduct && matchesStatus && matchesUserId;
        });
        const totalPages = Math.ceil(filtered.length / ORDER_PAGE_SIZE) || 1;
        if (currentOrderPage < totalPages) {
            currentOrderPage++;
            renderOrdersFiltered();
        }
    });

    // Thay thế initHeader bằng logic Auth riêng cho Admin Dashboard
    onAuthStateChanged(auth, async (user) => {
        await checkAdminRights(user);
        if (document.body.style.display === "block") {
            // Nạp settings Flash Sale trước khi init các thành phần khác
            await fetchFlashSaleSettings();
            initProductListener();
            initOrderListener();
            initUserListener();
            initCouponListener();
            initOverview();
            initCategoryManagement(); // Call initCategoryManagement here to ensure initial render
            setupNewOrderNotification();
            initUserOrderCountListener();
            initUnprocessedOrderBadge();
            populateCategorySelect();
        }
    });

    document.getElementById('btn-logout-admin')?.addEventListener('click', () => {
        logout().then(() => window.location.href = "../index.html");
    });

    // Cập nhật đồng hồ trên Header Content
    setInterval(() => {
        const clock = document.getElementById('admin-clock');
        if (clock) clock.innerText = new Date().toLocaleString('vi-VN');
    }, 1000);

    // Logic tìm kiếm sản phẩm trong POS
    const posSearchInput = document.getElementById('pos-product-search');
    const posSuggestions = document.getElementById('pos-product-suggestions');
    let posSearchTimer;

    // Logic tìm kiếm khách hàng trong POS
    const posCustSearchInput = document.getElementById('pos-customer-search');
    const posCustSuggestions = document.getElementById('pos-customer-suggestions');
    let posCustSearchTimer;

    if (posCustSearchInput && posCustSuggestions) {
        posCustSearchInput.addEventListener('input', () => {
            clearTimeout(posCustSearchTimer);
            const val = posCustSearchInput.value.trim().toLowerCase();
            if (val.length < 1) {
                posCustSuggestions.style.display = 'none';
                return;
            }

            posCustSearchTimer = setTimeout(() => {
                const results = posUsersLocal.filter(u =>
                    (u.displayName || "").toLowerCase().includes(val) ||
                    (u.phone || "").includes(val) ||
                    (u.identifiers || []).some(id => id.toLowerCase().includes(val))
                ).slice(0, 8);

                if (results.length > 0) {
                    posCustSuggestions.innerHTML = results.map(u => {
                        const count = userOrderCounts[u.id] || 0;
                        return `
                            <div class="suggestion-item" onclick="window.posSelectCustomer('${u.id}', '${(u.displayName || '').replace(/'/g, "\\'")}', '${u.phone || ''}', '${u.email || ''}')">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; font-size: 0.85rem;">${u.displayName || 'Khách không tên'}</div>
                                    <div style="font-size: 0.7rem; color: #888;">SĐT: ${u.phone || '---'} | Đã mua: <strong style="color:var(--text-black)">${count} đơn</strong></div>
                                </div>
                            </div>
                        `}).join('');
                    posCustSuggestions.style.display = 'block';
                } else {
                    posCustSuggestions.style.display = 'none';
                }
            }, 200);
        });

        document.addEventListener('click', (e) => {
            if (!posCustSearchInput.contains(e.target) && !posCustSuggestions.contains(e.target)) {
                posCustSuggestions.style.display = 'none';
            }
        });
    }
    let posHighlightedIndex = -1; // Theo dõi vị trí đang chọn bằng phím mũi tên

    if (posSearchInput && posSuggestions) {
        // Phím tắt toàn cục: Nhấn F2 hoặc '/' để focus vào ô tìm kiếm POS
        document.addEventListener('keydown', (e) => {
            const posSection = document.getElementById('pos-section');
            if (posSection?.classList.contains('active')) {
                if (e.key === 'F2' || (e.key === '/' && document.activeElement !== posSearchInput)) {
                    e.preventDefault();
                    posSearchInput.focus();
                }
            }
        });

        // Nâng cấp tìm kiếm sản phẩm POS: Tìm theo Tên hoặc SKU
        posSearchInput.addEventListener('input', () => {
            clearTimeout(posSearchTimer);
            const val = posSearchInput.value.trim().toLowerCase();
            if (val.length < 1) {
                posSuggestions.style.display = 'none';
                return;
            }

            posSearchTimer = setTimeout(() => {
                const fsSettings = globalFlashSaleSettings;
                const results = posProductsLocal.filter(p =>
                    (p.name || "").toLowerCase().includes(val) ||
                    (p.id || "").toLowerCase().includes(val)
                ).slice(0, 10);

                if (results.length > 0) {
                    posSuggestions.innerHTML = results.map((p, idx) => {
                        const currentPrice = getProductCurrentPrice(p, fsSettings);
                        return `
                        <div class="suggestion-item ${idx === posHighlightedIndex ? 'highlighted' : ''}" 
                             onclick="window.addToPOSCart('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${currentPrice}, '${p.imageUrl}')">
                            <img src="${p.imageUrl}" style="width: 35px; height: 35px; object-fit: cover; border-radius: 4px;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #333;">${p.name}</div>
                                <div style="font-size: 0.7rem; color: #888;">
                                    SKU: ${p.id} | Kho: ${p.stock} | <strong>${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</strong>
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    posSuggestions.style.display = 'block';
                    posHighlightedIndex = -1;
                } else {
                    posSuggestions.innerHTML = '<div style="padding: 15px; text-align: center; color: #999; font-size: 0.8rem;">Không tìm thấy sản phẩm</div>';
                    posSuggestions.style.display = 'block';
                }
            }, 200);
        });

        // Điều hướng bằng bàn phím (Lên/Xuống/Enter/Esc) trong ô tìm kiếm
        // Điều hướng Sidebar từ Bottom Nav
        const adminSidebar = document.querySelector('.admin-sidebar');
        const overlay = document.getElementById('admin-sidebar-overlay');
        const btnOpenSidebar = document.getElementById('btn-open-sidebar-mobile');

        if (btnOpenSidebar && adminSidebar && overlay) {
            btnOpenSidebar.addEventListener('click', () => {
                adminSidebar.classList.add('active');
                overlay.classList.add('active');
            });

            overlay.addEventListener('click', closeAdminSidebar);

            adminSidebar.querySelectorAll('.sidebar-link, .admin-tab-btn').forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 992) setTimeout(closeAdminSidebar, 100);
                });
            });
        }

        posSearchInput.addEventListener('keydown', (e) => {
            const items = posSuggestions.querySelectorAll('.suggestion-item');
            if (posSuggestions.style.display === 'none' || items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                posHighlightedIndex = Math.min(posHighlightedIndex + 1, items.length - 1);
                items.forEach((item, idx) => item.classList.toggle('highlighted', idx === posHighlightedIndex));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                posHighlightedIndex = Math.max(posHighlightedIndex - 1, 0);
                items.forEach((item, idx) => item.classList.toggle('highlighted', idx === posHighlightedIndex));
            } else if (e.key === 'Enter' && posHighlightedIndex >= 0) {
                e.preventDefault();
                items[posHighlightedIndex].click();
            } else if (e.key === 'Escape') {
                posSuggestions.style.display = 'none';
            }
        });
    }
});
if (productModal) { productModal.addEventListener('click', (e) => { if (e.target === productModal) { window.closeProductModal(); } }); }

// --- Helper Functions for Currency Formatting ---
window.getCurrencyValue = function (id) {
    const el = document.getElementById(id);
    if (!el || !el.value) return 0;
    return Number(el.value.replace(/\D/g, ''));
};

window.formatCurrencyDisplay = function (val) {
    if (val === null || val === undefined || isNaN(val)) return '';
    return new Intl.NumberFormat('vi-VN').format(val);
};

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('input', (e) => {
        if (e.target && e.target.classList.contains('currency-input')) {
            let val = e.target.value.replace(/\D/g, '');
            if (val !== '') {
                e.target.value = window.formatCurrencyDisplay(Number(val));
            } else {
                e.target.value = '';
            }
        }
    });
});
// --- POS Add Customer Modal Logic ---
window.posOpenAddCustomerModal = () => {
    const modal = document.getElementById('pos-add-customer-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset form
        document.getElementById('pos-new-cust-code').value = '';
        document.getElementById('pos-new-cust-name').value = '';
        document.getElementById('pos-new-cust-phone').value = '';
        document.getElementById('pos-new-cust-address').value = '';
        document.getElementById('pos-new-cust-area').value = '';
        document.getElementById('pos-new-cust-ward').value = '';
        document.getElementById('pos-new-cust-email').value = '';

        // Auto-fill phone if there is search query
        const searchInput = document.getElementById('pos-customer-search');
        if (searchInput && searchInput.value && !isNaN(searchInput.value.trim())) {
            document.getElementById('pos-new-cust-phone').value = searchInput.value.trim();
        }
    }
};

window.posCloseAddCustomerModal = () => {
    const modal = document.getElementById('pos-add-customer-modal');
    if (modal) modal.style.display = 'none';
};

window.posSaveNewCustomer = async () => {
    const name = document.getElementById('pos-new-cust-name').value.trim();
    const phone = document.getElementById('pos-new-cust-phone').value.trim();
    const email = document.getElementById('pos-new-cust-email').value.trim();
    const address = document.getElementById('pos-new-cust-address').value.trim();

    if (!name) {
        if (typeof showToast !== 'undefined') showToast("Vui lòng nhập tên khách hàng", "error");
        return;
    }
    if (!phone) {
        if (typeof showToast !== 'undefined') showToast("Vui lòng nhập số điện thoại", "error");
        return;
    }

    try {
        const newCustId = 'cust_' + Date.now();
        const userData = {
            id: newCustId,
            displayName: name,
            phone: phone,
            email: email,
            address: address,
            identifiers: [phone, name.toLowerCase(), email],
            role: 'user',
            createdAt: serverTimestamp ? serverTimestamp() : new Date()
        };

        if (setDoc && doc && db) {
            await setDoc(doc(db, "users", newCustId), userData);
        }

        // Add to local array if it exists
        if (typeof posUsersLocal !== 'undefined') {
            posUsersLocal.push(userData);
        }

        if (typeof showToast !== 'undefined') showToast("Thêm khách hàng thành công");

        window.posCloseAddCustomerModal();

        // Auto select new customer
        if (typeof window.posSelectCustomer === 'function') {
            window.posSelectCustomer(newCustId, name, phone, email);
        }
    } catch (e) {
        if (typeof showToast !== 'undefined') showToast("Lỗi: " + e.message, "error");
        console.error(e);
    }
};

window.printPOSReceipt = function (orderId, customer, items, total, subtotal = 0, discount = 0, shipping = 0) {
    let printArea = document.getElementById('receipt-print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'receipt-print-area';
        document.body.appendChild(printArea);
    }

    const now = new Date().toLocaleString('vi-VN');

    printArea.innerHTML = `
        <div class="receipt-header">
            <img src="../Asset/images/logo.webp" class="receipt-logo" alt="Logo Tiệm Nhà Gốm" style="width: 100px; max-width: 100%;">
            <p>Gốm & Decor</p>
            <p>37 Nguyễn Duy, Phường Gia Định, TP.HCM</p>
            <p>SĐT: 0777709662</p>
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
                        <td>${i.name} ${i.color ? `(${i.color})` : ''} ${i.pattern ? `(${i.pattern})` : ''}</td>
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

window.toggleCustomDateFilter = (value) => {
    const group = document.getElementById('order-custom-date-group');
    if (group) {
        group.style.display = value === 'custom' ? 'flex' : 'none';
    }
    currentOrderPage = 1;
    renderOrdersFiltered();
};

window.editAdminOrder = async (orderId) => {
    try {
        let order = window.allOrdersCache ? window.allOrdersCache.find(o => o.id === orderId) : null;
        if (!order) {
            const docSnap = await getDoc(doc(db, "orders", orderId));
            if (!docSnap.exists()) return;
            order = { id: docSnap.id, ...docSnap.data() };
        }

        let modal = document.getElementById('order-detail-modal');
        if (!modal) return;

        window.currentEditingOrderItems = JSON.parse(JSON.stringify(order.items));

        const renderItemsEditor = () => {
            const container = document.getElementById('edit-order-items-container');
            if (!container) return;
            let itemsHtml = '';
            window.currentEditingOrderItems.forEach((item, index) => {
                itemsHtml += `
                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                        <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 0.9rem;">${item.name}</div>
                            <div style="font-size: 0.8rem; color: #666;">${item.variant ? 'Loại: ' + item.variant : ''}</div>
                        </div>
                        <input type="number" min="1" value="${item.quantity}" style="width: 60px; padding: 5px;" onchange="window.updateEditOrderItem(${index}, 'quantity', this.value)">
                        <input type="number" min="0" value="${item.price}" style="width: 100px; padding: 5px;" onchange="window.updateEditOrderItem(${index}, 'price', this.value)">
                        <button class="btn-delete" style="padding: 5px 10px;" onclick="window.removeEditOrderItem(${index})">Xóa</button>
                    </div>
                `;
            });
            container.innerHTML = itemsHtml;
        };

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                <h3>Chỉnh sửa đơn hàng #${orderId}</h3>
                
                <div style="margin-top: 15px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Tên khách hàng</label>
                    <input type="text" id="edit-order-customer-name" value="${order.shippingAddress?.fullName || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-top: 10px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Số điện thoại</label>
                    <input type="text" id="edit-order-customer-phone" value="${order.shippingAddress?.phone || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-top: 10px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Địa chỉ giao hàng</label>
                    <input type="text" id="edit-order-customer-address" value="${order.shippingAddress?.address || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>

                <div style="margin-top: 10px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Trạng thái đơn hàng</label>
                    <select id="edit-order-status" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="Đang xử lý" ${order.status === 'Đang xử lý' ? 'selected' : ''}>Đang xử lý</option>
                        <option value="Đã thanh toán" ${order.status === 'Đã thanh toán' ? 'selected' : ''}>Đã thanh toán</option>
                        <option value="Đang giao hàng" ${order.status === 'Đang giao hàng' ? 'selected' : ''}>Đang giao hàng</option>
                        <option value="Đã hoàn thành" ${order.status === 'Đã hoàn thành' ? 'selected' : ''}>Đã hoàn thành</option>
                        <option value="Đã hủy" ${order.status === 'Đã hủy' ? 'selected' : ''}>Đã hủy</option>
                    </select>
                </div>
                
                <div style="margin-top: 10px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Link vận đơn (Tracking)</label>
                    <input type="text" id="edit-order-tracking" value="${order.trackingLink || ''}" placeholder="Nhập link theo dõi đơn hàng..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>

                <div style="margin-top: 15px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Phí vận chuyển (VNĐ)</label>
                    <input type="number" id="edit-order-shipping" value="${order.shippingFee || 0}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-top: 10px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Khuyến mãi giảm (VNĐ)</label>
                    <input type="number" id="edit-order-discount" value="${order.discountAmount || 0}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>

                <div style="margin-top: 15px;">
                    <label style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 5px;">Sản phẩm</label>
                    <div id="edit-order-items-container" style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; padding: 10px; border-radius: 4px;"></div>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn-minimal" style="flex: 1;" onclick="window.viewAdminOrderDetail('${orderId}')">Hủy</button>
                    <button class="btn-dark" style="flex: 1;" onclick="window.saveAdminOrder('${orderId}')">Lưu thay đổi</button>
                </div>
            </div>
        `;
        renderItemsEditor();

    } catch (e) { console.error(e); }
};

window.updateEditOrderItem = (index, field, value) => {
    if (field === 'quantity' || field === 'price') value = Number(value);
    window.currentEditingOrderItems[index][field] = value;
};

window.removeEditOrderItem = (index) => {
    window.currentEditingOrderItems.splice(index, 1);
    const container = document.getElementById('edit-order-items-container');
    if (!container) return;
    let itemsHtml = '';
    window.currentEditingOrderItems.forEach((item, i) => {
        itemsHtml += `
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <img src="${item.image}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem;">${item.name}</div>
                </div>
                <input type="number" min="1" value="${item.quantity}" style="width: 60px; padding: 5px;" onchange="window.updateEditOrderItem(${i}, 'quantity', this.value)">
                <input type="number" min="0" value="${item.price}" style="width: 100px; padding: 5px;" onchange="window.updateEditOrderItem(${i}, 'price', this.value)">
                <button class="btn-delete" style="padding: 5px 10px;" onclick="window.removeEditOrderItem(${i})">Xóa</button>
            </div>
        `;
    });
    container.innerHTML = itemsHtml;
};

window.saveAdminOrder = async (orderId) => {
    try {
        const btn = event.target;
        btn.textContent = 'Đang lưu...';
        btn.disabled = true;

        const name = document.getElementById('edit-order-customer-name').value.trim();
        const phone = document.getElementById('edit-order-customer-phone').value.trim();
        const address = document.getElementById('edit-order-customer-address').value.trim();
        const tracking = document.getElementById('edit-order-tracking').value.trim();
        const status = document.getElementById('edit-order-status').value;
        const shippingFee = Number(document.getElementById('edit-order-shipping').value) || 0;
        const discountAmount = Number(document.getElementById('edit-order-discount').value) || 0;

        const items = window.currentEditingOrderItems;
        let subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        let orderSnap = await getDoc(doc(db, "orders", orderId));
        let membershipDiscount = 0;
        if (orderSnap.exists()) {
            membershipDiscount = orderSnap.data().membershipDiscount || 0;
        }

        let totalAmount = subtotal + shippingFee - discountAmount - membershipDiscount;

        const updateData = {
            "shippingAddress.fullName": name,
            "shippingAddress.phone": phone,
            "shippingAddress.address": address,
            trackingLink: tracking,
            status: status,
            items: items,
            shippingFee: shippingFee,
            discountAmount: discountAmount,
            totalAmount: totalAmount
        };

        await updateDoc(doc(db, "orders", orderId), updateData);
        window.showToast("Cập nhật đơn hàng thành công!", "success");
        window.viewAdminOrderDetail(orderId);
    } catch (e) {
        console.error(e);
        window.showToast("Lỗi khi lưu đơn hàng", "error");
    }
};

window.deleteAdminOrder = async (orderId) => {
    if (confirm('Bạn có chắc chắn muốn xóa đơn hàng #' + orderId + '? Hành động này không thể hoàn tác.')) {
        try {
            await deleteDoc(doc(db, "orders", orderId));
            window.showToast("Đã xóa đơn hàng thành công!", "success");
        } catch (e) {
            console.error(e);
            window.showToast("Lỗi khi xóa đơn hàng", "error");
        }
    }
};

window.exportRentalToExcel = async (orderId) => {
    try {
        const docSnap = await getDoc(doc(db, 'orders', orderId));
        if (!docSnap.exists()) return;
        const o = docSnap.data();
        const rInfo = o.rentalInfo || {};

        let subtotal = 0;
        let itemsHtml = '';
        if (o.items && Array.isArray(o.items)) {
            o.items.forEach((i, idx) => {
                const price = i.rentalPrice || i.price || 0;
                const totalItem = price * (i.quantity || 1);
                subtotal += totalItem;
                itemsHtml += `
                    <tr>
                        <td style="border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
                        <td style="border: 1px solid #ddd; text-align: center;">${i.id || ''}</td>
                        <td style="border: 1px solid #ddd;">${i.name || ''}</td>
                        <td style="border: 1px solid #ddd; text-align: center;">${i.quantity || 0}</td>
                        <td style="border: 1px solid #ddd; text-align: right;">${new Intl.NumberFormat('vi-VN').format(price)} VNĐ</td>
                        <td style="border: 1px solid #ddd; text-align: right;">${new Intl.NumberFormat('vi-VN').format(totalItem)} VNĐ</td>
                    </tr>
                `;
            });
        }

        let excelHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <style>
                    table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
                    th { background-color: #4CAF50; color: white; font-weight: bold; border: 1px solid #ddd; padding: 10px; text-align: center; }
                    td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
                    .header-table td { border: none; padding: 5px; }
                    .title { font-size: 22px; font-weight: bold; color: #333; text-align: center; margin-bottom: 20px; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <div class="title">THÔNG TIN ĐƠN THUÊ ĐỒ - #${orderId}</div>
                <table class="header-table" style="margin-bottom: 20px; border: none; width: 100%;">
                    <tr>
                        <td style="font-weight: bold; width: 150px;">Công ty / Cá nhân:</td>
                        <td colspan="3">${rInfo.companyName || 'Không có'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Người liên hệ:</td>
                        <td colspan="3">${rInfo.contactName || o.shippingAddress?.fullName || 'Không có'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Số điện thoại:</td>
                        <td style="mso-number-format:'\\@';">${rInfo.phone || o.shippingAddress?.phone || 'Không có'}</td>
                        <td style="font-weight: bold;">Email:</td>
                        <td>${rInfo.email || 'Không có'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Mã số thuế:</td>
                        <td style="mso-number-format:'\\@';">${rInfo.taxCode || 'Không có'}</td>
                        <td style="font-weight: bold;">Trạng thái:</td>
                        <td style="color: #e65100; font-weight: bold;">${o.status || 'Không có'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Ngày cần đồ:</td>
                        <td>${rInfo.rentalDate ? new Date(rInfo.rentalDate).toLocaleDateString('vi-VN') : 'Không có'}</td>
                        <td style="font-weight: bold;">Ngày trả đồ:</td>
                        <td>${rInfo.returnDate ? new Date(rInfo.returnDate).toLocaleDateString('vi-VN') : 'Không có'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Địa chỉ:</td>
                        <td colspan="3">${rInfo.address || 'Không có'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold;">Ghi chú:</td>
                        <td colspan="3">${rInfo.notes || 'Không có'}</td>
                    </tr>
                </table>

                <table style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th style="width: 50px;">STT</th>
                            <th style="width: 150px;">Mã Sản Phẩm</th>
                            <th style="width: 400px;">Tên Sản Phẩm</th>
                            <th style="width: 100px;">Số Lượng</th>
                            <th style="width: 150px;">Đơn Giá Thuê</th>
                            <th style="width: 150px;">Thành Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                        <tr>
                            <td colspan="5" style="text-align: right; font-weight: bold; border: 1px solid #ddd; padding: 10px;">Tổng tiền đồ thuê:</td>
                            <td style="text-align: right; font-weight: bold; color: #d32f2f; border: 1px solid #ddd; padding: 10px;">${new Intl.NumberFormat('vi-VN').format(subtotal)} VNĐ</td>
                        </tr>
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Don-Thue-${orderId}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error(e);
        window.showToast('Lỗi xuất file Excel', 'error');
    }
};

window.printRentalBill = async (orderId) => {
    try {
        const docSnap = await getDoc(doc(db, 'orders', orderId));
        if (!docSnap.exists()) return;
        const o = docSnap.data();
        const rInfo = o.rentalInfo || {};
        const printWindow = window.open('', '_blank');

        let itemsHtml = '';
        let sub = 0;
        if (o.items && Array.isArray(o.items)) {
            o.items.forEach((item, index) => {
                let unitPrice = item.rentalPrice || item.price || 0;
                let lineTotal = item.quantity * unitPrice;
                sub += lineTotal;
                itemsHtml += `<tr><td style="text-align: center;">${index + 1}</td><td>${item.name}</td><td style="text-align: center;">${item.id || ''}</td><td style="text-align: center;">${item.quantity}</td><td style="text-align: right;">${new Intl.NumberFormat('vi-VN').format(unitPrice)}</td><td style="text-align: right;">${new Intl.NumberFormat('vi-VN').format(lineTotal)}</td></tr>`;
            });
        }

        const rentalDays = rInfo.rentalDays || 1;
        const totalRentalPrice = sub * rentalDays;
        const deposit = Math.round(totalRentalPrice / 2);

        let html = `<html><head><title>Hợp Đồng Thuê Đồ #${orderId}</title>
<style>
    body { font-family: 'Times New Roman', Times, serif; line-height: 1.5; margin: 40px; color: #000; font-size: 13pt; }
    h1, h2, h3, h4 { text-align: center; margin: 5px 0; }
    .header { text-align: center; margin-bottom: 20px; }
    .title { font-weight: bold; font-size: 16pt; margin: 15px 0 5px 0; }
    .section-title { font-weight: bold; margin-top: 15px; font-size: 13pt; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12pt; }
    th, td { border: 1px solid #000; padding: 6px; text-align: left; }
    th { text-align: center; font-weight: bold; }
    p { margin: 5px 0; }
    .signatures { display: flex; justify-content: space-around; margin-top: 30px; text-align: center; }
</style>
</head><body>
<div class="header">
    <h3 style="font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h3>
    <h4 style="font-weight: bold; text-decoration: underline;">Độc lập - Tự do - Hạnh phúc</h4>
</div>
<div class="header">
    <div class="title">HỢP ĐỒNG CHO THUÊ ĐỒ SỰ KIỆN</div>
    <p>Số: ${orderId} / HĐTĐ</p>
</div>
<p style="text-align: right; font-style: italic;">Hôm nay, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}, tại Tiệm Nhà Gốm, chúng tôi gồm có:</p>

<div class="section-title">BÊN CHO THUÊ (BÊN A): HỘ KINH DOANH TIỆM NHÀ GỐM</div>
<p>- Địa chỉ: 37 Nguyễn Duy, Phường Gia Định, Tp.Hồ Chí Minh</p>
<p>- Điện thoại: 0777709662</p>
<p>- Người đại diện: Dương Minh Hiếu          Chức vụ: Chủ hộ kinh doanh</p>

<div class="section-title">BÊN THUÊ (BÊN B):</div>
<p>- Công ty/Cá nhân: <strong>${rInfo.companyName || (o.shippingAddress?.fullName || '...................................................')}</strong></p>
<p>- Người liên hệ: ${rInfo.contactName || o.shippingAddress?.fullName || '...................................................'}</p>
<p>- Mã số thuế: ${rInfo.taxCode || '...................................................'}</p>
<p>- Điện thoại: ${rInfo.phone || o.shippingAddress?.phone || '...................................................'}</p>
<p>- Email: ${rInfo.email || '...................................................'}</p>
<p>- Địa chỉ Setup: ${rInfo.address || '...................................................'}</p>

<p style="margin-top: 15px;">Hai bên thống nhất thỏa thuận ký kết hợp đồng thuê đồ trang trí với các điều khoản sau đây:</p>

<div class="section-title">ĐIỀU 1: NỘI DUNG VÀ CHI PHÍ THUÊ</div>
<p>Bên A đồng ý cho Bên B thuê các thiết bị, đồ trang trí phục vụ sự kiện với chi tiết như sau:</p>
<table>
    <thead><tr><th>STT</th><th>Tên sản phẩm</th><th>Mã SP</th><th>Số lượng</th><th>Đơn giá (VNĐ/ngày)</th><th>Thành tiền (VNĐ)</th></tr></thead>
    <tbody>
        ${itemsHtml}
        <tr>
            <td colspan="5" style="text-align: right; font-weight: bold;">Tổng cộng (VNĐ/ngày):</td>
            <td style="text-align: right; font-weight: bold;">${new Intl.NumberFormat('vi-VN').format(sub)}</td>
        </tr>
    </tbody>
</table>

<p style="margin-top: 10px;">- <strong>Thời gian thuê:</strong> ${rentalDays} ngày. Từ ngày <strong>${rInfo.rentalDate ? new Date(rInfo.rentalDate).toLocaleDateString('vi-VN') : '...'}</strong> đến ngày <strong>${rInfo.returnDate ? new Date(rInfo.returnDate).toLocaleDateString('vi-VN') : '...'}</strong>.</p>
<p>- <strong>Tổng giá trị hợp đồng (Tổng phí thuê):</strong> <strong>${new Intl.NumberFormat('vi-VN').format(totalRentalPrice)} VNĐ</strong></p>
<p>- <strong>Tiền đặt cọc (Bên B đặt cọc cho Bên A):</strong> <strong>${new Intl.NumberFormat('vi-VN').format(deposit)} VNĐ</strong></p>
<p style="font-style: italic;">(Tiền đặt cọc sẽ được hoàn trả lại cho Bên B sau khi Bên A nhận lại đủ đồ và không có hư hại, mất mát).</p>

<div class="section-title">ĐIỀU 2: TRÁCH NHIỆM CỦA CÁC BÊN</div>
<p><strong>1. Trách nhiệm của Bên A:</strong> Giao đồ đúng số lượng, chất lượng và thời gian như đã thỏa thuận.</p>
<p><strong>2. Trách nhiệm của Bên B:</strong><br/>
- Sử dụng đồ đúng mục đích, bảo quản cẩn thận trong suốt thời gian thuê.<br/>
- Hoàn trả đồ đúng thời hạn. Trường hợp quá hạn, Bên B phải thanh toán thêm phí thuê theo ngày phát sinh.<br/>
- Trường hợp làm mất mát, hư hỏng đồ, Bên B phải bồi thường theo giá trị niêm yết hiện hành của sản phẩm hoặc theo thỏa thuận đền bù của Bên A.</p>

<div class="section-title">ĐIỀU 3: ĐIỀU KHOẢN CHUNG</div>
<p>Hai bên cam kết thực hiện đúng các điều khoản trong hợp đồng. Mọi phát sinh tranh chấp sẽ được giải quyết trên tinh thần thương lượng. Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>

${rInfo.notes ? `<p><strong>Ghi chú thêm:</strong> ${rInfo.notes}</p>` : ''}

<div class="signatures">
    <div style="width: 50%;">
        <strong>ĐẠI DIỆN BÊN A</strong><br/>
        <em>(Ký, ghi rõ họ tên)</em><br/>
        <br/><br/><br/><br/>
        <strong>Tiệm Nhà Gốm</strong>
    </div>
    <div style="width: 50%;">
        <strong>ĐẠI DIỆN BÊN B</strong><br/>
        <em>(Ký, ghi rõ họ tên, đóng dấu nếu có)</em><br/>
        <br/><br/><br/><br/>
        <strong>${rInfo.companyName || rInfo.contactName || o.shippingAddress?.fullName || '..........................'}</strong>
    </div>
</div>
</body></html>`;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
    } catch (e) {
        console.error(e);
        window.showToast('Lỗi in hóa đơn', 'error');
    }
};

window.downloadRentalBillPDF = async (orderId) => {
    try {
        const docSnap = await getDoc(doc(db, 'orders', orderId));
        if (!docSnap.exists()) return;
        const o = docSnap.data();
        const rInfo = o.rentalInfo || {};

        let itemsHtml = '';
        let sub = 0;
        if (o.items && Array.isArray(o.items)) {
            o.items.forEach((item, index) => {
                let unitPrice = item.rentalPrice || item.price || 0;
                let lineTotal = item.quantity * unitPrice;
                sub += lineTotal;
                itemsHtml += `<tr><td style="text-align: center;">${index + 1}</td><td>${item.name}</td><td style="text-align: center;">${item.id || ''}</td><td style="text-align: center;">${item.quantity}</td><td style="text-align: right;">${new Intl.NumberFormat('vi-VN').format(unitPrice)}</td><td style="text-align: right;">${new Intl.NumberFormat('vi-VN').format(lineTotal)}</td></tr>`;
            });
        }

        const rentalDays = rInfo.rentalDays || 1;
        const totalRentalPrice = sub * rentalDays;
        const deposit = Math.round(totalRentalPrice / 2);

        const container = document.createElement('div');
        container.style.padding = '20px';
        container.style.background = '#ffffff';
        container.style.color = '#000000';
        container.style.fontFamily = "'Times New Roman', Times, serif";
        container.style.fontSize = '12pt';
        container.style.lineHeight = '1.5';

        container.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3 style="font-weight: bold; margin: 5px 0;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h3>
                <h4 style="font-weight: bold; text-decoration: underline; margin: 5px 0;">Độc lập - Tự do - Hạnh phúc</h4>
            </div>
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-weight: bold; font-size: 16pt; margin: 15px 0 5px 0;">HỢP ĐỒNG CHO THUÊ ĐỒ SỰ KIỆN</div>
                <p style="margin: 5px 0;">Số: ${orderId} / HĐTĐ</p>
            </div>
            <p style="text-align: right; font-style: italic; margin: 5px 0;">Hôm nay, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}, tại Tiệm Nhà Gốm, chúng tôi gồm có:</p>
            
            <div style="font-weight: bold; margin-top: 15px; font-size: 13pt; text-transform: uppercase;">BÊN CHO THUÊ (BÊN A): HỘ KINH DOANH TIỆM NHÀ GỐM</div>
            <p style="margin: 5px 0;">- Địa chỉ: 37 Nguyễn Duy, Phường Gia Định, Tp.Hồ Chí Minh</p>
            <p style="margin: 5px 0;">- Điện thoại: 0777709662</p>
            <p style="margin: 5px 0;">- Người đại diện: Dương Minh Hiếu          Chức vụ: Chủ hộ kinh doanh</p>
            
            <div style="font-weight: bold; margin-top: 15px; font-size: 13pt; text-transform: uppercase;">BÊN THUÊ (BÊN B):</div>
            <p style="margin: 5px 0;">- Công ty/Cá nhân: <strong>${rInfo.companyName || (o.shippingAddress?.fullName || '...................................................')}</strong></p>
            <p style="margin: 5px 0;">- Người liên hệ: ${rInfo.contactName || o.shippingAddress?.fullName || '...................................................'}</p>
            <p style="margin: 5px 0;">- Mã số thuế: ${rInfo.taxCode || '...................................................'}</p>
            <p style="margin: 5px 0;">- Điện thoại: ${rInfo.phone || o.shippingAddress?.phone || '...................................................'}</p>
            <p style="margin: 5px 0;">- Email: ${rInfo.email || '...................................................'}</p>
            <p style="margin: 5px 0;">- Địa chỉ Setup: ${rInfo.address || '...................................................'}</p>
            
            <p style="margin-top: 15px;">Hai bên thống nhất thỏa thuận ký kết hợp đồng thuê đồ trang trí với các điều khoản sau đây:</p>
            
            <div style="font-weight: bold; margin-top: 15px; font-size: 13pt; text-transform: uppercase;">ĐIỀU 1: NỘI DUNG VÀ CHI PHÍ THUÊ</div>
            <p style="margin: 5px 0;">Bên A đồng ý cho Bên B thuê các thiết bị, đồ trang trí phục vụ sự kiện với chi tiết như sau:</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12pt;">
                <thead>
                    <tr>
                        <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">STT</th>
                        <th style="border: 1px solid #000; padding: 6px; text-align: left; font-weight: bold;">Tên sản phẩm</th>
                        <th style="border: 1px solid #000; padding: 6px; text-align: left; font-weight: bold;">Mã SP</th>
                        <th style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">Số lượng</th>
                        <th style="border: 1px solid #000; padding: 6px; text-align: left; font-weight: bold;">Đơn giá (VNĐ/ngày)</th>
                        <th style="border: 1px solid #000; padding: 6px; text-align: left; font-weight: bold;">Thành tiền (VNĐ)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                    <tr>
                        <td colspan="5" style="border: 1px solid #000; padding: 6px; text-align: right; font-weight: bold;">Tổng cộng (VNĐ/ngày):</td>
                        <td style="border: 1px solid #000; padding: 6px; text-align: right; font-weight: bold;">${new Intl.NumberFormat('vi-VN').format(sub)}</td>
                    </tr>
                </tbody>
            </table>
            
            <p style="margin: 10px 0 5px 0;">- <strong>Thời gian thuê:</strong> ${rentalDays} ngày. Từ ngày <strong>${rInfo.rentalDate ? new Date(rInfo.rentalDate).toLocaleDateString('vi-VN') : '...'}</strong> đến ngày <strong>${rInfo.returnDate ? new Date(rInfo.returnDate).toLocaleDateString('vi-VN') : '...'}</strong>.</p>
            <p style="margin: 5px 0;">- <strong>Tổng giá trị hợp đồng (Tổng phí thuê):</strong> <strong>${new Intl.NumberFormat('vi-VN').format(totalRentalPrice)} VNĐ</strong></p>
            <p style="margin: 5px 0;">- <strong>Tiền đặt cọc (Bên B đặt cọc cho Bên A):</strong> <strong>${new Intl.NumberFormat('vi-VN').format(deposit)} VNĐ</strong></p>
            <p style="font-style: italic; margin: 5px 0;">(Tiền đặt cọc sẽ được hoàn trả lại cho Bên B sau khi Bên A nhận lại đủ đồ và không có hư hại, mất mát).</p>
            
            <div style="font-weight: bold; margin-top: 15px; font-size: 13pt; text-transform: uppercase;">ĐIỀU 2: TRÁCH NHIỆM CỦA CÁC BÊN</div>
            <p style="margin: 5px 0;"><strong>1. Trách nhiệm của Bên A:</strong> Giao đồ đúng số lượng, chất lượng và thời gian như đã thỏa thuận.</p>
            <p style="margin: 5px 0;"><strong>2. Trách nhiệm của Bên B:</strong><br/>
            - Sử dụng đồ đúng mục đích, bảo quản cẩn thận trong suốt thời gian thuê.<br/>
            - Hoàn trả đồ đúng thời hạn. Trường hợp quá hạn, Bên B phải thanh toán thêm phí thuê theo ngày phát sinh.<br/>
            - Trường hợp làm mất mát, hư hỏng đồ, Bên B phải bồi thường theo giá trị niêm yết hiện hành của sản phẩm hoặc theo thỏa thuận đền bù của Bên A.</p>
            
            <div style="font-weight: bold; margin-top: 15px; font-size: 13pt; text-transform: uppercase;">ĐIỀU 3: ĐIỀU KHOẢN CHUNG</div>
            <p style="margin: 5px 0;">Hai bên cam kết thực hiện đúng các điều khoản trong hợp đồng. Mọi phát sinh tranh chấp sẽ được giải quyết trên tinh thần thương lượng. Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>
            
            ${rInfo.notes ? `<p style="margin: 5px 0;"><strong>Ghi chú thêm:</strong> ${rInfo.notes}</p>` : ''}
            
            <div style="display: flex; justify-content: space-around; margin-top: 30px; text-align: center;">
                <div style="width: 50%;">
                    <strong>ĐẠI DIỆN BÊN A</strong><br/>
                    <em>(Ký, ghi rõ họ tên)</em><br/>
                    <br/><br/><br/><br/>
                    <strong>Tiệm Nhà Gốm</strong>
                </div>
                <div style="width: 50%;">
                    <strong>ĐẠI DIỆN BÊN B</strong><br/>
                    <em>(Ký, ghi rõ họ tên, đóng dấu nếu có)</em><br/>
                    <br/><br/><br/><br/>
                    <strong>${rInfo.companyName || rInfo.contactName || o.shippingAddress?.fullName || '..........................'}</strong>
                </div>
            </div>
        `;

        if (typeof html2pdf !== 'undefined') {
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `HopDongThueDo-#${orderId}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(container).save();
            window.showToast('Đã tải hợp đồng PDF', 'success');
        } else {
            window.showToast("Tính năng tải PDF chưa sẵn sàng, vui lòng thử lại sau.", "error");
        }

    } catch (e) {
        console.error(e);
        window.showToast('Lỗi tải hóa đơn PDF', 'error');
    }
};
