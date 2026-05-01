import { 
    db, auth, storage, showToast, initHeader, updateCartCount, PRODUCT_CATEGORIES
} from "./utils.js";
import { 
    doc, setDoc, deleteDoc, collection, onSnapshot, getDoc, getDocs, query, orderBy, 
    limit, startAfter, endBefore, limitToLast, where, addDoc, serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
                // Cho phép truyền size động để tạo thumbnail
                const TARGET_SIZE = window._processingSize || 1000;
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

                let finalSize = Math.min(sWidth, TARGET_SIZE);
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

// Hàm tự động đổ danh mục vào Select của Admin Form
function populateCategorySelect() {
    const categorySelect = document.getElementById('category');
    if (!categorySelect) return;

    let html = '<option value="">-- Chọn danh mục --</option>';
    for (const [group, subs] of Object.entries(PRODUCT_CATEGORIES)) {
        html += `<optgroup label="${group}">`;
        subs.forEach(sub => {
            html += `<option value="${sub}">${sub}</option>`;
        });
        html += `</optgroup>`;
    }
    categorySelect.innerHTML = html;
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
            if (mapping[data.category]) {
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
    
    // Validation cơ bản
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
                const fileProgressDiv = document.createElement('div');
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
                window._processingSize = 1000;
                const webpFile = await convertToWebP(file);
                window._processingSize = 400; // Size cho thumbnail
                const thumbWebp = await convertToWebP(file);

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
            
            if (!currentMain) {
                currentMain = results[0].fullUrl;
                currentThumb = results[0].thumbUrl; // Cần thêm trường thumbUrl vào Firestore
                currentAdditionals = [...currentAdditionals, ...results.slice(1).map(r => r.fullUrl)];
            } else {
                currentAdditionals = [...currentAdditionals, ...results.map(r => r.fullUrl)];
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
        seoTitle: document.getElementById('seoTitle').value.trim(),
        seoDescription: document.getElementById('seoDescription').value.trim(),
        slug: document.getElementById('slug').value.trim(),
        updatedAt: new Date().toISOString()
    };

        await setDoc(doc(db, "products", productId), productData);
        showToast(`Đã lưu sản phẩm ${productId} thành công!`);
        productForm.reset();
        progressContainer.style.display = 'none';
        document.getElementById('image-preview-container').innerHTML = '';
        delete document.getElementById('productId').dataset.currentImageUrl;
        delete document.getElementById('productId').dataset.currentAdditionalImages;
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
    });
}

// Hàm hiển thị bảng sản phẩm Admin (có hỗ trợ lọc tìm kiếm)
function renderAdminProductTable() {
    const listTable = document.getElementById('admin-product-list');
    const searchInput = document.getElementById('admin-product-search');
    if (!listTable) return;

    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
    // Lọc sản phẩm dựa trên từ khóa tìm kiếm từ mảng local đã cache
    const filtered = posProductsLocal.filter(p => 
        (p.name || "").toLowerCase().includes(term) || p.id.toLowerCase().includes(term)
    );

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
                    <td data-label="Người dùng">
                        <strong>${u.displayName || u.email || u.phoneNumber || 'Khách vãng lai'}</strong><br>
                        <small style="color: #888;">ID: ${doc.id}</small>
                    </td>
                    <td data-label="SĐT">${u.phoneNumber || u.phone || '---'}</td>
                    <td data-label="Giới tính">${u.gender || '---'}</td>
                    <td data-label="Ngày sinh">${birthday}</td>
                    <td data-label="Cập nhật">${updatedAt}</td>
                    <td data-label="Thao tác">
                        <button class="btn-minimal" onclick="window.viewUserOrders('${doc.id}')">Xem đơn hàng</button>
                    </td>
                </tr>
            `;
        });
        userListTable.innerHTML = htmlContent || '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu khách hàng.</td></tr>';
    });
}

function initCouponListener() {
    const list = document.getElementById('admin-coupon-list');
    if (!list) return;

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
            initCouponListener();
            populateCategorySelect(); // Nạp danh mục vào form ngay khi xác thực thành công
        }
    });

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