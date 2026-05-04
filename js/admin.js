import { 
    db, auth, storage, showToast, logout, DEFAULT_PRODUCT_CATEGORIES // Import DEFAULT_PRODUCT_CATEGORIES
} from "./utils.js";
import { 
    doc, setDoc, deleteDoc, collection, onSnapshot, getDoc, getDocs, query, orderBy, 
    limit, startAfter, endBefore, limitToLast, where, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Biến cục bộ để lưu trữ danh mục động
let adminDynamicCategories = []; // adminDynamicCategories sẽ là một MẢNG các đối tượng nhóm danh mục
let inventoryLogsLocal = []; // Mảng chứa dữ liệu nhật ký kho để lọc nhanh

// --- Logic chuyển đổi Tab Admin ---
function setupAdminTabs() {
    const tabs = document.querySelectorAll('.admin-tab-btn');
    const sections = document.querySelectorAll('.admin-section');
    const titleEl = document.getElementById('current-tab-title');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Xóa trạng thái active của tất cả các tab và section
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            // Kích hoạt tab và section được chọn
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
                // Cập nhật tiêu đề trang tương ứng với Tab
                titleEl.innerText = tab.innerText.replace(/[^\w\sÀ-ỹ]/g, '').trim();
            }

            if (targetId === 'overview-section') {
                initOverview();
            }

            if (targetId === 'category-section') {
                initCategoryManagement();
            }

            // Nếu chuyển sang tab Thống kê, khởi tạo lại biểu đồ để tránh lỗi hiển thị (ID tab là stats-section)
            if (targetId === 'stats-section') {
                initFullReport();
            }
        });
    });
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
            // Nếu đúng là admin thì mới hiển thị nội dung trang
            document.body.style.display = "block";
            updateAdminSidebarProfile(user);
        }
    } catch (e) { console.error(e); }
}

function updateAdminSidebarProfile(user) {
    const container = document.getElementById('admin-user-info');
    if (!container) return;
    container.innerHTML = `
        <p style="font-weight:600; font-size:0.9rem; margin-bottom:4px;">${user.displayName || user.email}</p>
        <p style="font-size:0.7rem; color:#888;">Quản trị viên</p>
    `;
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
            el.innerText = new Intl.NumberFormat('vi-VN').format(current) + 'đ';
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
                    <td><strong>${o.shippingAddress?.fullName || 'Khách vãng lai'}</strong></td>
                    <td>${new Intl.NumberFormat('vi-VN').format(o.totalAmount)}đ</td>
                    <td><span class="order-status-${o.status.toLowerCase().replace(/\s/g, '-')}">${o.status}</span></td>
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
async function convertToWebP(file, targetSize = 1000) {
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
                let sWidth = img.width;
                let sHeight = img.height;
                let sx = 0, sy = 0;

                // Tính toán để cắt lấy hình vuông ở giữa ảnh gốc
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
                
                const ctx = canvas.getContext('2d');
                // Vẽ phần ảnh đã được cắt (sx, sy, sWidth, sHeight) vào canvas vuông (0, 0, finalSize, finalSize)
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, finalSize, finalSize);
                canvas.toBlob((blob) => {
                    const newFile = new File([blob], currentFile.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });
                    resolve(newFile);
                }, 'image/webp', 0.7); // Nén ở mức 70% để tối ưu dung lượng (file sẽ nhẹ hơn ~50% so với mức 85%)
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

// --- Logic Quản lý Danh mục Động ---
let categoryUnsubscribe = null;

