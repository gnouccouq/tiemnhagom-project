const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const bucket = admin.storage().bucket();

/**
 * Hàm hỗ trợ trích xuất đường dẫn file từ URL Storage
 */
function getFilePathFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const oIndex = url.indexOf('/o/');
        if (oIndex === -1) return null;
        let path = url.substring(oIndex + 3).split('?')[0];
        return decodeURIComponent(path);
    } catch (error) {
        return null;
    }
}

/**
 * Tự động xóa ảnh khi sản phẩm bị xóa
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
 * Tự động xóa ảnh cũ khi sản phẩm được cập nhật (thay ảnh)
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
 * Tự động xóa ảnh khi Đánh giá (Review) bị xóa
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
 * Hàm dùng chung để xóa danh sách file khỏi Storage
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
 * Tự động dọn dẹp nhật ký kho cũ hơn 1 năm (chạy mỗi ngày lúc 0h sáng)
 * Lưu ý: Tính năng này yêu cầu dự án Firebase ở gói Blaze (Pay-as-you-go)
 */
exports.cleanupOldInventoryLogs = functions.pubsub
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

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
