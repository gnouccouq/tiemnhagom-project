import { auth, db } from '../js/config.js';
import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { applyAppLanguage, setAppLanguage, getCurrentLanguage } from './i18n.js';

let currentUser = null;
let currentUserData = {};

document.addEventListener('DOMContentLoaded', () => {
    applyAppLanguage();
    initAuth();
    initSettingModals();
});


const I18N_DICTIONARY = {
    'tiếng việt': {
        title_setting: 'cài đặt',
        sec_basic_info: 'thông tin cơ bản',
        lbl_name: 'họ và tên',
        lbl_avatar: 'ảnh đại diện',
        lbl_phone: 'số điện thoại',
        lbl_gender: 'giới tính',
        lbl_dob: 'ngày sinh',
        lbl_address: 'địa chỉ',
        lbl_email: 'email',
        sec_region_lang: 'khu vực & ngôn ngữ',
        lbl_region: 'khu vực',
        lbl_language: 'ngôn ngữ',
        sec_other: 'khác',
        lbl_change_password: 'đổi mật khẩu',
        lbl_faqs: 'câu hỏi thường gặp (faqs)',
        lbl_terms: 'điều khoản sử dụng',
        lbl_membership_policy: 'chính sách hội viên',
        lbl_privacy: 'chính sách bảo mật',
        btn_logout: 'đăng xuất tài khoản',
        btn_delete_account: 'xóa tài khoản'
    },
    'english': {
        title_setting: 'setting',
        sec_basic_info: 'basic information',
        lbl_name: 'name',
        lbl_avatar: 'profile picture',
        lbl_phone: 'phone number',
        lbl_gender: 'gender',
        lbl_dob: 'd.o.b',
        lbl_address: 'address',
        lbl_email: 'email',
        sec_region_lang: 'region & language',
        lbl_region: 'region',
        lbl_language: 'language',
        sec_other: 'other',
        lbl_change_password: 'change password',
        lbl_faqs: 'faqs',
        lbl_terms: 'terms of use',
        lbl_membership_policy: 'membership policy',
        lbl_privacy: 'privacy policy',
        btn_logout: 'logout',
        btn_delete_account: 'delete account'
    }
};

function applyLanguage(lang) {
    const activeLang = (lang || 'tiếng việt').toLowerCase();
    const dict = I18N_DICTIONARY[activeLang] || I18N_DICTIONARY['tiếng việt'];

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            el.innerText = dict[key];
        }
    });

    const valLang = document.getElementById('val-setting-language');
    if (valLang) valLang.innerText = activeLang === 'english' ? 'english' : 'tiếng việt';
}


document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('tng_app_lang') || 'tiếng việt';
    applyLanguage(savedLang);
    initNetworkMonitor();
    initAuth();
    initSettingModals();
});

function hideSplashScreen() {
    const splash = document.getElementById('app-splash-screen');
    if (splash) splash.classList.add('fade-out');
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



function initAuth() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            window.location.href = './login.html';
            return;
        }

        await loadUserProfile(user);
    });

    const logoutBtn = document.getElementById('btn-logout-setting');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await signOut(auth);
            showToast("Đã đăng xuất");
            setTimeout(() => {
                window.location.href = './login.html';
            }, 500);
        };
    }

    const deleteBtn = document.getElementById('btn-delete-account');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (confirm("Bạn có chắc chắn muốn xóa tài khoản này khỏi hệ thống?")) {
                showToast("Vui lòng liên hệ hotline để hoàn tất xóa tài khoản.");
            }
        };
    }
}