function initCategoryManagement() {
    const treeContainer = document.getElementById('admin-category-tree');
    const datalist = document.getElementById('existing-groups');
    const form = document.getElementById('category-management-form');

    if (!treeContainer || !form || !db) return;

    // Thiết lập lắng nghe thời gian thực cho danh mục (Nếu chưa có)
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
    
    let html = '<option value="">-- Chọn danh mục --</option>';
    let filterHtml = '<option value="all">Tất cả danh mục</option>';
    
    adminDynamicCategories.forEach(group => { // Iterate over array
        html += `<optgroup label="${group.name}">`;
        group.subs.forEach(sub => {
            html += `<option value="${sub}">${sub}</option>`;
            filterHtml += `<option value="${sub}">${sub}</option>`;
        });
        html += `</optgroup>`;
    });

    if (categorySelect) categorySelect.innerHTML = html;
    if (filterSelect) filterSelect.innerHTML = filterHtml;
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

// Hàm lưu/cập nhật sản phẩm
if (productForm) {
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('productId').value.trim();
    const imageFiles = document.getElementById('imageFile').files;
    const submitBtn = productForm.querySelector('button[type="submit"]');
    
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
        submitBtn.disabled = false;
        return;
    }

    submitBtn.disabled = true;
    
    // 1. Tạo hoặc reset khu vực hiển thị tiến trình chi tiết
    let progressContainer = document.getElementById('upload-progress-container');
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'upload-progress-container';
        progressContainer.style = "margin: 15px 0; display: none;";
        productForm.insertBefore(progressContainer, submitBtn);
    }
    progressContainer.innerHTML = ''; // Xóa các tiến trình cũ
    progressContainer.style.display = 'block';
    submitBtn.innerHTML = '<span class="spinner-small"></span> Đang nén ảnh...';

    try {
        const productRef = doc(db, "products", productId);
        const existingSnap = await getDoc(productRef);
        const isEdit = existingSnap.exists();
        
        const stockInput = document.getElementById('stock');
        const isAdditive = document.getElementById('stock-additive')?.checked;
        let finalStock = Number(stockInput.value);

        // Nếu đang sửa và chọn chế độ "Nhập thêm", thực hiện phép cộng
        if (isEdit && isAdditive) {
            finalStock = (existingSnap.data().stock || 0) + finalStock;
        }

        // Lấy danh sách ảnh cũ còn sót lại sau khi xóa
        let currentMain = document.getElementById('productId').dataset.currentImageUrl || '';
        let currentAdditionals = JSON.parse(document.getElementById('productId').dataset.currentAdditionalImages || '[]');

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
            let currentThumb = document.getElementById('productId').dataset.currentThumbUrl || ''; // Initialize currentThumb

            if (!currentMain) {
                currentMain = results[0].fullUrl;
                currentThumb = results[0].thumbUrl;
                currentAdditionals = [...currentAdditionals, ...results.slice(1).map(r => r?.fullUrl)];
            } else {
                currentAdditionals = [...currentAdditionals, ...results.map(r => r?.fullUrl)];
            }            
        }

        const finalImageUrl = currentMain || 'https://placehold.co/300x300?text=No+Image';

        // 2. Lưu thông tin vào Firestore
    const productData = {
        name: document.getElementById('name').value,
        category: document.getElementById('category').value,
        price: Number(document.getElementById('price').value),
        stock: finalStock,
        sale: Number(document.getElementById('sale').value || 0),
        imageUrl: finalImageUrl,
        thumbUrl: currentThumb, // Add thumbUrl to productData
        additionalImages: currentAdditionals,
        description: document.getElementById('description').value,
        seoTitle: document.getElementById('seoTitle').value.trim(),
        seoDescription: document.getElementById('seoDescription').value.trim(),
        slug: document.getElementById('slug').value.trim(),
        updatedAt: new Date().toISOString()
    };

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

        await setDoc(productRef, productData);
        showToast(`Đã lưu sản phẩm ${productId} thành công!`);
        productForm.reset();
        
        // Reset trạng thái checkbox và placeholder
        const additiveCheckbox = document.getElementById('stock-additive');
        if (additiveCheckbox) additiveCheckbox.checked = false;
        if (stockInput) stockInput.placeholder = "10";

        progressContainer.style.display = 'none';
        document.getElementById('image-preview-container').innerHTML = '';
        // Clear stored image URLs from dataset
        delete document.getElementById('productId').dataset.currentImageUrl;
        delete document.getElementById('productId').dataset.currentAdditionalImages;
        // Reset form và clear các state khác
        document.getElementById('productId').readOnly = false;
    } catch (error) {
        console.error("Lỗi khi lưu:", error);
        showToast("Lỗi lưu dữ liệu: " + error.message, "error");
        if (progressContainer) progressContainer.style.display = 'none';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Lưu sản phẩm";
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
    }, (error) => {
        console.error("Product listener error:", error);
    });
}

