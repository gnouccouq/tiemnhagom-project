import { db, initHeader, renderProductCard } from "./utils.js";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

async function fetchRecentArticles(currentId) {
    const container = document.getElementById('recent-articles-list');
    if (!container) return;
    try {
        const q = query(
            collection(db, "news"), 
            where("status", "==", "published"),
            orderBy("createdAt", "desc"),
            limit(4)
        );
        const snap = await getDocs(q);
        
        const articlesHtml = [];
        snap.forEach(docSnap => {
            if (docSnap.id === currentId && articlesHtml.length < 3) return;
            if (articlesHtml.length >= 3) return;

            const n = docSnap.data();
            const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : '';
            articlesHtml.push(`
                <div class="sidebar-article">
                    <a href="article.html?id=${docSnap.id}">
                        <img src="${n.imageUrl}" alt="${n.title}">
                    </a>
                    <div>
                        <h4><a href="article.html?id=${docSnap.id}">${n.title}</a></h4>
                        <div class="date">${date}</div>
                    </div>
                </div>
            `);
        });

        if (articlesHtml.length === 0) {
            container.innerHTML = "<p>Chưa có bài viết khác.</p>";
        } else {
            container.innerHTML = articlesHtml.join('');
        }
    } catch (e) {
        console.error("Lỗi lấy bài viết gần đây:", e);
        container.innerHTML = "<p>Lỗi tải bài viết.</p>";
    }
}

async function fetchSuggestedProducts() {
    const container = document.getElementById('suggested-products-list');
    if (!container) return;
    try {
        const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(4));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.parentElement.style.display = 'none';
            return;
        }

        const productsHtml = snap.docs.map(docSnap => {
            return renderProductCard(docSnap.data(), docSnap.id, [], '../product/index.html');
        }).join('');
        
        container.innerHTML = productsHtml;
    } catch (e) {
        console.error("Lỗi lấy sản phẩm gợi ý:", e);
        container.innerHTML = "<p>Lỗi tải sản phẩm.</p>";
    }
}

async function fetchArticle() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const container = document.getElementById('article-main');
    
    if (!id) {
        container.innerHTML = "<p style='text-align:center;'>Bài viết không tồn tại.</p>";
        return;
    }

    try {
        const docSnap = await getDoc(doc(db, "news", id));
        if (!docSnap.exists()) {
            container.innerHTML = "<p style='text-align:center;'>Bài viết không tồn tại.</p>";
            return;
        }

        const n = docSnap.data();
        if (n.status !== 'published') {
            container.innerHTML = "<p style='text-align:center;'>Bài viết chưa được xuất bản.</p>";
            return;
        }

        const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : '';
        const author = n.author || 'Tiệm Nhà Gốm';
        const shareUrl = `https://tiemnhagom-project.web.app/share?type=news&id=${id}`;
        const urlStr = encodeURIComponent(shareUrl);
        const encodedTitle = encodeURIComponent(`${n.title} | Tiệm Nhà Gốm`);

        document.title = `${n.title} | Tiệm Nhà Gốm`;

        // SEO: Cập nhật thẻ Meta Description, Open Graph, Twitter
        const excerptText = n.excerpt || (n.content ? n.content.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...' : '');
        const updateMeta = (nameAttr, nameVal, content) => {
            let el = document.querySelector(`meta[${nameAttr}="${nameVal}"]`);
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(nameAttr, nameVal);
                document.head.appendChild(el);
            }
            el.setAttribute('content', content);
        };
        updateMeta('name', 'description', excerptText);
        updateMeta('property', 'og:title', `${n.title} | Tiệm Nhà Gốm`);
        updateMeta('property', 'og:description', excerptText);
        updateMeta('property', 'og:image', n.imageUrl);
        updateMeta('property', 'og:url', window.location.href);
        updateMeta('name', 'twitter:title', `${n.title} | Tiệm Nhà Gốm`);
        updateMeta('name', 'twitter:description', excerptText);
        updateMeta('name', 'twitter:image', n.imageUrl);

        // Cập nhật Canonical URL
        let canonicalEl = document.querySelector('link[rel="canonical"]');
        if (!canonicalEl) {
            canonicalEl = document.createElement('link');
            canonicalEl.setAttribute('rel', 'canonical');
            document.head.appendChild(canonicalEl);
        }
        canonicalEl.setAttribute('href', window.location.href.split('?')[0] + '?id=' + id);
        const breadcrumbContainer = document.getElementById('breadcrumb-container');
        if (breadcrumbContainer) {
            breadcrumbContainer.innerHTML = `
                <div class="article-breadcrumb">
                    <a href="../index.html">Trang chủ</a> <span class="separator">›</span>
                    <a href="index.html">Blog</a> <span class="separator">›</span>
                    <span class="current">${n.title}</span>
                </div>
            `;
        }

        window.copyArticleLink = () => {
            const shareUrl = `https://tiemnhagom-project.web.app/share?type=news&id=${id}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert('Đã sao chép liên kết chia sẻ!');
            }).catch(e => {
                console.error('Lỗi sao chép', e);
            });
        };

        window.submitFeedback = (isSatisfied, btn) => {
            const container = btn.parentElement;
            const btns = container.querySelectorAll('.feedback-btn');
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Here you could send this feedback to Firestore if needed
            // e.g., updateDoc(doc(db, "news", id), { positiveFeedback: increment(1) })
            
            alert(isSatisfied ? "Cảm ơn bạn đã đánh giá bài viết hữu ích! 🥰" : "Cảm ơn bạn đã góp ý. Chúng tôi sẽ cải thiện bài viết! 😞");
        };

        container.innerHTML = `
            <div class="article-header">
                <h1 class="article-title">${n.title}</h1>
                <div class="article-meta-row">
                    <div class="article-meta-info">${date} | <strong>Blog</strong></div>
                    <div class="article-share">
                        <span>Chia sẻ</span>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${urlStr}" target="_blank" title="Chia sẻ qua Facebook">
                            <svg viewBox="0 0 320 512"><path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/></svg>
                        </a>
                        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${urlStr}" target="_blank" title="Chia sẻ qua LinkedIn">
                            <svg viewBox="0 0 448 512"><path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z"/></svg>
                        </a>
                        <a href="https://twitter.com/intent/tweet?url=${urlStr}&text=${encodedTitle}" target="_blank" title="Chia sẻ qua Twitter">
                            <svg viewBox="0 0 512 512"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>
                        </a>
                        <button onclick="copyArticleLink()" title="Sao chép liên kết">
                            <svg viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114l-114 114c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5l114-114c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <img src="${n.imageUrl}" alt="${n.title}" class="article-cover">
            <div class="ql-snow">
                <div class="ql-editor" style="padding: 0;">
                    ${n.content}
                </div>
            </div>
            
            <div class="article-feedback-container">
                <div class="feedback-question">Bạn có hài lòng với bài viết này không ?</div>
                <button class="feedback-btn" onclick="submitFeedback(true, this)">🥰 Hài lòng</button>
                <button class="feedback-btn" onclick="submitFeedback(false, this)">😞 Không hài lòng</button>
            </div>
            
            <a href="index.html" class="article-back-btn">
                &larr; QUAY TRỞ LẠI "Blog"
            </a>
        `;

        fetchRecentArticles(id);
        fetchSuggestedProducts();
    } catch (e) { 
        console.error(e);
        container.innerHTML = "<p style='text-align:center;'>Đã xảy ra lỗi khi tải bài viết.</p>";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', () => fetchArticle());
});
