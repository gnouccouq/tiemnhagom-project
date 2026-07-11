// js/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getAuth, GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import * as emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';

// BẢO MẬT: Khuyến nghị mạnh mẽ thiết lập Origin Restriction trên trang quản trị EmailJS
// để ngăn chặn domain khác sử dụng Public Key này.
emailjs.init("7kkSVeK5WhKKmizOZ");

const firebaseConfig = {
    apiKey: "AIzaSyAl-Hlzfu4naiUMIuwJTnw8bXsDB4wY7zs",
    authDomain: "tiemnhagom-project.firebaseapp.com",
    projectId: "tiemnhagom-project",
    storageBucket: "tiemnhagom-project.firebasestorage.app",
    messagingSenderId: "571834989973",
    appId: "1:571834989973:web:4cf2d4e9aa832327afca9c",
    measurementId: "G-4FNKRZ13JC",
    databaseURL: "https://tiemnhagom-project-default-rtdb.asia-southeast1.firebasedatabase.app"
};

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase Initialization Error: Có thể SDK bị chặn bởi Ad-blocker.", error);
}

let dbInstance = null;
if (app) {
    // Nhận diện trình duyệt trong ứng dụng (Zalo, Facebook, Instagram...)
    const isInAppBrowser = /Zalo|FBAN|FBAV|Instagram|Messenger|Line|TikTok/i.test(navigator.userAgent);
    
    try {
        if (isInAppBrowser) {
            // Trình duyệt nhúng thường bị lỗi với IndexedDB và WebSockets
            dbInstance = initializeFirestore(app, {
                experimentalForceLongPolling: true
                // Bỏ qua persistentLocalCache để dùng memory mặc định tránh lỗi
            });
        } else {
            dbInstance = initializeFirestore(app, {
                localCache: persistentLocalCache({
                    // Dùng MultipleTab để hỗ trợ mở nhiều tab cùng lúc mà không bị lỗi Failed precondition
                    tabManager: persistentMultipleTabManager()
                })
            });
        }
    } catch (e) {
        console.error("Lỗi khởi tạo Firestore:", e);
    }
}

export const db = dbInstance;

export const auth = app ? getAuth(app) : null;
export const analytics = app ? getAnalytics(app) : null;
export const storage = app ? getStorage(app) : null;
export const rtdb = app ? getDatabase(app) : null;
export const googleProvider = new GoogleAuthProvider();
