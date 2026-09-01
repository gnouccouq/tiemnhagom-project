import { db } from "./config.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let productsCache = null;
let aiApiKeyCache = null;

// Lấy API Key từ Firestore
async function getGeminiApiKey() {
    if (aiApiKeyCache) return aiApiKeyCache;
    try {
        const snap = await getDoc(doc(db, "settings", "ai_config"));
        if (snap.exists() && snap.data().geminiApiKey) {
            aiApiKeyCache = snap.data().geminiApiKey.trim();
            return aiApiKeyCache;
        }
    } catch (e) {
        console.warn("Không thể lấy Gemini API Key từ Firestore:", e);
    }
    return null;
}

// Lấy danh sách sản phẩm tóm tắt để truyền cho Gemini
async function getCompactProductsContext() {
    if (productsCache) return productsCache;
    try {
        const snap = await getDocs(collection(db, "products"));
        const docs = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                name: data.name || '',
                price: data.price || 0,
                sale: data.sale || 0,
                category: data.category || '',
                stock: data.stock || 0,
                collections: data.collections || []
            };
        }).filter(p => p.name && p.stock > 0);

        productsCache = docs;
        return docs;
    } catch (e) {
        console.error("Lỗi lấy dữ liệu sản phẩm cho AI:", e);
        return [];
    }
}

