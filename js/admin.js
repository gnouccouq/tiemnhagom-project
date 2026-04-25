import { 
    db, auth, storage, showToast, initHeader, updateCartCount 
} from "./utils.js";
import { 
    doc, setDoc, deleteDoc, collection, onSnapshot, getDoc, getDocs, query, orderBy, 
    limit, startAfter, endBefore, limitToLast, where, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Thiết lập Auth Listener để cập nhật UI Header và kiểm tra quyền Admin
async function checkAdminRights(user) {
    if (!user) {
        alert("Vui lòng đăng nhập.");
        window.location.href = "../index.html";
        return;
    }
    try {
        // Kiểm tra xem UID của user có trong collection 'admins' không
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            alert("Tài khoản của bạn không có quyền quản trị.");
            window.location.href = "../index.html";
        } else {
            // Nếu đúng là admin thì mới hiển thị nội dung trang
            document.body.style.display = "block";
        }
    } catch (e) { console.error(e); }
}

// Hàm hỗ trợ chuyển đổi file ảnh sang WebP để tối ưu dung lượng
async function convertToWebP(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) return resolve(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });
                    resolve(newFile);
                }, 'image/webp', 0.8); // Nén chất lượng 80% để cân bằng dung lượng/chất lượng
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Quản lý trạng thái kho hàng để phát hiện thay đổi tức thì
const stockTracker = new Map();

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

// Hàm lưu/cập nhật sản phẩm
if (productForm) {
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('productId').value.trim();
    const imageFiles = document.getElementById('imageFile').files;
    const submitBtn = productForm.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu sản phẩm...';

    try {
        // Lấy danh sách ảnh cũ còn sót lại sau khi xóa
        let currentMain = document.getElementById('productId').dataset.currentImageUrl || '';
        let currentAdditionals = JSON.parse(document.getElementById('productId').dataset.currentAdditionalImages || '[]');

        // 1. Xử lý upload thêm ảnh mới
        if (imageFiles.length > 0) {
            const uploadPromises = Array.from(imageFiles).map(async (file) => {
                const webpFile = await convertToWebP(file); // Chuyển đổi sang WebP trước khi upload
                const storageRef = ref(storage, `products/${productId}/${Date.now()}_${webpFile.name}`);
                const snapshot = await uploadBytes(storageRef, webpFile);
                return getDownloadURL(snapshot.ref);
            });
            
            const urls = await Promise.all(uploadPromises);
            
            if (!currentMain) {
                currentMain = urls[0];
                currentAdditionals = [...currentAdditionals, ...urls.slice(1)];
            } else {
                currentAdditionals = [...currentAdditionals, ...urls];
            }
        }

        const finalImageUrl = currentMain || 'https://via.placeholder.com/300';

        // 2. Lưu thông tin vào Firestore
    const productData = {
        name: document.getElementById('name').value,
        category: document.getElementById('category').value,
        price: Number(document.getElementById('price').value),
        stock: Number(document.getElementById('stock').value),
        rating: Number(document.getElementById('rating').value || 5),
        sale: Number(document.getElementById('sale').value || 0),
        imageUrl: finalImageUrl,
        additionalImages: currentAdditionals,
        description: document.getElementById('description').value,
        updatedAt: new Date().toISOString()
    };

        await setDoc(doc(db, "products", productId), productData);
        showToast(`Đã lưu sản phẩm ${productId} thành công!`);
        productForm.reset();
        document.getElementById('image-preview-container').innerHTML = '';
        delete document.getElementById('productId').dataset.currentImageUrl;
        delete document.getElementById('productId').dataset.currentAdditionalImages;
    } catch (error) {
        console.error("Lỗi khi lưu:", error);
        showToast("Lỗi lưu dữ liệu: " + error.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Lưu sản phẩm";
    }
});
}