// Hàm hiển thị bảng sản phẩm Admin (có hỗ trợ lọc tìm kiếm)
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
    const filtered = posProductsLocal.filter(p => {
        const matchesSearch = (p.name || "").toLowerCase().includes(term) || p.id.toLowerCase().includes(term);
        const matchesCategory = catValue === 'all' || p.category === catValue;
        const matchesStock = stockValue === 'all' || 
                           (stockValue === 'in-stock' && p.stock > 0) || 
                           (stockValue === 'out-of-stock' && p.stock <= 0);
        return matchesSearch && matchesCategory && matchesStock;
    });

    let htmlContent = '';
    filtered.forEach((p) => {
        const stockDisplay = p.stock <= 0 
            ? `<span class="stock-badge stock-out">Hết hàng</span>` 
            : p.stock;

        htmlContent += `
            <tr>
                <td data-label="ID"><small>${p.id}</small></td>
                <td data-label="Ảnh"><img src="${p.imageUrl}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                <td data-label="Tên"><a href="javascript:void(0)" class="edit-link" data-id="${p.id}" style="color: var(--text-black); font-weight: 600; text-decoration: none;">${p.name}</a></td>
                <td data-label="Giá">${new Intl.NumberFormat('vi-VN').format(p.price)}đ</td>
                <td data-label="Kho">${stockDisplay}</td>
                <td data-label="Đánh giá">${p.rating || 5}★</td>
                <td data-label="Giảm giá">${p.sale || 0}%</td>
                <td data-label="Thao tác">
                    <button class="btn-delete" data-id="${p.id}">Xóa</button>
                </td>
            </tr>`;
    });
    
    listTable.innerHTML = htmlContent || '<tr><td colspan="8" style="text-align:center;">Không tìm thấy sản phẩm phù hợp.</td></tr>';

    // Gán lại sự kiện cho các nút mới render
    document.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = () => deleteProduct(btn.getAttribute('data-id')));
    document.querySelectorAll('.edit-link').forEach(link => link.onclick = () => editProduct(link.getAttribute('data-id')));
}

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
    const headers = ["Mã SP (ID)", "Tên sản phẩm", "Danh mục", "Giá bán", "Tồn kho", "Giảm giá (%)", "Đánh giá", "Ngày cập nhật"];
    
    // 2. Chuyển đổi dữ liệu thành hàng CSV
    const rows = dataToExport.map(p => [
        p.id,
        `"${p.name.replace(/"/g, '""')}"`, // Xử lý dấu ngoặc kép trong tên
        p.category,
        p.price,
        p.stock,
        p.sale || 0,
        p.rating || 5,
        p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN') : ''
    ]);

    // 3. Ghép thành nội dung CSV
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");

    // 4. Tạo Blob với BOM (Byte Order Mark) để Excel nhận diện được UTF-8 (tiếng Việt)
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Danh_sach_san_pham_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
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
            // Điền dữ liệu vào form
            document.getElementById('productId').value = id;
            document.getElementById('name').value = p.name;
            document.getElementById('category').value = p.category;
            document.getElementById('price').value = p.price;
            document.getElementById('stock').value = p.stock;
            document.getElementById('sale').value = p.sale || 0;

            // Reset checkbox nhập thêm khi load dữ liệu sửa sản phẩm khác
            const additiveCheckbox = document.getElementById('stock-additive');
            if (additiveCheckbox) additiveCheckbox.checked = false;

            document.getElementById('description').value = p.description || '';
            document.getElementById('productId').dataset.currentThumbUrl = p.thumbUrl || ''; // Store thumbUrl for editing
            document.getElementById('seoTitle').value = p.seoTitle || '';
            document.getElementById('seoDescription').value = p.seoDescription || '';
            document.getElementById('slug').value = p.slug || '';
            
            // Lưu URL ảnh hiện tại để không bị mất nếu không upload ảnh mới
            document.getElementById('productId').dataset.currentImageUrl = p.imageUrl;
            document.getElementById('productId').dataset.currentAdditionalImages = JSON.stringify(p.additionalImages || []);
            
            // Hiển thị xem trước ảnh
            renderImagePreviews();

            // Cuộn lên form để người dùng thấy
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu sửa:", error);
    }
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
const ORDER_PAGE_SIZE = 10;
let lastOrderVisible = null;
let firstOrderVisible = null;
let currentOrderPage = 1;

