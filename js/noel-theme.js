/**
 * TIỆM NHÀ GỐM - CHRISTMAS / NOEL THEME ENGINE
 * Quản lý hiệu ứng tuyết rơi, mũ Noel trên logo và dây đèn trang trí thanh navbar
 */

class NoelThemeEngine {
    constructor() {
        this.isActive = true;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.snowflakes = [];
        this.width = typeof window !== 'undefined' ? window.innerWidth : 1200;
        this.height = typeof window !== 'undefined' ? window.innerHeight : 800;
        this.pathPrefix = './';
        this.isInitialized = false;
        this.snowDensity = 'medium'; // low: 35, medium: 65, high: 110
    }

    /**
     * Khởi tạo giao diện Noel
     * @param {string} pathPrefix - Đường dẫn tương đối đến thư mục gốc
     */
    init(pathPrefix = './') {
        if (this.isInitialized) return;
        this.pathPrefix = pathPrefix;

        // 1. Nạp CSS Noel nếu chưa có
        this.injectStylesheet();

        // 2. Tiêm các thành phần trang trí (Canvas, Dây đèn, Mũ Noel)
        this.injectDecorations();

        // 3. Khởi tạo Canvas Snow Engine
        this.setupSnowEngine();

        // 4. Kích hoạt trạng thái Noel trên body và bắt đầu rơi tuyết
        this.applyState(true);

        // 5. Đăng ký các sự kiện resize và visibilitychange
        this.bindEvents();

        this.isInitialized = true;
    }

    /**
     * Nạp stylesheet css/noel.css tự động
     */
    injectStylesheet() {
        if (!document.getElementById('noel-theme-styles')) {
            const link = document.createElement('link');
            link.id = 'noel-theme-styles';
            link.rel = 'stylesheet';
            link.href = `${this.pathPrefix}css/noel.css?v=9`;
            document.head.appendChild(link);
        }
    }

    /**
     * Tiêm Canvas tuyết và các chi tiết trang trí vào DOM
     */
    injectDecorations() {
        // A. Canvas tuyết rơi (fixed toàn màn hình, pointer-events none)
        if (!document.getElementById('noel-snow-canvas')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'noel-snow-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            document.body.prepend(canvas);
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
        } else {
            this.canvas = document.getElementById('noel-snow-canvas');
            this.ctx = this.canvas.getContext('2d');
        }

        // B. Gắn Mũ Noel vào Logo và Dây đèn vào Navbar (nếu có Navbar trên trang)
        this.attachHeaderElements();
    }

    /**
     * Gắn mũ Noel vào Logo và dây đèn vào Navbar
     */
    attachHeaderElements() {
        const logo = document.querySelector('.logo');
        if (logo && !logo.querySelector('.noel-santa-hat')) {
            const hat = document.createElement('span');
            hat.className = 'noel-santa-hat';
            hat.setAttribute('aria-hidden', 'true');
            logo.appendChild(hat);
        }

        const navbar = document.querySelector('.navbar');
        if (navbar && !navbar.querySelector('.noel-fairy-lights')) {
            const lights = document.createElement('div');
            lights.className = 'noel-fairy-lights';
            lights.setAttribute('aria-hidden', 'true');

            // Chuỗi bóng đèn giáng sinh xen kẽ 5 màu
            const colors = ['b-red', 'b-gold', 'b-green', 'b-blue', 'b-warm'];
            let bulbsHtml = '';
            for (let i = 0; i < 24; i++) {
                const color = colors[i % colors.length];
                bulbsHtml += `<span class="noel-light-bulb ${color}"></span>`;
            }
            lights.innerHTML = bulbsHtml;
            navbar.appendChild(lights);
        }
    }

