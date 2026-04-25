import { 
    db, auth, loginWithGoogle, logout, updateCartCount, 
    updateFavoriteCount, toggleFavoriteLogic, loadSharedComponents, showToast 
} from "./utils.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Biến toàn cục để quản lý gallery
let allImages = [];
let currentIndex = 0;
let autoSlideInterval;

// Hàm khởi tạo/đặt lại bộ đếm tự động chuyển ảnh
function startAutoSlide() {
    if (autoSlideInterval) clearInterval(autoSlideInterval);
    if (allImages.length > 1) {
        autoSlideInterval = setInterval(() => {
            window.moveImage(1, false); // false để không tạo vòng lặp vô tận của startAutoSlide
        }, 5000);
    }
}

// Hàm toggle yêu thích
window.toggleFavoriteDetail = async (productId) => {
    // Hiệu ứng heartbeat cho nút
    const btn = document.querySelector('.detail-fav-btn');
    if (btn) {
        btn.classList.add('heartbeat-anim');
        setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    }

    let favs = [];
    const user = auth.currentUser;
    if (user) {
        const favRef = doc(db, "favorites", user.uid);
        const favSnap = await getDoc(favRef);
        favs = favSnap.exists() ? favSnap.data().productIds : [];
        
        if (favs.includes(productId)) {
            favs = favs.filter(id => id !== productId);
            showToast("Đã xóa khỏi danh sách yêu thích");
        } else {
            favs.push(productId);
            showToast("Đã thêm vào danh sách yêu thích");
        }
        
        await setDoc(favRef, { productIds: favs });
    } else {
        favs = JSON.parse(localStorage.getItem('favorites')) || [];
        if (favs.includes(productId)) {
            favs = favs.filter(id => id !== productId);
            showToast("Đã xóa khỏi danh sách yêu thích");
        } else {
            favs.push(productId);
            showToast("Đã thêm vào danh sách yêu thích");
        }
        localStorage.setItem('favorites', JSON.stringify(favs));
    }
    updateFavoriteCount();
    fetchProductDetail(); // Reload UI
};

// Hàm thêm sản phẩm vào giỏ hàng (LocalStorage)
async function addToCart(product) {
    let cart = [];
    const user = auth.currentUser;

    if (user) {
        const cartRef = doc(db, "carts", user.uid);
        const cartSnap = await getDoc(cartRef);
        cart = cartSnap.exists() ? cartSnap.data().items : [];
    } else {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        existingItem.quantity += product.quantity;
    } else {
        cart.push(product);
    }

    if (user) {
        await setDoc(doc(db, "carts", user.uid), { items: cart });
    } else {
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    updateCartCount(); // Cập nhật ngay con số trên header
    showToast(`Đã thêm ${product.quantity} ${product.name} vào giỏ hàng!`);
}

// Hàm đổi ảnh chính khi nhấn vào thumbnail
window.changeMainImage = (src, index, isUserAction = true) => {
    const mainImg = document.getElementById('main-product-img');
    if (!mainImg || (currentIndex === index && isUserAction)) return;

    if (isUserAction) startAutoSlide();
    
    currentIndex = index;
    
    // Hiệu ứng Fade out
    mainImg.style.opacity = '0';
    setTimeout(() => {
        mainImg.src = src;
        mainImg.style.opacity = '1'; // Hiệu ứng Fade in
    }, 300); // 300ms khớp với thời gian transition trong CSS

    // Cập nhật trạng thái active cho thumbnail
    document.querySelectorAll('.thumbnail').forEach((t, i) => {
        t.classList.toggle('active', i === index);
    });
};

// Hàm bấm nút qua lại trên ảnh lớn
window.moveImage = (direction, isUserAction = true) => {
    if (allImages.length <= 1) return;
    
    if (isUserAction) startAutoSlide();
    
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = allImages.length - 1;
    if (nextIndex >= allImages.length) nextIndex = 0;

    window.changeMainImage(allImages[nextIndex], nextIndex, isUserAction);
    
    // Cuộn thumbnail tương ứng vào tầm nhìn
    const activeThumb = document.querySelectorAll('.thumbnail')[nextIndex];
    if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
};

// Hàm thiết lập listener cho trạng thái đăng nhập (Đồng bộ Header)
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        const authSection = document.getElementById('auth-section');
        const navLinks = document.querySelector('.nav-links');

        // Xóa nút admin cũ nếu có
        const existingAdminLink = document.getElementById('admin-link');
        if (existingAdminLink) existingAdminLink.remove();

        if (authSection) {
            if (user) {
                // Sync logic
                const localCart = JSON.parse(localStorage.getItem('cart')) || [];
                if (localCart.length > 0) {
                    const cartRef = doc(db, "carts", user.uid);
                    const cartSnap = await getDoc(cartRef);
                    let firebaseCart = cartSnap.exists() ? cartSnap.data().items : [];
                    localCart.forEach(localItem => {
                        const existing = firebaseCart.find(i => i.id === localItem.id);
                        if (existing) existing.quantity += localItem.quantity;
                        else firebaseCart.push(localItem);
                    });
                    await setDoc(cartRef, { items: firebaseCart });
                    localStorage.removeItem('cart');
                }
                updateCartCount();
                
                // Đồng bộ Favorites
                const localFavs = JSON.parse(localStorage.getItem('favorites')) || [];
                if (localFavs.length > 0) {
                    const favRef = doc(db, "favorites", user.uid);
                    const favSnap = await getDoc(favRef);
                    let firebaseFavs = favSnap.exists() ? favSnap.data().productIds : [];
                    localFavs.forEach(id => {
                        if (!firebaseFavs.includes(id)) firebaseFavs.push(id);
                    });
                    await setDoc(favRef, { productIds: firebaseFavs });
                    localStorage.removeItem('favorites');
                }
                updateFavoriteCount();
                fetchProductDetail(); // Cập nhật lại UI để hiển thị trạng thái tim chính xác cho user

                authSection.innerHTML = `
                    <a href="../profile/" class="user-info-link">Xin chào, ${user.displayName || user.email.split('@')[0]}!</a>
                    <button id="btn-logout" class="btn-minimal">Đăng xuất</button>
                `;
                document.getElementById('btn-logout').addEventListener('click', logout);
            } else {
                authSection.innerHTML = `
                    <button id="btn-login" class="btn-minimal">Đăng nhập</button>
                `;
                document.getElementById('btn-login').addEventListener('click', loginWithGoogle);
            }
        }
    });
}

