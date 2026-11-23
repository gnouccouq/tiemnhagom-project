const functions = require('firebase-functions/v1');
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const kiotviet = require('./kiotviet');
const { createAiChatHandler } = require('./aiChat');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK if not already initialized
admin.initializeApp();
const db = admin.firestore();

/**
 * Hàm hỗ trợ trích xuất đường dẫn file từ URL Storage
 */
function getFilePathFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        // Find the index of '/o/' which precedes the file path in Firebase Storage URLs
        const oIndex = url.indexOf('/o/');
        if (oIndex === -1) return null;
        let path = url.substring(oIndex + 3).split('?')[0];
        return decodeURIComponent(path);
    } catch (error) {
        return null;
    }
}

/**
 * Helper tạo Order ID phía Server (Node.js) khớp múi giờ Việt Nam
 * Đã nâng cấp thêm mili giây và hậu tố alphanumeric để chống trùng lặp cao
 */
function generateServerOrderId() {
    const now = new Date();
    // Chuyển sang giờ VN (UTC+7)
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const pad = (n, l = 2) => String(n).padStart(l, '0');
    const dateStr = `${pad(vnTime.getUTCDate())}${pad(vnTime.getUTCMonth() + 1)}${vnTime.getUTCFullYear()}`;
    const timeStr = `${pad(vnTime.getUTCHours())}${pad(vnTime.getUTCMinutes())}${pad(vnTime.getUTCSeconds())}${pad(vnTime.getUTCMilliseconds(), 3)}`;
    // Random 4 ký tự (chữ + số): 36^4 = ~1.6 triệu khả năng trong mỗi mili giây
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TNG${dateStr}${timeStr}-${randomSuffix}`;
}

/**
 * Automatically deletes product images from Firebase Storage when a product document is deleted.
 */
exports.deleteProductImages = functions.firestore
    .document('products/{productId}')
    .onDelete(async (snap, context) => {
        const data = snap.data();
        const images = [];
        
        if (data.imageUrl && !data.imageUrl.includes('placehold.co') && !data.imageUrl.includes('via.placeholder.com')) {
            images.push(data.imageUrl);
        }
        if (Array.isArray(data.additionalImages)) {
            images.push(...data.additionalImages);
        }

        return deleteFilesFromStorage(images, `Sản phẩm ${context.params.productId}`);
    });

/**
 * Automatically deletes old product images from Firebase Storage when a product document is updated.
 */
exports.updateProductImages = functions.firestore
    .document('products/{productId}')
    .onUpdate(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();
        const imagesToDelete = [];

        // 1. Kiểm tra ảnh chính
        if (beforeData.imageUrl && afterData.imageUrl !== beforeData.imageUrl) {
            // Nếu ảnh cũ không phải là placeholder thì mới xóa
            if (!beforeData.imageUrl.includes('placehold.co') && !beforeData.imageUrl.includes('via.placeholder.com')) {
                imagesToDelete.push(beforeData.imageUrl);
            }
        }

        // 2. Kiểm tra danh sách ảnh phụ
        const beforeAdditionals = beforeData.additionalImages || [];
        const afterAdditionals = afterData.additionalImages || [];

        // Những ảnh có trong 'trước' nhưng không còn trong 'sau' sẽ bị xóa
        beforeAdditionals.forEach(url => {
            if (!afterAdditionals.includes(url)) {
                imagesToDelete.push(url);
            }
        });

        if (imagesToDelete.length === 0) return null;
        return deleteFilesFromStorage(imagesToDelete, `Cập nhật sản phẩm ${context.params.productId}`);
    });

/**
 * Automatically deletes review images from Firebase Storage when a review document is deleted.
 */
exports.deleteReviewImages = functions.firestore
    .document('reviews/{reviewId}')
    .onDelete(async (snap, context) => {
        const data = snap.data();
        const images = data.images || [];

        if (images.length === 0) {
            functions.logger.info(`Review ${context.params.reviewId} không có ảnh để xóa.`);
            return null;
        }

        return deleteFilesFromStorage(images, `Đánh giá ${context.params.reviewId}`);
    });

/**
 * Helper function to delete a list of files from Firebase Storage.
 */
async function deleteFilesFromStorage(urls, contextName) {
    let bucket;
    try {
        bucket = admin.storage().bucket();
    } catch (err) {
        functions.logger.warn(`[${contextName}] Không thể khởi tạo bucket mặc định:`, err);
        return null;
    }

    const deletePromises = urls.map(async (url) => {
        const filePath = getFilePathFromUrl(url);
        if (!filePath) return null;

        try {
            await bucket.file(filePath).delete();
            functions.logger.info(`[${contextName}] Đã xóa: ${filePath}`);
        } catch (error) {
            if (error.code === 404) {
                functions.logger.warn(`[${contextName}] File không tồn tại: ${filePath}`);
            } else {
                functions.logger.error(`[${contextName}] Lỗi xóa file ${filePath}:`, error);
            }
        }
    });

    return Promise.all(deletePromises);
}

/**
 * Cloud Function to securely create an order, validate stock, apply coupons, and update inventory.
 * This function is callable from the client-side.
 */
// Tách logic dọn dẹp nhật ký kho thành hàm riêng (Chạy 1 giờ sáng mỗi ngày)
exports.cleanupOldInventoryLogs = functions.pubsub
    .schedule('0 1 * * *')
    .timeZone('Asia/Ho_Chi_Minh')
    .onRun(async (context) => {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const cutoff = admin.firestore.Timestamp.fromDate(oneYearAgo);

        const logsRef = admin.firestore().collection('inventory_logs');
        // Giới hạn 500 bản ghi mỗi lần chạy để đảm bảo an toàn cho Batch write của Firestore
        const oldLogsQuery = logsRef.where('timestamp', '<', cutoff).limit(500);

        const snapshot = await oldLogsQuery.get();

        if (snapshot.empty) {
            functions.logger.info("Không có nhật ký kho cũ cần dọn dẹp.");
            return null;
        }

        const batch = admin.firestore().batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        functions.logger.info(`Hệ thống đã tự động dọn dẹp ${snapshot.size} bản ghi nhật ký kho cũ hơn 1 năm.`);
        return null;
    });

// Khai báo lại createOrderSecure bằng v2 để hỗ trợ cấu hình CORS dễ dàng
exports.createOrderSecure = onCall({ cors: true }, async (request) => {
    // 1. Kiểm tra xác thực (Tùy chọn nếu bạn cho phép khách vãng lai)
    const uid = request.auth ? request.auth.uid : 'guest';
    const data = request.data;
    const { items, couponCode, shippingAddress, paymentMethod, shippingMethod } = data || {};

    if (!items || items.length === 0) {
        throw new HttpsError("invalid-argument", "Giỏ hàng trống.");
    }

    try {
        let subtotal = 0;
        const orderItems = [];
        const productNames = [];

        // 2. Duyệt qua từng item và lấy giá THẬT từ Firestore
        for (const item of items) {
            if (!item.id || typeof item.id !== 'string') {
                throw new HttpsError("invalid-argument", "Mã sản phẩm không hợp lệ.");
            }

            const productDoc = await db.collection("products").doc(item.id).get();
            
            if (!productDoc.exists) {
                throw new HttpsError("not-found", `Sản phẩm ID ${item.id} không tồn tại.`);
            }

            const product = productDoc.data();
            
            // Kiểm tra tồn kho
            if (product.stock < item.quantity) {
                throw new HttpsError("out-of-resource", `Sản phẩm ${product.name} đã hết hàng hoặc không đủ số lượng.`);
            }

            // Tính toán giá dựa trên Sale hiện tại của Server
            const hasSale = product.sale > 0;
            const currentUnitPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
            const itemTotal = currentUnitPrice * item.quantity;

            subtotal += itemTotal;
            productNames.push(product.name);
            
            orderItems.push({
                id: item.id,
                name: product.name,
                price: currentUnitPrice,
                image: product.imageUrl,
                quantity: item.quantity,
                color: item.color || null,
                category: product.category || null
            });
        }

        // 3. Tính toán Coupon (Nếu có)
        let discountAmount = 0;
        if (couponCode) {
            const couponDoc = await db.collection("coupons").doc(String(couponCode).toUpperCase()).get();
            if (couponDoc.exists) {
                const coupon = couponDoc.data();
                const today = admin.firestore.Timestamp.now().toDate();
                const expiryDate = coupon.expiryDate ? new Date(coupon.expiryDate) : null;

                // Tính toán tổng phụ của các sản phẩm thuộc danh mục áp dụng
                let applicableSubtotal = subtotal;
                if (coupon.category && coupon.category !== 'all') {
                    applicableSubtotal = orderItems
                        .filter(item => item.category === coupon.category)
                        .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                }

                let isValid = (!expiryDate || expiryDate >= today) && 
                                (coupon.limit === 0 || (coupon.usedCount || 0) < coupon.limit) &&
                                (applicableSubtotal >= (coupon.minOrder || 0)) &&
                                (!coupon.category || coupon.category === 'all' || applicableSubtotal > 0);

                // Không cho phép dùng mã gán riêng cho tài khoản khác
                if (isValid && coupon.assignedTo && coupon.assignedTo !== uid) {
                    isValid = false;
                }

                // Không cho phép chính chủ tự áp dụng mã quà tặng người thân do mình sở hữu
                if (isValid && coupon.assignedBy && coupon.assignedBy === uid) {
                    isValid = false;
                }

                // Voucher tặng người thân chỉ áp dụng cho khách hàng mới chưa từng có đơn hàng
                if (isValid && coupon.forNewCustomerOnly && uid) {
                    const pastOrdersSnap = await db.collection("orders").where("userId", "==", uid).limit(1).get();
                    if (!pastOrdersSnap.empty) {
                        isValid = false;
                    }
                }

                if (isValid) {
                    if (coupon.type === 'percent') {
                        const rawDiscount = applicableSubtotal * coupon.value / 100;
                        discountAmount = (coupon.maxDiscount && coupon.maxDiscount > 0)
                            ? Math.min(rawDiscount, coupon.maxDiscount)
                            : rawDiscount;
                    } else {
                        discountAmount = Math.min(coupon.value, applicableSubtotal);
                    }
                }
            }
        }

        // 4. Phí vận chuyển
        const shippingFee = shippingMethod === 'pickup' ? 0 : 30000;
        const finalTotal = Math.max(0, subtotal + shippingFee - discountAmount);

        // 5. Thực hiện Transaction để đảm bảo trừ kho và tạo đơn đồng thời
        const orderId = await db.runTransaction(async (transaction) => {
            const customId = generateServerOrderId();
            const newOrderRef = db.collection("orders").doc(customId);
            
            // 1. Đọc tồn kho tất cả sản phẩm trước (ALL READS FIRST)
            const productSnapshots = [];
            for (const item of orderItems) {
                const pRef = db.collection("products").doc(item.id);
                const pSnap = await transaction.get(pRef);
                productSnapshots.push({ item, pRef, pSnap, isChild: false });
            }

            // Lượt 2: Tìm các sản phẩm con của combo để trừ kho và cộng đã bán cho từng món con
            const initialSnapLen1 = productSnapshots.length;
            for (let i = 0; i < initialSnapLen1; i++) {
                const { item, pSnap } = productSnapshots[i];
                const pData = pSnap.data() || {};
                if (pData.isCombo && Array.isArray(pData.comboVariants)) {
                    const cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                    const cv = pData.comboVariants.find(v => v.name === cName) || (pData.comboVariants.length === 1 ? pData.comboVariants[0] : null);
                    if (cv && Array.isArray(cv.items)) {
                        const parentQty = Number(item.quantity) || 1;
                        for (const child of cv.items) {
                            if (!child.id) continue;
                            const childRef = db.collection("products").doc(child.id);
                            const childSnap = await transaction.get(childRef);
                            if (childSnap.exists) {
                                const childQty = parentQty * Math.max(1, parseInt(child.quantity, 10) || 1);
                                productSnapshots.push({
                                    item: {
                                        id: child.id,
                                        quantity: childQty,
                                        color: child.selectedColor || null,
                                        pattern: child.selectedPattern || null
                                    },
                                    pRef: childRef,
                                    pSnap: childSnap,
                                    isChild: true
                                });
                            }
                        }
                    }
                }
            }

            // 2. Thực hiện tất cả các thao tác ghi (ALL WRITES AFTER READS)
            // Cập nhật kho cho từng sản phẩm
            for (const { item, pRef, pSnap } of productSnapshots) {
                const pData = pSnap.data() || {};

                let updateData = {
                    sold: admin.firestore.FieldValue.increment(item.quantity)
                };
                if (!pData.isCombo) {
                    updateData.stock = admin.firestore.FieldValue.increment(-item.quantity);
                }

                // Nếu khách hàng có chọn biến thể màu sắc, cập nhật kho riêng của biến thể đó
                if (item.color && pData.colorVariants) {
                    const updatedVariants = pData.colorVariants.map(v => {
                        if (v.name === item.color) {
                            return { ...v, stock: (v.stock || 0) - item.quantity, sold: (v.sold || 0) + item.quantity };
                        }
                        return v;
                    });
                    updateData.colorVariants = updatedVariants;
                }

                // Cập nhật kho riêng của biến thể họa tiết
                if (item.pattern && pData.patternVariants) {
                    const updatedPatternVariants = pData.patternVariants.map(v => {
                        if (v.name === item.pattern) {
                            return { ...v, stock: (v.stock || 0) - item.quantity, sold: (v.sold || 0) + item.quantity };
                        }
                        return v;
                    });
                    updateData.patternVariants = updatedPatternVariants;
                }

                // Cập nhật số lượng đã bán của biến thể combo nếu có
                if (pData.isCombo && Array.isArray(pData.comboVariants) && pData.comboVariants.length > 0) {
                    const cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                    updateData.comboVariants = pData.comboVariants.map(v => {
                        if (v.name === cName || (pData.comboVariants.length === 1)) {
                            return { ...v, sold: (Number(v.sold) || 0) + item.quantity };
                        }
                        return v;
                    });
                }

                transaction.update(pRef, updateData);
            }

            // Cập nhật lượt dùng mã giảm giá
            if (couponCode) {
                const couponRef = db.collection("coupons").doc(String(couponCode).toUpperCase());
                transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
            }

            // Lưu đơn hàng
            transaction.set(newOrderRef, {
                userId: uid,
                items: orderItems,
                productNames,
                totalAmount: finalTotal,
                shippingFee,
                discountAmount,
                couponCode: couponCode || null,
                status: "Đang xử lý",
                orderDate: admin.firestore.FieldValue.serverTimestamp(),
                shippingAddress,
                shippingMethod,
                paymentMethod: paymentMethod || "COD"
            });

            return newOrderRef.id;
        });

        // 6. Gửi đơn hàng sang KiotViet
        try {
            const kvOrderDetails = orderItems.map(item => ({
                productCode: item.id, // Giả sử ID sản phẩm trên Firestore trùng với Mã hàng KiotViet
                quantity: item.quantity,
                price: item.price
            }));

            const kvOrderData = {
                description: `Đơn hàng từ Website - Mã đơn: ${orderId}\nPhương thức: ${shippingMethod}\nThanh toán: ${paymentMethod || 'COD'}`,
                totalPayment: 0, 
                method: paymentMethod || "COD",
                orderDetails: kvOrderDetails
            };

            if (shippingAddress) {
                kvOrderData.orderDelivery = {
                    receiver: shippingAddress.name || "Khách mua web",
                    contactNumber: shippingAddress.phone || "",
                    address: `${shippingAddress.street || ''}, ${shippingAddress.ward || ''}, ${shippingAddress.district || ''}, ${shippingAddress.city || ''}`.replace(/^, | , /g, '').trim(),
                    deliveryCode: shippingMethod,
                    price: shippingFee || 0
                };
            }

            if (discountAmount > 0) {
                kvOrderData.discount = discountAmount;
            }

            await kiotviet.createOrderInKiotViet(kvOrderData);
            functions.logger.info(`Đã gửi đơn hàng ${orderId} sang KiotViet thành công.`);
        } catch (kvError) {
            functions.logger.error(`Lỗi gửi đơn hàng ${orderId} sang KiotViet:`, kvError);
            // Không throw error để người dùng vẫn thấy đặt hàng thành công trên web
        }

        return { success: true, orderId: orderId };

    } catch (error) {
        console.error("Order Creation Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Hàm hỗ trợ đồng bộ toàn bộ sản phẩm lên KiotViet (gọi dễ dàng qua trình duyệt)
exports.syncAllProductsToKV = onRequest({ cors: true, timeoutSeconds: 540 }, async (req, res) => {
    try {
        const productsSnap = await db.collection('products').get();
        let successCount = 0;
        let failCount = 0;

        for (const doc of productsSnap.docs) {
            const productData = { id: doc.id, ...doc.data() };
            try {
                await kiotviet.createProductInKiotViet(productData);
                successCount++;
                functions.logger.info(`Đồng bộ thành công SP: ${productData.name}`);
            } catch (error) {
                failCount++;
            }
        }

        res.status(200).json({ 
            success: true, 
            message: `Đồng bộ hoàn tất. Đã đẩy lên thành công: ${successCount} sản phẩm. Lỗi/Trùng lặp: ${failCount} sản phẩm.` 
        });
    } catch (error) {
        console.error("Lỗi đồng bộ sản phẩm:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Automatically send a Telegram message when a new order is created.
 */
exports.sendTelegramOnNewOrder = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const orderData = snap.data();
        const orderId = context.params.orderId;
        
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            functions.logger.warn("Chưa cấu hình Telegram Bot Token hoặc Chat ID trong .env");
            return null;
        }

        const customerName = orderData.shippingAddress?.fullName || 'Khách vãng lai';
        const customerPhone = orderData.shippingAddress?.phone || 'Không có';
        const customerEmail = orderData.shippingAddress?.email || 'Không có';
        const address = orderData.shippingAddress?.address || 'Không có';
        const orderNote = orderData.note ? `\n📝 <b>Ghi chú:</b> ${orderData.note}` : '';
        const totalAmount = orderData.totalAmount || 0;
        const shippingFee = orderData.shippingFee || 0;
        const discountAmount = orderData.discountAmount || 0;
        const membershipDiscount = orderData.membershipDiscount || 0;
        
        function getItemVariantText(item) {
            if (!item) return '';
            const parts = [];

            if (item.comboVariant && item.comboVariant !== 'null' && item.comboVariant !== 'undefined') {
                parts.push(`Combo: ${item.comboVariant}`);
            }
            if (item.color && item.color !== 'null' && item.color !== 'undefined') {
                parts.push(`Màu: ${item.color}`);
            }
            if (item.pattern && item.pattern !== 'null' && item.pattern !== 'undefined') {
                parts.push(`Họa tiết: ${item.pattern}`);
            }

            if (parts.length > 0) {
                return parts.join(' | ');
            }

            if (item.variant && typeof item.variant === 'string' && item.variant.trim() !== '' && item.variant !== 'null' && item.variant !== 'undefined') {
                return item.variant.trim();
            }

            if (item.variant && typeof item.variant === 'object') {
                const objParts = [];
                if (item.variant.comboVariant) objParts.push(`Combo: ${item.variant.comboVariant}`);
                if (item.variant.color) objParts.push(`Màu: ${item.variant.color}`);
                if (item.variant.pattern) objParts.push(`Họa tiết: ${item.variant.pattern}`);
                if (item.variant.name) objParts.push(item.variant.name);
                if (objParts.length > 0) return objParts.join(' | ');
            }

            if (item.selectedComboVariant) parts.push(`Combo: ${item.selectedComboVariant}`);
            if (item.selectedColor) parts.push(`Màu: ${item.selectedColor}`);
            if (item.selectedPattern) parts.push(`Họa tiết: ${item.selectedPattern}`);
            if (parts.length > 0) return parts.join(' | ');

            return '';
        }

        let itemsList = '';
        if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items.forEach((item, index) => {
                const variantText = getItemVariantText(item);
                const variantDisplay = variantText ? `\n   🎨 <b>Biến thể:</b> <i>${variantText}</i>` : '';
                itemsList += `${index + 1}. <b>${item.name}</b>${variantDisplay}\n   (Mã: <code>${item.id}</code>) - SL: <b>${item.quantity}</b> - Đơn giá: ${new Intl.NumberFormat('vi-VN').format(item.price)}đ\n`;
            });
        }

        // Tính tạm tính trước khi trừ đi phí ship và giảm giá
        const tempTotal = totalAmount - shippingFee + discountAmount + membershipDiscount;

        let message = '';
        if (orderData.orderType === 'rental') {
            const companyName = orderData.rentalInfo?.companyName || 'Không có';
            const contactName = orderData.rentalInfo?.contactName || 'Không có';
            const phone = orderData.rentalInfo?.phone || 'Không có';
            const email = orderData.rentalInfo?.email || 'Không có';
            const taxCode = orderData.rentalInfo?.taxCode || 'Không có';
            const rentalAddress = orderData.rentalInfo?.address || 'Không có';
            const rentalDate = orderData.rentalInfo?.rentalDate || 'Không có';
            const returnDate = orderData.rentalInfo?.returnDate || 'Không có';
            const notes = orderData.rentalInfo?.notes ? `\n📝 <b>Ghi chú:</b> ${orderData.rentalInfo.notes}` : '';

            let rentalItemsList = '';
            if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach((item, index) => {
                    const variantText = getItemVariantText(item);
                    const variantDisplay = variantText ? `\n   🎨 <b>Biến thể:</b> <i>${variantText}</i>` : '';
                    rentalItemsList += `${index + 1}. <b>${item.name}</b>${variantDisplay}\n   (Mã: <code>${item.id}</code>) - SL: <b>${item.quantity}</b> - Giá thuê: ${new Intl.NumberFormat('vi-VN').format(item.rentalPrice || 0)}đ\n`;
                });
            }

            const setupOption = orderData.rentalInfo?.setupOption || 'Khách tự lấy & setup';

            message = `
🛋️ <b>CÓ YÊU CẦU THUÊ ĐỒ MỚI</b> 🛋️
<b>Mã yêu cầu:</b> #${orderId}

👤 <b>Thông tin khách hàng:</b>
- Tên/Công ty: ${companyName}
- Người liên hệ: ${contactName}
- MST: ${taxCode}
- SĐT: ${phone}
- Email: ${email}
- Địa chỉ setup: ${rentalAddress}${notes}

🚚 <b>Hình thức Setup:</b> ${setupOption}

🕒 <b>Thời gian thuê:</b>
- Nhận đồ: ${rentalDate}
- Trả đồ: ${returnDate} (${orderData.rentalInfo?.rentalDays || 1} ngày)

🛒 <b>Sản phẩm cần thuê:</b>
${rentalItemsList}
💰 <b>Tổng tiền thuê dự kiến:</b> ${new Intl.NumberFormat('vi-VN').format(orderData.totalAmount || 0)}đ
(Tiền cọc ước tính 50%: ${new Intl.NumberFormat('vi-VN').format(Math.round((orderData.totalAmount || 0) / 2))}đ)
            `.trim();
        } else {
            message = `
📦 <b>CÓ ĐƠN HÀNG MỚI</b> 📦
<b>Mã đơn:</b> #${orderId}

👤 <b>Thông tin khách hàng:</b>
- Tên: ${customerName}
- SĐT: ${customerPhone}
- Email: ${customerEmail}
- Địa chỉ: ${address}${orderNote}

🛒 <b>Sản phẩm:</b>
${itemsList}
💰 <b>Thanh toán:</b>
- Tạm tính: ${new Intl.NumberFormat('vi-VN').format(tempTotal)}đ
- Phí ship: ${new Intl.NumberFormat('vi-VN').format(shippingFee)}đ
- Mã giảm giá: ${discountAmount > 0 ? '-' + new Intl.NumberFormat('vi-VN').format(discountAmount) + 'đ' : '0đ'}
- Ưu đãi TV: ${membershipDiscount > 0 ? '-' + new Intl.NumberFormat('vi-VN').format(membershipDiscount) + 'đ' : '0đ'}
- <b>Tổng cộng: ${new Intl.NumberFormat('vi-VN').format(totalAmount)}đ</b>

💵 <b>Hình thức:</b> ${orderData.paymentMethod || 'COD'}
            `.trim();
        }

        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            });
            functions.logger.info(`Đã gửi thông báo Telegram cho đơn hàng ${orderId}`);
        } catch (error) {
            functions.logger.error(`Lỗi gửi thông báo Telegram cho đơn hàng ${orderId}:`, error.message);
        }
        
        return null;
    });

exports.shareRedirect = onRequest(async (req, res) => {
    const type = req.query.type;
    const id = req.query.id;

    if (!type || !id) {
        return res.status(400).send('Thiếu thông tin type hoặc id');
    }

    let collectionName = '';
    let redirectUrl = '';
    if (type === 'product') {
        collectionName = 'products';
        const color = req.query.color;
        const pattern = req.query.pattern;
        const combo = req.query.combo;
        const queryParams = [`id=${encodeURIComponent(id)}`];
        if (color) queryParams.push(`color=${encodeURIComponent(color)}`);
        if (pattern) queryParams.push(`pattern=${encodeURIComponent(pattern)}`);
        if (combo) queryParams.push(`combo=${encodeURIComponent(combo)}`);
        redirectUrl = 'https://tiemnhagom.vn/product/index.html?' + queryParams.join('&');
    } else if (type === 'news') {
        collectionName = 'news';
        redirectUrl = 'https://tiemnhagom.vn/blog/article.html?id=' + encodeURIComponent(id);
    } else {
        return res.status(400).send('Type không hợp lệ');
    }

    try {
        const docSnap = await db.collection(collectionName).doc(id).get();
        if (!docSnap.exists) {
            return res.status(404).send('Không tìm thấy dữ liệu');
        }

        const data = docSnap.data();
        let title = data.name || data.title || 'Tiệm Nhà Gốm';
        let imageUrl = data.imageUrl || data.image || data.thumbUrl || '';
        let description = data.excerpt || 'Khám phá tại Tiệm Nhà Gốm';
        let canonicalUrl = redirectUrl;
        let isNoIndex = false;
        const ogType = type === 'product' ? 'product' : (type === 'news' ? 'article' : 'website');
        
        if (type === 'product') {
            const color = req.query.color;
            const pattern = req.query.pattern;
            const combo = req.query.combo;
            const variantTitleParts = [title];
            
            if (combo && Array.isArray(data.comboVariants)) {
                const cv = data.comboVariants.find(v => (v.name || v) === combo);
                if (cv) {
                    if (cv.imageUrl) imageUrl = cv.imageUrl;
                    variantTitleParts.push(`Phân loại: ${cv.name}`);
                }
            }
            if (color && Array.isArray(data.colorVariants)) {
                const c = data.colorVariants.find(v => (v.name || v) === color);
                if (c) {
                    const cImg = c.imageUrl || c.thumbUrl || c.image;
                    if (cImg) imageUrl = cImg;
                    variantTitleParts.push(`Màu: ${c.name}`);
                }
            }
            if (pattern && Array.isArray(data.patternVariants)) {
                const pat = data.patternVariants.find(v => (v.name || v) === pattern);
                if (pat) {
                    const patImg = pat.imageUrl || pat.thumbUrl || pat.image;
                    if (patImg) imageUrl = patImg;
                    variantTitleParts.push(`Họa tiết: ${pat.name}`);
                }
            }
            const hasVariantQuery = Boolean(combo || color || pattern);
            const customSeoTitle = data.seoTitle && String(data.seoTitle).trim();
            title = (!hasVariantQuery && customSeoTitle)
                ? customSeoTitle
                : (hasVariantQuery && customSeoTitle
                    ? `${customSeoTitle.replace(/\s*\|\s*Tiệm Nhà Gốm\s*$/i, '')} - ${variantTitleParts.slice(1).join(' - ')} | Tiệm Nhà Gốm`
                    : `${variantTitleParts.join(' - ')} | Tiệm Nhà Gốm`);

            let price = data.salePrice || data.price || 0;
            if (color && Array.isArray(data.colorVariants)) {
                const c = data.colorVariants.find(v => (v.name || v) === color);
                if (c && (c.salePrice || c.price)) price = c.salePrice || c.price;
            }
            const customSeoDesc = data.seoDescription && String(data.seoDescription).trim();
            if (!hasVariantQuery && customSeoDesc) {
                description = customSeoDesc;
            } else if (price > 0) {
                description = `Giá: ${new Intl.NumberFormat('vi-VN').format(price)}₫ • ` + description;
            }
            if (!hasVariantQuery && data.seoCanonical && String(data.seoCanonical).trim()) {
                canonicalUrl = String(data.seoCanonical).trim();
            }
            isNoIndex = Boolean(data.seoNoIndex || data.isHidden || data.isOnlyEvent);
        } else if (type === 'news') {
            const newsSlug = (data.slug && String(data.slug).trim()) || id;
            redirectUrl = `https://tiemnhagom.vn/blog/${encodeURIComponent(newsSlug)}`;
            const customSeoTitle = data.seoTitle && String(data.seoTitle).trim();
            title = customSeoTitle || (data.title ? `${data.title} | Tiệm Nhà Gốm` : 'Tiệm Nhà Gốm');

            const customSeoDesc = data.seoDescription && String(data.seoDescription).trim();
            const plainContent = data.content
                ? String(data.content).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim()
                : '';
            description = customSeoDesc
                || (data.excerpt && String(data.excerpt).trim())
                || (plainContent ? plainContent.substring(0, 155) + (plainContent.length > 155 ? '...' : '') : 'Khám phá tại Tiệm Nhà Gốm');

            canonicalUrl = (data.seoCanonical && String(data.seoCanonical).trim())
                ? String(data.seoCanonical).trim()
                : redirectUrl;
            isNoIndex = Boolean(data.seoNoIndex);
        } else if (data.content && !data.excerpt) {
            description = data.content.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...';
        }

        const escapeAttr = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>${escapeAttr(title)}</title>
    <meta name="description" content="${escapeAttr(description)}">
    ${isNoIndex ? '<meta name="robots" content="noindex, nofollow">' : ''}
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
    
    <meta property="og:type" content="${ogType}">
    <meta property="og:site_name" content="Tiệm Nhà Gốm">
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
    <meta property="og:title" content="${escapeAttr(title)}">
    <meta property="og:description" content="${escapeAttr(description)}">
    <meta property="og:image" content="${escapeAttr(imageUrl)}">
    <meta property="og:image:secure_url" content="${escapeAttr(imageUrl)}">
    <meta property="og:locale" content="vi_VN">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${escapeAttr(redirectUrl)}">
    <meta name="twitter:title" content="${escapeAttr(title)}">
    <meta name="twitter:description" content="${escapeAttr(description)}">
    <meta name="twitter:image" content="${escapeAttr(imageUrl)}">
    
    <script>
        window.location.replace('${redirectUrl}');
    </script>
