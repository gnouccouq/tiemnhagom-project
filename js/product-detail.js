import { 
    db, auth, storage, initHeader, showToast, updateCartCount, updateFavoriteCount, 
    renderProductCard, addToCart, addToHistory 
} from "./utils.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Hàm hỗ trợ cập nhật các thẻ meta cho SEO
function updateMetaTag(attr, value, content) {
    let element = document.querySelector(`meta[${attr}="${value}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, value);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

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
            
            const isOutOfStock = (p.stock || 0) <= 0;
            // Lưu vào lịch sử kèm danh mục để tối ưu gợi ý ở trang chủ
            addToHistory(productId, p.category);

            const hasSale = p.sale > 0;
            const soldCount = p.sold || 0;
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
                                 onclick="window.changeMainImage('${img}', ${idx})" 
                                 alt="${p.name} - ảnh chi tiết ${idx + 1}">
                        `).join('')}
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="product-detail-image">
                    <div class="main-img-container">
                        ${allImages.length > 1 ? `
                            <button class="gallery-nav-btn left" onclick="window.moveImage(-1)" aria-label="Ảnh trước">&#10094;</button>
                            <button class="gallery-nav-btn right" onclick="window.moveImage(1)" aria-label="Ảnh sau">&#10095;</button>
                        ` : ''}
                        <img id="main-product-img" src="${p.imageUrl}" alt="${p.name}">
                    </div>
                    ${galleryHtml}
                </div>
                <div class="product-detail-info">
                    <span class="category-tag">${p.category}</span>
                    <h1>${p.name}</h1>
                    <div class="rating" style="color: #f1c40f; margin-bottom: 1rem;">
                        ${starsHtml} 
                        <span style="color: #888; font-size: 0.8rem;">(${p.rating || 5}/5)</span>
                        <span style="color: #666; font-size: 0.9rem; margin-left: 10px; font-weight: 400;">| Đã bán ${soldCount}</span>
                    </div>
                    <div class="price-box">
                        ${hasSale ? `<span class="old-price">${new Intl.NumberFormat('vi-VN').format(p.price)}đ</span>` : ''}
                        <span class="main-price">${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</span>
                        ${hasSale ? `<span class="sale-label">Giảm ${p.sale}%</span>` : ''}
                    </div>
                    <div class="description">
                        <h4>Mô tả sản phẩm</h4>
                        <p>${p.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}</p>
                    </div>
                    <div class="stock-info ${isOutOfStock ? 'out' : ''}">${isOutOfStock ? 'Hết hàng' : `Tồn kho: ${p.stock} sản phẩm`}</div>
                    
                    <div class="purchase-area">
                        <div class="quantity-wrapper">
                            <label for="product-quantity">Số lượng</label>
                            <div class="quantity-controls">
                                <button type="button" class="q-btn" onclick="document.getElementById('product-quantity').stepDown()" aria-label="Giảm số lượng" ${isOutOfStock ? 'disabled' : ''}>&minus;</button>
                                <input type="number" id="product-quantity" value="1" min="1" max="${p.stock}" readonly>
                                <button type="button" class="q-btn" onclick="document.getElementById('product-quantity').stepUp()" aria-label="Tăng số lượng" ${isOutOfStock ? 'disabled' : ''}>&plus;</button>
                            </div>
                        </div>
                        <div class="action-buttons">
                            <button id="btn-buy-now" class="btn-dark main-action" ${isOutOfStock ? 'disabled' : ''}>${isOutOfStock ? 'Hết hàng' : 'Mua ngay'}</button>
                            <button id="btn-add-to-cart" class="btn-outline" ${isOutOfStock ? 'disabled' : ''}>Thêm vào giỏ hàng</button>
                            <button class="detail-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavoriteDetail('${productId}')" aria-label="${isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}" aria-pressed="${isFav}">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Tối ưu SEO: Cập nhật Title và các thẻ Meta (Description, Open Graph)
            const seoTitle = `${p.name} | ${p.category} | Tiệm Nhà Gốm`;
            document.title = seoTitle;
            
            const seoDesc = p.description 
                ? p.description.substring(0, 160).replace(/\s+/g, ' ').trim() 
                : `Sản phẩm ${p.name} thủ công tinh xảo từ Tiệm Nhà Gốm. Khám phá ngay bộ sưu tập gốm sứ ${p.category} độc đáo.`;
            
            updateMetaTag('name', 'description', seoDesc);
            updateMetaTag('property', 'og:title', seoTitle);
            updateMetaTag('property', 'og:description', seoDesc);
            updateMetaTag('property', 'og:image', p.imageUrl);
            updateMetaTag('property', 'og:url', window.location.href);

            // Tối ưu SEO: Dữ liệu có cấu trúc Schema.org (JSON-LD)
            const productSchema = {
                "@context": "https://schema.org/",
                "@type": "Product",
                "name": p.name,
                "image": allImages,
                "description": seoDesc,
                "sku": productId,
                "brand": {
                    "@type": "Brand",
                    "name": "Tiệm Nhà Gốm"
                },
                "offers": {
                    "@type": "Offer",
                    "url": window.location.href,
                    "priceCurrency": "VND",
                    "price": currentPrice,
                    "availability": p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                    "itemCondition": "https://schema.org/NewCondition"
                },
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": p.rating || 5,
                    "bestRating": "5",
                    "worstRating": "1",
                    "ratingCount": "1"
                }
            };

            // Tối ưu SEO: Breadcrumb Schema
            const baseUrl = window.location.origin + window.location.pathname.split('/product/')[0];
            const breadcrumbSchema = {
                "@context": "https://schema.org/",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "Trang chủ",
                        "item": baseUrl + "/"
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": p.category,
                        "item": `${baseUrl}/products/?category=${encodeURIComponent(p.category)}`
                    },
                    {
                        "@type": "ListItem",
                        "position": 3,
                        "name": p.name,
                        "item": window.location.href
                    }
                ]
            };

            let scriptTag = document.getElementById('product-schema');
            if (!scriptTag) {
                scriptTag = document.createElement('script');
                scriptTag.id = 'product-schema';
                scriptTag.type = 'application/ld+json';
                document.head.appendChild(scriptTag);
            }
            scriptTag.textContent = JSON.stringify([productSchema, breadcrumbSchema]);

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

            // Nút Mua ngay
            document.getElementById('btn-buy-now').onclick = async (e) => {
                const btn = e.currentTarget;
                const qty = parseInt(document.getElementById('product-quantity').value);
                
                // Hiển thị trạng thái loading
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-small"></span> Đang xử lý...';

                await addToCart({
                    id: productId,
                    name: p.name,
                    price: currentPrice,
                    image: p.imageUrl,
                    quantity: qty
                });
                window.location.href = '../cart/'; // Chuyển hướng thẳng tới giỏ hàng
            };

            fetchRelatedProducts(productId, p.category); // Gọi hàm lấy sản phẩm liên quan
            fetchRecentlyViewed(productId); // Gọi hàm lấy sản phẩm đã xem gần đây
            fetchReviews(productId); // Tải đánh giá của khách hàng
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

