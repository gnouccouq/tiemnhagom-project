const functions = require('firebase-functions/v1');
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const kiotviet = require('./kiotviet');
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
                productSnapshots.push({ item, pRef, pSnap });
            }

            // 2. Thực hiện tất cả các thao tác ghi (ALL WRITES AFTER READS)
            // Cập nhật kho cho từng sản phẩm
            for (const { item, pRef, pSnap } of productSnapshots) {
                const pData = pSnap.data() || {};

                let updateData = {
                    stock: admin.firestore.FieldValue.increment(-item.quantity),
                    sold: admin.firestore.FieldValue.increment(item.quantity)
                };

                // Nếu khách hàng có chọn biến thể màu sắc, cập nhật kho riêng của biến thể đó
                if (item.color && pData.colorVariants) {
                    const updatedVariants = pData.colorVariants.map(v => {
                        if (v.name === item.color) {
                            return { ...v, stock: (v.stock || 0) - item.quantity };
                        }
                        return v;
                    });
                    updateData.colorVariants = updatedVariants;
                }

                // Cập nhật kho riêng của biến thể họa tiết
                if (item.pattern && pData.patternVariants) {
                    const updatedPatternVariants = pData.patternVariants.map(v => {
                        if (v.name === item.pattern) {
                            return { ...v, stock: (v.stock || 0) - item.quantity };
                        }
                        return v;
                    });
                    updateData.patternVariants = updatedPatternVariants;
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
            title = `${variantTitleParts.join(' - ')} | Tiệm Nhà Gốm`;

            let price = data.salePrice || data.price || 0;
            if (color && Array.isArray(data.colorVariants)) {
                const c = data.colorVariants.find(v => (v.name || v) === color);
                if (c && (c.salePrice || c.price)) price = c.salePrice || c.price;
            }
            if (price > 0) {
                description = `Giá: ${new Intl.NumberFormat('vi-VN').format(price)}₫ • ` + description;
            }
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
    
    <meta property="og:type" content="${type === 'product' ? 'product' : 'website'}">
    <meta property="og:site_name" content="Tiệm Nhà Gốm">
    <meta property="og:url" content="${escapeAttr(redirectUrl)}">
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
        const docSnap = await db.collection('products').doc(productId).get();
        if (!docSnap.exists) {
            res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
            return res.status(200).send(templateHtml);
        }

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

        const pageTitle = `${titleParts.join(' - ')} | Tiệm Nhà Gốm`;
        const pageDescription = descParts.join(' • ');
        const canonicalUrl = `https://tiemnhagom.vn/product/index.html?id=${encodeURIComponent(productId)}${color ? `&color=${encodeURIComponent(color)}` : ''}${pattern ? `&pattern=${encodeURIComponent(pattern)}` : ''}${combo ? `&combo=${encodeURIComponent(combo)}` : ''}`;

        const escapeAttr = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = templateHtml;

        // Cập nhật title
        html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeAttr(pageTitle)}</title>`);
        
        // Cập nhật canonical link
        html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">`);

        // Cập nhật / Thay thế meta tags
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
        updateOrInsertMeta('property', 'og:type', 'product');
        updateOrInsertMeta('property', 'og:site_name', 'Tiệm Nhà Gốm');
        updateOrInsertMeta('property', 'og:title', pageTitle);
        updateOrInsertMeta('property', 'og:description', pageDescription);
        updateOrInsertMeta('property', 'og:image', displayImg);
        updateOrInsertMeta('property', 'og:image:secure_url', displayImg);
        updateOrInsertMeta('property', 'og:image:alt', pageTitle);
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
                "item": `https://tiemnhagom.vn/products/?category=${encodeURIComponent(parentCat)}`
            });
        }
        if (childCat) {
            breadcrumbItems.push({
                "@type": "ListItem",
                "position": curPos++,
                "name": childCat,
                "item": `https://tiemnhagom.vn/products/?category=${encodeURIComponent(childCat)}`
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
            "description": baseDesc,
            "sku": productId,
            "mpn": productId,
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

    // Kiểm tra alias tìm kiếm (ví dụ: "bình hoa" -> "Lọ Hoa Nghệ Thuật", "chén bát" -> "Bát & Chén")
    const lowerCat = catQuery.toLowerCase();
    if (CATEGORY_SEARCH_ALIASES[lowerCat]) {
        catQuery = CATEGORY_SEARCH_ALIASES[lowerCat];
    }

    // Tìm dữ liệu SEO phù hợp
    let catData = CATEGORY_SEO_DATA[catQuery];
    if (!catData && catQuery) {
        const matchedKey = Object.keys(CATEGORY_SEO_DATA).find(k => k.toLowerCase() === lowerCat);
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
        canonicalUrl = `https://tiemnhagom.vn/products/?category=${encodeURIComponent(catData.name)}`;
    } else if (catQuery) {
        pageTitle = `${catQuery} | Tiệm Nhà Gốm - Gốm Sứ & Decor Thủ Công`;
        pageDescription = `Khám phá bộ sưu tập ${catQuery.toLowerCase()} tinh tế tại Tiệm Nhà Gốm. Sản phẩm gốm mộc vuốt tay thủ công chất lượng cao cho không gian sống.`;
        h1Text = catQuery.toLowerCase();
        canonicalUrl = `https://tiemnhagom.vn/products/?category=${encodeURIComponent(catQuery)}`;
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
                "item": `https://tiemnhagom.vn/products/?category=${encodeURIComponent(catData.parent)}`
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
    try {
        const snap = await db.collection('products').get();
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.isHidden || data.isOnlyEvent) return;

            const productId = doc.id;
            let dateStr = '2026-10-27';
            if (data.updatedAt) {
                try {
                    const d = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
                    dateStr = d.toISOString().split('T')[0];
                } catch (_) {}
            }

            xml += '  <url>\n';
            xml += `    <loc>https://tiemnhagom.vn/product/index.html?id=${encodeURIComponent(productId)}</loc>\n`;
            xml += `    <lastmod>${dateStr}</lastmod>\n`;
            xml += '    <changefreq>weekly</changefreq>\n';
            xml += '    <priority>0.8</priority>\n';
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
                                productSnapshots.push({ item, productRef, pSnap });
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
                                if (v.name === item.color) return { ...v, stock: (v.stock || 0) + item.quantity };
                                return v;
                            });
                            updateData.colorVariants = updatedColorVariants;
                        }
                        if (item.pattern && Array.isArray(pData.patternVariants)) {
                            const updatedPatternVariants = pData.patternVariants.map(v => {
                                if (v.name === item.pattern) return { ...v, stock: (v.stock || 0) + item.quantity };
                                return v;
                            });
                            updateData.patternVariants = updatedPatternVariants;
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

            // Đọc tồn kho tất cả sản phẩm liên quan
            const productSnapshots = [];
            if (orderData.items && Array.isArray(orderData.items)) {
                for (const item of orderData.items) {
                    if (!item.id) continue;
                    const productRef = db.collection('products').doc(item.id);
                    const pSnap = await transaction.get(productRef);
                    if (pSnap.exists) {
                        productSnapshots.push({ item, productRef, pSnap });
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
                        if (v.name === item.color) return { ...v, stock: (Number(v.stock) || 0) + itemQty };
                        return v;
                    });
                    updateData.colorVariants = updatedColorVariants;
                }
                if (item.pattern && Array.isArray(pData.patternVariants)) {
                    const updatedPatternVariants = pData.patternVariants.map(v => {
                        if (v.name === item.pattern) return { ...v, stock: (Number(v.stock) || 0) + itemQty };
                        return v;
                    });
                    updateData.patternVariants = updatedPatternVariants;
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
