import { db, showToast, generateOrderId } from "../js/utils.js";
import { collection, getDocs, query, where, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const formatCurrencyDisplay = (amount) => new Intl.NumberFormat('vi-VN').format(amount);

let rentalProducts = [];
let rentalCart = {}; // format: { productId: { item: {...}, quantity: 1 } }

document.addEventListener('DOMContentLoaded', async () => {
    await loadRentalProducts();
    await loadEvents();
    setupRentalForm();
    await setupAddressSelects();
});

let locationData = null;
async function loadLocationData() {
    if (locationData) return locationData;
    try {
        const response = await fetch("../provinces.json");
        if (response.ok) {
            locationData = await response.json();
            return locationData;
        }
    } catch (e) {
        console.error("Lỗi tải tỉnh thành:", e);
    }
    return [];
}

async function setupAddressSelects() {
    const provinceSelect = document.getElementById('rental-province');
    const wardSelect = document.getElementById('rental-ward');
    if (!provinceSelect || !wardSelect) return;

    provinceSelect.innerHTML = '<option value="">-- Đang tải tỉnh thành --</option>';
    const data = await loadLocationData();
    provinceSelect.innerHTML = '<option value="">-- Chọn tỉnh thành --</option>';
    data.forEach(p => {
        provinceSelect.innerHTML += `<option value="${p.code}">${p.name}</option>`;
    });

    if (window.TomSelect) {
        window.tsRentalProvince = new TomSelect('#rental-province', {
            create: false,
            sortField: { field: "text", direction: "asc" }
        });
        window.tsRentalWard = new TomSelect('#rental-ward', {
            create: false,
            sortField: { field: "text", direction: "asc" }
        });
    }

    provinceSelect.addEventListener('change', async (e) => {
        const provinceId = e.target.value;
        const selectedProvince = data.find(p => p.code == provinceId);
        
        wardSelect.innerHTML = '<option value="">-- Chọn Phường/Xã --</option>';
        if (window.TomSelect && window.tsRentalWard) {
            window.tsRentalWard.clear();
            window.tsRentalWard.clearOptions();
        }

        if (selectedProvince && selectedProvince.wards) {
            wardSelect.disabled = false;
            if (window.TomSelect && window.tsRentalWard) window.tsRentalWard.enable();
            
            selectedProvince.wards.forEach(w => {
                const opt = new Option(w.name, w.ward_code);
                wardSelect.add(opt);
                if (window.TomSelect && window.tsRentalWard) {
                    window.tsRentalWard.addOption({value: w.ward_code, text: w.name});
                }
            });
        } else {
            wardSelect.disabled = true;
            if (window.TomSelect && window.tsRentalWard) window.tsRentalWard.disable();
        }
    });
}

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
                            <button class="btn-add-rental" data-id="${product.id}" style="width: 100%; border: none; background: #e74c3c; color: white; padding: 10px 0; border-radius: 4px; font-weight: 600; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">Chọn Thuê</button>
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
    let subtotalPerDay = 0;
    keys.forEach(key => {
        const cartItem = rentalCart[key];
        const p = cartItem.item;
        const itemTotal = p.rentalPrice * cartItem.quantity;
        subtotalPerDay += itemTotal;
        
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
    
    // Calculate rental days
    let rentalDays = 1;
    const startDateStr = document.getElementById('rental-start-date')?.value;
    const endDateStr = document.getElementById('rental-end-date')?.value;
    if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (end >= start) {
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            rentalDays = diffDays > 0 ? diffDays : 1;
        }
    }
    
    const finalTotal = subtotalPerDay * rentalDays;
    const depositAmount = Math.round(finalTotal * 0.5);

    html += `
        <div style="background: #fff; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #555; margin-bottom: 6px;">
                <span>Tổng thuê/ngày:</span>
                <span>${formatCurrencyDisplay(subtotalPerDay)}đ/ngày</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #555; margin-bottom: 6px;">
                <span>Thời gian thuê:</span>
                <span>${rentalDays} ngày</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-weight: 700; font-size: 1.1rem; border-top: 1px dashed #ccc; padding-top: 10px;">
                <span style="color: #2b2b2b;">Tổng tiền thuê dự kiến:</span>
                <span style="color: #d32f2f;">${formatCurrencyDisplay(finalTotal)}đ</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #666; margin-top: 4px;">
                <span>Tiền cọc ước tính (50%):</span>
                <span style="font-weight: 600;">${formatCurrencyDisplay(depositAmount)}đ</span>
            </div>
        </div>
    </div>
    `;
    
    html += '<p style="font-size: 0.8rem; color: #666; margin-top: 10px; font-style: italic;">* Vui lòng chọn Ngày Nhận và Ngày Trả để tính tổng tiền chính xác.</p>';

    container.innerHTML = html;
}

function populateContractModal() {
    const today = new Date();
    document.getElementById('contract-date-day').textContent = today.getDate().toString().padStart(2, '0');
    document.getElementById('contract-date-month').textContent = (today.getMonth() + 1).toString().padStart(2, '0');
    document.getElementById('contract-date-year').textContent = today.getFullYear();

    // Client info
    const contactName = document.getElementById('rental-contact-name')?.value.trim() || '';
    const companyName = document.getElementById('rental-company-name')?.value.trim() || '';
    const taxCode = document.getElementById('rental-tax-code')?.value.trim() || '';
    const phone = document.getElementById('rental-phone')?.value.trim() || '';
    const email = document.getElementById('rental-email')?.value.trim() || '';
    const specificAddress = document.getElementById('rental-address')?.value.trim() || '';
    const notes = document.getElementById('rental-notes')?.value.trim() || '';
    
    let provinceName = '';
    const pSelect = document.getElementById('rental-province');
    if (pSelect && pSelect.selectedIndex > -1 && pSelect.options[pSelect.selectedIndex].value) {
        provinceName = pSelect.options[pSelect.selectedIndex].text;
    }
    let wardName = '';
    const wSelect = document.getElementById('rental-ward');
    if (wSelect && wSelect.selectedIndex > -1 && wSelect.options[wSelect.selectedIndex].value) {
        wardName = wSelect.options[wSelect.selectedIndex].text;
    }
    
    const fullAddress = [specificAddress, wardName, provinceName].filter(Boolean).join(', ');

    const placeholder = '...................................................';

    document.getElementById('contract-client-name').textContent = companyName || contactName || placeholder;
    document.getElementById('contract-client-contact').textContent = contactName || placeholder;
    document.getElementById('contract-client-tax').textContent = taxCode || placeholder;
    document.getElementById('contract-client-phone').textContent = phone || placeholder;
    document.getElementById('contract-client-email').textContent = email || placeholder;
    document.getElementById('contract-client-address').textContent = fullAddress || placeholder;
    document.getElementById('contract-sign-client-name').textContent = companyName || contactName || 'Khách hàng';

    // Notes
    const notesContainer = document.getElementById('contract-notes-container');
    const notesText = document.getElementById('contract-notes-text');
    if (notesContainer && notesText) {
        if (notes) {
            notesText.textContent = notes;
            notesContainer.style.display = 'block';
        } else {
            notesContainer.style.display = 'none';
        }
    }

    // Calculate dates & rental days
    const startDateStr = document.getElementById('rental-start-date')?.value;
    const endDateStr = document.getElementById('rental-end-date')?.value;
    let rentalDays = 1;
    
    if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        if (end >= start) {
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            rentalDays = diffDays > 0 ? diffDays : 1;
        }
    }

    const formatDateVN = (dateStr) => {
        if (!dateStr) return '...';
        const d = new Date(dateStr);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    };

    document.getElementById('contract-rental-days').textContent = rentalDays;
    document.getElementById('contract-start-date').textContent = formatDateVN(startDateStr);
    document.getElementById('contract-end-date').textContent = formatDateVN(endDateStr);

    // Items table & totals
    const tbody = document.getElementById('contract-items-body');
    const keys = Object.keys(rentalCart);

    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 15px; border: 1px solid #000; color: #777;">Chưa chọn sản phẩm nào trong danh sách thuê.</td></tr>';
        document.getElementById('contract-total-amount').textContent = '0 VNĐ';
        document.getElementById('contract-deposit-amount').textContent = '0 VNĐ';
        return;
    }

    let subtotalPerDay = 0;
    let rowsHtml = '';
    keys.forEach((key, index) => {
        const cartItem = rentalCart[key];
        const p = cartItem.item;
        const lineTotal = p.rentalPrice * cartItem.quantity;
        subtotalPerDay += lineTotal;

        rowsHtml += `
            <tr>
                <td style="text-align: center; border: 1px solid #000; padding: 6px;">${index + 1}</td>
                <td style="border: 1px solid #000; padding: 6px;">${p.name}</td>
                <td style="text-align: center; border: 1px solid #000; padding: 6px;">${p.id || ''}</td>
                <td style="text-align: center; border: 1px solid #000; padding: 6px;">${cartItem.quantity}</td>
                <td style="text-align: right; border: 1px solid #000; padding: 6px;">${formatCurrencyDisplay(p.rentalPrice)}</td>
                <td style="text-align: right; border: 1px solid #000; padding: 6px;">${formatCurrencyDisplay(lineTotal)}</td>
            </tr>
        `;
    });

    rowsHtml += `
        <tr>
            <td colspan="5" style="text-align: right; font-weight: bold; border: 1px solid #000; padding: 6px;">Tổng cộng (VNĐ/ngày):</td>
            <td style="text-align: right; font-weight: bold; border: 1px solid #000; padding: 6px;">${formatCurrencyDisplay(subtotalPerDay)}</td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml;

    const grandTotal = subtotalPerDay * rentalDays;
    const deposit = Math.round(grandTotal / 2);

    document.getElementById('contract-total-amount').textContent = `${formatCurrencyDisplay(grandTotal)} VNĐ`;
    document.getElementById('contract-deposit-amount').textContent = `${formatCurrencyDisplay(deposit)} VNĐ`;
}

function setupRentalForm() {
    const form = document.getElementById('rental-request-form');
    if (!form) return;

    // Trigger cart re-render when dates change
    const startDateInput = document.getElementById('rental-start-date');
    const endDateInput = document.getElementById('rental-end-date');
    if (startDateInput) startDateInput.addEventListener('change', renderRentalCart);
    if (endDateInput) endDateInput.addEventListener('change', renderRentalCart);

    // Modal Contract Handlers
    const modal = document.getElementById('contract-modal');
    const btnOpenModal = document.getElementById('btn-open-contract-modal');
    const btnCloseModal = document.getElementById('btn-close-contract-modal');
    const btnPrintModal = document.getElementById('btn-print-contract');

    if (btnOpenModal && modal) {
        btnOpenModal.addEventListener('click', () => {
            populateContractModal();
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            const wrapper = document.getElementById('contract-modal-body-wrapper');
            if (wrapper) wrapper.scrollTop = 0;
        });
    }

    if (btnCloseModal && modal) {
        btnCloseModal.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }

    if (btnPrintModal) {
        btnPrintModal.addEventListener('click', () => {
            window.print();
        });
    }

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
            const contactName = document.getElementById('rental-contact-name').value;
            const taxCode = document.getElementById('rental-tax-code').value;
            const phone = document.getElementById('rental-phone').value;
            const email = document.getElementById('rental-email').value;
            const rentalDate = document.getElementById('rental-start-date').value;
            const returnDate = document.getElementById('rental-end-date').value;
            
            let provinceName = '';
            const pSelect = document.getElementById('rental-province');
            if(pSelect.selectedIndex > -1 && pSelect.options[pSelect.selectedIndex].value) {
                provinceName = pSelect.options[pSelect.selectedIndex].text;
            }
            let wardName = '';
            const wSelect = document.getElementById('rental-ward');
            if(wSelect.selectedIndex > -1 && wSelect.options[wSelect.selectedIndex].value) {
                wardName = wSelect.options[wSelect.selectedIndex].text;
            }
            
            const specificAddress = document.getElementById('rental-address').value;
            const address = `${specificAddress}, ${wardName}, ${provinceName}`.replace(/, , /g, ', ').replace(/, $/, '');
            
            const notes = document.getElementById('rental-notes').value;

            // Chuyển đổi giỏ hàng sang định dạng order.items
            const orderItems = keys.map(key => {
                const cartItem = rentalCart[key];
                return {
                    id: cartItem.item.id,
                    name: cartItem.item.name,
                    image: cartItem.item.imageUrl,
                    price: cartItem.item.price || 0,
                    rentalPrice: cartItem.item.rentalPrice || 0,
                    quantity: cartItem.quantity
                };
            });
            
            // Calculate rental days
            let rentalDays = 1;
            if (rentalDate && returnDate) {
                const start = new Date(rentalDate);
                const end = new Date(returnDate);
                if (end >= start) {
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    rentalDays = diffDays > 0 ? diffDays : 1;
                }
            }
            
            // Calculate final totalAmount
            let subtotalPerDay = 0;
            orderItems.forEach(i => { subtotalPerDay += (i.rentalPrice || i.price || 0) * i.quantity; });
            const totalAmount = subtotalPerDay * rentalDays;

            const orderId = generateOrderId();
            
            const rentalOrderData = {
                orderType: 'rental',
                status: 'Yêu cầu mới',
                orderDate: serverTimestamp(),
                userId: 'guest', // Khách vãng lai, có thể nâng cấp thêm tính năng user sau
                rentalInfo: {
                    companyName,
                    contactName,
                    taxCode,
                    phone,
                    email,
                    rentalDate,
                    returnDate,
                    address,
                    notes,
                    rentalDays
                },
                items: orderItems,
                totalAmount: totalAmount
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