// Hàm xử lý nút cuộn lên đầu trang (Đồng bộ Footer)
function setupScrollToTop() {
    const btnScrollTop = document.getElementById('btn-scroll-top');
    if (!btnScrollTop) return;

    window.onscroll = function() {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btnScrollTop.classList.add('show');
        } else {
            btnScrollTop.classList.remove('show');
        }
    };

    btnScrollTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

async function fetchProductDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const container = document.getElementById('product-detail-content');

    if (!productId) {
        container.innerHTML = "<p>Không tìm thấy sản phẩm.</p>";
        return;
    }

    try {
        const docRef = doc(db, "products", productId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const p = docSnap.data();
            const hasSale = p.sale > 0;
            const currentPrice = hasSale ? p.price * (1 - p.sale / 100) : p.price;
            
            let starsHtml = '';
            for(let i = 1; i <= 5; i++) starsHtml += i <= Math.round(p.rating || 5) ? '★' : '☆';

            const additionalImages = p.additionalImages || [];
            allImages = [p.imageUrl, ...additionalImages];
            currentIndex = 0;
            startAutoSlide();
            
            // Xác định trạng thái yêu thích từ Firestore nếu đã đăng nhập, ngược lại dùng LocalStorage
            let isFav = false;
            if (auth.currentUser) {
                const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
                if (favSnap.exists()) {
                    isFav = favSnap.data().productIds.includes(productId);
                }
            } else {
                const favs = JSON.parse(localStorage.getItem('favorites')) || [];
                isFav = favs.includes(productId);
            }
            
            let galleryHtml = '';
            if (allImages.length > 1) {
                galleryHtml = `
                    <div class="product-image-gallery">
                        ${allImages.map((img, idx) => `
                            <img src="${img}" class="thumbnail ${idx === 0 ? 'active' : ''}" 
                                 onclick="window.changeMainImage('${img}', ${idx})">
                        `).join('')}
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="product-detail-image">
                    <div class="main-img-container">
                        ${allImages.length > 1 ? `
                            <button class="gallery-nav-btn left" onclick="window.moveImage(-1)">&#10094;</button>
                            <button class="gallery-nav-btn right" onclick="window.moveImage(1)">&#10095;</button>
                        ` : ''}
                        <img id="main-product-img" src="${p.imageUrl}" alt="${p.name}">
                    </div>
                    ${galleryHtml}
                </div>
                <div class="product-detail-info">
                    <span class="category-tag">${p.category}</span>
                    <h1>${p.name}</h1>
                    <div class="rating" style="color: #f1c40f; margin-bottom: 1rem;">${starsHtml} <span style="color: #888; font-size: 0.8rem;">(${p.rating || 5}/5)</span></div>
                    <div class="price-box">
                        ${hasSale ? `<span class="old-price">${new Intl.NumberFormat('vi-VN').format(p.price)}đ</span>` : ''}
                        <span class="main-price">${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</span>
                        ${hasSale ? `<span class="sale-label">Giảm ${p.sale}%</span>` : ''}
                    </div>
                    <div class="description">
                        <h4>Mô tả sản phẩm</h4>
                        <p>${p.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}</p>
                    </div>
                    <div class="stock-info">Tồn kho: ${p.stock} sản phẩm</div>
                    <div class="purchase-section">
                        <div class="quantity-input">
                            <label>Số lượng:</label>
                            <div class="quantity-controls">
                                <button type="button" class="q-btn" onclick="document.getElementById('product-quantity').stepDown()">-</button>
                                <input type="number" id="product-quantity" value="1" min="1" max="${p.stock}">
                                <button type="button" class="q-btn" onclick="document.getElementById('product-quantity').stepUp()">+</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; flex: 1; align-items: flex-end;">
                            <button id="btn-add-to-cart" class="btn-dark" style="flex: 1; margin-top: 0;">Thêm vào giỏ hàng</button>
                            <button class="detail-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavoriteDetail('${productId}')" title="${isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.title = `${p.name} - Tiệm Nhà Gốm`;

            // Gán sự kiện cho nút thêm vào giỏ hàng
            document.getElementById('btn-add-to-cart').onclick = () => {
                const qty = parseInt(document.getElementById('product-quantity').value);
                addToCart({
                    id: productId,
                    name: p.name,
                    price: currentPrice,
                    image: p.imageUrl,
                    quantity: qty
                });
            };

            fetchRelatedProducts(productId, p.category); // Gọi hàm lấy sản phẩm liên quan
        } else {
            container.innerHTML = "<p>Sản phẩm không tồn tại.</p>";
        }
    } catch (error) {
        console.error("Lỗi:", error);
        container.innerHTML = "<p>Đã xảy ra lỗi khi tải dữ liệu.</p>";
    }
}

// Hàm lấy sản phẩm liên quan
async function fetchRelatedProducts(currentProductId, currentCategory) {
    const relatedSection = document.getElementById('related-products-section');
    const relatedGrid = document.getElementById('related-product-grid');
    try {
        const q = query(
            collection(db, "products"),
            where("category", "==", currentCategory)
            // limit(4) // Có thể thêm giới hạn số lượng sản phẩm liên quan
        );
        const querySnapshot = await getDocs(q);
        
        let htmlContent = '';
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.id !== currentProductId && count < 4) { // Lấy tối đa 4 sản phẩm khác
                htmlContent += renderProductCard(doc.data(), doc.id);
                count++;
            }
        });

        if (htmlContent) {
            relatedGrid.innerHTML = htmlContent;
            relatedSection.style.display = 'block';
        }
    } catch (error) {
        console.error("Lỗi lấy sản phẩm liên quan:", error);
    }
}

// Hàm bổ trợ render thẻ sản phẩm (sao chép từ main.js và điều chỉnh đường dẫn)
function renderProductCard(product, id) {
    const rating = product.rating || 5;
    let starsHtml = '';
    for(let i = 1; i <= 5; i++) starsHtml += i <= Math.round(rating) ? '★' : '☆';

    const hasSale = product.sale > 0;
    const currentPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
    
    const priceHtml = hasSale 
        ? `<p class="price"><span class="old-price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</span> ${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</p>`
        : `<p class="price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</p>`;

    const saleBadge = hasSale ? `<div class="sale-badge">-${product.sale}%</div>` : '';
    const sparkleClass = hasSale ? 'sale-sparkle' : '';

    return `
        <a href="./index.html?id=${id}" class="product-link" style="text-decoration: none; color: inherit;">
            <div class="product-card ${sparkleClass}" style="position: relative;">
                ${saleBadge}
                <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" 
                     alt="${product.name}" 
                     style="width:100%; object-fit: cover; aspect-ratio: 1/1;">
                <h3>${product.name}</h3>
                <div class="rating" style="color: #f1c40f; margin-bottom: 0.5rem; font-size: 0.9rem;">${starsHtml}</div>
                ${priceHtml}
            </div>
        </a>
    `;
}

async function loadDetailComponents() {
    try {
        const [h, f] = await Promise.all([
            fetch('../components/header.html'),
            fetch('../components/footer.html')
        ]);

        const fixPaths = (html) => {
            return html
                .replace(/src="Asset\//g, 'src="../Asset/')
                .replace(/href="\.\/"/g, 'href="../"')
                .replace(/href="products\/"/g, 'href="../products/"') // Trang này là product-detail, products ở ngoài 1 cấp
                .replace(/href="cart\/"/g, 'href="../cart/"')
                .replace(/href="profile\/"/g, 'href="../profile/"')
                .replace(/href="favorites\/"/g, 'href="../profile/"');
        };

        if (h.ok) {
            document.getElementById('header-placeholder').innerHTML = fixPaths(await h.text());
            setupAuthListener(); // Kích hoạt login/logout và nút Admin
            updateCartCount();   // Cập nhật số lượng giỏ hàng
            updateFavoriteCount();
        }
        if (f.ok) {
            document.getElementById('footer-placeholder').innerHTML = fixPaths(await f.text());
            setupScrollToTop(); // Kích hoạt nút cuộn trang
        }
    } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => {
    loadDetailComponents();
    fetchProductDetail();
});
