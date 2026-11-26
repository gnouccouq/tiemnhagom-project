import {
    db, auth, toggleFavoriteLogic, initHeader, updateSEO, fetchFlashSaleSettings,
    dynamicCategories, DEFAULT_PRODUCT_CATEGORIES, escapeHTML
} from "./utils.js";
import {
    collection, getDocs, doc, getDoc, query, where, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Cấu hình mặc định cho Sự kiện Ngày Đôi 12.12 (tự động áp dụng nếu Admin chưa đặt ngày mới)
function getDefault1212Window() {
    const now = new Date();
    let year = now.getFullYear();
    const endThisYear = new Date(year, 11, 12, 23, 59, 59);
    if (now > endThisYear) year += 1;
    return {
        start: new Date(year, 11, 12, 0, 0, 0),
        end: new Date(year, 11, 12, 23, 59, 59)
    };
}

let flashSaleSettings = null;
let allSaleProducts = [];
let userFavIds = [];
let activePriceGroup = null;
let currentSort = 'sale-desc';

// Trạng thái riêng của từng Khối Kệ (sub-category đang chọn, trang carousel, hoặc xem tất cả)
const stageStateMap = {}; // { [stageId]: { subCat: 'all', page: 0, expanded: false } }

function getCardsPerRow() {
    const w = window.innerWidth;
    if (w <= 768) return 4;   // 2 cột x 2 hàng trên điện thoại
    if (w <= 1024) return 3;
    if (w <= 1320) return 4;
    return 5;                 // Chuẩn 5 thẻ trắng ngang giống khối mẫu tham khảo
}

// Toggle yêu thích ngay trên thẻ Flash Sale
window.toggleFsCardFav = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    btn.classList.toggle('is-fav');
    await toggleFavoriteLogic(productId, () => refreshFavoritesOnly());
};

async function refreshFavoritesOnly() {
    if (auth.currentUser) {
        const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
        userFavIds = favSnap.exists() ? (favSnap.data().productIds || []) : [];
    } else {
        userFavIds = JSON.parse(localStorage.getItem('favorites') || '[]');
    }
    renderAllStages();
}

function getEffectiveCampaignState() {
    const now = new Date();
    const def1212 = getDefault1212Window();

    let startTime = flashSaleSettings?.startTime?.toDate
        ? flashSaleSettings.startTime.toDate()
        : (flashSaleSettings?.startTime ? new Date(flashSaleSettings.startTime) : null);
    let endTime = flashSaleSettings?.endTime?.toDate
        ? flashSaleSettings.endTime.toDate()
        : (flashSaleSettings?.endTime ? new Date(flashSaleSettings.endTime) : null);

    const hasValidConfiguredCampaign = Boolean(
        flashSaleSettings?.isActive && endTime && endTime > now
    );

    if (!hasValidConfiguredCampaign) {
        // Mặc định hướng về sự kiện Ngày Đôi 12.12 duy nhất 1 ngày
        startTime = def1212.start;
        endTime = def1212.end;
    }

    const isRunning = now >= startTime && now <= endTime;
    const isUpcoming = now < startTime;

    return {
        isRunning,
        isUpcoming,
        startTime,
        endTime,
        hasConfiguredItems: Boolean(hasValidConfiguredCampaign && flashSaleSettings?.items && Object.keys(flashSaleSettings.items).length > 0),
        title: (hasValidConfiguredCampaign && flashSaleSettings?.title)
            ? flashSaleSettings.title
            : "Ngày Đôi 12.12 — Siêu Sale Gốm Thủ Công",
        subtitle: (hasValidConfiguredCampaign && flashSaleSettings?.subtitle)
            ? flashSaleSettings.subtitle
            : "Đại tiệc ưu đãi duy nhất 1 ngày 12/12 tại Tiệm Nhà Gốm. Tham khảo trước các kệ gốm phân loại theo không gian và lưu món yêu thích để sẵn sàng săn deal lúc 00:00!"
    };
}

