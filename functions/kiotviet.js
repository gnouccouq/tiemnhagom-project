const admin = require('firebase-admin');
const axios = require('axios');

let tokenCache = null;
let tokenExpiresAt = 0;
let branchIdCache = null;

async function getKiotVietConfig() {
    // 1. Ưu tiên lấy từ biến môi trường (.env)
    if (process.env.KIOTVIET_CLIENT_ID && process.env.KIOTVIET_CLIENT_SECRET && process.env.KIOTVIET_RETAILER) {
        return {
            clientId: process.env.KIOTVIET_CLIENT_ID,
            clientSecret: process.env.KIOTVIET_CLIENT_SECRET,
            retailer: process.env.KIOTVIET_RETAILER
        };
    }
    
    // 2. Dự phòng lấy từ Firestore (nếu sau này bạn muốn đổi cấu hình trên web admin)
    const doc = await admin.firestore().collection('settings').doc('kiotviet').get();
    if (doc.exists) {
        return doc.data();
    }
    
    throw new Error('Thiếu cấu hình KiotViet (Client ID, Secret, Retailer). Vui lòng cấu hình trong file .env hoặc Firestore.');
}

async function getKiotVietToken() {
    if (tokenCache && Date.now() < tokenExpiresAt) {
        return tokenCache;
    }

    const config = await getKiotVietConfig();
    
    const params = new URLSearchParams();
    params.append('scopes', 'PublicApi.Access');
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);

    try {
        const response = await axios.post('https://id.kiotviet.vn/connect/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        tokenCache = response.data.access_token;
        // Token expires_in tính bằng giây. Trừ hao 60 giây để đảm bảo an toàn.
        tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
        
        return tokenCache;
    } catch (error) {
        console.error("Lỗi lấy token KiotViet:", error.response?.data || error.message);
        throw new Error("Không thể kết nối đến KiotViet để xác thực.");
    }
}

async function getBranchId() {
    if (branchIdCache) return branchIdCache;
    
    const token = await getKiotVietToken();
    const config = await getKiotVietConfig();

    try {
        const response = await axios.get('https://public.kiotviet.vn/branches', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Retailer': config.retailer
            }
        });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
            // Lấy chi nhánh đầu tiên làm mặc định
            branchIdCache = response.data.data[0].id;
            return branchIdCache;
        }
        throw new Error("Không tìm thấy chi nhánh nào trên KiotViet.");
    } catch (error) {
        console.error("Lỗi lấy chi nhánh KiotViet:", error.response?.data || error.message);
        throw new Error("Không thể lấy thông tin chi nhánh KiotViet.");
    }
}

async function createOrderInKiotViet(orderData) {
    const token = await getKiotVietToken();
    const config = await getKiotVietConfig();
    
    // Nếu chưa có chi nhánh, tự động lấy chi nhánh mặc định
    if (!orderData.branchId) {
        orderData.branchId = await getBranchId();
    }

    try {
        // Gửi request POST tạo Đặt Hàng (Orders)
        const response = await axios.post('https://public.kiotviet.vn/orders', orderData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Retailer': config.retailer,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error("Lỗi tạo đơn hàng KiotViet:", JSON.stringify(error.response?.data) || error.message);
        // Không throw error để tránh làm hỏng luồng tạo đơn trên Firebase, 
        // nhưng ghi log để theo dõi.
        return null; 
    }
}
async function createProductInKiotViet(productData) {
    const token = await getKiotVietToken();
    const config = await getKiotVietConfig();
    const branchId = await getBranchId();

    const kvProductData = {
        code: productData.id,
        name: productData.name,
        basePrice: productData.price || 0,
        allowsSale: true,
        type: 1, // 1 là Hàng hóa
        inventories: [{
            branchId: branchId,
            cost: productData.price || 0,
            onHand: productData.stock || 0
        }]
    };

    try {
        const response = await axios.post('https://public.kiotviet.vn/products', kvProductData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Retailer': config.retailer,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Lỗi tạo sản phẩm ${productData.id} trên KiotViet:`, JSON.stringify(error.response?.data) || error.message);
        throw error;
    }
}

module.exports = {
    getKiotVietConfig,
    getKiotVietToken,
    getBranchId,
    createOrderInKiotViet,
    createProductInKiotViet
};