</head>
<body>
    <p>Đang chuyển hướng...</p>
    <p><a href="${escapeAttr(redirectUrl)}">Bấm vào đây nếu trình duyệt không tự chuyển hướng</a></p>
</body>
</html>`;

        res.set('Cache-Control', 'public, max-age=60, s-maxage=600');
        res.status(200).send(html);
    } catch (error) {
        console.error('Lỗi tạo share link:', error);
        res.status(500).send('Lỗi máy chủ');
    }
});

function removeVietnameseTones(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

function toCategorySlug(str) {
    if (!str) return '';
    return removeVietnameseTones(String(str))
        .replace(/&/g, ' ')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

// --- CATEGORY SEO METADATA & SCHEMA.ORG DEFINITIONS ---
const CATEGORY_SEO_DATA = {
    // 5 Danh mục cha
    "Dining Decor": {
        isParent: true,
        parent: null,
        name: "Dining Decor",
        h1: "Dining Decor - Bát Đĩa & Bàn Ăn Gốm Sứ",
        title: "Dining Decor - Bát Đĩa, Chén Dĩa & Đồ Dùng Bàn Ăn Gốm Sứ Thủ Công | Tiệm Nhà Gốm",
        description: "Khám phá bộ sưu tập Dining Decor gốm thủ công mộc mạc tại Tiệm Nhà Gốm: chén bát, dĩa khay, thìa muỗng đũa, khay gia vị nước chấm mang ấm cúng cho bữa cơm nhà.",
        subs: ["Bát & Chén", "Dĩa & Khay", "Thìa Muỗng & Đũa", "Gia Vị & Nước Chấm", "Gác Đũa & Phụ Kiện"]
    },
    "Teatime & Drinks": {
        isParent: true,
        parent: null,
        name: "Teatime & Drinks",
        h1: "Teatime & Drinks - Ấm Trà & Ly Tách Gốm Sứ",
        title: "Teatime & Drinks - Ấm Trà, Ly Tách Gốm Sứ Thưởng Trà Cafe | Tiệm Nhà Gốm",
        description: "Khám phá các sản phẩm Teatime & Drinks gốm thủ công tại Tiệm Nhà Gốm: ấm pha trà mộc, ly tách cafe, lót ly gốm tinh xảo cho giây phút thảnh thơi an yên.",
        subs: ["Ấm Trà", "Ly & Tách", "Lót Ly & Đế Lót"]
    },
    "Home Decor": {
        isParent: true,
        parent: null,
        name: "Home Decor",
        h1: "Home Decor - Bình Hoa & Trang Trí Gốm Sứ",
        title: "Home Decor - Bình Hoa, Lọ Hoa & Đồ Trang Trí Gốm Sứ Nghệ Thuật | Tiệm Nhà Gốm",
        description: "Bộ sưu tập đồ trang trí Home Decor gốm sứ mộc mạc tại Tiệm Nhà Gốm: bình hoa, lọ hoa nghệ thuật, tượng decor, khay bánh mứt làm đẹp không gian sống.",
        subs: ["Lọ Hoa Nghệ Thuật", "Đèn & Tượng Decor", "Khay Bánh Mứt"]
    },
    "Kitchenware": {
        isParent: true,
        parent: null,
        name: "Kitchenware",
        h1: "Kitchenware - Đồ Dùng Gian Bếp Gốm Sứ",
        title: "Kitchenware - Nồi Chảo Gốm Sứ & Đồ Dùng Bếp Thủ Công | Tiệm Nhà Gốm",
        description: "Bộ sưu tập Kitchenware đồ dùng nhà bếp cao cấp tại Tiệm Nhà Gốm: nồi chảo gốm chịu nhiệt, dao kéo, thớt, dụng cụ sơ chế an toàn cho sức khỏe gia đình.",
        subs: ["Nồi & Chảo", "Dao & Kéo", "Thớt", "Dụng Cụ Sơ Chế"]
    },
    "Lifestyle": {
        isParent: true,
        parent: null,
        name: "Lifestyle",
        h1: "Lifestyle - Phụ Kiện & Đời Sống Gốm Sứ",
        title: "Lifestyle - Phụ Kiện Phòng Tắm & Tạp Vật Gốm Sứ Đời Sống | Tiệm Nhà Gốm",
        description: "Khám phá các sản phẩm gốm sứ phong cách sống Lifestyle tại Tiệm Nhà Gốm: phụ kiện phòng tắm, tạp vật gốm decor và vật phẩm cá nhân tinh tế.",
        subs: ["Phụ Kiện Phòng Tắm", "Tạp Vật Tinh Tế", "Vật Phẩm Cá Nhân"]
    },

    // 18 Danh mục con
    "Bát & Chén": {
        isParent: false,
        parent: "Dining Decor",
        name: "Bát & Chén",
        h1: "Bát & Chén Ăn Cơm Gốm Sứ Thủ Công",
        title: "Bát & Chén, Bộ Bát Đĩa Chén Ăn Cơm Gốm Sứ Mộc Mạc | Tiệm Nhà Gốm",
        description: "Mua bát chén, chén dĩa gốm sứ thủ công cao cấp tại Tiệm Nhà Gốm. Men gốm tự nhiên an toàn tuyệt đối, kiểu dáng mộc mạc ấm áp cho mâm cơm gia đình."
    },
    "Dĩa & Khay": {
        isParent: false,
        parent: "Dining Decor",
        name: "Dĩa & Khay",
        h1: "Dĩa & Khay Gốm Sứ Thủ Công",
        title: "Dĩa & Khay Gốm Sứ Thủ Công, Đĩa Tròn Dĩa Vuông Đẹp | Tiệm Nhà Gốm",
        description: "Các mẫu dĩa gốm, khay đựng thức ăn gốm sứ mộc mạc tại Tiệm Nhà Gốm. Đa dạng hình dáng dĩa tròn, dĩa oval, khay decor bàn tiệc cao cấp."
    },
    "Thìa Muỗng & Đũa": {
        isParent: false,
        parent: "Dining Decor",
        name: "Thìa Muỗng & Đũa",
        h1: "Thìa Muỗng & Đũa Gốm Sứ Thủ Công",
        title: "Thìa Muỗng & Đũa Gốm Sứ Thủ Công Tinh Xảo | Tiệm Nhà Gốm",
        description: "Bộ thìa gốm, muỗng canh, đũa gỗ tự nhiên và phụ kiện bàn ăn mộc mạc tại Tiệm Nhà Gốm. Từng đường nét được vuốt tay tỉ mỉ và bền bỉ."
    },
    "Gia Vị & Nước Chấm": {
        isParent: false,
        parent: "Dining Decor",
        name: "Gia Vị & Nước Chấm",
        h1: "Gia Vị & Chén Nước Chấm Gốm Sứ",
        title: "Chén Chấm, Hũ Gia Vị & Nước Chấm Gốm Sứ Đẹp | Tiệm Nhà Gốm",
        description: "Chén đựng nước chấm, hũ tiêu muối gia vị bằng gốm sứ thủ công tại Tiệm Nhà Gốm. Điểm xuyết nét trang nhã tinh tế cho bàn ăn gia đình."
    },
    "Gác Đũa & Phụ Kiện": {
        isParent: false,
        parent: "Dining Decor",
        name: "Gác Đũa & Phụ Kiện",
        h1: "Gác Đũa & Phụ Kiện Bàn Ăn Gốm Sứ",
        title: "Gác Đũa Gốm Sứ Nghệ Thuật & Phụ Kiện Bàn Ăn | Tiệm Nhà Gốm",
        description: "Gác đũa gốm hình dáng độc đáo, phụ kiện bàn tiệc thủ công tại Tiệm Nhà Gốm. Chi tiết nhỏ tinh tế nâng niu bữa cơm thân mật."
    },
    "Ấm Trà": {
        isParent: false,
        parent: "Teatime & Drinks",
        name: "Ấm Trà",
        h1: "Ấm Pha Trà Gốm Sứ Mộc Thủ Công",
        title: "Ấm Trà Gốm Sứ Thủ Công, Bộ Ấm Chén Thưởng Trà Đạo | Tiệm Nhà Gốm",
        description: "Bộ sưu tập ấm trà gốm mộc vuốt tay thủ công tại Tiệm Nhà Gốm. Giữ nhiệt tốt, giữ trọn hương vị trà sen, trà ô long cho người yêu trà."
    },
    "Ly & Tách": {
        isParent: false,
        parent: "Teatime & Drinks",
        name: "Ly & Tách",
        h1: "Ly & Tách Gốm Sứ Thưởng Trà Cafe",
        title: "Ly & Tách Gốm Sứ Thủ Công, Cốc Uống Cafe Trà Đẹp | Tiệm Nhà Gốm",
        description: "Ly gốm, tách trà, cốc cafe thủ công đa dạng men gốm độc đáo tại Tiệm Nhà Gốm. Cầm chắc tay, giữ nhiệt tốt cho đồ uống thơm ngon."
    },
    "Lót Ly & Đế Lót": {
        isParent: false,
        parent: "Teatime & Drinks",
        name: "Lót Ly & Đế Lót",
        h1: "Lót Ly & Đế Lót Gốm Sứ Mộc Mạc",
        title: "Lót Ly & Đế Lót Gốm Sứ Mộc Mạc Tinh Tế | Tiệm Nhà Gốm",
        description: "Đế lót ly bằng gốm thấm nước, khay lót ấm chén thủ công tại Tiệm Nhà Gốm. Bảo vệ mặt bàn và tô điểm không gian thưởng trà."
    },
    "Lọ Hoa Nghệ Thuật": {
        isParent: false,
        parent: "Home Decor",
        name: "Lọ Hoa Nghệ Thuật",
        h1: "Bình Hoa & Lọ Hoa Nghệ Thuật Gốm Sứ",
        title: "Bình Hoa, Lọ Hoa Nghệ Thuật Gốm Sứ Thủ Công Mộc Mạc | Tiệm Nhà Gốm",
        description: "Tuyển chọn bình hoa, lọ hoa nghệ thuật gốm sứ thủ công vuốt tay tại Tiệm Nhà Gốm. Dáng mộc, men đất tự nhiên, tôn vinh vẻ đẹp của mọi loài hoa và không gian sống."
    },
    "Đèn & Tượng Decor": {
        isParent: false,
        parent: "Home Decor",
        name: "Đèn & Tượng Decor",
        h1: "Đèn Gốm & Tượng Decor Gốm Sứ Mộc Mạc",
        title: "Đèn Gốm & Tượng Decor Gốm Sứ Nghệ Thuật Mộc Mạc | Tiệm Nhà Gốm",
        description: "Tượng gốm decor, đèn gốm thấu quang thủ công tạo điểm nhấn an yên cho phòng khách, bàn làm việc và góc thiền tại Tiệm Nhà Gốm."
    },
    "Khay Bánh Mứt": {
        isParent: false,
        parent: "Home Decor",
        name: "Khay Bánh Mứt",
        h1: "Khay Bánh Mứt Gốm Sứ Thủ Công",
        title: "Khay Bánh Mứt Gốm Sứ Thủ Công, Khay Mứt Tết Sang Trọng | Tiệm Nhà Gốm",
        description: "Khay đựng bánh kẹo, khay mứt tết gốm sứ thủ công nhiều ngăn mộc mạc tinh tế tại Tiệm Nhà Gốm. Tôn vinh nét đẹp truyền thống và sự hiếu khách."
    },
    "Nồi & Chảo": {
        isParent: false,
        parent: "Kitchenware",
        name: "Nồi & Chảo",
        h1: "Nồi Đất & Chảo Gốm Sứ Chịu Nhiệt",
        title: "Nồi Đất, Chảo Gốm Sứ Chịu Nhiệt Thủ Công Cao Cấp | Tiệm Nhà Gốm",
        description: "Nồi đất gốm kho cá thịt, chảo gốm chịu nhiệt an toàn cho sức khỏe tại Tiệm Nhà Gốm. Giữ nhiệt lâu, lưu giữ trọn vẹn vị ngọt lành tự nhiên."
    },
    "Dao & Kéo": {
        isParent: false,
        parent: "Kitchenware",
        name: "Dao & Kéo",
        h1: "Dao & Kéo Nhà Bếp Thủ Công",
        title: "Dao & Kéo Làm Bếp Thủ Công Tinh Xảo, Bền Sắc | Tiệm Nhà Gốm",
        description: "Bộ dao kéo làm bếp thủ công tại Tiệm Nhà Gốm, thiết kế cán gỗ cầm chắc tay, sắc bén chuẩn xác giúp việc nấu nướng thêm phần hứng khởi."
    },
    "Thớt": {
        isParent: false,
        parent: "Kitchenware",
        name: "Thớt",
        h1: "Thớt Gỗ & Dụng Cụ Bếp Mộc",
        title: "Thớt Gỗ & Thớt Khay Bếp Tự Nhiên Thủ Công | Tiệm Nhà Gốm",
        description: "Thớt gỗ tự nhiên mộc mạc cao cấp tại Tiệm Nhà Gốm. Bề mặt nhẵn mịn, kháng khuẩn tự nhiên, vừa dùng băm chặt vừa làm khay decor món ăn."
    },
    "Dụng Cụ Sơ Chế": {
        isParent: false,
        parent: "Kitchenware",
        name: "Dụng Cụ Sơ Chế",
        h1: "Dụng Cụ Sơ Chế Thực Phẩm",
        title: "Dụng Cụ Sơ Chế Nhà Bếp Tiện Ích & Tinh Tế | Tiệm Nhà Gốm",
        description: "Bộ dụng cụ sơ chế chế biến thực phẩm thủ công tại Tiệm Nhà Gốm: chày cối gốm, đồ vắt cam gốm mộc mạc, tiện dụng và bền đẹp theo thời gian."
    },
    "Phụ Kiện Phòng Tắm": {
        isParent: false,
        parent: "Lifestyle",
        name: "Phụ Kiện Phòng Tắm",
        h1: "Phụ Kiện Phòng Tắm Gốm Sứ",
        title: "Phụ Kiện Phòng Tắm Gốm Sứ Thủ Công An Nhiên | Tiệm Nhà Gốm",
        description: "Bình đựng xà phòng, cốc cắm bàn chải gốm sứ mộc mạc tại Tiệm Nhà Gốm. Mang lại cảm giác thư thái chuẩn spa cho không gian phòng tắm của bạn."
    },
    "Tạp Vật Tinh Tế": {
        isParent: false,
        parent: "Lifestyle",
        name: "Tạp Vật Tinh Tế",
        h1: "Tạp Vật Gốm Sứ Tinh Tế",
        title: "Tạp Vật Tinh Tế, Đồ Gốm Thủ Công Nhỏ Gọn Độc Bản | Tiệm Nhà Gốm",
        description: "Khay đựng trang sức, chặn giấy gốm, đồ nhỏ xinh thủ công tại Tiệm Nhà Gốm. Nâng niu những điều bình dị thường nhật trong cuộc sống."
    },
    "Vật Phẩm Cá Nhân": {
        isParent: false,
        parent: "Lifestyle",
        name: "Vật Phẩm Cá Nhân",
        h1: "Vật Phẩm Cá Nhân Gốm Thủ Công",
        title: "Vật Phẩm Cá Nhân Gốm Sứ Thủ Công Độc Bản | Tiệm Nhà Gốm",
        description: "Phụ kiện, quà tặng gốm cá nhân thủ công mang đậm dấu ấn riêng tại Tiệm Nhà Gốm. Món quà ý nghĩa dành tặng bản thân và người thương quý."
    }
};

// Aliases tìm kiếm phổ biến người dùng gõ trên Google
const CATEGORY_SEARCH_ALIASES = {
    "bình hoa": "Lọ Hoa Nghệ Thuật",
    "binh hoa": "Lọ Hoa Nghệ Thuật",
    "lọ hoa": "Lọ Hoa Nghệ Thuật",
    "lo hoa": "Lọ Hoa Nghệ Thuật",
    "bình & lọ hoa": "Lọ Hoa Nghệ Thuật",
    "bình gốm": "Lọ Hoa Nghệ Thuật",
    "chén bát": "Bát & Chén",
    "chen bat": "Bát & Chén",
    "bát đĩa": "Bát & Chén",
    "bat dia": "Bát & Chén",
    "bát chén": "Bát & Chén",
    "tô, bát & chén": "Bát & Chén",
    "ấm trà": "Ấm Trà",
    "am tra": "Ấm Trà",
    "ấm chén": "Ấm Trà",
    "am chen": "Ấm Trà",
    "bộ ấm chén": "Ấm Trà",
    "ly tách": "Ly & Tách",
    "ly tach": "Ly & Tách",
    "cốc": "Ly & Tách",
    "cốc cafe": "Ly & Tách",
    "nồi chảo": "Nồi & Chảo",
    "noi chao": "Nồi & Chảo",
    "nồi đất": "Nồi & Chảo",
    "noi dat": "Nồi & Chảo"
};

/**
 * Cloud Function phục vụ Dynamic Open Graph & Schema.org JSON-LD cho chi tiết sản phẩm và các biến thể
 */
exports.productDetail = onRequest(async (req, res) => {
    const productId = req.query.id;
    const color = req.query.color;
    const pattern = req.query.pattern;
    const combo = req.query.combo;

    // Đọc file template HTML
    let templateHtml = '';
    try {
        templateHtml = fs.readFileSync(path.join(__dirname, 'templates/product.html'), 'utf8');
    } catch (e) {
        try {
            templateHtml = fs.readFileSync(path.join(__dirname, '../product/index.html'), 'utf8');
        } catch (_) {
            templateHtml = '';
        }
    }

    if (!productId || !templateHtml) {
        if (templateHtml) {
            res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
            return res.status(200).send(templateHtml);
        }
        return res.status(302).redirect('/products/');
    }

    try {
        let docSnap = await db.collection('products').doc(productId).get();
        if (!docSnap.exists) {
            const slugSnap = await db.collection('products').where('slug', '==', productId).limit(1).get();
            if (!slugSnap.empty) {
                docSnap = slugSnap.docs[0];
            }
        }
        if (!docSnap.exists) {
            res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
            return res.status(200).send(templateHtml);
        }

        const resolvedProductId = docSnap.id;
        const p = docSnap.data();
        let displayImg = null;
        let titleParts = [p.name || 'Sản phẩm gốm'];
        let descParts = [];

        // 1. Kiểm tra Combo variant
        if (combo && Array.isArray(p.comboVariants)) {
            const cv = p.comboVariants.find(v => (v.name || v) === combo);
            if (cv) {
                if (cv.imageUrl) displayImg = cv.imageUrl;
                titleParts.push(`Phân loại: ${cv.name}`);
                descParts.push(`Phân loại: ${cv.name}`);
            }
        }

        // 2. Kiểm tra Color variant
        if (color && Array.isArray(p.colorVariants)) {
            const c = p.colorVariants.find(v => (v.name || v) === color);
            if (c) {
                const cImg = c.imageUrl || c.thumbUrl || c.image;
                if (cImg && !displayImg) displayImg = cImg;
                titleParts.push(`Màu: ${c.name}`);
                descParts.push(`Màu: ${c.name}`);
            }
        }

        // 3. Kiểm tra Pattern variant
        if (pattern && Array.isArray(p.patternVariants)) {
            const pat = p.patternVariants.find(v => (v.name || v) === pattern);
            if (pat) {
                const patImg = pat.imageUrl || pat.thumbUrl || pat.image;
                if (patImg && !displayImg) displayImg = patImg;
                titleParts.push(`Họa tiết: ${pat.name}`);
                descParts.push(`Họa tiết: ${pat.name}`);
            }
        }

        // Fallback ảnh chính của sản phẩm
        if (!displayImg) {
            displayImg = p.imageUrl || (p.additionalImages && p.additionalImages[0]) || 'https://tiemnhagom.vn/Asset/images/hero-bg.jpg';
        }

        // Tính giá hiển thị
        let price = p.salePrice || p.price || 0;
        if (color && Array.isArray(p.colorVariants)) {
            const c = p.colorVariants.find(v => (v.name || v) === color);
            if (c && (c.salePrice || c.price)) price = c.salePrice || c.price;
        }
        if (price > 0) {
            descParts.push(`Giá: ${new Intl.NumberFormat('vi-VN').format(price)}₫`);
        }

        const baseDesc = (p.description || 'Chi tiết sản phẩm gốm sứ thủ công nghệ thuật tại Tiệm Nhà Gốm. Nơi mang hơi thở của đất và lửa vào không gian sống của bạn.').replace(/<[^>]*>?/gm, '').substring(0, 140);
        if (baseDesc) descParts.push(baseDesc);

        const hasVariantQuery = Boolean(combo || color || pattern);
        const customSeoTitle = p.seoTitle && String(p.seoTitle).trim();
        const pageTitle = (!hasVariantQuery && customSeoTitle)
            ? customSeoTitle
            : (hasVariantQuery && customSeoTitle
                ? `${customSeoTitle.replace(/\s*\|\s*Tiệm Nhà Gốm\s*$/i, '')} - ${titleParts.slice(1).join(' - ')} | Tiệm Nhà Gốm`
                : `${titleParts.join(' - ')} | Tiệm Nhà Gốm`);

        const customSeoDesc = p.seoDescription && String(p.seoDescription).trim();
        const pageDescription = (!hasVariantQuery && customSeoDesc)
            ? customSeoDesc
            : descParts.join(' • ');

        const defaultCanonicalUrl = `https://tiemnhagom.vn/product/index.html?id=${encodeURIComponent(resolvedProductId)}${color ? `&color=${encodeURIComponent(color)}` : ''}${pattern ? `&pattern=${encodeURIComponent(pattern)}` : ''}${combo ? `&combo=${encodeURIComponent(combo)}` : ''}`;
        const canonicalUrl = (!hasVariantQuery && p.seoCanonical && String(p.seoCanonical).trim())
            ? String(p.seoCanonical).trim()
            : defaultCanonicalUrl;

        const ogAltText = (p.imageAlt && String(p.imageAlt).trim()) || pageTitle;
        const combinedKeywords = [p.seoFocusKeyword, p.seoKeywords].map(v => (v || '').trim()).filter(Boolean).join(', ');
        const robotsValue = (p.seoNoIndex || p.isHidden || p.isOnlyEvent) ? 'noindex, nofollow' : 'index, follow';

        const escapeAttr = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = templateHtml;

        // Cập nhật title
        html = html.replace(/<title>.*?<\/title>/i, () => `<title>${escapeAttr(pageTitle)}</title>`);
        
        // Cập nhật canonical link
        html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, () => `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">`);

        // Cập nhật / Thay thế meta tags
        const updateOrInsertMeta = (nameOrProperty, key, content) => {
            const regex = new RegExp(`<meta\\s+${nameOrProperty}=["']${key}["'][^>]*>`, 'gi');
            const newTag = `<meta ${nameOrProperty}="${key}" content="${escapeAttr(content)}">`;
            if (regex.test(html)) {
                html = html.replace(regex, () => newTag);
            } else {
                html = html.replace('</head>', () => `  ${newTag}\n</head>`);
            }
        };

        updateOrInsertMeta('name', 'description', pageDescription);
        if (combinedKeywords) {
            updateOrInsertMeta('name', 'keywords', combinedKeywords);
        }
        updateOrInsertMeta('name', 'robots', robotsValue);
        updateOrInsertMeta('property', 'og:type', 'product');
        updateOrInsertMeta('property', 'og:site_name', 'Tiệm Nhà Gốm');
        updateOrInsertMeta('property', 'og:title', pageTitle);
        updateOrInsertMeta('property', 'og:description', pageDescription);
        updateOrInsertMeta('property', 'og:image', displayImg);
        updateOrInsertMeta('property', 'og:image:secure_url', displayImg);
        updateOrInsertMeta('property', 'og:image:alt', ogAltText);
        updateOrInsertMeta('property', 'og:url', canonicalUrl);
        updateOrInsertMeta('property', 'og:locale', 'vi_VN');

        updateOrInsertMeta('name', 'twitter:card', 'summary_large_image');
        updateOrInsertMeta('name', 'twitter:title', pageTitle);
        updateOrInsertMeta('name', 'twitter:description', pageDescription);
        updateOrInsertMeta('name', 'twitter:image', displayImg);

        if (price > 0) {
            updateOrInsertMeta('property', 'product:price:amount', String(price));
            updateOrInsertMeta('property', 'product:price:currency', 'VND');
        }

        // Schema.org Structured Data: Product & BreadcrumbList
        let parentCat = null;
        let childCat = null;
        if (p.category) {
            const catInfo = CATEGORY_SEO_DATA[p.category];
            if (catInfo) {
                if (catInfo.isParent) {
                    parentCat = catInfo.name;
                } else {
                    parentCat = catInfo.parent;
                    childCat = catInfo.name;
                }
            } else {
                parentCat = p.category;
            }
        }

        const breadcrumbItems = [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Trang chủ",
                "item": "https://tiemnhagom.vn/"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "Sản phẩm",
                "item": "https://tiemnhagom.vn/products/"
            }
        ];

        let curPos = 3;
        if (parentCat) {
            breadcrumbItems.push({
                "@type": "ListItem",
                "position": curPos++,
                "name": parentCat,
                "item": `https://tiemnhagom.vn/products/?category=${toCategorySlug(parentCat)}`
            });
        }
        if (childCat) {
            breadcrumbItems.push({
                "@type": "ListItem",
                "position": curPos++,
                "name": childCat,
                "item": `https://tiemnhagom.vn/products/?category=${toCategorySlug(childCat)}`
            });
        }
        breadcrumbItems.push({
            "@type": "ListItem",
            "position": curPos,
            "name": p.name || 'Sản phẩm',
            "item": canonicalUrl
        });

        const allImages = [displayImg];
        if (Array.isArray(p.additionalImages)) {
            p.additionalImages.forEach(img => {
                if (img && !allImages.includes(img)) allImages.push(img);
            });
        }

        const productSchema = {
            "@type": "Product",
            "@id": canonicalUrl + "#product",
            "name": pageTitle.replace(/ \| Tiệm Nhà Gốm$/, ''),
            "image": allImages,
            "description": pageDescription || baseDesc,
            "sku": resolvedProductId,
            "mpn": resolvedProductId,
            "brand": {
                "@type": "Brand",
                "name": "Tiệm Nhà Gốm"
            },
            "category": p.category || (parentCat || "Gốm sứ thủ công"),
            "offers": {
                "@type": "Offer",
                "url": canonicalUrl,
                "priceCurrency": "VND",
                "price": price || 0,
                "priceValidUntil": "2027-12-31",
                "itemCondition": "https://schema.org/NewCondition",
                "availability": (p.stock === undefined || p.stock > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                "seller": {
                    "@type": "Organization",
                    "name": "Tiệm Nhà Gốm"
                }
            },
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "5.0",
                "reviewCount": "18"
            }
        };
        if (combinedKeywords) {
            productSchema.keywords = combinedKeywords;
        }

        const schemaGraph = [
            productSchema,
            {
                "@type": "BreadcrumbList",
                "@id": canonicalUrl + "#breadcrumb",
                "itemListElement": breadcrumbItems
            }
        ];

        const jsonLdScript = `\n  <script type="application/ld+json">\n${JSON.stringify({ "@context": "https://schema.org", "@graph": schemaGraph }, null, 2)}\n  </script>\n`;
        html = html.replace('</head>', `${jsonLdScript}</head>`);

        // Set CDN cache header (60s browser, 10 phút CDN)
        res.set('Cache-Control', 'public, max-age=60, s-maxage=600');
        res.status(200).send(html);

    } catch (error) {
        console.error('Lỗi nạp metadata sản phẩm:', error);
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
        res.status(200).send(templateHtml);
    }
});

