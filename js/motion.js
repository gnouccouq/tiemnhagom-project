// js/motion.js — Hệ thống chuyển động Editorial & Micro-interactions cho Tiệm Nhà Gốm Web

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion() {
    return typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

const REVEAL_GRID_SELECTORS = [
    '#home-category-grid',
    '#best-selling-grid',
    '#product-grid',
    '#combo-grid',
    '#recommendation-grid',
    '#collection-grid',
    '#all-product-grid',
    '.lookbook-intro-grid',
    '.coming-soon-teasers'
];

const STAGGER_ITEM_SELECTOR = '.tng-home-cat-card, .collection-banner, .lookbook-preview-card, .coming-soon-card, .product-card';

let revealObserver = null;
let revealScheduled = false;

function scheduleRevealScan() {
    if (revealScheduled || prefersReducedMotion()) return;
    revealScheduled = true;
    requestAnimationFrame(() => {
        revealScheduled = false;
        scanEditorialReveals();
    });
}

function showRevealElement(el) {
    if (!el || el.classList.contains('tng-in-view')) return;
    el.classList.add('tng-in-view');
    if (revealObserver) {
        try { revealObserver.unobserve(el); } catch (_) {}
    }
}

function registerRevealTarget(el, staggerIndex = 0, isGridItem = false) {
    if (!el || el.dataset.tngRevealBound === '1') return;
    if (el.classList.contains('skeleton')) return;
    el.dataset.tngRevealBound = '1';

    if (isGridItem) {
        el.classList.add('tng-stagger-item');
        el.style.setProperty('--tng-stagger-delay', `${Math.min(staggerIndex, 10) * 45}ms`);
    }

    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;
    const isInViewportNow = rect.top < viewportH * 0.96 && rect.bottom > 0;

    el.classList.add('tng-reveal-ready');

    if (isInViewportNow) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => showRevealElement(el));
        });
    } else if (revealObserver) {
        revealObserver.observe(el);
        // Fail-safe: bảo đảm không phần tử nào kẹt ở opacity: 0 nếu layout/container thay đổi bất ngờ
        setTimeout(() => {
            if (!el.classList.contains('tng-in-view')) {
                const r = el.getBoundingClientRect();
                if (r.top < (window.innerHeight || 900) * 1.15) {
                    showRevealElement(el);
                }
            }
        }, 1200);
    } else {
        showRevealElement(el);
    }
}

function scanEditorialReveals() {
    if (prefersReducedMotion()) return;

    document.querySelectorAll('.tng-home-sec-header').forEach((header, idx) => {
        registerRevealTarget(header, idx, false);
    });

    REVEAL_GRID_SELECTORS.forEach(gridSel => {
        document.querySelectorAll(gridSel).forEach(grid => {
            const items = grid.querySelectorAll(STAGGER_ITEM_SELECTOR);
            let localIdx = 0;
            items.forEach(item => {
                if (item.dataset.tngRevealBound === '1' || item.classList.contains('skeleton')) return;
                registerRevealTarget(item, localIdx++, true);
            });
        });
    });
}

/**
 * #1 Editorial Scroll Reveal & Stagger cho trang chủ, Lookbook, Bộ sưu tập và danh sách sản phẩm.
 */
export function initEditorialScrollReveal() {
    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') return;

    if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    showRevealElement(entry.target);
                }
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -36px 0px'
        });
    }

    scanEditorialReveals();

    if (!window.__tngRevealMutationBound && typeof MutationObserver === 'function') {
        window.__tngRevealMutationBound = true;
        const root = document.querySelector('main') || document.body;
        if (root) {
            const mo = new MutationObserver(() => scheduleRevealScan());
            mo.observe(root, { childList: true, subtree: true });
        }
    }
}

/**
 * #5 Thanh tiến trình đọc mảnh 2px ở mép trên cùng cho Chi tiết sản phẩm, Blog, Chính sách.
 */