function computeProductDealMeta(product, campaignState) {
    const pid = product.id;
    const itemCfg = (flashSaleSettings?.items && flashSaleSettings.items[pid]) ? flashSaleSettings.items[pid] : null;
    const basePrice = Number(product.price) || 0;

    let dealPrice = basePrice;
    let discountPercent = 0;
    let isBogo = false;
    let dealLabel = '';
    let limit = 0;
    let sold = Number(product.sold) || 0;
    let isCampaignHero = false;

    if (itemCfg) {
        isCampaignHero = true;
        limit = itemCfg.limit !== undefined ? Number(itemCfg.limit) : 10;
        sold = itemCfg.sold !== undefined ? Number(itemCfg.sold) : 0;
        if (itemCfg.dealType === 'bogo_same' || itemCfg.dealType === 'bogo_custom') {
            isBogo = true;
            dealPrice = basePrice;
            discountPercent = 50;
            dealLabel = 'MUA 1 TẶNG 1';
        } else if (Number(itemCfg.salePrice) > 0) {
            dealPrice = Number(itemCfg.salePrice);
            discountPercent = basePrice > 0 ? Math.max(1, Math.round((1 - dealPrice / basePrice) * 100)) : 0;
            dealLabel = `DEAL SỐC 12.12 • -${discountPercent}%`;
        }
    } else if (product.flashSaleGroup && Number(product.flashSaleGroup) > 0) {
        dealPrice = Number(product.flashSaleGroup);
        discountPercent = basePrice > 0 ? Math.max(1, Math.round((1 - dealPrice / basePrice) * 100)) : 0;
        dealLabel = `ĐỒNG GIÁ ${Math.round(dealPrice / 1000)}K`;
        limit = Math.max(5, Math.min(20, Number(product.stock) || 10));
        sold = Math.min(limit - 1, Number(product.sold) || 0);
    } else {
        if (product.salePrice && Number(product.salePrice) > 0 && Number(product.salePrice) < basePrice) {
            dealPrice = Number(product.salePrice);
            discountPercent = basePrice > 0 ? Math.round((1 - dealPrice / basePrice) * 100) : (Number(product.sale) || 0);
        } else if (Number(product.sale) > 0) {
            discountPercent = Number(product.sale);
            dealPrice = Math.round(basePrice * (1 - discountPercent / 100));
        }
        dealLabel = discountPercent > 0 ? `ƯU ĐÃI 12.12 • GIẢM ${discountPercent}%` : 'ƯU ĐÃI NGÀY ĐÔI';
        const stockNum = Number(product.stock) || 8;
        limit = Math.max(sold + Math.min(stockNum, 10), 5);
    }

    const isSoldOut = Boolean(product.manualOutOfStock) || Boolean(product.isOutOfStock) || (Number(product.stock) <= 0 && !itemCfg) || (limit > 0 && sold >= limit && isCampaignHero);

    return {
        basePrice,
        dealPrice,
        discountPercent,
        isBogo,
        dealLabel,
        limit,
        sold,
        isSoldOut,
        isCampaignHero
    };
}

function sortProductsList(arr, campaignState) {
    return [...arr].sort((a, b) => {
        const ma = computeProductDealMeta(a, campaignState);
        const mb = computeProductDealMeta(b, campaignState);
        switch (currentSort) {
            case 'price-asc': return ma.dealPrice - mb.dealPrice;
            case 'price-desc': return mb.dealPrice - ma.dealPrice;
            case 'newest': return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
            case 'sale-desc':
            default:
                if (mb.isCampaignHero !== ma.isCampaignHero) return mb.isCampaignHero ? 1 : -1;
                return mb.discountPercent - ma.discountPercent;
        }
    });
}

