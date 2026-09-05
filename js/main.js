// js/main.js
import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, renderProductCardWithVariants, initAutocomplete 
} from "./utils.js";
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
            if (doc.data().isHidden || doc.data().isOnlyEvent) return;
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
            if (doc.data().isHidden || doc.data().isOnlyEvent) return;
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
            if (doc.data().isHidden || doc.data().isOnlyEvent) return;
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
        const startTime = settings.startTime?.toDate ? settings.startTime.toDate() : (settings.startTime ? new Date(settings.startTime) : null);
        const endTime = settings.endTime?.toDate ? settings.endTime.toDate() : (settings.endTime ? new Date(settings.endTime) : null);
        const isExpired = endTime && now > endTime;

        // 2. Kiểm tra trạng thái sale
        if (!settings.isActive || isExpired) {
            saleSection.style.display = 'none';
            return;
        }

        const isUpcoming = startTime && now < startTime;
        const shimmer = saleSection.querySelector('.shimmer-title');
        const subtitle = saleSection.querySelector('.section-subtitle');

        if (isUpcoming) {
            if (shimmer) shimmer.innerHTML = `⏰ ${settings.title || "Siêu Sale 9.9"} - Sắp Diễn Ra!`;
            if (subtitle) subtitle.innerText = `Chính thức mở bán lúc ${startTime.toLocaleString('vi-VN')} - Săn deal số lượng có hạn!`;
            initDynamicCountdown(startTime);
            fetchSaleProducts(true, settings); // Nạp danh sách xem trước (chỉ sản phẩm 9.9)
        } else {
            if (shimmer) shimmer.innerHTML = `🔥 ${settings.title || "Flash Sale"} <img src="https://theme.hstatic.net/200000588671/1001020156/14/flashsale-hot.png?v=2949" alt="Hot" class="fire-icon">`;
            if (subtitle) subtitle.innerText = settings.subtitle || "Cơ hội sở hữu những tác phẩm tinh xảo với mức giá tốt nhất";
            initDynamicCountdown(endTime);
            fetchSaleProducts(false, settings); // Nạp danh sách sale đang chạy
        }

    } catch (e) {
        console.error("Lỗi đồng bộ Flash Sale trang chủ:", e);
        saleSection.style.display = 'none';
    }
}

