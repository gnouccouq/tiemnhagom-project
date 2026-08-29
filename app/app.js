// app/app.js - Mobile Loyalty Logic for Tiệm Nhà Gốm
import { auth, db } from '../js/config.js';
import { 
    onAuthStateChanged, signOut, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signInWithPopup, GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Hạng thành viên Tiệm Nhà Gốm
const TIERS = [
    { name: "Thành viên mới", minSpend: 0, discount: 0, color: "#888888", bg: "#f0f0f0" },
    { name: "Đồng", minSpend: 1000000, discount: 2, color: "#cd7f32", bg: "rgba(205, 127, 50, 0.15)" },
    { name: "Bạc", minSpend: 3000000, discount: 3, color: "#a8a8a8", bg: "rgba(168, 168, 168, 0.15)" },
    { name: "Vàng", minSpend: 7000000, discount: 4, color: "#d4af37", bg: "rgba(212, 175, 55, 0.15)" },
    { name: "Kim Cương", minSpend: 15000000, discount: 5, color: "#3498db", bg: "rgba(52, 152, 219, 0.15)" }
];

// Danh sách voucher / quà tặng đổi điểm mẫu
const REWARDS_CATALOG = [
    {
        id: "rew-1",
        title: "Voucher Giảm 50.000đ",
        desc: "Áp dụng cho đơn hàng từ 300.000đ tại Tiệm Nhà Gốm",
        points: 50,
        image: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=300"
    },
    {
        id: "rew-2",
        title: "Tặng 01 Ly Gốm Mộc Nghệ Thuật",
        desc: "Món quà thủ công độc bản dành cho thành viên thân thiết",
        points: 150,
        image: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?q=80&w=300"
    },
    {
        id: "rew-3",
        title: "Voucher Giảm 15% Toàn Bộ Menu",
        desc: "Áp dụng 01 lần trong tháng sinh nhật hoặc dịp đặc biệt",
        points: 100,
        image: "https://images.unsplash.com/photo-1520408222757-6f9f95d87d5d?q=80&w=300"
    },
    {
        id: "rew-4",
        title: "Bộ Lót Ly Gốm Mộc Độc Bản",
        desc: "Bộ 2 lót ly thủ công khắc họa tiết thiên nhiên",
        points: 80,
        image: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?q=80&w=300"
    }
];

let currentUser = null;
let currentPoints = 0;
let currentSpent = 0;
let currentSlide = 0;
let slideInterval = null;
let isSignUpMode = false;

// Khởi tạo App
document.addEventListener('DOMContentLoaded', () => {
    initGreeting();
    initCarousel();
    initBottomSheet();
    initTabs();
    initAuthModal();
    initAuthListener();
    renderRewardsCatalog();
});


// 1. Chào hỏi theo thời gian thực (good morning / afternoon / evening)
function initGreeting() {
    const greetingEl = document.getElementById('greeting-text');
    if (!greetingEl) return;

    const hour = new Date().getHours();
    let timeGreeting = "good evening";
    if (hour >= 5 && hour < 12) timeGreeting = "good morning";
    else if (hour >= 12 && hour < 18) timeGreeting = "good afternoon";

    const userName = currentUser ? (currentUser.displayName || "gốm lover").toLowerCase() : "gốm lover";
    greetingEl.innerText = `${timeGreeting}, ${userName}`;
}

// 2. Carousel tự động trượt + vuốt cảm ứng (Swipe support)
function initCarousel() {
    const track = document.getElementById('carousel-track');
    const dots = document.querySelectorAll('.carousel-dot');
    const totalSlides = dots.length;

    function goToSlide(index) {
        currentSlide = (index + totalSlides) % totalSlides;
        if (track) track.style.transform = `translateX(-${currentSlide * 100}%)`;
        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentSlide);
        });
    }

    function startAutoSlide() {
        clearInterval(slideInterval);
        slideInterval = setInterval(() => {
            goToSlide(currentSlide + 1);
        }, 4500);
    }

    startAutoSlide();

    // Hỗ trợ vuốt tay trên Mobile (Touch swipe)
    let startX = 0;
    let currentX = 0;
    const viewport = document.getElementById('carousel-viewport');

    if (viewport) {
        viewport.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            clearInterval(slideInterval);
        }, { passive: true });

        viewport.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX;
        }, { passive: true });

        viewport.addEventListener('touchend', () => {
            const diff = startX - currentX;
            if (Math.abs(diff) > 45) {
                if (diff > 0) goToSlide(currentSlide + 1);
                else goToSlide(currentSlide - 1);
            }
            startAutoSlide();
        });
    }
}