function buildCategorizedStages(campaignState) {
    const categories = dynamicCategories.length > 0 ? dynamicCategories : DEFAULT_PRODUCT_CATEGORIES;
    let baseList = allSaleProducts;

    if (activePriceGroup !== null) {
        baseList = baseList.filter(p => Number(p.flashSaleGroup) === activePriceGroup || computeProductDealMeta(p, campaignState).dealPrice === activePriceGroup);
    }

    const stages = [];

    // Khối 1: TÂM ĐIỂM FLASH SALE 12.12 (nếu có sản phẩm được ghim riêng trong chiến dịch Flash Sale)
    const campaignHeroItems = baseList.filter(p => flashSaleSettings?.items && flashSaleSettings.items[p.id]);
    if (campaignHeroItems.length > 0) {
        const subSet = new Set();
        campaignHeroItems.forEach(p => { if (p.category) subSet.add(p.category); });
        stages.push({
            id: 'stage-hero-1212',
            shortNav: 'Tâm điểm 12.12',
            crownTitle: 'FLASH SALE • TÂM ĐIỂM 12.12',
            theme: 'terracotta',
            subCategories: Array.from(subSet),
            products: sortProductsList(campaignHeroItems, campaignState),
            note: 'Suất ưu đãi đặc quyền Ngày Đôi 12.12 — Giá tự động áp dụng trong khung giờ mở bán — Tặng kèm hộp quà & thiệp viết tay'
        });
    }

    // Các Khối Phân Loại Theo Nhóm Danh Mục Của Tiệm
    const assignedIds = new Set();
    categories.forEach((group, gIdx) => {
        const subs = Array.isArray(group.subs) ? group.subs : [];
        const matched = baseList.filter(p => {
            const cat = (p.category || '').trim();
            return cat === group.name || subs.includes(cat);
        });

        if (matched.length > 0) {
            matched.forEach(p => assignedIds.add(p.id));
            // Chỉ hiện các sub-category thực sự có sản phẩm sale
            const activeSubs = [];
            subs.forEach(s => {
                if (matched.some(p => (p.category || '').trim() === s)) activeSubs.push(s);
            });

            stages.push({
                id: `stage-cat-${gIdx}`,
                shortNav: group.name,
                crownTitle: `FLASH SALE • ${group.name.toUpperCase()}`,
                theme: (stages.length % 2 === 1) ? 'kiln' : 'terracotta',
                subCategories: activeSubs,
                products: sortProductsList(matched, campaignState),
                note: `Ưu đãi chuyên mục ${group.name} duy nhất ngày 12.12 — Kiểm tra kỹ chống sốc 3 lớp & miễn phí gói quà`
            });
        }
    });

    // Khối gom các sản phẩm chưa khớp nhóm danh mục (nếu có) để không bỏ sót món nào
    const leftovers = baseList.filter(p => !assignedIds.has(p.id) && !(stages.length > 0 && campaignHeroItems.some(h => h.id === p.id) && baseList.length === campaignHeroItems.length));
    if (leftovers.length > 0) {
        const subSet = new Set();
        leftovers.forEach(p => { if (p.category) subSet.add(p.category); });
        stages.push({
            id: 'stage-other-deals',
            shortNav: 'Gốm Ưu Đãi Khác',
            crownTitle: 'FLASH SALE • TUYỂN CHỌN ĐẶC BIỆT',
            theme: (stages.length % 2 === 1) ? 'kiln' : 'terracotta',
            subCategories: Array.from(subSet),
            products: sortProductsList(leftovers, campaignState),
            note: 'Số lượng gốm thủ công giới hạn theo tồn kho thực tế tại 2 chi nhánh Tiệm Nhà Gốm'
        });
    }

    return stages;
}

function expandIndependentSaleProducts(products) {
    const result = [];
    (products || []).forEach(p => {
        result.push(p);

        const pushVariant = (v, type, vIdx) => {
            if (!v || !v.showOnProductPage) return;
            const label = v.name || v.color || v.pattern || v.label || `Mẫu ${vIdx + 1}`;
            const vImg = v.imageUrl || v.image || p.thumbUrl || p.imageUrl;
            const vPrice = (v.price !== undefined && v.price !== null && v.price !== '' && Number(v.price) > 0) ? Number(v.price) : p.price;
            const vSalePrice = (v.salePrice !== undefined && v.salePrice !== null && v.salePrice !== '' && Number(v.salePrice) > 0) ? Number(v.salePrice) : p.salePrice;
            const vSale = (v.sale !== undefined && v.sale !== null && v.sale !== '') ? Number(v.sale) : p.sale;
            result.push({
                ...p,
                _variantKey: `${p.id}__${type}_${vIdx}`,
                _variantQuery: `${type}=${encodeURIComponent(label)}`,
                name: `${p.name} - ${label}`,
                imageUrl: vImg,
                thumbUrl: vImg,
                price: vPrice,
                salePrice: vSalePrice,
                sale: vSale,
                stock: (v.stock !== undefined && v.stock !== null && v.stock !== '') ? Number(v.stock) : p.stock
            });
        };

        if (Array.isArray(p.colorVariants)) p.colorVariants.forEach((v, i) => pushVariant(v, 'color', i));
        if (Array.isArray(p.patternVariants)) p.patternVariants.forEach((v, i) => pushVariant(v, 'pattern', i));
        if (Array.isArray(p.comboVariants)) p.comboVariants.forEach((v, i) => pushVariant(v, 'combo', i));
    });
    return result;
}

