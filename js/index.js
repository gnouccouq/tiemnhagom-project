nconst functions = require('firebase-functions');
const admin = require('firebase-admin');

// Khởi tạo Firebase Admin SDK
// Admin SDK tự động lấy thông tin cấu hình từ môi trường Cloud Functions
admin.initializeApp();

// Lấy tham chiếu đến Firebase Storage
const bucket = admin.storage().bucket();

/**
 * Hàm trợ giúp để trích xuất đường dẫn file từ URL Firebase Storage.
 * URL có dạng: https://firebasestorage.googleapis.com/v0/b/PROJECT_ID.appspot.com/o/path%2Fto%2Ffile.webp?alt=media&token=...
 * Chúng ta cần phần "path/to/file.webp"
 */
function getFilePathFromFirebaseStorageUrl(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    try {
        // Tìm vị trí của "/o/"
        const oIndex = url.indexOf('/o/');
        if (oIndex === -1) {
            return null; // Không phải URL Storage hợp lệ
        }
        // Lấy phần sau "/o/"
        let pathWithEncoding = url.substring(oIndex + 3);

        // Loại bỏ các tham số query (ví dụ: ?alt=media&token=...)
        const queryIndex = pathWithEncoding.indexOf('?');
        if (queryIndex !== -1) {
            pathWithEncoding = pathWithEncoding.substring(0, queryIndex);
        }

        // Giải mã URI (ví dụ: %2F thành /)
        return decodeURIComponent(pathWithEncoding);
    } catch (error) {
        functions.logger.error("Lỗi khi phân tích URL Storage:", url, error);
        return null;
    }
}

/**
 * Cloud Function được kích hoạt khi một tài liệu bị xóa khỏi collection 'products'.
 */
exports.deleteProductImages = functions.firestore
    .document('products/{productId}')
    .onDelete(async (snap, context) => {
        const deletedProduct = snap.data();
        const productId = context.params.productId;

        functions.logger.info(`Đang xử lý xóa ảnh cho sản phẩm: ${productId}`);

        const imagesToDelete = [];

        // Thêm ảnh chính (imageUrl) vào danh sách cần xóa
        if (deletedProduct.imageUrl && deletedProduct.imageUrl !== 'https://via.placeholder.com/300') {
            imagesToDelete.push(deletedProduct.imageUrl);
        }

        // Thêm các ảnh phụ (additionalImages) vào danh sách cần xóa
        if (deletedProduct.additionalImages && Array.isArray(deletedProduct.additionalImages)) {
            deletedProduct.additionalImages.forEach(imgUrl => {
                if (imgUrl) {
                    imagesToDelete.push(imgUrl);
                }
            });
        }

        if (imagesToDelete.length === 0) {
            functions.logger.info(`Không tìm thấy ảnh nào để xóa cho sản phẩm ${productId}.`);
            return null;
        }

        const deletePromises = imagesToDelete.map(async (imageUrl) => {
            const filePath = getFilePathFromFirebaseStorageUrl(imageUrl);
            if (!filePath) {
                functions.logger.warn(`Không thể trích xuất đường dẫn file từ URL: ${imageUrl}. Bỏ qua.`);
                return null;
            }

            const file = bucket.file(filePath);
            try {
                await file.delete();
                functions.logger.info(`Đã xóa thành công file Storage: ${filePath}`);
                return true;
            } catch (error) {
                // Bỏ qua lỗi nếu file không tồn tại (ví dụ: đã bị xóa thủ công)
                if (error.code === 404) {
                    functions.logger.warn(`File Storage không tồn tại: ${filePath}. Bỏ qua.`);
                    return null;
                }
                functions.logger.error(`Lỗi khi xóa file Storage ${filePath}:`, error);
                throw error; // Ném lỗi để hàm Cloud Function báo thất bại
            }
        });

        try {
            await Promise.all(deletePromises);
            functions.logger.info(`Hoàn tất xóa tất cả ảnh liên quan cho sản phẩm ${productId}.`);
            return null;
        } catch (error) {
            functions.logger.error(`Có lỗi xảy ra trong quá trình xóa ảnh cho sản phẩm ${productId}:`, error);
            return null; // Hàm vẫn hoàn thành nhưng có lỗi được ghi lại
        }
    });
