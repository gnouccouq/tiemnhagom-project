// js/lookbook.js - Shoppable Lookbook with Interactive Hotspots

import {
    db, auth, initHeader, addToCart, showToast, updateCartCount, escapeHTML
} from "./utils.js";
import { collection, getDocs, doc, getDoc, query, limit, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Bộ sưu tập không gian phối cảnh mẫu của Tiệm Nhà Gốm
const DEFAULT_LOOKBOOK_SCENES = [
    {
        id: "scene-dining-1",
        category: "dining",
        categoryLabel: "Bàn Ăn Ấm Cúng",
        title: "Bàn Ăn Men Mộc Cho Bữa Cơm Gia Đình",
        desc: "Sự kết hợp tinh tế giữa đĩa gốm men hỏa biến, bát cơm mộc mạc và chén nước chấm nhỏ nhắn tạo nên một mâm cơm ấm cúng, đậm chất hoài niệm.",
        imageUrl: "../Asset/images/dining.jpg",
        hotspots: [
            {
                x: 48,
                y: 54,
                name: "Đĩa Gốm Men Mộc Sâu Lòng",
                price: 185000,
                oldPrice: 210000,
                thumbUrl: "../Asset/images/dining.jpg",
                productId: "dia-gom-men-moc",
                category: "Dining Decor"
            },
            {
                x: 28,
                y: 68,
                name: "Bát Cơm Men Rạn Cổ Điển",
                price: 65000,
                oldPrice: null,
                thumbUrl: "../Asset/images/481205605_945767991014584_315534319945390599_n.jpg",
                productId: "bat-com-men-ran",
                category: "Dining Decor"
            },
            {
                x: 72,
                y: 42,
                name: "Tô Canh Gốm Mộc Họa Tiết Lá",
                price: 245000,
                oldPrice: 280000,
                thumbUrl: "../Asset/images/482217280_952466933678023_578750406849519694_n_11zon.webp",
                productId: "to-canh-gom-moc",
                category: "Dining Decor"
            }
        ]
    },
    {
        id: "scene-teatime-1",
        category: "teatime",
        categoryLabel: "Góc Thưởng Trà",
        title: "Góc Trà Ban Mai Tĩnh Tại Bên Cửa Sổ",
        desc: "Một chiếc ấm tử sa mộc mạc kết hợp cùng những tách trà nhỏ và khay gỗ thô mộc, mở ra không gian thiền định bình yên cho những sớm mai chậm rãi.",
        imageUrl: "../Asset/images/teatime.jpg",
        hotspots: [
            {
                x: 44,
                y: 48,
                name: "Ấm Trà Đất Nung Thủ Công",
                price: 420000,
                oldPrice: 480000,
                thumbUrl: "../Asset/images/teatime.jpg",
                productId: "am-tra-dat-nung",
                category: "Teatime & Drinks"
            },
            {
                x: 66,
                y: 62,
                name: "Tách Trà Gốm Thô Mộc",
                price: 85000,
                oldPrice: null,
                thumbUrl: "../Asset/images/483488913_952567577001292_8906787465398018074_n_11zon.webp",
                productId: "tach-tra-gom-tho",
                category: "Teatime & Drinks"
            },
            {
                x: 22,
                y: 35,
                name: "Bình Hoa Mini Cắm Cành Khô",
                price: 150000,
                oldPrice: 175000,
                thumbUrl: "../Asset/images/homedecor.jpg",
                productId: "binh-hoa-mini-decor",
                category: "Home Decor"
            }
        ]
    },
    {
        id: "scene-decor-1",
        category: "decor",
        categoryLabel: "Decor & Bình Hoa",
        title: "Góc Phòng Khách Tinh Tế Với Bình Hoa Men Tro",
        desc: "Dáng bình gốm mộc vuốt tay thủ công kết hợp những cành hoa tươi của 'Hoa Nhà Gốm', tạo điểm nhấn nghệ thuật đầy sức sống cho không gian nhà bạn.",
        imageUrl: "../Asset/images/homedecor.jpg",
        hotspots: [
            {
                x: 42,
                y: 42,
                name: "Bình Hoa Men Tro Dáng Cổ",
                price: 390000,
                oldPrice: 450000,
                thumbUrl: "../Asset/images/homedecor.jpg",
                productId: "binh-hoa-men-tro",
                category: "Home Decor"
            },
            {
                x: 70,
                y: 58,
                name: "Tượng Gốm Thiền Decor",
                price: 280000,
                oldPrice: null,
                thumbUrl: "../Asset/images/lifestyle.jpg",
                productId: "tuong-gom-decor",
                category: "Home Decor"
            }
        ]
    },
    {
        id: "scene-kitchen-1",
        category: "kitchen",
        categoryLabel: "Góc Bếp Mộc",
        title: "Gian Bếp Mộc Mạc Cảm Hứng Bắc Âu",
        desc: "Những vật dụng gốm sứ mộc mạc đặt trên kệ gỗ tự nhiên mang lại vẻ đẹp bình dị, tiện dụng cho người yêu việc nấu nướng và bày biện.",
        imageUrl: "../Asset/images/kitchenware.jpg",
        hotspots: [
            {
                x: 35,
                y: 45,
                name: "Hũ Đựng Gia Vị Gốm Nắp Gỗ",
                price: 120000,
                oldPrice: 140000,
                thumbUrl: "../Asset/images/kitchenware.jpg",
                productId: "hu-gia-vi-gom",
                category: "Kitchenware"
            },
            {
                x: 62,
                y: 52,
                name: "Khay Gốm Trữ Đồ Ăn Nghệ Thuật",
                price: 210000,
                oldPrice: null,
                thumbUrl: "../Asset/images/dining.jpg",
                productId: "khay-gom-nghe-thuat",
                category: "Dining Decor"
            }
        ]
    },
    {
        id: "scene-lifestyle-1",
        category: "decor",
        categoryLabel: "Góc Thư Giãn",
        title: "Bàn Làm Việc Thư Thái Với Gốm & Cây Xanh",
        desc: "Không gian làm việc trở nên thanh bình và sáng tạo hơn khi có sự hiện diện của những chậu gốm nhỏ, tách cà phê mộc và ánh sáng ban mai.",
        imageUrl: "../Asset/images/lifestyle.jpg",
        hotspots: [
            {
                x: 50,
                y: 55,
                name: "Ly Gốm Uống Nước Dáng Cao",
                price: 95000,
                oldPrice: 110000,
                thumbUrl: "../Asset/images/lifestyle.jpg",
                productId: "ly-gom-dang-cao",
                category: "Lifestyle"
            },
            {
                x: 25,
                y: 40,
                name: "Chậu Gốm Nhỏ Trồng Sen Đá",
                price: 85000,
                oldPrice: null,
                thumbUrl: "../Asset/images/homedecor.jpg",
                productId: "chau-gom-sen-da",
                category: "Home Decor"
            }
        ]
    },
    {
        id: "scene-event-1",
        category: "dining",
        categoryLabel: "Bàn Tiệc Sự Kiện",
        title: "Setup Bàn Tiệc Kỷ Niệm Thân Mật",
        desc: "Dịch vụ decor sự kiện của Tiệm Nhà Gốm với sự phối hợp đồng bộ giữa bộ đồ ăn gốm tinh xảo, hoa tươi rực rỡ và nến lung linh.",
        imageUrl: "../Asset/images/banner_decor.jpg",
        hotspots: [
            {
                x: 45,
                y: 65,
                name: "Set Bát Đĩa Tiệc Men Kem Viền Nâu",
                price: 560000,
                oldPrice: 650000,
                thumbUrl: "../Asset/images/banner_decor.jpg",
                productId: "set-bat-dia-tiec",
                category: "Dining Decor"
            },
            {
                x: 75,
                y: 38,
                name: "Bình Hoa Gốm Nghệ Thuật Cao Cấp",
                price: 490000,
                oldPrice: null,
                thumbUrl: "../Asset/images/banner_decor.jpg",
                productId: "binh-hoa-cao-cap",
                category: "Home Decor"
            }
        ]
    }
];

let activeFilter = 'all';
let allScenes = [];
let isComingSoonMode = true; // Mặc định hiển thị Sắp Ra Mắt theo yêu cầu
let isAdminPreview = false;
let currentShowingMode = 'coming_soon'; // 'coming_soon' | 'live'

// Khởi tạo trang Lookbook
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Kiểm tra tham số URL (?preview=true)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('preview') === 'true') {
        isAdminPreview = true;
    }

    initHeader('../', async (user) => {
        console.log("Lookbook: Header initialized", user ? user.email : "Guest");
        // Nếu user đăng nhập, kiểm tra xem có phải tài khoản admin không
        if (user && db) {
            try {
                const adminSnap = await getDoc(doc(db, "admins", user.uid));
                if (adminSnap.exists()) {
                    isAdminPreview = true;
                    setupAdminPreviewBar();
                }
            } catch (err) {
                console.warn("Lookbook: Lỗi kiểm tra admin:", err);
            }
        }
        if (isAdminPreview) {
            setupAdminPreviewBar();
        }
    });

    if (isAdminPreview) {
        setupAdminPreviewBar();
    }

    await loadLookbookData();
    setupFilterEvents();
    setupLightboxEvents();
});

