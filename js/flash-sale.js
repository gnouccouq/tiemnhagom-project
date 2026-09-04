import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, renderProductCardWithVariants, updateSEO, fetchFlashSaleSettings, dynamicCategories, DEFAULT_PRODUCT_CATEGORIES
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Cấu hình phân trang & lọc
const PAGE_SIZE = 10; // Hiển thị 10 sản phẩm mỗi trang
let lastVisible = null; // Document cuối cùng của trang hiện tại
let firstVisible = null; // Document đầu tiên của trang hiện tại
let currentPage = 1;
let selectedPriceGroup = null; // Mức giá đồng giá đang chọn
let selectedCategory = 'all'; // Danh mục sản phẩm đang lọc ('all' hoặc tên group)
let flashSaleSettings = null; // Cấu hình từ database
let categoriesInitialized = false;

// Hàm toggle yêu thích (dùng chung cho các trang hiển thị sản phẩm)
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, fetchFlashSaleProducts); // Cập nhật lại danh sách sau khi toggle
};

// Hàm chính để lấy và hiển thị sản phẩm Flash Sale
async function fetchFlashSaleProducts(navigation = 'init') {
    const productGrid = document.getElementById('flash-sale-grid');
    const noProductsMsg = document.getElementById('no-flash-sale-products');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    const bannerTitle = document.querySelector('.banner-title');
    const bannerSub = document.querySelector('.flash-sale-banner p');
    const countdownEl = document.getElementById('flash-sale-countdown');
    const sidebarEl = document.querySelector('.price-tabs-sidebar');
    const layoutEl = document.querySelector('.flash-sale-layout');

    // 1. Nạp cấu hình Flash Sale (buộc làm mới nếu là khởi tạo hoặc timer kết thúc)
    flashSaleSettings = await fetchFlashSaleSettings(navigation === 'init');

    // Kiểm tra trạng thái sale
    const now = new Date();
    const startTime = flashSaleSettings?.startTime?.toDate ? flashSaleSettings.startTime.toDate() : (flashSaleSettings?.startTime ? new Date(flashSaleSettings.startTime) : null);
    const endTime = flashSaleSettings?.endTime?.toDate ? flashSaleSettings.endTime.toDate() : (flashSaleSettings?.endTime ? new Date(flashSaleSettings.endTime) : null);
    
    // Xác định chương trình sale có đang DIỄN RA hay không
    const isFsRunning = flashSaleSettings?.isActive && 
                        (!startTime || now >= startTime) && 
                        (!endTime || now <= endTime);

    const isUpcoming = flashSaleSettings?.isActive && startTime && now < startTime;
    
    // Cập nhật UI Banner & Sidebar dựa trên trạng thái chương trình
    if (isFsRunning) {
        if (bannerTitle) bannerTitle.innerText = flashSaleSettings.title || "Flash Sale";
        if (bannerSub) {
            bannerSub.style.display = 'block';
            bannerSub.innerText = flashSaleSettings.subtitle || "Nhanh tay sở hữu những món gốm độc bản với ưu đãi tốt nhất.";
        }
        if (countdownEl) countdownEl.style.display = 'flex';
        if (sidebarEl) sidebarEl.style.display = 'block';
        if (layoutEl) layoutEl.style.display = 'grid';
        initDynamicCountdown(endTime);
        renderPriceTabs();
    } else if (isUpcoming) {
        if (bannerTitle) bannerTitle.innerText = `⏰ ${flashSaleSettings.title || "Siêu Sale 9.9"} - Sắp Diễn Ra!`;
        if (bannerSub) {
            bannerSub.style.display = 'block';
            bannerSub.innerText = `Chương trình sẽ chính thức mở bán vào lúc ${startTime.toLocaleString('vi-VN')}. Hãy thêm sản phẩm vào giỏ trước!`;
        }
        if (countdownEl) countdownEl.style.display = 'flex';
        if (sidebarEl) sidebarEl.style.display = 'none';
        if (layoutEl) layoutEl.style.display = 'block';
        initDynamicCountdown(startTime); // Đếm ngược đến giờ bắt đầu
    } else {
        if (bannerTitle) bannerTitle.innerText = "Ưu Đãi Đặc Biệt";
        if (bannerSub) {
            bannerSub.style.display = 'block';
            bannerSub.innerText = "Khám phá các sản phẩm đang có giá tốt nhất tại Tiệm.";
        }
        if (countdownEl) countdownEl.style.display = 'none';
        if (sidebarEl) sidebarEl.style.display = 'none';
        // Chuyển layout sang 1 cột nếu không có sidebar lọc giá
        if (layoutEl) layoutEl.style.display = 'block';
        if (window.fsTimer) clearInterval(window.fsTimer);
    }

    // Hiển thị skeleton loading ngay lập tức
    productGrid.innerHTML = `
        <div class="grid" style="padding: 0;">
            ${Array(PAGE_SIZE).fill(0).map(() => `
                <div class="skeleton-card">
                    <div class="skeleton skeleton-img"></div>
                    <div class="skeleton skeleton-text skeleton-title"></div>
                    <div class="skeleton skeleton-text skeleton-small"></div>
                    <div class="skeleton skeleton-text skeleton-price"></div>
                </div>`).join('')}
        </div>`;
    noProductsMsg.style.display = 'none';

    // Cập nhật SEO cho trang Flash Sale
    const seoTitle = "Flash Sale - Ưu đãi gốm sứ cực sốc | Tiệm Nhà Gốm";
    const seoDesc = "Khám phá các sản phẩm gốm sứ thủ công đang được giảm giá cực sốc tại Tiệm Nhà Gốm. Đừng bỏ lỡ cơ hội sở hữu đồ decor tinh tế với giá tốt nhất.";
    const baseUrl = window.location.origin + window.location.pathname.split('/flash-sale/')[0];
    const seoImg = `${baseUrl}/Asset/images/hero-bg.jpg`;
    updateSEO(seoTitle, seoDesc, seoImg);

    try {
        let productsQuery = collection(db, "products");
        let currentSort = document.getElementById('sort-by')?.value || 'sale-desc';

        // Reset khi đổi bộ lọc hoặc khởi tạo
        if (navigation === 'init') {
            lastVisible = null;
            firstVisible = null;
            currentPage = 1;
        }

        // LUÔN LUÔN LỌC SẢN PHẨM ĐANG SALE
        productsQuery = query(productsQuery, where("sale", ">", 0));

        // Lọc client side nên không cần query phức tạp

        // Lấy danh sách sản phẩm cấu hình trong Flash Sale Items
        const fsItemIds = ((isFsRunning || isUpcoming) && flashSaleSettings?.items) ? Object.keys(flashSaleSettings.items) : [];
        const fsProductsMap = {};

        // Fetch chi tiết các sản phẩm trong items
        if (fsItemIds.length > 0) {
            const fsItemPromises = fsItemIds.map(pid => getDoc(doc(db, "products", pid)));
            const fsSnaps = await Promise.all(fsItemPromises);
            fsSnaps.forEach(snap => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (!data.isHidden && !data.isOnlyEvent) {
                        fsProductsMap[snap.id] = { id: snap.id, ...data };
                    }
                }
            });
        }

        // Lấy các sản phẩm có sale > 0 thông thường
        const qAll = query(collection(db, "products"), where("sale", ">", 0), orderBy("sale", "desc"));
        const querySnapshot = await getDocs(qAll);
        
        const allFetchedProducts = [];
        const seenIds = new Set();

        // 1. Ưu tiên đưa các sản phẩm trong Flash Sale Campaign vào đầu
        Object.values(fsProductsMap).forEach(p => {
            allFetchedProducts.push(p);
            seenIds.add(p.id);
        });

        // 2. Thêm các sản phẩm sale thường ngày
        querySnapshot.docs.forEach(docSnap => {
            if (!seenIds.has(docSnap.id)) {
                const p = { id: docSnap.id, ...docSnap.data() };
                if (!p.isHidden && !p.isOnlyEvent) {
                    allFetchedProducts.push(p);
                    seenIds.add(p.id);
                }
            }
        });

        if (allFetchedProducts.length === 0) {
            productGrid.innerHTML = '';
            noProductsMsg.style.display = 'block';
            return;
        }

        // Lọc theo danh mục nếu người dùng chọn
        let filteredProducts = allFetchedProducts;
        if (selectedCategory !== 'all') {
            const group = dynamicCategories.find(g => g.name === selectedCategory);
            if (group) {
                if (group.subs && group.subs.length > 0) {
                    filteredProducts = allFetchedProducts.filter(p => group.subs.includes(p.category) || p.category === group.name);
                } else {
                    filteredProducts = allFetchedProducts.filter(p => p.category === group.name);
                }
            } else {
                filteredProducts = allFetchedProducts.filter(p => p.category === selectedCategory);
            }
        }

        if (filteredProducts.length === 0) {
            productGrid.innerHTML = `
                <div style="text-align: center; padding: 4rem 1rem; width: 100%;">
                    <p style="font-size: 1.1rem; color: #666;">Không có sản phẩm Flash Sale nào thuộc danh mục <strong>${selectedCategory}</strong>.</p>
                </div>`;
            noProductsMsg.style.display = 'none';
            // Vẫn cập nhật lại số lượng danh mục
            fetchCategorySaleCounts(allFetchedProducts);
            return;
        }

        // Cập nhật số lượng hiển thị trên các tab danh mục
        fetchCategorySaleCounts(allFetchedProducts);

        // PHÂN LOẠI SẢN PHẨM
        const flashSaleCampaignProducts = []; // Sản phẩm thuộc chiến dịch 9.9
        const groupedProducts = {}; // { 39000: [...], 49000: [...] }
        const otherSales = [];
        const priceGroups = flashSaleSettings?.priceGroups || [];
        const schemaItems = [];

        filteredProducts.forEach((p, index) => {
            const fsInfo = isFsRunning && flashSaleSettings?.items ? flashSaleSettings.items[p.id] : null;
            const currentPrice = (fsInfo && fsInfo.salePrice) ? fsInfo.salePrice : ((isFsRunning && p.flashSaleGroup) ? p.flashSaleGroup : (p.salePrice || Math.round(p.price * (1 - (p.sale || 0) / 100))));

            // Chuẩn bị dữ liệu cho Schema SEO
            schemaItems.push({
                "@type": "ListItem",
                "position": index + 1,
                "item": {
                    "@type": "Product",
                    "name": p.name,
                    "image": p.imageUrl,
                    "url": `${baseUrl}/product/index.html?id=${p.id}`,
                    "offers": {
                        "@type": "Offer",
                        "priceCurrency": "VND",
                        "price": currentPrice,
                        "availability": (p.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
                    }
                }
            });
            
            if (fsInfo) {
                flashSaleCampaignProducts.push(p);
            } else if (isFsRunning && p.flashSaleGroup && priceGroups.includes(p.flashSaleGroup)) {
                const group = p.flashSaleGroup;
                if (!groupedProducts[group]) groupedProducts[group] = [];
                groupedProducts[group].push(p);
            } else {
                otherSales.push(p);
            }
        });

        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        // RENDER GIAO DIỆN THEO TỪNG CHƯƠNG TRÌNH
        let htmlContent = '';
        
        // HÀM SẮP XẾP CLIENT-SIDE
        const sortProducts = (productsArray) => {
            productsArray.sort((a, b) => {
                const priceA = (isFsRunning && a.flashSaleGroup) ? a.flashSaleGroup : (a.salePrice || Math.round(a.price * (1 - (a.sale || 0) / 100)));
                const priceB = (isFsRunning && b.flashSaleGroup) ? b.flashSaleGroup : (b.salePrice || Math.round(b.price * (1 - (b.sale || 0) / 100)));
                
                switch (currentSort) {
                    case 'price-asc': return priceA - priceB;
                    case 'price-desc': return priceB - priceA;
                    case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
                    case 'newest': return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
                    case 'sale-desc':
                    default: return (b.sale || 0) - (a.sale || 0);
                }
            });
        };
        
        // 1. TRƯỜNG HỢP 1: FLASH SALE SẮP BẮT ĐẦU (ĐẾM NGƯỢC TỚI GIỜ MỞ BÁN)
        if (isUpcoming) {
            // Lấy các sản phẩm tham gia 9.9
            const upcomingProducts = filteredProducts.filter(p => fsProductsMap[p.id]);
            if (upcomingProducts.length > 0) {
                htmlContent += `
                    <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                        <div style="background: #eff6ff; border: 1.5px dashed #93c5fd; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 2.5rem;">
                            <h2 style="color: #1e40af; margin-bottom: 6px; font-size: 1.3rem;">🔥 Danh Sách Sản Phẩm Mở Bán Đợt 9.9</h2>
                            <p style="color: #3b82f6; font-size: 0.9rem; margin: 0;">Các deal số lượng có hạn dưới đây sẽ chính thức áp dụng giá sale khi đồng hồ đếm ngược về 00:00:00. Hãy thêm vào danh sách yêu thích trước!</p>
                        </div>
                        <div class="grid" style="padding: 0;">
                            ${upcomingProducts.map(p => renderProductCardWithVariants(p, p.id, favs, '../product/index.html')).join('')}
                        </div>
                    </div>
                `;
            } else {
                htmlContent += `
                    <div style="text-align: center; padding: 4rem 1rem;">
                        <p style="font-size: 1.15rem; color: #64748b;">Chương trình <strong>${flashSaleSettings?.title || "Siêu Sale 9.9"}</strong> đang được chuẩn bị và sẽ sớm mở bán!</p>
                        <p style="margin-top: 1rem;"><a href="../products/" class="btn-dark">Khám phá các sản phẩm khác</a></p>
                    </div>
                `;
            }
        } else {
            // TRƯỜNG HỢP 2: ĐANG DIỄN RA HOẶC BÌNH THƯỜNG
            // 1. Render nhóm Sản phẩm Siêu Sale 9.9 (Độc quyền & Số lượng có hạn)
            if (isFsRunning && flashSaleCampaignProducts.length > 0 && selectedPriceGroup === null) {
                sortProducts(flashSaleCampaignProducts);
                htmlContent += `
                    <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 10px;">
                            <h2 class="shimmer-title" style="margin: 0; text-align: left; display: flex; align-items: center; gap: 8px;">
                                🔥 ${flashSaleSettings?.title || "Siêu Sale 9.9 - Deal Độc Quyền"}
                            </h2>
                            <span style="font-size: 0.85rem; color: #e65100; font-weight: 600; background: #fff7ed; padding: 4px 12px; border-radius: 20px; border: 1px solid #ffedd5;">
                                ⚡ Số lượng có hạn - Săn ngay kẻo lỡ
                            </span>
                        </div>
                        <div class="grid" style="padding: 0;">
                            ${flashSaleCampaignProducts.map(p => renderProductCardWithVariants(p, p.id, favs, '../product/index.html')).join('')}
                        </div>
                    </div>
                `;
            }

            // 2. Render các nhóm đồng giá (nếu có)
            if (isFsRunning) {
                priceGroups.sort((a,b) => a-b).forEach(price => {
                    if (selectedPriceGroup !== null && price !== selectedPriceGroup) return;
                    const products = groupedProducts[price] || [];
                    if (products.length === 0) return;
                    sortProducts(products);
                    htmlContent += `
                        <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                            <h2 class="shimmer-title" style="margin-bottom: 2rem; text-align: left;">⚡ Đồng giá ${price/1000}k</h2>
                            <div class="grid" style="padding: 0;">
                                ${products.map(p => renderProductCardWithVariants(p, p.id, favs, '../product/index.html')).join('')}
                            </div>
                        </div>
                    `;
                });
            }

            // 3. Render nhóm Sale khác (nếu đang chạy chiến dịch và chưa lọc)
            if (otherSales.length > 0 && selectedPriceGroup === null) {
                sortProducts(otherSales);
                const sectionTitle = isFsRunning ? "🎁 Ưu đãi hấp dẫn khác" : "Sản phẩm ưu đãi";
                htmlContent += `
                    <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                        <h2 style="margin-bottom: 2rem; text-align: left; border-bottom: 2px solid #eee; padding-bottom: 10px;">${sectionTitle}</h2>
                        <div class="grid" style="padding: 0;">
                            ${otherSales.map(p => renderProductCardWithVariants(p, p.id, favs, '../product/index.html')).join('')}
                        </div>
                    </div>
                `;
            }
        }

        productGrid.innerHTML = htmlContent;
        // Ẩn phân trang vì đã hiện toàn bộ theo section
        if (document.querySelector('.pagination-container')) document.querySelector('.pagination-container').style.display = 'none';

        // Cập nhật Structured Data (Schema.org) cho Product Collection
        let scriptTag = document.getElementById('flash-sale-schema');
        if (!scriptTag) {
            scriptTag = document.createElement('script');
            scriptTag.id = 'flash-sale-schema';
            scriptTag.type = 'application/ld+json';
            document.head.appendChild(scriptTag);
        }
        scriptTag.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "Danh sách sản phẩm Flash Sale - Tiệm Nhà Gốm",
            "numberOfItems": filteredProducts.length,
            "itemListElement": schemaItems
        });
        
        // Cập nhật trạng thái nút phân trang
        if (pageInfo) pageInfo.innerText = `Trang ${currentPage}`;
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = querySnapshot.docs.length < PAGE_SIZE;

    } catch (e) {
        console.error("Lỗi fetch sản phẩm sale:", e);
        if (productGrid) productGrid.innerHTML = '<p style="text-align:center; color:red;">Đã xảy ra lỗi khi tải danh sách sản phẩm.</p>';
    }
}

