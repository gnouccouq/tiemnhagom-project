import { initHeader } from './utils.js';

/**
 * Khởi tạo trang Chính sách: header chung, accordion mục lục trên mobile và scroll-spy active link.
 * @param {string} pathPrefix
 */
export function initPolicyPage(pathPrefix = '../') {
    const bootstrap = () => {
        initHeader(pathPrefix);
        setupMobileToc();
        setupTocScrollSpy();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
}

function setupMobileToc() {
    const toc = document.querySelector('.legal-toc');
    const toggleBtn = toc?.querySelector('.legal-toc-toggle');
    if (!toc || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const isOpen = toc.classList.toggle('is-open');
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    toc.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 900 && toc.classList.contains('is-open')) {
                toc.classList.remove('is-open');
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
        });
    });
}

function setupTocScrollSpy() {
    const tocLinks = Array.from(document.querySelectorAll('.legal-toc a[href^="#"]'));
    if (!tocLinks.length) return;

    const pairs = tocLinks
        .map((link) => {
            const id = link.getAttribute('href').slice(1);
            const section = id ? document.getElementById(id) : null;
            return section ? { link, section } : null;
        })
        .filter(Boolean);

    if (!pairs.length) return;

    const updateActive = () => {
        const triggerY = 130;
        const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;

        let activePair = pairs[0];
        if (nearBottom) {
            activePair = pairs[pairs.length - 1];
        } else {
            for (const pair of pairs) {
                const top = pair.section.getBoundingClientRect().top;
                if (top <= triggerY) {
                    activePair = pair;
                } else {
                    break;
                }
            }
        }

        pairs.forEach(({ link }) => {
            link.classList.toggle('active', link === activePair.link);
        });
    };

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
}