async function loadUserProfile(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            currentUserData = userSnap.data();
        }

        // Hydrate DOM
        const valName = document.getElementById('val-setting-name');
        const valAvatar = document.getElementById('val-setting-avatar');
        const valPhone = document.getElementById('val-setting-phone');
        const valGender = document.getElementById('val-setting-gender');
        const valDob = document.getElementById('val-setting-dob');
        const valAddress = document.getElementById('val-setting-address');
        const valEmail = document.getElementById('val-setting-email');

        const fullName = currentUserData.name || currentUserData.displayName || user.displayName || 'Chưa đặt tên';
        const photo = currentUserData.photoURL || user.photoURL || '../Asset/images/default-avatar.png';
        const phone = currentUserData.phone || user.phoneNumber || 'Chưa cập nhật';
        const gender = currentUserData.gender || 'prefer not to say';
        const dob = currentUserData.dob || currentUserData.birthday || 'Chưa cập nhật';
        const email = currentUserData.email || user.email || 'Chưa cập nhật';

        // Xử lý lấy địa chỉ chuẩn xác từ Firebase (sổ địa chỉ addresses array hoặc trường address)
        let address = currentUserData.address || currentUserData.fullAddress || '';
        if (!address && currentUserData.addresses && Array.isArray(currentUserData.addresses) && currentUserData.addresses.length > 0) {
            const defaultAddr = currentUserData.addresses[0];
            const parts = [
                defaultAddr.address || defaultAddr.detail,
                defaultAddr.wardName || defaultAddr.ward,
                defaultAddr.districtName || defaultAddr.district,
                defaultAddr.provinceName || defaultAddr.city || defaultAddr.province
            ].filter(Boolean);
            address = parts.join(', ');
        }
        if (!address) address = 'Chưa cập nhật';

        const valRegion = document.getElementById('val-setting-region');
        const valLang = document.getElementById('val-setting-language');

        const region = currentUserData.region || localStorage.getItem('tng_app_region') || 'vietnam';
        const language = currentUserData.language || localStorage.getItem('tng_app_lang') || 'tiếng việt';


        if (valName) valName.innerText = fullName;
        if (valAvatar) valAvatar.src = photo;
        if (valPhone) valPhone.innerText = phone;
        if (valGender) valGender.innerText = gender;
        if (valDob) valDob.innerText = dob;
        if (valAddress) valAddress.innerText = address;
        if (valEmail) valEmail.innerText = email;
        if (valRegion) valRegion.innerText = region;
        if (valLang) valLang.innerText = language;

        const inputAddress = document.getElementById('input-address');
        if (inputAddress && address !== 'Chưa cập nhật') inputAddress.value = address;


        const selectRegion = document.getElementById('select-region');
        if (selectRegion) selectRegion.value = region;
        const selectLang = document.getElementById('select-language');
        if (selectLang) selectLang.value = language;

        // Áp dụng bản dịch ngôn ngữ ngay lập tức
        applyLanguage(language);



    } catch (e) {
        console.error("Lỗi tải thông tin cài đặt:", e);
    } finally {
        hideSplashScreen();
    }
}


