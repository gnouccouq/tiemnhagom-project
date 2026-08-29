import { auth, db } from '../js/config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { applyAppLanguage } from './i18n.js';

const TIERS = [
    { name: "Thành viên mới", minSpend: 0 },
    { name: "Đồng", minSpend: 1000000 },
    { name: "Bạc", minSpend: 3000000 },
    { name: "Vàng", minSpend: 7000000 },
    { name: "Kim Cương", minSpend: 15000000 }
];

let currentSlide = 0;
let slideInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    applyAppLanguage();
    initGreeting();
    initNetworkMonitor();
    
    // Tải song song dữ liệu Firebase
    try {
        await Promise.allSettled([
            loadHeroBannersFromFirebase(),
            loadNewsAndEventsFromFirebase()
        ]);
    } finally {
        hideSplashScreen();
    }

    initScrollToFeed();
    initAuthObserver();
});

function hideSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (splash) {
        splash.classList.add('fade-out');
    }
}

function initNetworkMonitor() {
    const splash = document.getElementById('app-splash-screen');
    const subText = document.getElementById('splash-sub-text');

    window.addEventListener('offline', () => {
        if (splash) {
            if (subText) subText.innerText = "Đang kết nối lại mạng...";
            splash.classList.remove('fade-out');
        }
    });

    window.addEventListener('online', () => {
        if (splash) {
            if (subText) subText.innerText = "Đã kết nối";
            setTimeout(() => {
                splash.classList.add('fade-out');
                if (subText) subText.innerText = "ceramics & craft decor";
            }, 600);
        }
    });
}



// Xử lý bấm mũi tên thì tự động cuộn chuyển đổi giữa Banner và News & Events
function initScrollToFeed() {
    const triggerBtn = document.getElementById('btn-toggle-news-drawer');
    const scrollContainer = document.getElementById('home-vertical-scroll');
    const feedSection = document.getElementById('news-events-feed');
    const heroSection = document.querySelector('.home-hero-section');
    const notifBtn = document.getElementById('btn-notifications');

    let isAtBlog = false;

    if (triggerBtn && feedSection && scrollContainer) {
        triggerBtn.addEventListener('click', () => {
            if (isAtBlog) {
                // Đang ở blog -> Cuộn ngược lên đầu banner
                if (heroSection) heroSection.scrollIntoView({ behavior: 'smooth' });
                else scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                // Đang ở banner -> Cuộn xuống blog
                feedSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (scrollContainer && notifBtn && triggerBtn) {
        scrollContainer.addEventListener('scroll', () => {
            const isScrolledDown = scrollContainer.scrollTop > 100;
            isAtBlog = isScrolledDown;

            // Xoay ngược mũi tên 180 độ khi đang ở blog
            triggerBtn.classList.toggle('flipped', isScrolledDown);

            // Ẩn icon chuông thông báo khi ở blog
            if (isScrolledDown) {
                notifBtn.style.opacity = '0';
                notifBtn.style.pointerEvents = 'none';
                notifBtn.style.transform = 'scale(0.8)';
            } else {
                notifBtn.style.opacity = '1';
                notifBtn.style.pointerEvents = 'auto';
                notifBtn.style.transform = 'scale(1)';
            }
        }, { passive: true });
    }

    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            showToast("Bạn không có thông báo mới nào");
        });
    }
}





// Nạp danh sách bài viết / sự kiện News & Events từ Firestore
async function loadNewsAndEventsFromFirebase() {
    const container = document.getElementById('feed-cards-container');
    if (!container) return;

    let items = [];
    try {
        const { collection, query, orderBy, limit, getDocs } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
        const q = query(collection(db, "news"), orderBy("createdAt", "desc"), limit(6));
        const snap = await getDocs(q);
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn("Lỗi tải tin tức:", e);
    }

    // Dữ liệu mẫu khớp ảnh chụp nếu Firestore rỗng
    if (items.length === 0) {
        items = [
            {
                id: "item-1",
                title: "Enjoy 10% off all items",
                imageUrl: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?q=80&w=600",
                link: "../products/"
            },
            {
                id: "item-2",
                title: "a better price tag",
                imageUrl: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?q=80&w=600",
                link: "../products/"
            },
            {
                id: "item-3",
                title: "la mer napkin",
                imageUrl: "https://images.unsplash.com/photo-1520408222757-6f9f95d87d5d?q=80&w=600",
                link: "../products/"
            }
        ];
    }

    container.innerHTML = items.map(item => {
        const detailLink = `./article.html?id=${item.id || 'item-2'}`;
        return `
            <a href="${detailLink}" class="feed-card-item">
                <div class="feed-card-img-wrap">
                    <img src="${item.imageUrl || '../Asset/images/hero-bg.webp'}" alt="${item.title || 'Tin tức'}" loading="lazy">
                </div>
                <div class="feed-card-content">
                    <h4 class="feed-card-title">${item.title || ''}</h4>
                </div>
            </a>
        `;
    }).join('');
}



function initGreeting() {
    const greetingEl = document.getElementById('greeting-text');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let timeGreeting = "good evening";
    if (hour >= 5 && hour < 12) timeGreeting = "good morning";
    else if (hour >= 12 && hour < 18) timeGreeting = "good afternoon";
    greetingEl.innerText = `${timeGreeting}, gốm lover`;
}

// Nạp toàn bộ danh sách Banner từ Firestore (settings/banners)
async function loadHeroBannersFromFirebase() {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!track || !dotsContainer) return;

    let slides = [];
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, "settings", "banners"));
        if (snap.exists()) {
            slides = snap.data().slides || [];
        }
    } catch (e) {
        console.warn("Lỗi tải banners:", e);
    }

    if (slides.length === 0) {
        slides = [
            { imageUrl: '../Asset/images/hero-bg.webp', mobileImageUrl: '../Asset/images/hero-bg.webp', title: 'Mộc mạc & Tinh tế', tag: 'Thành viên Gốm', desc: 'Tích điểm nhận đặc quyền nâng hạng và ưu đãi vĩnh viễn.' }
        ];
    }

    track.innerHTML = slides.map(s => {
        const imgSrc = s.mobileImageUrl || s.imageUrl;
        return `
            <div class="carousel-slide">
                <img src="${imgSrc}" alt="Tiệm Nhà Gốm">
            </div>
        `;
    }).join('');


    dotsContainer.innerHTML = slides.map((_, idx) => `
        <div class="carousel-dot ${idx === 0 ? 'active' : ''}"></div>
    `).join('');

    initCarousel(slides.length);
}