function applyDisplayMode() {
    const comingSoonView = document.getElementById('lookbook-coming-soon-view');
    const liveView = document.getElementById('lookbook-live-view');
    const previewBar = document.getElementById('lookbook-admin-preview-bar');

    if (!comingSoonView || !liveView) return;

    if (isAdminPreview) {
        if (previewBar) previewBar.style.display = 'block';
        if (currentShowingMode === 'coming_soon') {
            comingSoonView.style.display = 'block';
            liveView.style.display = 'none';
        } else {
            comingSoonView.style.display = 'none';
            liveView.style.display = 'block';
        }
    } else {
        if (previewBar) previewBar.style.display = 'none';
        if (isComingSoonMode) {
            comingSoonView.style.display = 'block';
            liveView.style.display = 'none';
        } else {
            comingSoonView.style.display = 'none';
            liveView.style.display = 'block';
        }
    }
}

function setupAdminPreviewBar() {
    const previewBar = document.getElementById('lookbook-admin-preview-bar');
    const toggleBtn = document.getElementById('btn-toggle-preview-mode');
    if (!previewBar || !toggleBtn) return;

    previewBar.style.display = 'block';
    // Khi admin preview, mặc định mở giao diện live để xem và test
    currentShowingMode = 'live';
    applyDisplayMode();

    toggleBtn.onclick = () => {
        currentShowingMode = currentShowingMode === 'live' ? 'coming_soon' : 'live';
        toggleBtn.innerText = currentShowingMode === 'live' 
            ? '👁️ Xem giao diện khách (Coming Soon)' 
            : '✨ Xem giao diện đầy đủ (Live Lookbook)';
        applyDisplayMode();
        if (currentShowingMode === 'live') {
            renderScenes();
            updateFilterCounts();
        }
    };
    toggleBtn.innerText = '👁️ Xem giao diện khách (Coming Soon)';
}