function initSettingModals() {
    function closeAllModals() {
        document.querySelectorAll('.app-bottom-sheet').forEach(sheet => sheet.classList.remove('active'));
        document.querySelectorAll('.app-sheet-overlay').forEach(overlay => overlay.classList.remove('active'));
    }

    function setupModal(triggerId, sheetId, overlayId, closeId) {
        const trigger = document.getElementById(triggerId);
        const sheet = document.getElementById(sheetId);
        const overlay = document.getElementById(overlayId);
        const closeBtn = document.getElementById(closeId);

        if (trigger) {
            trigger.onclick = () => {
                closeAllModals();
                if (sheet) sheet.classList.add('active');
                if (overlay) overlay.classList.add('active');
            };
        }

        if (closeBtn) {
            closeBtn.onclick = () => {
                if (sheet) sheet.classList.remove('active');
                if (overlay) overlay.classList.remove('active');
            };
        }

        if (overlay) {
            overlay.onclick = () => {
                if (sheet) sheet.classList.remove('active');
                if (overlay) overlay.classList.remove('active');
            };
        }
    }

    // Setup Custom Pill Selectors for Gender, Region, Language
    initCustomPillPickers();
    // Setup Rolling Wheel Date Picker for Birthday
    initWheelDatePicker();



    setupModal('row-edit-name', 'modal-sheet-name', 'modal-overlay-name', 'close-modal-name');
    setupModal('row-edit-avatar', 'modal-sheet-avatar', 'modal-overlay-avatar', 'close-modal-avatar');
    setupModal('row-edit-phone', 'modal-sheet-phone', 'modal-overlay-phone', 'close-modal-phone');
    setupModal('row-edit-gender', 'modal-sheet-gender', 'modal-overlay-gender', 'close-modal-gender');
    setupModal('row-edit-dob', 'modal-sheet-dob', 'modal-overlay-dob', 'close-modal-dob');
    setupModal('row-edit-address', 'modal-sheet-address', 'modal-overlay-address', 'close-modal-address');
    setupModal('row-edit-region', 'modal-sheet-region', 'modal-overlay-region', 'close-modal-region');
    setupModal('row-edit-language', 'modal-sheet-language', 'modal-overlay-language', 'close-modal-language');

    // 1. Submit Edit Name
    const formName = document.getElementById('form-edit-name');
    if (formName) {
        formName.onsubmit = async (e) => {
            e.preventDefault();
            const first = document.getElementById('input-first-name').value.trim();
            const last = document.getElementById('input-last-name').value.trim();
            const fullName = `${first} ${last}`.trim();

            if (!fullName) return;

            try {
                if (currentUser) {
                    await updateProfile(currentUser, { displayName: fullName });
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { name: fullName, displayName: fullName, updatedAt: new Date().toISOString() }, { merge: true });
                    showToast("Cập nhật tên thành công!");
                    closeAllModals();
                    await loadUserProfile(currentUser);
                }
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi cập nhật tên", "error");
            }
        };
    }

    // 2. Submit Edit Avatar (via FileReader base64 / URL)
    const fileAvatarInput = document.getElementById('file-avatar-input');
    const avatarPreviewImg = document.getElementById('avatar-preview-img');
    let selectedAvatarData = null;

    if (fileAvatarInput) {
        fileAvatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    selectedAvatarData = event.target.result;
                    if (avatarPreviewImg) avatarPreviewImg.src = selectedAvatarData;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const btnSubmitAvatar = document.getElementById('btn-submit-avatar');
    if (btnSubmitAvatar) {
        btnSubmitAvatar.onclick = async () => {
            if (!selectedAvatarData) {
                closeAllModals();
                return;
            }
            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { photoURL: selectedAvatarData, updatedAt: new Date().toISOString() }, { merge: true });
                    showToast("Cập nhật ảnh đại diện thành công!");
                    closeAllModals();
                    await loadUserProfile(currentUser);
                }
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi cập nhật ảnh", "error");
            }
        };
    }

    // 3. Submit Edit Phone
    const formPhone = document.getElementById('form-edit-phone');
    if (formPhone) {
        formPhone.onsubmit = async (e) => {
            e.preventDefault();
            const phone = document.getElementById('input-phone').value.trim();
            if (!phone) return;

            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { phone: phone, updatedAt: new Date().toISOString() }, { merge: true });
                    showToast("Cập nhật số điện thoại thành công!");
                    closeAllModals();
                    await loadUserProfile(currentUser);
                }
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi cập nhật SĐT", "error");
            }
        };
    }

    // 4. Submit Edit Gender
    const formGender = document.getElementById('form-edit-gender');
    if (formGender) {
        formGender.onsubmit = async (e) => {
            e.preventDefault();
            const gender = document.getElementById('select-gender').value;
            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { gender: gender, updatedAt: new Date().toISOString() }, { merge: true });
                    showToast("Cập nhật giới tính thành công!");
                    closeAllModals();
                    await loadUserProfile(currentUser);
                }
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi cập nhật giới tính", "error");
            }
        };
    }

    // 5. Submit Edit DOB
    const formDob = document.getElementById('form-edit-dob');
    if (formDob) {
        formDob.onsubmit = async (e) => {
            e.preventDefault();
            const dob = document.getElementById('input-dob').value;
            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { dob: dob, birthday: dob, updatedAt: new Date().toISOString() }, { merge: true });
                    showToast("Cập nhật ngày sinh thành công!");
                    closeAllModals();
                    await loadUserProfile(currentUser);
                }
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi cập nhật ngày sinh", "error");
            }
        };
    }

    // 6. Submit Edit Address
    const formAddress = document.getElementById('form-edit-address');
    if (formAddress) {
        formAddress.onsubmit = async (e) => {
            e.preventDefault();
            const addr = document.getElementById('input-address').value.trim();
            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { 
                        address: addr, 
                        fullAddress: addr,
                        updatedAt: new Date().toISOString() 
                    }, { merge: true });
                    showToast("Cập nhật địa chỉ thành công!");
                    closeAllModals();
                    await loadUserProfile(currentUser);
                }
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi cập nhật địa chỉ", "error");
            }
        };
    }


    // 7. Submit Edit Region
    const formRegion = document.getElementById('form-edit-region');
    if (formRegion) {
        formRegion.onsubmit = async (e) => {
            e.preventDefault();
            const region = document.getElementById('select-region').value;
            localStorage.setItem('tng_app_region', region);
            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { region: region, updatedAt: new Date().toISOString() }, { merge: true });
                }
                showToast("Đã thay đổi vùng quốc gia!");
                closeAllModals();
                if (currentUser) await loadUserProfile(currentUser);
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi đổi vùng", "error");
            }
        };
    }

    // 8. Submit Edit Language
    const formLanguage = document.getElementById('form-edit-language');
    if (formLanguage) {
        formLanguage.onsubmit = async (e) => {
            e.preventDefault();
            const language = document.getElementById('select-language').value;
            setAppLanguage(language);
            try {
                if (currentUser) {
                    const userRef = doc(db, "users", currentUser.uid);
                    await setDoc(userRef, { language: language, updatedAt: new Date().toISOString() }, { merge: true });
                }
                showToast("Đã đổi ngôn ngữ: " + (language === 'tiếng việt' ? 'Tiếng Việt' : 'English'));
                closeAllModals();
                if (currentUser) await loadUserProfile(currentUser);
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi đổi ngôn ngữ", "error");
            }
        };
    }
}