// Hàm lấy sản phẩm vừa xem từ LocalStorage
async function fetchRecentlyViewed(currentProductId) {
    const viewedSection = document.getElementById('recently-viewed-section');
    const viewedGrid = document.getElementById('recently-viewed-grid');
    const history = JSON.parse(localStorage.getItem('viewed_products')) || [];

    // Lọc bỏ sản phẩm đang xem hiện tại và lấy tối đa 4 sản phẩm
    const historyToShow = history
        .map(item => typeof item === 'string' ? item : item.id) // Trích xuất ID từ object
        .filter(id => id !== currentProductId)
        .slice(0, 4);

    if (historyToShow.length === 0) return;

    try {
        let htmlContent = '';
        for (const id of historyToShow) {
            const pSnap = await getDoc(doc(db, "products", id));
            if (pSnap.exists()) {
                // Dùng renderProductCard từ utils, linkBase là './index.html'
                htmlContent += renderProductCard(pSnap.data(), id, [], './index.html');
            }
        }

        if (htmlContent) {
            viewedGrid.innerHTML = htmlContent;
            viewedSection.style.display = 'block';
        }
    } catch (error) {
        console.error("Lỗi lấy lịch sử xem:", error);
    }
}

// --- Logic Đánh giá & Bình luận ---
let selectedRating = 5;