function renderDealCardHtml(product, campaignState) {
    const meta = computeProductDealMeta(product, campaignState);
    const img = product.thumbUrl || product.imageUrl || (Array.isArray(product.images) && product.images[0]) || '../Asset/images/homedecor.jpg';
    const isFav = userFavIds.includes(product.id);
    const baseHref = `../product/index.html?id=${encodeURIComponent(product.slug || product.id)}`;
    const href = product._variantQuery ? `${baseHref}&${product._variantQuery}` : baseHref;
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(n))) + 'đ';

    const topTag = meta.isBogo
        ? 'Mua 1 Tặng 1'
        : (meta.discountPercent > 0 ? `-${meta.discountPercent}%` : '12.12');

    const subSpec = [product.category || 'Gốm thủ công', product.details?.material || 'Tuyển chọn'].filter(Boolean).slice(0, 2).join(' · ');

    // Thanh tiến độ suất bán
    let barClass = '';
    let fillPct = 0;
    let barText = '';
    let barIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.5 3.5 4 5.5 4 9a4 4 0 1 1-8 0c0-2 1-3.5 2-5-.5 2 1 3 2 3 0-2.5-1-4.5 0-7z"/></svg>`;

    if (meta.isSoldOut) {
        barClass = 'is-soldout has-dark-fill';
        fillPct = 100;
        barText = `Đã hết suất (${meta.limit}/${meta.limit})`;
    } else if (campaignState.isUpcoming) {
        barClass = 'is-upcoming';
        fillPct = 0;
        barText = `Mở bán 12.12 · ${meta.limit} suất`;
        barIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>`;
    } else {
        fillPct = meta.limit > 0 ? Math.min(100, Math.max(0, Math.round((meta.sold / meta.limit) * 100))) : 0;
        if (fillPct >= 52) barClass = 'has-dark-fill';
        barText = `Đã bán ${meta.sold}/${meta.limit} suất`;
    }

    return `
        <a href="${escapeHTML(href)}" class="fs-deal-card">
            <span class="fs-deal-discount-tag">${escapeHTML(topTag)}</span>
            <button type="button" class="fs-deal-fav-btn ${isFav ? 'is-fav' : ''}" onclick="window.toggleFsCardFav(event, '${escapeHTML(product.id)}')" title="Lưu sản phẩm yêu thích">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>

            <div class="fs-deal-img-box">
                <img src="${escapeHTML(img)}" alt="${escapeHTML(product.name || '')}" loading="lazy" onerror="this.onerror=null;this.src='../Asset/images/homedecor.jpg';">
            </div>

            <div class="fs-deal-spec-block">
                <div class="fs-deal-highlight-line">${escapeHTML(meta.dealLabel)}</div>
                <div class="fs-deal-sub-line">${escapeHTML(subSpec)}</div>
            </div>

            <h3 class="fs-deal-title">${escapeHTML(product.name || 'Sản phẩm Tiệm Nhà Gốm')}</h3>

            <div class="fs-deal-price-wrap">
                <span class="fs-deal-sale-price">${fmt(meta.dealPrice)}</span>
                ${meta.basePrice > meta.dealPrice ? `<span class="fs-deal-old-price">${fmt(meta.basePrice)}</span>` : ''}
            </div>

            <div class="fs-quota-bar ${barClass}">
                ${fillPct > 0 ? `<div class="fs-quota-fill" style="width:${fillPct}%;"></div>` : ''}
                <span class="fs-quota-text">
                    ${barIcon}
                    <span>${escapeHTML(barText)}</span>
                </span>
            </div>
        </a>
    `;
}

function renderSingleStageContent(stage, campaignState) {
    const st = stageStateMap[stage.id] || { subCat: 'all', expanded: false };
    stageStateMap[stage.id] = st;

    const filtered = st.subCat === 'all'
        ? stage.products
        : stage.products.filter(p => (p.category || '').trim() === st.subCat);

    const perPage = getCardsPerRow();
    const timerCaption = campaignState.isUpcoming ? 'MỞ BÁN SAU' : 'KẾT THÚC SAU';

    const pillsHtml = [
        `<button type="button" class="fs-subpill-btn ${st.subCat === 'all' ? 'active' : ''}" onclick="window.selectFsStageSub('${stage.id}', 'all')">Tất cả (${stage.products.length})</button>`,
        ...stage.subCategories.map(sub => {
            const cnt = stage.products.filter(p => (p.category || '').trim() === sub).length;
            const isAct = st.subCat === sub;
            return `<button type="button" class="fs-subpill-btn ${isAct ? 'active' : ''}" onclick="window.selectFsStageSub('${stage.id}', '${escapeHTML(sub).replace(/'/g, "\\'")}')">${escapeHTML(sub)} (${cnt})</button>`;
        })
    ].join('');

    const showArrows = !st.expanded && filtered.length > perPage;

    return `
        <div class="fs-stage-crown-wrap">
            <div class="fs-stage-pedestal"></div>
            <div class="fs-stage-crown-badge">
                <h2>${escapeHTML(stage.crownTitle)}</h2>
            </div>
        </div>

        <div class="fs-stage-box">
            <div class="fs-stage-topbar">
                <div class="fs-stage-subpills">
                    ${pillsHtml}
                </div>

                <div class="fs-stage-timer-wrap">
                    <span class="fs-stage-timer-label">${timerCaption}</span>
                    <div class="fs-stage-timer-boxes">
                        <span class="fs-stage-tbox js-stage-d">00</span>
                        <span class="fs-stage-tsep">:</span>
                        <span class="fs-stage-tbox js-stage-h">00</span>
                        <span class="fs-stage-tsep">:</span>
                        <span class="fs-stage-tbox js-stage-m">00</span>
                        <span class="fs-stage-tsep">:</span>
                        <span class="fs-stage-tbox js-stage-s">00</span>
                    </div>
                </div>
            </div>

            <div class="fs-stage-carousel-wrap">
                ${showArrows ? `
                    <button type="button" class="fs-stage-nav-btn fs-stage-nav-btn--prev" onclick="window.scrollFsStageTrack('${stage.id}', -1)" aria-label="Cuộn sang trái">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                ` : ''}

                <div class="fs-stage-cards-grid ${st.expanded ? 'is-expanded' : ''}" id="track-${stage.id}">
                    ${filtered.map(p => renderDealCardHtml(p, campaignState)).join('')}
                </div>

                ${showArrows ? `
                    <button type="button" class="fs-stage-nav-btn fs-stage-nav-btn--next" onclick="window.scrollFsStageTrack('${stage.id}', 1)" aria-label="Cuộn sang phải">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                ` : ''}
            </div>

            <div class="fs-stage-bottom">
                <p class="fs-stage-note">${escapeHTML(stage.note)}</p>
                ${filtered.length > perPage ? `
                    <button type="button" class="fs-stage-expand-btn" onclick="window.toggleFsStageExpand('${stage.id}')">
                        ${st.expanded ? 'Thu gọn cuộn ngang' : `Xem toàn bộ ${filtered.length} mẫu`}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

