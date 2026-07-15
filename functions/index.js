const functions = require('firebase-functions/v1');
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const kiotviet = require('./kiotviet');
const axios = require('axios');

// Initialize Firebase Admin SDK if not already initialized
admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

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

                const isValid = (!expiryDate || expiryDate >= today) && 
                                (coupon.limit === 0 || (coupon.usedCount || 0) < coupon.limit) &&
                                (applicableSubtotal >= (coupon.minOrder || 0)) &&
                                (!coupon.category || coupon.category === 'all' || applicableSubtotal > 0);

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
            
            // Cập nhật kho cho từng sản phẩm
            for (const item of orderItems) {
                const pRef = db.collection("products").doc(item.id);
                const pSnap = await transaction.get(pRef);
                const pData = pSnap.data();

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
        const totalAmount = orderData.totalAmount || 0;
        const shippingFee = orderData.shippingFee || 0;
        const discountAmount = orderData.discountAmount || 0;
        const membershipDiscount = orderData.membershipDiscount || 0;
        
        let itemsList = '';
        if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items.forEach((item, index) => {
                itemsList += `${index + 1}. ${item.name} ${item.variant && item.variant !== 'null' ? `(${item.variant})` : ''} - SL: ${item.quantity} - Giá: ${new Intl.NumberFormat('vi-VN').format(item.price)}đ\n`;
            });
        }

        // Tính tạm tính trước khi trừ đi phí ship và giảm giá
        const tempTotal = totalAmount - shippingFee + discountAmount + membershipDiscount;

        const message = `
📦 <b>CÓ ĐƠN HÀNG MỚI</b> 📦
<b>Mã đơn:</b> #${orderId}

👤 <b>Thông tin khách hàng:</b>
- Tên: ${customerName}
- SĐT: ${customerPhone}
- Email: ${customerEmail}
- Địa chỉ: ${address}

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