function initOrderListener(productNameFilter = '', statusFilter = 'all', navigation = 'init') {
    const orderListTable = document.getElementById('admin-order-list');
    const prevBtn = document.getElementById('prev-order-page');
    const nextBtn = document.getElementById('next-order-page');
    const pageInfo = document.getElementById('order-page-info');

    if (!orderListTable || !db) return;

    // Hủy đăng ký lắng nghe cũ nếu có
    if (unsubscribeOrders) unsubscribeOrders();

    if (navigation === 'init') {
        lastOrderVisible = null;
        firstOrderVisible = null;
        currentOrderPage = 1;
    }

    let ordersQuery = collection(db, "orders");

    if (productNameFilter) {
        ordersQuery = query(ordersQuery, where("productNames", "array-contains", productNameFilter));
    }
    if (statusFilter !== 'all') {
        ordersQuery = query(ordersQuery, where("status", "==", statusFilter));
    }

    // Xây dựng query với phân trang
    let finalQuery = query(ordersQuery, orderBy("orderDate", "desc"));

    if (navigation === 'next' && lastOrderVisible) {
        finalQuery = query(finalQuery, startAfter(lastOrderVisible), limit(ORDER_PAGE_SIZE));
    } else if (navigation === 'prev' && firstOrderVisible) {
        finalQuery = query(finalQuery, endBefore(firstOrderVisible), limitToLast(ORDER_PAGE_SIZE));
    } else {
        finalQuery = query(finalQuery, limit(ORDER_PAGE_SIZE));
    }

    unsubscribeOrders = onSnapshot(finalQuery, (snapshot) => {
        if (snapshot.empty) {
            if (navigation === 'next') currentOrderPage--;
            orderListTable.innerHTML = '<tr><td colspan="7" style="text-align:center;">Không tìm thấy đơn hàng nào.</td></tr>';
            if (nextBtn) nextBtn.disabled = true;
            return;
        }

        // Lưu cursor cho phân trang
        firstOrderVisible = snapshot.docs[0];
        lastOrderVisible = snapshot.docs[snapshot.docs.length - 1];

        let htmlContent = '';
        snapshot.forEach((doc) => {
            const order = doc.data();
            const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleString('vi-VN') : 'N/A';
            const totalAmount = new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0);
            const status = order.status || 'Đang xử lý';

            htmlContent += `
                <tr>
                    <td data-label="Mã đơn"><small>${doc.id}</small></td>
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
                    <td data-label="Tổng tiền">${totalAmount}đ</td>
                    <td data-label="Trạng thái">
                        <select class="status-select" onchange="window.updateOrderStatus('${doc.id}', this.value)">
                            <option value="Đang xử lý" ${status === 'Đang xử lý' ? 'selected' : ''}>Đang xử lý</option>
                            <option value="Đang giao hàng" ${status === 'Đang giao hàng' ? 'selected' : ''}>Đang giao hàng</option>
                            <option value="Đã hoàn thành" ${status === 'Đã hoàn thành' ? 'selected' : ''}>Đã hoàn thành</option>
                            <option value="Đã hủy" ${status === 'Đã hủy' ? 'selected' : ''}>Đã hủy</option>
                        </select>
                    </td>
                    <td data-label="Thao tác">
                        <button class="btn-minimal" onclick="window.viewAdminOrderDetail('${doc.id}')">Chi tiết</button>
                    </td>
                </tr>
            `;
        });
        orderListTable.innerHTML = htmlContent || '<tr><td colspan="6" style="text-align:center;">Chưa có đơn hàng nào.</td></tr>';

        // Cập nhật UI phân trang
        if (pageInfo) pageInfo.innerText = `Trang ${currentOrderPage}`;
        if (prevBtn) prevBtn.disabled = currentOrderPage === 1;
        if (nextBtn) nextBtn.disabled = snapshot.docs.length < ORDER_PAGE_SIZE;
    }, (error) => {
        console.error("Order list listener error:", error);
    });
}