/**
 * Cloud Function phục vụ Dynamic SEO cho trang Tất cả sản phẩm & Danh mục cha / Danh mục con
 */
exports.productsList = onRequest(async (req, res) => {
    let templateHtml = '';
    try {
        templateHtml = fs.readFileSync(path.join(__dirname, 'templates/products.html'), 'utf8');
    } catch (e) {
        try {
            templateHtml = fs.readFileSync(path.join(__dirname, '../products/index.html'), 'utf8');
        } catch (_) {
            templateHtml = '';
        }
    }

    if (!templateHtml) {
        return res.status(500).send('Lỗi máy chủ');
    }

    let catQuery = req.query.category || req.query.cat || '';
    if (catQuery) {
        try {
            catQuery = decodeURIComponent(catQuery).trim();
        } catch (_) {}
    }

    // Kiểm tra alias tìm kiếm (ví dụ: "bình hoa" -> "Lọ Hoa Nghệ Thuật", "chén bát" -> "Bát & Chén", "dia-an-decor" -> "Dĩa & Khay")
    const lowerCat = catQuery.toLowerCase();
    const catSlug = toCategorySlug(catQuery);
    if (CATEGORY_SEARCH_ALIASES[lowerCat]) {
        catQuery = CATEGORY_SEARCH_ALIASES[lowerCat];
    } else if (CATEGORY_SEARCH_ALIASES[catSlug]) {
        catQuery = CATEGORY_SEARCH_ALIASES[catSlug];
    }

    // Tìm dữ liệu SEO phù hợp (hỗ trợ cả slug lẫn tên tiếng Việt có dấu)
    let catData = CATEGORY_SEO_DATA[catQuery];
    if (!catData && catQuery) {
        const matchedKey = Object.keys(CATEGORY_SEO_DATA).find(k => k.toLowerCase() === lowerCat || toCategorySlug(k) === catSlug);
        if (matchedKey) catData = CATEGORY_SEO_DATA[matchedKey];
    }

    let pageTitle = 'Tất cả sản phẩm - Tiệm Nhà Gốm';
    let pageDescription = 'Khám phá bộ sưu tập gốm thủ công tinh xảo và hoa tươi nghệ thuật tại Tiệm Nhà Gốm. Tìm kiếm món đồ mang linh hồn cho không gian của bạn với đa dạng sản phẩm từ bình hoa, chén bát đến đồ trang trí.';
    let h1Text = 'sản phẩm';
    let canonicalUrl = 'https://tiemnhagom.vn/products/';

    if (catData) {
        pageTitle = catData.title;
        pageDescription = catData.description;
        h1Text = catData.h1;
        canonicalUrl = `https://tiemnhagom.vn/products/?category=${toCategorySlug(catData.name)}`;
    } else if (catQuery) {
        pageTitle = `${catQuery} | Tiệm Nhà Gốm - Gốm Sứ & Decor Thủ Công`;
        pageDescription = `Khám phá bộ sưu tập ${catQuery.toLowerCase()} tinh tế tại Tiệm Nhà Gốm. Sản phẩm gốm mộc vuốt tay thủ công chất lượng cao cho không gian sống.`;
        h1Text = catQuery.toLowerCase();
        canonicalUrl = `https://tiemnhagom.vn/products/?category=${toCategorySlug(catQuery)}`;
    }

    const escapeAttr = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = templateHtml;

    // Cập nhật title
    html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeAttr(pageTitle)}</title>`);

    // Cập nhật canonical link
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">`);

    // Cập nhật thẻ H1 trong banner
    html = html.replace(/<h1 id="hero-banner-title"[^>]*>.*?<\/h1>/i, `<h1 id="hero-banner-title" style="color: #fff; font-size: 1.4rem; font-weight: 600; letter-spacing: 1px; text-transform: lowercase; z-index: 10;">${escapeAttr(h1Text)}</h1>`);

    // Cập nhật / Thêm thẻ meta tags
    const updateOrInsertMeta = (nameOrProperty, key, content) => {
        const regex = new RegExp(`<meta\\s+${nameOrProperty}=["']${key}["'][^>]*>`, 'gi');
        const newTag = `<meta ${nameOrProperty}="${key}" content="${escapeAttr(content)}">`;
        if (regex.test(html)) {
            html = html.replace(regex, newTag);
        } else {
            html = html.replace('</head>', `  ${newTag}\n</head>`);
        }
    };

    updateOrInsertMeta('name', 'description', pageDescription);
    updateOrInsertMeta('property', 'og:type', 'website');
    updateOrInsertMeta('property', 'og:site_name', 'Tiệm Nhà Gốm');
    updateOrInsertMeta('property', 'og:title', pageTitle);
    updateOrInsertMeta('property', 'og:description', pageDescription);
    updateOrInsertMeta('property', 'og:url', canonicalUrl);
    updateOrInsertMeta('property', 'og:image', 'https://tiemnhagom.vn/Asset/images/hero-bg.jpg');
    updateOrInsertMeta('property', 'og:locale', 'vi_VN');

    updateOrInsertMeta('name', 'twitter:card', 'summary_large_image');
    updateOrInsertMeta('name', 'twitter:title', pageTitle);
    updateOrInsertMeta('name', 'twitter:description', pageDescription);
    updateOrInsertMeta('name', 'twitter:image', 'https://tiemnhagom.vn/Asset/images/hero-bg.jpg');

    // Schema.org CollectionPage & BreadcrumbList
    const breadcrumbItems = [
        {
            "@type": "ListItem",
            "position": 1,
            "name": "Trang chủ",
            "item": "https://tiemnhagom.vn/"
        },
        {
            "@type": "ListItem",
            "position": 2,
            "name": "Sản phẩm",
            "item": "https://tiemnhagom.vn/products/"
        }
    ];

    if (catData) {
        if (!catData.isParent && catData.parent) {
            breadcrumbItems.push({
                "@type": "ListItem",
                "position": 3,
                "name": catData.parent,
                "item": `https://tiemnhagom.vn/products/?category=${toCategorySlug(catData.parent)}`
            });
            breadcrumbItems.push({
                "@type": "ListItem",
                "position": 4,
                "name": catData.name,
                "item": canonicalUrl
            });
        } else {
            breadcrumbItems.push({
                "@type": "ListItem",
                "position": 3,
                "name": catData.name,
                "item": canonicalUrl
            });
        }
    }

    const schemaGraph = [
        {
            "@type": "CollectionPage",
            "@id": canonicalUrl + "#webpage",
            "url": canonicalUrl,
            "name": pageTitle,
            "description": pageDescription,
            "isPartOf": {
                "@type": "WebSite",
                "@id": "https://tiemnhagom.vn/#website",
                "name": "Tiệm Nhà Gốm",
                "url": "https://tiemnhagom.vn/"
            }
        },
        {
            "@type": "BreadcrumbList",
            "@id": canonicalUrl + "#breadcrumb",
            "itemListElement": breadcrumbItems
        }
    ];

    const jsonLdScript = `\n  <script type="application/ld+json">\n${JSON.stringify({ "@context": "https://schema.org", "@graph": schemaGraph }, null, 2)}\n  </script>\n`;
    html = html.replace('</head>', `${jsonLdScript}</head>`);

    res.set('Cache-Control', 'public, max-age=60, s-maxage=600');
    res.status(200).send(html);
});