    /**
     * Thiết lập Canvas và khởi tạo các bông tuyết
     */
    setupSnowEngine() {
        if (!this.canvas) return;

        this.updateCanvasDimensions();

        const isMobile = window.innerWidth <= 768;
        let count = isMobile ? 32 : 68;

        if (this.snowDensity === 'low') count = isMobile ? 20 : 40;
        if (this.snowDensity === 'high') count = isMobile ? 55 : 110;

        this.snowflakes = [];
        for (let i = 0; i < count; i++) {
            this.snowflakes.push(this.createSnowflake());
        }
    }

    /**
     * Tạo thông số cho 1 bông tuyết
     */
    createSnowflake(fromTop = false) {
        const radius = Math.random() * 3 + 1.2; // 1.2px đến 4.2px
        return {
            x: Math.random() * this.width,
            y: fromTop ? -10 - Math.random() * 20 : Math.random() * this.height,
            radius: radius,
            density: Math.random() * 1.5 + 0.8, // Tốc độ rơi
            sway: Math.random() * 1.5 + 0.5,     // Biên độ lắc lư
            swaySpeed: Math.random() * 0.02 + 0.01,
            angle: Math.random() * Math.PI * 2,
            opacity: Math.random() * 0.55 + 0.35 // Độ trong suốt
        };
    }

    /**
     * Cập nhật kích thước Canvas theo kích thước trình duyệt
     */
    updateCanvasDimensions() {
        if (!this.canvas) return;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        if (this.ctx) {
            this.ctx.scale(dpr, dpr);
        }
    }

    /**
     * Vòng lặp vẽ tuyết rơi (60 FPS)
     */
    renderSnow() {
        if (!this.isActive || !this.ctx) return;

        this.ctx.clearRect(0, 0, this.width, this.height);

        for (let i = 0; i < this.snowflakes.length; i++) {
            const flake = this.snowflakes[i];

            // Tọa độ và dao động gió
            flake.angle += flake.swaySpeed;
            flake.x += Math.sin(flake.angle) * flake.sway;
            flake.y += flake.density;

            // Bông tuyết viền mờ mềm mại (Soft Flake)
            this.ctx.beginPath();
            const grad = this.ctx.createRadialGradient(
                flake.x, flake.y, 0,
                flake.x, flake.y, flake.radius
            );
            grad.addColorStop(0, `rgba(255, 255, 255, ${flake.opacity})`);
            grad.addColorStop(0.7, `rgba(255, 255, 255, ${flake.opacity * 0.7})`);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            this.ctx.fillStyle = grad;
            this.ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Nếu rơi ra khỏi đáy hoặc cạnh màn hình -> Đặt lại vị trí từ trên đỉnh
            if (flake.y > this.height + 10) {
                this.snowflakes[i] = this.createSnowflake(true);
            }
            if (flake.x > this.width + 10) {
                flake.x = -10;
            } else if (flake.x < -10) {
                flake.x = this.width + 10;
            }
        }

        this.animationId = requestAnimationFrame(() => this.renderSnow());
    }

    /**
     * Bắt đầu vẽ tuyết rơi
     */
    startSnow() {
        if (localStorage.getItem('tng_snow_disabled') === '1') {
            this.stopSnow();
            return;
        }
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.renderSnow();
    }

