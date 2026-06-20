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
    measurementId: "G-4FNKRZ13JC"
};

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase Initialization Error: Có thể SDK bị chặn bởi Ad-blocker.", error);
}

export const db = app ? initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
}) : null;

export const auth = app ? getAuth(app) : null;
export const analytics = app ? getAnalytics(app) : null;
export const storage = app ? getStorage(app) : null;
export const googleProvider = new GoogleAuthProvider();