async function fetchSaleProducts(isUpcoming = false, fsSettings = null) {
    const saleGrid = document.getElementById('sale-product-grid');
    if (!saleGrid) return;

    // Hiển thị skeleton loading
    saleGrid.innerHTML = Array(4).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text skeleton-title"></div>
            <div class="skeleton skeleton-text skeleton-small"></div>
            <div class="skeleton skeleton-text skeleton-price"></div>
        </div>
    `).join('');

    try {
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        const fsItemIds = (fsSettings && fsSettings.items) ? Object.keys(fsSettings.items) : [];
        let productsToRender = [];

        if (isUpcoming) {
            // Khi sắp diễn ra: Lấy các sản phẩm tham gia 9.9
            if (fsItemIds.length > 0) {
                const fsItemPromises = fsItemIds.slice(0, 8).map(pid => getDoc(doc(db, "products", pid)));
                const snaps = await Promise.all(fsItemPromises);
                snaps.forEach(snap => {
                    if (snap.exists() && !snap.data().isHidden && !snap.data().isOnlyEvent) {
                        productsToRender.push({ id: snap.id, ...snap.data() });
                    }
                });
            } else {
                // Nếu admin chưa chọn sản phẩm riêng trong items, tạm lấy các sản phẩm sale > 0 để preview
                const q = query(collection(db, "products"), where("sale", ">", 0), limit(8));
                const qSnap = await getDocs(q);
                qSnap.forEach(docSnap => {
                    const d = docSnap.data();
                    if (!d.isHidden && !d.isOnlyEvent) {
                        productsToRender.push({ id: docSnap.id, ...d });
                    }
                });
            }
        } else {
            // Khi đang diễn ra: Ưu tiên nạp các sản phẩm trong Flash Sale Campaign trước
            if (fsItemIds.length > 0) {
                const fsItemPromises = fsItemIds.slice(0, 8).map(pid => getDoc(doc(db, "products", pid)));
                const snaps = await Promise.all(fsItemPromises);
                snaps.forEach(snap => {
                    if (snap.exists() && !snap.data().isHidden && !snap.data().isOnlyEvent) {
                        productsToRender.push({ id: snap.id, ...snap.data() });
                    }
                });
            }

            // Nếu ít hơn 8 sản phẩm, bù thêm sản phẩm sale thông thường
            if (productsToRender.length < 8) {
                const q = query(collection(db, "products"), where("sale", ">", 0), limit(20));
                const qSnap = await getDocs(q);
                const existingIds = new Set(productsToRender.map(p => p.id));
                qSnap.forEach(docSnap => {
                    if (productsToRender.length < 8 && !existingIds.has(docSnap.id)) {
                        const d = docSnap.data();
                        if (!d.isHidden && !d.isOnlyEvent) {
                            productsToRender.push({ id: docSnap.id, ...d });
                            existingIds.add(docSnap.id);
                        }
                    }
                });
            }
        }

        const saleSec = document.getElementById('sale-section');
        if (saleSec) {
            if (productsToRender.length > 0) {
                saleGrid.innerHTML = productsToRender.map(p => renderProductCardWithVariants(p, p.id, favs, 'product/index.html')).join('');
                saleSec.style.display = 'block';
            } else {
                saleSec.style.display = 'none';
            }
        }
    } catch (error) {
        console.error("Lỗi lấy sản phẩm sale:", error);
        document.getElementById('sale-section').style.display = 'none';
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
            if (doc.data().isHidden || doc.data().isOnlyEvent) return;
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
        <div class="carousel-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></div>
    `).join('');

    const slides = container.querySelectorAll('.carousel-slide');
    const dots = dotsContainer.querySelectorAll('.carousel-dot');

    let currentIndex = 0;
    let slideInterval;
    const slideDuration = 4000;

    const showSlide = (index) => {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));

        slides[index].classList.add('active');
        dots[index].classList.add('active');

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

// ----------------------------------------------------
// STORY SLIDER (KHỐI VỀ TIỆM NHÀ GỐM TRANG CHỦ)
// ----------------------------------------------------
function initStorySlider() {
    const slides = document.querySelectorAll('.story-slide');
    const dotsContainer = document.getElementById('story-dots');
    if (!slides || slides.length === 0) return;

    let currentStoryIdx = 0;
    let storyTimer = null;

    // Render dots
    if (dotsContainer) {
        dotsContainer.innerHTML = Array.from(slides).map((_, i) => `
            <div class="story-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
        `).join('');

        const dots = dotsContainer.querySelectorAll('.story-dot');
        dots.forEach((dot, idx) => {
            dot.addEventListener('click', () => {
                showStorySlide(idx);
                resetStoryTimer();
            });
        });
    }

    function showStorySlide(idx) {
        if (idx >= slides.length) idx = 0;
        if (idx < 0) idx = slides.length - 1;
        currentStoryIdx = idx;

        slides.forEach((s, i) => {
            s.classList.toggle('active', i === currentStoryIdx);
        });

        if (dotsContainer) {
            const dots = dotsContainer.querySelectorAll('.story-dot');
            dots.forEach((d, i) => {
                d.classList.toggle('active', i === currentStoryIdx);
            });
        }
    }

    function moveStorySlide(step) {
        showStorySlide(currentStoryIdx + step);
        resetStoryTimer();
    }

    function startStoryTimer() {
        if (slides.length > 1) {
            storyTimer = setInterval(() => {
                showStorySlide(currentStoryIdx + 1);
            }, 4500);
        }
    }

    function resetStoryTimer() {
        if (storyTimer) clearInterval(storyTimer);
        startStoryTimer();
    }

    // Gán ra window để dự phòng
    window.moveStorySlide = moveStorySlide;

    // Gán Event Listener trực tiếp cho 2 nút mũi tên
    const btnPrev = document.getElementById('btn-story-prev');
    const btnNext = document.getElementById('btn-story-next');
    if (btnPrev) {
        btnPrev.addEventListener('click', (e) => {
            e.preventDefault();
            moveStorySlide(-1);
        });
    }
    if (btnNext) {
        btnNext.addEventListener('click', (e) => {
            e.preventDefault();
            moveStorySlide(1);
        });
    }

    startStoryTimer();
}

