import { 
    db, auth, logout, loginWithGoogle, updateCartCount, formatPhoneNumber,
    showToast, initHeader, renderProductCard, getMembershipTier, MEMBERSHIP_TIERS, autoLinkOrdersByPhone, getOtpCooldown, saveOtpTimestamp, startOtpCountdown, setupOtpInputs, getOtpValue, sendEmailNotification
} from "./utils.js";
import { updateProfile, RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, getDoc, collection, query, where, getDocs, orderBy, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Biến lưu kết quả xác thực OTP
let confirmationResult = null;

// Khởi tạo reCAPTCHA ẩn cho trang Profile
const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
        if (!document.getElementById('recaptcha-container')) {
            const div = document.createElement('div');
            div.id = 'recaptcha-container';
            document.body.appendChild(div);
        }
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible'
        });
    }
};

// Hàm điều khiển Tab
function setupTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.profile-section');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            const targetSection = document.getElementById(btn.dataset.target);
            if (targetSection) targetSection.classList.add('active');
        });
    });

    // Tự động chuyển tab dựa trên hash URL (ví dụ: #orders)
    const handleHash = () => {
        const hash = window.location.hash;
        if (hash === '#orders') {
            const btn = document.querySelector('.tab-btn[data-target="order-section"]');
            if (btn) btn.click();
        } else if (hash === '#favs') {
            const btn = document.querySelector('.tab-btn[data-target="fav-section"]');
            if (btn) btn.click();
        } else if (hash === '#addresses') {
            const btn = document.querySelector('.tab-btn[data-target="address-section"]');
            if (btn) btn.click();
        } else {
            // Mặc định hoặc khi click vào "Trang cá nhân" (không hash) thì về tab thông tin
            const btn = document.querySelector('.tab-btn[data-target="info-section"]');
            if (btn) btn.click();
        }
    };

    handleHash(); // Kiểm tra ngay khi load trang
    window.addEventListener('hashchange', handleHash); // Lắng nghe khi hash thay đổi mà không load lại trang
}

window.toggleFavorite = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;

    const favRef = doc(db, "favorites", user.uid);
    const favSnap = await getDoc(favRef);
    let favs = favSnap.exists() ? favSnap.data().productIds : [];

    if (favs.includes(productId)) {
        favs = favs.filter(id => id !== productId);
        showToast("Đã bỏ yêu thích");
    } else {
        favs.push(productId);
        showToast("Đã thêm vào yêu thích");
    }

    await setDoc(favRef, { productIds: favs });
    fetchFavorites(user.uid); // Tải lại danh sách yêu thích
};

// Hàm tải danh sách sản phẩm yêu thích từ Firestore
async function fetchFavorites(userId) {
    const container = document.getElementById('favorites-list');
    const noFavsMsg = document.getElementById('no-favorites-msg');
    
    try {
        const favSnap = await getDoc(doc(db, "favorites", userId));
        if (!favSnap.exists() || favSnap.data().productIds.length === 0) {
            container.style.display = 'none';
            noFavsMsg.style.display = 'block';
            return;
        }

        const productIds = favSnap.data().productIds;
        let htmlContent = '';
        
        for (const pid of productIds) {
            const pSnap = await getDoc(doc(db, "products", pid));
            if (pSnap.exists()) {
                // Lấy danh sách yêu thích để render đúng trạng thái nút
                const favs = favSnap.data().productIds;
                htmlContent += renderProductCard(pSnap.data(), pid, favs, '../product/index.html');
            }
        }

        container.innerHTML = htmlContent;
        container.style.display = 'grid';
        noFavsMsg.style.display = 'none';
    } catch (error) {
        console.error("Lỗi tải yêu thích:", error);
    }
}

// Hàm hủy đơn hàng
window.cancelOrder = async (orderId) => {
    if (!confirm("Bạn có chắc chắn muốn hủy đơn hàng này? Hành động này không thể hoàn tác.")) {
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        showToast("Vui lòng đăng nhập để hủy đơn hàng.", "error");
        return;
    }

    try {
        await setDoc(doc(db, "orders", orderId), { status: "Đã hủy", canceledBy: user.uid, canceledAt: new Date().toISOString() }, { merge: true });
        showToast("Đơn hàng đã được hủy thành công!", "success");
        fetchOrderHistory(user.uid); // Tải lại lịch sử đơn hàng để cập nhật UI
    } catch (error) {
        showToast("Lỗi khi hủy đơn hàng: " + error.message, "error");
    }
};

