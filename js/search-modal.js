// ==========================================================================
// COMMAND PALETTE SEARCH MODAL (TIỆM NHÀ GỐM)
// Xử lý Tìm kiếm Tức thì, Lịch sử Tìm kiếm, Điều hướng Bàn phím & Phím tắt
// ==========================================================================

import { db } from './config.js';
import { collection, getDocs, query, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

function performSearch(products, queryStr, maxResults = 10) {
    if (typeof window !== 'undefined' && typeof window.searchAndRankProducts === 'function') {
        return window.searchAndRankProducts(products, queryStr, maxResults);
    }
    if (!queryStr || !String(queryStr).trim()) return products.slice(0, maxResults);
    const q = queryStr.toLowerCase().trim();
    return products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, maxResults);
}

const RECENT_SEARCHES_KEY = 'tng_recent_searches';
const MAX_RECENT_SEARCHES = 8;

// Các từ khóa thịnh hành được đề xuất
const TRENDING_SEARCHES = [
    'Ly sứ giáng sinh',
    'Bình hoa men hỏa biến',
    'Bộ ấm chén trà',
    'Chén dĩa decor bàn ăn',
    'Lọ hoa để bàn',
    'Quà tặng gốm sứ'
];

// Danh mục nhanh
const QUICK_CATEGORIES = [
    { name: 'Bàn ăn', icon: '🍜', filter: 'Bàn ăn' },
    { name: 'Trà & Cà phê', icon: '🍵', filter: 'Trà & Cà phê' },
    { name: 'Trang trí', icon: '🌸', filter: 'Trang trí' },
    { name: 'Gốm Giáng sinh', icon: '🎄', link: 'noel/' },
    { name: 'Flash Sale', icon: '⚡', link: 'flash-sale/' }
];

let cachedProducts = null;
let isLoadingProducts = false;
let currentResults = [];
let highlightedIndex = -1;
let pathPrefixGlobal = '';
let searchDebounceTimer = null;

// Lấy danh sách tìm kiếm gần đây từ LocalStorage
function getRecentSearches() {
    try {
        const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

// Lưu một từ khóa vào lịch sử
function saveRecentSearch(term) {
    const trimmed = (term || '').trim();
    if (!trimmed) return;
    try {
        let recents = getRecentSearches();
        recents = [trimmed, ...recents.filter(s => s.toLowerCase() !== trimmed.toLowerCase())];
        recents = recents.slice(0, MAX_RECENT_SEARCHES);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents));
    } catch (e) {
        console.error('Lỗi khi lưu lịch sử tìm kiếm:', e);
    }
}

// Xóa 1 từ khóa khỏi lịch sử
function removeRecentSearch(term) {
    try {
        let recents = getRecentSearches();
        recents = recents.filter(s => s.toLowerCase() !== term.toLowerCase());
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents));
        renderDefaultContent();
    } catch (e) {
        console.error('Lỗi khi xóa từ khóa lịch sử:', e);
    }
}

// Xóa toàn bộ lịch sử
function clearAllRecentSearches() {
    try {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
        renderDefaultContent();
    } catch (e) {
        console.error('Lỗi khi xóa tất cả lịch sử:', e);
    }
}

// Nạp toàn bộ sản phẩm vào bộ nhớ đệm (Cache) để tìm kiếm tức thì không giật lag
async function loadProductsForSearch() {
    if (cachedProducts && cachedProducts.length > 0) return cachedProducts;
    if (isLoadingProducts) return [];

    isLoadingProducts = true;
    try {
        const q = query(collection(db, "products"), limit(500));
        const snap = await getDocs(q);
        cachedProducts = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => !p.isHidden && !p.isOnlyEvent);
        isLoadingProducts = false;
        return cachedProducts;
    } catch (e) {
        console.error('Lỗi tải sản phẩm cho tìm kiếm:', e);
        isLoadingProducts = false;
        return [];
    }
}

