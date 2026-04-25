// js/main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"; // Firebase App (core)
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // Firestore
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; // Firebase Auth

const firebaseConfig = {
    apiKey: "AIzaSyAl-Hlzfu4naiUMIuwJTnw8bXsDB4wY7zs",
    authDomain: "tiemnhagom-project.firebaseapp.com",
    projectId: "tiemnhagom-project",
    storageBucket: "tiemnhagom-project.firebasestorage.app",
    messagingSenderId: "571834989973",
    appId: "1:571834989973:web:4cf2d4e9aa832327afca9c",
    measurementId: "G-4FNKRZ13JC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Khởi tạo Firebase Auth
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider(); // Khởi tạo Google Auth Provider


// Hàm lấy sản phẩm tiêu biểu
async function fetchFeaturedProducts() {
    const querySnapshot = await getDocs(collection(db, "products"));
    const grid = document.getElementById('product-grid');
    grid.innerHTML = ''; // Xóa skeleton

    querySnapshot.forEach((doc) => {
        const product = doc.data();
        grid.innerHTML += `
            <div class="product-card">
                <img src="${product.imageUrl || 'https://via.placeholder.com/300'}" alt="${product.name}" style="width:100%">
                <h3>${product.name}</h3>
                <p>${new Intl.NumberFormat('vi-VN').format(product.price)}đ</p>
            </div>
        `;
    });
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

// Cập nhật UI khi trạng thái đăng nhập thay đổi
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

// Gắn sự kiện cho nút đăng nhập ban đầu (trước khi onAuthStateChanged chạy lần đầu)
// Đảm bảo nút này tồn tại khi script chạy
document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', loginWithGoogle);
    }
});

// Gọi hàm fetchFeaturedProducts khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', fetchFeaturedProducts);