// Hàm xem chi tiết đơn hàng
window.viewOrderDetails = async (orderId) => {
    try {
        const docSnap = await getDoc(doc(db, "orders", orderId));
        if (!docSnap.exists()) return;
        
        const order = docSnap.data();
        const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleString('vi-VN') : 'N/A';
        
        // Tạo modal nếu chưa có
        let modal = document.getElementById('order-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'order-detail-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                <div class="modal-header">
                    <h3 style="font-family: var(--font-serif);">Chi tiết đơn hàng</h3>
                    <p style="font-size: 0.8rem; color: #888;">ID: ${orderId}</p>
                </div>
                <div class="modal-body">
                    <div class="detail-row"><span>Ngày đặt:</span> <span>${orderDate}</span></div>
                    <div class="detail-row"><span>Trạng thái:</span> <span class="order-status-${order.status.toLowerCase().replace(/\s/g, '-')}">${order.status}</span></div>
                    <div class="detail-row"><span>Họ tên:</span> <span>${order.shippingAddress?.fullName || 'N/A'}</span></div>
                    <div class="detail-row"><span>Số điện thoại:</span> <span>${order.shippingAddress?.phone || 'N/A'}</span></div>
                    <div class="detail-row"><span>Địa chỉ:</span> <span style="text-align: right; max-width: 60%;">${order.shippingAddress?.address || 'N/A'}</span></div>
                    <hr style="margin: 1.5rem 0; border: none; border-top: 1px dashed #eee;">
                    <h4 style="margin-bottom: 1rem;">Danh sách sản phẩm</h4>
                    <ul style="list-style: none; padding: 0;">
                        ${order.items.map(item => `
                            <li style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 0.9rem;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <img src="${item.image}" alt="${item.name}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px;">
                                    <div>
                                        <div style="font-weight: 600;">${item.name}</div>
                                        <div style="font-size: 0.8rem; color: #777;">x ${item.quantity}</div>
                                    </div>
                                </div>
                                <span style="font-weight: 600;">${new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}đ</span>
                            </li>
                        `).join('')}
                    </ul>
                    <div class="detail-row" style="margin-top: 1.5rem; font-size: 1.2rem; border-top: 1px solid #eee; padding-top: 1rem;">
                        <span>Tổng cộng:</span>
                        <span style="color: var(--text-black);">${new Intl.NumberFormat('vi-VN').format(order.totalAmount)}đ</span>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.add('active');
        // Đóng khi click ra ngoài
        modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
    } catch (error) {
        showToast("Không thể tải chi tiết đơn hàng", "error");
    }
};

// Hàm tải sổ địa chỉ
async function fetchAddresses(userId) {
    const container = document.getElementById('address-list');
    const noAddrMsg = document.getElementById('no-addresses-msg');
    if (!container) return;

    try {
        const userSnap = await getDoc(doc(db, "users", userId));
        const addresses = userSnap.exists() ? (userSnap.data().addresses || []) : [];

        if (addresses.length === 0) {
            container.style.display = 'none';
            if (noAddrMsg) noAddrMsg.style.display = 'block';
            return;
        }

        container.innerHTML = addresses.map((addr, idx) => `
            <div class="order-item" style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; margin-bottom: 1rem;">
                <div>
                    <p><strong>${addr.fullName}</strong> | ${addr.phone}</p>
                    <p style="font-size: 0.9rem; color: #666; margin-top: 5px;">${addr.address}, ${addr.wardName}, ${addr.provinceName}</p>
                </div>
                <button class="btn-remove-small" onclick="window.deleteAddress(${idx})">Xóa</button>
            </div>
        `).join('');

        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        if (noAddrMsg) noAddrMsg.style.display = 'none';
    } catch (error) {
        console.error("Lỗi tải sổ địa chỉ:", error);
    }
}

window.deleteAddress = async (index) => {
    if (!confirm("Xóa địa chỉ này khỏi sổ địa chỉ?")) return;
    const user = auth.currentUser;
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const addresses = userSnap.data().addresses || [];
        addresses.splice(index, 1);
        await updateDoc(userRef, { addresses: addresses });
        showToast("Đã xóa địa chỉ");
        fetchAddresses(user.uid);
    } catch (e) { showToast("Lỗi xóa địa chỉ", "error"); }
};