// Lắng nghe danh sách sản phẩm thời gian thực
function initProductListener() {
    onSnapshot(collection(db, "products"), (snapshot) => {
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

        let htmlContent = '';
        snapshot.forEach((doc) => {
            const p = doc.data();
            const stockDisplay = p.stock <= 0 
                ? `<span class="stock-badge stock-out">Hết hàng</span>` 
                : p.stock;

            htmlContent += `
                <tr>
                    <td><small>${doc.id}</small></td>
                    <td><img src="${p.imageUrl}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                    <td><a href="javascript:void(0)" class="edit-link" data-id="${doc.id}" style="color: var(--text-black); font-weight: 600; text-decoration: none;">${p.name}</a></td>
                    <td>${new Intl.NumberFormat('vi-VN').format(p.price)}đ</td>
                    <td>${stockDisplay}</td>
                    <td>${p.rating || 5}★</td>
                    <td>${p.sale || 0}%</td>
                    <td>
                        <button class="btn-delete" data-id="${doc.id}">Xóa</button>
                    </td>
                </tr>
            `;
        });
        productListTable.innerHTML = htmlContent || '<tr><td colspan="8">Chưa có sản phẩm.</td></tr>';

        // Gán sự kiện xóa cho các nút mới render
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = () => deleteProduct(btn.getAttribute('data-id'));
        });

        // Gán sự kiện chỉnh sửa khi click vào tên
        document.querySelectorAll('.edit-link').forEach(link => {
            link.onclick = () => editProduct(link.getAttribute('data-id'));
        });
    });
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
            document.getElementById('rating').value = p.rating || 5;
            document.getElementById('sale').value = p.sale || 0;
            document.getElementById('description').value = p.description || '';
            
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

    if (!orderListTable) return;

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
                    <td><small>${doc.id}</small></td>
                    <td>${orderDate}</td>
                    <td>
                        <strong>${order.shippingAddress?.fullName || 'Khách vãng lai'}</strong><br>
                        <small>${order.shippingAddress?.phone || ''}</small>
                    </td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            ${order.items.map(i => `
                                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem;">
                                    <img src="${i.image}" alt="${i.name}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">
                                    <span title="${i.name}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${i.name} x${i.quantity}</span>
                                </div>
                            `).join('')}
                        </div>
                    </td>
                    <td>${totalAmount}đ</td>
                    <td>
                        <select class="status-select" onchange="window.updateOrderStatus('${doc.id}', this.value)">
                            <option value="Đang xử lý" ${status === 'Đang xử lý' ? 'selected' : ''}>Đang xử lý</option>
                            <option value="Đang giao hàng" ${status === 'Đang giao hàng' ? 'selected' : ''}>Đang giao hàng</option>
                            <option value="Đã hoàn thành" ${status === 'Đã hoàn thành' ? 'selected' : ''}>Đã hoàn thành</option>
                            <option value="Đã hủy" ${status === 'Đã hủy' ? 'selected' : ''}>Đã hủy</option>
                        </select>
                    </td>
                    <td>
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
    if (!userListTable) return;

    onSnapshot(collection(db, "users"), (snapshot) => {
        let htmlContent = '';
        snapshot.forEach((doc) => {
            const u = doc.data();
            const updatedAt = u.updatedAt ? new Date(u.updatedAt).toLocaleDateString('vi-VN') : 'N/A';
            const birthday = u.birthday ? new Date(u.birthday).toLocaleDateString('vi-VN') : 'N/A';

            htmlContent += `
                <tr>
                    <td>
                        <strong>${u.displayName || u.email || u.phoneNumber || 'Khách vãng lai'}</strong><br>
                        <small style="color: #888;">ID: ${doc.id}</small>
                    </td>
                    <td>${u.phoneNumber || u.phone || '---'}</td>
                    <td>${u.gender || '---'}</td>
                    <td>${birthday}</td>
                    <td>${updatedAt}</td>
                    <td>
                        <button class="btn-minimal" onclick="window.viewUserOrders('${doc.id}')">Xem đơn hàng</button>
                    </td>
                </tr>
            `;
        });
        userListTable.innerHTML = htmlContent || '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu khách hàng.</td></tr>';
    });
}

window.viewUserOrders = (userId) => {
    // Chuyển sang tab đơn hàng và lọc theo mã người dùng (hoặc thực hiện query riêng)
    showToast("Tính năng lọc đơn hàng theo User đang được phát triển", "info");
};

// --- Logic POS (Bán tại shop) ---
let posCart = [];
window.currentPOSCustomerId = null;

