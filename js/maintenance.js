// d:\tiemnhagom-project\js\maintenance.js
import { db } from "./utils.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const maintenanceLabel = document.getElementById('maintenance-label');
    const maintenanceH1 = document.getElementById('maintenance-h1');
    const maintenanceP = document.getElementById('maintenance-p');
    const countdownTimerDiv = document.querySelector('.countdown-timer');
    const backToHomeBtn = document.querySelector('.countdown-hero .btn-outline');

    const systemRef = doc(db, "settings", "system");
    let countdownFunction;

    const updateTimerElement = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = String(value).padStart(2, '0');
        return !!el;
    };

    const initMaintenancePage = async () => {
        const snap = await getDoc(systemRef);
        if (!snap.exists() || !snap.data().maintenanceMode) {
            // Nếu chế độ bảo trì đang TẮT, chuyển hướng về trang chủ
            window.location.href = "../";
            return;
        }

        const settings = snap.data();
        const launchDate = settings.countdownDate ? settings.countdownDate.toDate().getTime() : null;

        if (maintenanceH1) maintenanceH1.innerText = settings.maintenanceTitle || "Sắp Ra Mắt!";
        if (maintenanceP) maintenanceP.innerText = settings.maintenanceMessage || "Chúng tôi đang hoàn thiện những khâu cuối cùng.";
        if (maintenanceLabel) maintenanceLabel.innerText = "SẮP RA MẮT";

        if (!launchDate) {
            // Nếu không có ngày đếm ngược, ẩn timer
            if (countdownTimerDiv) countdownTimerDiv.style.display = 'none';
            return;
        }

        countdownFunction = setInterval(() => {
            const now = new Date().getTime();
            const distance = launchDate - now;

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            updateTimerElement('days', days);
            updateTimerElement('hours', hours);
            updateTimerElement('minutes', minutes);
            updateTimerElement('seconds', seconds);

            if (distance <= 0) {
                clearInterval(countdownFunction);
                if (maintenanceH1) maintenanceH1.innerText = "Tiệm Nhà Gốm Đã Khai Trương!";
                if (maintenanceP) maintenanceP.innerText = "Chào mừng bạn đến với bộ sưu tập gốm thủ công mới nhất của chúng tôi. Hãy khám phá ngay!";
                if (countdownTimerDiv) countdownTimerDiv.style.display = 'none';
                if (backToHomeBtn) {
                    backToHomeBtn.innerText = "Khám phá ngay";
                    backToHomeBtn.href = "../products/";
                }

                // TỰ ĐỘNG TẮT CHẾ ĐỘ BẢO TRÌ TRÊN DATABASE
                updateDoc(systemRef, { maintenanceMode: false }).catch(err => {
                    console.warn("Không thể tự động cập nhật trạng thái bảo trì (có thể do phân quyền):", err);
                });
            }
        }, 1000);
    };

    initMaintenancePage();
});