window.updateOrderStatus = async (orderId, newStatus) => {
    try {
        await setDoc(doc(db, "orders", orderId), { status: newStatus }, { merge: true });
        showToast(`Đã cập nhật trạng thái đơn hàng #${orderId} thành: ${newStatus}`);
    } catch (error) {
        showToast("Lỗi cập nhật: " + error.message, "error");
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

        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                <h3>Chi tiết đơn hàng #${orderId}</h3>
                <hr style="margin: 1rem 0;">
                <p><strong>Khách hàng:</strong> ${order.shippingAddress?.fullName}</p>
                <p><strong>SĐT:</strong> ${order.shippingAddress?.phone}</p>
                <p><strong>Địa chỉ:</strong> ${order.shippingAddress?.address}</p>
                <p><strong>Sản phẩm:</strong></p>
                <ul style="list-style: none; padding: 0;">
                    ${order.items.map(i => `
                        <li style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 1px solid #f9f9f9; padding-bottom: 8px;">
                            <img src="${i.image}" alt="${i.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                            <div>
                                <div style="font-weight: 600;">${i.name}</div>
                                <div style="font-size: 0.85rem; color: #666;">Số lượng: ${i.quantity} | Giá: ${new Intl.NumberFormat('vi-VN').format(i.price)}đ</div>
                            </div>
                        </li>`).join('')}
                </ul>
                <p style="font-size: 1.2rem; margin-top: 1rem; border-top: 1px solid #eee; padding-top: 1rem;"><strong>Tổng cộng: ${new Intl.NumberFormat('vi-VN').format(order.totalAmount)}đ</strong></p>
            </div>
        `;
        modal.classList.add('active');
    } catch (e) { console.error(e); }
};

// --- Quản lý Người dùng ---
function initUserListener() {
    const userListTable = document.getElementById('admin-user-list');
    if (!userListTable || !db) return;

    // Lấy danh sách admin để so khớp badge
    getDocs(collection(db, "admins")).then(adminsSnap => {
        const adminIds = new Set(adminsSnap.docs.map(d => d.id));

        onSnapshot(collection(db, "users"), (snapshot) => {
        let htmlContent = '';
        snapshot.forEach((doc) => {
            const u = doc.data();
            const updatedAt = u.updatedAt ? new Date(u.updatedAt).toLocaleDateString('vi-VN') : 'N/A';
            const birthday = u.birthday ? new Date(u.birthday).toLocaleDateString('vi-VN') : 'N/A';
            const isAdminUser = adminIds.has(doc.id);
            const adminBadge = isAdminUser ? `<span class="admin-text-badge" style="font-size: 0.55rem;"><svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg> Admin</span>` : '';

            const adminActionBtn = isAdminUser 
                ? `<button class="btn-delete" style="text-decoration:none; color:#e74c3c; font-size:0.7rem;" onclick="window.toggleAdminPrivilege('${doc.id}', false)">Gỡ Admin</button>`
                : `<button class="btn-minimal" style="font-size: 0.7rem; border-color: #27ae60; color: #27ae60;" onclick="window.toggleAdminPrivilege('${doc.id}', true, '${u.email || u.displayName || ''}')">Gán Admin</button>`;

            htmlContent += `
                <tr>
                    <td data-label="Người dùng">
                        <strong>${u.displayName || u.email || u.phoneNumber || 'Khách vãng lai'} ${adminBadge}</strong><br>
                        <small style="color: #888;">ID: ${doc.id}</small>
                    </td>
                    <td data-label="SĐT">${u.phoneNumber || u.phone || '---'}</td>
                    <td data-label="Giới tính">${u.gender || '---'}</td>
                    <td data-label="Ngày sinh">${birthday}</td>
                    <td data-label="Cập nhật">${updatedAt}</td>
                    <td data-label="Thao tác" style="display: flex; gap: 5px; justify-content: flex-end;">
                        ${adminActionBtn}
                        <button class="btn-minimal" onclick="window.viewUserOrders('${doc.id}')">Xem đơn hàng</button>
                    </td>
                </tr>
            `;
        });
        userListTable.innerHTML = htmlContent || '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu khách hàng.</td></tr>';
    }, (error) => {
        console.error("User list listener error:", error);
    });
    });
}

// Hàm thêm/gỡ quyền Admin trực tiếp từ danh sách người dùng
window.toggleAdminPrivilege = async (uid, shouldBeAdmin, identifier = '') => {
    const actionText = shouldBeAdmin ? 'GÁN' : 'GỠ';
    if (!confirm(`Bạn có chắc chắn muốn ${actionText} quyền Quản trị viên cho tài khoản này?`)) return;
    
    try {
        const adminRef = doc(db, "admins", uid);
        if (shouldBeAdmin) {
            // Thêm vào danh sách Admin
            await setDoc(adminRef, { 
                email: identifier, 
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

function initCouponListener() {
    const list = document.getElementById('admin-coupon-list');
    if (!list || !db) return;

    onSnapshot(collection(db, "coupons"), (snapshot) => {
        list.innerHTML = snapshot.docs.map(doc => {
            const c = doc.data();
            const usage = c.limit > 0 ? `${c.usedCount || 0} / ${c.limit}` : `${c.usedCount || 0} / ∞`;
            const expiry = c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('vi-VN') : 'Vô thời hạn';
            return `
                <tr>
                    <td><strong>${doc.id}</strong></td>
                    <td>${c.type === 'percent' ? 'Phần trăm' : 'Cố định'}</td>
                    <td>${c.type === 'percent' ? c.value + '%' : new Intl.NumberFormat('vi-VN').format(c.value) + 'đ'}</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(c.minOrder)}đ</td>
                    <td>${usage}</td>
                    <td>${expiry}</td>
                    <td><button class="btn-delete" onclick="window.deleteCoupon('${doc.id}')">Xóa</button></td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="7" style="text-align:center;">Chưa có mã giảm giá nào.</td></tr>';
    }, (error) => {
        console.error("Coupon listener error:", error);
    });
}