function renderPOSCart() {
    const list = document.getElementById('pos-cart-list');
    const totalInput = document.getElementById('pos-total-amount');
    if (!list) return;

    if (posCart.length === 0) {
        list.innerHTML = '<p style="color: #999; font-size: 0.9rem; text-align: center; margin-top: 2rem;">Chưa có sản phẩm nào được chọn.</p>';
        if (totalInput) totalInput.value = 0;
        return;
    }

    let total = 0;
    list.innerHTML = posCart.map((item, index) => {
        total += item.price * item.quantity;
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

    if (totalInput) totalInput.value = total;
}

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
    const existing = posCart.find(i => i.id === id);
    if (existing) {
        existing.quantity++;
    } else {
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
            <p>SĐT: 0901 234 567</p>
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
    const total = Number(document.getElementById('pos-total-amount').value);

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
        await addDoc(collection(db, "orders"), {
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
        renderPOSCart();
    } catch (e) { showToast("Lỗi POS: " + e.message, "error"); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = "Hoàn tất & Lưu doanh thu"; } }
};

// --- Logic Thống kê & Biểu đồ ---
let topSoldChart = null;

async function initStatistics(type = 'bar') {
    const ctx = document.getElementById('topSoldChart');
    if (!ctx) return;

    try {
        // Truy vấn Top 5 sản phẩm có 'sold' cao nhất
        const q = query(collection(db, "products"), orderBy("sold", "desc"), limit(5));
        const snap = await getDocs(q);
        
        const labels = [];
        const soldData = [];

        snap.forEach(doc => {
            const p = doc.data();
            labels.push(p.name);
            soldData.push(p.sold || 0);
        });

        // Nếu biểu đồ đã tồn tại thì hủy để vẽ lại (tránh lỗi render chồng lấp)
        if (topSoldChart) topSoldChart.destroy();

        const colors = [
            'rgba(0, 0, 0, 0.8)',
            'rgba(192, 57, 43, 0.8)',
            'rgba(39, 174, 96, 0.8)',
            'rgba(52, 152, 219, 0.8)',
            'rgba(241, 196, 15, 0.8)'
        ];

        const config = {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số lượng đã bán',
                    data: soldData,
                    backgroundColor: type === 'bar' ? 'rgba(0, 0, 0, 0.7)' : colors,
                    borderColor: type === 'bar' ? 'rgba(0, 0, 0, 1)' : '#fff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: type === 'pie', position: 'bottom' }
                }
            }
        };

        // Biểu đồ cột cần trục tọa độ, biểu đồ tròn thì không
        if (type === 'bar') {
            config.options.scales = { y: { beginAtZero: true, ticks: { stepSize: 1 } } };
        }

        topSoldChart = new Chart(ctx, config);
    } catch (e) { console.error("Lỗi vẽ biểu đồ:", e); }
}

// --- Biểu đồ doanh thu theo tháng ---
let revenueChart = null;

async function initRevenueChart() {
    const ctx = document.getElementById('revenueMonthChart');
    if (!ctx) return;

    try {
        // Chỉ lấy các đơn hàng đã hoàn thành để tính doanh thu thực tế
        const q = query(collection(db, "orders"), where("status", "==", "Đã hoàn thành"));
        const snap = await getDocs(q);
        
        const revenueMap = {}; // Lưu trữ { "01/2024": total, ... }

        snap.forEach(doc => {
            const order = doc.data();
            if (!order.orderDate) return;
            
            const date = order.orderDate.toDate();
            const monthYear = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
            
            revenueMap[monthYear] = (revenueMap[monthYear] || 0) + (order.totalAmount || 0);
        });

        // Sắp xếp các tháng theo thứ tự thời gian
        const sortedMonths = Object.keys(revenueMap).sort((a, b) => {
            const [mA, yA] = a.split('/').map(Number);
            const [mB, yB] = b.split('/').map(Number);
            return yA !== yB ? yA - yB : mA - mB;
        });

        const labels = sortedMonths;
        const data = sortedMonths.map(m => revenueMap[m]);

        if (revenueChart) revenueChart.destroy();

        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Doanh thu (VNĐ)',
                    data: data,
                    borderColor: '#27ae60', // Màu xanh lá biểu trưng cho sự tăng trưởng
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    fill: true,
                    tension: 0.3 // Làm đường kẻ cong mềm mại hơn
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => new Intl.NumberFormat('vi-VN').format(context.raw) + 'đ'
                        }
                    }
                }
            }
        });
    } catch (e) { console.error("Lỗi vẽ biểu đồ doanh thu:", e); }
}

