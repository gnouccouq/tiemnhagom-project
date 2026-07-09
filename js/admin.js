import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    db, auth, rtdb, storage, showToast, logout, DEFAULT_PRODUCT_CATEGORIES, formatPhoneNumber,
    fetchFlashSaleSettings, getProductCurrentPrice, globalFlashSaleSettings, getMembershipTier, generateOrderId, COLOR_MAP
} from "./utils.js";
import { 
    doc, setDoc, deleteDoc, collection, onSnapshot, getDoc, getDocs, query, orderBy, 
    limit, startAfter, endBefore, limitToLast, where, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref as dbRef, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Biến cục bộ để lưu trữ danh mục động
let adminDynamicCategories = []; // adminDynamicCategories sẽ là một MẢNG các đối tượng nhóm danh mục
let adminCollections = []; // Mảng chứa danh sách bộ sưu tập
let inventoryLogsLocal = []; // Mảng chứa dữ liệu nhật ký kho để lọc nhanh
let posUsersLocal = []; // Danh sách khách hàng để tìm kiếm nhanh trong POS
let userOrderCounts = {}; // Lưu trữ số lượng đơn hàng theo userId: { uid: count }
let userTotalSpentLocal = {}; // Lưu trữ tổng chi tiêu theo userId để thăng hạng
let currentReportData = null; // Lưu trữ dữ liệu báo cáo hiện tại để xuất Excel
let currentAdminRole = 'staff'; // Quyền mặc định
let bluetoothDevice = null;
let btCharacteristic = null;
let lastCreatedOrderId = null; // Lưu ID đơn vừa tạo để in lại nhanh

// Lắng nghe dữ liệu người dùng trực tuyến
function listenToOnlineUsers() {
    if (!rtdb) return;
    const presenceRef = dbRef(rtdb, 'presence');
    onValue(presenceRef, (snap) => {
        let count = 0;
        if (snap.exists()) {
            count = Object.keys(snap.val()).length;
        }
        const countEl = document.getElementById('online-users-count');
        if (countEl) countEl.innerText = count;
        
        // Cập nhật thẻ stat nếu có (đã bị xóa, hoặc tồn tại ở dashboard)
        const statEl = document.getElementById('stat-online-users');
        if(statEl) statEl.innerText = count;
    });
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
    { id: 'coupon-section', label: 'Mã giảm giá' },
    { id: 'category-section', label: 'Danh mục' },
    { id: 'user-section', label: 'Người dùng' },
    { id: 'admin-account-section', label: 'Quản trị viên' },
    { id: 'stats-section', label: 'Thống kê' },
    { id: 'flash-sale-settings-section', label: 'Cài đặt Flash Sale' },
    { id: 'inventory-log-section', label: 'Nhật ký kho' },
    { id: 'news-section', label: 'Tin tức' },
    { id: 'collections-section', label: 'Bộ sưu tập' },
    { id: 'online-users-section', label: 'Lượng truy cập' },
    { id: 'maintenance-section', label: 'Bảo trì' }
];

// Cấu hình phân quyền mặc định theo Role (Fallback)
const ROLE_PERMISSIONS = {
    super_admin: ALL_SECTIONS.map(s => s.id), // Tự động bao gồm tất cả các section cho super_admin
    staff: ['overview-section', 'pos-section', 'order-section', 'flash-sale-settings-section', 'product-section'] // Thêm mục Sale và Sản phẩm cho Staff
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

            // Kích hoạt tab và section được chọn
            tab.classList.add('active');
            const correspondingBottomBtn = document.querySelector(`.bottom-nav-btn[data-target="${targetId}"]`);
            if (correspondingBottomBtn) correspondingBottomBtn.classList.add('active');

            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
                // Cập nhật tiêu đề trang tương ứng với Tab
                titleEl.innerText = tab.innerText.replace(/[^\w\sÀ-ỹ]/g, '').trim();
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

            if (targetId === 'flash-sale-settings-section') {
                initFlashSaleSettings();
            }
        });
    });

    // Thiết lập listener cho Bottom Nav (Mobile)
    bottomNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return; // Nút 'Thêm' xử lý riêng bên dưới
            
            const sidebarTab = document.querySelector(`.admin-tab-btn[data-target="${targetId}"]`);
            if (sidebarTab) {
                sidebarTab.click();
                closeAdminSidebar();
            }
        });
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