// Hiển thị nội dung mặc định khi chưa nhập từ khóa (Lịch sử + Xu hướng + Danh mục)
function renderDefaultContent() {
    const bodyEl = document.getElementById('tng-search-body');
    const viewAllLink = document.getElementById('tng-search-view-all');
    if (viewAllLink) viewAllLink.style.display = 'none';
    if (!bodyEl) return;

    const recents = getRecentSearches();
    let html = '';

    // 1. Lịch sử tìm kiếm gần đây
    if (recents.length > 0) {
        html += `
            <div class="tng-search-section-title">
                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Tìm kiếm gần đây</span>
                <button type="button" class="tng-search-clear-all-btn" id="btn-clear-all-recents">Xóa tất cả</button>
            </div>
            <div class="tng-search-chips">
                ${recents.map(r => `
                    <div class="tng-search-chip" data-term="${escapeAttr(r)}">
                        <span>${escapeHtml(r)}</span>
                        <span class="btn-remove-term" data-term="${escapeAttr(r)}" title="Xóa từ khóa">&times;</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // 2. Xu hướng tìm kiếm
    html += `
        <div class="tng-search-section-title">
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>Từ khóa nổi bật</span>
        </div>
        <div class="tng-search-chips">
            ${TRENDING_SEARCHES.map(t => `
                <div class="tng-search-chip" data-term="${escapeAttr(t)}">
                    <span>${escapeHtml(t)}</span>
                </div>
            `).join('')}
        </div>
    `;

    // 3. Danh mục phổ biến
    html += `
        <div class="tng-search-section-title">
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Khám phá danh mục</span>
        </div>
        <div class="tng-search-cats-grid">
            ${QUICK_CATEGORIES.map(cat => {
                const slug = (typeof window !== 'undefined' && typeof window.toCategorySlug === 'function')
                    ? window.toCategorySlug(cat.filter)
                    : encodeURIComponent(cat.filter);
                const targetUrl = cat.link ? `${pathPrefixGlobal}${cat.link}` : `${pathPrefixGlobal}products/?category=${slug}`;
                return `
                    <a href="${targetUrl}" class="tng-search-cat-item">
                        <span class="tng-search-cat-icon">${cat.icon}</span>
                        <span>${cat.name}</span>
                    </a>
                `;
            }).join('')}
        </div>
    `;

    bodyEl.innerHTML = html;

    // Gắn sự kiện cho các chip tìm kiếm
    bodyEl.querySelectorAll('.tng-search-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.btn-remove-term');
            if (removeBtn) {
                e.stopPropagation();
                removeRecentSearch(removeBtn.dataset.term);
                return;
            }
            const term = chip.dataset.term;
            const input = document.getElementById('tng-search-input');
            if (input && term) {
                input.value = term;
                handleSearchInput(term);
            }
        });
    });

    // Nút xóa tất cả lịch sử
    const btnClearAll = document.getElementById('btn-clear-all-recents');
    if (btnClearAll) {
        btnClearAll.addEventListener('click', (e) => {
            e.preventDefault();
            clearAllRecentSearches();
        });
    }
}