document.addEventListener('DOMContentLoaded', () => {
    // Xin quyền gửi thông báo trình duyệt ngay khi Admin truy cập trang
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    initHeader('../', async (user) => {
        await checkAdminRights(user);
        // Chỉ khởi tạo các listener dữ liệu sau khi đã xác thực quyền Admin thành công
        // Điều này đảm bảo Firebase Security Rules nhận diện đúng request.auth
        if (document.body.style.display === "block") {
            initProductListener();
            initOrderListener();
            initUserListener();
        }
    });

    // Logic tìm kiếm sản phẩm trong POS
    const posSearchInput = document.getElementById('pos-product-search');
    const posSuggestions = document.getElementById('pos-product-suggestions');
    let posSearchTimer;

    if (posSearchInput && posSuggestions) {
        posSearchInput.addEventListener('input', () => {
            clearTimeout(posSearchTimer);
            const val = posSearchInput.value.trim();
            if (val.length < 2) {
                posSuggestions.style.display = 'none';
                return;
            }

            posSearchTimer = setTimeout(async () => {
                const q = query(collection(db, "products"), 
                    where("name", ">=", val), 
                    where("name", "<=", val + '\uf8ff'), 
                    limit(5));
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    posSuggestions.style.display = 'none';
                    return;
                }

                posSuggestions.innerHTML = snap.docs.map(doc => {
                    const p = doc.data();
                    return `
                        <div class="suggestion-item" onclick="window.addProductToPOS('${doc.id}', '${p.name}', ${p.price}, '${p.imageUrl}')">
                            <img src="${p.imageUrl}" alt="${p.name}">
                            <div class="suggestion-info">
                                <h5>${p.name}</h5>
                                <p>${new Intl.NumberFormat('vi-VN').format(p.price)}đ - Kho: ${p.stock}</p>
                            </div>
                        </div>
                    `;
                }).join('');
                posSuggestions.style.display = 'block';
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!posSearchInput.contains(e.target) && !posSuggestions.contains(e.target)) {
                posSuggestions.style.display = 'none';
            }
        });
    }
    
    renderPOSCart(); // Khởi tạo giao diện giỏ hàng trống cho POS

    // Lắng nghe sự kiện cho các bộ lọc đơn hàng
    const orderSearchProductInput = document.getElementById('order-search-product');
    const orderFilterStatusSelect = document.getElementById('order-filter-status');
    const btnApplyOrderFilters = document.getElementById('btn-apply-order-filters');

    if (btnApplyOrderFilters) {
        btnApplyOrderFilters.onclick = () => {
            const productName = orderSearchProductInput ? orderSearchProductInput.value.trim() : '';
            const status = orderFilterStatusSelect ? orderFilterStatusSelect.value : 'all';
            initOrderListener(productName, status);
        };
    }

    // Sự kiện phân trang đơn hàng
    document.getElementById('next-order-page')?.addEventListener('click', () => {
        currentOrderPage++;
        initOrderListener(orderSearchProductInput.value.trim(), orderFilterStatusSelect.value, 'next');
    });

    document.getElementById('prev-order-page')?.addEventListener('click', () => {
        currentOrderPage--;
        initOrderListener(orderSearchProductInput.value.trim(), orderFilterStatusSelect.value, 'prev');
    });

    // Tab switching logic cho Admin
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const sections = document.querySelectorAll('.admin-section');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            if (target) target.classList.add('active');
            
            // Nếu mở tab thống kê thì khởi tạo biểu đồ
            if (btn.dataset.target === 'stats-section') {
                const currentType = document.getElementById('chartTypeToggle')?.value || 'bar';
                initStatistics(currentType);
                initRevenueChart();
            }
        };
    });

    // Lắng nghe đổi kiểu biểu đồ
    document.getElementById('chartTypeToggle')?.addEventListener('change', (e) => {
        initStatistics(e.target.value);
    });
});
