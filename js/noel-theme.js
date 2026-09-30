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
            link.href = `${this.pathPrefix}css/noel.css?v=3`;
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

        if (active) {
            this.startSnow();
        } else {
            this.stopSnow();
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
                <span class="noel-banner-icon">🎄</span>
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
            if (hs.active !== false && hs.message && hs.message.trim()) {
                this.renderHolidayBanner(hs.message);
            } else {
                this.removeHolidayBanner();
            }
        }
    }
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
}
