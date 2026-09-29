import {
    db, auth, storage, initHeader, showToast, updateCartCount, updateFavoriteCount,
    renderProductCard, renderProductCardWithVariants, addToCart, addToHistory, initAutocomplete, updateSEO, escapeHTML,
    fetchFlashSaleSettings, getProductCurrentPrice, getProductEffectiveSale, getProductFlashSaleInfo, COLOR_MAP, getColorHex,
    isUserInHCM, updateExpressDeliveryBadges, getExpressDeliveryStatus
} from "./utils.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, updateDoc, serverTimestamp, orderBy, limit, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { trackProductView, renderDecorMatchRecommendations } from "./ai-recommendations.js";

// Global state
let allImages = [];
let currentIndex = 0;
let autoSlideInterval = null;
let selectedColor = null;
let selectedPattern = null;
let selectedComboVariant = null;
let currentProductData = null;
let currentProductId = null;
let isAdmin = false;
let fsSettingsGlobal = null;

// Tab Switching Logic
function initTabs() {
    const nav = document.getElementById('v2-tabs-nav');
    if (!nav) return;
    const tabBtns = nav.querySelectorAll('.v2-tab-btn');
    const panes = document.querySelectorAll('.v2-tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(target);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    window.switchV2Tab = (tabId) => {
        const btn = document.querySelector(`.v2-tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.click();
        const section = document.getElementById('v2-middle-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
}

// Lightbox Logic
window.openV2Lightbox = (src) => {
    const modal = document.getElementById('v2-lightbox-modal');
    const img = document.getElementById('v2-lightbox-img');
    if (!modal || !img) return;
    img.src = src;
    modal.classList.add('active');
};

window.closeV2Lightbox = () => {
    const modal = document.getElementById('v2-lightbox-modal');
    if (modal) modal.classList.remove('active');
};

// Auto slide
function startAutoSlide() {
    if (autoSlideInterval) clearInterval(autoSlideInterval);
    if (allImages.length > 1) {
        autoSlideInterval = setInterval(() => {
            window.moveV2Image(1, false);
        }, 5000);
    }
}

// Gallery image switcher
window.changeV2MainImage = (src, index, isUserAction = true) => {
    const mainImg = document.getElementById('v2-main-img');
    if (!mainImg || (currentIndex === index && isUserAction)) return;

    if (isUserAction) startAutoSlide();
    currentIndex = index;

    mainImg.style.opacity = '0';
    setTimeout(() => {
        mainImg.src = src;
        mainImg.style.opacity = '1';
    }, 200);

    // Update counter
    const counter = document.getElementById('v2-img-counter');
    if (counter) counter.innerText = `${currentIndex + 1} / ${allImages.length}`;

    // Update active thumbnail
    const track = document.getElementById('v2-thumb-track');
    document.querySelectorAll('.v2-thumb-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
        if (i === index && track) {
            const scrollLeft = item.offsetLeft - track.offsetWidth / 2 + item.offsetWidth / 2;
            track.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    });

    // Update sticky thumbnail
    const stickyThumb = document.getElementById('v2-sticky-thumb');
    if (stickyThumb) stickyThumb.src = src;
};

window.scrollV2Thumbnails = (direction) => {
    const track = document.getElementById('v2-thumb-track');
    if (track) {
        track.scrollBy({ left: direction * 220, behavior: 'smooth' });
    }
};

window.moveV2Image = (dir, isUserAction = true) => {
    if (allImages.length <= 1) return;
    let nextIdx = currentIndex + dir;
    if (nextIdx < 0) nextIdx = allImages.length - 1;
    if (nextIdx >= allImages.length) nextIdx = 0;
    window.changeV2MainImage(allImages[nextIdx], nextIdx, isUserAction);
};

// Favorite toggle
window.toggleV2Favorite = async () => {
    const btn = document.getElementById('v2-btn-fav');
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

        if (favs.includes(currentProductId)) {
            favs = favs.filter(id => id !== currentProductId);
            showToast("Đã xóa khỏi danh sách yêu thích");
            if (btn) btn.classList.remove('active');
        } else {
            favs.push(currentProductId);
            showToast("Đã thêm vào danh sách yêu thích");
            if (btn) btn.classList.add('active');
        }
        await setDoc(favRef, { productIds: favs });
    } else {
        favs = JSON.parse(localStorage.getItem('favorites')) || [];
        if (favs.includes(currentProductId)) {
            favs = favs.filter(id => id !== currentProductId);
            showToast("Đã xóa khỏi danh sách yêu thích");
            if (btn) btn.classList.remove('active');
        } else {
            favs.push(currentProductId);
            showToast("Đã thêm vào danh sách yêu thích");
            if (btn) btn.classList.add('active');
        }
        localStorage.setItem('favorites', JSON.stringify(favs));
    }
    updateFavoriteCount();
};

// Share product
window.shareV2Product = async () => {
    const shareUrl = `https://tiemnhagom.vn/share?type=product&id=${currentProductId}`;
    const shareData = {
        title: document.title,
        text: 'Mời bạn xem sản phẩm gốm sứ thủ công tinh xảo tại Tiệm Nhà Gốm!',
        url: shareUrl
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast("Đã sao chép liên kết chia sẻ!");
        }
    } catch (err) {
        if (err.name !== 'AbortError') showToast("Lỗi chia sẻ: " + err.message, "error");
    }
};

// Render Combo items HTML table
window.renderComboItemsHTML = (items) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return '<p style="color: #666; font-size: 0.85rem;">Combo này chưa có danh sách chi tiết.</p>';
    }

    return `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
            ${items.map(it => `
                <div style="display: flex; gap: 12px; padding: 12px; background: #fafaf8; border-radius: 8px; border: 1px solid #ebe8e2; align-items: center;">
                    <img src="${it.imageUrl || it.image || '../Asset/icons/favicon.png'}" alt="${escapeHTML(it.name)}" style="width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #eee;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 0.88rem; color: #222; margin-bottom: 2px;">${escapeHTML(it.name)}</div>
                        <div style="font-size: 0.78rem; color: #666;">Số lượng: <strong>${it.quantity || 1}</strong></div>
                        ${it.selectedColor ? `<span style="font-size: 0.72rem; background: #eef2f5; padding: 2px 6px; border-radius: 4px; color: #475569; display: inline-block; margin-top: 4px;">Màu: ${escapeHTML(it.selectedColor)}</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
};

// Price and Variant calculations
function getEffectiveVariantPrice() {
    if (!currentProductData) return 0;
    let variantPriceValue = null;
    let variantSaleValue = null;

    if (selectedComboVariant && currentProductData.comboVariants) {
        const cv = currentProductData.comboVariants.find(v => (v.name || v) === selectedComboVariant);
        if (cv) {
            if (cv.price && Number(cv.price) > 0) variantPriceValue = Number(cv.price);
            if (cv.sale !== undefined && cv.sale !== null && cv.sale !== '') variantSaleValue = Number(cv.sale);
        }
    }
    if (selectedColor && currentProductData.colorVariants) {
        const c = currentProductData.colorVariants.find(v => v.name === selectedColor);
        if (c) {
            if (c.price && Number(c.price) > 0) variantPriceValue = Number(c.price);
            if (c.sale !== undefined && c.sale !== null && c.sale !== '') variantSaleValue = Number(c.sale);
        }
    }
    if (selectedPattern && currentProductData.patternVariants) {
        const pat = currentProductData.patternVariants.find(v => v.name === selectedPattern);
        if (pat) {
            if (pat.price && Number(pat.price) > 0) variantPriceValue = Number(pat.price);
            if (pat.sale !== undefined && pat.sale !== null && pat.sale !== '') variantSaleValue = Number(pat.sale);
        }
    }

    const mockProduct = { ...currentProductData };
    const basePrice = (variantPriceValue !== null && variantPriceValue > 0) ? variantPriceValue : currentProductData.price;
    let effSale = 0;
    if (variantSaleValue !== null) {
        effSale = Math.max(0, Math.min(100, variantSaleValue));
    } else {
        effSale = currentProductData.sale || (currentProductData.salePrice ? Math.round((1 - currentProductData.salePrice / currentProductData.price) * 100) : 0);
    }

    mockProduct.price = basePrice;
    mockProduct.sale = effSale;
    if (effSale > 0) {
        if (currentProductData.salePrice && Number(currentProductData.salePrice) > 0 && variantPriceValue === null && variantSaleValue === null) {
            mockProduct.salePrice = Number(currentProductData.salePrice);
        } else {
            mockProduct.salePrice = Math.round(basePrice * (1 - effSale / 100));
        }
    } else {
        mockProduct.salePrice = null;
    }

    return {
        basePrice,
        salePercent: effSale,
        currentPrice: getProductCurrentPrice(mockProduct, fsSettingsGlobal)
    };
}

function updatePriceDisplay() {
    const { basePrice, salePercent, currentPrice } = getEffectiveVariantPrice();
    const mainPriceEl = document.getElementById('v2-main-price');
    const oldPriceEl = document.getElementById('v2-old-price');
    const salePillEl = document.getElementById('v2-sale-pill');
    const stickyPriceEl = document.getElementById('v2-sticky-price');

    if (mainPriceEl) mainPriceEl.innerText = new Intl.NumberFormat('vi-VN').format(currentPrice) + ' VND';
    if (stickyPriceEl) stickyPriceEl.innerText = new Intl.NumberFormat('vi-VN').format(currentPrice) + ' VND';

    if (salePercent > 0) {
        if (oldPriceEl) {
            oldPriceEl.style.display = 'inline';
            oldPriceEl.innerText = new Intl.NumberFormat('vi-VN').format(basePrice) + ' VND';
        }
        if (salePillEl) {
            salePillEl.style.display = 'inline';
            salePillEl.innerText = `-${salePercent}%`;
        }
    } else {
        if (oldPriceEl) oldPriceEl.style.display = 'none';
        if (salePillEl) salePillEl.style.display = 'none';
    }

    // Dynamic membership price badge
    const memberBadge = document.getElementById('v2-member-price-badge');
    if (memberBadge) {
        try {
            const tierStr = sessionStorage.getItem('tng_current_tier');
            if (tierStr) {
                const tier = JSON.parse(tierStr);
                if (tier && tier.discount > 0) {
                    const memPrice = Math.round(currentPrice * (1 - tier.discount / 100));
                    memberBadge.innerHTML = `
                        <div class="tier-label" style="color: ${tier.color};">
                            ⭐ Giá dành riêng cho ${tier.name}
                        </div>
                        <div class="tier-price">${new Intl.NumberFormat('vi-VN').format(memPrice)}đ</div>
                    `;
                    memberBadge.style.display = 'flex';
                } else {
                    memberBadge.style.display = 'none';
                }
            } else {
                memberBadge.style.display = 'none';
            }
        } catch (e) {
            memberBadge.style.display = 'none';
        }
    }
}

// Select Variant functions
window.selectV2Color = (name, imgUrl) => {
    selectedColor = name;
    const label = document.getElementById('v2-selected-color-label');
    if (label) label.innerText = name;

    document.querySelectorAll('.v2-color-item').forEach(el => {
        el.classList.toggle('active', el.dataset.colorName === name);
    });

    if (imgUrl) {
        const foundIdx = allImages.indexOf(imgUrl);
        if (foundIdx !== -1) window.changeV2MainImage(imgUrl, foundIdx, true);
    }
    updatePriceDisplay();
    updateStockDisplay();
};

window.selectV2Pattern = (name, imgUrl) => {
    selectedPattern = name;
    const label = document.getElementById('v2-selected-pattern-label');
    if (label) label.innerText = name;

    document.querySelectorAll('.v2-pattern-chip').forEach(el => {
        el.classList.toggle('active', el.dataset.patternName === name);
    });

    if (imgUrl) {
        const foundIdx = allImages.indexOf(imgUrl);
        if (foundIdx !== -1) window.changeV2MainImage(imgUrl, foundIdx, true);
    }
    updatePriceDisplay();
    updateStockDisplay();
};

window.selectV2Combo = (idx) => {
    if (!currentProductData || !currentProductData.comboVariants || !currentProductData.comboVariants[idx]) return;
    const cv = currentProductData.comboVariants[idx];
    selectedComboVariant = cv.name || `Phân loại ${idx + 1}`;

    const label = document.getElementById('v2-selected-combo-label');
    if (label) label.innerText = selectedComboVariant;

    document.querySelectorAll('.v2-combo-card').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });

    if (cv.imageUrl) {
        const foundIdx = allImages.indexOf(cv.imageUrl);
        if (foundIdx !== -1) window.changeV2MainImage(cv.imageUrl, foundIdx, true);
    }

    // Update combo items in Tab 1
    const comboTabContent = document.getElementById('v2-tab-combo-content');
    if (comboTabContent && cv.items) {
        comboTabContent.innerHTML = `
            <h4 style="font-family: var(--v2-font-serif); font-size: 1.2rem; color: #222; margin-bottom: 12px;">Sản phẩm trong ${escapeHTML(selectedComboVariant)}:</h4>
            ${window.renderComboItemsHTML(cv.items)}
        `;
        comboTabContent.style.display = 'block';
    }

    updatePriceDisplay();
    updateStockDisplay();
};

function updateStockDisplay() {
    let stock = currentProductData?.stock || 0;
    let isOut = stock <= 0;

    if (selectedComboVariant && currentProductData.comboVariants) {
        const cv = currentProductData.comboVariants.find(v => (v.name || v) === selectedComboVariant);
        if (cv) {
            stock = cv.stock !== undefined ? cv.stock : stock;
            isOut = cv.isOutOfStock || stock <= 0;
        }
    } else if (selectedColor && currentProductData.colorVariants) {
        const c = currentProductData.colorVariants.find(v => v.name === selectedColor);
        if (c) {
            stock = c.stock !== undefined ? c.stock : stock;
            isOut = c.isOutOfStock || stock <= 0;
        }
    } else if (selectedPattern && currentProductData.patternVariants) {
        const p = currentProductData.patternVariants.find(v => v.name === selectedPattern);
        if (p) {
            stock = p.stock !== undefined ? p.stock : stock;
            isOut = p.isOutOfStock || stock <= 0;
        }
    }

    const stockEl = document.getElementById('v2-stock-status');
    const addCartBtn = document.getElementById('v2-btn-add-cart');
    const buyNowBtn = document.getElementById('v2-btn-buy-now');
    const stickyCartBtn = document.getElementById('v2-sticky-add-cart');
    const stickyBuyBtn = document.getElementById('v2-sticky-buy-now');
    const restockBtn = document.getElementById('v2-btn-restock');

    if (stockEl) {
        stockEl.className = `v2-stock-status ${isOut ? 'out' : ''}`;
        stockEl.innerHTML = `<span class="v2-stock-dot"></span> <span>${isOut ? 'Rất tiếc, phân loại này đã hết hàng' : `Còn lại: ${stock} sản phẩm`}</span>`;
    }

    [addCartBtn, stickyCartBtn].forEach(btn => {
        if (btn) {
            btn.disabled = isOut;
            btn.innerHTML = isOut ? 'Hết hàng' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Thêm vào giỏ';
        }
    });

    [buyNowBtn, stickyBuyBtn].forEach(btn => {
        if (btn) {
            btn.disabled = isOut;
            btn.innerText = isOut ? 'Hết hàng' : 'Mua ngay';
        }
    });

    if (restockBtn) {
        restockBtn.style.display = isOut ? 'flex' : 'none';
    }
}

// Sticky bottom bar trigger on scroll
function initStickyBar() {
    const heroSection = document.getElementById('product-detail-content');
    const stickyBar = document.getElementById('v2-sticky-bar');
    if (!heroSection || !stickyBar) return;

    window.addEventListener('scroll', () => {
        const heroBottom = heroSection.getBoundingClientRect().bottom;
        if (heroBottom < 100) {
            stickyBar.classList.add('visible');
        } else {
            stickyBar.classList.remove('visible');
        }
    });
}

// Core Product Fetching & Rendering
async function fetchProductDetailV2() {
    const urlParams = new URLSearchParams(window.location.search);
    let productId = urlParams.get('id');
    const container = document.getElementById('product-detail-content');

    try {
        // Nếu không có ID trong URL, tự động tải sản phẩm đầu tiên từ danh sách sản phẩm để test
        if (!productId) {
            const firstSnap = await getDocs(query(collection(db, "products"), limit(1)));
            if (!firstSnap.empty) {
                productId = firstSnap.docs[0].id;
                showToast("Đang mở xem thử nghiệm sản phẩm mẫu đầu tiên!", "info");
            } else {
                container.innerHTML = "<p style='text-align: center; padding: 4rem;'>Không tìm thấy sản phẩm nào trong hệ thống.</p>";
                return;
            }
        }

        currentProductId = productId;

        const [docSnap, fsSettings, snapCoupons] = await Promise.all([
            getDoc(doc(db, "products", productId)),
            fetchFlashSaleSettings(),
            getDocs(query(collection(db, "coupons"), orderBy("createdAt", "desc")))
        ]);

        fsSettingsGlobal = fsSettings;

        if (!docSnap.exists()) {
            container.innerHTML = "<p style='text-align: center; padding: 4rem;'>Sản phẩm không tồn tại hoặc đã bị xóa.</p>";
            return;
        }

        const p = docSnap.data();
        currentProductData = p;

        // Collect all images
        const additionalImages = p.additionalImages || [];
        allImages = [p.imageUrl, ...additionalImages].filter(Boolean);
        if (p.colorVariants) p.colorVariants.forEach(v => { if (v?.imageUrl && !allImages.includes(v.imageUrl)) allImages.push(v.imageUrl); });
        if (p.patternVariants) p.patternVariants.forEach(v => { if (v?.imageUrl && !allImages.includes(v.imageUrl)) allImages.push(v.imageUrl); });
        if (p.comboVariants) p.comboVariants.forEach(v => { if (v?.imageUrl && !allImages.includes(v.imageUrl)) allImages.push(v.imageUrl); });

        // Save view history & track AI
        addToHistory(productId, p.category);
        trackProductView(p);
        updateDoc(doc(db, "products", productId), { views: increment(1) }).catch(() => {});

        // Defaults for variants
        if (p.colorVariants?.length > 0) selectedColor = p.colorVariants[0].name;
        if (p.patternVariants?.length > 0) selectedPattern = p.patternVariants[0].name;
        if (p.comboVariants?.length > 0) selectedComboVariant = p.comboVariants[0].name;

        // SEO and Title
        document.title = `${p.name} | Tiệm Nhà Gốm`;
        updateSEO(`${p.name} | Tiệm Nhà Gốm`, p.description?.substring(0, 160) || '', p.imageUrl);

        // Update Breadcrumb
        const breadcrumb = document.getElementById('breadcrumb-container');
        if (breadcrumb) {
            const categoryHtml = p.category ? `
                <a href="../products/?category=${encodeURIComponent(p.category)}">${escapeHTML(p.category)}</a>
                <span class="separator">&rsaquo;</span>
            ` : '';
            breadcrumb.innerHTML = `
                <a href="../">Trang chủ</a>
                <span class="separator">&rsaquo;</span>
                <a href="../products/">Sản phẩm</a>
                <span class="separator">&rsaquo;</span>
                ${categoryHtml}
                <span class="current">${escapeHTML(p.name)}</span>
            `;
        }

        // Check if favorite
        let isFav = false;
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) isFav = (favSnap.data().productIds || []).includes(productId);
        } else {
            const favs = JSON.parse(localStorage.getItem('favorites')) || [];
            isFav = favs.includes(productId);
        }

        // Badges
        const isOutOfStock = (p.stock || 0) <= 0;
        const createdAtMs = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
        const isNewArrival = !isOutOfStock && !isNaN(createdAtMs) && ((Date.now() - createdAtMs) <= 1209600000);
        const isBestSeller = !isOutOfStock && ((Number(p.sold) || 0) >= 5 || Boolean(p.isBestSeller));
        const deliveryInfo = getExpressDeliveryStatus();

        // 1. RENDER MAIN HERO GRID
        container.innerHTML = `
            <!-- Left: High-End Gallery & Guarantee Strip -->
            <div class="v2-gallery-column">
                <div class="v2-gallery-wrap">
                    <div class="v2-main-image-box">
                        ${allImages.length > 1 ? `
                            <button type="button" class="v2-gallery-nav prev" onclick="window.moveV2Image(-1)" aria-label="Ảnh trước">&#10094;</button>
                            <button type="button" class="v2-gallery-nav next" onclick="window.moveV2Image(1)" aria-label="Ảnh sau">&#10095;</button>
                        ` : ''}
                        
                        <div class="v2-badge-pills">
                            ${isNewArrival ? '<span class="v2-pill-badge new">✨ Mới về</span>' : ''}
                            ${isBestSeller ? '<span class="v2-pill-badge hot">🔥 Bán chạy</span>' : ''}
                            ${p.sale ? `<span class="v2-pill-badge sale">-${p.sale}%</span>` : ''}
                        </div>

                        <img id="v2-main-img" class="v2-main-img" src="${p.imageUrl}" alt="${escapeHTML(p.name)}" onclick="window.openV2Lightbox(this.src)" title="Nhấn để phóng to ảnh">
                        
                        ${allImages.length > 1 ? `
                            <div id="v2-img-counter" class="v2-img-counter">1 / ${allImages.length}</div>
                        ` : ''}
                    </div>

                    ${allImages.length > 1 ? `
                        <div class="v2-thumbnail-carousel-wrap">
                            <button type="button" class="v2-thumb-arrow-btn prev" onclick="window.scrollV2Thumbnails(-1)" aria-label="Cuộn trái">&#10094;</button>
                            <div class="v2-thumb-track" id="v2-thumb-track">
                                ${allImages.map((img, idx) => `
                                    <div class="v2-thumb-item ${idx === 0 ? 'active' : ''}" onclick="window.changeV2MainImage('${img}', ${idx})">
                                        <img src="${img}" alt="${escapeHTML(p.name)} - thumb ${idx + 1}" loading="lazy">
                                    </div>
                                `).join('')}
                            </div>
                            <button type="button" class="v2-thumb-arrow-btn next" onclick="window.scrollV2Thumbnails(1)" aria-label="Cuộn phải">&#10095;</button>
                        </div>
                    ` : ''}
                </div>

                <!-- Guarantee & Safe Delivery Strip (Balanced with left side) -->
                <div class="v2-guarantee-card">
                    <div class="v2-guarantee-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        Cam kết an tâm khi nhận hàng tại Tiệm Nhà Gốm
                    </div>
                    <div class="v2-guarantee-grid">
                        <div class="v2-guarantee-item">
                            <span style="font-size: 1.2rem;">📦</span>
                            <div>
                                <strong>Đóng gói 5 lớp chuẩn gốm</strong>
                                <span>Bọt khí chống sốc & mút định hình đa tầng</span>
                            </div>
                        </div>
                        <div class="v2-guarantee-item">
                            <span style="font-size: 1.2rem;">🛡️</span>
                            <div>
                                <strong>Bảo hiểm bể vỡ 100%</strong>
                                <span>Đổi mới lập tức nếu nứt vỡ trong vận chuyển</span>
                            </div>
                        </div>
                        <div class="v2-guarantee-item">
                            <span style="font-size: 1.2rem;">🔍</span>
                            <div>
                                <strong>Đồng kiểm khi nhận</strong>
                                <span>Mở kiểm tra hàng ưng ý mới thanh toán</span>
                            </div>
                        </div>
                        <div class="v2-guarantee-item">
                            <span style="font-size: 1.2rem;">⚡</span>
                            <div>
                                <strong>Giao nhanh hỏa tốc 2H</strong>
                                <span>Áp dụng nội thành TP. Hồ Chí Minh</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Purchasing Panel & Product Info -->
            <div class="v2-info-panel">
                <div class="v2-header-meta">
                    <span class="v2-category-tag">${escapeHTML(p.category || 'Gốm Sứ')}</span>
                    <span class="v2-sku-text">Mã: <strong>${productId}</strong></span>
                </div>

                <h1 class="v2-product-title">${escapeHTML(p.name)}</h1>

                <div class="v2-rating-sold-row">
                    <div class="v2-stars" title="Đánh giá 5 sao">★★★★★</div>
                    <span>(5.0)</span>
                    <span>&bull;</span>
                    <span>Đã bán <strong>${p.sold || 0}</strong> sản phẩm</span>
                </div>

                <!-- Price Box -->
                <div class="v2-price-container">
                    <span id="v2-main-price" class="v2-main-price">0 VND</span>
                    <span id="v2-old-price" class="v2-old-price" style="display: none;">0 VND</span>
                    <span id="v2-sale-pill" class="v2-sale-pill" style="display: none;">-0%</span>
                </div>

                <!-- Member VIP Price Badge -->
                <div id="v2-member-price-badge" class="v2-member-price-badge" style="display: none;"></div>

                <!-- Color Variants Selector -->
                ${p.colorVariants?.length > 0 ? `
                    <div class="v2-variants-group">
                        <div class="v2-variant-title">
                            Chọn màu sắc: <span id="v2-selected-color-label">${escapeHTML(p.colorVariants[0].name)}</span>
                        </div>
                        <div class="v2-color-swatches">
                            ${p.colorVariants.map((v, i) => {
                                const hex = v.hex || (COLOR_MAP[v.name] || '#ccc');
                                return `
                                    <div class="v2-color-item ${i === 0 ? 'active' : ''}" data-color-name="${escapeHTML(v.name)}" onclick="window.selectV2Color('${escapeHTML(v.name)}', '${v.imageUrl || ''}')">
                                        <span class="v2-color-dot" style="background-color: ${hex};"></span>
                                        <span>${escapeHTML(v.name)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Pattern Variants Selector -->
                ${p.patternVariants?.length > 0 ? `
                    <div class="v2-variants-group">
                        <div class="v2-variant-title">
                            Chọn họa tiết: <span id="v2-selected-pattern-label">${escapeHTML(p.patternVariants[0].name)}</span>
                        </div>
                        <div class="v2-pattern-chips">
                            ${p.patternVariants.map((v, i) => `
                                <div class="v2-pattern-chip ${i === 0 ? 'active' : ''}" data-pattern-name="${escapeHTML(v.name)}" onclick="window.selectV2Pattern('${escapeHTML(v.name)}', '${v.imageUrl || ''}')">
                                    ${escapeHTML(v.name)}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Combo Variants Selector -->
                ${p.isCombo && p.comboVariants?.length > 1 ? `
                    <div class="v2-variants-group">
                        <div class="v2-variant-title">
                            Phân loại Combo: <span id="v2-selected-combo-label">${escapeHTML(p.comboVariants[0].name || 'Combo 1')}</span>
                        </div>
                        <div class="v2-combo-cards">
                            ${p.comboVariants.map((v, i) => `
                                <div class="v2-combo-card ${i === 0 ? 'active' : ''}" onclick="window.selectV2Combo(${i})">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${v.imageUrl ? `<img src="${v.imageUrl}" style="width: 28px; height: 28px; border-radius: 4px; object-fit: cover;">` : ''}
                                        <span style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(v.name || `Combo ${i + 1}`)}</span>
                                    </div>
                                    <span style="font-size: 0.82rem; color: #000000; font-weight: 700;">${v.price ? new Intl.NumberFormat('vi-VN').format(v.price) + 'đ' : ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Stock Status -->
                <div id="v2-stock-status" class="v2-stock-status">
                    <span class="v2-stock-dot"></span>
                    <span>Đang kiểm tra kho...</span>
                </div>

                <!-- Quantity Stepper & Buttons Grid -->
                <div class="v2-actions-wrap">
                    <div class="v2-qty-row">
                        <span style="font-size: 0.88rem; font-weight: 600; color: #444;">Số lượng:</span>
                        <div class="v2-stepper">
                            <button type="button" class="v2-stepper-btn" onclick="const input = document.getElementById('v2-qty-input'); if(parseInt(input.value) > 1) input.stepDown();">&minus;</button>
                            <input type="number" id="v2-qty-input" class="v2-stepper-input" value="1" min="1" max="99" readonly>
                            <button type="button" class="v2-stepper-btn" onclick="document.getElementById('v2-qty-input').stepUp();">&plus;</button>
                        </div>
                    </div>

                    <div class="v2-buttons-grid">
                        <button type="button" id="v2-btn-buy-now" class="v2-btn-buy-now">
                            Mua ngay
                        </button>
                        <button type="button" id="v2-btn-add-cart" class="v2-btn-add-cart">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            Giỏ hàng
                        </button>
                        <button type="button" id="v2-btn-fav" class="v2-icon-btn ${isFav ? 'active' : ''}" onclick="window.toggleV2Favorite()" title="Lưu yêu thích">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.82-8.82 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                        <button type="button" class="v2-icon-btn" onclick="window.shareV2Product()" title="Chia sẻ">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                        </button>
                    </div>

                    <!-- Restock button -->
                    <button type="button" id="v2-btn-restock" class="btn-notify-restock" onclick="window.openRestockModal()" style="display: none; width: 100%; margin-top: 4px; padding: 10px; background: #fffbeb; border: 1px dashed #d97706; color: #b45309; border-radius: 8px; font-weight: 600; font-size: 0.88rem; align-items: center; justify-content: center; gap: 6px; cursor: pointer;">
                        🔔 Nhận thông báo khi có hàng lại
                    </button>
                </div>

                <!-- Sleek Coupon Pill Trigger -->
                <div class="v2-coupon-pill-trigger" onclick="document.getElementById('v2-coupons-modal').classList.add('active')">
                    <span style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #333;">
                        🏷️ Ưu đãi & Voucher khả dụng
                    </span>
                    <span style="color: #000000; font-weight: 600;">Xem mã &rsaquo;</span>
                </div>
            </div>
        `;

        // 2. RENDER STRUCTURED TABS (Mô tả, Thông số & An toàn, Bảo quản, Đánh giá)
        // Tab 1: Description
        const descContentEl = document.getElementById('v2-tab-desc-content');
        if (descContentEl) {
            descContentEl.innerHTML = p.description ? p.description : '<p>Sản phẩm gốm sứ thủ công nghệ thuật được tạo tác tỉ mỉ bởi nghệ nhân Tiệm Nhà Gốm.</p>';
        }

        if (p.isCombo && p.comboVariants?.[0]?.items) {
            const comboContentEl = document.getElementById('v2-tab-combo-content');
            if (comboContentEl) {
                comboContentEl.innerHTML = `
                    <h4 style="font-family: var(--v2-font-serif); font-size: 1.2rem; color: #222; margin-bottom: 12px;">Sản phẩm trong combo:</h4>
                    ${window.renderComboItemsHTML(p.comboVariants[0].items)}
                `;
                comboContentEl.style.display = 'block';
            }
        }

        // Tab 2: Specs & Safety Box (Image 2 specs box + Image 1 tooltips!)
        const specsContentEl = document.getElementById('v2-tab-specs-content');
        if (specsContentEl) {
            const dimParts = [];
            if (p.dimensions?.length) dimParts.push(`Dài ${p.dimensions.length}cm`);
            if (p.dimensions?.width) dimParts.push(`Rộng ${p.dimensions.width}cm`);
            if (p.dimensions?.height) dimParts.push(`Cao ${p.dimensions.height}cm`);

            specsContentEl.innerHTML = `
                <div class="product-specs-box" style="margin: 0; max-width: 650px;">
                    <div class="product-specs-title">THÔNG SỐ SẢN PHẨM</div>
                    <div class="product-specs-divider"></div>

                    <div class="product-specs-details">
                        <div class="product-specs-row">Chất liệu: <span>${p.details?.material || 'Gốm'}</span></div>
                        ${p.details?.origin ? `<div class="product-specs-row">Xuất xứ: <span>${p.details.origin}</span></div>` : ''}
                        ${dimParts.length > 0 ? `<div class="product-specs-row">Kích thước: <span>${dimParts.join(' &times; ')}</span></div>` : ''}
                        ${p.specs?.weight ? `<div class="product-specs-row">Trọng lượng: <span>${p.specs.weight} g</span></div>` : ''}
                        ${p.specs?.capacity ? `<div class="product-specs-row">Dung tích: <span>${p.specs.capacity} ml</span></div>` : ''}
                    </div>

                    ${(p.usage?.isDishwasherSafe !== false || p.usage?.isMicrowaveSafe !== false || p.usage?.isFoodSafe !== false) ? `
                        <div class="product-safety-icons-wrap">
                            ${p.usage?.isDishwasherSafe !== false ? `
                                <div class="safety-icon-tooltip-wrap">
                                    <img src="../Asset/icons/dishwashersafe.webp" alt="Dishwasher safe" class="safety-icon-img">
                                    <div class="safety-icon-tooltip">Dishwasher safe | An toàn cho máy rửa chén</div>
                                </div>
                            ` : ''}
                            ${p.usage?.isMicrowaveSafe !== false ? `
                                <div class="safety-icon-tooltip-wrap">
                                    <img src="../Asset/icons/microwavesafe.webp" alt="Microwave safe" class="safety-icon-img">
                                    <div class="safety-icon-tooltip">Microwave safe | An toàn cho lò vi sóng</div>
                                </div>
                            ` : ''}
                            ${p.usage?.isFoodSafe !== false ? `
                                <div class="safety-icon-tooltip-wrap">
                                    <img src="../Asset/icons/foodsafe.webp" alt="Food safe" class="safety-icon-img">
                                    <div class="safety-icon-tooltip">Food safe | An toàn thực phẩm</div>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Tab 4: Reviews
        const reviewsContainer = document.getElementById('v2-reviews-container');
        if (reviewsContainer) {
            reviewsContainer.innerHTML = `
                <div style="max-width: 800px;">
                    <div style="display: flex; align-items: center; gap: 24px; padding: 24px; background: #fdfaf6; border-radius: 12px; border: 1px solid #ebe8e2; margin-bottom: 24px;">
                        <div style="text-align: center; border-right: 1px solid #ddd; padding-right: 24px;">
                            <div style="font-size: 3rem; font-weight: 700; color: #000000; line-height: 1;">5.0</div>
                            <div style="color: #f59e0b; font-size: 1.2rem; margin: 4px 0;">★★★★★</div>
                            <div style="font-size: 0.8rem; color: #888;">Điểm đánh giá trung bình</div>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 1.1rem; color: #222; margin-bottom: 4px;">Khách hàng yêu thích sản phẩm này!</div>
                            <p style="font-size: 0.85rem; color: #666; margin: 0;">100% người mua hài lòng về chất lượng gốm, độ dày dặn và quy cách đóng gói an toàn của Tiệm.</p>
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; color: #888; font-size: 0.88rem;">
                        Chưa có nhận xét bằng văn bản nào. Hãy là người đầu tiên sở hữu và chia sẻ trải nghiệm nhé!
                    </div>
                </div>
            `;
        }

        // 3. RENDER COUPONS IN MODAL
        const couponsListEl = document.getElementById('v2-coupons-list');
        if (couponsListEl && snapCoupons) {
            let couponsHtml = '';
            snapCoupons.forEach(docSnap => {
                const c = docSnap.data();
                if (c.expiryDate && new Date(c.expiryDate) < new Date()) return;
                const valueStr = c.type === 'percent' ? `${c.value}%` : `${new Intl.NumberFormat('vi-VN').format(c.value)}đ`;
                couponsHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #fafafa; padding: 12px; border-radius: 8px; border: 1px solid #eee;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <code style="font-weight: 700; color: #c0392b; background: #fff; padding: 2px 6px; border: 1px dashed #c0392b; border-radius: 4px;">${docSnap.id}</code>
                                <span style="font-weight: 600; font-size: 0.85rem;">Giảm ${valueStr}</span>
                            </div>
                            <div style="font-size: 0.75rem; color: #666; margin-top: 4px;">Đơn tối thiểu ${new Intl.NumberFormat('vi-VN').format(c.minOrder || 0)}đ</div>
                        </div>
                        <button type="button" class="btn-minimal" style="padding: 4px 10px; font-size: 0.78rem; cursor: pointer; border-radius: 4px; border: 1px solid #333;" onclick="navigator.clipboard.writeText('${docSnap.id}'); showToast('Đã sao chép mã ${docSnap.id}!');">Sao chép</button>
                    </div>
                `;
            });
            couponsListEl.innerHTML = couponsHtml || '<p style="color: #666; text-align: center;">Hiện không có mã giảm giá công khai nào.</p>';
        }

        // 4. SYNC STICKY BOTTOM BAR DATA
        const stickyName = document.getElementById('v2-sticky-name');
        const stickyThumb = document.getElementById('v2-sticky-thumb');
        if (stickyName) stickyName.innerText = p.name;
        if (stickyThumb) stickyThumb.src = p.imageUrl;

        // 5. ATTACH BUY & CART EVENTS
        const handleAddCart = async (redirect = false) => {
            if (!auth.currentUser) {
                showToast("Bạn cần đăng nhập để mua sản phẩm!", "error");
                setTimeout(() => window.location.href = '../login/', 800);
                return;
            }

            const qty = parseInt(document.getElementById('v2-qty-input')?.value || 1);
            const { currentPrice } = getEffectiveVariantPrice();
            const mainImg = document.getElementById('v2-main-img');

            await addToCart({
                id: currentProductId,
                name: p.name,
                price: currentPrice,
                image: mainImg?.src || p.imageUrl,
                quantity: qty,
                color: selectedColor || null,
                pattern: selectedPattern || null,
                comboVariant: selectedComboVariant || null,
                variant: [selectedComboVariant, selectedColor, selectedPattern].filter(Boolean).join(' / ') || null,
                category: p.category
            });

            if (redirect) {
                window.location.href = '../cart/';
            }
        };

        const addCartBtn = document.getElementById('v2-btn-add-cart');
        const buyNowBtn = document.getElementById('v2-btn-buy-now');
        const stickyCartBtn = document.getElementById('v2-sticky-add-cart');
        const stickyBuyBtn = document.getElementById('v2-sticky-buy-now');

        if (addCartBtn) addCartBtn.onclick = () => handleAddCart(false);
        if (stickyCartBtn) stickyCartBtn.onclick = () => handleAddCart(false);
        if (buyNowBtn) buyNowBtn.onclick = () => handleAddCart(true);
        if (stickyBuyBtn) stickyBuyBtn.onclick = () => handleAddCart(true);

        // Update initial price & stock displays
        updatePriceDisplay();
        updateStockDisplay();

        // 6. FETCH RELATED & RECENTLY VIEWED PRODUCTS
        fetchRelatedProductsV2(productId, p.category);
        fetchRecentlyViewedV2(productId);
        renderDecorMatchRecommendations(p, 'ai-decor-match-container');

    } catch (err) {
        console.error("Lỗi khi tải chi tiết sản phẩm V2:", err);
        container.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 4rem;">Đã có lỗi xảy ra: ${err.message}</p>`;
    }
}

// Fetch related products
async function fetchRelatedProductsV2(currentId, category) {
    const sec = document.getElementById('related-products-section');
    const grid = document.getElementById('related-product-grid');
    if (!sec || !grid) return;

    try {
        const q = query(collection(db, "products"), where("category", "==", category), limit(9));
        const snap = await getDocs(q);
        let html = '';
        let count = 0;
        snap.forEach(d => {
            if (d.id !== currentId && count < 8 && !d.data().isHidden && !d.data().isOnlyEvent) {
                // Point to detail-test.html for seamless test navigation!
                html += renderProductCardWithVariants(d.data(), d.id, [], '/product/detail-test.html');
                count++;
            }
        });

        if (html) {
            grid.innerHTML = html;
            sec.style.display = 'block';
        }
    } catch (e) {
        console.warn("Lỗi tải sản phẩm liên quan:", e);
    }
}

// Fetch recently viewed
async function fetchRecentlyViewedV2(currentId) {
    const sec = document.getElementById('recently-viewed-section');
    const grid = document.getElementById('recently-viewed-grid');
    if (!sec || !grid) return;

    const history = JSON.parse(localStorage.getItem('viewed_products')) || [];
    const ids = history.map(it => typeof it === 'string' ? it : it.id).filter(id => id !== currentId).slice(0, 4);

    if (ids.length === 0) return;

    try {
        let html = '';
        for (const id of ids) {
            const snap = await getDoc(doc(db, "products", id));
            if (snap.exists() && !snap.data().isHidden) {
                html += renderProductCardWithVariants(snap.data(), id, [], '/product/detail-test.html');
            }
        }
        if (html) {
            grid.innerHTML = html;
            sec.style.display = 'block';
        }
    } catch (e) {
        console.warn("Lỗi tải lịch sử xem:", e);
    }
}

// Restock alert modal
window.openRestockModal = () => {
    let modal = document.getElementById('restock-alert-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'restock-alert-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const selectedVariantName = [selectedComboVariant, selectedColor, selectedPattern].filter(Boolean).join(' / ') || 'Tiêu chuẩn';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 440px; padding: 24px; border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h4 style="margin: 0; font-family: var(--v2-font-serif); font-size: 1.25rem;">Nhận tin khi có hàng lại</h4>
                <button type="button" class="close-modal" onclick="this.closest('.modal').classList.remove('active')" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            <p style="font-size: 0.85rem; color: #64748b; margin-top: 0; margin-bottom: 12px;">
                Sản phẩm <strong>${escapeHTML(currentProductData?.name || '')}</strong> (${escapeHTML(selectedVariantName)}) hiện đang tạm hết. Tiệm sẽ thông báo ngay cho bạn khi có hàng đợt mới.
            </p>
            <form onsubmit="window.submitRestockAlert(event)">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Họ và tên</label>
                    <input type="text" id="restock-name" placeholder="Tên của bạn..." style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">Số điện thoại / Zalo <span style="color: #ef4444;">*</span></label>
                    <input type="tel" id="restock-phone" required placeholder="Số điện thoại nhận tin..." style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; box-sizing: border-box;">
                </div>
                <button type="submit" class="v2-btn-buy-now" style="width: 100%; justify-content: center;">Đăng ký nhận thông báo</button>
            </form>
        </div>
    `;
    modal.classList.add('active');
};

window.submitRestockAlert = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('restock-phone')?.value.trim();
    const name = document.getElementById('restock-name')?.value.trim();

    if (!phone) {
        showToast("Vui lòng nhập số điện thoại hoặc Zalo!", "error");
        return;
    }

    try {
        await addDoc(collection(db, "restock_alerts"), {
            productId: currentProductId,
            productName: currentProductData?.name || '',
            variant: [selectedComboVariant, selectedColor, selectedPattern].filter(Boolean).join(' / ') || 'Tiêu chuẩn',
            customerName: name || 'Khách hàng',
            phone,
            createdAt: serverTimestamp(),
            status: "pending"
        });
        showToast("Đã đăng ký! Tiệm sẽ liên hệ khi sản phẩm về đợt mới nhé.");
        document.getElementById('restock-alert-modal')?.classList.remove('active');
    } catch (err) {
        showToast("Lỗi gửi thông tin: " + err.message, "error");
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', async (user) => {
        if (user) {
            try {
                const adminSnap = await getDoc(doc(db, "admins", user.uid));
                isAdmin = adminSnap.exists();
            } catch (e) {}
        }
        initTabs();
        initStickyBar();
        fetchProductDetailV2();
    });
});
