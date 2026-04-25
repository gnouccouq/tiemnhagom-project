import { 
    db, auth, storage, showToast, loginWithGoogle, logout, updateCartCount, loadSharedComponents 
} from "./utils.js";
import { doc, setDoc, deleteDoc, collection, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Thiết lập Auth Listener để cập nhật UI Header và kiểm tra quyền Admin
function setupAdminAuth() {
    onAuthStateChanged(auth, async (user) => {
        const authSection = document.getElementById('auth-section');
        const navLinks = document.querySelector('.nav-links');

        // Xóa các nút cũ để reset giao diện tránh trùng lặp
        const existingAdminLink = document.getElementById('admin-link');
        if (existingAdminLink) existingAdminLink.remove();
        
        if (!user) {
            // Cập nhật giao diện nút đăng nhập nếu có
            if (authSection) {
                authSection.innerHTML = `<button id="btn-login" class="btn-minimal">Đăng nhập</button>`;
                document.getElementById('btn-login').addEventListener('click', loginWithGoogle);
            }
            alert("Vui lòng đăng nhập để truy cập trang quản trị.");
            window.location.href = "../index.html";
            return;
        }

        // Kiểm tra xem UID của user có trong collection 'admins' không
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            alert("Tài khoản của bạn không có quyền quản trị.");
            window.location.href = "../index.html";
        } else {
            // Cập nhật giao diện nút đăng xuất
            if (authSection) {
                authSection.innerHTML = `
                    <a href="../profile/" class="user-info-link">Chào Admin, ${user.displayName || user.email.split('@')[0]}!</a>
                    <button id="btn-logout" class="btn-minimal">Đăng xuất</button>
                `;
                document.getElementById('btn-logout').addEventListener('click', logout);
            }
            // Nếu đúng là admin thì mới hiển thị nội dung trang
            document.body.style.display = "block";
        }
    });
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
            <img src="${item.url}">
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
    submitBtn.innerText = "Đang xử lý...";

    try {
        // Lấy danh sách ảnh cũ còn sót lại sau khi xóa
        let currentMain = document.getElementById('productId').dataset.currentImageUrl || '';
        let currentAdditionals = JSON.parse(document.getElementById('productId').dataset.currentAdditionalImages || '[]');

        // 1. Xử lý upload thêm ảnh mới
        if (imageFiles.length > 0) {
            const uploadPromises = Array.from(imageFiles).map(async (file) => {
                const storageRef = ref(storage, `products/${productId}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
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
        submitBtn.innerText = "Lưu sản phẩm";
    }
});
}

// Lắng nghe danh sách sản phẩm thời gian thực
function initProductListener() {
    onSnapshot(collection(db, "products"), (snapshot) => {
        let htmlContent = '';
        snapshot.forEach((doc) => {
            const p = doc.data();
            htmlContent += `
                <tr>
                    <td><small>${doc.id}</small></td>
                    <td><img src="${p.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;"></td>
                    <td><a href="javascript:void(0)" class="edit-link" data-id="${doc.id}" style="color: var(--text-black); font-weight: 600; text-decoration: none;">${p.name}</a></td>
                    <td>${new Intl.NumberFormat('vi-VN').format(p.price)}đ</td>
                    <td>${p.stock}</td>
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

// Load Header/Footer
async function loadAdminComponents() {
    const success = await loadSharedComponents('../');
    if (success) {
        await updateCartCount();
        setupAdminAuth();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadAdminComponents();
    initProductListener();
});