// Hàm thiết lập listener cho trạng thái đăng nhập và hiển thị thông tin người dùng
async function handleProfileAuth(user) {
    const profileInfo = document.getElementById('profile-info');
    const notLoggedInMsg = document.getElementById('not-logged-in-msg');
    const btnLoginProfile = document.getElementById('btn-login-profile');
    const btnLogoutProfile = document.getElementById('btn-logout-profile');

    if (user) {
        // Tải thêm thông tin từ Firestore (users collection)
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        
        // Lấy ngày tham gia từ metadata của Firebase Auth
        const joinDate = user.metadata.creationTime 
            ? new Date(user.metadata.creationTime).toLocaleDateString('vi-VN') 
            : 'N/A';

        // Kiểm tra quyền Admin
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);
        const isAdmin = adminSnap.exists();
        const adminBadge = isAdmin ? `<span class="admin-text-badge" title="Quản trị viên"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg> Admin</span>` : '';

        // Cấu trúc lại giao diện trang cá nhân
        profileInfo.innerHTML = `
            <div class="profile-card">
                <h3>Thông tin cá nhân</h3>
                <div id="profile-display">
                    <p><strong>Tên hiển thị:</strong> <span id="disp-name">${user.displayName || 'Chưa cập nhật'} ${adminBadge}</span></p>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Số điện thoại:</strong> <span>${formatPhoneNumber(userData.phone) || 'Chưa cập nhật'}</span></p>
                    <p><strong>Giới tính:</strong> <span>${userData.gender || 'Chưa cập nhật'}</span></p>
                    <p><strong>Ngày sinh:</strong> <span>${userData.birthday ? new Date(userData.birthday).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}</span></p>
                    <p><strong>Ngày tham gia:</strong> ${joinDate}</p>
                    <div id="membership-card-container"></div>
                    <button id="btn-edit-profile" class="btn-outline" style="margin-top: 1.5rem; width: 100%;">Chỉnh sửa thông tin</button>
                </div>

                <form id="edit-profile-form" style="display: none; margin-top: 1rem;">
                    <div class="form-group">
                        <label>Tên hiển thị</label>
                        <input type="text" id="edit-name" value="${user.displayName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Số điện thoại</label>
                        <input type="tel" id="edit-phone" value="${userData.phone || ''}">
                    </div>
                    <div class="form-group" id="otp-group-profile" style="display: none;">
                        <label>Mã xác thực OTP (Gửi tới SĐT mới)</label>
                        <div class="otp-input-container" id="otp-inputs-profile">
                            <input type="text" class="otp-digit" maxlength="1" inputmode="numeric">
                            <input type="text" class="otp-digit" maxlength="1" inputmode="numeric">
                            <input type="text" class="otp-digit" maxlength="1" inputmode="numeric">
                            <input type="text" class="otp-digit" maxlength="1" inputmode="numeric">
                            <input type="text" class="otp-digit" maxlength="1" inputmode="numeric">
                            <input type="text" class="otp-digit" maxlength="1" inputmode="numeric">
                        </div>
                        <button type="button" id="btn-resend-otp-profile" class="btn-minimal" style="font-size:0.7rem; margin-top:5px; border:none; text-decoration:underline; width:auto; padding:0;">Gửi lại mã</button>
                    </div>
                    <div class="form-group">
                        <label>Giới tính</label>
                        <select id="edit-gender">
                            <option value="">Chọn giới tính</option>
                            <option value="Nam" ${userData.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                            <option value="Nữ" ${userData.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                            <option value="Khác" ${userData.gender === 'Khác' ? 'selected' : ''}>Khác</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Ngày sinh</label>
                        <input type="date" id="edit-birthday" value="${userData.birthday || ''}">
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button type="submit" class="btn-dark" style="flex: 1;">Lưu</button>
                        <button type="button" id="btn-cancel-edit" class="btn-minimal" style="flex: 1;">Hủy</button>
                    </div>
                </form>

                <div id="admin-action-container" style="display: none; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px dashed #eee;"></div>
                <button id="btn-logout-profile" class="btn-minimal" style="margin-top: 2rem; width: 100%; color: #e74c3c; border-color: #e74c3c;">Đăng xuất</button>
            </div>
        `;

        profileInfo.style.display = 'block';
        notLoggedInMsg.style.display = 'none';

        // Điều khiển ẩn/hiện Form sửa
        const displayDiv = document.getElementById('profile-display');
        const editForm = document.getElementById('edit-profile-form');
        
        document.getElementById('btn-edit-profile').onclick = () => {
            displayDiv.style.display = 'none';
            editForm.style.display = 'block';
        };
        
        const submitBtn = editForm.querySelector('button[type="submit"]');
        const resendBtn = document.getElementById('btn-resend-otp-profile');

        // Kiểm tra đếm ngược gửi lại mã ngay khi khởi tạo form
        startOtpCountdown(resendBtn, 'otp_ts_profile', 60);

        // Hàm gửi OTP dùng chung cho trang Profile
        const triggerOtpSend = async (phone) => {
            const cooldown = getOtpCooldown('otp_ts_profile', 60);
            if (cooldown > 0) return false;
            
            // KIỂM TRA TRÙNG LẶP SỐ ĐIỆN THOẠI
            const q = query(collection(db, "users"), where("phone", "==", phone));
            const snap = await getDocs(q);
            
            let conflict = false;
            snap.forEach(docSnap => {
                const data = docSnap.data();
                // Nếu số này thuộc về UID khác VÀ tài khoản đó không phải là tài khoản vãng lai (ghost)
                if (docSnap.id !== auth.currentUser.uid && data.isGhost === false) {
                    conflict = true;
                }
            });

            if (conflict) {
                showToast("Số điện thoại này đã được liên kết với một tài khoản khác. Vui lòng đăng nhập bằng số điện thoại này.", "error");
                return false;
            }

            setupRecaptcha();
            const authPhone = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;
            confirmationResult = await signInWithPhoneNumber(auth, authPhone, window.recaptchaVerifier);
            saveOtpTimestamp('otp_ts_profile');
            startOtpCountdown(resendBtn, 'otp_ts_profile', 60);
            return true;
        };

        resendBtn.onclick = () => {
            const phone = formatPhoneNumber(document.getElementById('edit-phone').value);
            triggerOtpSend(phone).then(ok => { if(ok) showToast("Đã gửi lại mã OTP"); });
        };

        document.getElementById('btn-cancel-edit').onclick = () => {
            editForm.style.display = 'none';
            displayDiv.style.display = 'block';
            confirmationResult = null;
            document.getElementById('otp-group-profile').style.display = 'none';
            submitBtn.innerText = "Lưu";
        };

        // Xử lý lưu thông tin
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const newName = document.getElementById('edit-name').value;
            const rawPhone = document.getElementById('edit-phone').value;
            const newPhone = formatPhoneNumber(rawPhone); // Chuẩn hóa SĐT
            const newGender = document.getElementById('edit-gender').value;
            const newBirthday = document.getElementById('edit-birthday').value;
            const otpGroup = document.getElementById('otp-group-profile');

            try {
                // 1. Kiểm tra xác thực OTP nếu người dùng thay đổi số điện thoại
                const phoneChanged = newPhone && newPhone !== (userData.phone || '');
                
                if (phoneChanged && !confirmationResult) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="spinner-small"></span> Đang gửi OTP...';
                    
                    const ok = await triggerOtpSend(newPhone);
                    if (!ok) {
                        submitBtn.disabled = false;
                        submitBtn.innerText = "Lưu";
                        return;
                    }

                    otpGroup.style.display = 'block';
                    setupOtpInputs('otp-inputs-profile');
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Xác nhận & Lưu";
                    showToast("Mã OTP đã được gửi đến số điện thoại mới.");
                    return; // Dừng submit để đợi người dùng nhập mã
                }

                // 2. Nếu đang trong quá trình xác thực, kiểm tra mã code
                if (confirmationResult) {
                    const code = getOtpValue('otp-inputs-profile');
                    if (code.length < 6) { showToast("Vui lòng nhập đủ 6 số OTP", "error"); return; }
                    
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="spinner-small"></span> Đang xác thực...';
                    try {
                        await confirmationResult.confirm(code);
                        confirmationResult = null; // Xóa kết quả xác thực sau khi thành công
                    } catch (err) {
                        showToast("Mã OTP không chính xác hoặc đã hết hạn", "error");
                        submitBtn.disabled = false;
                        submitBtn.innerText = "Xác nhận & Lưu";
                        return;
                    }
                }

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';

                // Cập nhật Profile của Firebase Auth
                if (newName !== user.displayName) {
                    await updateProfile(user, { displayName: newName });
                }
                
                // Cập nhật cả identifiers để tìm kiếm POS chính xác
                const phone84 = newPhone.startsWith('0') ? '+84' + newPhone.substring(1) : newPhone;
                const identifiers = [newPhone, phone84];
                if (user.email) identifiers.push(user.email);

                // Cập nhật dữ liệu mở rộng vào Firestore
                await setDoc(userRef, {
                    phone: newPhone,
                    gender: newGender,
                    birthday: newBirthday,
                    identifiers: identifiers,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                // Thực hiện liên kết đơn hàng ngay sau khi cập nhật SĐT thành công
                const linkedCount = await autoLinkOrdersByPhone(user.uid, newPhone);
                if (linkedCount > 0) {
                    showToast(`Thành công! Đã liên kết ${linkedCount} đơn hàng cũ từ shop vào tài khoản của bạn.`);
                } else {
                    showToast("Cập nhật thông tin thành công!");
                }
                
                if (phoneChanged) {
                    sendEmailNotification('phone', {
                        to_email: user.email,
                        customer_name: user.displayName || user.email,
                        new_phone: newPhone
                    });
                }

                handleProfileAuth(auth.currentUser); // Tải lại giao diện
            } catch (error) {
                showToast("Lỗi khi cập nhật: " + error.message, "error");
                submitBtn.disabled = false;
                submitBtn.innerText = "Lưu";
            }
        };

        document.getElementById('btn-logout-profile').onclick = logout;

        // Hiển thị link Admin nếu có quyền
        if (isAdmin) {
            const adminContainer = document.getElementById('admin-action-container');
            if (adminContainer) {
                adminContainer.innerHTML = `
                    <p style="color: #27ae60; font-weight: 600; font-size: 0.8rem; margin-bottom: 0.5rem;">QUYỀN QUẢN TRỊ VIÊN</p>
                    <a href="../admin/" class="btn-dark" style="display: block; text-align: center; margin-top: 0;">Vào bảng điều khiển Admin</a>
                `;
                adminContainer.style.display = 'block';
            }
        }

        fetchFavorites(user.uid);
        fetchOrderHistory(user.uid);
        fetchAddresses(user.uid);
    } else {
        profileInfo.style.display = 'none';
        document.getElementById('order-history-list').innerHTML = '';
        document.getElementById('no-orders-msg').style.display = 'none';
        notLoggedInMsg.style.display = 'block';
        if (btnLoginProfile) btnLoginProfile.onclick = loginWithGoogle;
    }
}