export function initReadingProgressBar() {
    const path = (window.location.pathname || '').toLowerCase();
    const isTargetPage =
        path.includes('/product') ||
        path.includes('/article') ||
        path.includes('/blog') ||
        path.includes('/chinh-sach') ||
        Boolean(document.querySelector('.v2-product-page, .policy-layout, .article-container, .blog-detail-container'));

    if (!isTargetPage) return;

    let bar = document.getElementById('tng-reading-progress');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'tng-reading-progress';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);
    }

    let ticking = false;
    const updateProgress = () => {
        ticking = false;
        const docEl = document.documentElement;
        const maxScroll = Math.max(0, docEl.scrollHeight - window.innerHeight);
        const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
        bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    };

    const onScrollOrResize = () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(updateProgress);
        }
    };

    if (!window.__tngReadingProgressBound) {
        window.__tngReadingProgressBound = true;
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });
    }
    updateProgress();
}

const SLIDING_PILL_GROUPS = [
    { containerSelector: '.auth-tabs', itemSelector: '.auth-tab', desktopOnly: false },
    { containerSelector: '#app-sort-pills', itemSelector: '.app-sort-chip', desktopOnly: false },
    { containerSelector: '.profile-nav', itemSelector: '.profile-nav-btn', desktopOnly: true }
];

function positionSlidingPill(container, itemSelector, desktopOnly = false) {
    if (!container) return;
    if (desktopOnly && window.innerWidth <= 768) {
        container.classList.remove('tng-sliding-ready');
        const oldPill = container.querySelector(':scope > .tng-sliding-pill');
        if (oldPill) oldPill.style.opacity = '0';
        return;
    }

    const activeItem = container.querySelector(`${itemSelector}.active`);
    if (!activeItem) return;

    const cRect = container.getBoundingClientRect();
    const aRect = activeItem.getBoundingClientRect();
    if (aRect.width <= 0 || aRect.height <= 0) return;

    let pill = container.querySelector(':scope > .tng-sliding-pill');
    if (!pill) {
        pill = document.createElement('span');
        pill.className = 'tng-sliding-pill';
        pill.setAttribute('aria-hidden', 'true');
        container.prepend(pill);
    }

    const left = aRect.left - cRect.left + container.scrollLeft;
    const top = aRect.top - cRect.top + container.scrollTop;

    container.classList.add('tng-sliding-container', 'tng-sliding-ready');
    pill.style.width = `${aRect.width}px`;
    pill.style.height = `${aRect.height}px`;
    pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    pill.style.opacity = '1';
}

/**
 * #4 Đồng bộ lại vị trí viên thuốc trượt trên toàn bộ các thanh Tab / Sort / Profile Nav.
 */
export function refreshSlidingPills() {
    SLIDING_PILL_GROUPS.forEach(({ containerSelector, itemSelector, desktopOnly }) => {
        document.querySelectorAll(containerSelector).forEach(container => {
            positionSlidingPill(container, itemSelector, desktopOnly);
        });
    });
}

export function initSlidingPills() {
    SLIDING_PILL_GROUPS.forEach(({ containerSelector, itemSelector, desktopOnly }) => {
        document.querySelectorAll(containerSelector).forEach(container => {
            if (container.dataset.tngSlidingBound !== '1') {
                container.dataset.tngSlidingBound = '1';
                container.addEventListener('click', (e) => {
                    if (e.target.closest(itemSelector)) {
                        requestAnimationFrame(() => positionSlidingPill(container, itemSelector, desktopOnly));
                    }
                });
                if (typeof ResizeObserver === 'function') {
                    const ro = new ResizeObserver(() => positionSlidingPill(container, itemSelector, desktopOnly));
                    ro.observe(container);
                }
            }
            requestAnimationFrame(() => positionSlidingPill(container, itemSelector, desktopOnly));
        });
    });

    if (!window.__tngSlidingResizeBound) {
        window.__tngSlidingResizeBound = true;
        window.addEventListener('resize', () => requestAnimationFrame(refreshSlidingPills), { passive: true });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => requestAnimationFrame(refreshSlidingPills)).catch(() => {});
        }
    }
}

/**
 * #6 Hiệu ứng nghiêng 3D & vệt sáng men gốm cho Thẻ Gốm Membership.
 */
