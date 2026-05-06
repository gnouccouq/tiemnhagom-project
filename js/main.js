// js/main.js
import { 
    db, auth, toggleFavoriteLogic, initHeader, renderProductCard, initAutocomplete 
} from "./utils.js";
import { collection, getDocs, doc, getDoc, query, where, setDoc, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Hàm toggle yêu thích
window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.add('heartbeat-anim');
    setTimeout(() => btn.classList.remove('heartbeat-anim'), 400);
    await toggleFavoriteLogic(productId, () => {
        fetchFeaturedProducts();
        fetchSaleProducts();
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

        // TỐI ƯU: Chỉ lấy 10 sản phẩm mới nhất thay vì toàn bộ collection
        const q = query(collection(db, "products"), orderBy("updatedAt", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        
        let htmlContent = ''; // Sử dụng biến tạm để tối ưu hiệu suất

        // Lấy danh sách yêu thích để hiển thị icon đúng
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        querySnapshot.forEach((doc) => {
            htmlContent += renderProductCard(doc.data(), doc.id, favs, 'product/index.html');
        });
        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm nào.</p>';
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm lấy sản phẩm đang giảm giá
async function fetchSaleProducts() {
    const saleSection = document.getElementById('sale-section');
    const saleGrid = document.getElementById('sale-product-grid');

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
        const q = query(collection(db, "products"), where("sale", ">", 0));
        const querySnapshot = await getDocs(q);
        
        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        let htmlContent = '';
        querySnapshot.forEach((doc) => {
            htmlContent += renderProductCard(doc.data(), doc.id, favs, 'product/index.html');
        });

        if (htmlContent) {
            saleGrid.innerHTML = htmlContent;
            saleSection.style.display = 'block';
        }
    } catch (error) {
        console.error("Lỗi lấy sản phẩm sale:", error);
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
            // Không hiện lại sản phẩm đã nằm trong lịch sử xem gần đây
            if (!historyIds.slice(0, 4).includes(doc.id)) {
                htmlContent += renderProductCard(doc.data(), doc.id, [], 'product/index.html');
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
            { imageUrl: 'Asset/images/hero-bg.jpg', title: 'Gốm & Decor', subtitle: 'Khám phá bộ sưu tập ly chén, bình hoa gốm thủ công tinh xảo.', link: 'products/' },
            { imageUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?q=80&w=1600', title: 'Nghệ thuật của Đất', subtitle: 'Mang hơi thở thiên nhiên vào ngôi nhà của bạn.', link: 'products/' }
        ];
    }

    // Inject HTML
    container.innerHTML = slidesData.map((s, idx) => {
        const hasContent = s.title || s.subtitle || s.link;
        const slideInner = `
            <img src="${s.imageUrl}" alt="${s.title || 'Banner Tiệm Nhà Gốm'}" ${idx === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
            ${hasContent ? `
                <div class="hero-content">
                    ${s.title ? `<h1>${s.title}</h1>` : ''}
                    ${s.subtitle ? `<p>${s.subtitle}</p>` : ''}
                    ${s.link ? `<span class="btn-dark btn-hero-cta">Xem chi tiết</span>` : ''}
                </div>
            ` : ''}`;
        
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
        clearInterval(slideInterval);
    };

    const handleEnd = (e) => {
        const endX = e.type.includes('mouse') ? e.pageX : e.changedTouches[0].clientX;
        const diff = startX - endX;

        if (Math.abs(diff) > 10) preventClick = true; // Nếu di chuyển hơn 10px thì coi như là đang kéo, chặn click

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                showSlide((currentIndex + 1) % slides.length);
            } else {
                showSlide((currentIndex - 1 + slides.length) % slides.length);
            }
        }
        startAutoSlide();
    };

    // Chặn chuyển trang nếu người dùng đang thực hiện thao tác kéo slide
    slides.forEach(slide => {
        slide.addEventListener('click', (e) => {
            if (preventClick) {
                e.preventDefault();
            }
        });
    });

    container.addEventListener('touchstart', handleStart, { passive: true });
    container.addEventListener('touchend', handleEnd, { passive: true });
    container.addEventListener('mousedown', handleStart);
    container.addEventListener('mouseup', handleEnd);

    // Khởi tạo slide đầu tiên và animation
    showSlide(0);

    dots.forEach((dot, idx) => {
        dot.onclick = () => {
            clearInterval(slideInterval);
            showSlide(idx);
            startAutoSlide();
        };
    });

    startAutoSlide();
}

// Chạy các hàm khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', () => {
    initHeader('./', (user) => {
        // Chỉ cần chạy logic lấy sản phẩm ở đây
        fetchSaleProducts();
        fetchFeaturedProducts();
        fetchRecommendations(); // Thêm dòng này
        initHeroCarousel();

        // Hiệu ứng Header trong suốt mượt mà khi cuộn trang (chỉ áp dụng cho Trang chủ)
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            const handleHeaderScroll = () => {
                // Nếu cuộn xuống quá 50px thì hiện màu trắng, ngược lại thì trong suốt
                if (window.scrollY > 50) {
                    navbar.classList.remove('transparent');
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.add('transparent');
                    navbar.classList.remove('scrolled');
                }
            };
            
            // Kiểm tra trạng thái ngay khi vừa load xong component
            handleHeaderScroll();
            // Lắng nghe sự kiện scroll của trình duyệt
            window.addEventListener('scroll', handleHeaderScroll, { passive: true });
        }

        // Hiệu ứng Animation khi cuộn trang (Scroll Reveal)
        const observerOptions = {
            threshold: 0.15 // Section hiện ra 15% thì mới bắt đầu chạy hiệu ứng
        };

        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    // Sau khi đã hiện rồi thì ngừng quan sát để tối ưu hiệu suất
                    revealObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);

        document.querySelectorAll('.reveal-on-scroll').forEach(section => {
            revealObserver.observe(section);
        });
    });
});
