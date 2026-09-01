import { db, auth, renderProductCard } from "./utils.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const VIEW_HISTORY_KEY = 'tiemnhagom_view_history';

// 1. Lưu vết sản phẩm vừa xem
export function trackProductView(product) {
    if (!product || !product.id) return;
    try {
        let history = JSON.parse(localStorage.getItem(VIEW_HISTORY_KEY)) || [];
        // Loại bỏ trùng lặp nếu đã xem trước đó
        history = history.filter(item => item.id !== product.id);
        
        // Thêm sản phẩm vừa xem vào đầu danh sách
        history.unshift({
            id: product.id,
            category: product.category || '',
            price: product.price || 0,
            collections: product.collections || [],
            timestamp: Date.now()
        });

        // Giữ tối đa 20 sản phẩm gần nhất
        if (history.length > 20) history.pop();

        localStorage.setItem(VIEW_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error("Lỗi ghi lịch sử xem:", e);
    }
}

// 2. Lấy danh sách ID đã thích & giỏ hàng của người dùng
async function getUserPreferences() {
    let favIds = [];
    let cartCategories = [];

    // Favs
    try {
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favIds = favSnap.data().productIds || [];
        } else {
            favIds = JSON.parse(localStorage.getItem('favorites')) || [];
        }
    } catch (e) {}

    // Cart
    try {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        cartCategories = cart.map(c => c.category).filter(Boolean);
    } catch (e) {}

    const history = JSON.parse(localStorage.getItem(VIEW_HISTORY_KEY)) || [];

    return { favIds, cartCategories, history };
}

// 3. Thuật toán tính điểm tương đồng AI Content-Based
export function calculateProductScore(product, prefs) {
    let score = 0;
    const { history, favIds, cartCategories } = prefs;

    // Tránh đề xuất sản phẩm bị ẩn hoặc chỉ cho event
    if (product.isHidden || product.isOnlyEvent) return -999;

    // Lấy các danh mục xuất hiện nhiều nhất trong lịch sử
    const historyCategories = history.map(h => h.category);
    const categoryFreq = {};
    historyCategories.forEach(c => categoryFreq[c] = (categoryFreq[c] || 0) + 1);

    // Điểm danh mục quan tâm (Category Match)
    if (categoryFreq[product.category]) {
        score += categoryFreq[product.category] * 3;
    }

    // Điểm danh mục đang có trong giỏ hàng
    if (cartCategories.includes(product.category)) {
        score += 4;
    }

    // Điểm khoảng giá quan tâm (Price Match)
    if (history.length > 0) {
        const avgPrice = history.reduce((sum, item) => sum + item.price, 0) / history.length;
        const priceDiffRatio = Math.abs(product.price - avgPrice) / (avgPrice || 1);
        if (priceDiffRatio < 0.3) score += 3; // Giá chênh lệch dưới 30%
        else if (priceDiffRatio < 0.6) score += 1.5;
    }

    // Điểm bán chạy / Đánh giá cao
    if (product.sold) score += Math.min(product.sold * 0.1, 5);

    // Sản phẩm mới cập nhật
    if (product.updatedAt) score += 2;

    return score;
}

// 4. Render Khối "Gợi ý dành riêng cho bạn"
export async function renderPersonalizedRecommendations(containerId = 'ai-personalized-recommendations', limitCount = 8) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const snap = await getDocs(collection(db, "products"));
        const allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const prefs = await getUserPreferences();

        // Tính điểm cho từng sản phẩm
        const scoredProducts = allProducts.map(p => ({
            product: p,
            score: calculateProductScore(p, prefs)
        })).filter(item => item.score > -100);

        // Sắp xếp giảm dần theo điểm số
        scoredProducts.sort((a, b) => b.score - a.score);

        // Lấy top sản phẩm
        const topProducts = scoredProducts.slice(0, limitCount).map(item => item.product);

        if (topProducts.length === 0) {
            container.style.display = 'none';
            return;
        }

        let favs = prefs.favIds;
        const cardsHtml = topProducts.map(p => renderProductCard(p, p.id, favs, '../product/index.html')).join('');

        container.innerHTML = `
            <div class="ai-recommendation-section">
                <div class="ai-section-header">
                    <div class="ai-badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> AI Gợi Ý Cho Bạn</div>
                    <h2 class="ai-section-title">Sản phẩm có thể bạn sẽ thích</h2>
                    <p class="ai-section-subtitle">Dựa trên phong cách và sở thích trang trí của bạn</p>
                </div>
                <div class="product-grid grid">
                    ${cardsHtml}
                </div>
            </div>
        `;
        container.style.display = 'block';
    } catch (e) {
        console.error("Lỗi render gợi ý AI cá nhân hóa:", e);
    }
}

// 5. Render Khối "Gợi ý phối không gian / Thường mua cùng" ở trang chi tiết
export async function renderDecorMatchRecommendations(currentProduct, containerId = 'ai-decor-match-container', limitCount = 4) {
    const container = document.getElementById(containerId);
    if (!container || !currentProduct) return;

    try {
        const snap = await getDocs(collection(db, "products"));
        const allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.isHidden && !p.isOnlyEvent && p.id !== currentProduct.id);
        
        // Tìm sản phẩm cùng bộ sưu tập hoặc có thể phối cùng
        const matchedProducts = allProducts.filter(p => {
            // Cùng bộ sưu tập
            const hasSameCollection = currentProduct.collections && p.collections && currentProduct.collections.some(c => p.collections.includes(c));
            // Cùng nhóm danh mục (VD: Bình hoa ghép với Hoa tươi, Tách trà ghép với Khay bánh)
            const isPairCategory = (currentProduct.category === 'Dining Decor' && p.category === 'Teatime & Drinks') ||
                                   (currentProduct.category === 'Teatime & Drinks' && p.category === 'Dining Decor') ||
                                   (currentProduct.category === 'Home Decor' && p.category === 'Hoa Nhà Gốm');
            return hasSameCollection || isPairCategory || p.category === currentProduct.category;
        });

        // Chọn ngẫu nhiên hoặc theo bán chạy
        matchedProducts.sort((a, b) => (b.sold || 0) - (a.sold || 0));
        const finalMatches = matchedProducts.slice(0, limitCount);

        if (finalMatches.length === 0) {
            container.style.display = 'none';
            return;
        }

        let favs = [];
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            if (favSnap.exists()) favs = favSnap.data().productIds || [];
        } else {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        const cardsHtml = finalMatches.map(p => renderProductCard(p, p.id, favs, './index.html')).join('');

        container.innerHTML = `
            <div class="ai-decor-match-section" style="margin-top: 4rem; padding-top: 2rem; border-top: 1px dashed #e0e0e0;">
                <div class="ai-section-header" style="text-align: left; margin-bottom: 1.5rem;">
                    <div class="ai-badge" style="background: #fdf3e7; color: #d35400;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Gợi ý Phối Không Gian</div>
                    <h3 style="font-family: var(--font-serif); font-size: 1.3rem; margin-top: 5px;">Món đồ hợp phối cùng sản phẩm này</h3>
                </div>
                <div class="product-grid grid">
                    ${cardsHtml}
                </div>
            </div>
        `;
        container.style.display = 'block';
    } catch (e) {
        console.error("Lỗi render gợi ý phối đồ AI:", e);
    }
}
