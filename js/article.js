import { db, initHeader, renderProductCard, showToast, escapeHTML } from "./utils.js";
import { initReadingProgressBar } from "./motion.js";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let unsubscribeArticleStats = null;
let tocObserver = null;
let lightboxKeyHandler = null;

function cleanupArticleListeners() {
    if (unsubscribeArticleStats) {
        unsubscribeArticleStats();
        unsubscribeArticleStats = null;
    }
    if (tocObserver) {
        tocObserver.disconnect();
        tocObserver = null;
    }
    if (lightboxKeyHandler) {
        window.removeEventListener('keydown', lightboxKeyHandler);
        lightboxKeyHandler = null;
    }
}

window.addEventListener('pagehide', cleanupArticleListeners);

function isLocalHostname() {
    return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}

function isPublicProduct(p) {
    return Boolean(p) && !p.isHidden && !p.isOnlyEvent;
}

function parseProductCreatedMs(p) {
    if (!p || !p.createdAt) return 0;
    if (typeof p.createdAt.toMillis === 'function') return p.createdAt.toMillis();
    if (typeof p.createdAt.toDate === 'function') return p.createdAt.toDate().getTime();
    if (typeof p.createdAt === 'number') return p.createdAt < 1e11 ? p.createdAt * 1000 : p.createdAt;
    const parsed = Date.parse(p.createdAt);
    return Number.isNaN(parsed) ? 0 : parsed;
}

export function computeReadingMinutes(html) {
    const plain = String(html || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    return Math.max(1, Math.ceil(words / 220));
}

export function extractArticleTags(n = {}) {
    const raw = [n.seoFocusKeyword, n.seoKeywords]
        .map(v => String(v || ''))
        .join(',')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
    const seen = new Set();
    const tags = [];
    for (const t of raw) {
        const key = t.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            tags.push(t);
            if (tags.length >= 10) break;
        }
    }
    return tags;
}

function initArticleRealtimeStats(articleId, initialStats = {}) {
    if (!articleId) return;
    if (unsubscribeArticleStats) {
        unsubscribeArticleStats();
        unsubscribeArticleStats = null;
    }

    let lastDisplayedViews = Math.max(0, Number(initialStats.views) || 0);
    const articleRef = doc(db, "news", articleId);

    unsubscribeArticleStats = onSnapshot(articleRef, (liveSnap) => {
        if (!liveSnap.exists()) return;
        const data = liveSnap.data() || {};
        const liveViews = Math.max(0, Number(data.views) || 0);
        const liveYes = Math.max(0, Number(data.helpfulYes) || 0);
        const liveNo = Math.max(0, Number(data.helpfulNo) || 0);

        const countEl = document.getElementById('article-views-count');
        const badgeEl = document.getElementById('article-views-badge');
        const yesEl = document.getElementById('feedback-yes-count');
        const noEl = document.getElementById('feedback-no-count');

        if (countEl) countEl.textContent = liveViews.toLocaleString('vi-VN');
        if (yesEl) yesEl.textContent = liveYes.toLocaleString('vi-VN');
        if (noEl) noEl.textContent = liveNo.toLocaleString('vi-VN');

        if (badgeEl && liveViews > lastDisplayedViews) {
            badgeEl.classList.remove('is-updated');
            void badgeEl.offsetWidth;
            badgeEl.classList.add('is-updated');
            setTimeout(() => badgeEl.classList.remove('is-updated'), 450);
        }
        lastDisplayedViews = liveViews;
    }, (err) => {
        console.warn('Không thể lắng nghe thống kê realtime:', err?.code || err);
    });

    if (navigator.webdriver === true) return;

    const storageKey = `tng_viewed_article_${articleId}`;
    let alreadyCounted = false;
    try {
        alreadyCounted = Boolean(window.sessionStorage && window.sessionStorage.getItem(storageKey));
    } catch (_) {}

    if (!alreadyCounted) {
        updateDoc(articleRef, { views: increment(1) })
            .then(() => {
                try {
                    if (window.sessionStorage) {
                        window.sessionStorage.setItem(storageKey, String(Date.now()));
                    }
                } catch (_) {}
            })
            .catch((err) => {
                console.warn('Không thể cập nhật lượt xem bài viết:', err?.code || err);
            });
    }
}