async function initOverview() {
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toLocaleDateString('en-GB'); // Format DD/MM/YYYY
    }).reverse();

    try {
        // 1. Doanh thu & Đơn hàng
        const orderSnap = await getDocs(collection(db, "orders"));
        let totalRevenue = 0;
        let orderCount = orderSnap.size;
        
        const revenueHistory = new Array(7).fill(0);
        const ordersHistory = new Array(7).fill(0);

        orderSnap.forEach(doc => {
            const data = doc.data();
            const date = data.orderDate ? data.orderDate.toDate().toLocaleDateString('en-GB') : null;
            const dayIndex = last7Days.indexOf(date);

            if (data.status === "Đã hoàn thành") {
                const amount = (data.totalAmount || 0);
                totalRevenue += amount;
                if (dayIndex !== -1) revenueHistory[dayIndex] += amount;
            }
            if (dayIndex !== -1) ordersHistory[dayIndex]++;
        });

        // 2. Sản phẩm (Lấy từ cache posProductsLocal nếu đã có)
        const productSnap = await getDocs(collection(db, "products"));
        let productCount = productSnap.size;

        // 3. Khách hàng
        const userSnap = await getDocs(collection(db, "users"));
        let userCount = userSnap.size;

        // 4. Render 5 Đơn hàng mới nhất cho Overview
        const recentOrdersContainer = document.getElementById('overview-recent-orders');
        if (recentOrdersContainer) {
            const recentOrders = orderSnap.docs
                .map(d => ({id: d.id, ...d.data()}))
                .sort((a, b) => b.orderDate?.toDate() - a.orderDate?.toDate())
                .slice(0, 5);
            
            recentOrdersContainer.innerHTML = recentOrders.map(o => `
                <tr>
                    <td data-label="Khách hàng"><strong>${o.shippingAddress?.fullName || 'Khách vãng lai'}</strong></td>
                    <td data-label="Tổng tiền">${new Intl.NumberFormat('vi-VN').format(o.totalAmount)} VND</td>
                    <td data-label="Trạng thái"><span class="order-status-${o.status.toLowerCase().replace(/\s/g, '-')}">${o.status}</span></td>
                </tr>
            `).join('');
        }

        // 5. Render Sản phẩm sắp hết hàng (Tồn kho < 5)
        const lowStockContainer = document.getElementById('overview-low-stock-list');
        if (lowStockContainer) {
            const lowStockProducts = productSnap.docs
                .map(d => ({id: d.id, ...d.data()}))
                .filter(p => (p.stock || 0) < 5)
                .sort((a, b) => (a.stock || 0) - (b.stock || 0))
                .slice(0, 5);

            lowStockContainer.innerHTML = lowStockProducts.length > 0 ? lowStockProducts.map(p => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #fffcf5; border-radius: 8px; border-left: 4px solid #f1c40f;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${p.imageUrl}" style="width: 35px; height: 35px; border-radius: 4px; object-fit: cover;">
                        <div style="font-size: 0.85rem; font-weight: 600;">${p.name}</div>
                    </div>
                    <div style="color: #e74c3c; font-weight: 700; font-size: 0.85rem;">Còn ${p.stock || 0}</div>
                </div>
            `).join('') : '<p style="color: #27ae60; font-size: 0.85rem; text-align: center;">Tồn kho đang rất ổn định ✨</p>';
        }

        // Cập nhật UI với hiệu ứng số nhảy
        animateNumber('stat-total-revenue', totalRevenue, true);
        animateNumber('stat-total-orders', orderCount);
        animateNumber('stat-total-products', productCount);
        animateNumber('stat-total-users', userCount);

        // Vẽ Sparklines
        renderSparkline('sparkline-revenue', revenueHistory, '#1976d2');
        renderSparkline('sparkline-orders', ordersHistory, '#388e3c');
        // Với Sản phẩm và Người dùng, ta có thể dùng dữ liệu mẫu hoặc trend đăng ký mới
        renderSparkline('sparkline-products', [productCount-2, productCount-1, productCount-1, productCount, productCount, productCount, productCount], '#f57c00');
        renderSparkline('sparkline-users', [userCount-3, userCount-3, userCount-2, userCount-2, userCount-1, userCount, userCount], '#7b1fa2');

    } catch (e) { console.error("Lỗi khởi tạo Overview:", e); }
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

window.openProductModal = function() {
    if(productModal) productModal.classList.add('active');
};

window.closeProductModal = function() {
    if(productModal) productModal.classList.remove('active');
    if(productForm) {
        productForm.reset();
        document.getElementById('variant-items-container').innerHTML = '';
        document.getElementById('pattern-variant-items-container').innerHTML = '';
        document.getElementById('image-preview-container').innerHTML = '';
        delete document.getElementById('productId').dataset.currentImageUrl;
        delete document.getElementById('productId').dataset.currentAdditionalImages;
        delete document.getElementById('productId').dataset.currentThumbUrl;
        document.getElementById('productId').readOnly = false;
        
        const titleEl = document.getElementById('product-modal-title');
        if(titleEl) titleEl.innerText = 'Thêm/Sửa sản phẩm';
        
        const additiveCheckbox = document.getElementById('stock-additive');
        const stockInput = document.getElementById('stock');
        if (additiveCheckbox) additiveCheckbox.checked = false;
        if (stockInput) {
            stockInput.disabled = false;
            stockInput.placeholder = "10";
        }
        if (additiveCheckbox) additiveCheckbox.disabled = false;
    }
};

if(btnOpenProductModal) {
    btnOpenProductModal.addEventListener('click', () => {
        window.closeProductModal(); // clean form
        const titleEl = document.getElementById('product-modal-title');
        if(titleEl) titleEl.innerText = 'Thêm sản phẩm mới';
        window.openProductModal();
    });
}
if(btnCloseProductModal) {
    btnCloseProductModal.addEventListener('click', window.closeProductModal);
}

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
    container.innerHTML = '';

    const mainUrl = productIdEl.dataset.currentImageUrl;
    const additionalUrls = JSON.parse(productIdEl.dataset.currentAdditionalImages || '[]');

    // Gom tất cả ảnh lại để hiển thị
    const allUrls = [];
    if (mainUrl && mainUrl !== 'https://via.placeholder.com/300') allUrls.push({ url: mainUrl, isMain: true });
    additionalUrls.forEach(url => allUrls.push({ url: url, isMain: false }));

    allUrls.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <img src="${item.url}" alt="Ảnh xem trước ${index + 1}">
            <button type="button" class="remove-preview" title="Xóa ảnh này">&times;</button>
            ${item.isMain ? '<span style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.5); color:#fff; font-size:9px; text-align:center;">Ảnh chính</span>' : ''}
        `;
        div.querySelector('.remove-preview').onclick = () => {
            if (item.isMain) {
                productIdEl.dataset.currentImageUrl = additionalUrls.length > 0 ? additionalUrls.shift() : '';
                productIdEl.dataset.currentAdditionalImages = JSON.stringify(additionalUrls);
            } else {
                const filtered = additionalUrls.filter(u => u !== item.url);
                productIdEl.dataset.currentAdditionalImages = JSON.stringify(filtered);
            }
            renderImagePreviews();
        };
        container.appendChild(div);
    });
}

