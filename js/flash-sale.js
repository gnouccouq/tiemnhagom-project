import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, updateSEO 
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

    // 1. Nạp cấu hình Flash Sale trước
    if (!flashSaleSettings) {
        const fsRef = doc(db, "settings", "flash_sale");
        const fsSnap = await getDoc(fsRef);
        if (fsSnap.exists()) {
            flashSaleSettings = fsSnap.data();
        }
    }

    // Kiểm tra trạng thái sale
    const now = new Date();
    const startTime = flashSaleSettings.startTime?.toDate();
    const endTime = flashSaleSettings.endTime?.toDate();
    const isUpcoming = startTime && now < startTime;
    const isExpired = flashSaleSettings?.endTime && now > flashSaleSettings.endTime.toDate();
    
    if (!flashSaleSettings?.isActive || isExpired) {
        productGrid.innerHTML = '';
        noProductsMsg.innerHTML = isExpired ? "<h3>Chương trình Flash Sale đã kết thúc!</h3><p>Hẹn gặp lại bạn ở đợt ưu đãi tiếp theo.</p>" : "<h3>Sắp có Flash Sale cực lớn!</h3><p>Vui lòng quay lại sau nhé.</p>";
        noProductsMsg.style.display = 'block';
        if (bannerTitle) bannerTitle.innerText = "Flash Sale Tạm Nghỉ";
        return;
    }

    if (isUpcoming) {
        productGrid.innerHTML = '';
        noProductsMsg.innerHTML = `<h3>Flash Sale sắp bắt đầu!</h3><p>Chương trình sẽ chính thức diễn ra vào lúc <strong>${startTime.toLocaleString('vi-VN')}</strong>. Hãy quay lại sau nhé!</p>`;
        noProductsMsg.style.display = 'block';
        if (bannerTitle) bannerTitle.innerText = "Sắp Bắt Đầu";
        if (bannerSub) bannerSub.innerText = "Đừng bỏ lỡ những ưu đãi cực sốc sắp tới";
        initDynamicCountdown(startTime); // Đếm ngược đến giờ bắt đầu
        return;
    }

    // Cập nhật tiêu đề từ cấu hình
    if (flashSaleSettings.title && bannerTitle) bannerTitle.innerText = flashSaleSettings.title;
    if (flashSaleSettings.subtitle && bannerSub) bannerSub.innerText = flashSaleSettings.subtitle;

    // Render Price Tabs (Đồng giá)
    renderPriceTabs();
    initDynamicCountdown(flashSaleSettings.endTime.toDate());

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
        const priceGroups = flashSaleSettings.priceGroups || [];
        const schemaItems = [];

        querySnapshot.docs.forEach((doc, index) => {
            const p = { id: doc.id, ...doc.data() };
            // Ưu tiên dùng mức đồng giá được lưu
            const currentPrice = p.flashSaleGroup || Math.round(p.price * (1 - p.sale / 100));

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
            if (p.flashSaleGroup && priceGroups.includes(p.flashSaleGroup)) {
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

        // 2. Render nhóm Sale khác
        if (otherSales.length > 0 && selectedPriceGroup === null) {
            htmlContent += `
                <div class="sale-program-section" style="margin-bottom: 4rem; width: 100%;">
                    <h2 style="margin-bottom: 2rem; text-align: left; border-bottom: 2px solid #eee; padding-bottom: 10px;">🎁 Ưu đãi hấp dẫn khác</h2>
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
        
        // Nếu đang lọc đồng giá, ta tạm ẩn phân trang vì kết quả đã được thu hẹp
        if (nextBtn) nextBtn.disabled = selectedPriceGroup ? true : (querySnapshot.size < PAGE_SIZE);

    } catch (error) {
        console.error("Lỗi lấy dữ liệu Flash Sale:", error);
        productGrid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 5rem; color: red;">Không thể tải sản phẩm Flash Sale. Vui lòng thử lại sau.</p>';
        noProductsMsg.style.display = 'none'; // Đảm bảo ẩn thông báo không có sản phẩm nếu có lỗi
    }
}

// Render thanh các nút chọn mức giá đồng giá
function renderPriceTabs() {
    const container = document.getElementById('price-tabs-container');
    if (!container || !flashSaleSettings || !flashSaleSettings.priceGroups) return;

    container.innerHTML = `
        <div class="price-tab ${selectedPriceGroup === null ? 'active' : ''}" onclick="window.selectPriceGroup(null)">
            Tất cả
        </div>
        ${flashSaleSettings.priceGroups.map(price => `
            <div class="price-tab ${selectedPriceGroup === price ? 'active' : ''}" onclick="window.selectPriceGroup(${price})">
                Đồng giá ${price / 1000}k
            </div>
        `).join('')}
    `;
}

// Xử lý khi chọn một mức đồng giá
window.selectPriceGroup = (price) => {
    selectedPriceGroup = price;
    updateFlashSaleBanner(price);
    fetchFlashSaleProducts('init');
};

// Cập nhật Layout Banner riêng cho từng mức giá
function updateFlashSaleBanner(price) {
    const banner = document.querySelector('.flash-sale-banner');
    const bannerTitle = document.querySelector('.banner-title');
    const saleTag = document.querySelector('.sale-tag-hero');

    if (!banner) return;

    if (price) {
        banner.classList.add('price-focused');
        if (bannerTitle) bannerTitle.innerText = `Đồng giá ${price / 1000}k`;
        if (saleTag) saleTag.innerText = `Độc quyền tại Tiệm`;
        
        // Đổi màu chủ đạo theo mức giá (Tạo layout riêng bằng màu sắc)
        const themes = {
            39000: '#e67e22', // Cam
            49000: '#d35400', // Cam đậm
            59000: '#c0392b', // Đỏ đô
            79000: '#8e44ad', // Tím
            99000: '#2c3e50'  // Xanh than
        };
        banner.style.setProperty('--banner-accent', themes[price] || '#000');
    } else {
        banner.classList.remove('price-focused');
        if (bannerTitle) bannerTitle.innerText = flashSaleSettings.title || "Flash Sale";
        if (saleTag) saleTag.innerText = "Giảm cực sâu";
        banner.style.removeProperty('--banner-accent');
    }
}

// Đếm ngược thời gian dựa trên cài đặt Admin
function initDynamicCountdown(endTime) {
    const update = () => {
        const now = new Date();
        const diff = endTime - now;
        if (diff <= 0) {
            // Dừng bộ đếm và tải lại trang để áp dụng trạng thái kết thúc sale
            if (window.fsTimer) clearInterval(window.fsTimer);
            setTimeout(() => {
                window.location.reload();
            }, 500); // Trì hoãn một chút để đảm bảo trải nghiệm mượt mà
            return;
        }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if(document.getElementById('days')) {
            document.getElementById('days').innerText = d.toString().padStart(2, '0');
            document.getElementById('hours').innerText = h.toString().padStart(2, '0');
            document.getElementById('minutes').innerText = m.toString().padStart(2, '0');
            document.getElementById('seconds').innerText = s.toString().padStart(2, '0');
        }
    };
    if (window.fsTimer) clearInterval(window.fsTimer);
    window.fsTimer = setInterval(update, 1000);
    update();
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', (user) => {
        fetchFlashSaleProducts();
        
        // Gán sự kiện cho sắp xếp
        document.getElementById('sort-by')?.addEventListener('change', () => fetchFlashSaleProducts('init'));

        // Gán sự kiện cho phân trang
        document.getElementById('next-page')?.addEventListener('click', () => {
            currentPage++;
            fetchFlashSaleProducts('next');
        });
        document.getElementById('prev-page')?.addEventListener('click', () => {
            currentPage--;
            fetchFlashSaleProducts('prev');
        });
    });
});