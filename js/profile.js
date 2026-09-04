import { 
    db, auth, logout, loginWithGoogle, updateCartCount, formatPhoneNumber,
    showToast, initHeader, renderProductCard, renderProductCardWithVariants, getMembershipTier, MEMBERSHIP_TIERS, autoLinkOrdersByPhone, getOtpCooldown, saveOtpTimestamp, startOtpCountdown, setupOtpInputs, getOtpValue, sendEmailNotification, escapeHTML
} from "./utils.js";
import { updateProfile, RecaptchaVerifier, signInWithPhoneNumber, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    doc, getDoc, collection, query, where, getDocs, orderBy, setDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

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
    const btns = document.querySelectorAll('.profile-nav-btn');
    const sections = document.querySelectorAll('.profile-section');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.id === 'btn-logout-sidebar' || btn.id === 'btn-change-password') return; // Bỏ qua nếu là nút chức năng
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
            const btn = document.querySelector('.profile-nav-btn[data-target="order-section"]');
            if (btn) btn.click();
        } else if (hash === '#favs') {
            const btn = document.querySelector('.profile-nav-btn[data-target="fav-section"]');
            if (btn) btn.click();
        } else if (hash === '#vouchers') {
            const btn = document.querySelector('.profile-nav-btn[data-target="voucher-section"]');
            if (btn) btn.click();
        } else if (hash === '#membership') {
            const btn = document.querySelector('.profile-nav-btn[data-target="membership-section"]');
            if (btn) btn.click();
        } else {
            // Mặc định hoặc khi click vào "Trang cá nhân" (không hash) thì về tab thông tin
            const btn = document.querySelector('.profile-nav-btn[data-target="info-section"]');
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
                htmlContent += renderProductCardWithVariants(pSnap.data(), pid, favs, '../product/index.html');
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
        const functions = getFunctions(db.app);
        const cancelOrderSecure = httpsCallable(functions, 'cancelOrderSecure');
        await cancelOrderSecure({ orderId: orderId });
        
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
        const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleString('vi-VN') : 
                         (order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleString('vi-VN') : 'N/A');
        
        // Tạo modal nếu chưa có
        let modal = document.getElementById('order-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'order-detail-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const rawStatus = (order.status || 'Đang xử lý').trim();
        const statusLower = rawStatus.toLowerCase();

        let currentStep = 1;
        let isCancelled = false;

        if (statusLower.includes('hủy') || statusLower.includes('cancel')) {
            isCancelled = true;
            currentStep = 0;
        } else if (
            statusLower.includes('hoàn thành') || 
            statusLower.includes('đã nhận') || 
            statusLower.includes('đã giao') || 
            statusLower.includes('thành công') || 
            statusLower.includes('completed') || 
            statusLower.includes('success')
        ) {
            currentStep = 4;
        } else if (
            statusLower.includes('đang giao') || 
            statusLower.includes('vận chuyển') || 
            statusLower.includes('shipping') || 
            statusLower.includes('delivering')
        ) {
            currentStep = 3;
        } else if (
            statusLower.includes('xác nhận') || 
            statusLower.includes('đóng gói') || 
            statusLower.includes('đã thanh toán') || 
            statusLower.includes('processing')
        ) {
            currentStep = 2;
        } else {
            currentStep = 1;
        }

        const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        const step1Class = currentStep >= 1 ? (currentStep === 1 ? 'active' : 'completed') : '';
        const step2Class = currentStep >= 2 ? (currentStep === 2 ? 'active' : 'completed') : '';
        const step3Class = currentStep >= 3 ? (currentStep === 3 ? 'active' : 'completed') : '';
        const step4Class = currentStep >= 4 ? 'completed active' : '';

        const step1Icon = currentStep > 1 ? checkIcon : '1';
        const step2Icon = currentStep > 2 ? checkIcon : '2';
        const step3Icon = currentStep > 3 ? checkIcon : '3';
        const step4Icon = currentStep >= 4 ? checkIcon : '4';

        let progressWidth = '0%';
        if (currentStep === 2) progressWidth = 'calc((100% - 50px) * 0.33)';
        else if (currentStep === 3) progressWidth = 'calc((100% - 50px) * 0.66)';
        else if (currentStep === 4) progressWidth = 'calc(100% - 50px)';

        let badgeBg = '#e0f2fe', badgeColor = '#0369a1';
        if (isCancelled) {
            badgeBg = '#fee2e2'; badgeColor = '#b91c1c';
        } else if (currentStep === 4) {
            badgeBg = '#dcfce7'; badgeColor = '#15803d';
        }

        const couponDiscountVal = Number(order.discountAmount || order.discountVal || order.discount || 0);
        const vipDiscountVal = Number(order.membershipDiscount || 0);
        const items = order.items || [];
        const subtotalVal = order.subtotal || items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
        const shippingFeeVal = order.shippingFee || 0;
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 650px; border-radius: 12px; padding: 25px;">
                <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</span>
                <div class="modal-header" style="border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <span style="font-size: 0.78rem; color: #64748b;">MÃ ĐƠN HÀNG</span>
                            <h3 style="font-family: monospace; font-size: 1.15rem; margin: 0; color: #1e293b;">${orderId}</h3>
                            <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">Ngày đặt: ${orderDate}</div>
                        </div>
                        <span style="padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">
                            ${rawStatus}
                        </span>
                    </div>
                </div>

                <div class="modal-body" style="padding: 0;">
                    ${!isCancelled ? `
                        <div class="tracking-timeline" style="margin: 1.2rem 0 1.8rem;">
                            <div class="tracking-timeline-line-bg" style="top: 17px;"></div>
                            <div class="tracking-timeline-line-fill" style="top: 17px; width: ${progressWidth};"></div>
                            <div class="timeline-step ${step1Class}">
                                <div class="timeline-icon" style="width: 34px; height: 34px; font-size: 0.8rem;">${step1Icon}</div>
                                <div class="timeline-label">Tiếp nhận</div>
                            </div>
                            <div class="timeline-step ${step2Class}">
                                <div class="timeline-icon" style="width: 34px; height: 34px; font-size: 0.8rem;">${step2Icon}</div>
                                <div class="timeline-label">Đóng gói</div>
                            </div>
                            <div class="timeline-step ${step3Class}">
                                <div class="timeline-icon" style="width: 34px; height: 34px; font-size: 0.8rem;">${step3Icon}</div>
                                <div class="timeline-label">Đang giao</div>
                            </div>
                            <div class="timeline-step ${step4Class}">
                                <div class="timeline-icon" style="width: 34px; height: 34px; font-size: 0.8rem;">${step4Icon}</div>
                                <div class="timeline-label">Đã nhận</div>
                            </div>
                        </div>
                    ` : `
                        <div style="padding: 10px 14px; background: #fef2f2; border-radius: 6px; color: #991b1b; font-size: 0.85rem; margin-bottom: 15px;">
                            ⚠️ Đơn hàng này đã được hủy.
                        </div>
                    `}

                    ${(order.trackingLink || order.trackingUrl) ? `
                        <div style="margin-bottom: 15px; padding: 12px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 8px; color: #1e40af; font-size: 0.88rem;">
                                <span style="font-size: 1.3rem;">🚚</span>
                                <div>
                                    <strong style="display: block;">Lộ trình giao hàng trực tiếp</strong>
                                    <span style="color: #64748b; font-size: 0.78rem;">Bấm để xem shipper đang di chuyển</span>
                                </div>
                            </div>
                            <a href="${escapeHTML(order.trackingLink || order.trackingUrl)}" target="_blank" style="padding: 6px 14px; font-size: 0.82rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: #0066cc; color: #fff; font-weight: 600;">
                                Xem lộ trình ➔
                            </a>
                        </div>
                    ` : ''}

                    <div style="background: #fafafa; border: 1px solid #f1f5f9; border-radius: 8px; padding: 10px 14px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px; font-size: 0.88rem; color: #334155; text-transform: uppercase;">Sản phẩm (${items.length})</h4>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${items.map(item => `
                                <li style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 0.88rem;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <img src="${item.image || item.imageUrl || 'https://placehold.co/45'}" alt="${item.name}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid #eee;">
                                        <div>
                                            <div style="font-weight: 600; color: #1e293b;">${escapeHTML(item.name || '')}</div>
                                            ${(() => {
                                                const vStr = [item.comboVariant, item.color, item.pattern, item.variant].filter(Boolean).join(' / ');
                                                return vStr ? `<div style="font-size: 0.75rem; color: #64748b;">Phân loại: ${escapeHTML(vStr)}</div>` : '';
                                            })()}
                                            <div style="font-size: 0.78rem; color: #64748b;">SL: x${item.quantity || 1}</div>
                                        </div>
                                    </div>
                                    <span style="font-weight: 600; color: #0f172a;">${new Intl.NumberFormat('vi-VN').format((item.price || 0) * (item.quantity || 1))}đ</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <!-- Bảng kê chi phí & Địa chỉ -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 0.85rem;">
                        <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #e2e8f0;">
                            <strong style="color: #1e293b; display: block; margin-bottom: 2px;">Địa chỉ giao hàng:</strong>
                            <div>${escapeHTML(order.shippingAddress?.fullName || 'N/A')} - ${escapeHTML(order.shippingAddress?.phone || '')}</div>
                            <div style="color: #64748b;">${escapeHTML(order.shippingAddress?.address || 'Tại cửa hàng')}</div>
                        </div>

                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="color: #64748b;">Tạm tính:</span>
                            <span>${new Intl.NumberFormat('vi-VN').format(subtotalVal)}đ</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="color: #64748b;">Phí vận chuyển:</span>
                            <span>${shippingFeeVal > 0 ? `+${new Intl.NumberFormat('vi-VN').format(shippingFeeVal)}đ` : '<span style="color: #16a34a; font-weight: 600;">0đ (Miễn phí)</span>'}</span>
                        </div>
                        ${couponDiscountVal > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #ea580c; font-weight: 500;">
                                <span>🏷️ ${order.couponCode ? `Mã ưu đãi (${escapeHTML(order.couponCode)})` : (order.source === 'pos' ? 'Giảm giá trực tiếp tại shop (POS)' : 'Giảm giá')}:</span>
                                <span>-${new Intl.NumberFormat('vi-VN').format(couponDiscountVal)}đ</span>
                            </div>
                        ` : ''}
                        ${vipDiscountVal > 0 ? `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #d97706; font-weight: 600;">
                                <span>👑 Ưu đãi thành viên (Membership):</span>
                                <span>-${new Intl.NumberFormat('vi-VN').format(vipDiscountVal)}đ</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; font-size: 1.1rem; font-weight: 700; color: #e74c3c;">
                            <span>Tổng thanh toán:</span>
                            <span>${new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0)}đ</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.add('active');
        modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
    } catch (error) {
        console.error("Lỗi xem chi tiết đơn hàng:", error);
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
    const profileLayout = document.getElementById('profile-main-layout');
    const notLoggedInMsg = document.getElementById('not-logged-in-msg');
    const btnLoginProfile = document.getElementById('btn-login-profile');

    if (user) {
        // Tải thêm thông tin từ Firestore (users collection)
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        
        // Cập nhật thông tin trên Sidebar
        document.getElementById('sidebar-name').innerText = user.displayName || 'Khách hàng';
        const userAvatarUrl = userData.avatar || user.photoURL;
        const avatarImg = document.getElementById('sidebar-avatar');
        avatarImg.src = userAvatarUrl || '../Asset/images/default-avatar.png';

        // Đồng bộ lên Header Avatar ngay nếu chưa có
        if (userAvatarUrl) {
            const headerAvatarImg = document.getElementById('header-user-avatar-img');
            if (headerAvatarImg) {
                if (headerAvatarImg.tagName === 'IMG') {
                    headerAvatarImg.src = userAvatarUrl;
                } else {
                    headerAvatarImg.outerHTML = `<img id="header-user-avatar-img" src="${userAvatarUrl}" alt="${user.displayName || 'Tài khoản'}" class="header-user-avatar">`;
                }
            }
        }

        profileLayout.style.display = 'flex';
        notLoggedInMsg.style.display = 'none';

        // Điền dữ liệu vào form thông tin khách hàng
        const editName = document.getElementById('edit-name');
        const editPhone = document.getElementById('edit-phone');
        const editEmail = document.getElementById('edit-email');
        const editDob = document.getElementById('edit-dob');
        const editGender = document.getElementById('edit-gender');
        const editJoinDate = document.getElementById('edit-join-date');

        if (editName) editName.value = user.displayName || '';
        if (editPhone) editPhone.value = userData.phone || '';
        if (editEmail) editEmail.value = user.email || '';
        if (editDob) editDob.value = userData.dob || userData.birthday || '';
        if (editGender) editGender.value = userData.gender || '';
        if (editJoinDate) {
            const joinDateStr = user.metadata && user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('vi-VN') : 'Không rõ';
            editJoinDate.value = joinDateStr;
        }

        // Xử lý đổi ảnh đại diện
        const btnEditAvatar = document.getElementById('btn-edit-avatar');
        const avatarInput = document.getElementById('avatar-input');
        if (btnEditAvatar && avatarInput) {
            btnEditAvatar.onclick = () => avatarInput.click();
            avatarInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                // Hiển thị trạng thái đang tải
                btnEditAvatar.disabled = true;
                btnEditAvatar.innerText = 'Đang tải lên...';
                
                try {
                    const storageRef = ref(getStorage(), `avatars/${user.uid}/${Date.now()}_${file.name}`);
                    const snapshot = await uploadBytesResumable(storageRef, file);
                    const downloadURL = await getDownloadURL(snapshot.ref);
                    
                    // Cập nhật Firestore
                    await setDoc(userRef, { avatar: downloadURL }, { merge: true });
                    // Cập nhật Firebase Auth
                    await updateProfile(user, { photoURL: downloadURL });
                    
                    // Cập nhật UI Profile
                    avatarImg.src = downloadURL;
                    
                    // Cập nhật tức thì lên Header Avatar
                    const headerAvatarImg = document.getElementById('header-user-avatar-img');
                    if (headerAvatarImg) {
                        if (headerAvatarImg.tagName === 'IMG') {
                            headerAvatarImg.src = downloadURL;
                        } else {
                            headerAvatarImg.outerHTML = `<img id="header-user-avatar-img" src="${downloadURL}" alt="${user.displayName || 'Tài khoản'}" class="header-user-avatar">`;
                        }
                    }

                    // Lưu vào localStorage hint
                    const existingHint = JSON.parse(localStorage.getItem('tng_user_hint') || '{}');
                    localStorage.setItem('tng_user_hint', JSON.stringify({
                        ...existingHint,
                        loggedIn: true,
                        avatar: downloadURL
                    }));

                    showToast('Đã cập nhật ảnh đại diện');
                } catch (error) {
                    showToast('Lỗi khi tải ảnh lên: ' + error.message, 'error');
                } finally {
                    btnEditAvatar.disabled = false;
                    btnEditAvatar.innerText = 'Sửa ảnh đại diện';
                }
            };
        }

        // Kiểm tra quyền Admin
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);
        const isAdmin = adminSnap.exists();
        if (isAdmin) {
            const adminContainer = document.getElementById('admin-action-container');
            if (adminContainer) {
                adminContainer.innerHTML = `
                    <p style="color: #27ae60; font-weight: 600; font-size: 0.8rem; margin-bottom: 0.5rem;">QUYỀN QUẢN TRỊ VIÊN</p>
                    <a href="../DashBoard/" class="btn-dark" style="display: block; text-align: center; margin-top: 0; min-width: 150px; width: auto;">Vào bảng điều khiển Admin</a>
                `;
                adminContainer.style.display = 'block';
            }
        }

        const editForm = document.getElementById('edit-profile-form');
        const submitBtn = editForm ? editForm.querySelector('button[type="submit"]') : null;
        const resendBtn = document.getElementById('btn-resend-otp-profile');

        if (resendBtn) startOtpCountdown(resendBtn, 'otp_ts_profile', 60);

        const triggerOtpSend = async (phone) => {
            const cooldown = getOtpCooldown('otp_ts_profile', 60);
            if (cooldown > 0) return false;
            
            const q = query(collection(db, "users"), where("phone", "==", phone));
            const snap = await getDocs(q);
            
            let conflict = false;
            snap.forEach(docSnap => {
                const data = docSnap.data();
                if (docSnap.id !== auth.currentUser.uid && data.isGhost === false) {
                    conflict = true;
                }
            });

            if (conflict) {
                showToast("Số điện thoại này đã được liên kết với một tài khoản khác.", "error");
                return false;
            }

            setupRecaptcha();
            const authPhone = phone.startsWith('0') ? '+84' + phone.substring(1) : phone;
            confirmationResult = await signInWithPhoneNumber(auth, authPhone, window.recaptchaVerifier);
            saveOtpTimestamp('otp_ts_profile');
            startOtpCountdown(resendBtn, 'otp_ts_profile', 60);
            return true;
        };

        if (resendBtn) {
            resendBtn.onclick = () => {
                const phone = formatPhoneNumber(document.getElementById('edit-phone').value);
                triggerOtpSend(phone).then(ok => { if(ok) showToast("Đã gửi lại mã OTP"); });
            };
        }

        // Xử lý lưu thông tin
        if (editForm) {
            editForm.onsubmit = async (e) => {
                e.preventDefault();
                const newName = document.getElementById('edit-name').value;
                const rawPhone = document.getElementById('edit-phone').value;
                const newPhone = formatPhoneNumber(rawPhone);
                const newDob = document.getElementById('edit-dob') ? document.getElementById('edit-dob').value : '';
                const newGender = document.getElementById('edit-gender') ? document.getElementById('edit-gender').value : '';
                const otpGroup = document.getElementById('otp-group-profile');

                try {
                    const phoneChanged = newPhone && newPhone !== (userData.phone || '');
                    
                    if (phoneChanged && !confirmationResult) {
                        submitBtn.disabled = true;
                        submitBtn.innerHTML = '<span class="spinner-small"></span> Đang gửi OTP...';
                        
                        const ok = await triggerOtpSend(newPhone);
                        if (!ok) {
                            submitBtn.disabled = false;
                            submitBtn.innerText = "Lưu thông tin";
                            return;
                        }

                        otpGroup.style.display = 'block';
                        setupOtpInputs('otp-inputs-profile');
                        submitBtn.disabled = false;
                        submitBtn.innerText = "Xác nhận & Lưu";
                        showToast("Mã OTP đã được gửi đến số điện thoại mới.");
                        return;
                    }

                    if (confirmationResult) {
                        const code = getOtpValue('otp-inputs-profile');
                        if (code.length < 6) { showToast("Vui lòng nhập đủ 6 số OTP", "error"); return; }
                        
                        submitBtn.disabled = true;
                        submitBtn.innerHTML = '<span class="spinner-small"></span> Đang xác thực...';
                        try {
                            await confirmationResult.confirm(code);
                            confirmationResult = null;
                            otpGroup.style.display = 'none';
                        } catch (err) {
                            showToast("Mã OTP không chính xác hoặc đã hết hạn", "error");
                            submitBtn.disabled = false;
                            submitBtn.innerText = "Xác nhận & Lưu";
                            return;
                        }
                    }

                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="spinner-small"></span> Đang lưu...';

                    if (newName !== user.displayName) {
                        await updateProfile(user, { displayName: newName });
                    }
                    
                    const phone84 = newPhone.startsWith('0') ? '+84' + newPhone.substring(1) : newPhone;
                    const identifiers = [newPhone, phone84];
                    if (user.email) identifiers.push(user.email);

                    await setDoc(userRef, {
                        phone: newPhone,
                        dob: newDob,
                        birthday: newDob,
                        gender: newGender,
                        identifiers: identifiers,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });

                    const linkedCount = await autoLinkOrdersByPhone(user.uid, newPhone);
                    if (linkedCount > 0) {
                        showToast(`Thành công! Đã liên kết ${linkedCount} đơn hàng cũ.`);
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

                    handleProfileAuth(auth.currentUser); 
                } catch (error) {
                    showToast("Lỗi khi cập nhật: " + error.message, "error");
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Lưu thông tin";
                }
            };
        }

        const btnLogoutSidebar = document.getElementById('btn-logout-sidebar');
        if (btnLogoutSidebar) btnLogoutSidebar.onclick = logout;

        const btnChangePassword = document.getElementById('btn-change-password');
        if (btnChangePassword) {
            btnChangePassword.onclick = async () => {
                if (user.email) {
                    try {
                        // Using sendPasswordResetEmail from firebase-auth
                        await sendPasswordResetEmail(auth, user.email);
                        showToast("Đã gửi email đổi mật khẩu. Vui lòng kiểm tra hộp thư của bạn.");
                    } catch (error) {
                        showToast("Lỗi: " + error.message, "error");
                    }
                } else {
                    showToast("Tài khoản của bạn không có email liên kết.", "error");
                }
            };
        }

        fetchFavorites(user.uid);
        fetchOrderHistory(user.uid);
        fetchAddresses(user.uid);
        fetchUserVouchers(user.uid);
    } else {
        profileLayout.style.display = 'none';
        document.getElementById('order-history-list').innerHTML = '';
        document.getElementById('no-orders-msg').style.display = 'none';
        const vl = document.getElementById('voucher-list');
        if (vl) vl.innerHTML = '';
        const nv = document.getElementById('no-vouchers-msg');
        if (nv) nv.style.display = 'none';
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

        let htmlContent = '';
        let totalSpent = 0;

        if (querySnapshot.empty) {
            orderListContainer.style.display = 'none';
            noOrdersMsg.style.display = 'block';
        } else {
            querySnapshot.forEach((docSnap) => {
                const order = docSnap.data();
                const docId = docSnap.id;

                const rawStatus = (order.status || 'Đang xử lý').trim();
                const statusLower = rawStatus.toLowerCase();

                // Chỉ tích lũy chi tiêu cho đơn hàng đã hoàn thành để thăng hạng
                if (statusLower.includes('hoàn thành') || statusLower.includes('thành công') || statusLower.includes('completed')) {
                    totalSpent += (order.totalAmount || 0);
                }

                const orderDate = order.orderDate ? new Date(order.orderDate.toDate()).toLocaleString('vi-VN') : 
                                 (order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleString('vi-VN') : 'Mới');

                let currentStep = 1;
                let isCancelled = false;

                if (statusLower.includes('hủy') || statusLower.includes('cancel')) {
                    isCancelled = true;
                    currentStep = 0;
                } else if (
                    statusLower.includes('hoàn thành') || 
                    statusLower.includes('đã nhận') || 
                    statusLower.includes('đã giao') || 
                    statusLower.includes('thành công') || 
                    statusLower.includes('completed') || 
                    statusLower.includes('success')
                ) {
                    currentStep = 4;
                } else if (
                    statusLower.includes('đang giao') || 
                    statusLower.includes('vận chuyển') || 
                    statusLower.includes('shipping') || 
                    statusLower.includes('delivering')
                ) {
                    currentStep = 3;
                } else if (
                    statusLower.includes('xác nhận') || 
                    statusLower.includes('đóng gói') || 
                    statusLower.includes('đã thanh toán') || 
                    statusLower.includes('processing')
                ) {
                    currentStep = 2;
                } else {
                    currentStep = 1;
                }

                const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                const step1Class = currentStep >= 1 ? (currentStep === 1 ? 'active' : 'completed') : '';
                const step2Class = currentStep >= 2 ? (currentStep === 2 ? 'active' : 'completed') : '';
                const step3Class = currentStep >= 3 ? (currentStep === 3 ? 'active' : 'completed') : '';
                const step4Class = currentStep >= 4 ? 'completed active' : '';

                const step1Icon = currentStep > 1 ? checkIcon : '1';
                const step2Icon = currentStep > 2 ? checkIcon : '2';
                const step3Icon = currentStep > 3 ? checkIcon : '3';
                const step4Icon = currentStep >= 4 ? checkIcon : '4';

                let progressWidth = '0%';
                if (currentStep === 2) progressWidth = 'calc((100% - 50px) * 0.33)';
                else if (currentStep === 3) progressWidth = 'calc((100% - 50px) * 0.66)';
                else if (currentStep === 4) progressWidth = 'calc(100% - 50px)';

                let badgeBg = '#e0f2fe', badgeColor = '#0369a1';
                if (isCancelled) {
                    badgeBg = '#fee2e2'; badgeColor = '#b91c1c';
                } else if (currentStep === 4) {
                    badgeBg = '#dcfce7'; badgeColor = '#15803d';
                }

                const canCancel = (rawStatus === 'Đang xử lý' || rawStatus === 'Chờ thanh toán');
                const cancelBtn = canCancel 
                    ? `<button class="btn-minimal" style="color: #e74c3c; border-color: #e74c3c; padding: 6px 14px; font-size: 0.85rem;" onclick="window.cancelOrder('${docId}')">Hủy đơn hàng</button>` 
                    : '';
                
                let repayBtn = '';
                if (rawStatus === 'Chờ thanh toán' && order.paymentMethod === 'vnpay') {
                    repayBtn = `<button class="btn-dark" style="margin: 0; padding: 6px 14px; font-size: 0.85rem;" id="repay-btn-${docId}" onclick="window.repayVNPay('${docId}', ${order.totalAmount})">Thanh toán lại</button>`;
                }

                const detailBtn = `<button class="btn-outline" style="margin: 0; padding: 6px 14px; font-size: 0.85rem;" onclick="window.viewOrderDetails('${docId}')">Xem chi tiết</button>`;
                const couponDiscountVal = order.discountAmount || 0;
                const vipDiscountVal = order.membershipDiscount || 0;
                const items = order.items || [];
                const subtotalVal = order.subtotal || items.reduce((s, it) => s + ((it.price || 0) * (it.quantity || 1)), 0);
                const shippingFeeVal = order.shippingFee || 0;
                const shipping = order.shippingAddress || {};

                htmlContent += `
                    <div class="profile-order-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; background: #fff;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; margin-bottom: 15px;">
                            <div>
                                <span style="font-size: 0.78rem; color: #64748b;">MÃ ĐƠN HÀNG</span>
                                <div style="font-weight: 700; font-size: 1.05rem; color: #2c3e50; font-family: monospace;">${docId}</div>
                                <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">Ngày đặt: ${orderDate}</div>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 0.78rem; color: #64748b;">TRẠNG THÁI</span>
                                <div>
                                    <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">
                                        ${rawStatus}
                                    </span>
                                </div>
                            </div>
                        </div>

                        ${!isCancelled ? `
                            <div class="tracking-timeline" style="margin: 1.5rem 0 2rem;">
                                <div class="tracking-timeline-line-bg"></div>
                                <div class="tracking-timeline-line-fill" style="width: ${progressWidth};"></div>
                                <div class="timeline-step ${step1Class}">
                                    <div class="timeline-icon">${step1Icon}</div>
                                    <div class="timeline-label">Tiếp nhận</div>
                                </div>
                                <div class="timeline-step ${step2Class}">
                                    <div class="timeline-icon">${step2Icon}</div>
                                    <div class="timeline-label">Đóng gói</div>
                                </div>
                                <div class="timeline-step ${step3Class}">
                                    <div class="timeline-icon">${step3Icon}</div>
                                    <div class="timeline-label">Đang giao</div>
                                </div>
                                <div class="timeline-step ${step4Class}">
                                    <div class="timeline-icon">${step4Icon}</div>
                                    <div class="timeline-label">Đã nhận</div>
                                </div>
                            </div>
                        ` : `
                            <div style="padding: 10px 14px; background: #fef2f2; border-radius: 6px; color: #991b1b; font-size: 0.85rem; margin-bottom: 15px;">
                                ⚠️ Đơn hàng này đã được hủy.
                            </div>
                        `}

                        ${(order.trackingLink || order.trackingUrl) ? `
                            <div style="margin-bottom: 15px; padding: 12px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                                <div style="display: flex; align-items: center; gap: 8px; color: #1e40af; font-size: 0.88rem;">
                                    <span style="font-size: 1.3rem;">🚚</span>
                                    <div>
                                        <strong style="display: block;">Đơn hàng có link theo dõi trực tiếp</strong>
                                        <span style="color: #64748b; font-size: 0.78rem;">Bấm để xem shipper đang di chuyển trên bản đồ</span>
                                    </div>
                                </div>
                                <a href="${escapeHTML(order.trackingLink || order.trackingUrl)}" target="_blank" style="padding: 6px 14px; font-size: 0.82rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: #0066cc; color: #fff; font-weight: 600;">
                                    Xem lộ trình ➔
                                </a>
                            </div>
                        ` : ''}

                        <!-- Danh sách sản phẩm -->
                        <div style="margin-bottom: 15px;">
                            <h4 style="margin: 0 0 8px; font-size: 0.88rem; color: #334155; text-transform: uppercase;">Sản phẩm (${items.length})</h4>
                            <div style="background: #fafafa; border-radius: 8px; padding: 8px 12px; border: 1px solid #f1f5f9;">
                                ${items.map(it => `
                                    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                                        <img src="${it.image || it.imageUrl || 'https://placehold.co/45'}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid #eee;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; font-size: 0.88rem; color: #1e293b;">${escapeHTML(it.name || '')}</div>
                                            ${(() => {
                                                const vStr = [it.comboVariant, it.color, it.pattern, it.variant].filter(Boolean).join(' / ');
                                                return vStr ? `<div style="font-size: 0.75rem; color: #64748b;">Phân loại: ${escapeHTML(vStr)}</div>` : '';
                                            })()}
                                            <div style="font-size: 0.78rem; color: #64748b; display: flex; justify-content: space-between; margin-top: 2px;">
                                                <span>SL: <strong>x${it.quantity || 1}</strong></span>
                                                <span style="font-weight: 600; color: #0f172a;">${new Intl.NumberFormat('vi-VN').format(it.price || 0)}đ</span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Thông tin giao hàng & Chi phí -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 15px; font-size: 0.85rem; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #f1f5f9;">
                            <div>
                                <strong style="color: #1e293b; display: block; margin-bottom: 3px;">Địa chỉ nhận hàng:</strong>
                                <div>${escapeHTML(shipping.fullName || order.customerName || 'Quý khách')} - ${escapeHTML(shipping.phone || order.phone || '')}</div>
                                <div style="color: #64748b; margin-top: 2px;">${escapeHTML(shipping.address || 'Tại cửa hàng')}</div>
                            </div>
                            <div style="border-left: 1px solid #e2e8f0; padding-left: 15px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                    <span style="color: #64748b;">Tạm tính:</span>
                                    <span>${new Intl.NumberFormat('vi-VN').format(subtotalVal)}đ</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                    <span style="color: #64748b;">Phí vận chuyển:</span>
                                    <span>${shippingFeeVal > 0 ? `+${new Intl.NumberFormat('vi-VN').format(shippingFeeVal)}đ` : '<span style="color: #16a34a; font-weight: 600;">0đ (Miễn phí)</span>'}</span>
                                </div>
                                ${couponDiscountVal > 0 ? `
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #ea580c;">
                                        <span>Mã ưu đãi ${order.couponCode ? `(${escapeHTML(order.couponCode)})` : ''}:</span>
                                        <span>-${new Intl.NumberFormat('vi-VN').format(couponDiscountVal)}đ</span>
                                    </div>
                                ` : ''}
                                ${vipDiscountVal > 0 ? `
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #16a34a;">
                                        <span>Ưu đãi thành viên VIP:</span>
                                        <span>-${new Intl.NumberFormat('vi-VN').format(vipDiscountVal)}đ</span>
                                    </div>
                                ` : ''}
                                <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 1.05rem; font-weight: 700; color: #e74c3c;">
                                    <span>Tổng thanh toán:</span>
                                    <span>${new Intl.NumberFormat('vi-VN').format(order.totalAmount || 0)}đ</span>
                                </div>
                            </div>
                        </div>

                        <!-- Nút thao tác -->
                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                            ${repayBtn}
                            ${detailBtn}
                            ${cancelBtn}
                        </div>
                    </div>
                `;
            });
            orderListContainer.innerHTML = htmlContent;
        }
        
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
                    <div style="margin-top: 15px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 5px; color: #555;">
                            <span>Đã chi tiêu: ${new Intl.NumberFormat('vi-VN').format(totalSpent)}đ</span>
                            <span>Mốc tiếp theo: ${new Intl.NumberFormat('vi-VN').format(nextTier.min)}đ</span>
                        </div>
                        <div class="progress-bar-bg" style="background: #eee; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div class="progress-bar-fill" style="background: var(--primary-color, #2c3e50); width: ${percent}%; height: 100%; transition: width 0.5s;"></div>
                        </div>
                        <div style="font-size: 0.75rem; color: #777; margin-top: 5px; text-align: right;">
                            Còn ${new Intl.NumberFormat('vi-VN').format(nextTier.min - totalSpent)}đ để lên hạng <strong>${nextTier.name}</strong>
                        </div>
                    </div>
                `;
            } else {
                progressHtml = `
                    <div style="margin-top: 15px; font-size: 0.85rem; color: #27ae60; font-weight: 600;">
                        Bạn đã đạt hạng thẻ cao nhất!
                    </div>
                `;
            }

            cardContainer.innerHTML = `
                <div class="membership-card tier-${currentTier.id}">
                    <div class="membership-card-chip"></div>
                    <div>
                        <div class="member-label">MEMBER TIER</div>
                        <div class="tier-name">${currentTier.name}</div>
                        <div class="tier-discount">Ưu đãi: Giảm ${currentTier.discount}% đơn hàng</div>
                    </div>
                </div>
                ${progressHtml}
                <a href="../membership/" style="font-size:0.8rem; color:var(--text-black); text-decoration:underline; display:block; text-align:center; margin-top:10px;">Xem chi tiết quyền lợi các hạng thẻ</a>`;
            
            // Sinh voucher tự động
            await generateAutomaticVouchers(userId, currentTier);
        }
        
        orderListContainer.style.display = 'block';
        noOrdersMsg.style.display = 'none';

    } catch (error) {
        console.error("Lỗi khi tải lịch sử đơn hàng:", error);
        orderListContainer.innerHTML = '<p style="color: red;">Không thể tải lịch sử đơn hàng. Vui lòng thử lại.</p>';
    }
}

async function generateAutomaticVouchers(userId, currentTier) {
    if (!currentTier || currentTier.id === 'null') return;

    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : null;

        if (!userData) return;

        // 1. Voucher sinh nhật
        const userBday = userData.birthday || userData.dob;
        if (currentTier.birthdayVoucher > 0 && userBday) {
            const today = new Date();
            let birthMonth = -1;
            if (typeof userBday === 'string' && userBday.includes('-')) {
                const parts = userBday.split('-');
                if (parts.length >= 2) birthMonth = parseInt(parts[1], 10) - 1;
            } else {
                birthMonth = new Date(userBday).getMonth();
            }
            
            if (today.getMonth() === birthMonth) {
                const yearStr = today.getFullYear().toString();
                const bdayCode = `BDAY${yearStr}${userId.substring(0, 5).toUpperCase()}`;
                
                const bdayCouponRef = doc(db, "coupons", bdayCode);
                const bdaySnap = await getDoc(bdayCouponRef);
                
                if (!bdaySnap.exists()) {
                    const expiryDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    await setDoc(bdayCouponRef, {
                        name: `Quà tặng sinh nhật hạng ${currentTier.name}`,
                        type: "fixed",
                        value: currentTier.birthdayVoucher,
                        limit: 1,
                        usedCount: 0,
                        category: "all",
                        minOrder: currentTier.birthdayVoucher * 2,
                        expiryDate: expiryDate.toISOString(),
                        createdAt: serverTimestamp(),
                        isAutoGenerated: true,
                        assignedTo: userId
                    });
                }
            }
        }

        // 2. Voucher người thân
        if (currentTier.friendVoucher) {
            const friendCode = `GIFT${userId.substring(0, 5).toUpperCase()}`;
            const friendCouponRef = doc(db, "coupons", friendCode);
            const friendSnap = await getDoc(friendCouponRef);
            
            if (!friendSnap.exists()) {
                await setDoc(friendCouponRef, {
                    name: `Voucher tặng người thân (từ ${userData.displayName || 'Khách hàng'})`,
                    type: "percent",
                    value: 10,
                    maxDiscount: 150000,
                    limit: 1,
                    usedCount: 0,
                    category: "all",
                    minOrder: 0,
                    createdAt: serverTimestamp(),
                    isAutoGenerated: true,
                    assignedBy: userId,
                    forNewCustomerOnly: true
                });
            }
        }

    } catch (e) {
        console.error("Lỗi sinh voucher tự động:", e);
    }
}

// Hàm tải danh sách mã ưu đãi
async function fetchUserVouchers(userId) {
    const listContainer = document.getElementById('voucher-list');
    const noVouchersMsg = document.getElementById('no-vouchers-msg');
    if (!listContainer || !noVouchersMsg) return;

    listContainer.innerHTML = '<p style="text-align: center;">Đang tải danh sách mã ưu đãi...</p>';

    try {
        // Lấy tất cả mã ưu đãi
        const qCoupons = query(collection(db, "coupons"), orderBy("createdAt", "desc"));
        const snapCoupons = await getDocs(qCoupons);
        
        // Lấy lịch sử sử dụng của user để loại bỏ voucher đã dùng
        const qUsed = query(collection(db, "orders"), where("userId", "==", userId));
        const snapOrders = await getDocs(qUsed);
        const usedCoupons = new Set();
        snapOrders.forEach(doc => {
            const data = doc.data();
            if (data.couponCode) usedCoupons.add(data.couponCode);
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const validCoupons = [];
        window.loadedCoupons = {};
        snapCoupons.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            
            // Bỏ qua mã đã hết hạn
            if (data.expiryDate && new Date(data.expiryDate) < today) return;
            // Bỏ qua mã hết lượt dùng hệ thống
            if (data.limit > 0 && (data.usedCount || 0) >= data.limit) return;
            // Bỏ qua mã người dùng đã sử dụng
            if (usedCoupons.has(id)) return;
            
            // Chỉ hiển thị mã công khai hoặc mã tự động sinh dành riêng cho user này
            if (data.isAutoGenerated && data.assignedTo !== userId && data.assignedBy !== userId) return;

            const couponObj = { id, ...data };
            validCoupons.push(couponObj);
            window.loadedCoupons[id] = couponObj;
        });

        if (validCoupons.length === 0) {
            listContainer.style.display = 'none';
            noVouchersMsg.style.display = 'block';
            return;
        }

        window.copyVoucherCode = (code) => {
            navigator.clipboard.writeText(code).then(() => {
                showToast("Đã sao chép mã: " + code);
            }).catch(err => {
                showToast("Lỗi sao chép mã", "error");
            });
        };

        window.showCouponConditions = (code) => {
            const c = window.loadedCoupons[code];
            if (!c) return;
            const conditionsText = c.conditions || '';
            
            let modal = document.getElementById('coupon-conditions-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'coupon-conditions-modal';
                modal.className = 'modal';
                document.body.appendChild(modal);
            }
            
            const lines = conditionsText ? conditionsText.split('\n').map(line => line.trim()).filter(line => line) : [];
            let conditionsHtml = '';
            if (lines.length > 0) {
                conditionsHtml = `<ul style="list-style-type: disc; padding-left: 20px; font-size: 0.9rem; line-height: 1.6; color: #555;">
                    ${lines.map(line => `<li style="margin-bottom: 8px;">${line}</li>`).join('')}
                </ul>`;
            } else {
                conditionsHtml = `<p style="font-size: 0.9rem; color: #666; text-align: center;">Không có điều kiện cụ thể nào cho mã ưu đãi này.</p>`;
            }

            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; padding: 2rem; border-radius: 12px; position: relative;">
                    <span class="modal-close" onclick="this.closest('.modal').classList.remove('active')" style="font-size: 1.5rem; cursor: pointer; position: absolute; top: 15px; right: 20px;">&times;</span>
                    <div class="modal-header" style="margin-bottom: 1.5rem;">
                        <h3 style="font-family: var(--font-serif); font-size: 1.3rem; margin: 0; color: #222;">Điều kiện sử dụng mã</h3>
                        <p style="font-size: 1.1rem; font-weight: 700; color: var(--primary-color, #2c3e50); margin: 5px 0 0 0;">${code}</p>
                    </div>
                    <div class="modal-body">
                        ${conditionsHtml}
                    </div>
                    <button class="btn-dark" style="width: 100%; margin-top: 2rem;" onclick="this.closest('.modal').classList.remove('active')">Đóng</button>
                </div>
            `;
            modal.classList.add('active');
            modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
        };

        listContainer.innerHTML = validCoupons.map(c => {
            const valueStr = c.type === 'percent' ? `${c.value}%` : `${new Intl.NumberFormat('vi-VN').format(c.value)}đ`;
            const minOrderStr = `cho đơn tối thiểu ${new Intl.NumberFormat('vi-VN').format(c.minOrder || 0)}đ`;
            const maxDiscountStr = (c.type === 'percent' && c.maxDiscount > 0) ? `, tối đa ${new Intl.NumberFormat('vi-VN').format(c.maxDiscount)}đ` : '';
            const summaryText = `Giảm ${valueStr} ${minOrderStr}${maxDiscountStr}`;
            
            return `
                <div class="voucher-ticket">
                    <div class="voucher-ticket-left">
                        <h3>
                            ${c.type === 'percent' ? c.value + '%' : new Intl.NumberFormat('vi-VN').format(c.value / 1000) + 'K'}
                        </h3>
                        <span>Giảm giá</span>
                        
                        <div class="voucher-ticket-circle-top"></div>
                        <div class="voucher-ticket-circle-bottom"></div>
                        <div class="voucher-ticket-dashed-line"></div>
                    </div>
                    
                    <div class="voucher-ticket-right">
                        <div>
                            <h4 style="color: #222; margin: 0 0 6px 0; font-size: 1.05rem; font-weight: 700; font-family: var(--font-serif); letter-spacing: 0.3px; line-height: 1.2;">
                                ${c.name || 'Mã ưu đãi'}
                            </h4>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #666; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; font-weight: 500;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #e74c3c;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                HSD: ${c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('vi-VN') : 'Không giới hạn'}
                            </span>
                            <span style="font-size: 0.7rem; color: #2c3e50; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; border: 1px solid #e0e0e0; padding: 3px 8px; border-radius: 20px; background: #fafafa; transition: all 0.2s;" onmouseover="this.style.background='#f0f2f5'; this.style.borderColor='#ccc'; this.style.color='#111';" onmouseout="this.style.background='#fafafa'; this.style.borderColor='#e0e0e0'; this.style.color='#2c3e50';" onclick="window.showCouponConditions('${c.id}')">
                                Xem thể lệ
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #666;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            </span>
                        </div>
                        
                        <div style="display: flex; align-items: center; justify-content: space-between; background: #f8f9fa; padding: 6px 8px; border-radius: 6px; border: 1px dashed #ced4da; margin-bottom: 8px;">
                            <code style="font-family: monospace; font-size: 0.9rem; font-weight: 700; color: #2c3e50;">${c.id}</code>
                            <button style="background: var(--primary-color, #2c3e50); color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 4px;" onclick="window.copyVoucherCode('${c.id}')">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                Sao chép
                            </button>
                        </div>
                        
                        <div style="border-top: 1px solid #f1f3f5; padding-top: 6px; font-size: 0.75rem; color: #888; font-style: italic; line-height: 1.2;">
                            ${summaryText}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.style.display = 'grid';
        listContainer.style.gap = '15px';
        listContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
        noVouchersMsg.style.display = 'none';

    } catch (error) {
        console.error("Lỗi khi tải mã ưu đãi:", error);
        listContainer.innerHTML = '<p style="color: red; text-align: center;">Không thể tải danh sách mã ưu đãi. Vui lòng thử lại.</p>';
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

    // Logic Modal Thêm Địa Chỉ
    const btnAddAddress = document.getElementById('btn-add-address');
    const addressModal = document.getElementById('address-modal');
    const closeAddressModal = document.getElementById('close-address-modal');
    const formAddAddress = document.getElementById('form-add-address');

    if (btnAddAddress && addressModal) {
        btnAddAddress.onclick = () => {
            addressModal.style.display = 'block';
            setTimeout(() => {
                addressModal.style.opacity = '1';
                addressModal.style.visibility = 'visible';
                addressModal.querySelector('.modal-content').style.transform = 'translateY(0)';
            }, 10);
        };
    }

    if (closeAddressModal && addressModal) {
        closeAddressModal.onclick = () => {
            addressModal.style.opacity = '0';
            addressModal.style.visibility = 'hidden';
            addressModal.querySelector('.modal-content').style.transform = 'translateY(-20px)';
            setTimeout(() => {
                addressModal.style.display = 'none';
            }, 200);
        };
    }

    if (formAddAddress) {
        formAddAddress.onsubmit = async (e) => {
            e.preventDefault();
            const btnSave = document.getElementById('btn-save-address');
            if(btnSave) {
                btnSave.disabled = true;
                btnSave.innerText = "Đang lưu...";
            }
            
            try {
                if (!auth.currentUser) throw new Error("Bạn chưa đăng nhập");
                
                const newAddress = {
                    fullName: document.getElementById('new-addr-name').value,
                    phone: document.getElementById('new-addr-phone').value,
                    provinceName: document.getElementById('new-addr-province').value,
                    wardName: document.getElementById('new-addr-ward').value,
                    address: document.getElementById('new-addr-detail').value
                };
                
                const userRef = doc(db, "users", auth.currentUser.uid);
                await updateDoc(userRef, {
                    addresses: arrayUnion(newAddress)
                });
                
                showToast("Thêm địa chỉ thành công!");
                formAddAddress.reset();
                if(closeAddressModal) closeAddressModal.click();
                if (typeof fetchAddresses === "function") {
                    fetchAddresses(auth.currentUser.uid);
                }
            } catch (error) {
                console.error(error);
                showToast("Lỗi khi thêm địa chỉ: " + error.message, "error");
            } finally {
                if(btnSave) {
                    btnSave.disabled = false;
                    btnSave.innerText = "Lưu Địa Chỉ";
                }
            }
        };
    }
});

window.repayVNPay = async (orderId, amount) => {
    const btn = document.getElementById(`repay-btn-${orderId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Đang tạo link...';
    }
    try {
        const functions = getFunctions(db.app);
        const createVNPayUrl = httpsCallable(functions, 'createVNPayUrl');
        const result = await createVNPayUrl({
            orderId: orderId,
            amount: amount,
            orderInfo: `Thanh toan don hang ${orderId} tai Tiem Nha Gom`
        });
        if (result.data && result.data.success && result.data.url) {
            window.location.href = result.data.url;
        } else {
            throw new Error("Không lấy được URL VNPay.");
        }
    } catch (e) {
        console.error("Lỗi khi tạo lại URL thanh toán VNPay:", e);
        showToast("Có lỗi xảy ra khi tạo link thanh toán.", "error");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Thanh toán lại';
        }
    }
};