window.deleteCoupon = async (code) => {
    if (confirm(`Bạn có muốn xóa mã giảm giá ${code}?`)) {
        try {
            await deleteDoc(doc(db, "coupons", code));
            showToast(`Đã xóa mã ${code}`);
        } catch (e) { showToast("Lỗi xóa mã: " + e.message, "error"); }
    }
};

const couponForm = document.getElementById('coupon-form');
if (couponForm) {
    couponForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('coupon-code').value.trim().toUpperCase();
        const type = document.getElementById('coupon-type').value;
        const value = Number(document.getElementById('coupon-value').value);
        const minOrder = Number(document.getElementById('coupon-min-order').value || 0);
        const usageLimit = Number(document.getElementById('coupon-limit').value || 0);
        const expiryDate = document.getElementById('coupon-expiry').value; // YYYY-MM-DD

        try {
            await setDoc(doc(db, "coupons", code), {
                type, value, minOrder, limit: usageLimit, usedCount: 0, expiryDate, createdAt: new Date().toISOString()
            });
            showToast(`Đã tạo thành công mã giảm giá: ${code}`);
            couponForm.reset();
        } catch (error) {
            showToast("Lỗi lưu dữ liệu: " + error.message, "error");
        }
    });
}

window.viewUserOrders = (userId) => {
    // Chuyển sang tab đơn hàng và lọc theo mã người dùng (hoặc thực hiện query riêng)
    showToast("Tính năng lọc đơn hàng theo User đang được phát triển", "info");
};

// --- Logic POS (Bán tại shop) ---
let posCart = [];
window.currentPOSCustomerId = null;
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
        subtotal += item.price * item.quantity;
        return `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f5f5f5;">
                <img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: #666;">${new Intl.NumberFormat('vi-VN').format(item.price)}đ</div>
                </div>
                <div class="quantity-controls" style="height: 30px;">
                    <button class="q-btn" style="width: 30px; height: 30px;" onclick="window.changePOSQty(${index}, -1)">-</button>
                    <input type="number" value="${item.quantity}" readonly style="width: 30px; height: 30px; border-left: 1px solid #ddd; border-right: 1px solid #ddd; padding: 0;">
                    <button class="q-btn" style="width: 30px; height: 30px;" onclick="window.changePOSQty(${index}, 1)">+</button>
                </div>
                <button onclick="window.removePOSItem(${index})" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1.2rem;">&times;</button>
            </div>
        `;
    }).join('');

    const discountVal = Math.round(subtotal * (posDiscountPercent / 100));
    const total = subtotal - discountVal;

    if (totalInput) totalInput.value = new Intl.NumberFormat('vi-VN').format(total);
    
    if (discountInfo) {
        if (posDiscountPercent > 0) {
            discountInfo.innerText = `Đã chiết khấu ${posDiscountPercent}% (-${new Intl.NumberFormat('vi-VN').format(discountVal)}đ)`;
            discountInfo.style.display = 'block';
        } else {
            discountInfo.style.display = 'none';
        }
    }
}

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
        posCart.push({ id, name, price, image, quantity: 1 });
    }
    document.getElementById('pos-product-search').value = '';
    document.getElementById('pos-product-suggestions').style.display = 'none';
    renderPOSCart();
};