function initArticleTOC(container) {
    if (tocObserver) {
        tocObserver.disconnect();
        tocObserver = null;
    }

    const desktopWidget = document.getElementById('article-toc-widget');
    const desktopList = document.getElementById('article-toc-list');
    const mobileWrapper = document.getElementById('article-toc-mobile');

    const headings = Array.from(container.querySelectorAll('.ql-editor h2, .ql-editor h3'))
        .filter(el => el.textContent && el.textContent.trim().length > 0);

    if (headings.length < 2) {
        if (desktopWidget) desktopWidget.hidden = true;
        if (mobileWrapper) mobileWrapper.hidden = true;
        return;
    }

    const usedIds = new Set();
    const items = headings.map((h, idx) => {
        let hid = (h.id || '').trim();
        if (!hid || usedIds.has(hid)) {
            hid = `toc-${idx + 1}`;
        }
        usedIds.add(hid);
        h.id = hid;
        return {
            id: hid,
            text: h.textContent.trim(),
            isH3: h.tagName === 'H3',
            el: h
        };
    });

    const listHtml = items.map(it => (
        `<li><a href="#${escapeHTML(it.id)}" class="article-toc-link${it.isH3 ? ' is-h3' : ''}">${escapeHTML(it.text)}</a></li>`
    )).join('');

    if (desktopList && desktopWidget) {
        desktopList.innerHTML = listHtml;
        desktopWidget.hidden = false;
    }
    if (mobileWrapper) {
        mobileWrapper.innerHTML = `
            <details class="article-toc-mobile-box">
                <summary>Mục lục bài viết</summary>
                <ul class="article-toc-list">${listHtml}</ul>
            </details>
        `;
        mobileWrapper.hidden = false;
    }

    const allLinks = Array.from(document.querySelectorAll('.article-toc-list .article-toc-link'));
    const setActiveToc = (activeId) => {
        allLinks.forEach(a => {
            const match = a.getAttribute('href') === `#${activeId}`;
            a.classList.toggle('active', match);
        });
    };

    allLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = (link.getAttribute('href') || '').replace(/^#/, '');
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveToc(targetId);
            const mobileDetails = link.closest('details');
            if (mobileDetails) mobileDetails.open = false;
        });
    });

    if (items[0]) setActiveToc(items[0].id);

    if (typeof IntersectionObserver === 'function') {
        tocObserver = new IntersectionObserver((entries) => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visible.length > 0) {
                setActiveToc(visible[0].target.id);
            }
        }, {
            rootMargin: '-95px 0px -65% 0px',
            threshold: [0, 0.25]
        });

        items.forEach(it => tocObserver.observe(it.el));
    }
}

function initArticleLightbox(container) {
    if (lightboxKeyHandler) {
        window.removeEventListener('keydown', lightboxKeyHandler);
        lightboxKeyHandler = null;
    }

    const modal = document.getElementById('article-lightbox');
    const imgEl = document.getElementById('article-lightbox-img');
    const captionEl = document.getElementById('article-lightbox-text');
    const counterEl = document.getElementById('article-lightbox-counter');
    const closeBtn = document.getElementById('article-lightbox-close');
    const prevBtn = document.getElementById('article-lightbox-prev');
    const nextBtn = document.getElementById('article-lightbox-next');

    if (!modal || !imgEl) return;

    const images = Array.from(container.querySelectorAll('.article-cover, .ql-editor img'))
        .filter(node => Boolean((node.getAttribute('src') || node.src || '').trim()));

    if (images.length === 0) return;

    let currentIdx = 0;

    const showImage = (idx) => {
        currentIdx = (idx + images.length) % images.length;
        const target = images[currentIdx];
        imgEl.src = target.currentSrc || target.src;
        imgEl.alt = target.alt || 'Ảnh minh họa Tiệm Nhà Gốm';
        if (captionEl) captionEl.textContent = target.alt || '';
        if (counterEl) counterEl.textContent = images.length > 1 ? `${currentIdx + 1} / ${images.length}` : '';
        if (prevBtn) prevBtn.hidden = images.length <= 1;
        if (nextBtn) nextBtn.hidden = images.length <= 1;
    };

    const openLightbox = (idx) => {
        showImage(idx);
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    const closeLightbox = () => {
        if (modal.hidden) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    images.forEach((node, idx) => {
        if (node.dataset.lightboxBound === '1') return;
        node.dataset.lightboxBound = '1';
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        if (!node.getAttribute('title')) {
            node.setAttribute('title', 'Bấm để phóng to ảnh');
        }
        node.addEventListener('click', (e) => {
            e.preventDefault();
            openLightbox(idx);
        });
        node.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openLightbox(idx);
            }
        });
    });

    if (closeBtn) closeBtn.onclick = closeLightbox;
    if (prevBtn) prevBtn.onclick = () => showImage(currentIdx - 1);
    if (nextBtn) nextBtn.onclick = () => showImage(currentIdx + 1);
    modal.onclick = (e) => {
        if (e.target === modal) closeLightbox();
    };

    lightboxKeyHandler = (e) => {
        if (modal.hidden) return;
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft' && images.length > 1) {
            showImage(currentIdx - 1);
        } else if (e.key === 'ArrowRight' && images.length > 1) {
            showImage(currentIdx + 1);
        }
    };
    window.addEventListener('keydown', lightboxKeyHandler);
}

