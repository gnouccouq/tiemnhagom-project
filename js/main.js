// js/main.js
import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, renderProductCardWithVariants, initAutocomplete 
} from "./utils.js?v=3";
import { collection, getDocs, doc, getDoc, query, where, setDoc, limit, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Hàm toggle yêu thích
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, () => {
        fetchFeaturedProducts();
        initFlashSaleSync(); // Đồng bộ lại trạng thái sau khi toggle
    });
};

// Hàm lấy sản phẩm tiêu biểu
async function fetchFeaturedProducts() {
    const grid = document.getElementById('product-grid');
    try {
        // Hiển thị skeleton loading trong khi chờ query Firestore
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        // TỐI ƯU: Lấy 30 sản phẩm để dự phòng các sản phẩm bị ẩn, sau đó giới hạn 14 ở client
        const q = query(collection(db, "products"), orderBy("updatedAt", "desc"), limit(30));
        
        // Lấy yêu thích song song để tránh blocking
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []); // Fallback nếu lỗi auth tạm thời
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);
        
        let htmlContent = ''; // Sử dụng biến tạm để tối ưu hiệu suất

        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden) return;
            if (count >= 14) return;
            htmlContent += renderProductCardWithVariants(doc.data(), doc.id, favs, 'product/index.html');
            count++;
        });
        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm nào.</p>';
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm lấy sản phẩm bán chạy
async function fetchBestSellingProducts() {
    const grid = document.getElementById('best-selling-grid');
    if (!grid) return;
    
    try {
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        const q = query(collection(db, "products"), orderBy("sold", "desc"), limit(15));
        
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []);
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);
        
        let htmlContent = '';
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden) return;
            if (count >= 10) return;
            htmlContent += renderProductCardWithVariants(doc.data(), doc.id, favs, 'product/index.html');
            count++;
        });
        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm bán chạy.</p>';
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm bán chạy:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm lấy sản phẩm Combo
async function fetchComboProducts() {
    const grid = document.getElementById('combo-grid');
    if (!grid) return;
    
    try {
        grid.innerHTML = Array(5).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton skeleton-text skeleton-title"></div>
                <div class="skeleton skeleton-text skeleton-small"></div>
                <div class="skeleton skeleton-text skeleton-price"></div>
            </div>
        `).join('');

        const q = query(collection(db, "products"), where("isCombo", "==", true), limit(10));
        
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []);
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);
        
        let htmlContent = '';
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden) return;
            if (count >= 10) return;
            htmlContent += renderProductCardWithVariants(doc.data(), doc.id, favs, 'product/index.html');
            count++;
        });
        grid.innerHTML = htmlContent || '<p>Hiện chưa có Combo nào.</p>';
    } catch (error) {
        console.error("Lỗi lấy dữ liệu Combo:", error);
        grid.innerHTML = '<p>Không thể tải Combo. Vui lòng thử lại sau.</p>';
    }
}

// Hàm đồng bộ cấu hình Flash Sale từ Firestore và kiểm tra thời hạn
async function initFlashSaleSync() {
    const saleSection = document.getElementById('sale-section');
    const saleGrid = document.getElementById('sale-product-grid');
    if (!saleSection || !saleGrid) return;

    try {
        // 1. Nạp cấu hình từ Firestore (đồng bộ với trang Flash Sale)
        const fsRef = doc(db, "settings", "flash_sale");
        const fsSnap = await getDoc(fsRef);
        
        if (!fsSnap.exists()) {
            saleSection.style.display = 'none';
            return;
        }

        const settings = fsSnap.data();
        const now = new Date();
        const endTime = settings.endTime?.toDate();
        const startTime = settings.startTime?.toDate();
        const isExpired = endTime && now > endTime;

        // 2. Kiểm tra trạng thái sale
        if (!settings.isActive || isExpired) {
            saleSection.style.display = 'none';
            return;
        }

        // 3. Khởi động bộ đếm ngược động (ưu tiên đếm đến giờ bắt đầu nếu chưa tới)
        if (startTime && now < startTime) {
            const shimmer = saleSection.querySelector('.shimmer-title');
            if (shimmer) shimmer.innerText = "Flash Sale Sắp Bắt Đầu";
            initDynamicCountdown(startTime);
        } else {
            initDynamicCountdown(endTime);
            // 4. Lấy danh sách sản phẩm (Chỉ khi đã bắt đầu)
            fetchSaleProducts();
        }

    } catch (e) {
        console.error("Lỗi đồng bộ Flash Sale trang chủ:", e);
        saleSection.style.display = 'none';
    }
}

async function fetchSaleProducts() {
    const saleGrid = document.getElementById('sale-product-grid');
    if (!saleGrid) return;

    // Hiển thị skeleton loading trong khi chờ query Firestore
    saleGrid.innerHTML = Array(5).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text skeleton-title"></div>
            <div class="skeleton skeleton-text skeleton-small"></div>
            <div class="skeleton skeleton-text skeleton-price"></div>
        </div>
    `).join('');

    try {
        // Lấy danh sách sản phẩm và yêu thích CÙNG LÚC (chạy song song) để tiết kiệm 50% thời gian chờ
        const q = query(collection(db, "products"), where("sale", ">", 0), limit(30));
        
        let favsPromise = Promise.resolve([]);
        if (auth.currentUser) {
            favsPromise = getDoc(doc(db, "favorites", auth.currentUser.uid))
                .then(snap => snap.exists() ? snap.data().productIds || [] : [])
                .catch(() => []);
        } else {
            favsPromise = Promise.resolve(JSON.parse(localStorage.getItem('favorites')) || []);
        }

        const [querySnapshot, favs] = await Promise.all([getDocs(q), favsPromise]);

        let htmlContent = '';
        let count = 0;
        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden) return;
            if (count >= 10) return;
            htmlContent += renderProductCardWithVariants(doc.data(), doc.id, favs, 'product/index.html');
            count++;
        });

        if (htmlContent) {
            saleGrid.innerHTML = htmlContent;
            document.getElementById('sale-section').style.display = 'block';
        }
    } catch (error) {
        console.error("Lỗi lấy sản phẩm sale:", error);
    }
}

