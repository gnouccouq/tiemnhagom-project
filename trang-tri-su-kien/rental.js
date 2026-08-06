import { db, showToast, generateOrderId } from "../js/utils.js";
import { collection, getDocs, query, where, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const formatCurrencyDisplay = (amount) => new Intl.NumberFormat('vi-VN').format(amount);

let rentalProducts = [];
let rentalCart = {}; // format: { productId: { item: {...}, quantity: 1 } }

document.addEventListener('DOMContentLoaded', async () => {
    await loadRentalProducts();
    await loadEvents();
    setupRentalForm();
});

async function loadEvents() {
    const grid = document.getElementById('event-gallery-dynamic-grid');
    if (!grid) return;

    try {
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, "settings", "events"));
        
        let events = [];
        if (snap.exists()) {
            events = snap.data().items || [];
        }

        if (events.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Chưa có dự án nào được đăng.</p>';
            return;
        }

        grid.innerHTML = events.map(ev => `
            <div class="event-gallery-item" onclick="window.location.href='event-detail.html?name=${encodeURIComponent(ev.name)}'" style="position: relative; cursor: pointer;">
                <img src="${ev.imageUrl}" alt="${ev.name}">
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 20px; color: #fff;">
                    <h3 style="margin: 0; font-size: 1.2rem; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${ev.name}</h3>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Lỗi tải sự kiện:", e);
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Lỗi tải dự án.</p>';
    }
}

async function loadRentalProducts() {
    const grid = document.getElementById('rental-products-grid');
    if (!grid) return;

    try {
        // Fetch all products that are not hidden. 
        // We filter for rentalPrice > 0 on client side to avoid needing composite index just for rentalPrice
        const q = query(collection(db, "products"), where("isHidden", "==", false));
        const snapshot = await getDocs(q);
        
        rentalProducts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.rentalPrice && data.rentalPrice > 0) {
                rentalProducts.push({ id: doc.id, ...data });
            }
        });

        if (rentalProducts.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Hiện tại chưa có sản phẩm nào cho thuê.</p>';
            return;
        }

        let html = '';
        rentalProducts.forEach(product => {
            html += `
                <div class="product-card">
                    <div class="product-card-image">
                        <a href="../product/index.html?id=${product.id}">
                            <img src="${product.imageUrl}" alt="${product.name}" loading="lazy" width="300" height="300">
                        </a>
                    </div>
                    <div class="product-card-info">
                        <div class="product-sku" style="font-size: 0.7rem; margin-bottom: 4px; letter-spacing: 1px;">Mã: ${product.id}</div>
                        <a href="../product/index.html?id=${product.id}" class="product-title-link">
                            <h3>${product.name}</h3>
                        </a>
                        <div class="product-price-block" style="flex-direction: column; align-items: stretch; gap: 8px;">
                            <p class="price" style="margin-bottom: 0; color: #e74c3c; font-size: 0.95rem;">${formatCurrencyDisplay(product.rentalPrice)}đ / ngày</p>
                            <button class="btn-minimal btn-add-rental" data-id="${product.id}" style="width: 100%; border-color: #1e88e5; color: #1e88e5; margin: 0; padding: 8px 0; font-size: 0.85rem;">Chọn Thuê</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;

        document.querySelectorAll('.btn-add-rental').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                addToRentalCart(id);
            });
        });

    } catch (error) {
        console.error("Error loading rental products:", error);
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Lỗi tải danh sách sản phẩm.</p>';
    }
}

function addToRentalCart(productId) {
    const product = rentalProducts.find(p => p.id === productId);
    if (!product) return;

    if (rentalCart[productId]) {
        rentalCart[productId].quantity += 1;
    } else {
        rentalCart[productId] = {
            item: product,
            quantity: 1
        };
    }
    
    showToast(`Đã thêm ${product.name} vào danh sách thuê!`);
    renderRentalCart();
}