    /**
     * Dừng vẽ tuyết và xóa canvas
     */
    stopSnow() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }

    /**
     * Áp dụng trạng thái BẬT/TẮT vào toàn bộ giao diện
     * @param {boolean} active 
     */
    applyState(active) {
        this.isActive = active;

        // Thêm/Xóa class trên body
        document.body.classList.toggle('noel-active', active);

        // Ẩn/Hiện mục menu Giáng Sinh trên thanh điều hướng
        document.querySelectorAll('.noel-nav-item').forEach(el => {
            el.style.display = active ? '' : 'none';
        });

        if (active) {
            this.startSnow();
        } else {
            this.stopSnow();
        }
    }

    /**
     * Tiêm nút ❄️ nổi cho khách tự bật/tắt tuyết
     */
    injectSnowToggle(show = true) {
        let btn = document.getElementById('noel-snow-toggle-btn');
        if (!show || !this.isActive) {
            if (btn) btn.remove();
            return;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'noel-snow-toggle-btn';
            btn.className = 'noel-floating-snow-btn';
            btn.setAttribute('type', 'button');
            btn.setAttribute('aria-label', 'Bật / Tắt hiệu ứng tuyết rơi');
            btn.innerHTML = '❄';
            document.body.appendChild(btn);

            const isSnowDisabled = localStorage.getItem('tng_snow_disabled') === '1';
            if (isSnowDisabled) {
                btn.classList.add('disabled');
                btn.title = 'Bấm để BẬT tuyết rơi';
            } else {
                btn.title = 'Bấm để TẮT tuyết rơi';
            }

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const nowDisabled = localStorage.getItem('tng_snow_disabled') === '1';
                if (nowDisabled) {
                    localStorage.removeItem('tng_snow_disabled');
                    btn.classList.remove('disabled');
                    btn.title = 'Bấm để TẮT tuyết rơi';
                    this.startSnow();
                } else {
                    localStorage.setItem('tng_snow_disabled', '1');
                    btn.classList.add('disabled');
                    btn.title = 'Bấm để BẬT tuyết rơi';
                    this.stopSnow();
                }
            });
        }
    }

    /**
     * Bật/Tắt vệt tuyết mỏng phủ trên mép thẻ sản phẩm (Snow Cap)
     */
    applySnowCaps(enabled = true) {
        document.body.classList.toggle('noel-snow-cap-on', enabled && this.isActive);
    }

    /**
     * Bật/Tắt hiệu ứng sao lấp lánh trên tiêu đề
     */
    applySparkleTitles(enabled = true) {
        const titles = document.querySelectorAll('.noel-showcase-title, .noel-banner-left h2, .noel-hero-title');
        titles.forEach(t => {
            if (enabled && this.isActive) {
                if (!t.querySelector('.noel-sparkle-star')) {
                    const s1 = document.createElement('span');
                    s1.className = 'noel-sparkle-star';
                    s1.textContent = '✦';
                    const s2 = document.createElement('span');
                    s2.className = 'noel-sparkle-star';
                    s2.textContent = '❄';
                    t.prepend(s1);
                    t.appendChild(s2);
                }
            } else {
                t.querySelectorAll('.noel-sparkle-star').forEach(s => s.remove());
            }
        });
    }

    /**
     * Tiêm widget Chiếc vớ Giáng Sinh may mắn (Secret Santa Voucher Popup)
     */
    injectSecretSantaWidget(show = true, voucherCode = 'NOEL2026', discountText = 'Giảm 20.000đ cho đơn từ 200.000đ') {
        let widget = document.getElementById('noel-lucky-sock-widget');
        let modal = document.getElementById('noel-sock-modal');

        if (!show || !this.isActive) {
            if (widget) widget.remove();
            if (modal) modal.remove();
            return;
        }

        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'noel-lucky-sock-widget';
            widget.className = 'noel-lucky-sock-widget';
            widget.title = 'Mở quà Giáng Sinh may mắn từ Tiệm Nhà Gốm!';
            widget.innerHTML = `
                <div class="noel-sock-icon-wrap">
                    <span class="noel-sock-badge">Quà!</span>
                    <span style="display:inline-block; transform: scaleX(-1);">🧦</span>
                </div>
                <span class="noel-sock-tag">Vớ Noel</span>
            `;
            document.body.appendChild(widget);

            modal = document.createElement('div');
            modal.id = 'noel-sock-modal';
            modal.className = 'noel-modal-backdrop';
            modal.innerHTML = `
                <div class="noel-sock-popup" role="dialog" aria-modal="true">
                    <button type="button" class="noel-sock-popup-close" id="btn-close-noel-sock">&times;</button>
                    <div style="font-size:2.2rem; margin-bottom:4px;">🧦 🎄 ✨</div>
                    <h3 style="font-family:var(--font-serif, 'Playfair Display', serif); font-size:1.35rem; color:#991b1b; margin:0 0 6px 0;">Món Quà Giáng Sinh May Mắn</h3>
                    <p style="font-size:0.85rem; color:#57534e; margin:0 0 12px 0; line-height:1.45;">
                        Tiệm Nhà Gốm gửi tặng bạn chiếc vớ may mắn cùng mã ưu đãi ấm áp mùa lễ hội:
                    </p>
                    <div class="noel-coupon-box">
                        <div style="text-align:left;">
                            <div style="font-size:0.7rem; color:#78716c; font-weight:600; text-transform:uppercase;">Mã Voucher Noel</div>
                            <div class="noel-coupon-code" id="noel-modal-code">${voucherCode}</div>
                        </div>
                        <button type="button" class="noel-coupon-copy-btn" id="btn-copy-noel-code">
                            <i class="ti ti-copy"></i> <span id="copy-text-label">Sao chép</span>
                        </button>
                    </div>
                    <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:8px 12px; margin-bottom:14px; font-size:0.82rem; color:#92400e; font-weight:600;" id="noel-modal-desc">
                        <i class="ti ti-tag"></i> ${discountText}
                    </div>
                    <div style="display:flex; gap:10px;">
                        <a href="${this.pathPrefix}noel/" class="btn-primary" style="flex:1; padding:9px 12px; border-radius:8px; text-decoration:none; font-size:0.85rem; font-weight:700; text-align:center; background:#991b1b; color:#fff; display:block;">
                            Khám Phá Gốm Noel
                        </a>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            widget.addEventListener('click', () => {
                modal.classList.add('active');
            });

            const closeBtn = modal.querySelector('#btn-close-noel-sock');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => modal.classList.remove('active'));
            }
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });

            const copyBtn = modal.querySelector('#btn-copy-noel-code');
            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    const code = modal.querySelector('#noel-modal-code')?.textContent?.trim() || voucherCode;
                    try {
                        await navigator.clipboard.writeText(code);
                        const label = modal.querySelector('#copy-text-label');
                        if (label) label.textContent = 'Đã chép!';
                        setTimeout(() => {
                            if (label) label.textContent = 'Sao chép';
                        }, 2500);
                    } catch (err) {
                        console.log('Clipboard error:', err);
                    }
                });
            }
        } else {
            const codeEl = modal?.querySelector('#noel-modal-code');
            if (codeEl) codeEl.textContent = voucherCode;
            const descEl = modal?.querySelector('#noel-modal-desc');
            if (descEl) descEl.innerHTML = `<i class="ti ti-tag"></i> ${discountText}`;
        }
    }

    /**
     * Tiêm widget Nghe nhạc Giáng Sinh thư giãn (Ambient Music Player)
     */
    injectMusicPlayer(show = true, musicUrl = '') {
        let widget = document.getElementById('noel-music-widget');
        let audio = document.getElementById('noel-ambient-audio');

        if (!show || !this.isActive) {
            if (widget) widget.remove();
            if (audio) {
                audio.pause();
                audio.remove();
            }
            return;
        }

        const defaultMusicUrl = 'https://assets.mixkit.co/music/preview/mixkit-silent-night-holiday-acoustic-guitar-1174.mp3';
        const finalUrl = (musicUrl && musicUrl.trim()) ? musicUrl.trim() : defaultMusicUrl;

        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'noel-ambient-audio';
            audio.loop = true;
            audio.preload = 'none';
            audio.src = finalUrl;
            document.body.appendChild(audio);
        } else if (audio.src !== finalUrl) {
            audio.src = finalUrl;
        }

        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'noel-music-widget';
            widget.className = 'noel-music-widget';
            widget.title = 'Bấm để nghe giai điệu Giáng Sinh êm dịu';
            widget.innerHTML = `
                <span class="noel-music-icon"><i class="ti ti-music"></i></span>
                <span class="noel-music-label">Nhạc Noel</span>
                <div class="noel-audio-waves" aria-hidden="true">
                    <span></span><span></span><span></span><span></span>
                </div>
            `;
            document.body.appendChild(widget);

            widget.addEventListener('click', async (e) => {
                e.preventDefault();
                const label = widget.querySelector('.noel-music-label');
                if (audio.paused) {
                    try {
                        await audio.play();
                        widget.classList.add('playing');
                        if (label) label.textContent = 'Đang phát ♫';
                        widget.title = 'Bấm để dừng nhạc';
                    } catch (err) {
                        console.log('Audio playback prevented or error:', err);
                    }
                } else {
                    audio.pause();
                    widget.classList.remove('playing');
                    if (label) label.textContent = 'Nhạc Noel';
                    widget.title = 'Bấm để nghe giai điệu Giáng Sinh êm dịu';
                }
            });
        }
    }

    /**
     * Đăng ký các sự kiện tương tác
     */
    bindEvents() {
        // Tự động resize canvas khi đổi kích thước cửa sổ
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.setupSnowEngine();
                if (this.isActive && !this.animationId) {
                    this.startSnow();
                }
            }, 200);
        });

        // Tạm dừng vẽ tuyết khi chuyển sang tab khác để tiết kiệm CPU/pin
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
            } else if (this.isActive) {
                this.startSnow();
            }
        });
    }

    /**
     * Hiển thị banner thông điệp chúc mừng mùa lễ hội (nếu có cấu hình từ Admin)
     * @param {string} message 
     */
    renderHolidayBanner(message) {
        if (!message || !message.trim()) return;

        // Nếu người dùng đã tự tay bấm đóng trong phiên duyệt này thì không hiện lại để tránh phiền
        if (sessionStorage.getItem('tng_noel_banner_closed') === '1') {
            return;
        }

        let banner = document.getElementById('noel-message-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'noel-message-banner';
            banner.className = 'noel-message-banner';
            banner.innerHTML = `
                <span class="noel-banner-icon"><i class="ti ti-christmas-tree"></i></span>
                <span class="noel-banner-text"></span>
                <button type="button" class="noel-banner-close" aria-label="Đóng thông báo" title="Đóng thông báo">&times;</button>
            `;
            document.body.appendChild(banner);

            const closeBtn = banner.querySelector('.noel-banner-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    banner.classList.remove('show');
                    setTimeout(() => {
                        if (banner.parentNode) banner.parentNode.removeChild(banner);
                    }, 400);
                    sessionStorage.setItem('tng_noel_banner_closed', '1');
                });
            }
        }

        const textSpan = banner.querySelector('.noel-banner-text');
        if (textSpan) {
            textSpan.textContent = message.trim();
        }

        // Kích hoạt animation trượt xuống mềm mại
        requestAnimationFrame(() => {
            banner.classList.add('show');
        });
    }

    /**
     * Xóa banner thông điệp nếu có
     */
    removeHolidayBanner() {
        const banner = document.getElementById('noel-message-banner');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
            }, 400);
        }
    }

    /**
     * Áp dụng cấu hình từ Dashboard Admin (Firestore)
     */
    applySystemSettings(settings = {}) {
        if (settings.holidaySeason) {
            const hs = settings.holidaySeason;
            window.noelHolidaySettings = hs;

            if (hs.active !== undefined) {
                this.applyState(hs.active);
            }
            if (hs.snowDensity) {
                this.snowDensity = hs.snowDensity;
                this.setupSnowEngine();
                if (this.isActive) this.startSnow();
            }
            if (hs.showLights === false) {
                const lights = document.querySelector('.noel-fairy-lights');
                if (lights) lights.style.display = 'none';
                const hat = document.querySelector('.noel-santa-hat');
                if (hat) hat.style.display = 'none';
            } else {
                const lights = document.querySelector('.noel-fairy-lights');
                if (lights) lights.style.display = '';
                const hat = document.querySelector('.noel-santa-hat');
                if (hat) hat.style.display = '';
            }

            // 1. Hiệu ứng mũ rung rinh khi hover
            document.body.classList.toggle('noel-hat-wiggle', hs.active !== false && hs.hatWiggle !== false);

            // 2. Phủ vệt tuyết mép thẻ sản phẩm (Snow Cap)
            this.applySnowCaps(hs.active !== false && hs.showSnowCap !== false);

            // 3. Hiệu ứng sao lấp lánh trên tiêu đề
            this.applySparkleTitles(hs.active !== false && hs.showSparkleTitle !== false);

            // 4. Nút ❄️ nổi cho khách tự bật/tắt tuyết
            this.injectSnowToggle(hs.active !== false && hs.showSnowToggleBtn !== false);

            // 5. Chiếc vớ Giáng Sinh may mắn (Secret Santa Voucher)
            this.injectSecretSantaWidget(
                hs.active !== false && hs.enableSecretSantaSock !== false,
                hs.secretSantaCode || 'NOEL2026',
                hs.secretSantaDiscount || 'Giảm 20.000đ cho đơn từ 200.000đ'
            );

            // 6. Widget nghe nhạc Giáng Sinh êm dịu (Mặc định tắt, khách tự click)
            this.injectMusicPlayer(
                hs.active !== false && hs.enableChristmasMusic !== false,
                hs.christmasMusicUrl || ''
            );

            // 7. Banner thông điệp mùa lễ hội
            if (hs.active !== false && hs.message && hs.message.trim()) {
                this.renderHolidayBanner(hs.message);
            } else {
                this.removeHolidayBanner();
            }

            // 8. Khu vực Trưng bày Kệ Gốm Giáng Sinh
            const showcaseSec = document.getElementById('noel-showcase-section');
            if (showcaseSec) {
                const showShowcase = hs.active !== false && hs.showShowcase !== false;
                showcaseSec.style.display = showShowcase ? '' : 'none';
                if (hs.showcaseTitle) {
                    const titleEl = document.getElementById('noel-showcase-title-text');
                    if (titleEl) titleEl.textContent = hs.showcaseTitle;
                }
                if (hs.showcaseSubtitle) {
                    const subEl = document.getElementById('noel-showcase-subtitle-text');
                    if (subEl) subEl.textContent = hs.showcaseSubtitle;
                }
            }

            // Phát sự kiện để Cart / Drawer Cart cập nhật checkbox gói quà nếu đang mở
            document.dispatchEvent(new CustomEvent('noel-settings-updated', { detail: hs }));
        }
    }
}

/**
 * Phân loại sản phẩm thuộc nhóm kệ Noel nào:
 * 'cups' (Ly & Tách), 'dining' (Bàn tiệc), 'gifts' (Set quà tặng), 'decor' (Decor & Bình hoa)
 */
export function classifyNoelSubCategory(product = {}) {
    if (product.noelTag && product.noelTag !== 'all') {
        return product.noelTag;
    }
    const text = `${product.name || ''} ${product.category || ''} ${product.subCategory || ''} ${(product.collections || []).join(' ')}`.toLowerCase();
    if (product.isCombo || /combo|set|bộ quà|quà tặng|gift|hộp/i.test(text)) {
        return 'gifts';
    }
    if (/ly|tách|cốc|mug|cup|ấm|trà|teatime|drink|lót ly/i.test(text)) {
        return 'cups';
    }
    if (/bình|lọ|hoa|đèn|nến|tượng|decor|trang trí|thông/i.test(text)) {
        return 'decor';
    }
    return 'dining';
}

// Singleton Instance
export const noelEngine = new NoelThemeEngine();

export function initNoelTheme(pathPrefix = './') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => noelEngine.init(pathPrefix));
    } else {
        noelEngine.init(pathPrefix);
    }
}

if (typeof window !== 'undefined') {
    window.initNoelTheme = initNoelTheme;
    window.noelEngine = noelEngine;
    window.classifyNoelSubCategory = classifyNoelSubCategory;
}