let cachedStages = [];

function renderPriceGroupBanner(campaignState) {
    const host = document.getElementById('fs-price-group-banner');
    if (!host) return;
    const groups = Array.isArray(flashSaleSettings?.priceGroups)
        ? [...flashSaleSettings.priceGroups].map(Number).filter(n => n > 0).sort((a, b) => a - b)
        : [];

    if (groups.length === 0) {
        host.style.display = 'none';
        host.innerHTML = '';
        return;
    }

    host.style.display = 'block';

    const countInTier = (price) => allSaleProducts.filter(
        p => Number(p.flashSaleGroup) === price || computeProductDealMeta(p, campaignState).dealPrice === price
    ).length;

    const ticketsHtml = groups.map(price => {
        const cnt = countInTier(price);
        const isAct = activePriceGroup === price;
        return `
            <button type="button" class="fs-tier-ticket ${isAct ? 'active' : ''}" onclick="window.filterByPriceGroup(${price})">
                <span class="fs-tier-ticket-price">${Math.round(price / 1000)}K</span>
                <span class="fs-tier-ticket-meta">${cnt > 0 ? `${cnt} mẫu` : 'Săn deal'}</span>
            </button>
        `;
    }).join('');

    if (activePriceGroup !== null) {
        const fmtTier = new Intl.NumberFormat('vi-VN').format(activePriceGroup) + 'đ';
        const cnt = countInTier(activePriceGroup);
        host.innerHTML = `
            <div class="fs-tier-banner">
                <div class="fs-tier-banner-left">
                    <span class="fs-tier-kicker">KỆ ĐỒNG GIÁ NGÀY ĐÔI 12.12</span>
                    <h2 class="fs-tier-title">Đồng Giá ${fmtTier} — ${cnt} mẫu gốm tuyển chọn</h2>
                    <p class="fs-tier-sub">Tất cả sản phẩm bên dưới đều áp dụng mức giá ưu đãi đồng giá ${fmtTier} duy nhất trong khung giờ Flash Sale 12.12.</p>
                </div>
                <div class="fs-tier-tickets">
                    ${ticketsHtml}
                    <button type="button" class="fs-tier-reset-btn" onclick="window.filterByPriceGroup(null)">Xem tất cả mức giá</button>
                </div>
            </div>
        `;
    } else {
        host.innerHTML = `
            <div class="fs-tier-banner">
                <div class="fs-tier-banner-left">
                    <span class="fs-tier-kicker">SĂN GỐM ĐỒNG GIÁ • NGÀY ĐÔI 12.12</span>
                    <h2 class="fs-tier-title">Chọn nhanh Kệ Đồng Giá yêu thích</h2>
                    <p class="fs-tier-sub">Bấm vào từng mốc đồng giá bên cạnh để lọc ngay những món gốm thủ công đúng tầm ngân sách của bạn.</p>
                </div>
                <div class="fs-tier-tickets">
                    ${ticketsHtml}
                </div>
            </div>
        `;
    }
}