/**
 * Cloud Function cung cấp Dynamic XML Sitemap cho toàn bộ sản phẩm trên Firestore
 * Tự động cập nhật tức thời khi có sản phẩm mới hoặc thay đổi
 */
exports.sitemapProducts = onRequest(async (req, res) => {
    const escapeXml = (str) => String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    try {
        const snap = await db.collection('products').get();
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

        snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.isHidden || data.isOnlyEvent || data.seoNoIndex) return;

            const productId = doc.id;
            const customCanonical = (data.seoCanonical && String(data.seoCanonical).trim()) || '';
            const locUrl = customCanonical.startsWith('https://tiemnhagom.vn/')
                ? customCanonical
                : `https://tiemnhagom.vn/product/index.html?id=${encodeURIComponent(productId)}`;

            let dateStr = '2026-10-27';
            if (data.updatedAt) {
                try {
                    const d = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
                    dateStr = d.toISOString().split('T')[0];
                } catch (_) {}
            }

            xml += '  <url>\n';
            xml += `    <loc>${escapeXml(locUrl)}</loc>\n`;
            xml += `    <lastmod>${dateStr}</lastmod>\n`;
            xml += '    <changefreq>weekly</changefreq>\n';
            xml += '    <priority>0.8</priority>\n';

            const img = data.imageUrl ? String(data.imageUrl).trim() : '';
            if (img.startsWith('https://')) {
                const imgTitle = (data.imageAlt && String(data.imageAlt).trim()) || data.name || 'Tiệm Nhà Gốm';
                xml += '    <image:image>\n';
                xml += `      <image:loc>${escapeXml(img)}</image:loc>\n`;
                xml += `      <image:title>${escapeXml(imgTitle)}</image:title>\n`;
                xml += '    </image:image>\n';
            }
            xml += '  </url>\n';
        });

        xml += '</urlset>';

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.status(200).send(xml);
    } catch (e) {
        console.error('Lỗi xuất sitemap products:', e);
        res.status(500).send('Lỗi máy chủ');
    }
});