function updateRentalQuantity(productId, delta) {
    if (rentalCart[productId]) {
        rentalCart[productId].quantity += delta;
        if (rentalCart[productId].quantity <= 0) {
            delete rentalCart[productId];
        }
        renderRentalCart();
    }
}

window.updateRentalQuantity = updateRentalQuantity;

function renderRentalCart() {
    const container = document.getElementById('rental-selected-items');
    if (!container) return;

    const keys = Object.keys(rentalCart);
    if (keys.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; margin: 0; font-size: 0.9rem;">Bạn chưa chọn món đồ nào.</p>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    keys.forEach(key => {
        const cartItem = rentalCart[key];
        const p = cartItem.item;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${p.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
                    <div>
                        <div style="font-weight: 500; font-size: 0.9rem;">${p.name}</div>
                        <div style="color: #e74c3c; font-size: 0.8rem;">${formatCurrencyDisplay(p.rentalPrice)}đ/ngày</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button type="button" onclick="window.updateRentalQuantity('${p.id}', -1)" style="border: 1px solid #ccc; background: #fff; width: 25px; height: 25px; border-radius: 4px; cursor: pointer;">-</button>
                    <span style="font-weight: 600; font-size: 0.9rem; min-width: 20px; text-align: center;">${cartItem.quantity}</span>
                    <button type="button" onclick="window.updateRentalQuantity('${p.id}', 1)" style="border: 1px solid #ccc; background: #fff; width: 25px; height: 25px; border-radius: 4px; cursor: pointer;">+</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    // Add instruction to calculate total later based on days
    html += '<p style="font-size: 0.8rem; color: #666; margin-top: 10px; font-style: italic;">* Tổng chi phí thuê sẽ được báo giá chính xác dựa trên số ngày thuê và số lượng món.</p>';

    container.innerHTML = html;
}

function setupRentalForm() {
    const form = document.getElementById('rental-request-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const keys = Object.keys(rentalCart);
        if (keys.length === 0) {
            showToast("Vui lòng chọn ít nhất 1 món đồ để thuê!", "error");
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-rental');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Đang gửi...';

        try {
            const companyName = document.getElementById('rental-company-name').value;
            const taxCode = document.getElementById('rental-tax-code').value;
            const phone = document.getElementById('rental-phone').value;
            const email = document.getElementById('rental-email').value;
            const rentalDate = document.getElementById('rental-start-date').value;
            const returnDate = document.getElementById('rental-end-date').value;
            const address = document.getElementById('rental-address').value;
            const notes = document.getElementById('rental-notes').value;

            // Chuyển đổi giỏ hàng sang định dạng order.items
            const items = keys.map(key => {
                const cartItem = rentalCart[key];
                return {
                    id: cartItem.item.id,
                    name: cartItem.item.name,
                    image: cartItem.item.imageUrl,
                    rentalPrice: cartItem.item.rentalPrice,
                    quantity: cartItem.quantity
                };
            });

            const orderId = generateOrderId();
            
            const rentalOrderData = {
                orderType: 'rental',
                status: 'Yêu cầu mới',
                orderDate: serverTimestamp(),
                userId: 'guest', // Khách vãng lai, có thể nâng cấp thêm tính năng user sau
                rentalInfo: {
                    companyName,
                    taxCode,
                    phone,
                    email,
                    rentalDate,
                    returnDate,
                    address,
                    notes
                },
                items: items,
                totalAmount: 0 // Có thể tính tổng tiền tham khảo = tổng rentalPrice * quantity * days, nhưng báo giá thường chốt sau
            };

            await setDoc(doc(db, "orders", orderId), rentalOrderData);

            showToast("Đã gửi yêu cầu thuê thành công! Tiệm sẽ liên hệ sớm nhất.", "success");
            
            // Reset form và giỏ hàng
            form.reset();
            rentalCart = {};
            renderRentalCart();

        } catch (error) {
            console.error("Lỗi gửi form thuê:", error);
            showToast("Có lỗi xảy ra, vui lòng thử lại sau.", "error");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Gửi Yêu Cầu Thuê Đồ & Tư Vấn';
        }
    });
}