// Xử lý tìm kiếm trực tiếp (Live Search)
async function handleSearchInput(keyword) {
    const val = (keyword || '').trim();
    const bodyEl = document.getElementById('tng-search-body');
    const clearBtn = document.getElementById('tng-search-clear');
    const viewAllLink = document.getElementById('tng-search-view-all');

    if (clearBtn) {
        clearBtn.classList.toggle('visible', val.length > 0);
    }

    if (!val) {
        currentResults = [];
        highlightedIndex = -1;
        renderDefaultContent();
        return;
    }

    if (val.length < 2) {
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="tng-search-empty-state">
                    <div class="tng-search-empty-desc">Nhập ít nhất 2 ký tự để bắt đầu tìm kiếm...</div>
                </div>
            `;
        }
        if (viewAllLink) viewAllLink.style.display = 'none';
        return;
    }

    // Hiển thị trạng thái đang tải
    if (bodyEl) {
        bodyEl.innerHTML = `
            <div class="tng-search-loading">
                <div class="tng-search-spinner"></div>
                <div>Đang tìm món gốm phù hợp...</div>
            </div>
        `;
    }

    const prods = await loadProductsForSearch();
    currentResults = performSearch(prods, val, 10);
    highlightedIndex = -1;

    // Cập nhật nút xem tất cả kết quả
    if (viewAllLink) {
        viewAllLink.href = `${pathPrefixGlobal}products/index.html?search=${encodeURIComponent(val)}`;
        viewAllLink.innerHTML = `Xem tất cả kết quả (${currentResults.length}) &rarr;`;
        viewAllLink.style.display = 'inline-flex';
    }

    if (!currentResults || currentResults.length === 0) {
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="tng-search-empty-state">
                    <div class="tng-search-empty-icon">&#128269;</div>
                    <div class="tng-search-empty-title">Không tìm thấy sản phẩm phù hợp</div>
                    <div class="tng-search-empty-desc">Không có kết quả nào khớp với "<strong>${escapeHtml(val)}</strong>". Bạn thử tìm từ khóa khác như "bình hoa", "ấm trà", hoặc "ly sứ" nhé.</div>
                </div>
            `;
        }
        return;
    }

    // Hiển thị danh sách kết quả sản phẩm
    let html = `
        <div class="tng-search-section-title">
            <span>Sản phẩm gợi ý (${currentResults.length})</span>
            <span style="font-size: 0.72rem; color: #94a3b8; text-transform: none; font-weight: normal;">Nhấn Enter để chọn</span>
        </div>
        <div class="tng-search-results-list" id="tng-search-results-list">
    `;

    currentResults.forEach((p, idx) => {
        const hasSale = p.sale > 0;
        const currentPrice = hasSale ? (p.salePrice || Math.round(p.price * (1 - p.sale / 100))) : p.price;
        const isOutOfStock = (p.stock || 0) <= 0;

        let displayImg = p.imageUrl;
        if (!displayImg || displayImg.includes('placehold.co')) {
            if (p.colorVariants && p.colorVariants[0]?.imageUrl) displayImg = p.colorVariants[0].imageUrl;
            else if (p.patternVariants && p.patternVariants[0]?.imageUrl) displayImg = p.patternVariants[0].imageUrl;
            else displayImg = `${pathPrefixGlobal}Asset/images/logo.webp`;
        }

        const productUrl = `${pathPrefixGlobal}product/index.html?id=${p.id}`;

        html += `
            <a href="${productUrl}" class="tng-search-item" data-index="${idx}">
                <div class="tng-search-thumb-wrap">
                    <img src="${displayImg}" alt="${escapeAttr(p.name)}" loading="lazy">
                </div>
                <div class="tng-search-info">
                    <h4 class="tng-search-name">${escapeHtml(p.name)}</h4>
                    <div class="tng-search-meta">
                        <span>Mã: ${escapeHtml(p.id)}</span>
                        <span>•</span>
                        <span class="tng-search-stock-tag ${isOutOfStock ? 'out-stock' : 'in-stock'}">
                            ${isOutOfStock ? 'Hết hàng' : 'Còn hàng'}
                        </span>
                    </div>
                    <div class="tng-search-price-wrap">
                        <span class="tng-search-current-price ${hasSale ? 'sale' : ''}">
                            ${new Intl.NumberFormat('vi-VN').format(currentPrice)}đ
                        </span>
                        ${hasSale ? `
                            <span class="tng-search-old-price">${new Intl.NumberFormat('vi-VN').format(p.price)}đ</span>
                            <span class="tng-search-sale-badge">-${p.sale}%</span>
                        ` : ''}
                    </div>
                </div>
                <div class="tng-search-arrow">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14"></path>
                        <path d="M12 5l7 7-7 7"></path>
                    </svg>
                </div>
            </a>
        `;
    });

    html += `</div>`;
    if (bodyEl) bodyEl.innerHTML = html;

    // Gắn sự kiện click mở sản phẩm và lưu từ khóa gần đây
    bodyEl.querySelectorAll('.tng-search-item').forEach(item => {
        item.addEventListener('click', (e) => {
            saveRecentSearch(val);
            const url = item.getAttribute('href');
            if (url) {
                window.location.href = url;
            }
        });
    });
}