// 3. Bottom Sheet / Drawer Modal
function initBottomSheet() {
    const pillBar = document.getElementById('pill-bottom-bar');
    const quickQr = document.getElementById('btn-quick-qr');
    const sheet = document.getElementById('app-bottom-sheet');
    const overlay = document.getElementById('sheet-overlay');
    const closeBtn = document.getElementById('btn-close-sheet');

    function openSheet() {
        sheet.classList.add('active');
        overlay.classList.add('active');
        generateMemberCodes();
    }

    function closeSheet() {
        sheet.classList.remove('active');
        overlay.classList.remove('active');
    }

    if (pillBar) pillBar.addEventListener('click', openSheet);
    if (quickQr) quickQr.addEventListener('click', (e) => {
        e.stopPropagation();
        openSheet();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeSheet);
    if (overlay) overlay.addEventListener('click', closeSheet);
}

// 4. Quản lý Tabs trong Sheet (QR Code, Đổi Ưu Đãi, Lịch Sử)
function initTabs() {
    const tabBtns = document.querySelectorAll('.app-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.dataset.tab;
            document.querySelectorAll('.tab-pane-content').forEach(pane => {
                pane.style.display = pane.id === targetId ? 'block' : 'none';
            });
        });
    });
}

// 4.1 Quản lý Modal Đăng nhập / Đăng ký (Khớp chính xác hình ảnh mẫu)
function initAuthModal() {
    const backdrop = document.getElementById('auth-modal-backdrop');
    const closeBtn = document.getElementById('btn-close-auth-modal');
    const toggleModeBtn = document.getElementById('btn-toggle-auth-mode');
    const titleText = document.getElementById('auth-title-text');
    const nameFieldGroup = document.getElementById('group-name-field');
    const submitBtnLabel = document.getElementById('btn-auth-submit-label');
    const authForm = document.getElementById('app-auth-form');
    const googleBtn = document.getElementById('btn-google-auth-trigger');
    const forgotBtn = document.getElementById('btn-forgot-password');
    const passInput = document.getElementById('auth-input-password');
    const togglePassBtn = document.getElementById('btn-toggle-password-visibility');

    // Mở / Đóng modal
    window.openAuthModal = (signUp = false) => {
        isSignUpMode = signUp;
        updateAuthModeUI();
        if (backdrop) backdrop.classList.add('active');
    };

    window.closeAuthModal = () => {
        if (backdrop) backdrop.classList.remove('active');
    };

    if (closeBtn) closeBtn.addEventListener('click', window.closeAuthModal);

    // Chuyển đổi giữa Đăng nhập (Sign in) và Đăng ký (Sign up)
    function updateAuthModeUI() {
        if (isSignUpMode) {
            titleText.innerHTML = `create account,<br><span>join our ceramic club!</span>`;
            toggleModeBtn.innerText = "sign in";
            submitBtnLabel.innerText = "create account";
            nameFieldGroup.style.display = "block";
            if (forgotBtn) forgotBtn.style.display = "none";
        } else {
            titleText.innerHTML = `welcome back,<br><span>we've missed you!</span>`;
            toggleModeBtn.innerText = "sign up";
            submitBtnLabel.innerText = "sign in";
            nameFieldGroup.style.display = "none";
            if (forgotBtn) forgotBtn.style.display = "block";
        }
    }

    if (toggleModeBtn) {
        toggleModeBtn.addEventListener('click', () => {
            isSignUpMode = !isSignUpMode;
            updateAuthModeUI();
        });
    }

    // Toggle ẩn/hiện mật khẩu
    if (togglePassBtn && passInput) {
        togglePassBtn.addEventListener('click', () => {
            const isPass = passInput.type === 'password';
            passInput.type = isPass ? 'text' : 'password';
        });
    }

    // Xử lý Đăng nhập / Đăng ký qua Email & Password
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-input-email').value.trim();
            const password = document.getElementById('auth-input-password').value;
            const name = document.getElementById('auth-input-name')?.value.trim();

            submitBtnLabel.disabled = true;
            submitBtnLabel.innerText = "...";

            try {
                if (isSignUpMode) {
                    const cred = await createUserWithEmailAndPassword(auth, email, password);
                    if (name && cred.user) {
                        await updateProfile(cred.user, { displayName: name });
                    }
                    showToast("Tạo tài khoản thành công!");
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                    showToast("Đăng nhập thành công!");
                }
                window.closeAuthModal();
            } catch (err) {
                console.error("Auth error:", err);
                let message = "Đã xảy ra lỗi. Vui lòng thử lại.";
                if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') message = "Sai email hoặc mật khẩu";
                else if (err.code === 'auth/user-not-found') message = "Tài khoản không tồn tại";
                else if (err.code === 'auth/email-already-in-use') message = "Email này đã được đăng ký";
                else if (err.code === 'auth/weak-password') message = "Mật khẩu cần ít nhất 6 ký tự";
                showToast(message);
            } finally {
                submitBtnLabel.disabled = false;
                submitBtnLabel.innerText = isSignUpMode ? "create account" : "sign in";
            }
        });
    }

    // Xử lý Đăng nhập qua Google (Hỗ trợ cả Web, Mobile PWA & Capacitor Native)
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            try {
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await signInWithPopup(auth, provider);
                showToast("Đăng nhập Google thành công!");
                window.closeAuthModal();
            } catch (err) {
                console.error("Google Auth error:", err);
                showToast("Đăng nhập Google thất bại");
            }
        });
    }

    // Quên mật khẩu
    if (forgotBtn) {
        forgotBtn.addEventListener('click', async () => {
            const email = document.getElementById('auth-input-email').value.trim();
            if (!email) {
                showToast("Vui lòng điền email vào ô phía trên");
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                showToast("Đã gửi link đặt lại mật khẩu đến email");
            } catch (err) {
                showToast("Lỗi gửi email đặt lại mật khẩu");
            }
        });
    }
}

