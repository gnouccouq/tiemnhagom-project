import { 
    db, auth, storage, initHeader, showToast, updateCartCount, updateFavoriteCount, 
    renderProductCard, addToCart, addToHistory, initAutocomplete, updateSEO
} from "./utils.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, updateDoc, serverTimestamp, orderBy, limit, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Biến toàn cục để quản lý gallery
let allImages = [];
let currentIndex = 0;
let autoSlideInterval;
let isAdmin = false;

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
    
    // Chỉ cuộn thumbnail vào tầm nhìn khi người dùng chủ động bấm (tránh giật trang khi auto-slide)
    const activeThumb = document.querySelectorAll('.thumbnail')[nextIndex];
    if (activeThumb && isUserAction) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
};

async function fetchProductDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const container = document.getElementById('product-detail-content');

    if (!productId || !container) {
        container.innerHTML = "<p>Không tìm thấy sản phẩm.</p>";
        return;
    }

    // HIỂN THỊ LOADING SKELETON NGAY LẬP TỨC
    container.innerHTML = `
        <div class="product-detail-grid">
            <div class="product-detail-image">
                <div class="skeleton skeleton-detail-img"></div>
                <div style="display: flex; gap: 10px;">
                    <div class="skeleton" style="width: 60px; height: 60px; border-radius: 4px;"></div>
                    <div class="skeleton" style="width: 60px; height: 60px; border-radius: 4px;"></div>
                </div>
            </div>
            <div class="product-detail-info">
                <div class="skeleton" style="width: 30%; height: 1rem; margin-bottom: 1rem;"></div>
                <div class="skeleton skeleton-detail-title"></div>
                <div class="skeleton" style="width: 40%; height: 2rem; margin-bottom: 2rem;"></div>
                <div class="skeleton skeleton-detail-text"></div>
                <div class="skeleton skeleton-detail-text" style="width: 90%;"></div>
                <div class="skeleton" style="width: 100%; height: 50px; margin-top: 2rem;"></div>
            </div>
        </div>
    `;

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
            const displayRating = (p.rating !== undefined && p.rating !== null) ? p.rating : 5;
            for(let i = 1; i <= 5; i++) starsHtml += i <= Math.round(displayRating) ? '★' : '☆';

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

            // Bao bọc toàn bộ nội dung thật trong div .fade-in-content để tạo hiệu ứng mượt mà
            container.innerHTML = `
            <div class="fade-in-content">
                <div class="product-detail-grid">
                    <div class="product-detail-image">
                        <div class="main-img-container">
                            ${allImages.length > 1 ? `
                                <button class="gallery-nav-btn left" onclick="window.moveImage(-1)" aria-label="Ảnh trước">&#10094;</button>
                                <button class="gallery-nav-btn right" onclick="window.moveImage(1)" aria-label="Ảnh sau">&#10095;</button>
                            ` : ''}
                            <img id="main-product-img" src="${p.imageUrl}" alt="${p.name}" fetchpriority="high" onclick="window.openFullScreen(this.src)">
                        </div>
                        ${galleryHtml}
                    </div>
                    <div class="product-info-sticky">
                        <div class="product-main-meta">
                            <span class="category-tag">${p.category}</span>
                            <span class="product-sku">Mã: ${productId}</span>
                            <h1>${p.name}</h1>
                            <div class="rating" style="color: #f1c40f;">
                                ${starsHtml} 
                                <span style="color: #888; font-size: 0.85rem; font-weight:400; margin-left:8px;">(${displayRating}/5) &bull; Đã bán ${soldCount}</span>
                            </div>
                            <div class="product-price-row">
                                <span class="main-price">${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ</span>
                                ${hasSale ? `<span class="old-price" style="text-decoration:line-through; color:#aaa; font-size:1.2rem;">${new Intl.NumberFormat('vi-VN').format(p.price)}đ</span>` : ''}
                                ${hasSale ? `<span class="sale-label" style="color:#c0392b; font-weight:700;">-${p.sale}%</span>` : ''}
                            </div>
                        </div>

                        <div class="product-description">
                            <h4>Câu chuyện sản phẩm</h4>
                            <p>${p.description ? p.description : 'Hiện tại chưa có thông tin.'}</p>
                        </div>

                        <div class="purchase-card">
                            <div class="stock-info ${isOutOfStock ? 'out' : ''}" style="width: 100%; margin-bottom: 0.5rem;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8V21H3V8M1 3H23V8H1V3ZM10 12H14"/></svg>
                                <span style="font-size: 0.85rem;">${isOutOfStock ? 'Rất tiếc, sản phẩm đã hết hàng' : `Trong kho: ${p.stock} sản phẩm`}</span>
                            </div>
                            <div class="quantity-box">
                                <div class="quantity-controls">
                                    <button type="button" class="q-btn" onclick="const input = document.getElementById('product-quantity'); if(parseInt(input.value) > 1) input.stepDown()" ${isOutOfStock ? 'disabled' : ''}>&minus;</button>
                                    <input type="number" id="product-quantity" value="1" min="1" max="${p.stock}" readonly>
                                    <button type="button" class="q-btn" onclick="document.getElementById('product-quantity').stepUp()" ${isOutOfStock ? 'disabled' : ''}>&plus;</button>
                                </div>
                            </div>

                            <div class="action-group">
                                <button id="btn-buy-now" class="btn-dark" ${isOutOfStock ? 'disabled' : ''}>${isOutOfStock ? 'Hết hàng' : 'Mua ngay'}</button>
                                <button id="btn-add-to-cart" class="btn-outline" ${isOutOfStock ? 'disabled' : ''}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                                    Giỏ hàng
                                </button>
                                <button class="detail-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavoriteDetail('${productId}')" style="border-radius:8px">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                </button>
                                <button class="detail-share-btn" onclick="window.shareProduct()" style="border-radius:8px" title="Chia sẻ sản phẩm">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Phần Đánh giá từ người dùng -->
                <div class="reviews-section">
                    <div class="reviews-header">
                        <h3>Đánh giá từ khách hàng</h3>
                        <button id="btn-show-review-form" class="btn-outline">Viết đánh giá của bạn</button>
                    </div>
                    <div id="review-form-container" style="display: none;" class="fade-in-content">
                        <form id="product-review-form">
                            <label>Mức độ hài lòng của bạn:</label>
                            <div class="star-rating-input" id="star-rating-input"></div>
                            <textarea id="review-comment" placeholder="Chia sẻ cảm nhận của bạn về sản phẩm này..."></textarea>
                            <input type="file" id="review-images" multiple accept="image/*" style="margin-bottom: 1rem;">
                            <button type="submit" class="btn-dark" style="width: auto; padding: 0.8rem 2rem;">Gửi đánh giá</button>
                        </form>
                    </div>
                    <div id="rating-summary-container"></div>
                    <div id="reviews-list"></div>
                </div>
            </div>`;

            // Tối ưu SEO: Cập nhật Title và các thẻ Meta (Description, Open Graph)
            const seoTitle = p.seoTitle || `${p.name} | ${p.category} | Tiệm Nhà Gốm`;
            document.title = seoTitle;
            
            const seoDesc = p.seoDescription || (p.description 
                ? p.description.substring(0, 160).replace(/\s+/g, ' ').trim()
                : `Sản phẩm ${p.name} thủ công tinh xảo từ Tiệm Nhà Gốm. Khám phá ngay bộ sưu tập gốm sứ ${p.category} độc đáo.`);
            
            updateSEO(seoTitle, seoDesc, p.imageUrl);

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
                    "ratingValue": displayRating,
                    "bestRating": "5",
                    "worstRating": "1",
                    "ratingCount": p.reviewCount ? p.reviewCount.toString() : "1"
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
            where("category", "==", currentCategory),
            limit(11) // Lấy dư 1 để phòng trường hợp trùng sản phẩm hiện tại
        );
        const querySnapshot = await getDocs(q);
        
        let htmlContent = '';
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.id !== currentProductId && count < 10) { // Hiển thị tối đa 10 sản phẩm (2 hàng x 5 cột)
                // Truyền './index.html' làm linkBase vì chúng ta đang ở trong thư mục /product/
                htmlContent += renderProductCard(doc.data(), doc.id, [], './index.html');
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
        .slice(0, 10); // Lấy tối đa 10 sản phẩm để chia đều 2 hàng x 5 cột

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

// --- Logic Sửa/Xóa Đánh giá ---
window.deleteReview = async (reviewId, starRating) => {
    if (!confirm("Bạn có chắc chắn muốn xóa đánh giá này?")) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    try {
        showToast("Đang xóa đánh giá...", "info");
        
        // 1. Xóa document review
        await deleteDoc(doc(db, "reviews", reviewId));

        // 2. Cập nhật lại sản phẩm
        const productRef = doc(db, "products", productId);
        const productSnap = await getDoc(productRef);
        
        if (productSnap.exists()) {
            const p = productSnap.data();
            const oldCount = p.reviewCount || 1;
            const oldRating = (p.rating !== undefined && p.rating !== null) ? p.rating : 5;
            
            let newCount = oldCount - 1;
            let newRating = 5; // Mặc định về 5 nếu không còn đánh giá nào
            
            if (newCount > 0) {
                newRating = ((oldRating * oldCount) - starRating) / newCount;
            }

            await updateDoc(productRef, {
                rating: parseFloat(newRating.toFixed(1)),
                reviewCount: newCount
            });
        }

        showToast("Đã xóa đánh giá thành công");
        fetchReviews(productId);
    } catch (e) {
        console.error(e);
        showToast("Lỗi khi xóa đánh giá", "error");
    }
};

window.showEditReviewForm = (reviewId, currentComment, currentRating) => {
    const btnShow = document.getElementById('btn-show-review-form');
    const formContainer = document.getElementById('review-form-container');
    const commentInput = document.getElementById('review-comment');
    const form = document.getElementById('product-review-form');

    // Mở form và điền dữ liệu cũ
    formContainer.style.display = 'block';
    commentInput.value = currentComment;
    selectedRating = currentRating;
    
    // Cập nhật UI sao
    const starInput = document.getElementById('star-rating-input');
    starInput.querySelectorAll('span').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.val) <= selectedRating);
    });

    // Gắn cờ đang sửa vào form
    form.dataset.editMode = "true";
    form.dataset.editReviewId = reviewId;
    form.dataset.oldRating = currentRating;
    
    btnShow.innerText = "Đang chỉnh sửa đánh giá";
    window.scrollTo({ top: formContainer.offsetTop - 100, behavior: 'smooth' });
};