// Hàm render thanh danh mục tối giản
function renderCategoryGrid() {
    const container = document.getElementById('category-grid-display');
    if (!container) return;

    const categories = dynamicCategories.length > 0 ? dynamicCategories : DEFAULT_PRODUCT_CATEGORIES;

    let mainCatHtml = `
        <div class="minimal-category-list">
            <a href="javascript:void(0)" class="minimal-cat-item ${selectedCategory === 'all' ? 'active' : ''}" data-filter-category="all" id="fs-cat-all">
                tất cả <span class="cat-count">(...)</span>
            </a>
    `;

    categories.forEach(group => {
        const isGroupActive = selectedCategory === group.name;
        mainCatHtml += `
            <a href="javascript:void(0)" class="minimal-cat-item ${isGroupActive ? 'active' : ''}" data-filter-category="${group.name}" id="fs-cat-${group.name.replace(/\s+/g, '-')}">
                ${group.name.toLowerCase()} <span class="cat-count">(...)</span>
            </a>
        `;
    });
    mainCatHtml += `</div>`;

    container.innerHTML = mainCatHtml;

    // Gắn sự kiện click chọn danh mục
    container.querySelectorAll('.minimal-cat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = item.getAttribute('data-filter-category');
            selectedCategory = cat;
            
            container.querySelectorAll('.minimal-cat-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            fetchFlashSaleProducts('init');
        });
    });
}