// 5. Lắng nghe trạng thái đăng nhập Firebase
function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        initGreeting();

        const authBtn = document.getElementById('btn-app-auth-action');
        const userAvatar = document.getElementById('app-user-avatar');

        if (user) {
            // Nếu đã đăng nhập thành công thì ẩn modal đăng nhập
            if (window.closeAuthModal) window.closeAuthModal();

            if (userAvatar) userAvatar.src = user.photoURL || '../Asset/images/default-avatar.png';
            if (authBtn) {
                authBtn.innerText = "Đăng xuất tài khoản";
                authBtn.onclick = async () => {
                    await signOut(auth);
                    showToast("Đã đăng xuất");
                    if (window.openAuthModal) window.openAuthModal(false);
                };
            }
            await fetchUserData(user);
        } else {
            // Chưa đăng nhập -> tự động hiện modal đăng nhập
            if (window.openAuthModal) window.openAuthModal(false);
            if (userAvatar) userAvatar.src = '../Asset/images/default-avatar.png';
            if (authBtn) {
                authBtn.innerText = "Đăng nhập với Google / Email";
                authBtn.onclick = () => {
                    if (window.openAuthModal) window.openAuthModal(false);
                };
            }
            updateTierAndProgress(0);
        }
    });
}

// 6. Lấy dữ liệu chi tiêu, điểm tích lũy và lịch sử đơn hàng từ Firestore
async function fetchUserData(user) {
    try {
        let totalSpent = 0;
        let points = 0;
        let vouchersCount = 0;

        // Lấy thông tin user document
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let phone = "";

        if (userSnap.exists()) {
            const data = userSnap.data();
            phone = data.phone || "";
            points = data.points || 0;
            if (data.vouchers && Array.isArray(data.vouchers)) {
                vouchersCount = data.vouchers.length;
            }
        }

        // Truy vấn đơn hàng đã hoàn thành để tính tổng chi tiêu thực tế
        const ordersRef = collection(db, "orders");
        let orderDocs = [];

        // Tìm theo UID
        const qUid = query(ordersRef, where("userId", "==", user.uid));
        const snapUid = await getDocs(qUid);
        snapUid.forEach(d => orderDocs.push({ id: d.id, ...d.data() }));

        // Nếu có số điện thoại, gộp thêm đơn đặt theo số điện thoại
        if (phone) {
            const phoneClean = phone.replace(/\D/g, '');
            const phone84 = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;
            const qPhone = query(ordersRef, where("phone", "in", [phone, phoneClean, phone84]));
            const snapPhone = await getDocs(qPhone);
            snapPhone.forEach(d => {
                if (!orderDocs.some(existing => existing.id === d.id)) {
                    orderDocs.push({ id: d.id, ...d.data() });
                }
            });
        }

        // Tính tổng chi tiêu từ các đơn hoàn thành
        orderDocs.forEach(order => {
            const status = (order.status || '').toLowerCase();
            if (status.includes('hoàn thành') || status.includes('thành công') || status.includes('completed')) {
                totalSpent += (order.totalAmount || 0);
            }
        });

        // Điểm mặc định = 1 điểm cho mỗi 100.000đ chi tiêu nếu chưa có custom points
        if (points === 0 && totalSpent > 0) {
            points = Math.floor(totalSpent / 100000);
        }

        currentPoints = points;
        currentSpent = totalSpent;

        // Cập nhật lên UI
        updateTierAndProgress(totalSpent, points, vouchersCount);
        renderHistory(orderDocs);
    } catch (err) {
        console.error("Lỗi khi tải dữ liệu người dùng:", err);
    }
}