async function fetchArticleNavigationAndRecent(currentId) {
    const recentContainer = document.getElementById('recent-articles-list');
    const prevNextContainer = document.getElementById('article-prev-next');
    const isLocalHost = isLocalHostname();

    const buildArticleUrl = (docSnap) => {
        const data = docSnap.data() || {};
        const articleKey = encodeURIComponent(data.slug || docSnap.id);
        return isLocalHost ? `article.html?id=${articleKey}` : `/blog/${articleKey}`;
    };

    try {
        const q = query(
            collection(db, "news"),
            where("status", "==", "published"),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const docs = snap.docs;

        if (recentContainer) {
            const recentHtml = [];
            for (const docSnap of docs) {
                if (docSnap.id === currentId) continue;
                if (recentHtml.length >= 3) break;
                const n = docSnap.data();
                const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : '';
                const views = Math.max(0, Number(n.views) || 0);
                const articleHref = buildArticleUrl(docSnap);
                recentHtml.push(`
                    <div class="sidebar-article">
                        <a href="${articleHref}">
                            <img src="${escapeHTML(n.imageUrl)}" alt="${escapeHTML(n.title)}">
                        </a>
                        <div>
                            <h4><a href="${articleHref}">${escapeHTML(n.title)}</a></h4>
                            <div class="date">${date}${date ? ' · ' : ''}${views.toLocaleString('vi-VN')} lượt xem</div>
                        </div>
                    </div>
                `);
            }
            recentContainer.innerHTML = recentHtml.length > 0
                ? recentHtml.join('')
                : "<p>Chưa có bài viết khác.</p>";
        }

        if (prevNextContainer) {
            const currentIdx = docs.findIndex(d => d.id === currentId);
            const newerDoc = currentIdx > 0 ? docs[currentIdx - 1] : null;
            const olderDoc = currentIdx !== -1 && currentIdx < docs.length - 1 ? docs[currentIdx + 1] : null;

            if (!newerDoc && !olderDoc) {
                prevNextContainer.innerHTML = '';
                prevNextContainer.hidden = true;
            } else {
                const cards = [];
                if (newerDoc) {
                    const nd = newerDoc.data();
                    cards.push(`
                        <a href="${buildArticleUrl(newerDoc)}" class="article-prev-next-card is-prev">
                            <img src="${escapeHTML(nd.imageUrl || '../Asset/images/logo.webp')}" alt="${escapeHTML(nd.title || '')}" class="article-prev-next-thumb" loading="lazy">
                            <div class="article-prev-next-body">
                                <span class="article-prev-next-dir">&larr; Bài viết mới hơn</span>
                                <span class="article-prev-next-title">${escapeHTML(nd.title || '')}</span>
                            </div>
                        </a>
                    `);
                } else {
                    cards.push('<div></div>');
                }
                if (olderDoc) {
                    const od = olderDoc.data();
                    cards.push(`
                        <a href="${buildArticleUrl(olderDoc)}" class="article-prev-next-card is-next">
                            <img src="${escapeHTML(od.imageUrl || '../Asset/images/logo.webp')}" alt="${escapeHTML(od.title || '')}" class="article-prev-next-thumb" loading="lazy">
                            <div class="article-prev-next-body">
                                <span class="article-prev-next-dir">Bài viết tiếp theo &rarr;</span>
                                <span class="article-prev-next-title">${escapeHTML(od.title || '')}</span>
                            </div>
                        </a>
                    `);
                }
                prevNextContainer.innerHTML = cards.join('');
                prevNextContainer.hidden = false;
            }
        }
    } catch (e) {
        console.error("Lỗi lấy bài viết gần đây và điều hướng:", e);
        if (recentContainer) recentContainer.innerHTML = "<p>Lỗi tải bài viết.</p>";
    }
}

async function fetchSuggestedProducts(relatedProductIds = []) {
    const container = document.getElementById('suggested-products-list');
    if (!container) return;
    const isLocalHost = isLocalHostname();
    const productLinkBase = isLocalHost ? '../product/index.html' : '/product/index.html';
    const headingEl = container.parentElement?.querySelector('h3');

    try {
        const requestedIds = Array.isArray(relatedProductIds)
            ? Array.from(new Set(relatedProductIds.map(v => String(v || '').trim()).filter(Boolean))).slice(0, 4)
            : [];

        const selectedDocs = [];
        const selectedIds = new Set();

        if (requestedIds.length > 0) {
            const snaps = await Promise.all(
                requestedIds.map(pid => getDoc(doc(db, "products", pid)).catch(() => null))
            );
            snaps.forEach(s => {
                if (s && s.exists() && isPublicProduct(s.data()) && !selectedIds.has(s.id)) {
                    selectedDocs.push(s);
                    selectedIds.add(s.id);
                }
            });
        }

        if (headingEl) {
            headingEl.textContent = selectedDocs.length > 0 ? 'Sản phẩm liên quan trong bài' : 'Sản phẩm gợi ý';
        }

        if (selectedDocs.length < 4) {
            const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(40));
            const snap = await getDocs(q);
            let pool = snap.docs.filter(d => !selectedIds.has(d.id) && isPublicProduct(d.data()));

            if (selectedDocs.length + pool.length < 4) {
                const fullSnap = await getDocs(collection(db, "products"));
                pool = fullSnap.docs
                    .filter(d => !selectedIds.has(d.id) && isPublicProduct(d.data()))
                    .sort((a, b) => parseProductCreatedMs(b.data()) - parseProductCreatedMs(a.data()));
            }

            for (const d of pool) {
                if (selectedDocs.length >= 4) break;
                selectedDocs.push(d);
                selectedIds.add(d.id);
            }
        }

        if (selectedDocs.length === 0) {
            if (container.parentElement) container.parentElement.style.display = 'none';
            return;
        }

        const productsHtml = selectedDocs.slice(0, 4).map(docSnap => {
            return renderProductCard(docSnap.data(), docSnap.id, [], productLinkBase);
        }).join('');

        container.innerHTML = productsHtml;
    } catch (e) {
        console.error("Lỗi lấy sản phẩm gợi ý:", e);
        container.innerHTML = "<p>Lỗi tải sản phẩm.</p>";
    }
}