// Hàm lấy danh sách Bộ sưu tập (Banner trang chủ)
async function fetchCollections() {
    const container = document.getElementById('collection-grid');
    if (!container) return;

    try {
        const snap = await getDoc(doc(db, "settings", "collections"));
        const collections = (snap.exists() && snap.data().items) ? snap.data().items.filter(c => c.showOnHome).slice(0, 6) : [];

        if (collections.length > 0) {
            container.innerHTML = collections.map(c => `
                <a href="collections/detail.html?name=${encodeURIComponent(c.name)}" class="collection-banner reveal-on-scroll">
                    <img src="${c.imageUrl}" alt="${c.name}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                    <div class="collection-overlay">
                        <h3>${c.name}</h3>
                        <span class="btn-minimal">Khám phá ngay</span>
                    </div>
                </a>
            `).join('');

            // Kích hoạt lại Observer cho các phần tử mới nạp động
            const newItems = container.querySelectorAll('.reveal-on-scroll');
            if (window.revealObserver) {
                newItems.forEach(item => window.revealObserver.observe(item));
            } else {
                newItems.forEach(item => item.classList.add('is-visible'));
            }
        } else {
            container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: #999; padding: 2rem;">Bộ sưu tập đang được cập nhật...</p>';
        }
    } catch (e) { 
        console.error("Lỗi lấy bộ sưu tập:", e); 
        container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: #e74c3c;">Không thể kết nối đến máy chủ.</p>';
    }
}