function initCarousel(totalSlides) {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    const viewport = document.getElementById('carousel-viewport');
    if (!track || !viewport || totalSlides === 0) return;

    let isDragging = false;
    let startX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationId = null;

    function getPositionX(e) {
        return e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
    }

    function setPositionByIndex() {
        const slideWidth = viewport.getBoundingClientRect().width || window.innerWidth;
        currentTranslate = -currentSlide * slideWidth;
        prevTranslate = currentTranslate;
        track.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
        track.style.transform = `translateX(${currentTranslate}px)`;
        updateDots();
    }

    function updateDots() {
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentSlide);
        });
    }

    function startAutoSlide() {
        clearInterval(slideInterval);
        if (totalSlides > 1) {
            slideInterval = setInterval(() => {
                currentSlide = (currentSlide + 1) % totalSlides;
                setPositionByIndex();
            }, 4500);
        }
    }

    // Xử lý khi xoay màn hình hoặc resize viewport
    window.addEventListener('resize', () => {
        setPositionByIndex();
    }, { passive: true });

    setPositionByIndex();
    startAutoSlide();


    // Touch & Mouse Event Handlers
    function touchStart(e) {
        clearInterval(slideInterval);
        isDragging = true;
        startX = getPositionX(e);
        track.style.transition = 'none'; // Bỏ transition để bám theo ngón tay/chuột lập tức
        animationId = requestAnimationFrame(animation);
    }

    function touchMove(e) {
        if (!isDragging) return;
        const currentX = getPositionX(e);
        const diff = currentX - startX;
        currentTranslate = prevTranslate + diff;
    }

    function touchEnd() {
        if (!isDragging) return;
        isDragging = false;
        cancelAnimationFrame(animationId);

        const movedBy = currentTranslate - prevTranslate;

        // Nếu vuốt quá 50px thì đổi slide
        if (movedBy < -50 && currentSlide < totalSlides - 1) {
            currentSlide += 1;
        } else if (movedBy > 50 && currentSlide > 0) {
            currentSlide -= 1;
        } else if (movedBy < -50 && currentSlide === totalSlides - 1) {
            // Cuộn vòng lại đầu
            currentSlide = 0;
        } else if (movedBy > 50 && currentSlide === 0) {
            // Cuộn vòng về cuối
            currentSlide = totalSlides - 1;
        }

        setPositionByIndex();
        startAutoSlide();
    }

    function animation() {
        track.style.transform = `translateX(${currentTranslate}px)`;
        if (isDragging) requestAnimationFrame(animation);
    }

    // Touch events (Điện thoại)
    viewport.addEventListener('touchstart', touchStart, { passive: true });
    viewport.addEventListener('touchmove', touchMove, { passive: true });
    viewport.addEventListener('touchend', touchEnd);

    // Mouse events (Kéo chuột trên PC)
    viewport.addEventListener('mousedown', touchStart);
    viewport.addEventListener('mousemove', touchMove);
    viewport.addEventListener('mouseup', touchEnd);
    viewport.addEventListener('mouseleave', () => {
        if (isDragging) touchEnd();
    });

    // Bấm vào dots để chuyển slide
    dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, idx) => {
        dot.addEventListener('click', () => {
            currentSlide = idx;
            setPositionByIndex();
            startAutoSlide();
        });
    });

    // Resize viewport
    window.addEventListener('resize', setPositionByIndex);

    // Bắt đầu
    setPositionByIndex();
    startAutoSlide();
}



function initAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        const avatar = document.getElementById('app-user-avatar');
        const greeting = document.getElementById('greeting-text');
        const barTier = document.getElementById('bar-tier-name');
        const barPoints = document.getElementById('bar-points-val');
        const barRewards = document.getElementById('bar-rewards-val');

        if (user) {
            if (avatar) avatar.src = user.photoURL || '../Asset/images/default-avatar.png';
            const hour = new Date().getHours();
            let timeGreeting = "good evening";
            if (hour >= 5 && hour < 12) timeGreeting = "good morning";
            else if (hour >= 12 && hour < 18) timeGreeting = "good afternoon";
            if (greeting) greeting.innerText = `${timeGreeting}, ${(user.displayName || "gốm lover").toLowerCase()}`;

            // Lấy dữ liệu chi tiêu & điểm
            try {
                let totalSpent = 0;
                let points = 0;
                let vouchersCount = 4;

                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                let phone = "";
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    phone = data.phone || "";
                    points = data.points || 0;
                    if (data.vouchers && Array.isArray(data.vouchers)) vouchersCount = data.vouchers.length;
                }

                const ordersRef = collection(db, "orders");
                const qUid = query(ordersRef, where("userId", "==", user.uid));
                const snapUid = await getDocs(qUid);
                snapUid.forEach(d => {
                    const o = d.data();
                    const s = (o.status || '').toLowerCase();
                    if (s.includes('hoàn thành') || s.includes('thành công') || s.includes('completed')) {
                        totalSpent += (o.totalAmount || 0);
                    }
                });

                // Quét danh sách Voucher từ Firestore 'coupons' collection đồng bộ với ví voucher
                let validVouchers = [];
                try {
                    const couponsRef = collection(db, "coupons");
                    const snapCoupons = await getDocs(couponsRef);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    snapCoupons.forEach(d => {
                        const cData = d.data();
                        const code = d.id;

                        // Bỏ qua mã đã hết hạn
                        if (cData.expiryDate) {
                            const exp = new Date(cData.expiryDate);
                            if (exp < today) return;
                        }

                        // Bỏ qua mã đạt giới hạn sử dụng
                        if (cData.limit && cData.usedCount >= cData.limit) return;

                        // Kiểm tra nếu mã dành riêng cho khách
                        if (cData.assignedTo) {
                            const assignedArr = Array.isArray(cData.assignedTo) ? cData.assignedTo : [cData.assignedTo];
                            const isForUser = assignedArr.some(id => id === user.uid || (phone && id === phone) || id === user.email);
                            if (!isForUser) return;
                        }

                        validVouchers.push({ code, ...cData });
                    });
                    vouchersCount = validVouchers.length;
                } catch (err) {
                    console.error("Lỗi đếm vouchers:", err);
                }

                let currentTier = TIERS[0];
                for (let i = TIERS.length - 1; i >= 0; i--) {
                    if (totalSpent >= TIERS[i].minSpend) {
                        currentTier = TIERS[i];
                        break;
                    }
                }

                if (points === 0 && totalSpent > 0) points = Math.floor(totalSpent / 100000);

                if (barTier) barTier.innerText = currentTier.name.toLowerCase();
                if (barPoints) barPoints.innerText = points;
                if (barRewards) barRewards.innerText = vouchersCount;

            } catch (e) {
                console.error(e);
            }
        } else {
            // Khách vãng lai
            if (barTier) barTier.innerText = "thành viên mới";
            if (barPoints) barPoints.innerText = "0";
            if (barRewards) barRewards.innerText = "0";
        }
    });
}