// Tạo giao diện Chat Widget
function injectChatWidgetHTML() {
    if (document.getElementById('gemini-chat-widget')) return;

    const html = `
        <div id="gemini-chat-widget" class="gemini-chat-widget">
            <button id="gemini-chat-toggle" class="gemini-chat-toggle" title="Hỏi Trợ lý AI Tiệm Nhà Gốm">
                <div class="gemini-sparkle-icon">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                </div>
                <span class="chat-toggle-text">Trợ lý AI</span>
            </button>

            <div id="gemini-chat-window" class="gemini-chat-window">
                <div class="gemini-chat-header">
                    <div class="header-info">
                        <div class="ai-avatar">✨</div>
                        <div>
                            <h4>Trợ Lý AI - Tiệm Nhà Gốm</h4>
                            <span class="ai-status">● Đang trực tuyến</span>
                        </div>
                    </div>
                    <button id="gemini-chat-close" class="close-chat-btn">&times;</button>
                </div>

                <div id="gemini-chat-messages" class="gemini-chat-messages">
                    <div class="chat-msg ai-msg">
                        <div class="msg-content">
                            Xin chào! Mình là Trợ lý AI của **Tiệm Nhà Gốm**. ✨<br>
                            Bạn cần tư vấn quà tặng, phối bình hoa hay chọn món đồ decor hợp không gian nào hôm nay?
                        </div>
                    </div>
                </div>

                <div class="chat-quick-chips">
                    <button class="chip-btn" data-query="Gợi ý quà tân gia dưới 500k">🎁 Quà tân gia < 500k</button>
                    <button class="chip-btn" data-query="Bình hoa gốm mộc cắm hoa tuyết mai">🏺 Bình hoa mộc</button>
                    <button class="chip-btn" data-query="Bộ ấm trà biếu sếp sang trọng">🍵 Bộ ấm trà biếu sếp</button>
                </div>

                <div class="gemini-chat-input-area">
                    <input type="text" id="gemini-input" placeholder="Hỏi AI chọn món đồ hợp gu..." autocomplete="off">
                    <button id="gemini-send-btn" class="send-btn" aria-label="Gửi">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    setupWidgetEvents();
}

// Gọi API Gemini
async function askGeminiAPI(userQuery) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        return "Chưa cấu hình Gemini API Key hợp lệ. Vui lòng vào Bảng Quản Trị (Admin Dashboard) -> tab Cài Đặt để dán Gemini API Key từ Google AI Studio.";
    }

    const products = await getCompactProductsContext();

    const productListStr = products.slice(0, 30).map(p => 
        `- [ID: ${p.id}] ${p.name} | Giá: ${new Intl.NumberFormat('vi-VN').format(p.price)}đ | Danh mục: ${p.category}`
    ).join('\n');

    const systemPrompt = `
Bạn là "Trợ lý AI - Tiệm Nhà Gốm", chuyên gia tư vấn về gốm sứ thủ công, decor gia đình & nghệ thuật cắm hoa.
Phong cách: Ấm áp, lịch sự, mộc mạc, đậm chất gốm sứ.

Danh sách sản phẩm cửa hàng:
${productListStr}

Nhiệm vụ:
1. Trả lời ngắn gọn (dưới 150 từ), mượt mà bằng tiếng Việt.
2. Đề xuất 1 đến 3 sản phẩm phù hợp nhất với nhu cầu khách hàng.
3. BẮT BUỘC khi nhắc đến tên sản phẩm phải kèm mã ID dạng [ID: mã_id] (ví dụ: [ID: prod_123]) để hệ thống tạo thẻ sản phẩm.
`;

    const candidateModels = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-pro'
    ];

    let lastErrorMsg = "";

    for (const model of candidateModels) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: systemPrompt + "\n\nKhách hàng hỏi: " + userQuery }] }
                    ],
                    generationConfig: {
                        maxOutputTokens: 350,
                        temperature: 0.7
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (replyText) return replyText;
            } else {
                const errData = await response.json().catch(() => ({}));
                lastErrorMsg = errData.error?.message || `${response.status} ${response.statusText}`;
                console.warn(`Gemini Model [${model}] thử không thành công:`, lastErrorMsg);

                if (lastErrorMsg.includes("API key not valid") || lastErrorMsg.includes("API_KEY_INVALID") || response.status === 400) {
                    return "Gemini API Key hiện tại bị sai hoặc không hợp lệ. Vui lòng truy cập Bảng quản trị (Admin Dashboard) -> tab Cài Đặt để dán lại Gemini API Key chuẩn từ Google AI Studio.";
                }
                if (lastErrorMsg.includes("Quota") || lastErrorMsg.includes("RESOURCE_EXHAUSTED") || response.status === 429) {
                    return "Hạn mức lượt gọi API miễn phí tạm thời đạt giới hạn. Vui lòng đợi khoảng 30 giây và thử lại nhé!";
                }
            }
        } catch (e) {
            lastErrorMsg = e.message;
            console.warn(`Lỗi gọi model ${model}:`, e);
        }
    }

    return `Rất tiếc, AI chưa thể phản hồi (${lastErrorMsg}). Vui lòng kiểm tra lại Gemini API Key tại Bảng quản trị.`;
}

// Xử lý Sự kiện Chat
function setupWidgetEvents() {
    const toggleBtn = document.getElementById('gemini-chat-toggle');
    const closeBtn = document.getElementById('gemini-chat-close');
    const chatWindow = document.getElementById('gemini-chat-window');
    const input = document.getElementById('gemini-input');
    const sendBtn = document.getElementById('gemini-send-btn');
    const messagesContainer = document.getElementById('gemini-chat-messages');

    if (!toggleBtn || !chatWindow) return;

    toggleBtn.onclick = () => chatWindow.classList.toggle('active');
    closeBtn.onclick = () => chatWindow.classList.remove('active');

    const handleSend = async (textOverride = null) => {
        const queryText = (textOverride || input.value).trim();
        if (!queryText) return;

        if (!textOverride) input.value = '';

        // Render User Message
        appendMessage('user', queryText);

        // Render Loading Bubble
        const loadingId = appendLoadingBubble();

        // Call Gemini
        const reply = await askGeminiAPI(queryText);

        // Remove Loading Bubble
        removeLoadingBubble(loadingId);

        // Render AI Message
        appendMessage('ai', reply);
    };

    sendBtn.onclick = () => handleSend();
    input.onkeydown = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    // Quick Chips Click
    document.querySelectorAll('.gemini-chat-window .chip-btn').forEach(btn => {
        btn.onclick = () => {
            const query = btn.dataset.query;
            handleSend(query);
        };
    });
}

function appendMessage(sender, text) {
    const container = document.getElementById('gemini-chat-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}-msg`;

    // Thay thế mã [ID: xxx] thành linh hoạt hoặc link
    let formattedText = text.replace(/\[ID:\s*([^\]]+)\]/g, (match, id) => {
        return `<a href="../product/index.html?id=${id.trim()}" target="_blank" class="ai-product-link">👉 Xem sản phẩm #${id.trim()}</a>`;
    });

    // Format markdown đơn giản (in đậm, xuống dòng)
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/\n/g, '<br>');

    msgDiv.innerHTML = `<div class="msg-content">${formattedText}</div>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function appendLoadingBubble() {
    const container = document.getElementById('gemini-chat-messages');
    if (!container) return null;

    const loadingDiv = document.createElement('div');
    const id = 'loading-' + Date.now();
    loadingDiv.id = id;
    loadingDiv.className = 'chat-msg ai-msg loading-msg';
    loadingDiv.innerHTML = `
        <div class="msg-content">
            <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span> Trợ lý AI đang suy nghĩ
        </div>
    `;
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeLoadingBubble(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Khởi tạo Trợ lý AI toàn trang
export function initGeminiAssistant() {
    // Tạm thời ẩn Trợ lý AI Gemini theo yêu cầu người dùng
    const existingWidget = document.getElementById('gemini-chat-widget');
    if (existingWidget) existingWidget.remove();
    return;
}