async function fetchReviews(productId) {
    const list = document.getElementById('reviews-list');
    try {
        const q = query(collection(db, "reviews"), where("productId", "==", productId), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            list.innerHTML = '<p style="color: #888; font-style: italic;">Chưa có đánh giá nào cho sản phẩm này.</p>';
            return;
        }

        list.innerHTML = snap.docs.map(doc => {
            const r = doc.data();
            const date = r.createdAt ? new Date(r.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Mới đây';
            let stars = '';
            for(let i=1; i<=5; i++) stars += i <= r.rating ? '★' : '☆';

            const imagesHtml = (r.images || []).map(url => `
                <img src="${url}" class="review-img" onclick="window.zoomReviewImg('${url}')" alt="Ảnh feedback">
            `).join('');

            return `
                <div class="review-item">
                    <div class="review-header">
                        <img src="${r.userAvatar || '../Asset/images/logo.png'}" class="review-avatar" alt="User">
                        <div class="review-user-info">
                            <h5>${r.userName || 'Khách hàng'}</h5>
                            <div style="color: #f1c40f; font-size: 0.8rem;">${stars} <span class="review-date">${date}</span></div>
                        </div>
                    </div>
                    <div class="review-content">
                        <p>${r.comment}</p>
                        <div class="review-images-gallery">${imagesHtml}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error(e); }
}

// Khởi tạo Form Đánh giá
function initReviewForm(productId) {
    const btnShow = document.getElementById('btn-show-review-form');
    const formContainer = document.getElementById('review-form-container');
    const starInput = document.getElementById('star-rating-input');
    const form = document.getElementById('product-review-form');

    if (!btnShow || !formContainer) return;

    btnShow.onclick = () => {
        if (!auth.currentUser) {
            showToast("Vui lòng đăng nhập để viết đánh giá", "error");
            return;
        }
        formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
    };

    // Tạo UI chọn sao
    starInput.innerHTML = [1, 2, 3, 4, 5].map(i => `<span data-val="${i}" class="active">★</span>`).join('');
    starInput.querySelectorAll('span').forEach(star => {
        star.onclick = (e) => {
            selectedRating = parseInt(e.target.dataset.val);
            starInput.querySelectorAll('span').forEach(s => {
                s.classList.toggle('active', parseInt(s.dataset.val) <= selectedRating);
            });
        };
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const comment = document.getElementById('review-comment').value.trim();
        const imageFiles = document.getElementById('review-images').files;
        const submitBtn = form.querySelector('button[type="submit"]');

        if (!comment) return;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Đang gửi...';

            // 1. Upload ảnh feedback (nếu có)
            const imageUrls = [];
            if (imageFiles.length > 0) {
                for (const file of imageFiles) {
                    const storageRef = ref(storage, `reviews/${productId}/${auth.currentUser.uid}_${Date.now()}_${file.name}`);
                    const snapshot = await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(snapshot.ref);
                    imageUrls.push(url);
                }
            }

            // 2. Lưu vào Firestore
            await addDoc(collection(db, "reviews"), {
                productId,
                userId: auth.currentUser.uid,
                userName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
                userAvatar: auth.currentUser.photoURL,
                rating: selectedRating,
                comment,
                images: imageUrls,
                createdAt: serverTimestamp()
            });

            showToast("Cảm ơn bạn đã đánh giá sản phẩm!");
            form.reset();
            formContainer.style.display = 'none';
            fetchReviews(productId);
        } catch (error) {
            showToast("Lỗi khi gửi đánh giá: " + error.message, "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Gửi đánh giá";
        }
    };
}

window.zoomReviewImg = (url) => {
    let modal = document.getElementById('img-zoom-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'img-zoom-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="modal-content" style="background: none; box-shadow: none; text-align: center;">
            <span class="modal-close" style="color: #fff;" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
            <img src="${url}" class="review-modal-img">
        </div>
    `;
    modal.classList.add('active');
    modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
};

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', (user) => {
        fetchProductDetail();
        
        // Lấy productId từ URL để khởi tạo Form
        const urlParams = new URLSearchParams(window.location.search);
        const pid = urlParams.get('id');
        if (pid) initReviewForm(pid);
    });
});
