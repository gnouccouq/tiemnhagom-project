// Trợ lý AI Tiệm Nhà Gốm — Gọi qua Firebase Cloud Function (/api/ai-chat) để bảo mật tuyệt đối Gemini API Key
import { auth } from "./config.js";

const AI_CHAT_CLOUD_URL = 'https://us-central1-tiemnhagom-project.cloudfunctions.net/aiChat';
const BOT_AVATAR_URL = '/Asset/icons/favicon.png';

let chatHistory = [];
let isSending = false;

function getCurrentTimeLabel() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function getBotAvatarHtml() {
    return `
        <div class="chat-avatar chat-avatar--bot" aria-hidden="true">
            <img src="${BOT_AVATAR_URL}" alt="Tiệm Nhà Gốm" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<span>G</span>';">
        </div>
    `;
}

function getUserAvatarHtml() {
    const user = auth?.currentUser;
    if (user?.photoURL) {
        const safeUrl = escapeHtml(user.photoURL);
        return `
            <div class="chat-avatar chat-avatar--user" aria-hidden="true">
                <img src="${safeUrl}" alt="Bạn" onerror="this.onerror=null; this.parentElement.innerHTML='<svg viewBox=&quot;0 0 24 24&quot; width=&quot;15&quot; height=&quot;15&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2&quot;><path d=&quot;M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2&quot;/><circle cx=&quot;12&quot; cy=&quot;7&quot; r=&quot;4&quot;/></svg>';">
            </div>
        `;
    }
    const nameInitial = user?.displayName ? escapeHtml(user.displayName.trim().charAt(0).toUpperCase()) : '';
    if (nameInitial) {
        return `<div class="chat-avatar chat-avatar--user" aria-hidden="true"><span>${nameInitial}</span></div>`;
    }
    return `
        <div class="chat-avatar chat-avatar--user" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        </div>
    `;
}

function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(Number(amount) || 0))) + 'đ';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getProductUrl(productId) {
    return `/product/index.html?id=${encodeURIComponent(productId)}`;
}

function getAiChatEndpoints() {
    const host = window.location.hostname || '';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
    // Trên web production gọi same-origin /api/ai-chat (Firebase Hosting rewrite), local gọi trực tiếp Cloud Function
    return isLocal ? [AI_CHAT_CLOUD_URL] : ['/api/ai-chat', AI_CHAT_CLOUD_URL];
}

async function askAiBackend(userQuery) {
    const endpoints = getAiChatEndpoints();
    let lastError = null;

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userQuery,
                    history: chatHistory.slice(-6)
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.success && data.text) {
                    return {
                        text: data.text,
                        products: Array.isArray(data.products) ? data.products : []
                    };
                }
            }
            lastError = new Error(`HTTP ${response.status}`);
        } catch (err) {
            lastError = err;
            console.warn(`Không thể kết nối endpoint AI [${url}]:`, err);
        }
    }

    throw lastError || new Error('AI backend unavailable');
}

function renderProductCardsHtml(products) {
    if (!products || !products.length) return '';

    const cards = products.map(p => {
        const safeName = escapeHtml(p.name);
        const safeCategory = escapeHtml(p.category || 'Gốm thủ công');
        const safeImg = escapeHtml(p.image || '/Asset/images/TNGHANDMADE.jpg');
        const url = getProductUrl(p.id);
        const colors = Array.isArray(p.colors) ? p.colors : [];
        const patterns = Array.isArray(p.patterns) ? p.patterns : [];
        const variantNote = colors.length > 0
            ? `${colors.length} màu`
            : (patterns.length > 0 ? `${patterns.length} họa tiết` : '');
        const specLine = [
            p.material ? escapeHtml(p.material) : '',
            p.dimensionsText ? escapeHtml(p.dimensionsText) : '',
            p.capacityMl > 0 ? `${p.capacityMl}ml` : ''
        ].filter(Boolean).join(' · ');

        return `
            <a href="${url}" class="ai-prod-card" target="_blank" rel="noopener noreferrer">
                <div class="ai-prod-thumb">
                    <img src="${safeImg}" alt="${safeName}" loading="lazy" onerror="this.onerror=null; this.src='/Asset/images/TNGHANDMADE.jpg';">
                    ${p.isOnSale && p.discountPct > 0 ? `<span class="ai-prod-sale-badge">-${p.discountPct}%</span>` : ''}
                </div>
                <div class="ai-prod-info">
                    <div class="ai-prod-meta">
                        <span class="ai-prod-cat">${safeCategory}</span>
                        ${variantNote ? `<span class="ai-prod-var">· ${escapeHtml(variantNote)}</span>` : ''}
                    </div>
                    <div class="ai-prod-name" title="${safeName}">${safeName}</div>
                    ${specLine ? `<div class="ai-prod-spec" title="${specLine}">${specLine}</div>` : ''}
                    <div class="ai-prod-bottom">
                        <div class="ai-prod-prices">
                            <span class="ai-prod-price">${formatVND(p.effectivePrice)}</span>
                            ${p.isOnSale && p.rawPrice > p.effectivePrice ? `<span class="ai-prod-old-price">${formatVND(p.rawPrice)}</span>` : ''}
                        </div>
                        <span class="ai-prod-cta">Xem &rarr;</span>
                    </div>
                </div>
            </a>
        `;
    }).join('');

    return `<div class="ai-prod-cards-list">${cards}</div>`;
}