// Xử lý gửi form đăng ký nhận thông báo ra mắt
window.handleComingSoonNotify = async (e) => {
    e.preventDefault();
    const input = document.getElementById('notify-contact-input');
    if (!input) return;
    const contact = input.value.trim();
    if (!contact) return;

    try {
        await addDoc(collection(db, "lookbook_subscribers"), {
            contact: contact,
            createdAt: new Date().toISOString(),
            status: "pending"
        });
    } catch (err) {
        console.warn("Lưu subscriber vào Firestore:", err);
    }

    showToast("🎉 Đã đăng ký thành công! Tiệm sẽ gửi quà & thông báo ngay khi mở cửa!", "success");
    input.value = "";
};

// Tải dữ liệu Lookbook (Lắng nghe thời gian thực từ Firestore, fallback mẫu)
function loadLookbookData() {
    const container = document.getElementById('lookbook-grid');
    if (!container) return;

    // Lắng nghe thay đổi từ Firestore để tự động cập nhật ngay khi Admin thêm/sửa/xóa cảnh
    onSnapshot(doc(db, "settings", "lookbook"), async (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            isComingSoonMode = data.isComingSoon !== false;
            allScenes = (data.items && data.items.length > 0) ? data.items : [...DEFAULT_LOOKBOOK_SCENES];
        } else {
            isComingSoonMode = true;
            allScenes = [...DEFAULT_LOOKBOOK_SCENES];
        }

        applyDisplayMode();

        try {
            // Cố gắng liên kết hotspots với sản phẩm thực tế trong Firestore để có giá & link chuẩn xác nhất
            const productsSnap = await getDocs(query(collection(db, "products"), limit(100)));
            if (!productsSnap.empty) {
                const realProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                // Đồng bộ hotspots với sản phẩm thực tế
                allScenes.forEach(scene => {
                    if (!scene.hotspots) scene.hotspots = [];
                    scene.hotspots.forEach(spot => {
                        // Tìm sản phẩm khớp theo ID hoặc theo tên
                        let matched = null;
                        if (spot.productId) {
                            matched = realProducts.find(p => p.id === spot.productId);
                        }
                        if (!matched && spot.name) {
                            matched = realProducts.find(p => 
                                (p.name && p.name.toLowerCase().includes(spot.name.toLowerCase().split(' ')[0])) ||
                                (p.category && spot.category && p.category.toLowerCase() === spot.category.toLowerCase())
                            );
                        }

                        if (matched) {
                            spot.productId = matched.id;
                            spot.name = matched.name || spot.name;
                            spot.price = matched.price || spot.price;
                            spot.oldPrice = matched.sale > 0 ? matched.price : spot.oldPrice;
                            if (matched.sale > 0) {
                                spot.price = Math.round(matched.price * (1 - matched.sale / 100));
                            }
                            if (matched.imageUrl) {
                                spot.thumbUrl = matched.imageUrl;
                            }
                        }
                    });
                });
            }
        } catch (e) {
            console.warn("Lookbook: Sử dụng dữ liệu sản phẩm mặc định (offline/fallback)", e);
        }

        renderScenes();
        updateFilterCounts();
    }, (err) => {
        console.warn("Lookbook: Lỗi kết nối Firestore, dùng mẫu mặc định", err);
        allScenes = [...DEFAULT_LOOKBOOK_SCENES];
        renderScenes();
        updateFilterCounts();
    });
}