// --- Logic Quản lý Biến thể Màu sắc & Ảnh ---
window.addVariantRow = (name = '', imageUrl = '', stock = 0) => {
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
        <div style="width: 80px;">
            <input type="number" class="variant-stock" value="${stock}" placeholder="Kho" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div class="variant-img-preview" style="width: 45px; height: 45px; background: #eee; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; cursor: pointer; position: relative;" title="Chọn ảnh cho màu này">
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

window.addPatternVariantRow = (name = '', imageUrl = '', stock = 0) => {
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
        <div style="width: 80px;">
            <input type="number" class="variant-stock" value="${stock}" placeholder="Kho" style="padding: 8px; border: 1px solid #ddd; width: 100%; border-radius: 4px; font-family: inherit;">
        </div>
        <div class="variant-img-preview" style="width: 45px; height: 45px; background: #eee; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; cursor: pointer; position: relative;" title="Chọn ảnh cho họa tiết này">
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
    if(!confirm("Xóa ảnh này khỏi gallery?")) return;
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

// --- Logic Quản lý Danh mục Động ---
let categoryUnsubscribe = null;

function initCategoryManagement() {
    const treeContainer = document.getElementById('admin-category-tree');
    const datalist = document.getElementById('existing-groups');
    const form = document.getElementById('category-management-form');

    if (!treeContainer || !form || !db) return;

    // Thiết lập lắng nghe bộ sưu tập để hiện checkbox trong form sản phẩm
    initCollectionManagement();

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
window.comboItems = [];

window.toggleComboSection = function() {
    const type = document.querySelector('input[name="product-type"]:checked').value;
    const comboSection = document.getElementById('combo-section');
    const stockInput = document.getElementById('stock');
    if (type === 'combo') {
        comboSection.style.display = 'block';
        if (stockInput) stockInput.value = ''; // Combo không quản lý tồn kho trực tiếp ở đây, hoặc nhập tay tùy ý
    } else {
        comboSection.style.display = 'none';
    }
};

window.renderComboItems = function() {
    const list = document.getElementById('combo-items-list');
    if (!list) return;
    if (window.comboItems.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #999; font-size: 0.85rem; padding: 10px;">Chưa chọn sản phẩm nào cho combo.</div>';
        return;
    }
    
    list.innerHTML = window.comboItems.map((item, idx) => {
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

window.addComboItem = function(product) {
    const existing = window.comboItems.find(i => i.id === product.id);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        window.comboItems.push({
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

window.updateComboItemVariant = function(idx, type, value) {
    if (type === 'color') window.comboItems[idx].selectedColor = value;
    if (type === 'pattern') window.comboItems[idx].selectedPattern = value;
};

window.removeComboItem = function(idx) {
    window.comboItems.splice(idx, 1);
    window.renderComboItems();
};

window.updateComboItemQty = function(idx, qty) {
    qty = parseInt(qty);
    if (qty > 0) {
        window.comboItems[idx].quantity = qty;
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
    
    const productId = document.getElementById('productId').value.trim();
    const imageFiles = document.getElementById('imageFile').files;
    const submitBtn = document.getElementById('submit-product-btn'); // Sử dụng ID để tìm nút submit
    
    if (!productId) {
        showToast("Vui lòng nhập Mã sản phẩm (SKU)", "error");
        return;
    }

    const price = Number(document.getElementById('price').value);
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
            let variantUrl = row.dataset.currentUrl || null;

            if (file) {
                const webpFile = await convertToWebP(file, 800);
                const vRef = ref(storage, `products/${productId}/variants/${Date.now()}_${webpFile.name}`);
                const vSnap = await uploadBytes(vRef, webpFile);
                variantUrl = await getDownloadURL(vSnap.ref);
            }
            return { name, imageUrl: variantUrl, stock };
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
            let variantUrl = row.dataset.currentUrl || null;

            if (file) {
                const webpFile = await convertToWebP(file, 800);
                const vRef = ref(storage, `products/${productId}/patterns/${Date.now()}_${webpFile.name}`);
                const vSnap = await uploadBytes(vRef, webpFile);
                variantUrl = await getDownloadURL(vSnap.ref);
            }
            return { name, imageUrl: variantUrl, stock };
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
                            getDownloadURL(uploadTask.snapshot.ref).then(fullUrl => resolve({fullUrl, thumbUrl})).catch(reject);
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

        const finalImageUrl = currentMain || 'https://placehold.co/300x300?text=No+Image';

        const isCombo = document.querySelector('input[name="product-type"]:checked').value === 'combo';

        // 2. Lưu thông tin vào Firestore
    const productData = {
        name: document.getElementById('name').value,
        name_lowercase: document.getElementById('name').value.toLowerCase(), // Thêm trường này cho tìm kiếm
        category: document.getElementById('category').value,
        collections: collectionsList,
        price: Number(document.getElementById('price').value), // Base price
        cost: Number(document.getElementById('cost').value || 0),
        stock: finalStock,
        sale: Number(document.getElementById('sale').value || 0),
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
        isCombo: isCombo,
        comboItems: isCombo ? window.comboItems : [],
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

// Hàm hiển thị bảng sản phẩm Admin (có hỗ trợ lọc tìm kiếm và sắp xếp)
function renderAdminProductTable() {
    const listTable = document.getElementById('admin-product-list');
    const searchInput = document.getElementById('admin-product-search');
    const categoryFilter = document.getElementById('admin-product-category-filter');
    const stockFilter = document.getElementById('admin-product-stock-filter');
    if (!listTable) return;

    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const catValue = categoryFilter ? categoryFilter.value : 'all';
    const stockValue = stockFilter ? stockFilter.value : 'all';

    // Lọc sản phẩm dựa trên từ khóa tìm kiếm từ mảng local đã cache
    let filtered = posProductsLocal.filter(p => {
        const matchesSearch = (p.name || "").toLowerCase().includes(term) || p.id.toLowerCase().includes(term);
        const matchesCategory = catValue === 'all' || p.category === catValue;
        const matchesStock = stockValue === 'all' || 
                           (stockValue === 'in-stock' && p.stock > 0) || 
                           (stockValue === 'out-of-stock' && p.stock <= 0);
        return matchesSearch && matchesCategory && matchesStock;
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

    let htmlContent = '';
    filtered.forEach((p) => {
        const stockDisplay = p.stock <= 0 
            ? `<span class="stock-badge stock-out">Hết hàng</span>` 
            : p.stock;

        let displayImgUrl = p.thumbUrl || p.imageUrl;
        if (!displayImgUrl || displayImgUrl.includes('placehold.co') || displayImgUrl === 'https://placehold.co/300x300?text=No+Image') {
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
            <tr>
                <td style="text-align: center;"><input type="checkbox" class="product-row-checkbox" value="${p.id}"></td>
                <td style="text-align: center; color: ${p.isFeatured ? '#f1c40f' : '#ccc'}; cursor: pointer;" class="star-toggle" data-id="${p.id}">⭐</td>
                <td data-label="Ảnh"><img src="${displayImgUrl}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                <td data-label="Mã hàng"><small>${p.id}</small></td>
                <td data-label="Tên hàng">
                    <a href="javascript:void(0)" class="edit-link" data-id="${p.id}" style="color: var(--text-black); font-weight: 600; text-decoration: none;">${p.name}</a>
                    ${p.isHidden ? '<span style="display:inline-block; margin-left: 8px; padding: 2px 6px; background: #ffeeba; color: #856404; font-size: 0.7rem; border-radius: 4px; font-weight: bold;">Đang ẩn</span>' : ''}
                    ${p.isCombo ? '<span style="display:inline-block; margin-left: 8px; padding: 2px 6px; background: #d0e8ff; color: #0056b3; font-size: 0.7rem; border-radius: 4px; font-weight: bold;">Combo</span>' : ''}
                </td>
                <td data-label="Giá bán">${new Intl.NumberFormat('vi-VN').format(p.price)}</td>
                <td data-label="Giá vốn">${new Intl.NumberFormat('vi-VN').format(p.cost || 0)}</td>
                <td data-label="Tồn kho">${p.isCombo ? '-' : stockDisplay}</td>
                <td data-label="Khách đặt">${p.sold || 0}</td>
                <td data-label="Thời gian tạo">${formattedDate}</td>
                <td data-label="Sale">${p.sale || 0}%</td>
                <td data-label="Thao tác">
                    <button class="btn-delete" data-id="${p.id}">Xóa</button>
                </td>
            </tr>`;
    });
    
    listTable.innerHTML = htmlContent || '<tr><td colspan="12" style="text-align:center;">Không tìm thấy sản phẩm phù hợp.</td></tr>';

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

    // Gán lại sự kiện cho các nút mới render
    document.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = () => deleteProduct(btn.getAttribute('data-id')));
    document.querySelectorAll('.edit-link').forEach(link => link.onclick = () => editProduct(link.getAttribute('data-id')));
}

// Lắng nghe sự kiện click vào các tiêu đề cột để sắp xếp
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
            if(titleEl) titleEl.innerText = 'Sửa sản phẩm: ' + (p.name || id);
            
            // Điền dữ liệu vào form
            document.getElementById('productId').value = id;
            document.getElementById('productId').readOnly = true;
            document.getElementById('name').value = p.name;
            document.getElementById('category').value = p.category;
            document.getElementById('price').value = p.price;
            document.getElementById('cost').value = p.cost || 0;
            document.getElementById('stock').value = p.stock;
            document.getElementById('sale').value = p.sale || 0;
            document.getElementById('flash-sale-group-select').value = p.flashSaleGroup || "";

            // Xử lý nạp dữ liệu Combo
            if (p.isCombo) {
                document.querySelector('input[name="product-type"][value="combo"]').checked = true;
                window.comboItems = p.comboItems || [];
            } else {
                document.querySelector('input[name="product-type"][value="normal"]').checked = true;
                window.comboItems = [];
            }
            window.toggleComboSection();
            window.renderComboItems();

            document.getElementById('dim-length').value = p.dimensions?.length || '';
            document.getElementById('dim-width').value = p.dimensions?.width || '';
            document.getElementById('dim-height').value = p.dimensions?.height || '';
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

            // Vô hiệu hóa trường tồn kho và checkbox "Nhập thêm" nếu có biến thể
            const hasVariants = (p.colorVariants && p.colorVariants.length > 0) || (p.patternVariants && p.patternVariants.length > 0);
            toggleStockInputState(hasVariants);
            
            // Xóa và nạp lại các hàng biến thể màu sắc
            const variantContainer = document.getElementById('variant-items-container');
            if (variantContainer) {
                variantContainer.innerHTML = '';
                if (p.colorVariants && Array.isArray(p.colorVariants)) {
                    p.colorVariants.forEach(v => window.addVariantRow(v.name, v.imageUrl, v.stock || 0));
                }
            }

            // Xóa và nạp lại các hàng biến thể họa tiết
            const patternContainer = document.getElementById('pattern-variant-items-container');
            if (patternContainer) {
                patternContainer.innerHTML = '';
                if (p.patternVariants && Array.isArray(p.patternVariants)) {
                    p.patternVariants.forEach(v => window.addPatternVariantRow(v.name, v.imageUrl, v.stock || 0));
                } else if (p.patterns && Array.isArray(p.patterns)) {
                    // Hỗ trợ migrate dữ liệu cũ từ array string sang variant row (chưa có ảnh/stock)
                    p.patterns.forEach(name => window.addPatternVariantRow(name, '', 0));
                }
            }

            // Reset checkbox nhập thêm khi load dữ liệu sửa sản phẩm khác
            const additiveCheckbox = document.getElementById('stock-additive');
            if (additiveCheckbox) additiveCheckbox.checked = false;

            document.getElementById('description').value = p.description || '';
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
        }, (error) => {
            console.error("Order list listener error:", error);
        });
    } else {
        renderOrdersFiltered();
    }
}

function renderOrdersFiltered() {
    const orderListTable = document.getElementById('admin-order-list');
    const prevBtn = document.getElementById('prev-order-page');
    const nextBtn = document.getElementById('next-order-page');
    const pageInfo = document.getElementById('order-page-info');
    
    if (!orderListTable) return;

    // Lấy các giá trị bộ lọc
    const idVal = document.getElementById('order-filter-id')?.value.trim().toLowerCase() || '';
    const productVal = document.getElementById('order-filter-product')?.value.trim().toLowerCase() || '';
    const statusVal = document.getElementById('order-filter-status')?.value || 'all';

    // Lọc đơn hàng
    let filtered = allOrdersCache.filter(order => {
        const matchesId = !idVal || order.id.toLowerCase().includes(idVal);
        const matchesProduct = !productVal || order.items.some(item => (item.name || "").toLowerCase().includes(productVal));
        const matchesStatus = statusVal === 'all' || order.status === statusVal;
        const matchesUserId = !currentOrderUserIdFilter || order.userId === currentOrderUserIdFilter;
        return matchesId && matchesProduct && matchesStatus && matchesUserId;
    });

    // Sắp xếp theo ngày đặt (Date/Timestamp) giảm dần
    filtered.sort((a, b) => {
        const dateA = a.orderDate ? (a.orderDate.toDate ? a.orderDate.toDate() : new Date(a.orderDate)) : new Date(0);
        const dateB = b.orderDate ? (b.orderDate.toDate ? b.orderDate.toDate() : new Date(b.orderDate)) : new Date(0);
        return dateB - dateA;
    });

    // Phân trang
    const totalPages = Math.ceil(filtered.length / ORDER_PAGE_SIZE) || 1;
    if (currentOrderPage > totalPages) {
        currentOrderPage = totalPages;
    }

    const startIndex = (currentOrderPage - 1) * ORDER_PAGE_SIZE;
    const endIndex = startIndex + ORDER_PAGE_SIZE;
    const pageOrders = filtered.slice(startIndex, endIndex);

    // Hiển thị các dòng đơn hàng
    renderOrderRows(pageOrders, orderListTable);

    // Cập nhật các nút phân trang
    if (pageInfo) pageInfo.innerText = `Trang ${currentOrderPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentOrderPage === 1;
    if (nextBtn) nextBtn.disabled = currentOrderPage === totalPages;
}

function renderOrderRows(ordersList, tableElement) {
    let htmlContent = '';
    ordersList.forEach((order) => {
        const orderId = order.id;
        const orderDate = order.orderDate 
            ? (order.orderDate.toDate ? new Date(order.orderDate.toDate()) : new Date(order.orderDate)).toLocaleString('vi-VN') 
            : 'N/A';
        const totalAmount = new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0);
        const status = order.status || 'Đang xử lý';

        htmlContent += `
            <tr>
                <td data-label="Mã đơn"><small>${orderId}</small></td>
                <td data-label="Ngày đặt">${orderDate}</td>
                <td data-label="Khách hàng">
                    <strong>${order.shippingAddress?.fullName || 'Khách vãng lai'}</strong><br>
                    <small>${order.shippingAddress?.phone || ''}</small>
                </td>
                <td data-label="Sản phẩm">
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        ${order.items.map(i => `
                            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem;">
                                <img src="${i.image}" alt="${i.name}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">
                                <span title="${i.name}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${i.name} x${i.quantity}</span>
                            </div>
                        `).join('')}
                    </div>
                </td>
                <td data-label="Tổng tiền">${totalAmount} VND</td>
                <td data-label="Trạng thái">
                    <select class="status-select" onchange="window.updateOrderStatus('${orderId}', this.value)">
                        <option value="Đang xử lý" ${status === 'Đang xử lý' ? 'selected' : ''}>Đang xử lý</option>
                        <option value="Đã thanh toán" ${status === 'Đã thanh toán' ? 'selected' : ''}>Đã thanh toán</option>
                        <option value="Đang giao hàng" ${status === 'Đang giao hàng' ? 'selected' : ''}>Đang giao hàng</option>
                        <option value="Đã hoàn thành" ${status === 'Đã hoàn thành' ? 'selected' : ''}>Đã hoàn thành</option>
                        <option value="Đã hủy" ${status === 'Đã hủy' ? 'selected' : ''}>Đã hủy</option>
                    </select>
                </td>
                <td data-label="Thao tác">
                    <button class="btn-minimal" onclick="window.viewAdminOrderDetail('${orderId}')">Chi tiết</button>
                    <button class="btn-minimal" style="border-color: #2c3e50; color: #2c3e50;" onclick="window.printOrderBill('${orderId}')">In Bill</button>
                </td>
            </tr>
        `;
    });
    tableElement.innerHTML = htmlContent || '<tr><td colspan="7" style="text-align:center;">Chưa có đơn hàng nào.</td></tr>';
}

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

window.updateOrderStatus = async (orderId, newStatus) => {
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

        await setDoc(doc(db, "orders", orderId), { status: newStatus }, { merge: true });
        showToast(`Đã cập nhật trạng thái đơn hàng #${orderId} thành: ${newStatus}`);
    } catch (error) {
        showToast("Lỗi cập nhật: " + error.message, "error");
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
        // Chuẩn hóa thông tin khách hàng để khớp với hàm in POS
        const customer = {
            name: o.shippingAddress?.fullName || "Khách vãng lai",
            phone: o.shippingAddress?.phone || "N/A",
            paymentMethod: o.paymentMethod || 'Tiền mặt'
        };
        // Tính toán lại chiết khấu và phí vận chuyển để in bill đầy đủ thông tin
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
        if (membershipDiscount > 0) {
            pricingDetailsHtml += `
                <div style="display: flex; justify-content: space-between; font-size: 0.95rem; margin-bottom: 8px; color: #27ae60;">
                    <span>Giảm giá thành viên (VIP):</span>
                    <span>-${new Intl.NumberFormat('vi-VN').format(membershipDiscount)}đ</span>
                </div>
            `;
        }

        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                <h3>Chi tiết đơn hàng #${orderId}</h3>
                <button class="btn-dark" style="margin: 15px 0; width: 100%; height: 45px; display: flex; align-items: center; justify-content: center; gap: 10px;" onclick="window.printOrderBill('${orderId}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg> In hóa đơn (Bill)
                </button>
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

function renderAdminUserTable() {
    const userListTable = document.getElementById('admin-user-list');
    const searchInput = document.getElementById('admin-user-search');
    if (!userListTable) return;

    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const adminDataMap = window.adminDataMapLocal || new Map();

    const filtered = posUsersLocal.filter(u => {
        return (u.displayName || "").toLowerCase().includes(term) || 
               (u.phone || "").includes(term) || 
               (u.email || "").toLowerCase().includes(term) ||
               (u.identifiers || []).some(id => id.toLowerCase().includes(term));
    });

    let htmlContent = '';
    filtered.forEach((u) => {
            const updatedAt = u.updatedAt ? new Date(u.updatedAt).toLocaleDateString('vi-VN') : 'N/A';
            const birthday = u.birthday ? new Date(u.birthday).toLocaleDateString('vi-VN') : 'N/A';
            const adminData = adminDataMap.get(u.id);
            const isAdminUser = !!adminData;
            
            let adminBadge = '';
            if (isAdminUser) adminBadge = `<span class="admin-text-badge" style="font-size: 0.55rem;">Admin</span>`;

            // Tính toán hạng thành viên dựa trên tổng chi tiêu đã được tổng hợp
            const spent = userTotalSpentLocal[u.id] || 0;
            const tier = getMembershipTier(spent);
            const tierBadge = `<span class="stock-badge" style="background:${tier.color}; color:#fff; border:none; text-transform:none; padding: 2px 8px; border-radius: 20px;">${tier.name}</span>`;

            let adminActionBtn = '';
            if (currentAdminRole === 'super_admin') {
                const isLocked = adminData?.isLocked || false;
                const lockBtn = isAdminUser ? `
                    <button class="btn-minimal" style="font-size: 0.7rem; border-color: ${isLocked ? '#27ae60' : '#f39c12'}; color: ${isLocked ? '#27ae60' : '#f39c12'}; margin-left: 5px;" 
                        onclick="window.toggleAccountLock('${u.id}', ${!isLocked})">
                        ${isLocked ? 'Mở khóa' : 'Khóa'}
                    </button>` : ''; // Note: Các nút này vẫn để ở user list để gán quyền nhanh

                adminActionBtn = isAdminUser 
                    ? `<button class="btn-delete" style="text-decoration:none; color:#e74c3c; font-size:0.7rem;" onclick="window.toggleAdminPrivilege('${u.id}', false)">Gỡ Admin</button>`
                      + `<button class="btn-minimal" style="font-size: 0.7rem; border-color: #3498db; color: #3498db; margin:0 5px;" onclick="window.editAdminPermissions('${u.id}', '${u.email || u.displayName || ''}')">Quyền</button>`
                      + lockBtn
                    : `<button class="btn-minimal" style="font-size: 0.7rem; border-color: #27ae60; color: #27ae60;" onclick="window.toggleAdminPrivilege('${u.id}', true, '${u.email || u.displayName || ''}')">Gán Admin</button>`;
            }

            htmlContent += `
                <tr>
                    <td data-label="Người dùng">
                        <strong>${u.displayName || u.email || u.phoneNumber || 'Khách vãng lai'} ${adminBadge}</strong><br>
                        <small style="color: #888;">ID: ${u.id}</small>
                    </td>
                    <td data-label="SĐT">${formatPhoneNumber(u.phoneNumber || u.phone) || '---'}</td>
                    <td data-label="Giới tính">${u.gender || '---'}</td>
                    <td data-label="Ngày sinh">${birthday}</td>
                    <td data-label="Hạng thẻ">${tierBadge}</td>
                    <td data-label="Cập nhật">${updatedAt}</td>
                    <td data-label="Thao tác" style="display: flex; gap: 5px; justify-content: flex-end;">
                        ${adminActionBtn}
                        <button class="btn-minimal" style="border-color:var(--text-black); color:var(--text-black);" onclick="window.viewAdminUserDetail('${u.id}')">Chi tiết</button>
                        <button class="btn-minimal" onclick="window.viewUserOrders('${u.id}')">Đơn hàng</button>
                    </td>
                </tr>
            `;
    });
    userListTable.innerHTML = htmlContent || '<tr><td colspan="7" style="text-align:center;">Không tìm thấy khách hàng phù hợp.</td></tr>';
}

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
            const secondaryAuth = auth.app.options ? onAuthStateChanged(auth, () => {}) : null; // Dùng Auth của instance mới
            // (Lưu ý: createUserWithEmailAndPassword yêu cầu auth instance)
            const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
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
            const { deleteApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
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
            document.getElementById('coupon-value').value = c.value;
            document.getElementById('coupon-max-discount').value = c.maxDiscount || 0;
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
        const value = Number(document.getElementById('coupon-value').value);
        const maxDiscount = Number(document.getElementById('coupon-max-discount').value || 0);
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

// --- Logic POS (Bán tại shop) ---
let posCart = [];
window.currentPOSCustomerId = null;
let posMembershipDiscountPercent = 0; // Tỷ lệ giảm giá theo hạng thành viên
let posDiscountPercent = 0; // Biến lưu tỷ lệ chiết khấu

function renderPOSCart() {
    const list = document.getElementById('pos-cart-list');
    const totalInput = document.getElementById('pos-total-amount');
    const discountInfo = document.getElementById('pos-discount-info');
    if (!list) return;

    if (posCart.length === 0) {
        list.innerHTML = '<p style="color: #999; font-size: 0.9rem; text-align: center; margin-top: 2rem;">Chưa có sản phẩm nào được chọn.</p>';
        if (totalInput) totalInput.value = "0";
        if (discountInfo) discountInfo.style.display = 'none';
        posDiscountPercent = 0;
        return;
    }

    let subtotal = 0;
    list.innerHTML = posCart.map((item, index) => {
        let itemDiscount = 0;
        if (item.discountInput) {
            let discStr = String(item.discountInput).trim();
            if (discStr.endsWith('%')) {
                let p = parseFloat(discStr.replace('%', ''));
                if (!isNaN(p)) itemDiscount = Math.round(((item.price * item.quantity) * (p / 100)) / 1000) * 1000;
            } else {
                let val = parseFloat(discStr.replace(/,/g, ''));
                if (!isNaN(val)) itemDiscount = val;
            }
        }
        itemDiscount = Math.min(itemDiscount, item.price * item.quantity); // Không giảm quá tổng tiền
        const lineTotal = (item.price * item.quantity) - itemDiscount;
        subtotal += lineTotal;

        let itemDiscountHtml = '';
        if (itemDiscount > 0) {
            itemDiscountHtml = `<div style="font-size: 0.75rem; color: #27ae60;">Giảm: -${new Intl.NumberFormat('vi-VN').format(itemDiscount)}đ</div>`;
        }

        return `
            <div style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f5f5f5;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 0.9rem;">${item.name}</div>
                        <div style="font-size: 0.8rem; color: #666;">${new Intl.NumberFormat('vi-VN').format(item.price)} VND</div>
                        ${itemDiscountHtml}
                    </div>
                    <div class="quantity-controls" style="height: 30px;">
                        <button class="q-btn" style="width: 30px; height: 30px;" onclick="window.changePOSQty(${index}, -1)">-</button>
                        <input type="number" value="${item.quantity}" readonly style="width: 30px; height: 30px; border-left: 1px solid #ddd; border-right: 1px solid #ddd; padding: 0;">
                        <button class="q-btn" style="width: 30px; height: 30px;" onclick="window.changePOSQty(${index}, 1)">+</button>
                    </div>
                    <button onclick="window.removePOSItem(${index})" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1.2rem;">&times;</button>
                </div>
                <div style="display: flex; align-items: center; margin-top: 5px;">
                    <div style="position: relative; width: 100%;">
                        <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.85rem; color: #888;">⬇️</span>
                        <input type="text" placeholder="Giảm giá (VD: 10% hoặc 50000)" value="${item.discountInput || ''}" onchange="window.updatePOSItemDiscount(${index}, this.value)" style="width: 100%; padding: 8px 10px 8px 30px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 6px; outline: none; transition: 0.3s; background: #fff;" onfocus="this.style.borderColor='#3498db'; this.style.boxShadow='0 0 0 2px rgba(52,152,219,0.1)'" onblur="this.style.borderColor='#ddd'; this.style.boxShadow='none'">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Áp dụng mức chiết khấu cao nhất giữa hạng thành viên và giảm giá tay (trên phần tiền còn lại)
    const effectiveDiscount = Math.max(posDiscountPercent, posMembershipDiscountPercent);
    const discountVal = Math.round((subtotal * (effectiveDiscount / 100)) / 1000) * 1000;
    const total = subtotal - discountVal;

    if (totalInput) {
        totalInput.value = new Intl.NumberFormat('vi-VN').format(total);
        totalInput.dataset.val = total; // Lưu lại giá trị raw để tính tiền thừa
    }
    
    if (discountInfo) {
        if (effectiveDiscount > 0) {
            let label = `Đã chiết khấu ${effectiveDiscount}%`;
            if (posMembershipDiscountPercent > 0 && posMembershipDiscountPercent >= posDiscountPercent) {
                label = `Ưu đãi thành viên ${posMembershipDiscountPercent}%`;
            }
            discountInfo.innerText = `${label} (-${new Intl.NumberFormat('vi-VN').format(discountVal)} VND)`;
            discountInfo.style.display = 'block';
        } else {
            discountInfo.style.display = 'none';
        }
    }

    if (typeof window.calculatePOSChange === 'function') {
        window.calculatePOSChange();
    }
}

window.updatePOSItemDiscount = (index, val) => {
    if (posCart[index]) {
        posCart[index].discountInput = val;
        renderPOSCart();
    }
};

window.togglePOSCashSection = () => {
    const cashSection = document.getElementById('pos-cash-section');
    const isCash = document.querySelector('input[name="pos-payment"]:checked')?.value === 'Tiền mặt';
    if (cashSection) cashSection.style.display = isCash ? 'block' : 'none';
    if (!isCash) {
        const cashGiven = document.getElementById('pos-cash-given');
        const changeAmount = document.getElementById('pos-change-amount');
        if (cashGiven) cashGiven.value = '';
        if (changeAmount) changeAmount.value = '';
    } else {
        window.calculatePOSChange();
    }
};

window.calculatePOSChange = (inputElem) => {
    const input = inputElem || document.getElementById('pos-cash-given');
    if (!input) return;
    
    // Lọc bỏ ký tự không phải số
    let rawValue = input.value.replace(/,/g, '').replace(/[^\d]/g, '');
    if (rawValue) {
        input.value = new Intl.NumberFormat('vi-VN').format(rawValue);
    } else {
        input.value = '';
    }
    
    const cash = parseFloat(rawValue) || 0;
    const totalInput = document.getElementById('pos-total-amount');
    const total = parseFloat(totalInput?.dataset?.val || 0);
    
    const changeInput = document.getElementById('pos-change-amount');
    if (changeInput) {
        if (cash >= total && total > 0) {
            changeInput.value = new Intl.NumberFormat('vi-VN').format(cash - total);
        } else {
            changeInput.value = '';
        }
    }
};

window.applyQuickDiscount = (percent) => {
    if (posCart.length === 0) return;
    // Toggle logic: nhấn lại cùng mức % thì hủy bỏ
    posDiscountPercent = (posDiscountPercent === percent) ? 0 : percent;
    renderPOSCart();
};

window.changePOSQty = (index, delta) => {
    posCart[index].quantity += delta;
    if (posCart[index].quantity < 1) posCart[index].quantity = 1;
    renderPOSCart();
};

window.removePOSItem = (index) => {
    posCart.splice(index, 1);
    renderPOSCart();
};

window.addProductToPOS = (id, name, price, image) => {
    // Tìm thông tin sản phẩm trong cache local để kiểm tra tồn kho
    const productInfo = posProductsLocal.find(p => p.id === id);
    const currentStock = productInfo ? (productInfo.stock || 0) : 0;

    const existing = posCart.find(i => i.id === id);
    if (existing) {
        if (existing.quantity >= currentStock) {
            showToast(`Sản phẩm "${name}" chỉ còn tối đa ${currentStock} trong kho`, "error");
            return;
        }
        existing.quantity++;
    } else {
        if (currentStock <= 0) {
            showToast("Sản phẩm này đã hết hàng!", "error");
            return;
        }
        posCart.push({ id, name, price, cost: productInfo.cost || 0, image, quantity: 1 });
    }
    document.getElementById('pos-product-search').value = '';
    document.getElementById('pos-product-suggestions').style.display = 'none';
    renderPOSCart();
};

// Hàm hỗ trợ tính toán giảm giá thành viên POS
async function updatePOSMembershipDiscount(userId) {
    if (!userId || userId === 'guest') {
        posMembershipDiscountPercent = 0;
        renderPOSCart();
        return;
    }
    try {
        const q = query(collection(db, "orders"), where("userId", "==", userId), where("status", "==", "Đã hoàn thành"));
        const snap = await getDocs(q);
        let totalSpent = 0;
        snap.forEach(doc => totalSpent += (doc.data().totalAmount || 0));
        
        const tier = getMembershipTier(totalSpent);
        posMembershipDiscountPercent = tier.discount || 0;

        // Hiển thị tên hạng thẻ cạnh trạng thái khách hàng
        const statusEl = document.getElementById('pos-cust-status');
        if (statusEl) {
            statusEl.innerHTML = `✓ Khách hàng hệ thống | <span class="stock-badge" style="background:${tier.color}; color:#fff; border:none; text-transform:none; padding: 2px 8px; border-radius: 20px;">${tier.name}</span>`;
        }

        renderPOSCart();
    } catch (e) { console.error("Lỗi lấy hạng thành viên POS:", e); }
}

window.selectCustomerPOS = async (id, name, phone, email) => {
    document.getElementById('pos-cust-name').value = name || '';
    document.getElementById('pos-cust-phone').value = phone || '';
    document.getElementById('pos-cust-email').value = email || '';
    document.getElementById('pos-cust-status').innerText = "✓ Đã chọn khách hàng từ hệ thống";
    window.currentPOSCustomerId = id;
    const suggestions = document.getElementById('pos-customer-suggestions');
    if (suggestions) suggestions.style.display = 'none';
    document.getElementById('pos-customer-search').value = name || phone || '';
    await updatePOSMembershipDiscount(id);
};

window.searchCustomerPOS = async () => {
    const inputVal = document.getElementById('pos-customer-search').value.trim();
    if (!inputVal) return;
    
    // Chuẩn hóa và tạo cả 2 định dạng (0... và +84...) để tìm kiếm bao phủ hơn
    const phone0 = formatPhoneNumber(inputVal);
    const phone84 = phone0.startsWith('0') ? '+84' + phone0.substring(1) : phone0;

    const statusEl = document.getElementById('pos-cust-status');
    statusEl.innerText = "🔍 Đang tìm kiếm...";

    const q = query(collection(db, "users"), where("identifiers", "array-contains-any", [phone0, phone84]));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        const u = snap.docs[0].data();
        document.getElementById('pos-cust-name').value = u.displayName || u.name || '';
        document.getElementById('pos-cust-phone').value = u.phone || u.phoneNumber || inputVal;
        document.getElementById('pos-cust-email').value = u.email || '';
        statusEl.innerText = "✓ Đã tìm thấy khách hàng cũ";
        window.currentPOSCustomerId = snap.docs[0].id;
        await updatePOSMembershipDiscount(snap.docs[0].id);
    } else {
        statusEl.innerText = "! Khách hàng mới (Sẽ tạo tài khoản)";
        document.getElementById('pos-cust-phone').value = inputVal;
        window.currentPOSCustomerId = null;
        posMembershipDiscountPercent = 0;
        renderPOSCart();
    }
};

function printPOSReceipt(orderId, customer, items, total, subtotal = null, discountVal = 0, shippingFee = 0) {
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
            <p>37 Nguyễn Duy, Phường Gia Định, TP.HCM
            <p>SĐT: 033 769 6231 - 090 938 0652</p>
        </div>
        <div class="receipt-info">
            <p><strong>Mã ĐH:</strong> #${orderId}</p>
            <p><strong>Ngày:</strong> ${now}</p>
            <p><strong>Khách hàng:</strong> ${customer.name}</p>
            <p><strong>SĐT:</strong> ${customer.phone}</p>
            <p><strong>Thanh toán:</strong> ${customer.paymentMethod || 'Tiền mặt'}</p>
        </div>
        <table class="receipt-table">
            <thead>
                <tr>
                    <th>Sản phẩm</th>
                    <th class="col-qty">SL</th>
                    <th class="col-price">T.Tiền</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td class="col-qty">${item.quantity}</td>
                        <td class="col-price">${new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${subtotal ? `<p style="text-align:right; margin: 5px 0 0 0; font-size:11px;">Tạm tính: ${new Intl.NumberFormat('vi-VN').format(subtotal)} VND</p>` : ''}
        ${shippingFee > 0 ? `<p style="text-align:right; margin: 0; font-size:11px;">Phí vận chuyển: +${new Intl.NumberFormat('vi-VN').format(shippingFee)} VND</p>` : ''}
        ${discountVal > 0 ? `<p style="text-align:right; margin: 0; font-size:11px;">Chiết khấu: -${new Intl.NumberFormat('vi-VN').format(discountVal)} VND</p>` : ''}
        <div class="receipt-total">TỔNG CỘNG: ${new Intl.NumberFormat('vi-VN').format(total)} VND</div>
        <div class="receipt-qr-section">
            <p style="margin-bottom: 5px; font-weight: bold;">Quét mã theo dõi Tiệm:</p>
            <img src="../Asset/images/fb-qr.webp" class="receipt-qr" alt="Facebook QR">
            <p style="margin-top: 5px; font-size: 14px; font-weight: bold;">www.tiemnhagom.vn</p>
        </div>
        <div class="receipt-footer">Cảm ơn Quý khách. Hẹn gặp lại!</div>
    `;

    window.print();
}

// --- Logic Kết nối và In Bluetooth (ESC/POS) ---

window.connectBTPrinter = async () => {
    try {
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, { namePrefix: 'RPP' }, { namePrefix: 'MTP' }, { namePrefix: 'Printer' }],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        
        showToast("Đang kết nối với " + bluetoothDevice.name);
        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        const characteristics = await service.getCharacteristics();
        // Thường đặc tính ghi dữ liệu là đặc tính đầu tiên có thuộc tính write
        btCharacteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
        
        showToast("Đã kết nối máy in Bluetooth thành công!", "success");
        document.getElementById('btn-connect-bt-printer').innerText = "✅ Đã kết nối: " + bluetoothDevice.name;
    } catch (e) {
        console.error(e);
        showToast("Không thể kết nối máy in: " + e.message, "error");
    }
};

window.sendToBTPrinter = async (text) => {
    if (!btCharacteristic) {
        showToast("Vui lòng kết nối máy in Bluetooth trước", "error");
        return;
    }
    // Chuẩn hóa văn bản: Bỏ dấu tiếng Việt vì máy in nhiệt giá rẻ thường lỗi font
    const cleanText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    
    // Lệnh ESC/POS cơ bản
    const encoder = new TextEncoder();
    const init = new Uint8Array([0x1B, 0x40]); // Reset máy in
    const cut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x41, 0x03]); // Feed và cắt giấy

    try {
        await btCharacteristic.writeValue(init);
        // BLE có giới hạn kích thước gói tin (thường 20-512 bytes), chia nhỏ để gửi
        const data = encoder.encode(cleanText + "\n\n");
        const chunkSize = 20;
        for (let i = 0; i < data.length; i += chunkSize) {
            await btCharacteristic.writeValue(data.slice(i, i + chunkSize));
        }
        await btCharacteristic.writeValue(cut);
        showToast("Đã gửi lệnh in");
    } catch (e) {
        showToast("Lỗi khi gửi dữ liệu in", "error");
    }
};

window.printLastOrderBT = async () => {
    if (!lastCreatedOrderId) return showToast("Chưa có đơn hàng nào vừa được tạo", "info");
    
    const docSnap = await getDoc(doc(db, "orders", lastCreatedOrderId));
    if (!docSnap.exists()) return;
    const o = docSnap.data();
    
    let btContent = `   TIEM NHA GOM\n`;
    btContent += `      Gom & Decor\n`;
    btContent += `--------------------------------\n`;
    btContent += `Ma DH: #${lastCreatedOrderId.substring(0,8)}\n`;
    btContent += `Ngay: ${new Date().toLocaleString('vi-VN')}\n`;
    btContent += `KH: ${o.shippingAddress?.fullName || 'Khach vang lai'}\n`;
    btContent += `--------------------------------\n`;
    
    o.items.forEach(item => {
        const priceStr = new Intl.NumberFormat('vi-VN').format(item.price);
        btContent += `${item.name}\n`;
        btContent += `   ${item.quantity} x ${priceStr} VND\n`;
    });
    
    btContent += `--------------------------------\n`;
    btContent += `TONG CONG: ${new Intl.NumberFormat('vi-VN').format(o.totalAmount)} VND\n`;
    btContent += `Thanh toan: ${o.paymentMethod || 'Tien mat'}\n`;
    btContent += `\nCam on Quy khach. Hen gap lai!\n`;
    btContent += `www.tiemnhagom.vn\n`;

    window.sendToBTPrinter(btContent);
};

window.createPOSOrder = async () => {
    const name = document.getElementById('pos-cust-name').value.trim();
    const rawPhone = document.getElementById('pos-cust-phone').value.trim();
    const email = document.getElementById('pos-cust-email').value.trim();
    const totalText = document.getElementById('pos-total-amount').value;
    const paymentMethod = document.querySelector('input[name="pos-payment"]:checked')?.value || "Tiền mặt";
    const total = Number(totalText.replace(/[^\d]/g, ''));
    const phone = formatPhoneNumber(rawPhone); // Lưu vào DB theo định dạng 0... đồng bộ

    if (!name || !phone || total <= 0 || posCart.length === 0) {
        showToast("Vui lòng điền đủ thông tin khách, chọn sản phẩm và đảm bảo số tiền > 0", "error");
        return;
    }

    const btn = document.querySelector('#pos-section button[onclick="createPOSOrder()"]');
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-small"></span> Đang xử lý...'; }

        let customerId = window.currentPOSCustomerId;
        if (!customerId) {
            const newCustRef = doc(collection(db, "users"));
            customerId = newCustRef.id;
            
            // Tự động thêm cả định dạng 0 và +84 để tìm kiếm khách hàng linh hoạt hơn
            const altPhone = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;
            const identifiers = [phone, altPhone];
            if (email) identifiers.push(email);

            await setDoc(newCustRef, {
                displayName: name, 
                phone: phone, 
                email: email,
                identifiers: identifiers, 
                isGhost: true, 
                createdAt: new Date().toISOString()
            });
        }
        const orderId = generateOrderId();
        const orderRef = doc(db, "orders", orderId);
        await setDoc(orderRef, {
            userId: customerId, productNames: posCart.map(i => i.name),
            items: posCart, totalAmount: total, status: "Đã hoàn thành",
            paymentMethod: paymentMethod, orderDate: serverTimestamp(),
            shippingAddress: { fullName: name, phone: phone, address: "Mua tại shop" }
        });

        // Cập nhật tồn kho và số lượng đã bán (bao gồm cả biến thể)
        const updatePromises = posCart.map(async (item) => {
            const productRef = doc(db, "products", item.id);
            const productSnap = await getDoc(productRef);
            const pData = productSnap.data();

            let updateData = {
                stock: increment(-item.quantity),
                sold: increment(item.quantity)
            };

            // Cập nhật kho riêng của biến thể màu sắc
            if (item.color && pData.colorVariants) {
                const updatedVariants = pData.colorVariants.map(v => {
                    if (v.name === item.color) {
                        return { ...v, stock: (v.stock || 0) - item.quantity };
                    }
                    return v;
                });
                updateData.colorVariants = updatedVariants;
            }
            // Cập nhật kho riêng của biến thể họa tiết
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
        
        // Lưu ID để in lại nếu cần
        lastCreatedOrderId = orderId;

        // Tự động in hóa đơn sau khi lưu thành công
        const subtotal = posCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const discountVal = subtotal - total;
        printPOSReceipt(orderId, { name, phone, paymentMethod }, posCart, total, subtotal, discountVal);
        
        // Nếu máy in Bluetooth đã được kết nối, tự động in bản text qua Bluetooth luôn
        if (btCharacteristic) {
            window.printLastOrderBT();
        }

        showToast("Đã lưu đơn hàng thành công!");
        document.getElementById('pos-customer-form').reset();
        posCart = [];
        posDiscountPercent = 0;
        posMembershipDiscountPercent = 0;
        renderPOSCart();
    } catch (e) { showToast("Lỗi POS: " + e.message, "error"); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = "Hoàn tất & Lưu doanh thu"; } }
};

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
            groups.map(p => `<option value="${p}">Đồng giá ${p/1000}k</option>`).join('');
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
    const originalPrice = parseInt(document.getElementById('price').value);
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
        const salePrice = p.flashSaleGroup || Math.round((p.price * (1 - (p.sale || 0) / 100)) / 1000) * 1000;
        const stockClass = p.stock <= 0 ? 'color: #e74c3c; font-weight: bold;' : '';
        
        return `
            <tr>
                <td data-label="Ảnh"><img src="${p.imageUrl}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                <td data-label="Tên"><strong>${p.name}</strong><br><small style="color:#888;">SKU: ${p.id}</small></td>
                <td data-label="Giá gốc">${new Intl.NumberFormat('vi-VN').format(p.price)} VND</td>
                <td data-label="Giảm" style="color: #c0392b; font-weight: 700;">-${p.sale}%</td>
                <td data-label="Giá Sale" style="font-weight: 700; color: #27ae60;">${new Intl.NumberFormat('vi-VN').format(salePrice)} VND ${p.flashSaleGroup ? `<br><small style="color:#e67e22">Đồng giá ${p.flashSaleGroup/1000}k</small>` : ''}</td>
                <td data-label="Kho" style="${stockClass}">${p.stock}</td>
            </tr>
        `;
    }).join('');
}

// --- Quản lý Tin tức ---
function initNewsManagement() {
    const form = document.getElementById('news-form');
    const listContainer = document.getElementById('admin-news-list');
    if (!form || !db) return;

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
                slug: title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
                updatedAt: serverTimestamp()
            };

            if (id) {
                await updateDoc(doc(db, "news", id), newsData);
                showToast("Đã cập nhật bài viết!");
            } else {
                newsData.createdAt = serverTimestamp();
                await addDoc(collection(db, "news"), newsData);
                showToast("Đã đăng bài viết mới!");
            }

            form.reset();
            document.getElementById('news-id').value = '';
            document.getElementById('news-image-preview').innerHTML = '';
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
                            <div class="suggestion-item" onclick="window.selectCustomerPOS('${u.id}', '${(u.displayName || '').replace(/'/g, "\\'")}', '${u.phone || ''}', '${u.email || ''}')">
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
                             onclick="window.addProductToPOS('${p.id}', '${p.name.replace(/'/g, "\\'")}', ${currentPrice}, '${p.imageUrl}')">
                            <img src="${p.imageUrl}" style="width: 35px; height: 35px; object-fit: cover; border-radius: 4px;">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
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
if(productModal) { productModal.addEventListener('click', (e) => { if(e.target === productModal) { window.closeProductModal(); } }); }