async function updateExistingReview(productId, reviewId, oldRating, newRating, comment) {
    try {
        // 1. Cập nhật document review
        await updateDoc(doc(db, "reviews", reviewId), {
            rating: newRating,
            comment: comment,
            updatedAt: serverTimestamp()
        });

        // 2. Tính toán lại rating trung bình cho sản phẩm
        if (oldRating !== newRating) {
            const productRef = doc(db, "products", productId);
            const productSnap = await getDoc(productRef);
            
            if (productSnap.exists()) {
                const p = productSnap.data();
                const count = p.reviewCount || 1;
                const currentAvg = (p.rating !== undefined && p.rating !== null) ? p.rating : 5;
                
                // Công thức: ((Trung bình cũ * Tổng số) - Sao cũ + Sao mới) / Tổng số
                const newAvg = ((currentAvg * count) - oldRating + newRating) / count;

                await updateDoc(productRef, {
                    rating: parseFloat(newAvg.toFixed(1))
                });
            }
        }

        showToast("Đã cập nhật đánh giá!");
        const form = document.getElementById('product-review-form');
        const btnShow = document.getElementById('btn-show-review-form');
        delete form.dataset.editMode;
        btnShow.innerText = "Viết đánh giá của bạn";
        form.reset();
        document.getElementById('review-form-container').style.display = 'none';
        fetchReviews(productId);
    } catch (e) { console.error(e); showToast("Lỗi cập nhật", "error"); }
}