window.searchCustomerPOS = async () => {
    const term = document.getElementById('pos-customer-search').value.trim();
    if (!term) return;
    const q = query(collection(db, "users"), where("identifiers", "array-contains", term));
    const snap = await getDocs(q);
    const statusEl = document.getElementById('pos-cust-status');
    if (!snap.empty) {
        const u = snap.docs[0].data();
        document.getElementById('pos-cust-name').value = u.displayName || u.name || '';
        document.getElementById('pos-cust-phone').value = u.phoneNumber || u.phone || '';
        document.getElementById('pos-cust-email').value = u.email || '';
        statusEl.innerText = "✓ Đã tìm thấy khách hàng cũ";
        window.currentPOSCustomerId = snap.docs[0].id;
    } else {
        statusEl.innerText = "! Khách hàng mới (Sẽ tạo tài khoản chờ)";
        window.currentPOSCustomerId = null;
    }
};

function printPOSReceipt(orderId, customer, items, total) {
    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) return;

    const now = new Date().toLocaleString('vi-VN');
    
    printArea.innerHTML = `
        <div class="receipt-header">
            <h2>TIỆM NHÀ GỐM</h2>
            <p>Gốm & Decor thủ công</p>
            <p>SĐT: 033 769 6231 - 090 938 0652</p>
        </div>
        <div class="receipt-info">
            <p><strong>Mã ĐH:</strong> #${orderId}</p>
            <p><strong>Ngày:</strong> ${now}</p>
            <p><strong>Khách hàng:</strong> ${customer.name}</p>
            <p><strong>SĐT:</strong> ${customer.phone}</p>
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
        <div class="receipt-total">TỔNG CỘNG: ${new Intl.NumberFormat('vi-VN').format(total)}đ</div>
        <div class="receipt-footer">Cảm ơn Quý khách. Hẹn gặp lại!</div>
    `;

    window.print();
}

window.createPOSOrder = async () => {
    const name = document.getElementById('pos-cust-name').value;
    const phone = document.getElementById('pos-cust-phone').value;
    const email = document.getElementById('pos-cust-email').value;
    const totalText = document.getElementById('pos-total-amount').value;
    const total = Number(totalText.replace(/\./g, ''));

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
            await setDoc(newCustRef, {
                displayName: name, phone: phone, email: email,
                identifiers: [phone, email].filter(Boolean), isGhost: true, createdAt: new Date().toISOString()
            });
        }
        const docRef = await addDoc(collection(db, "orders"), {
            userId: customerId, productNames: posCart.map(i => i.name),
            items: posCart, totalAmount: total, status: "Đã hoàn thành",
            paymentMethod: "Tại cửa hàng", orderDate: serverTimestamp(),
            shippingAddress: { fullName: name, phone: phone, address: "Mua tại shop" }
        });
        const updatePromises = posCart.map(item => {
            return updateDoc(doc(db, "products", item.id), { stock: increment(-item.quantity), sold: increment(item.quantity) });
        });
        await Promise.all(updatePromises);

        // 3. Tự động in hóa đơn
        printPOSReceipt(docRef.id, { name, phone }, posCart, total);

        showToast("Đã lưu đơn hàng thành công!");
        document.getElementById('pos-customer-form').reset();
        posCart = [];
        posDiscountPercent = 0;
        renderPOSCart();
    } catch (e) { showToast("Lỗi POS: " + e.message, "error"); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = "Hoàn tất & Lưu doanh thu"; } }
};

// --- Quản lý Thống kê Nâng cao ---
let mainRevChart = null;
let periodSoldChart = null;
let comparisonChart = null;