// Hàm gợi ý sản phẩm dựa trên lịch sử xem (Categories đã xem)
async function fetchRecommendations() {
    const recSection = document.getElementById('recommendation-section');
    const recGrid = document.getElementById('recommendation-grid');
    const history = JSON.parse(localStorage.getItem('viewed_products')) || [];
    
    if (history.length === 0) return;

    // 0. Hiển thị skeleton loading trong khi chờ query Firestore
    recSection.style.display = 'block';
    recGrid.innerHTML = Array(5).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text skeleton-title"></div>
            <div class="skeleton skeleton-text skeleton-small"></div>
            <div class="skeleton skeleton-text skeleton-price"></div>
        </div>
    `).join('');

    try {
        // 1. Lấy trực tiếp categories từ LocalStorage (Đã được lưu ở trang chi tiết)
        // Việc này giúp loại bỏ hoàn toàn các lượt đọc Firestore không cần thiết tại đây
        const recentCategories = new Set();
        history.slice(0, 3).forEach(item => {
            if (item && item.category) recentCategories.add(item.category);
        });

        if (recentCategories.size === 0) return;

        // 2. Query sản phẩm thuộc các categories này
        let htmlContent = '';
        const cats = Array.from(recentCategories);
        const historyIds = history.map(item => typeof item === 'string' ? item : item.id);
        
        const q = query(collection(db, "products"), where("category", "in", cats), limit(4));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            if (doc.data().isHidden) return;
            // Không hiện lại sản phẩm đã nằm trong lịch sử xem gần đây
            if (!historyIds.slice(0, 4).includes(doc.id)) {
                htmlContent += renderProductCardWithVariants(doc.data(), doc.id, [], 'product/index.html');
            }
        });

        if (htmlContent) {
            recGrid.innerHTML = htmlContent;
        } else {
            recSection.style.display = 'none'; // Ẩn nếu không có dữ liệu thực tế phù hợp
        }
    } catch (error) {
        console.error("Lỗi lấy gợi ý:", error);
        recSection.style.display = 'none';
    }
}

// Hàm đếm ngược thời gian dựa trên cài đặt Admin
function initDynamicCountdown(endTime) {
    const update = () => {
        const now = new Date();
        const diff = endTime - now;
        if (diff <= 0) {
            if (window.fsHomeTimer) clearInterval(window.fsHomeTimer);
            initFlashSaleSync(); // Gọi lại sync để tự động nạp sản phẩm khi từ Sắp bắt đầu -> Đang diễn ra
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
    if (window.fsHomeTimer) clearInterval(window.fsHomeTimer);
    window.fsHomeTimer = setInterval(update, 1000);
    update();
}

// Logic cho Hero Carousel
async function initHeroCarousel() {
    const container = document.getElementById('hero-carousel-container');
    const dotsContainer = document.getElementById('hero-carousel-dots');
    if (!container || !dotsContainer) return;

    let slidesData = [];
    try {
        const snap = await getDoc(doc(db, "settings", "banners"));
        if (snap.exists()) slidesData = snap.data().slides || [];
    } catch (e) { console.error("Load banner error:", e); }

    // Fallback nếu không có data hoặc lỗi
    if (slidesData.length === 0) {
        slidesData = [
            { imageUrl: 'Asset/images/hero-bg.webp', link: 'products/' },
            { imageUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?q=100&w=2560', link: 'products/' }
        ];
    }

    // Inject HTML
    container.innerHTML = slidesData.map((s, idx) => {
        const slideInner = `
            <picture>
                <source media="(max-width: 768px)" srcset="${s.mobileImageUrl || s.imageUrl}">
                <img src="${s.imageUrl}" alt="Banner Tiệm Nhà Gốm" ${idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} style="width:100%; height:100%; object-fit:cover;">
            </picture>`;
        
        return s.link 
            ? `<a href="${s.link}" class="carousel-slide ${idx === 0 ? 'active' : ''}">${slideInner}</a>`
            : `<div class="carousel-slide ${idx === 0 ? 'active' : ''}">${slideInner}</div>`;
    }).join('');

    dotsContainer.innerHTML = slidesData.map((_, idx) => `
        <span class="dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"><span class="dot-fill"></span></span>
    `).join('');

    const slides = container.querySelectorAll('.carousel-slide');
    const dots = dotsContainer.querySelectorAll('.dot');

    let currentIndex = 0;
    let slideInterval;
    const slideDuration = 4000;

    const showSlide = (index) => {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => {
            d.classList.remove('active');
            const fill = d.querySelector('.dot-fill');
            if (fill) {
                fill.style.transition = 'none'; // Reset animation ngay lập tức
                fill.style.width = '0';
            }
        });

        slides[index].classList.add('active');
        dots[index].classList.add('active');

        // Kích hoạt thanh tiến trình cho dot hiện tại
        const activeFill = dots[index].querySelector('.dot-fill');
        if (activeFill) {
            void activeFill.offsetWidth; // Force reflow để trình duyệt nhận diện reset width
            activeFill.style.transition = `width ${slideDuration}ms linear`;
            activeFill.style.width = '100%';
        }

        currentIndex = index;
    };

    const startAutoSlide = () => {
        slideInterval = setInterval(() => {
            showSlide((currentIndex + 1) % slides.length);
        }, slideDuration);
    };

    // Logic kéo chuột/vuốt màn hình để đổi slide
    let startX = 0;
    let preventClick = false;
    const threshold = 50; // Khoảng cách tối thiểu (pixel) để nhận diện hành động kéo

    const handleStart = (e) => {
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        preventClick = false;
    };

    const handleMove = (e) => {
        if (!startX) return;
        const currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        const diff = startX - currentX;
        if (Math.abs(diff) > 5) preventClick = true;
    };

    const handleEnd = (e) => {
        if (!startX) return;
        const endX = e.type.includes('mouse') ? e.pageX : (e.changedTouches ? e.changedTouches[0].clientX : 0);
        const diff = startX - endX;

        if (Math.abs(diff) > threshold) {
            if (diff > 0) showSlide((currentIndex + 1) % slides.length);
            else showSlide((currentIndex - 1 + slides.length) % slides.length);
            if (slideInterval) { clearInterval(slideInterval); startAutoSlide(); }
        }
        startX = 0;
    };

    container.addEventListener('mousedown', handleStart);
    container.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    container.addEventListener('touchstart', handleStart, { passive: true });
    container.addEventListener('touchmove', handleMove, { passive: true });
    container.addEventListener('touchend', handleEnd);

    // Ngăn hành vi kéo link mặc định của trình duyệt để có thể vuốt được
    container.addEventListener('dragstart', (e) => e.preventDefault());
    
    // Ngăn việc vô tình click vào link khi đang vuốt ảnh
    container.addEventListener('click', (e) => {
        if (preventClick) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            if (preventClick) return;
            const index = parseInt(e.currentTarget.dataset.index);
            showSlide(index);
            if (slideInterval) { clearInterval(slideInterval); startAutoSlide(); }
        });
    });

    startAutoSlide();
    showSlide(0);
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('./');
    
    // Kích hoạt ngay lập tức mà không cần chờ Auth để tăng tốc độ load
    initHeroCarousel();
    fetchFeaturedProducts();
    fetchBestSellingProducts();
    fetchComboProducts();
    initFlashSaleSync();
    fetchRecommendations();
    fetchCollections();
    
    // Khởi tạo tìm kiếm ở trang chủ
    initAutocomplete('home-search-input', 'home-search-suggestions', './');
});
      