// --- Logic Đánh giá & Bình luận ---
let selectedRating = 5;

async function fetchReviews(productId) {
    const list = document.getElementById('reviews-list');
    const summaryContainer = document.getElementById('rating-summary-container');
    const btnShow = document.getElementById('btn-show-review-form');
    if (!list || !summaryContainer) return; 

    try {
        const q = query(collection(db, "reviews"), where("productId", "==", productId), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        // Logic: Cập nhật trạng thái nút đánh giá (Viết mới hoặc Sửa cái cũ)
        if (btnShow) {
            const userReviewDoc = snap.docs.find(d => d.data().userId === auth.currentUser?.uid);
            if (userReviewDoc) {
                const r = userReviewDoc.data();
                btnShow.innerText = "Sửa đánh giá của bạn";
                btnShow.onclick = () => window.showEditReviewForm(userReviewDoc.id, r.comment, r.rating);
            } else {
                btnShow.innerText = "Viết đánh giá của bạn";
                btnShow.onclick = () => {
                    if (!auth.currentUser) {
                        showToast("Vui lòng đăng nhập để viết đánh giá", "error");
                        return;
                    }
                    const container = document.getElementById('review-form-container');
                    container.style.display = container.style.display === 'none' ? 'block' : 'none';
                    // Đảm bảo form reset về mode thêm mới nếu trước đó đang sửa
                    const form = document.getElementById('product-review-form');
                    if (form) delete form.dataset.editMode;
                };
            }
        }
        
        if (snap.empty) {
            summaryContainer.innerHTML = '';
            list.innerHTML = '<p style="color: #888; font-style: italic;">Chưa có đánh giá nào cho sản phẩm này.</p>';
            return;
        }

        // TÍNH TOÁN THỐNG KÊ
        const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let totalStars = 0;
        snap.docs.forEach(doc => {
            const r = doc.data();
            const star = Math.round((r.rating !== undefined) ? r.rating : 5);
            if (counts[star] !== undefined) counts[star]++;
            totalStars += star;
        });

        const totalReviews = snap.size;
        const avgRating = (totalStars / totalReviews).toFixed(1);

        // RENDER BIỂU ĐỒ TÓM TẮT
        let summaryHtml = `
            <div class="rating-summary fade-in-content">
                <div class="rating-avg-box">
                    <div class="avg-score">${avgRating}</div>
                    <div class="avg-stars" style="color: #f1c40f; font-size: 1.2rem;">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</div>
                    <div class="total-reviews-count">${totalReviews} nhận xét</div>
                </div>
                <div class="rating-bars">
                    ${[5, 4, 3, 2, 1].map(star => {
                        const count = counts[star];
                        const percent = ((count / totalReviews) * 100).toFixed(0);
                        return `
                            <div class="rating-bar-item">
                                <span class="star-label">${star} ★</span>
                                <div class="bar-bg"><div class="bar-fill" style="width: ${percent}%"></div></div>
                                <span class="percent-label">${percent}%</span>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
        summaryContainer.innerHTML = summaryHtml;

        list.innerHTML = snap.docs.map(reviewDoc => {
            const r = reviewDoc.data();
            const reviewId = reviewDoc.id;
            const date = r.createdAt ? new Date(r.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Mới đây';
            let stars = '';
            for(let i=1; i<=5; i++) stars += i <= (r.rating || 0) ? '★' : '☆';

            const imagesHtml = (r.images || []).map(url => `
                <img src="${url}" class="review-img" onclick="window.zoomReviewImg('${url}')" alt="Ảnh feedback">
            `).join('');

            const adminReplyHtml = r.adminReply ? `
                <div class="admin-reply">
                    <h6><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Phản hồi từ Tiệm Nhà Gốm</h6>
                    <p style="font-size: 0.95rem; color: #444; margin-bottom: 0.5rem;">${r.adminReply.comment}</p>
                    <small style="color: #999;">${r.adminReply.createdAt ? new Date(r.adminReply.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Mới đây'}</small>
                </div>
            ` : '';

            // Kiểm tra quyền sửa/xóa (User hiện tại hoặc Admin)
            const isOwner = auth.currentUser && r.userId === auth.currentUser.uid;
            const actionButtons = isOwner ? `
                <div class="review-actions" style="margin-top: 10px; display: flex; gap: 15px;">
                    <button class="btn-minimal" style="font-size: 0.75rem; padding: 2px 8px; border-color: #3498db; color: #3498db;" 
                        onclick="window.showEditReviewForm('${reviewId}', '${r.comment.replace(/'/g, "\\'")}', ${r.rating})">
                        Sửa đánh giá
                    </button>
                    <button class="btn-minimal" style="font-size: 0.75rem; padding: 2px 8px; border-color: #e74c3c; color: #e74c3c;" 
                        onclick="window.deleteReview('${reviewId}', ${r.rating})">
                        Xóa
                    </button>
                </div>
            ` : '';

            const replyBtnHtml = (isAdmin && !r.adminReply) ? `
                <div style="margin-top: 10px;">
                    <button class="btn-minimal" style="font-size: 0.7rem; padding: 4px 10px;" onclick="window.showAdminReplyForm('${reviewId}')">Trả lời khách hàng</button>
                    <div id="reply-form-${reviewId}" class="admin-reply-form" style="display: none; margin-top: 10px; flex-direction: column; gap: 10px; background: #fff; padding: 15px; border: 1px solid #eee; border-radius: 4px;">
                        <textarea id="reply-text-${reviewId}" placeholder="Nhập nội dung phản hồi..." style="width: 100%; height: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: none; font-family: inherit; font-size: 0.9rem;"></textarea>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-dark" style="padding: 0.5rem 1.2rem; font-size: 0.8rem; margin: 0;" onclick="window.submitAdminReply('${reviewId}')">Gửi phản hồi</button>
                            <button class="btn-outline" style="padding: 0.5rem 1.2rem; font-size: 0.8rem; margin: 0;" onclick="document.getElementById('reply-form-${reviewId}').style.display='none'">Hủy</button>
                        </div>
                    </div>
                </div>
            ` : '';

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
                        ${actionButtons}
                        ${adminReplyHtml}
                        ${replyBtnHtml}
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

    if (!btnShow || !formContainer || !starInput || !form) return;

    // Tạo UI chọn sao
    starInput.innerHTML = `
        <span data-val="0" class="star-zero" style="font-size: 0.75rem; color: #999; cursor: pointer; border: 1px solid #ddd; padding: 2px 8px; border-radius: 4px; margin-right: 12px; transition: 0.3s;">0 sao</span>
    ` + [1, 2, 3, 4, 5].map(i => `<span data-val="${i}" class="active">★</span>`).join('');

    starInput.querySelectorAll('span').forEach(star => {
        star.onclick = (e) => {
            selectedRating = parseInt(e.target.dataset.val);
            starInput.querySelectorAll('span').forEach(s => {
                if (s.dataset.val === "0") {
                    s.style.borderColor = selectedRating === 0 ? "var(--text-black)" : "#ddd";
                    s.style.color = selectedRating === 0 ? "var(--text-black)" : "#999";
                } else {
                    s.classList.toggle('active', parseInt(s.dataset.val) <= selectedRating);
                }
            });
        };
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const comment = document.getElementById('review-comment').value.trim();
        const imageFiles = document.getElementById('review-images').files;
        const submitBtn = form.querySelector('button[type="submit"]');

        if (!comment) return;

        // KIỂM TRA CHẾ ĐỘ SỬA
        if (form.dataset.editMode === "true") {
            const reviewId = form.dataset.editReviewId;
            const oldRating = parseInt(form.dataset.oldRating);
            await updateExistingReview(productId, reviewId, oldRating, selectedRating, comment);
            submitBtn.disabled = false;
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Đang gửi...';

            // Bảo mật logic: Kiểm tra lần cuối xem user đã có review chưa (Tránh spam click)
            if (auth.currentUser) {
                const qCheck = query(collection(db, "reviews"), 
                    where("productId", "==", productId), 
                    where("userId", "==", auth.currentUser.uid), 
                    limit(1));
                const snapCheck = await getDocs(qCheck);
                if (!snapCheck.empty) {
                    showToast("Bạn đã đánh giá sản phẩm này rồi. Vui lòng chọn 'Sửa' nếu muốn thay đổi.", "error");
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Gửi đánh giá";
                    return;
                }
            }

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

            // 3. Cập nhật Rating trung bình cho sản phẩm
            const productRef = doc(db, "products", productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
                const p = productSnap.data();
                const oldCount = p.reviewCount || 0;
                const oldRating = (p.rating !== undefined && p.rating !== null) ? p.rating : 5;
                const newCount = oldCount + 1;
                const newRating = ((oldRating * oldCount) + selectedRating) / newCount;

                await updateDoc(productRef, {
                    rating: parseFloat(newRating.toFixed(1)), // Làm tròn 1 chữ số thập phân
                    reviewCount: increment(1)
                });
            }

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

// --- Logic Phản hồi của Admin ---
window.showAdminReplyForm = (reviewId) => {
    const form = document.getElementById(`reply-form-${reviewId}`);
    if (form) form.style.display = 'flex';
};

window.submitAdminReply = async (reviewId) => {
    const text = document.getElementById(`reply-text-${reviewId}`).value.trim();
    if (!text) return;

    try {
        const reviewRef = doc(db, "reviews", reviewId);
        await updateDoc(reviewRef, {
            adminReply: {
                comment: text,
                createdAt: serverTimestamp()
            }
        });
        showToast("Đã gửi phản hồi thành công");
        const urlParams = new URLSearchParams(window.location.search);
        fetchReviews(urlParams.get('id'));
    } catch (e) {
        showToast("Lỗi khi gửi phản hồi: " + e.message, "error");
    }
};

// Hàm chia sẻ sản phẩm sử dụng Web Share API hoặc Fallback Copy Link
window.shareProduct = async () => {
    const shareData = {
        title: document.title,
        text: 'Mời bạn xem sản phẩm gốm sứ thủ công tinh xảo tại Tiệm Nhà Gốm!',
        url: window.location.href
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(window.location.href);
            showToast("Đã sao chép liên kết sản phẩm!");
        }
    } catch (err) {
        if (err.name !== 'AbortError') showToast("Lỗi chia sẻ: " + err.message, "error");
    }
};

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

// Hàm xem ảnh toàn màn hình
window.openFullScreen = (src) => {
    let overlay = document.getElementById('fullscreen-image-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fullscreen-image-overlay';
        overlay.className = 'fullscreen-overlay';
        overlay.innerHTML = `<img src="" alt="Toàn màn hình">`;
        overlay.onclick = () => overlay.style.display = 'none';
        document.body.appendChild(overlay);
    }
    
    const img = overlay.querySelector('img');
    img.src = src;
    overlay.style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', async (user) => {
        if (user) {
            try {
                const adminSnap = await getDoc(doc(db, "admins", user.uid));
                isAdmin = adminSnap.exists();
            } catch (e) { console.error("Lỗi kiểm tra quyền admin:", e); }
        }
        fetchProductDetail();
        
        // Lấy productId từ URL để khởi tạo Form
        const urlParams = new URLSearchParams(window.location.search);
        const pid = urlParams.get('id');
        if (pid) initReviewForm(pid);

        // Khởi tạo tìm kiếm thông minh bằng hàm dùng chung
        initAutocomplete('detail-search-input', 'detail-search-suggestions', '../');

        const searchInput = document.getElementById('detail-search-input');
        const navigateToSearch = () => {
            const val = searchInput.value.trim();
            if (val) window.location.href = `../products/?search=${encodeURIComponent(val)}`;
        };

        document.getElementById('detail-search-btn')?.addEventListener('click', navigateToSearch);
        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') navigateToSearch();
        });

        // Tự động ẩn/hiện thanh tìm kiếm thông minh (Smart Header pattern)
        let lastScrollY = window.scrollY;
        const searchContainer = document.querySelector('.product-detail-container .search-container-home');
        if (searchContainer) {
            window.addEventListener('scroll', () => {
                const currentScrollY = window.scrollY;
                // Thêm một ngưỡng nhỏ (ví dụ 10px) để tránh việc ẩn/hiện quá nhạy gây giật trên mobile
                const delta = 10;
                if (Math.abs(currentScrollY - lastScrollY) < delta) return;
                
                // 1. Ẩn khi cuộn xuống và đã vượt qua 400px
                if (currentScrollY > lastScrollY && currentScrollY > 400) {
                    searchContainer.classList.add('hidden-scroll');
                }
                // 2. Hiện lại khi cuộn ngược lên HOẶC khi đang ở gần đầu trang (dưới 100px)
                else if (currentScrollY < lastScrollY || currentScrollY < 100) {
                    searchContainer.classList.remove('hidden-scroll');
                }
                
                lastScrollY = currentScrollY;
            }, { passive: true });
        }
    });
});