export function initMembershipCardTilt() {
    if (prefersReducedMotion()) return;
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        return;
    }

    document.querySelectorAll('.membership-card').forEach(card => {
        if (card.dataset.tiltBound === '1') return;
        card.dataset.tiltBound = '1';
        card.classList.add('tng-tilt-ready');

        card.addEventListener('pointermove', (e) => {
            const rect = card.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
            const rotateY = (px - 0.5) * 10;
            const rotateX = (0.5 - py) * 10;

            card.style.setProperty('--tilt-gx', `${(px * 100).toFixed(1)}%`);
            card.style.setProperty('--tilt-gy', `${(py * 100).toFixed(1)}%`);
            card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.012, 1.012, 1.012)`;
        });

        card.addEventListener('pointerleave', () => {
            card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            card.style.removeProperty('--tilt-gx');
            card.style.removeProperty('--tilt-gy');
        });
    });
}

/**
 * #6 Đếm số mượt trong 560ms (ease-out cubic) cho các chỉ số thống kê Profile.
 */
export function animateCountUp(el, targetValue, formatter = (v) => String(Math.round(v)), duration = 560) {
    if (!el) return;
    if (el._tngCountRaf) {
        cancelAnimationFrame(el._tngCountRaf);
        el._tngCountRaf = null;
    }

    const endVal = Number(targetValue) || 0;
    if (prefersReducedMotion() || endVal <= 0 || duration <= 0) {
        el.innerText = formatter(endVal);
        return;
    }

    const startTime = performance.now();
    const tick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = endVal * eased;
        el.innerText = formatter(progress < 1 ? current : endVal);

        if (progress < 1) {
            el._tngCountRaf = requestAnimationFrame(tick);
        } else {
            el._tngCountRaf = null;
        }
    };
    el._tngCountRaf = requestAnimationFrame(tick);
}

/**
 * #6 Rung nhẹ cụm 6 ô OTP khi nhập sai / thiếu mã.
 */
export function triggerOtpShake(containerOrId) {
    const el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('tng-otp-shake');
    void el.offsetWidth;
    el.classList.add('tng-otp-shake');
    clearTimeout(el._tngShakeTimer);
    el._tngShakeTimer = setTimeout(() => el.classList.remove('tng-otp-shake'), 480);
}

/**
 * #2 Hiệu ứng gợn sóng đơn sắc & nhịp tim đàn hồi khi bấm Yêu thích.
 */
export function triggerHeartRipple(btnEl) {
    if (!btnEl || prefersReducedMotion()) return;
    btnEl.classList.remove('tng-heart-pop');
    void btnEl.offsetWidth;
    btnEl.classList.add('tng-heart-pop');
    clearTimeout(btnEl._tngHeartTimer);
    btnEl._tngHeartTimer = setTimeout(() => btnEl.classList.remove('tng-heart-pop'), 520);
}

/**
 * #3 / #5 Nhịp highlight nhẹ khi tổng tiền hoặc giá biến thể thay đổi.
 */
export function pulsePriceHighlight(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('tng-price-pulse');
    void el.offsetWidth;
    el.classList.add('tng-price-pulse');
    clearTimeout(el._tngPriceTimer);
    el._tngPriceTimer = setTimeout(() => el.classList.remove('tng-price-pulse'), 460);
}

/**
 * #3 Hiệu ứng bật nảy badge số lượng giỏ hàng trên Header.
 */
export function animateCartBadgePop() {
    if (prefersReducedMotion()) return;
    document.querySelectorAll('.cart-count-badge').forEach(badge => {
        badge.classList.remove('tng-badge-pop');
        void badge.offsetWidth;
        badge.classList.add('tng-badge-pop');
        clearTimeout(badge._tngBadgeTimer);
        badge._tngBadgeTimer = setTimeout(() => badge.classList.remove('tng-badge-pop'), 480);
    });
}

export function initTngMotion() {
    if (typeof window === 'undefined') return;

    window.tngRefreshSlidingPills = refreshSlidingPills;
    window.tngInitMembershipTilt = initMembershipCardTilt;
    window.tngAnimateCountUp = animateCountUp;
    window.tngShakeOtp = triggerOtpShake;
    window.tngHeartRipple = triggerHeartRipple;
    window.tngPulsePrice = pulsePriceHighlight;
    window.tngBadgePop = animateCartBadgePop;

    if (window.__tngMotionInitialized) {
        scheduleRevealScan();
        refreshSlidingPills();
        initMembershipCardTilt();
        return;
    }
    window.__tngMotionInitialized = true;

    initEditorialScrollReveal();
    initReadingProgressBar();
    initSlidingPills();
    initMembershipCardTilt();
}
