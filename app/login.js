import { auth, db } from '../js/config.js';
import { 
    onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signInWithPopup, GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { applyAppLanguage, getCurrentLanguage, I18N_DICTIONARY } from './i18n.js';

let isSignUpMode = false;

document.addEventListener('DOMContentLoaded', () => {
    applyAppLanguage();
    // Tải banner mobile từ Firebase Firestore
    loadFirebaseBanner();

    // Nếu đã đăng nhập thì tự động chuyển thẳng vào home.html
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.href = './home.html';
        }
    });

    const toggleModeBtn = document.getElementById('btn-toggle-auth-mode');
    const mainTitle = document.getElementById('auth-main-title');
    const subTitle = document.getElementById('auth-sub-title');
    const nameFieldGroup = document.getElementById('group-name-field');
    const submitBtnLabel = document.getElementById('btn-auth-submit-label');
    const authForm = document.getElementById('app-auth-form');
    const googleBtn = document.getElementById('btn-google-auth-trigger');
    const forgotBtn = document.getElementById('btn-forgot-password');
    const passInput = document.getElementById('auth-input-password');
    const togglePassBtn = document.getElementById('btn-toggle-password-visibility');

    // Chuyển đổi giữa Đăng nhập & Đăng ký (Đồng bộ từ điển i18n)
    function updateAuthModeUI() {
        const lang = getCurrentLanguage();
        const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY['tiếng việt'];

        if (isSignUpMode) {
            if (mainTitle) mainTitle.innerText = dict.auth_signup_title || 'tạo tài khoản mới,';
            if (subTitle) subTitle.innerText = dict.auth_signup_sub || 'trở thành hội viên gốm mộc!';
            if (toggleModeBtn) toggleModeBtn.innerText = dict.auth_sign_in || 'đăng nhập';
            if (submitBtnLabel) submitBtnLabel.innerText = dict.auth_create_account || 'tạo tài khoản';
            if (nameFieldGroup) nameFieldGroup.style.display = "block";
            if (forgotBtn) forgotBtn.style.display = "none";
        } else {
            if (mainTitle) mainTitle.innerText = dict.auth_welcome_title || 'chào mừng bạn trở lại,';
            if (subTitle) subTitle.innerText = dict.auth_welcome_sub || 'tiệm rất nhớ bạn!';
            if (toggleModeBtn) toggleModeBtn.innerText = dict.auth_sign_up || 'đăng ký';
            if (submitBtnLabel) submitBtnLabel.innerText = dict.auth_sign_in || 'đăng nhập';
            if (nameFieldGroup) nameFieldGroup.style.display = "none";
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

    // Submit form đăng nhập / đăng ký
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
                setTimeout(() => {
                    window.location.href = './home.html';
                }, 500);
            } catch (err) {
                console.error("Auth error:", err);
                let message = "Đã xảy ra lỗi. Vui lòng thử lại.";
                if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') message = "Sai email hoặc mật khẩu";
                else if (err.code === 'auth/user-not-found') message = "Tài khoản không tồn tại";
                else if (err.code === 'auth/email-already-in-use') message = "Email này đã được đăng ký";
                else if (err.code === 'auth/weak-password') message = "Mật khẩu cần ít nhất 6 ký tự";
                showToast(message);
                submitBtnLabel.disabled = false;
                submitBtnLabel.innerText = isSignUpMode ? "create account" : "sign in";
            }
        });
    }

    // Đăng nhập Google
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            try {
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await signInWithPopup(auth, provider);
                showToast("Đăng nhập Google thành công!");
                setTimeout(() => {
                    window.location.href = './home.html';
                }, 500);
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
});

// Lấy ảnh banner mobile trực tiếp từ Firebase Firestore
async function loadFirebaseBanner() {
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, "settings", "banners"));
        if (snap.exists()) {
            const data = snap.data();
            const slides = data.slides || [];
            if (slides.length > 0) {
                // Ưu tiên mobileImageUrl, nếu không có lấy imageUrl
                const firstBanner = slides[0];
                const bannerSrc = firstBanner.mobileImageUrl || firstBanner.imageUrl;
                const imgEl = document.getElementById('login-bg-img');
                if (imgEl && bannerSrc) {
                    imgEl.src = bannerSrc;
                }
            }
        }
    } catch (e) {
        console.warn("Không thể tải banner Firebase, dùng banner mặc định:", e);
    }
}

function showToast(msg) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}

