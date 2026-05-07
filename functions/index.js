const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
admin.initializeApp();
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
exports.createOrderSecure = functions.https
    .schedule('0 0 * * *')
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
    onCall(async (data, context) => {
        // 1. Authentication Check (Optional, depending on if guests can order)
        const uid = context.auth ? context.auth.uid : 'guest';
        const { items, couponCode, shippingAddress, paymentMethod, shippingMethod } = data;

        if (!items || items.length === 0) {
            throw new functions.https.HttpsError("invalid-argument", "Giỏ hàng trống.");
        }

        try {
            let subtotal = 0;
            const orderItems = [];
            const productNames = [];

            // 2. Validate items and fetch real prices/stock from Firestore
            for (const item of items) {
                const productDoc = await admin.firestore().collection("products").doc(item.id).get();
                
                if (!productDoc.exists) {
                    throw new functions.https.HttpsError("not-found", `Sản phẩm ID ${item.id} không tồn tại.`);
                }

                const product = productDoc.data();
                let currentStock = product.stock || 0; // Default to main product stock
                let variantImage = product.imageUrl; // Default to main product image

                // Check variant stock if color or pattern is selected
                if (item.color && product.colorVariants) {
                    const variant = product.colorVariants.find(v => v.name === item.color);
                    if (!variant) throw new functions.https.HttpsError("not-found", `Biến thể màu "${item.color}" của sản phẩm ${product.name} không tồn tại.`);
                    currentStock = variant.stock || 0;
                    if (variant.imageUrl) variantImage = variant.imageUrl;
                }
                if (item.pattern && product.patternVariants) {
                    const variant = product.patternVariants.find(v => v.name === item.pattern);
                    if (!variant) throw new functions.https.HttpsError("not-found", `Biến thể họa tiết "${item.pattern}" của sản phẩm ${product.name} không tồn tại.`);
                    currentStock = variant.stock || 0; // Override if pattern also has stock
                    if (variant.imageUrl) variantImage = variant.imageUrl;
                }

                // Final stock check for the selected variant (or main product)
                if (currentStock < item.quantity) {
                    throw new functions.https.HttpsError("out-of-resource", `Sản phẩm "${product.name}" (biến thể ${item.color || item.pattern || 'mặc định'}) đã hết hàng hoặc không đủ số lượng. Chỉ còn ${currentStock} sản phẩm.`);
                }

                const hasSale = product.sale > 0;
                const currentUnitPrice = hasSale ? product.price * (1 - product.sale / 100) : product.price;
                const itemTotal = currentUnitPrice * item.quantity;

                subtotal += itemTotal;
                productNames.push(product.name + (item.color ? ` (${item.color})` : '') + (item.pattern ? ` (${item.pattern})` : ''));
                
                orderItems.push({
                    id: item.id,
                    name: product.name,
                    price: currentUnitPrice,
                    image: variantImage,
                    quantity: item.quantity,
                    color: item.color || null,
                    pattern: item.pattern || null,
                    variant: [item.color, item.pattern].filter(Boolean).join(' / ') || null
                });
            }

            // 3. Calculate Coupon (if any)
            let discountAmount = 0;
            if (couponCode) {
                const couponDoc = await admin.firestore().collection("coupons").doc(couponCode.toUpperCase()).get();
                if (couponDoc.exists) {
                    const coupon = couponDoc.data();
                    const today = admin.firestore.Timestamp.now().toDate();
                    const expiryDate = coupon.expiryDate ? new Date(coupon.expiryDate) : null;

                    const isValid = (!expiryDate || expiryDate >= today) && 
                                    (coupon.limit === 0 || (coupon.usedCount || 0) < coupon.limit) &&
                                    (subtotal >= (coupon.minOrder || 0));

                    if (isValid) {
                        discountAmount = coupon.type === 'percent' ? (subtotal * coupon.value / 100) : coupon.value;
                    }
                }
            }

            // 4. Shipping Fee
            const shippingFee = shippingMethod === 'pickup' ? 0 : 30000;
            const finalTotal = Math.max(0, subtotal + shippingFee - discountAmount);

            // 5. Perform Transaction to ensure atomic stock update and order creation
            const orderId = await admin.firestore().runTransaction(async (transaction) => {
                const newOrderRef = admin.firestore().collection("orders").doc();
                
                // Update stock for each product/variant
                for (const item of orderItems) {
                    const pRef = admin.firestore().collection("products").doc(item.id);
                    const pSnap = await transaction.get(pRef);
                    const pData = pSnap.data();

                    let updateData = {
                        stock: admin.firestore.FieldValue.increment(-item.quantity), // Decrement main product stock
                        sold: admin.firestore.FieldValue.increment(item.quantity)
                    };

                    // Update specific color variant stock
                    if (item.color && pData.colorVariants) {
                        const updatedVariants = pData.colorVariants.map(v => {
                            if (v.name === item.color) {
                                return { ...v, stock: (v.stock || 0) - item.quantity };
                            }
                            return v;
                        });
                        updateData.colorVariants = updatedVariants;
                    }

                    // Update specific pattern variant stock
                    if (item.pattern && pData.patternVariants) {
                        const updatedVariants = pData.patternVariants.map(v => {
                            if (v.name === item.pattern) {
                                return { ...v, stock: (v.stock || 0) - item.quantity };
                            }
                            return v;
                        });
                        updateData.patternVariants = updatedVariants;
                    }

                    transaction.update(pRef, updateData);
                }

                // Update coupon usage count
                if (couponCode) {
                    const couponRef = admin.firestore().collection("coupons").doc(couponCode.toUpperCase());
                    transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
                }

                // Save the order
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

            return { success: true, orderId: orderId };

        } catch (error) {
            functions.logger.error("Order Creation Error:", error);
            throw new functions.https.HttpsError("internal", error.message);
        }
    });