/**
 * Cloud Function phục vụ SSR SEO cho trang chi tiết bài viết Blog (/blog/<slug> hoặc /blog/article.html?id=...)
 */
exports.articleDetail = onRequest(async (req, res) => {
    let templateHtml = '';
    try {
        templateHtml = fs.readFileSync(path.join(__dirname, 'templates/article.html'), 'utf8');
    } catch (e) {
        try {
            templateHtml = fs.readFileSync(path.join(__dirname, '../blog/article.html'), 'utf8');
        } catch (_) {
            templateHtml = '';
        }
    }

    if (!templateHtml) {
        return res.status(500).send('Lỗi máy chủ');
    }

    let rawKey = req.query.id ? String(req.query.id).trim() : '';
    const reqPathClean = String(req.path || req.originalUrl || '').split('?')[0];
    if (!rawKey) {
        const match = reqPathClean.match(/\/blog\/(.+)$/i);
        if (match && match[1]) {
            const candidate = match[1].replace(/^\/+|\/+$/g, '').trim();
            if (candidate && candidate !== 'article.html' && candidate !== 'index.html') {
                try { rawKey = decodeURIComponent(candidate); } catch (_) { rawKey = candidate; }
            }
        }
    }

    if (!rawKey) {
        return res.redirect(301, '/blog/');
    }

    const escapeAttr = (str) => String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const toDateObj = (val) => {
        if (!val) return null;
        try {
            if (typeof val.toDate === 'function') {
                const d = val.toDate();
                return d && !isNaN(d.getTime()) ? d : null;
            }
            if (typeof val.seconds === 'number') {
                const d = new Date(val.seconds * 1000);
                return !isNaN(d.getTime()) ? d : null;
            }
            if (typeof val._seconds === 'number') {
                const d = new Date(val._seconds * 1000);
                return !isNaN(d.getTime()) ? d : null;
            }
            const d = new Date(val);
            return !isNaN(d.getTime()) ? d : null;
        } catch (_) {
            return null;
        }
    };

    try {
        let docSnap = await db.collection('news').doc(rawKey).get();
        if (!docSnap.exists) {
            const slugSnap = await db.collection('news').where('slug', '==', rawKey).limit(1).get();
            if (!slugSnap.empty) {
                docSnap = slugSnap.docs[0];
            }
        }

        if (!docSnap.exists || docSnap.data().status !== 'published') {
            let notFoundHtml = templateHtml;
            notFoundHtml = notFoundHtml.replace(/<title>.*?<\/title>/i, () => '<title>Không tìm thấy bài viết | Tiệm Nhà Gốm</title>');
            notFoundHtml = notFoundHtml.replace('</head>', () => '  <meta name="robots" content="noindex, nofollow">\n</head>');
            notFoundHtml = notFoundHtml.replace(
                /<div class="article-main-content" id="article-main">[\s\S]*?<\/div>\s*(?=<aside class="article-sidebar">)/i,
                () => `<div class="article-main-content" id="article-main" data-ssr-hydrated="1">\n                <div style="text-align:center; padding: 60px 20px;">\n                    <h1 style="font-family: var(--font-serif); margin-bottom: 12px;">Bài viết không tồn tại hoặc chưa được xuất bản</h1>\n                    <p style="color: #666; margin-bottom: 24px;">Nội dung bạn tìm kiếm hiện không khả dụng.</p>\n                    <a href="/blog/" class="article-back-btn">&larr; QUAY TRỞ LẠI "Blog"</a>\n                </div>\n            </div>\n            `
            );
            res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
            return res.status(404).send(notFoundHtml);
        }

        const n = docSnap.data();
        const articleId = docSnap.id;
        const articleSlug = (n.slug && String(n.slug).trim()) ? String(n.slug).trim() : articleId;

        if (reqPathClean.endsWith('/article.html') && req.query.id && /^[a-z0-9-]+$/i.test(articleSlug)) {
            return res.redirect(301, `/blog/${encodeURIComponent(articleSlug)}`);
        }

        const createdDate = toDateObj(n.createdAt);
        const updatedDate = toDateObj(n.updatedAt) || createdDate;
        const dateDisplay = createdDate ? createdDate.toLocaleDateString('vi-VN') : '';
        const dateIso = createdDate ? createdDate.toISOString() : '';
        const updatedIso = updatedDate ? updatedDate.toISOString() : dateIso;
        const author = String(n.author || n.authorName || n.createdByName || '').trim() || 'Tiệm Nhà Gốm';
        const initialViews = Math.max(0, Number(n.views) || 0);

        const seoTitle = (n.seoTitle && String(n.seoTitle).trim())
            ? String(n.seoTitle).trim()
            : `${n.title || 'Bài viết'} | Tiệm Nhà Gốm`;
        const plainBody = n.content
            ? String(n.content).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim()
            : '';
        const wordCount = plainBody ? plainBody.split(/\s+/).filter(Boolean).length : 0;
        const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));
        const helpfulYes = Math.max(0, Number(n.helpfulYes) || 0);
        const helpfulNo = Math.max(0, Number(n.helpfulNo) || 0);
        const rawTagCandidates = [n.seoFocusKeyword, n.seoKeywords]
            .map(v => String(v || ''))
            .join(',')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        const seenTagSet = new Set();
        const articleTags = [];
        for (const t of rawTagCandidates) {
            const k = t.toLowerCase();
            if (!seenTagSet.has(k)) {
                seenTagSet.add(k);
                articleTags.push(t);
                if (articleTags.length >= 10) break;
            }
        }
        const tagsHtml = articleTags.length > 0
            ? `<div id="article-tags-container" class="article-tags-section"><span class="article-tags-label">Chủ đề:</span><div class="article-tags-list">${articleTags.map(t => `<a href="/blog/?q=${encodeURIComponent(t)}" class="article-tag-chip">#${escapeAttr(t)}</a>`).join('')}</div></div>`
            : `<div id="article-tags-container" class="article-tags-section" hidden></div>`;
        const seoDesc = (n.seoDescription && String(n.seoDescription).trim())
            || (n.excerpt && String(n.excerpt).trim())
            || (plainBody ? plainBody.substring(0, 155) + (plainBody.length > 155 ? '...' : '') : 'Khám phá câu chuyện gốm thủ công tại Tiệm Nhà Gốm.');
        const canonicalUrl = (n.seoCanonical && String(n.seoCanonical).trim())
            ? String(n.seoCanonical).trim()
            : `https://tiemnhagom.vn/blog/${encodeURIComponent(articleSlug)}`;
        const imageUrl = (n.imageUrl && String(n.imageUrl).trim()) || 'https://tiemnhagom.vn/Asset/images/hero-bg.jpg';
        const coverAlt = (n.coverAlt && String(n.coverAlt).trim()) || (n.title || 'Bài viết Tiệm Nhà Gốm');
        const combinedKeywords = [n.seoFocusKeyword, n.seoKeywords]
            .map(v => (v || '').trim())
            .filter(Boolean)
            .join(', ');
        const robotsValue = n.seoNoIndex ? 'noindex, nofollow' : 'index, follow';

        const urlStr = encodeURIComponent(canonicalUrl);
        const encodedTitle = encodeURIComponent(seoTitle);

        let html = templateHtml;
        html = html.replace(/<title>.*?<\/title>/i, () => `<title>${escapeAttr(seoTitle)}</title>`);
        html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, () => `<meta name="description" content="${escapeAttr(seoDesc)}">`);
        html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, () => `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">`);

        const blogSchema = {
            "@type": "BlogPosting",
            "@id": canonicalUrl + "#article",
            "headline": n.title || seoTitle,
            "description": seoDesc,
            "image": imageUrl ? [imageUrl] : undefined,
            "author": {
                "@type": "Person",
                "name": author
            },
            "publisher": {
                "@type": "Organization",
                "name": "Tiệm Nhà Gốm",
                "logo": {
                    "@type": "ImageObject",
                    "url": "https://tiemnhagom.vn/Asset/images/logo.webp"
                }
            },
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": canonicalUrl
            }
        };
        if (dateIso) blogSchema.datePublished = dateIso;
        if (updatedIso) blogSchema.dateModified = updatedIso;
        if (combinedKeywords) blogSchema.keywords = combinedKeywords;

        const breadcrumbSchema = {
            "@type": "BreadcrumbList",
            "@id": canonicalUrl + "#breadcrumb",
            "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": "https://tiemnhagom.vn/" },
                { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://tiemnhagom.vn/blog/" },
                { "@type": "ListItem", "position": 3, "name": n.title || seoTitle, "item": canonicalUrl }
            ]
        };

        const headTags = [
            combinedKeywords ? `<meta name="keywords" content="${escapeAttr(combinedKeywords)}">` : '',
            `<meta name="robots" content="${robotsValue}">`,
            `<meta property="og:type" content="article">`,
            `<meta property="og:site_name" content="Tiệm Nhà Gốm">`,
            `<meta property="og:url" content="${escapeAttr(canonicalUrl)}">`,
            `<meta property="og:title" content="${escapeAttr(seoTitle)}">`,
            `<meta property="og:description" content="${escapeAttr(seoDesc)}">`,
            `<meta property="og:image" content="${escapeAttr(imageUrl)}">`,
            `<meta property="og:locale" content="vi_VN">`,
            dateIso ? `<meta property="article:published_time" content="${escapeAttr(dateIso)}">` : '',
            updatedIso ? `<meta property="article:modified_time" content="${escapeAttr(updatedIso)}">` : '',
            `<meta property="article:author" content="${escapeAttr(author)}">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${escapeAttr(seoTitle)}">`,
            `<meta name="twitter:description" content="${escapeAttr(seoDesc)}">`,
            `<meta name="twitter:image" content="${escapeAttr(imageUrl)}">`,
            `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [blogSchema, breadcrumbSchema] }).replace(/</g, '\\u003c')}</script>`,
            `<script>window.__TNG_SSR_ARTICLE_ID__ = ${JSON.stringify(articleId).replace(/</g, '\\u003c')};</script>`
        ].filter(Boolean).join('\n    ');

        html = html.replace('</head>', () => `    ${headTags}\n</head>`);

        const breadcrumbHtml = `
            <div id="breadcrumb-container" data-ssr-hydrated="1">
                <div class="article-breadcrumb">
                    <a href="/">Trang chủ</a> <span class="separator">›</span>
                    <a href="/blog/">Blog</a> <span class="separator">›</span>
                    <span class="current">${escapeAttr(n.title || '')}</span>
                </div>
            </div>`;
        html = html.replace(/<div id="breadcrumb-container"><\/div>/i, () => breadcrumbHtml.trim());

        const ssrMainHtml = `
            <div class="article-main-content" id="article-main" data-ssr-hydrated="1">
                <article>
                    <div class="article-header">
                        <h1 class="article-title">${escapeAttr(n.title || '')}</h1>
                        <div class="article-meta-row">
                            <div class="article-meta-info">${dateDisplay ? `${escapeAttr(dateDisplay)} | ` : ''}Tác giả: <strong>${escapeAttr(author)}</strong> <span class="article-meta-sep" aria-hidden="true">·</span> <span class="article-read-time">~${readingMinutes} phút đọc</span> <span class="article-meta-sep" aria-hidden="true">·</span> <span class="article-views-badge" id="article-views-badge" title="Lượt xem bài viết (cập nhật realtime)"><svg class="article-views-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span id="article-views-count">${initialViews.toLocaleString('vi-VN')}</span> lượt xem</span></div>
                            <div class="article-share">
                                <span>Chia sẻ</span>
                                <a href="https://www.facebook.com/sharer/sharer.php?u=${urlStr}" target="_blank" rel="noopener" title="Chia sẻ qua Facebook">
                                    <svg width="16" height="16" viewBox="0 0 320 512"><path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/></svg>
                                </a>
                                <a href="https://www.linkedin.com/sharing/share-offsite/?url=${urlStr}" target="_blank" rel="noopener" title="Chia sẻ qua LinkedIn">
                                    <svg width="16" height="16" viewBox="0 0 448 512"><path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z"/></svg>
                                </a>
                                <a href="https://twitter.com/intent/tweet?url=${urlStr}&text=${encodedTitle}" target="_blank" rel="noopener" title="Chia sẻ qua Twitter">
                                    <svg width="16" height="16" viewBox="0 0 512 512"><path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/></svg>
                                </a>
                                <button type="button" onclick="window.copyArticleLink && window.copyArticleLink()" title="Sao chép liên kết">
                                    <svg width="16" height="16" viewBox="0 0 640 512"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114l-114 114c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5l114-114c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(coverAlt)}" class="article-cover">
                    <div id="article-toc-mobile" class="article-toc-mobile" hidden></div>
                    <div class="ql-snow">
                        <div class="ql-editor" style="padding: 0;">
                            ${n.content || ''}
                        </div>
                    </div>
                    ${tagsHtml}
                    <div class="article-feedback-container">
                        <div class="feedback-question">Bạn có hài lòng với bài viết này không ?</div>
                        <button type="button" class="feedback-btn" data-feedback="yes" onclick="window.submitFeedback && window.submitFeedback(true, this)"><i class="ti ti-mood-heart"></i> Hài lòng <span class="feedback-count" id="feedback-yes-count">${helpfulYes}</span></button>
                        <button type="button" class="feedback-btn" data-feedback="no" onclick="window.submitFeedback && window.submitFeedback(false, this)"><i class="ti ti-mood-sad"></i> Không hài lòng <span class="feedback-count" id="feedback-no-count">${helpfulNo}</span></button>
                    </div>
                    <div id="article-prev-next" class="article-prev-next" hidden></div>
                    <a href="/blog/" class="article-back-btn">&larr; QUAY TRỞ LẠI "Blog"</a>
                </article>
            </div>`;

        html = html.replace(
            /<div class="article-main-content" id="article-main">[\s\S]*?<\/div>\s*(?=<aside class="article-sidebar">)/i,
            () => `${ssrMainHtml.trim()}\n            `
        );

        res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
        return res.status(200).send(html);
    } catch (error) {
        console.error('Lỗi SSR bài viết:', error);
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
        return res.status(200).send(templateHtml);
    }
});

