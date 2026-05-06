const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Hàm Callable để tạo đơn hàng an toàn
 * Client truyền lên: { items: [{id, quantity}], couponCode, shippingAddress, paymentMethod, shippingMethod }
 */
exports.createOrderSecure = onCall(async (request) => {
    // 1. Kiểm tra xác thực (Tùy chọn nếu bạn cho phép khách vãng lai)
    const uid = request.auth ? request.auth.uid : 'guest';
    const data = request.data;
    const { items, couponCode, shippingAddress, paymentMethod, shippingMethod } = data;

    if (!items || items.length === 0) {
        throw new HttpsError("invalid-argument", "Giỏ hàng trống.");
    }

    try {
        let subtotal = 0;
        const orderItems = [];
        const productNames = [];

        // 2. Duyệt qua từng item và lấy giá THẬT từ Firestore
        for (const item of items) {
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
                quantity: item.quantity
            });
        }

        // 3. Tính toán Coupon (Nếu có)
        let discountAmount = 0;
        if (couponCode) {
            const couponDoc = await db.collection("coupons").doc(couponCode.toUpperCase()).get();
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

        // 4. Phí vận chuyển
        const shippingFee = shippingMethod === 'pickup' ? 0 : 30000;
        const finalTotal = Math.max(0, subtotal + shippingFee - discountAmount);

        // 5. Thực hiện Transaction để đảm bảo trừ kho và tạo đơn đồng thời
        const orderId = await db.runTransaction(async (transaction) => {
            const newOrderRef = db.collection("orders").doc();
            
            // Cập nhật kho cho từng sản phẩm
            for (const item of orderItems) {
                const pRef = db.collection("products").doc(item.id);
                transaction.update(pRef, {
                    stock: admin.firestore.FieldValue.increment(-item.quantity),
                    sold: admin.firestore.FieldValue.increment(item.quantity)
                });
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

        return { success: true, orderId: orderId };

    } catch (error) {
        console.error("Order Creation Error:", error);
        throw new HttpsError("internal", error.message);
    }
});
