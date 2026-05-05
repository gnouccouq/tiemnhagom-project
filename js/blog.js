import { db, initHeader } from "./utils.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function fetchNews() {
    const container = document.getElementById('blog-list');
    try {
        const q = query(
            collection(db, "news"), 
            where("status", "==", "published"),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = "<p style='text-align:center; grid-column:1/-1;'>Hiện chưa có bài viết nào.</p>";
            return;
        }

        container.innerHTML = snap.docs.map(doc => {
            const n = doc.data();
            const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Mới đây';
            return `
                <article class="blog-card">
                    <img src="${n.imageUrl}" alt="${n.title}" class="blog-img">
                    <div class="blog-info">
                        <span class="blog-date">${date}</span>
                        <h3>${n.title}</h3>
                        <p>${n.excerpt || ''}</p>
                        <a href="article.html?id=${doc.id}" class="btn-outline" style="padding: 0.5rem 1.2rem; font-size: 0.8rem;">Đọc tiếp</a>
                    </div>
                </article>`;
        }).join('');
    } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', () => fetchNews());
});