// SETUP CUSTOM PILL SELECTORS FOR GENDER, REGION, LANGUAGE
function initCustomPillPickers() {
    function bindPillGroup(groupId, hiddenInputId) {
        const group = document.getElementById(groupId);
        const input = document.getElementById(hiddenInputId);
        if (!group || !input) return;

        const options = group.querySelectorAll('.custom-pill-option');
        options.forEach(opt => {
            opt.onclick = () => {
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                input.value = opt.dataset.value;
            };
        });
    }

    bindPillGroup('gender-pill-group', 'select-gender');
    bindPillGroup('region-pill-group', 'select-region');
    bindPillGroup('language-pill-group', 'select-language');
}

// SETUP 3-COLUMN ROLLING WHEEL DATE PICKER
function initWheelDatePicker() {
    const colDay = document.getElementById('wheel-col-day');
    const colMonth = document.getElementById('wheel-col-month');
    const colYear = document.getElementById('wheel-col-year');
    const hiddenInput = document.getElementById('input-dob');
    if (!colDay || !colMonth || !colYear || !hiddenInput) return;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let selectedDay = 29;
    let selectedMonthIdx = 7; // August (0-indexed)
    let selectedYear = 2026;

    // 1. Populate Days (1..31)
    let daysHtml = '';
    for (let d = 1; d <= 31; d++) {
        daysHtml += `<div class="wheel-item ${d === selectedDay ? 'active' : ''}" data-day="${d}">${d}</div>`;
    }
    colDay.innerHTML = daysHtml;

    // 2. Populate Months (Jan..Dec)
    let monthsHtml = '';
    months.forEach((m, idx) => {
        monthsHtml += `<div class="wheel-item ${idx === selectedMonthIdx ? 'active' : ''}" data-month-idx="${idx}">${m}</div>`;
    });
    colMonth.innerHTML = monthsHtml;

    // 3. Populate Years (1950..2026)
    let yearsHtml = '';
    for (let y = 2026; y >= 1950; y--) {
        yearsHtml += `<div class="wheel-item ${y === selectedYear ? 'active' : ''}" data-year="${y}">${y}</div>`;
    }
    colYear.innerHTML = yearsHtml;

    function updateHiddenDob() {
        const mm = String(selectedMonthIdx + 1).padStart(2, '0');
        const dd = String(selectedDay).padStart(2, '0');
        hiddenInput.value = `${selectedYear}-${mm}-${dd}`;
    }

    // Scroll helper & click select
    function setupWheelColumn(colElement, attrName, onSelectCallback) {
        const items = colElement.querySelectorAll('.wheel-item');
        
        items.forEach((item) => {
            item.onclick = () => {
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Scroll into center
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                onSelectCallback(item.getAttribute(attrName));
            };
        });

        // Snap on scroll stop
        let scrollTimeout = null;
        colElement.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const colRect = colElement.getBoundingClientRect();
                const centerY = colRect.top + colRect.height / 2;
                
                let closestItem = null;
                let minDiff = Infinity;

                items.forEach(it => {
                    const itRect = it.getBoundingClientRect();
                    const itCenter = itRect.top + itRect.height / 2;
                    const diff = Math.abs(centerY - itCenter);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestItem = it;
                    }
                });

                if (closestItem) {
                    items.forEach(i => i.classList.remove('active'));
                    closestItem.classList.add('active');
                    onSelectCallback(closestItem.getAttribute(attrName));
                }
            }, 100);
        });
    }

    setupWheelColumn(colDay, 'data-day', (val) => {
        selectedDay = Number(val);
        updateHiddenDob();
    });

    setupWheelColumn(colMonth, 'data-month-idx', (val) => {
        selectedMonthIdx = Number(val);
        updateHiddenDob();
    });

    setupWheelColumn(colYear, 'data-year', (val) => {
        selectedYear = Number(val);
        updateHiddenDob();
    });

    updateHiddenDob();
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