/**
 * Cloud Function cung cấp Dynamic XML Sitemap cho toàn bộ bài viết Blog đã xuất bản
 */
exports.sitemapArticles = onRequest(async (req, res) => {
    const escapeXml = (str) => String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const extractMs = (val) => {
        if (!val) return 0;
        try {
            if (typeof val.toDate === 'function') return val.toDate().getTime() || 0;
            if (typeof val.seconds === 'number') return val.seconds * 1000;
            if (typeof val._seconds === 'number') return val._seconds * 1000;
            const ms = new Date(val).getTime();
            return isNaN(ms) ? 0 : ms;
        } catch (_) {
            return 0;
        }
    };

    try {
        const snap = await db.collection('news').where('status', '==', 'published').get();
        const publishedDocs = snap.docs
            .map(docSnap => ({ id: docSnap.id, data: docSnap.data() }))
            .filter(item => !item.data.seoNoIndex)
            .sort((a, b) => {
                const ta = extractMs(a.data.updatedAt) || extractMs(a.data.createdAt);
                const tb = extractMs(b.data.updatedAt) || extractMs(b.data.createdAt);
                return tb - ta;
            });

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

        publishedDocs.forEach(({ id, data }) => {
            const slug = (data.slug && String(data.slug).trim()) ? String(data.slug).trim() : id;
            const customCanonical = (data.seoCanonical && String(data.seoCanonical).trim()) || '';
            const locUrl = (customCanonical.startsWith('https://tiemnhagom.vn/'))
                ? customCanonical
                : `https://tiemnhagom.vn/blog/${encodeURIComponent(slug)}`;

            const modMs = extractMs(data.updatedAt) || extractMs(data.createdAt);
            const dateStr = modMs > 0 ? new Date(modMs).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            xml += '  <url>\n';
            xml += `    <loc>${escapeXml(locUrl)}</loc>\n`;
            xml += `    <lastmod>${dateStr}</lastmod>\n`;
            xml += '    <changefreq>weekly</changefreq>\n';
            xml += '    <priority>0.85</priority>\n';

            const img = data.imageUrl ? String(data.imageUrl).trim() : '';
            if (img.startsWith('https://')) {
                const imgTitle = (data.coverAlt && String(data.coverAlt).trim()) || data.title || 'Tiệm Nhà Gốm';
                xml += '    <image:image>\n';
                xml += `      <image:loc>${escapeXml(img)}</image:loc>\n`;
                xml += `      <image:title>${escapeXml(imgTitle)}</image:title>\n`;
                xml += '    </image:image>\n';
            }
            xml += '  </url>\n';
        });

        xml += '</urlset>';

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=1800, s-maxage=7200');
        return res.status(200).send(xml);
    } catch (e) {
        console.error('Lỗi xuất sitemap articles:', e);
        return res.status(500).send('Lỗi máy chủ');
    }
});

// --- VNPAY INTEGRATION ---

const VNP_TMN_CODE = '0AS8YQYG';
const VNP_HASH_SECRET = 'UQPWQRISTNFVFCTYTPLBUSYIAOXRESOL';
const VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const VNP_RETURN_URL = process.env.VNP_RETURN_URL || 'https://tiemnhagom.vn/cart/thank-you.html';

