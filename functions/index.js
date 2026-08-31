const functions = require('firebase-functions/v1');
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const kiotviet = require('./kiotviet');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');

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
        
        let itemsList = '';
        if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items.forEach((item, index) => {
                itemsList += `${index + 1}. ${item.name} ${item.variant && item.variant !== 'null' ? `(${item.variant})` : ''} (Mã: ${item.id}) - SL: ${item.quantity} - Giá: ${new Intl.NumberFormat('vi-VN').format(item.price)}đ\n`;
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
                    rentalItemsList += `${index + 1}. ${item.name} (Mã: ${item.id}) - SL: ${item.quantity} - Giá thuê: ${new Intl.NumberFormat('vi-VN').format(item.rentalPrice || 0)}đ\n`;
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
        redirectUrl = 'https://tiemnhagom.vn/product/index.html?id=' + id;
    } else if (type === 'news') {
        collectionName = 'news';
        redirectUrl = 'https://tiemnhagom.vn/blog/article.html?id=' + id;
    } else {
        return res.status(400).send('Type không hợp lệ');
    }

    try {
        const docSnap = await db.collection(collectionName).doc(id).get();
        if (!docSnap.exists) {
            return res.status(404).send('Không tìm thấy dữ liệu');
        }

        const data = docSnap.data();
        const title = data.name || data.title || 'Tiệm Nhà Gốm';
        const imageUrl = data.imageUrl || data.image || data.thumbUrl || '';
        let description = data.excerpt || 'Khám phá tại Tiệm Nhà Gốm';
        
        if (data.content && !data.excerpt) {
            description = data.content.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...';
        }

        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <meta property="og:type" content="website">
    <meta property="og:url" content="${redirectUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${redirectUrl}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${imageUrl}">
    
    <script>
        window.location.replace('${redirectUrl}');
    </script>
</head>
<body>
    <p>Đang chuyển hướng...</p>
    <p><a href="${redirectUrl}">Bấm vào đây nếu trình duyệt không tự chuyển hướng</a></p>
</body>
</html>`;

        res.status(200).send(html);
    } catch (error) {
        console.error('Lỗi tạo share link:', error);
        res.status(500).send('Lỗi máy chủ');
    }
});

// --- VNPAY INTEGRATION ---

const VNP_TMN_CODE = '0AS8YQYG';
const VNP_HASH_SECRET = 'UQPWQRISTNFVFCTYTPLBUSYIAOXRESOL';
const VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const VNP_RETURN_URL = 'http://127.0.0.1:5500/cart/thank-you.html'; // Đổi sang localhost để test

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