// Render danh sách cảnh Lookbook theo bộ lọc
function renderScenes() {
    const container = document.getElementById('lookbook-grid');
    if (!container) return;

    const filteredScenes = activeFilter === 'all' 
        ? allScenes 
        : allScenes.filter(s => s.category === activeFilter);

    if (filteredScenes.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; color: #888;">
                <p style="font-size: 1.1rem; margin-bottom: 1rem;">Chưa có không gian nào thuộc danh mục này.</p>
                <button class="lookbook-filter-btn active" onclick="window.setLookbookFilter('all')" style="margin: 0 auto;">Xem tất cả không gian</button>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredScenes.map((scene, sceneIndex) => {
        // Render các điểm Hotspot tương tác trên ảnh
        const hotspotsHtml = scene.hotspots.map((spot, spotIndex) => {
            const priceFormatted = new Intl.NumberFormat('vi-VN').format(spot.price) + 'đ';
            const oldPriceHtml = spot.oldPrice 
                ? `<span class="old-price">${new Intl.NumberFormat('vi-VN').format(spot.oldPrice)}đ</span>` 
                : '';
            
            const flipClass = spot.y < 25 ? 'flip-down' : '';
            const productUrl = spot.productId ? `../product/index.html?id=${encodeURIComponent(spot.productId)}` : '#';

            return `
                <div class="lookbook-hotspot ${flipClass}" 
                     style="left: ${spot.x}%; top: ${spot.y}%;" 
                     data-spot-index="${spotIndex}"
                     data-scene-id="${scene.id}"
                     tabindex="0"
                     aria-label="${escapeHTML(spot.name)}">
                    
                    <div class="hotspot-dot"></div>
                    <div class="hotspot-pulse"></div>

                    <!-- Popover preview khi rê hoặc bấm vào hotspot -->
                    <div class="hotspot-popover" onclick="event.stopPropagation();">
                        <img src="${spot.thumbUrl}" alt="${escapeHTML(spot.name)}" class="hotspot-product-thumb" loading="lazy">
                        <div class="hotspot-product-info">
                            <a href="${productUrl}" class="hotspot-product-name" title="${escapeHTML(spot.name)}">${escapeHTML(spot.name)}</a>
                            <div class="hotspot-product-price">
                                <span>${priceFormatted}</span>
                                ${oldPriceHtml}
                            </div>
                            <div class="hotspot-product-actions">
                                <a href="${productUrl}" class="btn-hotspot-view">Chi tiết</a>
                                <button type="button" class="btn-hotspot-add" onclick="window.addHotspotToCart('${scene.id}', ${spotIndex}, event)">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line></svg>
                                    Mua ngay
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Render các tag sản phẩm phía dưới thẻ
        const productPillsHtml = scene.hotspots.map((spot, spotIndex) => {
            return `
                <a href="javascript:void(0)" 
                   class="lookbook-item-pill" 
                   onclick="window.highlightHotspot('${scene.id}', ${spotIndex})"
                   title="Bấm để định vị trên ảnh">
                    <span class="pill-dot"></span>
                    <span>${escapeHTML(spot.name)}</span>
                    <span style="font-weight: 600; color: #666;">• ${new Intl.NumberFormat('vi-VN').format(spot.price)}đ</span>
                </a>
            `;
        }).join('');

        return `
            <div class="lookbook-card" id="card-${scene.id}">
                <div class="lookbook-scene-wrapper">
                    <img src="${scene.imageUrl}" alt="${escapeHTML(scene.title)}" class="lookbook-scene-img" loading="lazy">
                    <span class="lookbook-tag-badge">${scene.categoryLabel}</span>
                    <button type="button" class="lookbook-zoom-btn" onclick="window.openLightbox('${scene.imageUrl}', '${escapeHTML(scene.title)}')" title="Phóng to ảnh">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    </button>
                    ${hotspotsHtml}
                </div>

                <div class="lookbook-card-body">
                    <h3 class="lookbook-scene-title">${escapeHTML(scene.title)}</h3>
                    <p class="lookbook-scene-desc">${escapeHTML(scene.desc)}</p>

                    <div class="lookbook-scene-products">
                        <div class="lookbook-products-label">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                            Sản phẩm trong ảnh (${scene.hotspots.length}):
                        </div>
                        <div class="lookbook-tags-list">
                            ${productPillsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    setupMobileHotspotToggle();
}

// Cập nhật số lượng ảnh theo từng danh mục trên thanh Filter
function updateFilterCounts() {
    const counts = {
        all: allScenes.length,
        dining: allScenes.filter(s => s.category === 'dining').length,
        teatime: allScenes.filter(s => s.category === 'teatime').length,
        decor: allScenes.filter(s => s.category === 'decor').length,
        kitchen: allScenes.filter(s => s.category === 'kitchen').length
    };

    document.querySelectorAll('.lookbook-filter-btn').forEach(btn => {
        const cat = btn.getAttribute('data-filter');
        const badge = btn.querySelector('.badge-count');
        if (badge && counts[cat] !== undefined) {
            badge.textContent = `(${counts[cat]})`;
        }
    });
}

// Gắn sự kiện chuyển tab bộ lọc
function setupFilterEvents() {
    document.querySelectorAll('.lookbook-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            window.setLookbookFilter(filter);
        });
    });
}

window.setLookbookFilter = (filter) => {
    activeFilter = filter;
    document.querySelectorAll('.lookbook-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === filter);
    });
    renderScenes();
};

// Xử lý chạm trên điện thoại (Mobile tap toggle)
function setupMobileHotspotToggle() {
    document.querySelectorAll('.lookbook-hotspot').forEach(spot => {
        spot.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = spot.classList.contains('active');
            // Tắt các spot khác
            document.querySelectorAll('.lookbook-hotspot.active').forEach(s => s.classList.remove('active'));
            if (!isActive) {
                spot.classList.add('active');
            }
        });
    });

    // Bấm ra ngoài ảnh thì đóng popover đang mở
    document.addEventListener('click', () => {
        document.querySelectorAll('.lookbook-hotspot.active').forEach(s => s.classList.remove('active'));
    });
}