// 7. Cập nhật hạng thẻ và thanh tiến trình
function updateTierAndProgress(spent, points = 0, vouchers = 0) {
    let currentTier = TIERS[0];
    let nextTier = TIERS[1];

    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (spent >= TIERS[i].minSpend) {
            currentTier = TIERS[i];
            nextTier = TIERS[i + 1] || null;
            break;
        }
    }

    // Cập nhật thanh floating bottom bar
    const barTier = document.getElementById('bar-tier-name');
    const barPoints = document.getElementById('bar-points-val');
    const barRewards = document.getElementById('bar-rewards-val');

    if (barTier) barTier.innerText = currentTier.name.toLowerCase();
    if (barPoints) barPoints.innerText = points;
    if (barRewards) barRewards.innerText = vouchers || REWARDS_CATALOG.length;

    // Cập nhật card membership trong drawer
    const cardTierBadge = document.getElementById('card-tier-badge');
    const cardPointsTotal = document.getElementById('card-points-total');
    const cardSpent = document.getElementById('card-spent-accumulated');
    const cardNextHint = document.getElementById('card-next-tier-hint');
    const cardProgress = document.getElementById('card-progress-fill');

    if (cardTierBadge) cardTierBadge.innerText = currentTier.name.toUpperCase();
    if (cardPointsTotal) cardPointsTotal.innerText = points;
    if (cardSpent) cardSpent.innerText = `Đã chi: ${new Intl.NumberFormat('vi-VN').format(spent)}đ`;

    if (nextTier) {
        const remaining = nextTier.minSpend - spent;
        if (cardNextHint) cardNextHint.innerText = `Chi thêm ${new Intl.NumberFormat('vi-VN').format(remaining)}đ lên ${nextTier.name}`;
        const prevSpend = currentTier.minSpend;
        const progressPct = Math.min(100, Math.max(10, ((spent - prevSpend) / (nextTier.minSpend - prevSpend)) * 100));
        if (cardProgress) cardProgress.style.width = `${progressPct}%`;
    } else {
        if (cardNextHint) cardNextHint.innerText = `Hạng cao nhất (${currentTier.name})`;
        if (cardProgress) cardProgress.style.width = `100%`;
    }
}