function sortObject(obj) {
    let sorted = {};
    let str = [];
    let key;
    for (key in obj){
        if (obj.hasOwnProperty(key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}

exports.createVNPayUrl = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const { orderId, amount, orderInfo } = data || {};

    if (!orderId || !amount) {
        throw new HttpsError("invalid-argument", "Thiếu mã đơn hàng hoặc số tiền.");
    }

    try {
        let ipAddr = request.rawRequest ? request.rawRequest.headers['x-forwarded-for'] : '127.0.0.1';
        if (ipAddr && ipAddr.includes(',')) {
            ipAddr = ipAddr.split(',')[0]; // Lấy IP đầu tiên nếu có nhiều IP
        }

        const date = new Date();
        // Format date to YYYYMMDDHHmmss in Vietnam timezone
        const vnTime = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        const pad = (n) => String(n).padStart(2, '0');
        const createDate = `${vnTime.getUTCFullYear()}${pad(vnTime.getUTCMonth() + 1)}${pad(vnTime.getUTCDate())}${pad(vnTime.getUTCHours())}${pad(vnTime.getUTCMinutes())}${pad(vnTime.getUTCSeconds())}`;
        
        // Hết hạn sau 15 phút
        const expireTime = new Date(vnTime.getTime() + (15 * 60 * 1000));
        const vnp_ExpireDate = `${expireTime.getUTCFullYear()}${pad(expireTime.getUTCMonth() + 1)}${pad(expireTime.getUTCDate())}${pad(expireTime.getUTCHours())}${pad(expireTime.getUTCMinutes())}${pad(expireTime.getUTCSeconds())}`;

        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = VNP_TMN_CODE;
        // Số tiền VNPay yêu cầu nhân 100
        vnp_Params['vnp_Amount'] = Math.round(amount * 100); 
        vnp_Params['vnp_CreateDate'] = createDate;
        vnp_Params['vnp_CurrCode'] = 'VND';
        vnp_Params['vnp_IpAddr'] = ipAddr;
        vnp_Params['vnp_Locale'] = 'vn';
        vnp_Params['vnp_OrderInfo'] = orderInfo || `Thanh toan don hang ${orderId}`;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_ReturnUrl'] = VNP_RETURN_URL;
        
        // Thêm timestamp để tránh lỗi trùng vnp_TxnRef khi thanh toán lại nhiều lần
        vnp_Params['vnp_TxnRef'] = `${orderId}_${Date.now()}`;
        vnp_Params['vnp_ExpireDate'] = vnp_ExpireDate;

        vnp_Params = sortObject(vnp_Params);

        const signData = querystring.stringify(vnp_Params, '&', '=', { encodeURIComponent: (str) => str });
        const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 
        vnp_Params['vnp_SecureHash'] = signed;

        const vnpUrl = VNP_URL + '?' + querystring.stringify(vnp_Params, '&', '=', { encodeURIComponent: (str) => str });

        return { success: true, url: vnpUrl };
    } catch (error) {
        console.error("Lỗi tạo URL VNPay:", error);
        throw new HttpsError("internal", error.message);
    }
});

exports.vnpayIpn = onRequest(async (req, res) => {
    try {
        let vnp_Params = req.query;
        const secureHash = vnp_Params['vnp_SecureHash'];
        
        let txnRef = vnp_Params['vnp_TxnRef'];
        let orderId = txnRef.split('_')[0]; // Tách lấy mã đơn hàng gốc
        let rspCode = vnp_Params['vnp_ResponseCode'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        
        const signData = querystring.stringify(vnp_Params, '&', '=', { encodeURIComponent: (str) => str });
        const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     
        
        if (secureHash === signed) {
            // Lấy đơn hàng từ Firestore
            const orderRef = db.collection('orders').doc(orderId);
            const orderSnap = await orderRef.get();
            
            if (!orderSnap.exists) {
                return res.status(200).json({RspCode: '01', Message: 'Order not found'});
            }
            
            const orderData = orderSnap.data();
            
            // Kiểm tra số tiền (VNPay gửi số tiền * 100)
            const checkAmount = Math.round(orderData.totalAmount * 100);
            if (checkAmount !== parseInt(vnp_Params['vnp_Amount'])) {
                return res.status(200).json({RspCode: '04', Message: 'Invalid amount'});
            }
            
            // Kiểm tra trạng thái đơn hàng (chỉ xử lý nếu đang chờ thanh toán)
            if (orderData.status !== 'Chờ thanh toán') {
                return res.status(200).json({RspCode: '02', Message: 'Order already confirmed'});
            }

            if (rspCode === '00') {
                // Thanh toán thành công
                await orderRef.update({ 
                    status: 'Đã thanh toán', 
                    paymentInfo: vnp_Params 
                });
                return res.status(200).json({RspCode: '00', Message: 'Confirm Success'});
            } else {
                // Thanh toán thất bại hoặc hủy -> Hủy đơn và cộng lại tồn kho
                await db.runTransaction(async (transaction) => {
                    // 1. Đọc dữ liệu đơn hàng và sản phẩm trước (ALL READS FIRST)
                    const latestOrderSnap = await transaction.get(orderRef);
                    if (!latestOrderSnap.exists || latestOrderSnap.data().status !== 'Chờ thanh toán') {
                        return; // Đã xử lý
                    }

                    const productSnapshots = [];
                    if (orderData.items && Array.isArray(orderData.items)) {
                        for (const item of orderData.items) {
                            if (!item.id) continue;
                            const productRef = db.collection('products').doc(item.id);
                            const pSnap = await transaction.get(productRef);
                            if (pSnap.exists) {
                                productSnapshots.push({ item, productRef, pSnap, isChild: false });
                            }
                        }
                    }

                    // Lượt 2: Tìm các sản phẩm con của combo để hoàn lại tồn kho và giảm số đã bán
                    const initialVnPayLen = productSnapshots.length;
                    for (let i = 0; i < initialVnPayLen; i++) {
                        const { item, pSnap } = productSnapshots[i];
                        const pData = pSnap.data() || {};
                        if (pData.isCombo && Array.isArray(pData.comboVariants)) {
                            const cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                            const cv = pData.comboVariants.find(v => v.name === cName) || (pData.comboVariants.length === 1 ? pData.comboVariants[0] : null);
                            if (cv && Array.isArray(cv.items)) {
                                const parentQty = Number(item.quantity) || 1;
                                for (const child of cv.items) {
                                    if (!child.id) continue;
                                    const childRef = db.collection('products').doc(child.id);
                                    const childSnap = await transaction.get(childRef);
                                    if (childSnap.exists) {
                                        const childQty = parentQty * Math.max(1, parseInt(child.quantity, 10) || 1);
                                        productSnapshots.push({
                                            item: {
                                                id: child.id,
                                                quantity: childQty,
                                                color: child.selectedColor || null,
                                                pattern: child.selectedPattern || null
                                            },
                                            productRef: childRef,
                                            pSnap: childSnap,
                                            isChild: true
                                        });
                                    }
                                }
                            }
                        }
                    }

                    // 2. Thực hiện tất cả các thao tác ghi (ALL WRITES AFTER READS)
                    // Cập nhật trạng thái
                    transaction.update(orderRef, { status: 'Đã hủy', cancelReason: 'Thanh toán VNPay thất bại/hủy' });

                    // Trả lại tồn kho
                    for (const { item, productRef, pSnap } of productSnapshots) {
                        const pData = pSnap.data();
                        let updateData = {
                            sold: admin.firestore.FieldValue.increment(-item.quantity)
                        };

                        if (!pData.isCombo) {
                            updateData.stock = admin.firestore.FieldValue.increment(item.quantity);
                        }

                        if (item.color && Array.isArray(pData.colorVariants)) {
                            const updatedColorVariants = pData.colorVariants.map(v => {
                                if (v.name === item.color) return { ...v, stock: (v.stock || 0) + item.quantity, sold: Math.max(0, (Number(v.sold) || 0) - item.quantity) };
                                return v;
                            });
                            updateData.colorVariants = updatedColorVariants;
                        }
                        if (item.pattern && Array.isArray(pData.patternVariants)) {
                            const updatedPatternVariants = pData.patternVariants.map(v => {
                                if (v.name === item.pattern) return { ...v, stock: (v.stock || 0) + item.quantity, sold: Math.max(0, (Number(v.sold) || 0) - item.quantity) };
                                return v;
                            });
                            updateData.patternVariants = updatedPatternVariants;
                        }

                        if (pData.isCombo && Array.isArray(pData.comboVariants) && pData.comboVariants.length > 0) {
                            const cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                            updateData.comboVariants = pData.comboVariants.map(v => {
                                if (v.name === cName || (pData.comboVariants.length === 1)) {
                                    return { ...v, sold: Math.max(0, (Number(v.sold) || 0) - item.quantity) };
                                }
                                return v;
                            });
                        }
                        
                        transaction.update(productRef, updateData);
                    }
                });
                
                return res.status(200).json({RspCode: '00', Message: 'Confirm Success'});
            }
        } else {
            return res.status(200).json({RspCode: '97', Message: 'Checksum failed'});
        }
    } catch (error) {
        console.error("Lỗi IPN VNPay:", error);
        res.status(200).json({RspCode: '99', Message: 'Unknown error'});
    }
});

// --- CANCEL ORDER SECURE ---
exports.cancelOrderSecure = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const { orderId } = data || {};
    const uid = request.auth ? request.auth.uid : null;

    if (!orderId || !uid) {
        throw new HttpsError("invalid-argument", "Thiếu mã đơn hàng hoặc chưa đăng nhập.");
    }

    try {
        const result = await db.runTransaction(async (transaction) => {
            // 1. GIAI ĐOẠN ĐỌC (ALL READS FIRST)
            const orderRef = db.collection('orders').doc(orderId);
            const orderSnap = await transaction.get(orderRef);
            
            if (!orderSnap.exists) {
                throw new HttpsError("not-found", "Không tìm thấy đơn hàng.");
            }
            
            const orderData = orderSnap.data();
            
            // Chỉ người tạo đơn hoặc admin mới được hủy
            const userRef = db.collection('users').doc(uid);
            const userSnap = await transaction.get(userRef);
            const isAdmin = userSnap.exists && userSnap.data().role === 'admin';
            
            if (orderData.userId !== uid && !isAdmin) {
                throw new HttpsError("permission-denied", "Không có quyền hủy đơn hàng này.");
            }

            if (orderData.status === 'Đã hủy') {
                throw new HttpsError("failed-precondition", "Đơn hàng đã được hủy trước đó.");
            }

            if (orderData.status === 'Đã hoàn thành') {
                throw new HttpsError("failed-precondition", "Không thể hủy đơn hàng đã hoàn thành.");
            }

            // Đọc tồn kho tất cả sản phẩm liên quan (bao gồm cả sản phẩm con của combo)
            const productSnapshots = [];
            if (orderData.items && Array.isArray(orderData.items)) {
                for (const item of orderData.items) {
                    if (!item.id) continue;
                    const productRef = db.collection('products').doc(item.id);
                    const pSnap = await transaction.get(productRef);
                    if (pSnap.exists) {
                        productSnapshots.push({ item, productRef, pSnap, isChild: false });
                    }
                }
            }

            // Lượt 2: Tìm các sản phẩm con của combo để hoàn lại tồn kho và giảm số đã bán
            const initialCancelLen = productSnapshots.length;
            for (let i = 0; i < initialCancelLen; i++) {
                const { item, pSnap } = productSnapshots[i];
                const pData = pSnap.data() || {};
                if (pData.isCombo && Array.isArray(pData.comboVariants)) {
                    const cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                    const cv = pData.comboVariants.find(v => v.name === cName) || (pData.comboVariants.length === 1 ? pData.comboVariants[0] : null);
                    if (cv && Array.isArray(cv.items)) {
                        const parentQty = Number(item.quantity) || 1;
                        for (const child of cv.items) {
                            if (!child.id) continue;
                            const childRef = db.collection('products').doc(child.id);
                            const childSnap = await transaction.get(childRef);
                            if (childSnap.exists) {
                                const childQty = parentQty * Math.max(1, parseInt(child.quantity, 10) || 1);
                                productSnapshots.push({
                                    item: {
                                        id: child.id,
                                        quantity: childQty,
                                        color: child.selectedColor || null,
                                        pattern: child.selectedPattern || null
                                    },
                                    productRef: childRef,
                                    pSnap: childSnap,
                                    isChild: true
                                });
                            }
                        }
                    }
                }
            }

            // 2. GIAI ĐOẠN GHI (ALL WRITES AFTER READS)
            // Đổi trạng thái đơn hàng
            transaction.update(orderRef, { 
                status: 'Đã hủy', 
                canceledBy: uid, 
                canceledAt: new Date().toISOString() 
            });

            // Cộng lại tồn kho
            for (const { item, productRef, pSnap } of productSnapshots) {
                const pData = pSnap.data();
                const itemQty = Number(item.quantity) || 1;
                let updateData = {
                    sold: admin.firestore.FieldValue.increment(-itemQty)
                };

                if (!pData.isCombo) {
                    updateData.stock = admin.firestore.FieldValue.increment(itemQty);
                }

                if (item.color && Array.isArray(pData.colorVariants)) {
                    const updatedColorVariants = pData.colorVariants.map(v => {
                        if (v.name === item.color) return { ...v, stock: (Number(v.stock) || 0) + itemQty, sold: Math.max(0, (Number(v.sold) || 0) - itemQty) };
                        return v;
                    });
                    updateData.colorVariants = updatedColorVariants;
                }
                if (item.pattern && Array.isArray(pData.patternVariants)) {
                    const updatedPatternVariants = pData.patternVariants.map(v => {
                        if (v.name === item.pattern) return { ...v, stock: (Number(v.stock) || 0) + itemQty, sold: Math.max(0, (Number(v.sold) || 0) - itemQty) };
                        return v;
                    });
                    updateData.patternVariants = updatedPatternVariants;
                }

                if (pData.isCombo && Array.isArray(pData.comboVariants) && pData.comboVariants.length > 0) {
                    const cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                    updateData.comboVariants = pData.comboVariants.map(v => {
                        if (v.name === cName || (pData.comboVariants.length === 1)) {
                            return { ...v, sold: Math.max(0, (Number(v.sold) || 0) - itemQty) };
                        }
                        return v;
                    });
                }
                
                transaction.update(productRef, updateData);
            }
            
            return { success: true, message: "Hủy đơn hàng thành công và đã hoàn lại tồn kho." };
        });
        
        return result;
    } catch (error) {
        console.error("Lỗi cancelOrderSecure:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});


// =========================================================================
// HỆ THỐNG BACKGROUND PUSH NOTIFICATIONS (EXPO PUSH API - APNS / FCM)
// Gửi thông báo đến thiết bị kể cả khi ứng dụng đã tắt hẳn (Kill app)
// =========================================================================

/**
 * Gửi thông báo đẩy qua Expo Push Notification API
 */
async function sendExpoPushNotification(token, title, body, dataPayload = {}) {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.trim();
    if (!cleanToken.startsWith('ExponentPushToken[') && !cleanToken.startsWith('ExpoPushToken[')) {
        functions.logger.warn(`Push token không hợp lệ (không phải Expo token): ${cleanToken}`);
        return null;
    }

    try {
        const payload = {
            to: cleanToken,
            sound: 'default',
            title,
            body,
            data: dataPayload,
            priority: 'high',
            channelId: 'default',
            badge: 1,
        };

        const response = await axios.post('https://exp.host/--/api/v2/push/send', payload, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            timeout: 8000,
        });

        functions.logger.info(`Đã gửi Push Notification thành công tới ${cleanToken}:`, response.data);
        return response.data;
    } catch (err) {
        functions.logger.error(`Lỗi gửi Expo Push Notification tới ${cleanToken}:`, err.message);
        return null;
    }
}

/**
 * Tìm token thông báo của khách hàng từ userId hoặc số điện thoại
 */
async function findUserPushToken(userId, phone) {
    if (userId && userId !== 'guest') {
        try {
            const uSnap = await db.collection('users').doc(userId).get();
            if (uSnap.exists) {
                const uData = uSnap.data();
                if (uData.expoPushToken) return uData.expoPushToken;
                if (uData.mergedTo && uData.mergedTo !== userId) {
                    const parentSnap = await db.collection('users').doc(uData.mergedTo).get();
                    if (parentSnap.exists && parentSnap.data().expoPushToken) {
                        return parentSnap.data().expoPushToken;
                    }
                }
            }
        } catch (e) {
            functions.logger.warn(`Lỗi tìm token theo userId ${userId}:`, e.message);
        }
    }

    if (phone) {
        try {
            const cleanPhone = phone.replace(/\D/g, '');
            const phoneVariants = [
                cleanPhone,
                cleanPhone.startsWith('84') ? '0' + cleanPhone.slice(2) : cleanPhone,
                cleanPhone.startsWith('0') ? '84' + cleanPhone.slice(1) : '+84' + cleanPhone,
                cleanPhone.startsWith('0') ? '+84' + cleanPhone.slice(1) : cleanPhone,
            ];

            for (const p of phoneVariants) {
                const querySnap = await db.collection('users').where('phone', '==', p).limit(1).get();
                if (!querySnap.empty) {
                    const token = querySnap.docs[0].data().expoPushToken;
                    if (token) return token;
                }
            }
        } catch (e) {
            functions.logger.warn(`Lỗi tìm token theo phone ${phone}:`, e.message);
        }
    }

    return null;
}

/**
 * 1. Tự động gửi Push Notification khi Đơn hàng thay đổi trạng thái
 * (Admin duyệt, Shipper đang giao, Đã giao thành công, Đã hủy, v.v.)
 */
exports.onOrderStatusPushNotification = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const orderId = context.params.orderId;
        const beforeData = change.before.data();
        const afterData = change.after.data();

        const oldStatus = (beforeData.status || '').trim();
        const newStatus = (afterData.status || '').trim();

        // Chỉ gửi khi trạng thái thực sự thay đổi
        if (oldStatus.toLowerCase() === newStatus.toLowerCase()) {
            return null;
        }

        const token = await findUserPushToken(
            afterData.userId || afterData.customerId,
            afterData.shippingAddress?.phone
        );

        if (!token) {
            functions.logger.info(`Đơn hàng #${orderId}: Không tìm thấy expoPushToken của khách để gửi push.`);
            return null;
        }

        const statusLower = newStatus.toLowerCase();
        let title = 'Cập nhật trạng thái đơn hàng 📦';
        let body = `Đơn hàng #${orderId} của bạn vừa chuyển sang trạng thái: "${newStatus}".`;

        if (statusLower.includes('đang giao') || statusLower.includes('vận chuyển') || statusLower.includes('shipping')) {
            title = 'Đơn hàng đang trên đường giao đến bạn 🚚';
            body = `Đơn hàng #${orderId} đang được vận chuyển. Bạn chú ý điện thoại để nhận đồ gốm từ shipper nhé!`;
        } else if (statusLower.includes('hoàn thành') || statusLower.includes('thành công') || statusLower.includes('completed') || statusLower.includes('đã giao')) {
            title = 'Đơn hàng đã giao thành công! 🎉';
            body = `Đơn hàng #${orderId} đã hoàn tất. Điểm Gốm tích lũy đã được cộng vào tài khoản của bạn.`;
        } else if (statusLower.includes('đã xác nhận') || statusLower.includes('confirmed')) {
            title = 'Đơn hàng đã được xác nhận ✅';
            body = `Tiệm Nhà Gốm đã xác nhận đơn #${orderId} và đang đóng gói cẩn thận cho bạn.`;
        } else if (statusLower.includes('hủy') || statusLower.includes('cancel')) {
            title = 'Đơn hàng đã bị hủy ⚠️';
            const reason = afterData.cancelReason ? ` Lý do: ${afterData.cancelReason}` : '';
            body = `Đơn hàng #${orderId} đã bị hủy.${reason} Liên hệ Tiệm nếu bạn cần hỗ trợ thêm.`;
        } else if (statusLower.includes('đã thanh toán') || statusLower.includes('paid')) {
            title = 'Thanh toán thành công 💳';
            body = `Tiệm đã nhận được thanh toán cho đơn hàng #${orderId}. Cảm ơn bạn!`;
        }

        return sendExpoPushNotification(token, title, body, {
            type: 'order',
            orderId,
            status: newStatus,
            url: `/order-detail?id=${orderId}`,
        });
    });

/**
 * 2. Tự động gửi Push Notification khi khách hàng đặt hàng thành công
 */
exports.onOrderCreatedPushNotification = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        const orderId = context.params.orderId;
        const orderData = snap.data();

        const token = await findUserPushToken(
            orderData.userId || orderData.customerId,
            orderData.shippingAddress?.phone
        );

        if (!token) return null;

        const totalFormatted = new Intl.NumberFormat('vi-VN').format(orderData.totalAmount || 0) + 'đ';
        const title = 'Đặt hàng thành công! 🎉';
        const body = `Cảm ơn bạn! Đơn hàng #${orderId} trị giá ${totalFormatted} đã được ghi nhận. Tiệm đang chuẩn bị đóng gói.`;

        return sendExpoPushNotification(token, title, body, {
            type: 'order',
            orderId,
            url: `/order-detail?id=${orderId}`,
        });
    });