// Hàm đếm và hiển thị số lượng sản phẩm sale theo từng danh mục
function fetchCategorySaleCounts(productsList) {
    if (!productsList || !Array.isArray(productsList)) return;

    const countCards = (docs) => {
        let count = 0;
        docs.forEach(p => {
            count += 1;
            if (p.comboVariants && Array.isArray(p.comboVariants)) {
                count += p.comboVariants.filter(v => v.showOnProductPage).length;
            }
            if (p.colorVariants && Array.isArray(p.colorVariants)) {
                count += p.colorVariants.filter(v => v.showOnProductPage).length;
            }
            if (p.patternVariants && Array.isArray(p.patternVariants)) {
                count += p.patternVariants.filter(v => v.showOnProductPage).length;
            }
        });
        return count;
    };

    // 1. Tổng tất cả
    const elAll = document.getElementById('fs-cat-all');
    if (elAll && elAll.querySelector('.cat-count')) {
        elAll.querySelector('.cat-count').textContent = `(${countCards(productsList)})`;
    }

    // 2. Từng danh mục
    const categories = dynamicCategories.length > 0 ? dynamicCategories : DEFAULT_PRODUCT_CATEGORIES;
    categories.forEach(group => {
        const el = document.getElementById(`fs-cat-${group.name.replace(/\s+/g, '-')}`);
        if (el && el.querySelector('.cat-count')) {
            let catDocs = [];
            if (group.subs && group.subs.length > 0) {
                catDocs = productsList.filter(p => group.subs.includes(p.category) || p.category === group.name);
            } else {
                catDocs = productsList.filter(p => p.category === group.name);
            }
            el.querySelector('.cat-count').textContent = `(${countCards(catDocs)})`;
        }
    });
}