async function initFullReport() {
    const yearSelect = document.getElementById('stats-year-filter');
    const periodSelect = document.getElementById('stats-period-type');
    const btnRefresh = document.getElementById('btn-refresh-stats');
    if (!yearSelect || !periodSelect) return;

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

        try {
            const loadingEl = document.getElementById('stats-detail-loading');
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
            const compCurrentYear = new Array(12).fill(0); // [Jan, Feb, ..., Dec] cho năm chọn
            const compPrevYear = new Array(12).fill(0);    // [Jan, Feb, ..., Dec] cho năm trước
            let totalRev = 0;
            let totalOrders = 0;
            let prevTotalRev = 0;
            let prevTotalOrders = 0;

            orders.forEach(o => {
                const date = o.orderDate.toDate();
                const orderYear = date.getFullYear();
                const monthIdx = date.getMonth();
                let key = '';

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
                        if (!statsMap[key]) statsMap[key] = { rev: 0, count: 0 };
                        statsMap[key].rev += (o.totalAmount || 0);
                        statsMap[key].count++;
                        totalRev += (o.totalAmount || 0);

                        // Gom sản phẩm bán chạy cho năm hiện tại
                        o.items.forEach(item => {
                            productMap[item.name] = (productMap[item.name] || 0) + (item.quantity || 1);
                        });
                    }
                    // Lưu dữ liệu so sánh 12 tháng
                    compCurrentYear[monthIdx] += (o.totalAmount || 0);
                } else if (orderYear === prevYear) {
                    // Lưu dữ liệu năm trước
                    compPrevYear[monthIdx] += (o.totalAmount || 0);
                    prevTotalRev += (o.totalAmount || 0);
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
            animateNumber('period-revenue', totalRev, true);
            animateNumber('period-orders', totalOrders);
            animateNumber('period-avg-order', totalOrders > 0 ? Math.round(totalRev / totalOrders) : 0, true);

            // Hiển thị % tăng trưởng
            document.getElementById('period-revenue-growth').innerHTML = getGrowthHtml(totalRev, prevTotalRev);
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

            // 6. Cập nhật bảng kê chi tiết
            const tableBody = document.getElementById('stats-detail-table');
            tableBody.innerHTML = labels.map(l => `
                <tr>
                    <td><strong>${l}</strong></td>
                    <td>${statsMap[l].count} đơn</td>
                    <td>${new Intl.NumberFormat('vi-VN').format(statsMap[l].rev)}đ</td>
                </tr>
            `).join('');

        } catch (err) { 
            console.error(err); 
            showToast("Lỗi tải báo cáo", "error"); 
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    };

    btnRefresh.onclick = updateReport;
    document.getElementById('topSoldType').onchange = updateReport;
    updateReport(); // Lần đầu load
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

    // Gán sự kiện tìm kiếm cho bảng sản phẩm Admin
    document.getElementById('admin-product-search')?.addEventListener('input', renderAdminProductTable);
    document.getElementById('admin-product-category-filter')?.addEventListener('change', renderAdminProductTable);
    document.getElementById('admin-product-stock-filter')?.addEventListener('change', renderAdminProductTable);
    document.getElementById('btn-export-excel')?.addEventListener('click', exportProductToExcel);

    // Gán sự kiện cho bộ lọc Nhật ký kho
    document.getElementById('log-filter-product-id')?.addEventListener('input', renderInventoryLogTable);
    document.getElementById('log-filter-date')?.addEventListener('change', renderInventoryLogTable);
    document.getElementById('btn-clear-log-filter')?.addEventListener('click', () => {
        document.getElementById('log-filter-product-id').value = '';
        document.getElementById('log-filter-date').value = '';
        renderInventoryLogTable();
    });

    // Thay thế initHeader bằng logic Auth riêng cho Admin Dashboard
    onAuthStateChanged(auth, async (user) => {
        await checkAdminRights(user);
        if (document.body.style.display === "block") {
            initProductListener();
            initOrderListener();
            initUserListener();
            initCouponListener();
            initOverview();
            initCategoryManagement(); // Call initCategoryManagement here to ensure initial render
            setupNewOrderNotification();
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

        // Điều hướng bằng bàn phím (Lên/Xuống/Enter/Esc) trong ô tìm kiếm
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