// Hàm tải lịch sử đơn hàng
async function fetchOrderHistory(userId) {
    const orderListContainer = document.getElementById('order-history-list');
    const noOrdersMsg = document.getElementById('no-orders-msg');
    orderListContainer.innerHTML = '<p style="text-align: center;">Đang tải lịch sử đơn hàng...</p>';

    try {
        const q = query(collection(db, "orders"), where("userId", "==", userId), orderBy("orderDate", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            orderListContainer.style.display = 'none';
            noOrdersMsg.style.display = 'block';
            // Cập nhật số tiền tích luỹ về 0 nếu chưa có đơn
            const spentEl = document.getElementById('user-total-spent');
            if (spentEl) spentEl.innerText = '0đ';
            return;
        }

        let htmlContent = '';
        let totalSpent = 0;
        querySnapshot.forEach((doc) => {
            const order = doc.data();
            // Chỉ tích lũy chi tiêu cho đơn hàng đã hoàn thành để thăng hạng
            if (order.status === "Đã hoàn thành") {
                totalSpent += (order.totalAmount || 0);
            }
            const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleString('vi-VN') : 'N/A';
            const totalAmount = new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0);
            const status = order.status || 'Đang xử lý';

            const canCancel = status === 'Đang xử lý'; // Chỉ cho phép hủy khi đang xử lý
            const cancelBtn = canCancel 
                ? `<button class="btn-minimal" style="color: #e74c3c; border-color: #e74c3c; margin-top: 1rem;" onclick="window.cancelOrder('${doc.id}')">Hủy đơn hàng</button>` 
                : '';
            const detailBtn = `<button class="btn-outline" style="margin-top: 1rem; margin-right: 10px;" onclick="window.viewOrderDetails('${doc.id}')">Xem chi tiết</button>`;
            htmlContent += `
                <div class="order-item">
                    <div class="order-header">
                        <span><strong>Mã đơn hàng:</strong> ${doc.id}</span>
                        <span><strong>Ngày đặt:</strong> ${orderDate}</span>
                        <span><strong>Trạng thái:</strong> <span class="order-status-${status.toLowerCase().replace(/\s/g, '-')}">${status}</span></span>
                    </div>
                    <div class="order-details">
                        <h4>Sản phẩm:</h4>
                        <ul style="list-style: none; padding: 0;">
                            ${order.items.map(item => `
                                <li style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                                    <img src="${item.image}" alt="${item.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
                                    <span>${item.name} x ${item.quantity} (${new Intl.NumberFormat('vi-VN').format(item.price)} VND)</span>
                                </li>
                            `).join('')}
                        </ul>
                        <p><strong>Tổng tiền:</strong> ${totalAmount} VND</p>
                        <div style="display: flex; gap: 10px;">${detailBtn} ${cancelBtn}</div>
                    </div>
                </div>
            `;
        });
        orderListContainer.innerHTML = htmlContent;
        
        // 1.5 Hiển thị Thẻ thành viên & Tiến trình
        const cardContainer = document.getElementById('membership-card-container');
        if (cardContainer) {
            const currentTier = getMembershipTier(totalSpent);
            const currentIndex = MEMBERSHIP_TIERS.findIndex(t => t.id === currentTier.id);
            const nextTier = MEMBERSHIP_TIERS[currentIndex + 1];
            
            let progressHtml = '';
            if (nextTier) {
                const range = nextTier.min - currentTier.min;
                const currentProgress = totalSpent - currentTier.min;
                const percent = Math.min(100, Math.max(0, (currentProgress / range) * 100));
                
                progressHtml = `
                    <div class="tier-progress-box">
                        <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#888; margin-bottom:5px;">
                            <span>Đã tích lũy: ${new Intl.NumberFormat('vi-VN').format(totalSpent)} VND</span>
                            <span>Hạng tiếp theo: ${new Intl.NumberFormat('vi-VN').format(nextTier.min)} VND</span>
                        </div>
                        <div class="tier-progress-bar"><div class="fill" style="width: ${percent}%; background:var(--text-black);"></div></div>
                        <p style="font-size:0.75rem; margin-top:5px; text-align:center;">Còn <strong>${new Intl.NumberFormat('vi-VN').format(nextTier.min - totalSpent)} VND</strong> để lên hạng <b>${nextTier.name}</b></p>
                    </div>`;
            }

            cardContainer.innerHTML = `
                <div class="membership-card tier-${currentTier.id}" style="background: ${currentTier.color}">
                    <div class="tier-name">${currentTier.name}</div>
                    <div class="tier-discount">Ưu đãi giảm ${currentTier.discount}% đơn hàng</div>
                </div>
                ${progressHtml}
                <a href="../membership/" style="font-size:0.8rem; color:var(--text-black); text-decoration:underline; display:block; text-align:center; margin-top:10px;">Xem chi tiết quyền lợi các hạng thẻ</a>`;
        }
        
        orderListContainer.style.display = 'block';
        noOrdersMsg.style.display = 'none';

    } catch (error) {
        console.error("Lỗi khi tải lịch sử đơn hàng:", error);
        orderListContainer.innerHTML = '<p style="color: red;">Không thể tải lịch sử đơn hàng. Vui lòng thử lại.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Bảo mật: Ngăn chặn index trang cá nhân của người dùng
    let robotsTag = document.querySelector('meta[name="robots"]');
    if (!robotsTag) {
        robotsTag = document.createElement('meta');
        robotsTag.setAttribute('name', 'robots');
        document.head.appendChild(robotsTag);
    }
    robotsTag.setAttribute('content', 'noindex, nofollow');

    initHeader('../', handleProfileAuth);
    setupTabs();
});