// Đánh dấu và mở hotspot khi bấm vào pill sản phẩm bên dưới
window.highlightHotspot = (sceneId, spotIndex) => {
    const card = document.getElementById(`card-${sceneId}`);
    if (!card) return;

    // Cuộn nhẹ tới card
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const hotspot = card.querySelector(`.lookbook-hotspot[data-spot-index="${spotIndex}"]`);
    if (hotspot) {
        document.querySelectorAll('.lookbook-hotspot.active').forEach(s => s.classList.remove('active'));
        hotspot.classList.add('active');
        
        // Tự động tắt sau 3.5s nếu không tương tác tiếp
        setTimeout(() => {
            hotspot.classList.remove('active');
        }, 3500);
    }
};

// Thêm sản phẩm từ Hotspot trực tiếp vào giỏ hàng
window.addHotspotToCart = async (sceneId, spotIndex, event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const scene = allScenes.find(s => s.id === sceneId);
    if (!scene || !scene.hotspots[spotIndex]) return;

    const spot = scene.hotspots[spotIndex];

    const btn = event.currentTarget;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-small" style="width:12px; height:12px; border-width:2px;"></span>';
    }

    try {
        await addToCart({
            id: spot.productId || `lb_${sceneId}_${spotIndex}`,
            name: spot.name,
            price: spot.price,
            image: spot.thumbUrl,
            quantity: 1,
            category: spot.category || 'Home Decor'
        });

        showToast(`Đã thêm "${spot.name}" vào giỏ hàng!`, "success");
    } catch (e) {
        console.error("Lỗi thêm vào giỏ từ Lookbook:", e);
        showToast("Không thể thêm vào giỏ hàng. Vui lòng thử lại!", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line></svg>
                Mua ngay
            `;
        }
    }
};

// Phóng to toàn ảnh (Lightbox)
function setupLightboxEvents() {
    const modal = document.getElementById('lookbook-lightbox-modal');
    if (!modal) return;

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('lookbook-modal-close')) {
            window.closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            window.closeLightbox();
        }
    });
}

window.openLightbox = (imgUrl, title) => {
    const modal = document.getElementById('lookbook-lightbox-modal');
    const modalImg = document.getElementById('lightbox-img');
    if (modal && modalImg) {
        modalImg.src = imgUrl;
        modalImg.alt = title;
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeLightbox = () => {
    const modal = document.getElementById('lookbook-lightbox-modal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
};

// Mở modal gửi ảnh feedback UGC
window.openUgcModal = () => {
    const message = "Chào Tiệm Nhà Gốm, mình muốn gửi ảnh góc gốm đẹp tại nhà để tham gia Lookbook và nhận ưu đãi!";
    const zaloUrl = `https://zalo.me/0777709662?text=${encodeURIComponent(message)}`;
    window.open(zaloUrl, '_blank');
};