function renderAllStages() {
    const gridContainer = document.getElementById('flash-sale-grid');
    const emptyState = document.getElementById('no-flash-sale-products');
    const quickJumpContainer = document.getElementById('category-grid-display');
    if (!gridContainer) return;

    const campaignState = getEffectiveCampaignState();
    renderPriceGroupBanner(campaignState);
    cachedStages = buildCategorizedStages(campaignState);

    if (cachedStages.length === 0) {
        gridContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (quickJumpContainer) quickJumpContainer.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Thanh chọn nhanh nhảy đến từng Khối Phân Loại
    if (quickJumpContainer) {
        quickJumpContainer.innerHTML = cachedStages.map((s, i) => `
            <a href="#${s.id}" class="fs-jump-pill ${i === 0 ? 'active' : ''}" data-stage-jump="${s.id}">
                ${escapeHTML(s.shortNav)} (${s.products.length})
            </a>
        `).join('');

        quickJumpContainer.querySelectorAll('.fs-jump-pill').forEach(link => {
            link.addEventListener('click', (ev) => {
                ev.preventDefault();
                const targetId = link.dataset.stageJump;
                quickJumpContainer.querySelectorAll('.fs-jump-pill').forEach(a => a.classList.toggle('active', a === link));
                document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    gridContainer.innerHTML = cachedStages.map(stage => `
        <section id="${stage.id}" class="fs-stage-section ${stage.theme === 'kiln' ? 'theme-kiln' : ''}">
            ${renderSingleStageContent(stage, campaignState)}
        </section>
    `).join('');

    tickAllCountdowns();
}

window.selectFsStageSub = (stageId, subCat) => {
    const campaignState = getEffectiveCampaignState();
    const stage = cachedStages.find(s => s.id === stageId);
    if (!stage) return;
    stageStateMap[stageId] = { ...(stageStateMap[stageId] || {}), subCat, page: 0 };
    const el = document.getElementById(stageId);
    if (el) {
        el.innerHTML = renderSingleStageContent(stage, campaignState);
        tickAllCountdowns();
    }
};

window.scrollFsStageTrack = (stageId, direction) => {
    const track = document.getElementById(`track-${stageId}`);
    if (!track) return;
    const distance = Math.max(260, Math.round(track.clientWidth * 0.82));
    track.scrollBy({ left: direction * distance, behavior: 'smooth' });
};

window.toggleFsStageExpand = (stageId) => {
    const campaignState = getEffectiveCampaignState();
    const stage = cachedStages.find(s => s.id === stageId);
    if (!stage) return;
    const cur = stageStateMap[stageId] || { subCat: 'all', page: 0, expanded: false };
    cur.expanded = !cur.expanded;
    stageStateMap[stageId] = cur;
    const el = document.getElementById(stageId);
    if (el) {
        el.innerHTML = renderSingleStageContent(stage, campaignState);
        tickAllCountdowns();
    }
};

function updateHeroBannerUI(campaignState) {
    const bannerTitle = document.querySelector('.banner-title');
    const bannerSub = document.getElementById('fs-hero-subtitle');
    const statusPill = document.getElementById('fs-status-pill');
    const statusText = document.getElementById('fs-status-text');
    const caption = document.getElementById('fs-countdown-caption');
    const miniPrefix = document.getElementById('fs-mini-timer-prefix');
    const windowLbl = document.getElementById('fs-time-window-label');
    const remindBtn = document.getElementById('btn-remind-1212');

    if (bannerTitle) bannerTitle.textContent = campaignState.title;
    if (bannerSub) bannerSub.textContent = campaignState.subtitle;

    const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (windowLbl && campaignState.startTime && campaignState.endTime) {
        const sameDay = fmtDate(campaignState.startTime) === fmtDate(campaignState.endTime);
        windowLbl.textContent = sameDay
            ? `Duy nhất 24h • Ngày ${fmtDate(campaignState.startTime)}`
            : `${fmtDate(campaignState.startTime)} – ${fmtDate(campaignState.endTime)}`;
    }

    if (campaignState.isRunning) {
        statusPill?.classList.remove('is-upcoming');
        if (statusText) statusText.textContent = 'ĐANG MỞ BÁN • DUY NHẤT NGÀY HỘI 12.12';
        if (caption) caption.textContent = 'CHƯƠNG TRÌNH KẾT THÚC SAU';
        if (miniPrefix) miniPrefix.textContent = 'Kết thúc sau:';
        if (remindBtn) remindBtn.style.display = 'none';
    } else {
        statusPill?.classList.add('is-upcoming');
        if (statusText) statusText.textContent = 'SỰ KIỆN NGÀY ĐÔI 12.12 • SẮP MỞ BÁN';
        if (caption) caption.textContent = 'ĐẾM NGƯỢC TỚI GIỜ MỞ BÁN';
        if (miniPrefix) miniPrefix.textContent = 'Mở bán sau:';
        if (remindBtn) remindBtn.style.display = 'inline-flex';
    }

    // Ẩn cụm nút đồng giá trên thanh dính vì đã có Banner Kệ Đồng Giá trực quan ngay bên dưới (tránh lặp UI)
    const priceTabsEl = document.getElementById('price-tabs-container');
    if (priceTabsEl) {
        priceTabsEl.style.display = 'none';
        priceTabsEl.innerHTML = '';
    }
}

window.filterByPriceGroup = (price) => {
    activePriceGroup = price;
    updateHeroBannerUI(getEffectiveCampaignState());
    renderAllStages();
};

function tickAllCountdowns() {
    const campaignState = getEffectiveCampaignState();
    const target = campaignState.isUpcoming ? campaignState.startTime : campaignState.endTime;
    if (!target) return;

    const diff = Math.max(0, target.getTime() - Date.now());
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    const ds = String(d).padStart(2, '0');
    const hs = String(h).padStart(2, '0');
    const ms = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');

    // 1. Hero Fullscreen Countdown
    const dEl = document.getElementById('days');
    const hEl = document.getElementById('hours');
    const mEl = document.getElementById('minutes');
    const sEl = document.getElementById('seconds');
    if (dEl) dEl.textContent = ds;
    if (hEl) hEl.textContent = hs;
    if (mEl) mEl.textContent = ms;
    if (sEl) sEl.textContent = ss;

    // 2. Sticky Mini Countdown
    const miniEl = document.getElementById('fs-mini-timer-text');
    if (miniEl) {
        miniEl.textContent = d > 0 ? `${ds}n ${hs}:${ms}:${ss}` : `${hs}:${ms}:${ss}`;
    }

    // 3. Đồng hồ 4 ô trắng bên trong TẤT CẢ các Khối Kệ Phân Loại
    document.querySelectorAll('.js-stage-d').forEach(el => { el.textContent = ds; });
    document.querySelectorAll('.js-stage-h').forEach(el => { el.textContent = hs; });
    document.querySelectorAll('.js-stage-m').forEach(el => { el.textContent = ms; });
    document.querySelectorAll('.js-stage-s').forEach(el => { el.textContent = ss; });
}

async function loadFlashSalePage() {
    const gridContainer = document.getElementById('flash-sale-grid');
    if (gridContainer) {
        gridContainer.innerHTML = `<div style="text-align:center; padding: 64px 20px; color:#6E665D;">Đang tải các kệ sản phẩm Flash Sale 12.12...</div>`;
    }

    flashSaleSettings = await fetchFlashSaleSettings(true);
    const campaignState = getEffectiveCampaignState();
    updateHeroBannerUI(campaignState);

    if (window.fsTimer) clearInterval(window.fsTimer);
    window.fsTimer = setInterval(tickAllCountdowns, 1000);
    tickAllCountdowns();

    // SEO
    const baseUrl = window.location.origin + window.location.pathname.split('/flash-sale/')[0];
    updateSEO(
        `${campaignState.title} | Tiệm Nhà Gốm`,
        campaignState.subtitle,
        `${baseUrl}/Asset/images/bannercollection.jpg`
    );

    try {
        // 1. Tải danh sách yêu thích
        if (auth.currentUser) {
            const favSnap = await getDoc(doc(db, "favorites", auth.currentUser.uid));
            userFavIds = favSnap.exists() ? (favSnap.data().productIds || []) : [];
        } else {
            userFavIds = JSON.parse(localStorage.getItem('favorites') || '[]');
        }

        // 2. CHỈ LẤY sản phẩm thuộc chiến dịch Flash Sale 12.12 (flashSaleSettings.items + đồng giá nếu có), KHÔNG trộn sản phẩm sale thường ngày
        const seenIds = new Set();
        const collected = [];

        const itemIds = flashSaleSettings?.items ? Object.keys(flashSaleSettings.items) : [];
        if (itemIds.length > 0) {
            const snaps = await Promise.all(itemIds.map(pid => getDoc(doc(db, "products", pid))));
            snaps.forEach(snap => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (!data.isHidden && !data.isOnlyEvent) {
                        collected.push({ id: snap.id, ...data });
                        seenIds.add(snap.id);
                    }
                }
            });
        }

        const priceGroups = Array.isArray(flashSaleSettings?.priceGroups) ? flashSaleSettings.priceGroups.filter(n => Number(n) > 0) : [];
        if (priceGroups.length > 0) {
            const qGroup = query(collection(db, "products"), where("flashSaleGroup", ">", 0));
            const groupSnap = await getDocs(qGroup);
            groupSnap.docs.forEach(docSnap => {
                if (!seenIds.has(docSnap.id)) {
                    const p = { id: docSnap.id, ...docSnap.data() };
                    if (!p.isHidden && !p.isOnlyEvent && priceGroups.includes(Number(p.flashSaleGroup))) {
                        collected.push(p);
                        seenIds.add(docSnap.id);
                    }
                }
            });
        }

        allSaleProducts = expandIndependentSaleProducts(collected);
        renderAllStages();
    } catch (err) {
        console.error("Lỗi tải kệ sản phẩm Flash Sale:", err);
        if (gridContainer) {
            gridContainer.innerHTML = `<div style="text-align:center; padding:48px 20px; color:#B91C1C;">Không thể tải danh sách sản phẩm. Vui lòng tải lại trang giúp Tiệm nhé!</div>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', () => {
        loadFlashSalePage();
    });

    // Đồng bộ danh mục động từ Firestore để chia khối chính xác
    onSnapshot(doc(db, "settings", "product_categories"), (snapshot) => {
        if (snapshot.exists() && Array.isArray(snapshot.data().groups)) {
            dynamicCategories.length = 0;
            dynamicCategories.push(...snapshot.data().groups.sort((a, b) => (a.order || 0) - (b.order || 0)));
            if (allSaleProducts.length > 0) renderAllStages();
        }
    });

    document.getElementById('sort-by')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderAllStages();
    });

    document.getElementById('btn-scroll-to-deals')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('fs-showcase-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Nút Đặt lịch nhắc mở bán 12.12 trên Google Calendar
    document.getElementById('btn-remind-1212')?.addEventListener('click', () => {
        const st = getEffectiveCampaignState();
        const start = st.startTime || getDefault1212Window().start;
        const end = st.endTime || getDefault1212Window().end;
        const pad = (n) => String(n).padStart(2, '0');
        const toCal = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
        const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(st.title + ' - Tiệm Nhà Gốm')}&dates=${toCal(start)}/${toCal(end)}&details=${encodeURIComponent('Săn Flash Sale gốm thủ công tại ' + window.location.href)}`;
        window.open(calUrl, '_blank', 'noopener');
    });

    // Tự cân chỉnh số thẻ mỗi hàng khi xoay màn hình / đổi kích thước cửa sổ
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (allSaleProducts.length > 0) renderAllStages();
        }, 220);
    });
});