function resolveArticleKeyFromLocation() {
    if (window.__TNG_SSR_ARTICLE_ID__) return String(window.__TNG_SSR_ARTICLE_ID__);
    const urlParams = new URLSearchParams(window.location.search);
    const queryId = urlParams.get('id');
    if (queryId) return queryId;
    const parts = (window.location.pathname || '').split('/').filter(Boolean);
    const blogIdx = parts.lastIndexOf('blog');
    if (blogIdx !== -1 && parts[blogIdx + 1]) {
        try {
            const seg = decodeURIComponent(parts[blogIdx + 1]).trim();
            if (seg && seg !== 'article.html' && seg !== 'index.html') return seg;
        } catch (_) {}
    }
    return null;
}

async function fetchArticle() {
    const key = resolveArticleKeyFromLocation();
    const container = document.getElementById('article-main');
    if (!container) return;

    if (!key) {
        container.innerHTML = "<p style='text-align:center;'>Bài viết không tồn tại.</p>";
        return;
    }

    try {
        let docSnap = await getDoc(doc(db, "news", key));
        if (!docSnap.exists()) {
            const slugSnap = await getDocs(query(collection(db, "news"), where("slug", "==", key), limit(1)));
            if (!slugSnap.empty) {
                docSnap = slugSnap.docs[0];
            }
        }
        if (!docSnap.exists()) {
            container.innerHTML = "<p style='text-align:center;'>Bài viết không tồn tại.</p>";
            return;
        }

        const id = docSnap.id;
        const n = docSnap.data();
        if (n.status !== 'published') {
            container.innerHTML = "<p style='text-align:center;'>Bài viết chưa được xuất bản.</p>";
            return;
        }

        const isLocalHost = isLocalHostname();
        const homeHref = isLocalHost ? '../index.html' : '/';
        const blogListHref = isLocalHost ? 'index.html' : '/blog/';

        const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : '';
        const dateIso = n.createdAt && typeof n.createdAt.toDate === 'function'
            ? n.createdAt.toDate().toISOString()
            : '';
        const updatedIso = n.updatedAt && typeof n.updatedAt.toDate === 'function'
            ? n.updatedAt.toDate().toISOString()
            : dateIso;
        const author = String(n.author || n.authorName || n.createdByName || '').trim() || 'Tiệm Nhà Gốm';
        const initialViews = Math.max(0, Number(n.views) || 0);
        const initialYes = Math.max(0, Number(n.helpfulYes) || 0);
        const initialNo = Math.max(0, Number(n.helpfulNo) || 0);
        const readingMinutes = computeReadingMinutes(n.content);
        const articleTags = extractArticleTags(n);

        const authorMetaHtml = `${date ? `${date} | ` : ''}Tác giả: <strong>${escapeHTML(author)}</strong> <span class="article-meta-sep" aria-hidden="true">·</span> <span class="article-read-time">~${readingMinutes} phút đọc</span> <span class="article-meta-sep" aria-hidden="true">·</span> <span class="article-views-badge" id="article-views-badge" title="Lượt xem bài viết (cập nhật realtime)"><svg class="article-views-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span id="article-views-count">${initialViews.toLocaleString('vi-VN')}</span> lượt xem</span>`;

        const tagsInnerHtml = articleTags.length > 0
            ? `<span class="article-tags-label">Chủ đề:</span><div class="article-tags-list">${articleTags.map(t => `<a href="${blogListHref}?q=${encodeURIComponent(t)}" class="article-tag-chip">#${escapeHTML(t)}</a>`).join('')}</div>`
            : '';

        const articleSlug = (n.slug && String(n.slug).trim()) ? String(n.slug).trim() : id;

        const seoTitle = (n.seoTitle && n.seoTitle.trim())
            ? n.seoTitle.trim()
            : `${n.title} | Tiệm Nhà Gốm`;
        const encodedTitle = encodeURIComponent(seoTitle);

        document.title = seoTitle;

        // SEO: Cập nhật thẻ Meta Description, Keywords, Robots, Open Graph, Twitter, Canonical & JSON-LD
        const plainBody = n.content ? n.content.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : '';
        const seoDesc = (n.seoDescription && n.seoDescription.trim())
            || (n.excerpt && n.excerpt.trim())
            || (plainBody ? plainBody.substring(0, 155) + (plainBody.length > 155 ? '...' : '') : '');
        const canonicalUrl = (n.seoCanonical && n.seoCanonical.trim())
            ? n.seoCanonical.trim()
            : `https://tiemnhagom.vn/blog/${encodeURIComponent(articleSlug)}`;
        const shareUrl = canonicalUrl;
        const urlStr = encodeURIComponent(shareUrl);
        const coverAlt = (n.coverAlt && n.coverAlt.trim()) ? n.coverAlt.trim() : n.title;
        const combinedKeywords = [n.seoFocusKeyword, n.seoKeywords]
            .map(v => (v || '').trim())
            .filter(Boolean)
            .join(', ');

        const updateMeta = (nameAttr, nameVal, content) => {
            let el = document.querySelector(`meta[${nameAttr}="${nameVal}"]`);
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(nameAttr, nameVal);
                document.head.appendChild(el);
            }
            el.setAttribute('content', content);
        };
        updateMeta('name', 'description', seoDesc);
        if (combinedKeywords) {
            updateMeta('name', 'keywords', combinedKeywords);
        }
        updateMeta('name', 'robots', n.seoNoIndex ? 'noindex, nofollow' : 'index, follow');
        updateMeta('property', 'og:type', 'article');
        updateMeta('property', 'og:title', seoTitle);
        updateMeta('property', 'og:description', seoDesc);
        updateMeta('property', 'og:image', n.imageUrl || '');
        updateMeta('property', 'og:url', canonicalUrl);
        updateMeta('name', 'twitter:card', 'summary_large_image');
        updateMeta('name', 'twitter:title', seoTitle);
        updateMeta('name', 'twitter:description', seoDesc);
        updateMeta('name', 'twitter:image', n.imageUrl || '');

        let canonicalEl = document.querySelector('link[rel="canonical"]');
        if (!canonicalEl) {
            canonicalEl = document.createElement('link');
            canonicalEl.setAttribute('rel', 'canonical');
            document.head.appendChild(canonicalEl);
        }
        canonicalEl.setAttribute('href', canonicalUrl);

        const existingLd = document.querySelector('script[type="application/ld+json"]');
        if (!existingLd || existingLd.id === 'article-json-ld') {
            const jsonLdObj = {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "headline": n.title || seoTitle,
                "description": seoDesc,
                "image": n.imageUrl ? [n.imageUrl] : undefined,
                "author": {
                    "@type": "Person",
                    "name": author
                },
                "publisher": {
                    "@type": "Organization",
                    "name": "Tiệm Nhà Gốm",
                    "logo": {
                        "@type": "ImageObject",
                        "url": "https://tiemnhagom.vn/Asset/images/logo.webp"
                    }
                },
                "mainEntityOfPage": {
                    "@type": "WebPage",
                    "@id": canonicalUrl
                }
            };
            if (dateIso) jsonLdObj.datePublished = dateIso;
            if (updatedIso) jsonLdObj.dateModified = updatedIso;
            if (combinedKeywords) jsonLdObj.keywords = combinedKeywords;

            let ldEl = document.getElementById('article-json-ld');
            if (!ldEl) {
                ldEl = document.createElement('script');
                ldEl.id = 'article-json-ld';
                ldEl.type = 'application/ld+json';
                document.head.appendChild(ldEl);
            }
            ldEl.textContent = JSON.stringify(jsonLdObj).replace(/</g, '\\u003c');
        }

        const breadcrumbContainer = document.getElementById('breadcrumb-container');
        if (breadcrumbContainer && breadcrumbContainer.dataset.ssrHydrated !== '1') {
            breadcrumbContainer.innerHTML = `
                <div class="article-breadcrumb">
                    <a href="${homeHref}">Trang chủ</a> <span class="separator">›</span>
                    <a href="${blogListHref}">Blog</a> <span class="separator">›</span>
                    <span class="current">${escapeHTML(n.title)}</span>
                </div>
            `;
        }

        window.copyArticleLink = () => {
            navigator.clipboard.writeText(canonicalUrl).then(() => {
                showToast('Đã sao chép liên kết chia sẻ bài viết!');
            }).catch(e => {
                console.error('Lỗi sao chép', e);
                showToast('Lỗi khi sao chép liên kết', 'error');
            });
        };

        const feedbackStorageKey = `tng_article_feedback_${id}`;
        const applyVotedState = (choice) => {
            const yesBtn = container.querySelector('.feedback-btn[data-feedback="yes"]');
            const noBtn = container.querySelector('.feedback-btn[data-feedback="no"]');
            if (yesBtn) {
                const active = choice === 'yes';
                yesBtn.classList.toggle('active', active);
                yesBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            }
            if (noBtn) {
                const active = choice === 'no';
                noBtn.classList.toggle('active', active);
                noBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            }
        };

        let isSubmittingFeedback = false;
        window.submitFeedback = (isSatisfied, btn) => {
            if (isSubmittingFeedback) return;
            let savedChoice = '';
            try {
                savedChoice = window.localStorage ? (window.localStorage.getItem(feedbackStorageKey) || '') : '';
            } catch (_) {}

            if (savedChoice) {
                applyVotedState(savedChoice);
                showToast('Bạn đã đánh giá bài viết này rồi!');
                return;
            }

            const choice = isSatisfied ? 'yes' : 'no';
            const field = isSatisfied ? 'helpfulYes' : 'helpfulNo';
            isSubmittingFeedback = true;

            updateDoc(doc(db, "news", id), { [field]: increment(1) })
                .then(() => {
                    try {
                        if (window.localStorage) window.localStorage.setItem(feedbackStorageKey, choice);
                    } catch (_) {}
                    applyVotedState(choice);
                    showToast(isSatisfied
                        ? "Cảm ơn bạn đã đánh giá bài viết hữu ích! <i class='ti ti-mood-heart'></i>"
                        : "Cảm ơn bạn đã góp ý. Chúng tôi sẽ cải thiện bài viết! <i class='ti ti-flower'></i>");
                })
                .catch((err) => {
                    console.warn('Không thể lưu đánh giá bài viết:', err?.code || err);
                    showToast('Không thể lưu đánh giá lúc này, vui lòng thử lại sau.', 'error');
                })
                .finally(() => {
                    isSubmittingFeedback = false;
                });
        };

        if (container.dataset.ssrHydrated !== '1' || container.querySelector('.spinner')) {
            container.innerHTML = `
                <div class="article-header">
                    <h1 class="article-title">${escapeHTML(n.title)}</h1>
                    <div class="article-meta-row">
                        <div class="article-meta-info">${authorMetaHtml}</div>
                        <div class="article-share">
                            <span>Chia sẻ</span>
                            <a href="https://www.facebook.com/sharer/sharer.php?u=${urlStr}" target="_blank" rel="noopener" title="Chia sẻ qua Facebook">
                                <svg width="16" height="16" viewBox="0 0 320 512"><path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/></svg>
                            </a>
                            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${urlStr}" target="_blank" rel="noopener" title="Chia sẻ qua LinkedIn">
                                <svg width="16" height="16" viewBox="0 0 448 512"><path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z"/></svg>
                            </a>
                            <a href="https://twitter.com/intent/tweet?url=${urlStr}&text=${encodedTitle}" target="_blank" rel="noopener" title="Chia sẻ qua Twitter">
                                <svg width="16" height="16" viewBox="0 0 512 512"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>
                            </a>
                            <button type="button" onclick="copyArticleLink()" title="Sao chép liên kết">
                                <svg width="16" height="16" viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114l-114 114c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5l114-114c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <img src="${escapeHTML(n.imageUrl)}" alt="${escapeHTML(coverAlt)}" class="article-cover">
                <div id="article-toc-mobile" class="article-toc-mobile" hidden></div>
                <div class="ql-snow">
                    <div class="ql-editor" style="padding: 0;">
                        ${n.content}
                    </div>
                </div>
                <div id="article-tags-container" class="article-tags-section" ${tagsInnerHtml ? '' : 'hidden'}>${tagsInnerHtml}</div>
                <div class="article-feedback-container">
                    <div class="feedback-question">Bạn có hài lòng với bài viết này không ?</div>
                    <button type="button" class="feedback-btn" data-feedback="yes" onclick="submitFeedback(true, this)"><i class="ti ti-mood-heart"></i> Hài lòng <span class="feedback-count" id="feedback-yes-count">${initialYes}</span></button>
                    <button type="button" class="feedback-btn" data-feedback="no" onclick="submitFeedback(false, this)"><i class="ti ti-mood-sad"></i> Không hài lòng <span class="feedback-count" id="feedback-no-count">${initialNo}</span></button>
                </div>
                <div id="article-prev-next" class="article-prev-next" hidden></div>
                <a href="${blogListHref}" class="article-back-btn">
                    &larr; QUAY TRỞ LẠI "Blog"
                </a>
            `;
        } else {
            const metaInfoEl = container.querySelector('.article-meta-info');
            if (metaInfoEl) metaInfoEl.innerHTML = authorMetaHtml;

            const tagsEl = document.getElementById('article-tags-container');
            if (tagsEl) {
                tagsEl.innerHTML = tagsInnerHtml;
                tagsEl.hidden = !tagsInnerHtml;
            }

            const yesEl = document.getElementById('feedback-yes-count');
            const noEl = document.getElementById('feedback-no-count');
            if (yesEl) yesEl.textContent = initialYes.toLocaleString('vi-VN');
            if (noEl) noEl.textContent = initialNo.toLocaleString('vi-VN');
        }

        try {
            const existingChoice = window.localStorage ? window.localStorage.getItem(feedbackStorageKey) : '';
            if (existingChoice) applyVotedState(existingChoice);
        } catch (_) {}

        initArticleTOC(container);
        initArticleLightbox(container);
        initReadingProgressBar();
        initArticleRealtimeStats(id, {
            views: initialViews,
            helpfulYes: initialYes,
            helpfulNo: initialNo
        });
        fetchArticleNavigationAndRecent(id);
        fetchSuggestedProducts(n.relatedProductIds);
    } catch (e) {
        console.error(e);
        if (container.dataset.ssrHydrated !== '1') {
            container.innerHTML = "<p style='text-align:center;'>Đã xảy ra lỗi khi tải bài viết.</p>";
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', () => fetchArticle());
});
