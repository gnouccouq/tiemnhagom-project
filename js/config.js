// js/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
    getAuth, GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
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
    
    // Nhận diện Safari hoặc iOS để tối ưu Firestore (lỗi WebSocket và IndexedDB lock)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    try {
        if (isInAppBrowser || isIOS || isSafari) {
            // Safari/iOS thường bị treo WebSocket 10s trước khi fallback, nên bắt buộc dùng LongPolling.
            // Đồng thời bỏ MultipleTabManager để tránh lỗi treo do IndexedDB lock.
            dbInstance = initializeFirestore(app, {
                experimentalForceLongPolling: true,
                ignoreUndefinedProperties: true
            });
        } else {
            dbInstance = initializeFirestore(app, {
                localCache: persistentLocalCache({
                    tabManager: persistentMultipleTabManager()
                }),
                ignoreUndefinedProperties: true
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

