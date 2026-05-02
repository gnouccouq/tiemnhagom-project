import { 
    auth, initHeader, loginWithGoogle, loginEmail, registerEmail, resetPassword, showToast 
} from "./utils.js";
import { 
    RecaptchaVerifier, signInWithPhoneNumber 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // Bảo mật: Ngăn chặn index các trang đăng nhập/xác thực
    let robotsTag = document.querySelector('meta[name="robots"]');
    if (!robotsTag) {
        robotsTag = document.createElement('meta');
        robotsTag.setAttribute('name', 'robots');
        document.head.appendChild(robotsTag);
    }
    robotsTag.setAttribute('content', 'noindex, nofollow');

    initHeader('../');

    // Chuyển đổi Tabs (Email / Phone)
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // Chuyển đổi Login / Register trong Email Section
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const authTitle = document.querySelector('.auth-header h2');
    
    document.getElementById('toggle-register').onclick = () => {
        loginForm.style.display = 'none';
        regForm.style.display = 'block';
        authTitle.innerText = "Tạo tài khoản mới";
    };
    
    document.getElementById('toggle-login').onclick = () => {
        regForm.style.display = 'none';
        loginForm.style.display = 'block';
        authTitle.innerText = "Chào mừng bạn";
    };

    // Xử lý Đăng nhập Google
    document.getElementById('btn-google-login').onclick = async () => {
        await loginWithGoogle();
        window.location.href = "../";
    };

    // Xử lý Đăng nhập Email
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const btn = e.target.querySelector('button');
        
        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span>';
            await loginEmail(email, pass);
        } catch (err) {
            showToast("Sai email hoặc mật khẩu", "error");
            btn.disabled = false;
            btn.innerText = "Đăng nhập";
        }
    };

    // Xử lý Đăng ký
    regForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-password').value;
        try {
            await registerEmail(email, pass);
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
        }
    };

    // Xử lý Quên mật khẩu
    document.getElementById('btn-forgot-pw').onclick = async () => {
        const email = document.getElementById('login-email').value;
        if (!email) {
            showToast("Vui lòng nhập email vào ô phía trên", "error");
            return;
        }
        try {
            await resetPassword(email);
        } catch (err) {
            showToast("Lỗi: " + err.message, "error");
        }
    };
    
    // --- Logic Đăng nhập bằng Số điện thoại ---
    let confirmationResult;

    // 1. Khởi tạo reCAPTCHA ẩn
    const setupRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible'
            });
        }
    };

    // 2. Gửi mã OTP
    document.getElementById('btn-send-otp').onclick = async (e) => {
        const phoneInput = document.getElementById('phone-number').value.trim();
        if (!phoneInput) {
            showToast("Vui lòng nhập số điện thoại", "error");
            return;
        }

        // Chuyển đổi định dạng số VN: 090... -> +8490...
        let formattedPhone = phoneInput;
        if (phoneInput.startsWith('0')) {
            formattedPhone = '+84' + phoneInput.substring(1);
        } else if (!phoneInput.startsWith('+')) {
            showToast("Số điện thoại không hợp lệ (VD: 090...)", "error");
            return;
        }

        const btn = e.currentTarget;
        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span> Đang gửi...';
            
            setupRecaptcha();
            confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
            
            document.getElementById('otp-group').style.display = 'block';
            btn.style.display = 'none';
            showToast("Mã OTP đã được gửi đến số điện thoại của bạn.");
        } catch (error) {
            console.error(error);
            showToast("Lỗi gửi OTP: " + error.message, "error");
            btn.disabled = false;
            btn.innerText = "Gửi mã xác thực";
            if (window.recaptchaVerifier) window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
        }
    };

    // 3. Xác nhận mã OTP
    document.getElementById('btn-verify-otp').onclick = async (e) => {
        const code = document.getElementById('otp-code').value.trim();
        if (!code || code.length < 6) {
            showToast("Vui lòng nhập mã OTP 6 số", "error");
            return;
        }

        const btn = e.currentTarget;
        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span> Đang xác thực...';
            
            await confirmationResult.confirm(code);
            showToast("Đăng nhập thành công!");
            window.location.href = "../";
        } catch (error) {
            showToast("Mã OTP không chính xác hoặc đã hết hạn", "error");
            btn.disabled = false;
            btn.innerText = "Xác nhận đăng nhập";
        }
    };
});