// 8. Sinh mã QR & Barcode định danh thành viên
function generateMemberCodes() {
    const memberCode = currentUser 
        ? `TNG-${(currentUser.uid || "").substring(0, 8).toUpperCase()}`
        : "TNG-GUEST01";

    const codeLabel = document.getElementById('qr-member-code');
    if (codeLabel) codeLabel.innerText = memberCode;

    // Sinh QR Code
    const qrCanvas = document.getElementById('qr-canvas');
    if (qrCanvas && window.QRCode) {
        QRCode.toCanvas(qrCanvas, memberCode, {
            width: 170,
            margin: 1,
            color: {
                dark: '#1a1a19',
                light: '#ffffff'
            }
        }, (err) => {
            if (err) console.error("Lỗi tạo QR:", err);
        });
    }

    // Sinh Barcode
    const barcodeSvg = document.getElementById('barcode-svg');
    if (barcodeSvg && window.JsBarcode) {
        try {
            JsBarcode(barcodeSvg, memberCode, {
                format: "CODE128",
                width: 1.6,
                height: 45,
                displayValue: false,
                lineColor: "#1a1a19",
                background: "transparent",
                margin: 0
            });
        } catch (e) {
            console.error("Lỗi tạo Barcode:", e);
        }
    }
}

// 9. Hiển thị danh mục đổi quà/voucher
function renderRewardsCatalog() {
    const container = document.getElementById('reward-items-container');
    if (!container) return;

    container.innerHTML = REWARDS_CATALOG.map(item => `
        <div class="reward-card-item">
            <img src="${item.image}" alt="${item.title}" class="reward-card-img">
            <div class="reward-card-details">
                <h5>${item.title}</h5>
                <p>${item.desc}</p>
                <div class="reward-card-cost">${item.points} G-Points</div>
            </div>
            <button class="reward-claim-btn" onclick="window.claimReward('${item.id}', ${item.points})">
                Đổi ngay
            </button>
        </div>
    `).join('');
}

// Xử lý đổi quà
window.claimReward = (rewardId, pointsRequired) => {
    if (!currentUser) {
        showToast("Vui lòng đăng nhập để đổi quà");
        return;
    }
    if (currentPoints < pointsRequired) {
        showToast(`Bạn cần thêm ${pointsRequired - currentPoints} điểm để đổi quà này`);
        return;
    }
    showToast("Đổi voucher thành công! Mã đã lưu vào ví quà");
};

// 10. Hiển thị lịch sử tích/tiêu điểm & giao dịch
function renderHistory(orders) {
    const container = document.getElementById('history-items-container');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #888; padding: 20px; font-size: 0.85rem;">Chưa có giao dịch tích điểm nào.</div>`;
        return;
    }

    container.innerHTML = orders.map(order => {
        const date = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleDateString('vi-VN') : 'Gần đây';
        const pointsEarned = Math.floor((order.totalAmount || 0) / 100000);
        return `
            <div style="background: #fff; border-radius: 14px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                <div>
                    <h6 style="font-size: 0.85rem; font-weight: 600; color: #1a1a19; margin-bottom: 2px;">Đơn hàng #${(order.id || '').substring(0, 7)}</h6>
                    <span style="font-size: 0.72rem; color: #888;">${date} • ${new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0)}đ</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: #27ae60;">+${pointsEarned} pts</span>
                </div>
            </div>
        `;
    }).join('');
}

// Toast thông báo nhỏ
function showToast(msg) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}
