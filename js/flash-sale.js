import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, updateSEO, fetchFlashSaleSettings
} from "./utils.js";
import { 
    collection, getDocs, doc, getDoc, query, where, orderBy, limit, startAfter, limitToLast, endBefore 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cấu hình phân trang
const PAGE_SIZE = 10; // Hiển thị 10 sản phẩm mỗi trang
let lastVisible = null; // Document cuối cùng của trang hiện tại
let firstVisible = null; // Document đầu tiên của trang hiện tại
let currentPage = 1;
let selectedPriceGroup = null; // Mức giá đồng giá đang chọn
let flashSaleSettings = null; // Cấu hình từ database

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
    const startTime = flashSaleSettings?.startTime?.toDate();
    const endTime = flashSaleSettings?.endTime?.toDate();
    
    // Xác định chương trình sale có đang DIỄN RA hay không
    const isFsRunning = flashSaleSettings?.isActive && 
                        (!startTime || now >= startTime) && 
                        (!endTime || now <= endTime);

    const isUpcoming = flashSaleSettings?.isActive && startTime && now < startTime;
    
    // Cập nhật UI Banner & Sidebar dựa trên trạng thái chương trình
    if (isFsRunning) {
        if (bannerTitle) bannerTitle.innerText = flashSaleSettings.title || "Flash Sale";
        if (bannerSub) bannerSub.innerText = flashSaleSettings.subtitle || "Nhanh tay sở hữu...";
        if (countdownEl) countdownEl.style.display = 'flex';
        if (sidebarEl) sidebarEl.style.display = 'block';
        if (layoutEl) layoutEl.style.display = 'grid';
        initDynamicCountdown(endTime);
        renderPriceTabs();
    } else if (isUpcoming) {
        if (bannerTitle) bannerTitle.innerText = "Sắp Bắt Đầu Flash Sale";
        if (bannerSub) bannerSub.innerText = `Chương trình sẽ chính thức diễn ra vào lúc ${startTime.toLocaleString('vi-VN')}`;
        if (countdownEl) countdownEl.style.display = 'flex';
        if (sidebarEl) sidebarEl.style.display = 'none';
        if (layoutEl) layoutEl.style.display = 'block';
        initDynamicCountdown(startTime); // Đếm ngược đến giờ bắt đầu
    } else {
        if (bannerTitle) bannerTitle.innerText = "Ưu Đãi Đặc Biệt";
        if (bannerSub) bannerSub.innerText = "Khám phá các sản phẩm đang có giá tốt nhất tại Tiệm.";
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

        // Apply sorting
        switch (currentSort) {
            case 'price-asc':
                productsQuery = query(productsQuery, orderBy("price", "asc"));
                break;
            case 'price-desc':
                productsQuery = query(productsQuery, orderBy("price", "desc"));
                break;
            case 'rating-desc':
                productsQuery = query(productsQuery, orderBy("rating", "desc"));
                break;
            case 'newest':
                productsQuery = query(productsQuery, orderBy("updatedAt", "desc"));
                break;
            case 'sale-desc':
            default:
                productsQuery = query(productsQuery, orderBy("sale", "desc")); // Sắp xếp theo % giảm giá nhiều nhất
                break;
        }

        // Thêm logic phân trang vào Query
        let finalQuery;
        if (navigation === 'next' && lastVisible) {
            finalQuery = query(productsQuery, startAfter(lastVisible), limit(PAGE_SIZE));
        } else if (navigation === 'prev' && firstVisible) {
            finalQuery = query(productsQuery, endBefore(firstVisible), limitToLast(PAGE_SIZE));
        } else {
            finalQuery = query(productsQuery, limit(PAGE_SIZE));
        }

        // Lấy TOÀN BỘ sản phẩm đang có sale để phân loại trực quan
        const qAll = query(collection(db, "products"), where("sale", ">", 0), orderBy("sale", "desc"));
        const querySnapshot = await getDocs(qAll);
        
        if (querySnapshot.empty) {
            productGrid.innerHTML = '';
            noProductsMsg.style.display = 'block';
            return;
        }

        // PHÂN LOẠI SẢN PHẨM
        const groupedProducts = {}; // { 39000: [...], 49000: [...] }
        const otherSales = [];
        const priceGroups = flashSaleSettings?.priceGroups || [];
        const schemaItems = [];

        querySnapshot.docs.forEach((doc, index) => {
            const p = { id: doc.id, ...doc.data() };
            // Ưu tiên dùng mức đồng giá được lưu
            const currentPrice = (isFsRunning && p.flashSaleGroup) ? p.flashSaleGroup : Math.round(p.price * (1 - (p.sale || 0) / 100));

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
            
            // Phân loại dựa trên giá trị flashSaleGroup được lưu trong DB
            if (isFsRunning && p.flashSaleGroup && priceGroups.includes(p.flashSaleGroup)) {
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
        
        // 1. Render các nhóm đồng giá
        if (isFsRunning) {
            priceGroups.sort((a,b) => a-b).forEach(price => {
                // Lọc theo nhóm được chọn nếu có
                if (selectedPriceGroup !== null && price !== selectedPriceGroup) {
                    return;
                }

                const products = groupedProducts[price] || [];
                if (products.length === 0) return;

            htmlContent += `
                <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                    <h2 class="shimmer-title" style="margin-bottom: 2rem; text-align: left;">⚡ Đồng giá ${price/1000}k</h2>
                    <div class="grid" style="padding: 0;">
                        ${products.map(p => renderProductCard(p, p.id, favs, '../product/index.html')).join('')}
                    </div>
                </div>
            `;
            });
        }

        // 2. Render nhóm Sale khác
        if (otherSales.length > 0 && selectedPriceGroup === null) {
            const sectionTitle = isFsRunning ? "🎁 Ưu đãi hấp dẫn khác" : "Sản phẩm ưu đãi";
            htmlContent += `
                <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                    <h2 style="margin-bottom: 2rem; text-align: left; border-bottom: 2px solid #eee; padding-bottom: 10px;">${sectionTitle}</h2>
                    <div class="grid" style="padding: 0;">
                        ${otherSales.map(p => renderProductCard(p, p.id, favs, '../product/index.html')).join('')}
                    </div>
                </div>
            `;
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
            "numberOfItems": querySnapshot.size,
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