// Hàm render các nút chọn mức giá đồng giá
function renderPriceTabs() {
    const container = document.getElementById('price-tabs-container');
    if (!container || !flashSaleSettings || !flashSaleSettings.priceGroups) return;

    const groups = flashSaleSettings.priceGroups.sort((a, b) => a - b);
    
    let html = `<div class="price-tab ${selectedPriceGroup === null ? 'active' : ''}" onclick="window.filterByPriceGroup(null)">Tất cả</div>`;
    
    html += groups.map(price => `
        <div class="price-tab ${selectedPriceGroup === price ? 'active' : ''}" onclick="window.filterByPriceGroup(${price})">
            Đồng giá ${price/1000}k
        </div>
    `).join('');

    container.innerHTML = html;
}

window.filterByPriceGroup = (price) => {
    selectedPriceGroup = price;
    // Hiệu ứng đổi màu banner nếu cần
    const banner = document.querySelector('.flash-sale-banner');
    if (banner) {
        if (price) banner.classList.add('price-focused');
        else banner.classList.remove('price-focused');
    }
    fetchFlashSaleProducts('init');
};

function initDynamicCountdown(endTime) {
    const update = () => {
        const now = new Date();
        const diff = endTime - now;
        if (diff <= 0) {
            if (window.fsTimer) clearInterval(window.fsTimer);
            fetchFlashSaleProducts(); // Reload để hiện thông báo kết thúc
            return;
        }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if(document.getElementById('days')) document.getElementById('days').innerText = d.toString().padStart(2, '0');
        if(document.getElementById('hours')) document.getElementById('hours').innerText = h.toString().padStart(2, '0');
        if(document.getElementById('minutes')) document.getElementById('minutes').innerText = m.toString().padStart(2, '0');
        if(document.getElementById('seconds')) document.getElementById('seconds').innerText = s.toString().padStart(2, '0');
    };
    if (window.fsTimer) clearInterval(window.fsTimer);
    window.fsTimer = setInterval(update, 1000);
    update();
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', (user) => {
        fetchFlashSaleProducts();
    });

    // Lắng nghe danh mục động từ Firestore
    onSnapshot(doc(db, "settings", "product_categories"), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data && data.groups) {
                dynamicCategories.length = 0;
                dynamicCategories.push(...data.groups);
                renderCategoryGrid();
            }
        } else {
            renderCategoryGrid();
        }
    });

    // Gán sự kiện sắp xếp
    document.getElementById('sort-by')?.addEventListener('change', () => fetchFlashSaleProducts('init'));

    // Gán sự kiện phân trang
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchFlashSaleProducts('prev');
        }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
        currentPage++;
        fetchFlashSaleProducts('next');
    });
});