// ----------------------------------------------------
// FETCH HOME BLOG CAROUSEL
// ----------------------------------------------------
async function initHomeBlog() {
    const carousel = document.getElementById('home-blog-carousel');
    const dotsContainer = document.getElementById('home-blog-dots');
    if (!carousel || !dotsContainer) return;

    try {
        const q = query(collection(db, "news"), orderBy("createdAt", "desc"), limit(6));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            document.querySelector('.home-blog-section').style.display = 'none';
            return;
        }

        let html = '';
        let dotHtml = '';
        let index = 0;
        
        querySnapshot.forEach(doc => {
            const article = doc.data();
            const date = article.createdAt ? new Date(article.createdAt.toDate()).toLocaleDateString('vi-VN') : '';
            
            // Create a temporary element to extract text from HTML content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = article.content || '';
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            const excerpt = textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent;

            html += `
                <a href="blog/article.html?id=${doc.id}" class="home-blog-card">
                    <div class="home-blog-img-wrapper">
                        <img src="${article.imageUrl}" alt="${article.title}" loading="lazy">
                        <div class="home-blog-overlay">
                            <div class="home-blog-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
                            </div>
                        </div>
                    </div>
                    <div class="home-blog-content">
                        <h3>${article.title}</h3>
                        <p class="home-blog-excerpt">${excerpt}</p>
                        <span class="home-blog-meta">${date} | Blog</span>
                    </div>
                </a>
            `;
            
            // We'll create one dot per item. In a scroll snap, you can't easily sync dots perfectly
            // without IntersectionObserver, but since there are 6 items, we can try.
            dotHtml += `<div class="home-blog-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`;
            index++;
        });

        carousel.innerHTML = html;
        dotsContainer.innerHTML = dotHtml;

        const cards = carousel.querySelectorAll('.home-blog-card');
        const dots = dotsContainer.querySelectorAll('.home-blog-dot');

        if (cards.length === 0) return;

        // Auto Scroll Logic
        let currentItem = 0;
        let autoScrollInterval;
        
        const scrollToIndex = (idx) => {
            if (idx >= cards.length) idx = 0;
            if (idx < 0) idx = cards.length - 1;
            currentItem = idx;
            
            // scroll behavior
            const cardWidth = cards[0].offsetWidth + 30; // 30 is the gap
            carousel.scrollTo({
                left: cardWidth * currentItem,
                behavior: 'smooth'
            });
            
            // update dots
            dots.forEach(d => d.classList.remove('active'));
            if(dots[currentItem]) dots[currentItem].classList.add('active');
        };

        const startAutoScroll = () => {
            autoScrollInterval = setInterval(() => {
                scrollToIndex(currentItem + 1);
            }, 5000);
        };
        
        const stopAutoScroll = () => {
            if(autoScrollInterval) clearInterval(autoScrollInterval);
        };

        startAutoScroll();

        // Pause on hover
        carousel.addEventListener('mouseenter', stopAutoScroll);
        carousel.addEventListener('mouseleave', startAutoScroll);

        // Dot clicks
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                stopAutoScroll();
                scrollToIndex(idx);
                startAutoScroll();
            });
        });
        
        // Update dots on manual scroll using IntersectionObserver
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const idx = Array.from(cards).indexOf(entry.target);
                    if (idx !== -1) {
                        currentItem = idx;
                        dots.forEach(d => d.classList.remove('active'));
                        if(dots[currentItem]) dots[currentItem].classList.add('active');
                    }
                }
            });
        }, {
            root: carousel,
            threshold: 0.5
        });
        
        cards.forEach(card => observer.observe(card));

    } catch (error) {
        console.error("Lỗi khi tải Blog:", error);
    }
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
    initStorySlider();
    initHomeBlog();
    
    // Khởi tạo tìm kiếm ở trang chủ
    initAutocomplete('home-search-input', 'home-search-suggestions', './');
});
      