function formatMessageText(text) {
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function injectChatWidgetHTML() {
    if (document.getElementById('gemini-chat-widget')) return;

    const html = `
        <div id="gemini-chat-widget" class="gemini-chat-widget">
            <div id="gemini-chat-window" class="gemini-chat-window" role="dialog" aria-label="Trợ lý AI Tiệm Nhà Gốm">
                <div class="gemini-chat-header">
                    <div class="header-info">
                        <div class="ai-avatar ai-avatar--brand" aria-hidden="true">
                            <img src="${BOT_AVATAR_URL}" alt="Tiệm Nhà Gốm" onerror="this.onerror=null; this.style.display='none';">
                        </div>
                        <div>
                            <h4>Trợ lý Tiệm Nhà Gốm</h4>
                            <span class="ai-status"><span class="ai-status-dot"></span>Luôn sẵn sàng tư vấn gốm</span>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button type="button" id="gemini-chat-reset" class="header-icon-btn" title="Bắt đầu cuộc trò chuyện mới" aria-label="Làm mới cuộc trò chuyện">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                        </button>
                        <button type="button" id="gemini-chat-close" class="close-chat-btn" aria-label="Đóng khung chat">&times;</button>
                    </div>
                </div>

                <div id="gemini-chat-messages" class="gemini-chat-messages"></div>

                <div class="chat-quick-chips" id="gemini-quick-chips">
                    <button type="button" class="chip-btn" data-query="Gợi ý quà tặng tân gia dưới 500k">Quà tân gia &lt; 500k</button>
                    <button type="button" class="chip-btn" data-query="Tìm bình hoa gốm mộc đẹp">Bình hoa gốm</button>
                    <button type="button" class="chip-btn" data-query="Gợi ý ly tách trà hoặc cà phê">Ly tách trà</button>
                    <button type="button" class="chip-btn" data-query="Sản phẩm nào đang giảm giá?">Đang khuyến mãi</button>
                </div>

                <div class="gemini-chat-input-area">
                    <input type="text" id="gemini-input" maxlength="300" placeholder="VD: Tìm bình hoa dưới 400k, quà tặng..." autocomplete="off">
                    <button type="button" id="gemini-send-btn" class="send-btn" aria-label="Gửi tin nhắn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    renderWelcomeMessage();
    setupWidgetEvents();
}

function renderWelcomeMessage() {
    const container = document.getElementById('gemini-chat-messages');
    if (!container) return;
    container.innerHTML = '';
    appendMessage(
        'ai',
        'Chào bạn nha! Mình là **Trợ lý AI của Tiệm Nhà Gốm**.\nMình có thể xem trực tiếp kho sản phẩm để gợi ý mẫu gốm kèm hình ảnh và giá hợp gu nhất cho bạn. Hôm nay bạn đang tìm món đồ nào nè?'
    );
}

function setupWidgetEvents() {
    const closeBtn = document.getElementById('gemini-chat-close');
    const resetBtn = document.getElementById('gemini-chat-reset');
    const chatWindow = document.getElementById('gemini-chat-window');
    const input = document.getElementById('gemini-input');
    const sendBtn = document.getElementById('gemini-send-btn');

    if (!chatWindow) return;

    const getToggleBtn = () => document.getElementById('gemini-chat-toggle');

    const openChat = () => {
        chatWindow.classList.add('active');
        const toggleBtn = getToggleBtn();
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.classList.add('active');
        }
        setTimeout(() => input?.focus(), 180);
    };

    const closeChat = () => {
        chatWindow.classList.remove('active');
        const toggleBtn = getToggleBtn();
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.classList.remove('active');
        }
    };

    // Event delegation để tương thích khi nút #gemini-chat-toggle được nạp async từ components/footer.html
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#gemini-chat-toggle');
        if (!btn) return;
        e.preventDefault();
        if (chatWindow.classList.contains('active')) closeChat();
        else openChat();
    });

    closeBtn?.addEventListener('click', closeChat);

    resetBtn?.addEventListener('click', () => {
        chatHistory = [];
        renderWelcomeMessage();
        input?.focus();
    });

    const handleSend = async (textOverride = null) => {
        if (isSending) return;
        const queryText = (textOverride !== null ? textOverride : input.value).trim();
        if (!queryText) return;

        if (textOverride === null && input) input.value = '';
        isSending = true;
        if (sendBtn) sendBtn.disabled = true;

        appendMessage('user', queryText);
        const loadingId = appendLoadingBubble();

        try {
            const result = await askAiBackend(queryText);
            removeLoadingBubble(loadingId);
            appendMessage('ai', result.text, result.products);

            chatHistory.push({ role: 'user', text: queryText });
            chatHistory.push({ role: 'model', text: result.text });
            if (chatHistory.length > 12) {
                chatHistory = chatHistory.slice(-12);
            }
        } catch (err) {
            removeLoadingBubble(loadingId);
            appendMessage('ai', 'Rất tiếc, hệ thống đang bận một chút. Bạn thử hỏi lại hoặc nhắn Zalo 0777 709 662 để tụi mình hỗ trợ ngay nhé!');
        } finally {
            isSending = false;
            if (sendBtn) sendBtn.disabled = false;
            input?.focus();
        }
    };

    sendBtn?.addEventListener('click', () => handleSend());
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    document.querySelectorAll('#gemini-quick-chips .chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = btn.dataset.query;
            if (q) handleSend(q);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatWindow.classList.contains('active')) {
            closeChat();
        }
    });
}

function appendMessage(sender, text, products = []) {
    const container = document.getElementById('gemini-chat-messages');
    if (!container) return;

    const isAi = sender === 'ai';
    const row = document.createElement('div');
    row.className = `chat-row ${isAi ? 'ai-row' : 'user-row'}`;

    const formattedText = formatMessageText(text);
    const cardsHtml = isAi ? renderProductCardsHtml(products) : '';
    const timeLabel = getCurrentTimeLabel();

    row.innerHTML = isAi
        ? `
            ${getBotAvatarHtml()}
            <div class="chat-msg ai-msg">
                <div class="chat-sender-meta">
                    <span class="chat-sender-name">Tiệm Nhà Gốm</span>
                    <span class="chat-time">${timeLabel}</span>
                </div>
                <div class="msg-content">${formattedText}</div>
                ${cardsHtml}
            </div>
        `
        : `
            <div class="chat-msg user-msg">
                <div class="chat-sender-meta chat-sender-meta--user">
                    <span class="chat-time">${timeLabel}</span>
                    <span class="chat-sender-name">Bạn</span>
                </div>
                <div class="msg-content">${formattedText}</div>
            </div>
            ${getUserAvatarHtml()}
        `;

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

function appendLoadingBubble() {
    const container = document.getElementById('gemini-chat-messages');
    if (!container) return null;

    const row = document.createElement('div');
    const id = 'loading-' + Date.now();
    row.id = id;
    row.className = 'chat-row ai-row loading-row';
    row.innerHTML = `
        ${getBotAvatarHtml()}
        <div class="chat-msg ai-msg loading-msg">
            <div class="msg-content">
                <span class="typing-dots"><span></span><span></span><span></span></span>
                <span style="margin-left: 6px; color: #7C7267;">Tiệm đang trả lời...</span>
            </div>
        </div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeLoadingBubble(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

export function initGeminiAssistant() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('/dashboard') || path.includes('pos.html')) {
        return;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectChatWidgetHTML, { once: true });
    } else {
        injectChatWidgetHTML();
    }
}