/**
 * 3. Tự động gửi Push Notification khi có bạn bè gửi quà tặng Điểm Gốm
 */
exports.onPointGiftCreatedPushNotification = functions.firestore
    .document('points_gifts/{giftCode}')
    .onCreate(async (snap, context) => {
        const giftCode = context.params.giftCode;
        const giftData = snap.data();

        if (!giftData.recipientPhone) return null;

        const token = await findUserPushToken(null, giftData.recipientPhone);
        if (!token) {
            functions.logger.info(`Quà tặng #${giftCode}: Không tìm thấy token của người nhận với SĐT ${giftData.recipientPhone}.`);
            return null;
        }

        const sender = giftData.senderName || 'Một người bạn';
        const points = giftData.points || 0;
        const title = 'Bạn nhận được một món quà Điểm Gốm! 🎁';
        const body = `${sender} vừa gửi tặng bạn +${points} Điểm Gốm cùng lời nhắn thân thương. Mở app để nhận ngay!`;

        return sendExpoPushNotification(token, title, body, {
            type: 'gift',
            giftCode,
            url: `/gift-claim?code=${giftCode}`,
        });
    });


/**
 * 4. Kiểm tra và đồng bộ số lượng đã bán (sold) cho các sản phẩm con trong combo từ lịch sử đơn hàng
 * Gọi qua HTTP GET/POST:
 * - Chế độ kiểm tra (Dry-run): /syncComboSoldHistory?key=tiemnhagom_admin_sync
 * - Chế độ thực thi cập nhật: /syncComboSoldHistory?key=tiemnhagom_admin_sync&apply=true
 */
exports.syncComboSoldHistory = onRequest({ cors: true, timeoutSeconds: 300, memory: '512MiB' }, async (req, res) => {
    try {
        const adminKey = req.query.key;
        if (adminKey !== 'tiemnhagom_admin_sync') {
            return res.status(403).json({ error: 'Unauthorized: sai khoa bao mat' });
        }

        const isApply = req.query.apply === 'true';

        // 1. Tải toàn bộ products vào RAM
        const productsSnap = await db.collection('products').get();
        const productsMap = {};
        const comboProducts = [];

        productsSnap.forEach(docSnap => {
            const data = docSnap.data();
            productsMap[docSnap.id] = { id: docSnap.id, ...data };
            if (data.isCombo || data.productType === 'combo' || (Array.isArray(data.comboVariants) && data.comboVariants.length > 0)) {
                comboProducts.push({ id: docSnap.id, name: data.name, sold: data.sold || 0, comboVariants: data.comboVariants || [] });
            }
        });

        // 2. Tải toàn bộ orders hợp lệ (không bị hủy)
        const ordersSnap = await db.collection('orders').get();
        const validOrders = [];
        const comboSales = {}; // comboId -> { name, totalSold, variants: { variantName: count } }
        const childProductsSoldMap = {}; // childId -> { name, currentSold, soldFromCombos, colorVariants: {}, patternVariants: {}, combosContributing: [] }

        ordersSnap.forEach(docSnap => {
            const order = docSnap.data();
            const status = (order.status || '').trim().toLowerCase();
            if (status.includes('hủy') || status.includes('cancel')) {
                return; // Bỏ qua đơn đã hủy
            }
            validOrders.push({ id: docSnap.id, status: order.status, itemsCount: (order.items || []).length });

            if (Array.isArray(order.items)) {
                for (const item of order.items) {
                    if (item.isChild) continue; // Bỏ qua nếu là món con đã bị thêm trùng lặp
                    const pId = String(item.id || item.productId).trim();
                    const product = productsMap[pId];
                    if (!product) continue;

                    const isCombo = product.isCombo || product.productType === 'combo' || (Array.isArray(product.comboVariants) && product.comboVariants.length > 0);
                    if (!isCombo) continue;

                    const qty = Number(item.quantity) || 1;
                    if (!comboSales[pId]) {
                        comboSales[pId] = {
                            id: pId,
                            name: product.name,
                            totalSold: 0,
                            variants: {}
                        };
                    }
                    comboSales[pId].totalSold += qty;

                    // Xác định biến thể combo
                    let cName = item.comboVariant || item.combo || (typeof item.variant === 'string' ? item.variant : (item.variant && item.variant.name));
                    if (!cName && Array.isArray(product.comboVariants) && product.comboVariants.length === 1) {
                        cName = product.comboVariants[0].name;
                    }

                    if (cName) {
                        comboSales[pId].variants[cName] = (comboSales[pId].variants[cName] || 0) + qty;
                    }

                    // Tìm các món con trong biến thể
                    let cv = null;
                    if (Array.isArray(product.comboVariants)) {
                        cv = product.comboVariants.find(v => v.name === cName) || (product.comboVariants.length === 1 ? product.comboVariants[0] : null);
                    }

                    if (cv && Array.isArray(cv.items)) {
                        for (const child of cv.items) {
                            if (!child.id) continue;
                            const childId = String(child.id).trim();
                            const childProduct = productsMap[childId];
                            const childName = childProduct?.name || child.name || childId;
                            const childQtyPerCombo = Math.max(1, parseInt(child.quantity, 10) || 1);
                            const totalChildQty = qty * childQtyPerCombo;

                            if (!childProductsSoldMap[childId]) {
                                childProductsSoldMap[childId] = {
                                    id: childId,
                                    name: childName,
                                    currentSold: Number(childProduct?.sold) || 0,
                                    soldFromCombos: 0,
                                    colorVariants: {},
                                    patternVariants: {},
                                    combosContributing: []
                                };
                            }

                            childProductsSoldMap[childId].soldFromCombos += totalChildQty;
                            childProductsSoldMap[childId].combosContributing.push({
                                orderId: docSnap.id,
                                comboName: product.name,
                                variantName: cName || 'Mặc định',
                                qtySold: totalChildQty
                            });

                            if (child.selectedColor) {
                                childProductsSoldMap[childId].colorVariants[child.selectedColor] = 
                                    (childProductsSoldMap[childId].colorVariants[child.selectedColor] || 0) + totalChildQty;
                            }
                            if (child.selectedPattern) {
                                childProductsSoldMap[childId].patternVariants[child.selectedPattern] = 
                                    (childProductsSoldMap[childId].patternVariants[child.selectedPattern] || 0) + totalChildQty;
                            }
                        }
                    }
                }
            }
        });

        // 3. Nếu apply === true, tiến hành cập nhật Firestore
        const updateResults = [];
        if (isApply) {
            const batch = db.batch();
            for (const childId of Object.keys(childProductsSoldMap)) {
                const info = childProductsSoldMap[childId];
                const childProduct = productsMap[childId];
                if (!childProduct) continue;

                const pRef = db.collection('products').doc(childId);
                const updatePayload = {
                    sold: admin.firestore.FieldValue.increment(info.soldFromCombos)
                };

                if (Array.isArray(childProduct.colorVariants) && Object.keys(info.colorVariants).length > 0) {
                    updatePayload.colorVariants = childProduct.colorVariants.map(v => {
                        const addQty = info.colorVariants[v.name] || 0;
                        return addQty > 0 ? { ...v, sold: (Number(v.sold) || 0) + addQty } : v;
                    });
                }

                if (Array.isArray(childProduct.patternVariants) && Object.keys(info.patternVariants).length > 0) {
                    updatePayload.patternVariants = childProduct.patternVariants.map(v => {
                        const addQty = info.patternVariants[v.name] || 0;
                        return addQty > 0 ? { ...v, sold: (Number(v.sold) || 0) + addQty } : v;
                    });
                }

                batch.update(pRef, updatePayload);
                updateResults.push({
                    id: childId,
                    name: info.name,
                    previousSold: info.currentSold,
                    addedFromCombos: info.soldFromCombos,
                    newEstimatedSold: info.currentSold + info.soldFromCombos
                });
            }
            await batch.commit();
        }

        return res.status(200).json({
            success: true,
            mode: isApply ? 'APPLIED (Đã cập nhật Firestore thành công)' : 'DRY_RUN (Kiểm tra xem trước, chưa sửa dữ liệu)',
            stats: {
                totalOrdersScanned: ordersSnap.size,
                validNonCancelledOrders: validOrders.length,
                comboProductsCount: comboProducts.length,
                childProductsAffectedCount: Object.keys(childProductsSoldMap).length
            },
            comboProductsFound: comboProducts.map(c => ({ id: c.id, name: c.name, sold: c.sold, variantsCount: c.comboVariants.length })),
            comboSalesFromOrders: comboSales,
            childProductsToSync: childProductsSoldMap,
            updateResults: isApply ? updateResults : 'Gọi lại với tham số &apply=true để áp dụng cập nhật vào Firestore.'
        });
    } catch (error) {
        console.error('Lỗi syncComboSoldHistory:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// TRỢ LÝ AI TƯ VẤN MUA GỐM (BẢO MẬT GEMINI API KEY PHÍA SERVER)
// ==========================================
exports.aiChat = onRequest(
    {
        region: 'us-central1',
        cors: true,
        timeoutSeconds: 30,
        memory: '256MiB'
    },
    createAiChatHandler(db)
);
