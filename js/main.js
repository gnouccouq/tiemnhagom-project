// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"; // Firebase App (core)
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // Firestore
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; // Firebase Auth

const firebaseConfig = {
    apiKey: "AIzaSyAl-Hlzfu4naiUMIuwJTnw8bXsDB4wY7zs",
    authDomain: "tiemnhagom-project.firebaseapp.com",
    projectId: "tiemnhagom-project", // Đảm bảo project ID của bạn là chính xác
    storageBucket: "tiemnhagom-project.firebasestorage.app",
    messagingSenderId: "571834989973",
    appId: "1:571834989973:web:4cf2d4e9aa832327afca9c",
    measurementId: "G-4FNKRZ13JC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Khởi tạo Firebase Auth
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider(); // Khởi tạo Google Auth Provider

// Hàm tải các component dùng chung (header, footer)
async function loadComponents() {
    try {
        // Tải Header
        const headerResponse = await fetch('components/header.html');
        if (headerResponse.ok) {
            const headerHtml = await headerResponse.text();
            document.getElementById('header-placeholder').innerHTML = headerHtml;
            // Sau khi header được tải, mới setup auth listener
            setupAuthListener();
        } else {
            console.error("Không thể tải header:", headerResponse.statusText);
        }

        // Tải Footer
        const footerResponse = await fetch('components/footer.html');
        if (footerResponse.ok) {
            const footerHtml = await footerResponse.text();
            document.getElementById('footer-placeholder').innerHTML = footerHtml;
            
            // Sau khi footer loaded, gán sự kiện cho nút cuộn trang
            setupScrollToTop();
        } else {
            console.error("Không thể tải footer:", footerResponse.statusText);
        }
    } catch (error) {
        console.error("Lỗi khi tải components:", error);
    }
}

function setupScrollToTop() {
    const btnScrollTop = document.getElementById('btn-scroll-top');
    if (!btnScrollTop) return;

    // Hiện nút khi cuộn xuống 300px
    window.onscroll = function() {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btnScrollTop.classList.add('show');
        } else {
            btnScrollTop.classList.remove('show');
        }
    };

    // Xử lý sự kiện click
    btnScrollTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Hàm lấy sản phẩm tiêu biểu
async function fetchFeaturedProducts() {
    const grid = document.getElementById('product-grid');
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        let htmlContent = ''; // Sử dụng biến tạm để tối ưu hiệu suất

        querySnapshot.forEach((doc) => {
            const product = doc.data();
            htmlContent += `
                <div class="product-card">
                    <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" 
                         alt="${product.name}" 
                         style="width:100%; object-fit: cover; aspect-ratio: 1/1;">
                    <h3>${product.name}</h3>
                    <p class="price">${new Intl.NumberFormat('vi-VN').format(product.price)}đ</p>
                </div>
            `;
        });
        grid.innerHTML = htmlContent || '<p>Hiện chưa có sản phẩm nào.</p>';
    } catch (error) {
        console.error("Lỗi lấy dữ liệu sản phẩm:", error);
        grid.innerHTML = '<p>Không thể tải sản phẩm. Vui lòng thử lại sau.</p>';
    }
}

// Hàm đăng nhập bằng Google
async function loginWithGoogle() {
    try {
        await signInWithPopup(auth, googleProvider);
        // onAuthStateChanged sẽ tự động cập nhật UI
    } catch (error) {
        console.error("Lỗi đăng nhập Google:", error.code, error.message);
        alert("Đăng nhập thất bại: " + error.message);
    }
}

// Hàm đăng xuất
async function logout() {
    try {
        await signOut(auth);
        // onAuthStateChanged sẽ tự động cập nhật UI
    } catch (error) {
        console.error("Lỗi đăng xuất:", error.code, error.message);
        alert("Đăng xuất thất bại: " + error.message);
    }
}

// Hàm thiết lập listener cho trạng thái đăng nhập
function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        const authSection = document.getElementById('auth-section');
        if (authSection) {
            if (user) {
                // Người dùng đã đăng nhập
                authSection.innerHTML = `
                    <span class="user-info">Xin chào, ${user.displayName || user.email}!</span>
                    <button id="btn-logout" class="btn-minimal">Đăng xuất</button>
                `;
                document.getElementById('btn-logout').addEventListener('click', logout);
            } else {
                // Người dùng chưa đăng nhập
                authSection.innerHTML = `
                    <button id="btn-login" class="btn-minimal">Đăng nhập</button>
                `;
                document.getElementById('btn-login').addEventListener('click', loginWithGoogle);
            }
        }
    });
}

// Chạy các hàm khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', () => {
    loadComponents().then(() => {
        // Sau khi components được tải và auth listener được setup,
        // mới gọi fetchFeaturedProducts để đảm bảo mọi thứ sẵn sàng
        fetchFeaturedProducts();
    });
});
