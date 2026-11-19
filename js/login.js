import { 
    auth, initHeader, loginWithGoogle, loginEmail, registerEmail, resetPassword, showToast, formatPhoneNumber, getOtpCooldown, saveOtpTimestamp, startOtpCountdown, setupOtpInputs, getOtpValue, sendEmailNotification
} from "./utils.js";
import { 
    RecaptchaVerifier, signInWithPhoneNumber 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

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
            window.tngRefreshSlidingPills?.();
        });
    });

    // Chuyển đổi Login / Register trong Email Section
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const authTitle = document.querySelector('.auth-header h2');

    // Khởi tạo nút ẩn/hiện mật khẩu cho các ô password
    document.querySelectorAll('.auth-pw-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) icon.className = 'ti ti-eye-off';
            } else {
                input.type = 'password';
                if (icon) icon.className = 'ti ti-eye';
            }
        });
    });

    const isValidEmailFormat = (val) => {
        const s = String(val || '').trim();
        return s.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    };

    const validatePasswordRules = (pw = '') => ({
        length: pw.length >= 6,
        upper: /[A-Z]/.test(pw),
        number: /[0-9]/.test(pw),
        special: /[^A-Za-z0-9\s]/.test(pw)
    });

    const loginEmailInput = document.getElementById('login-email');
    const loginEmailHint = document.getElementById('login-email-hint');
    if (loginEmailInput && loginEmailHint) {
        loginEmailInput.addEventListener('input', () => {
            const val = loginEmailInput.value.trim();
            if (!val) {
                loginEmailHint.style.display = 'none';
            } else if (!val.includes('@')) {
                loginEmailHint.style.display = 'flex';
                loginEmailHint.style.color = '#dc2626';
                loginEmailHint.innerHTML = '<i class="ti ti-alert-circle"></i> Email bắt buộc phải có ký tự @ (ví dụ: example@gmail.com)';
            } else if (!isValidEmailFormat(val)) {
                loginEmailHint.style.display = 'flex';
                loginEmailHint.style.color = '#dc2626';
                loginEmailHint.innerHTML = '<i class="ti ti-alert-circle"></i> Vui lòng nhập đầy đủ tên miền sau @ (ví dụ: @gmail.com)';
            } else {
                loginEmailHint.style.display = 'none';
            }
        });
    }

    const regEmailInput = document.getElementById('reg-email');
    const regEmailHint = document.getElementById('reg-email-hint');
    const regPwInput = document.getElementById('reg-password');
    const regConfirmPwInput = document.getElementById('reg-confirm-password');
    const regMatchHint = document.getElementById('reg-pw-match-hint');
    const btnSubmitReg = document.getElementById('btn-submit-register');

    const updateRuleItem = (id, isValid) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('is-valid', isValid);
        const icon = el.querySelector('i');
        if (icon) {
            icon.className = isValid ? 'ti ti-circle-check-filled' : 'ti ti-circle';
        }
    };

    const evaluateRegisterFormState = () => {
        const emailVal = regEmailInput ? regEmailInput.value.trim() : '';
        const pwVal = regPwInput ? regPwInput.value : '';
        const confirmVal = regConfirmPwInput ? regConfirmPwInput.value : '';

        const emailValid = isValidEmailFormat(emailVal);
        if (regEmailHint) {
            if (!emailVal) {
                regEmailHint.style.display = 'none';
            } else if (!emailVal.includes('@')) {
                regEmailHint.style.display = 'flex';
                regEmailHint.style.color = '#dc2626';
                regEmailHint.innerHTML = '<i class="ti ti-alert-circle"></i> Email bắt buộc phải có ký tự @ (ví dụ: example@gmail.com)';
            } else if (!emailValid) {
                regEmailHint.style.display = 'flex';
                regEmailHint.style.color = '#dc2626';
                regEmailHint.innerHTML = '<i class="ti ti-alert-circle"></i> Vui lòng nhập đầy đủ tên miền sau @ (ví dụ: @gmail.com)';
            } else {
                regEmailHint.style.display = 'flex';
                regEmailHint.style.color = '#18181b';
                regEmailHint.innerHTML = '<i class="ti ti-circle-check-filled"></i> Định dạng Email hợp lệ';
            }
        }

        const rules = validatePasswordRules(pwVal);
        updateRuleItem('reg-rule-email', emailValid);
        updateRuleItem('reg-rule-length', rules.length);
        updateRuleItem('reg-rule-upper', rules.upper);
        updateRuleItem('reg-rule-number', rules.number);
        updateRuleItem('reg-rule-special', rules.special);

        const allPwRulesPassed = rules.length && rules.upper && rules.number && rules.special;
        const isMatched = pwVal.length > 0 && confirmVal.length > 0 && pwVal === confirmVal;

        if (regMatchHint) {
            if (confirmVal.length === 0) {
                regMatchHint.style.display = 'none';
            } else if (isMatched) {
                regMatchHint.style.display = 'flex';
                regMatchHint.style.color = '#18181b';
                regMatchHint.innerHTML = '<i class="ti ti-circle-check-filled"></i> Mật khẩu xác nhận đã khớp';
            } else {
                regMatchHint.style.display = 'flex';
                regMatchHint.style.color = '#dc2626';
                regMatchHint.innerHTML = '<i class="ti ti-alert-circle"></i> Mật khẩu xác nhận chưa khớp';
            }
        }

        if (btnSubmitReg) {
            btnSubmitReg.disabled = !(emailValid && allPwRulesPassed && isMatched);
        }
    };

    [regEmailInput, regPwInput, regConfirmPwInput].forEach(el => {
        if (el) {
            el.addEventListener('input', evaluateRegisterFormState);
            el.addEventListener('change', evaluateRegisterFormState);
        }
    });
    evaluateRegisterFormState();
    
    document.getElementById('toggle-register').onclick = () => {
        loginForm.style.display = 'none';
        regForm.style.display = 'block';
        authTitle.innerText = "Tạo tài khoản mới";
        evaluateRegisterFormState();
    };
    
    document.getElementById('toggle-login').onclick = () => {
        regForm.style.display = 'none';
        loginForm.style.display = 'block';
        authTitle.innerText = "Chào mừng bạn";
    };

    // Xử lý Đăng nhập Google
    document.getElementById('btn-google-login').onclick = async () => {
        const success = await loginWithGoogle();
        if (success) window.location.href = "../";
    };

    // Xử lý Đăng nhập Email
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-submit-login') || e.target.querySelector('button[type="submit"]');

        if (!email.includes('@') || !isValidEmailFormat(email)) {
            showToast("Vui lòng nhập địa chỉ Email hợp lệ (bắt buộc có ký tự @).", "error");
            return;
        }
        if (!pass) {
            showToast("Vui lòng nhập mật khẩu.", "error");
            return;
        }
        
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
        const email = document.getElementById('reg-email').value.trim();
        const pass = document.getElementById('reg-password').value;
        const confirmPass = document.getElementById('reg-confirm-password')?.value || '';

        if (!email.includes('@') || !isValidEmailFormat(email)) {
            showToast("Email đăng ký bắt buộc phải có ký tự @ và đúng định dạng (ví dụ: example@gmail.com).", "error");
            return;
        }

        const rules = validatePasswordRules(pass);
        if (!rules.length || !rules.upper || !rules.number || !rules.special) {
            showToast("Mật khẩu phải có tối thiểu 6 ký tự, gồm ít nhất 1 chữ in hoa, 1 chữ số và 1 ký tự đặc biệt!", "error");
            return;
        }

        if (pass !== confirmPass) {
            showToast("Mật khẩu xác nhận không khớp!", "error");
            return;
        }

        try {
            if (btnSubmitReg) {
                btnSubmitReg.disabled = true;
                btnSubmitReg.innerText = "Đang tạo tài khoản...";
            }
            await registerEmail(email, pass);
            sendEmailNotification('welcome', {
                to_email: email,
                customer_name: email.split('@')[0]
            });
        } catch (err) {
            let msg = "Không thể tạo tài khoản: " + (err.message || "Đã có lỗi xảy ra");
            if (err.code === 'auth/email-already-in-use') {
                msg = "Email này đã được đăng ký. Vui lòng chuyển sang Đăng nhập hoặc dùng Quên mật khẩu!";
            } else if (err.code === 'auth/invalid-email') {
                msg = "Địa chỉ Email không hợp lệ (bắt buộc có ký tự @).";
            } else if (err.code === 'auth/weak-password') {
                msg = "Mật khẩu quá yếu. Vui lòng đặt mật khẩu mạnh hơn.";
            }
            showToast(msg, "error");
            if (btnSubmitReg) {
                btnSubmitReg.innerText = "Tạo tài khoản";
                evaluateRegisterFormState();
            }
        }
    };

    // Xử lý Quên mật khẩu
    document.getElementById('btn-forgot-pw').onclick = async () => {
        const email = document.getElementById('login-email').value.trim();
        if (!email) {
            showToast("Vui lòng nhập email vào ô phía trên", "error");
            return;
        }
        if (!email.includes('@') || !isValidEmailFormat(email)) {
            showToast("Vui lòng nhập Email hợp lệ (bắt buộc có ký tự @) để khôi phục mật khẩu.", "error");
            return;
        }
        try {
            await resetPassword(email);
            sendEmailNotification('password', {
                to_email: email,
                reset_link: "https://tiemnhagom.vn/login/" // Hoặc link thực tế
            });
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
                'size': 'invisible',
                'callback': (response) => {
                    // reCAPTCHA solved
                }
            });
            // Do not call .render() manually to avoid 'already rendered' error when signInWithPhoneNumber internally verifies it
        }
    };
    
    // Khởi tạo trước để reCAPTCHA kịp tải
    setupRecaptcha();

    // 2. Gửi mã OTP
    document.getElementById('btn-send-otp').onclick = async (e) => {
        const phoneInput = document.getElementById('phone-number').value.trim();
        if (!phoneInput) {
            showToast("Vui lòng nhập số điện thoại", "error");
            return;
        }

        // Định dạng về 0... để lưu/hiển thị, nhưng dùng +84 để gửi OTP Firebase
        const phone = formatPhoneNumber(phoneInput);
        const authPhone = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;

        const btn = e.currentTarget;
        try {
            // Kiểm tra cooldown gửi OTP
            const cooldown = getOtpCooldown('otp_ts_login', 60);
            if (cooldown > 0) {
                showToast(`Bạn vừa yêu cầu mã. Vui lòng đợi ${cooldown}s trước khi gửi lại.`, "error");
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-small"></span> Đang gửi...';
            
            confirmationResult = await signInWithPhoneNumber(auth, authPhone, window.recaptchaVerifier);
            
            saveOtpTimestamp('otp_ts_login');
            startOtpCountdown(btn, 'otp_ts_login');
            
            document.getElementById('otp-group').style.display = 'block';
            setupOtpInputs('otp-inputs-login');
            // Bỏ dòng btn.style.display = 'none' để người dùng nhìn thấy đếm ngược
            showToast("Mã OTP đã được gửi đến số điện thoại của bạn.");
        } catch (error) {
            console.error(error);
            showToast("Lỗi gửi OTP: " + error.message, "error");
            btn.disabled = false;
            btn.innerText = "Gửi mã xác thực";
            
            // Xóa và tạo lại reCAPTCHA để tránh lỗi DUPE ở lần click tiếp theo
            if (window.recaptchaVerifier) {
                try {
                    window.recaptchaVerifier.clear();
                    window.recaptchaVerifier = null;
                    const container = document.getElementById('recaptcha-container');
                    if (container) container.innerHTML = ''; // Force clear DOM
                    setupRecaptcha();
                } catch (e) {
                    console.error("Lỗi reset reCAPTCHA:", e);
                }
            }
        }
    };

    // 3. Xác nhận mã OTP
    document.getElementById('btn-verify-otp').onclick = async (e) => {
        const code = getOtpValue('otp-inputs-login');
        if (code.length < 6) {
            window.tngShakeOtp?.('otp-inputs-login');
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
            window.tngShakeOtp?.('otp-inputs-login');
            showToast("Mã OTP không chính xác hoặc đã hết hạn", "error");
            btn.disabled = false;
            btn.innerText = "Xác nhận đăng nhập";
        }
    };

    // Kiểm tra đếm ngược ngay khi load trang
    const cooldown = getOtpCooldown('otp_ts_login', 60);
    if (cooldown > 0) {
        // Nếu đang trong thời gian chờ, tự động hiện ô nhập mã để người dùng điền mã đã nhận được trước đó
        document.getElementById('otp-group').style.display = 'block';
        setupOtpInputs('otp-inputs-login');
        startOtpCountdown(document.getElementById('btn-send-otp'), 'otp_ts_login');
    }
});
