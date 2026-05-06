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
function initHeroCarousel() {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.dot');
    const container = document.querySelector('.carousel-container');
    if (slides.length === 0 || !container) return;

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
    const threshold = 50; // Khoảng cách tối thiểu (pixel) để nhận diện hành động kéo

    const handleStart = (e) => {
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        clearInterval(slideInterval);
    };

    const handleEnd = (e) => {
        const endX = e.type.includes('mouse') ? e.pageX : e.changedTouches[0].clientX;
        const diff = startX - endX;

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                showSlide((currentIndex + 1) % slides.length);
            } else {
                showSlide((currentIndex - 1 + slides.length) % slides.length);
            }
        }
        startAutoSlide();
    };

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

// Logic cho Popup Tìm kiếm từ nút nổi
function setupSearchFloat() {
    const btnOpen = document.getElementById('btn-open-search-float');
    const overlay = document.getElementById('home-search-overlay');
    const btnClose = document.getElementById('btn-close-home-search');
    const input = document.getElementById('home-popup-search-input');

    if (!btnOpen || !overlay) return;

    btnOpen.onclick = () => {
        overlay.classList.add('active');
        input.focus();
    };

    btnClose.onclick = () => overlay.classList.remove('active');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };

    // Khởi tạo autocomplete trên input mới của popup
    initAutocomplete('home-popup-search-input', 'home-popup-search-suggestions', '');
}

// Chạy các hàm khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', () => {
    initHeader('./', (user) => {
        // Chỉ cần chạy logic lấy sản phẩm ở đây
        fetchSaleProducts();
        fetchFeaturedProducts();
        fetchRecommendations(); // Thêm dòng này
        initHeroCarousel();
        setupSearchFloat();

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