// Cập nhật phần tử được highlight bằng phím mũi tên
function updateHighlightedItem() {
    const items = document.querySelectorAll('#tng-search-results-list .tng-search-item');
    items.forEach((item, idx) => {
        if (idx === highlightedIndex) {
            item.classList.add('highlighted');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('highlighted');
        }
    });
}

// Mở Search Modal
export function openSearchModal() {
    const backdrop = document.getElementById('tng-search-backdrop');
    const input = document.getElementById('tng-search-input');
    if (!backdrop) return;

    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Bắt đầu nạp cache sản phẩm ngầm ngay khi mở
    loadProductsForSearch();

    renderDefaultContent();

    setTimeout(() => {
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
}

// Đóng Search Modal
export function closeSearchModal() {
    const backdrop = document.getElementById('tng-search-backdrop');
    const input = document.getElementById('tng-search-input');
    if (!backdrop) return;

    backdrop.classList.remove('active');
    document.body.style.overflow = '';
    if (input) input.value = '';
    const clearBtn = document.getElementById('tng-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    currentResults = [];
    highlightedIndex = -1;
}

// Khởi tạo toàn bộ Modal tìm kiếm Command Palette
export function initSearchModal(pathPrefix = '') {
    pathPrefixGlobal = pathPrefix;

    const backdrop = document.getElementById('tng-search-backdrop');
    const input = document.getElementById('tng-search-input');
    const closeBtn = document.getElementById('tng-search-close-btn');
    const clearBtn = document.getElementById('tng-search-clear');
    const triggerBtns = document.querySelectorAll('#btn-open-search, [data-open-search]');

    // 1. Mở modal khi bấm nút tìm kiếm
    triggerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSearchModal();
        });
    });

    // 2. Đóng modal khi bấm nút Close hoặc click ra ngoài backdrop
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeSearchModal();
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeSearchModal();
            }
        });
    }

    // 3. Nút xóa nhanh text trong ô tìm kiếm
    if (clearBtn && input) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            input.focus();
            handleSearchInput('');
        });
    }

    // 4. Nhập liệu trong ô tìm kiếm (Debounce 150ms)
    if (input) {
        input.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimer);
            const val = e.target.value;
            searchDebounceTimer = setTimeout(() => {
                handleSearchInput(val);
            }, 150);
        });

        // 5. Điều hướng bằng bàn phím trong modal
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentResults.length > 0) {
                    highlightedIndex = (highlightedIndex + 1) % currentResults.length;
                    updateHighlightedItem();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentResults.length > 0) {
                    highlightedIndex = (highlightedIndex - 1 + currentResults.length) % currentResults.length;
                    updateHighlightedItem();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const term = input.value.trim();
                if (highlightedIndex >= 0 && currentResults[highlightedIndex]) {
                    saveRecentSearch(term);
                    window.location.href = `${pathPrefixGlobal}product/index.html?id=${currentResults[highlightedIndex].id}`;
                } else if (term) {
                    saveRecentSearch(term);
                    window.location.href = `${pathPrefixGlobal}products/index.html?search=${encodeURIComponent(term)}`;
                }
            }
        });
    }

    // 6. Phím tắt toàn cục: Ctrl + K / Cmd + K để mở; Esc để đóng
    document.addEventListener('keydown', (e) => {
        // Nhấn Esc để đóng modal
        if (e.key === 'Escape' && backdrop && backdrop.classList.contains('active')) {
            e.preventDefault();
            closeSearchModal();
            return;
        }

        // Nhấn Ctrl + K hoặc Cmd + K để mở modal
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (backdrop && backdrop.classList.contains('active')) {
                closeSearchModal();
            } else {
                openSearchModal();
            }
        }
    });
}

// Hàm hỗ trợ escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
}

// Gắn sẵn các hàm toàn cục và Event Delegation trên document
if (typeof window !== 'undefined') {
    window.openSearchModal = openSearchModal;
    window.closeSearchModal = closeSearchModal;
    window.initSearchModal = initSearchModal;

    // Bắt sự kiện click ngay trên document (Event Delegation)
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('#btn-open-search, [data-open-search]');
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            openSearchModal();
        }
    });
}
