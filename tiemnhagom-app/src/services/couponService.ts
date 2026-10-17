import { collection, getDocs, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { syncUserLoyaltyAndVouchers } from './loyaltyService';

export interface CouponItem {
  id: string;
  code: string;
  name: string;
  type: 'percent' | 'fixed' | 'free_ship' | string;
  value: number;
  maxDiscount?: number;
  minOrder?: number;
  minSpend?: number;
  limit?: number;
  usedCount?: number;
  expiryDate?: string;
  category?: string;
  conditions?: string;
  description?: string;
  assignedTo?: string;
  assignedBy?: string;
  forNewCustomerOnly?: boolean;
  isUsed?: boolean;
}

/**
 * Lấy danh sách Voucher thật từ Firestore collection "coupons"
 * Có kết hợp lọc voucher đã dùng nếu truyền userId
 */
export async function getActiveCoupons(userId?: string): Promise<CouponItem[]> {
  try {
    if (userId) {
      try {
        await syncUserLoyaltyAndVouchers(userId);
      } catch {}
    }

    const couponsRef = collection(db, 'coupons');
    let snap;
    try {
      const q = query(couponsRef, orderBy('createdAt', 'desc'));
      snap = await getDocs(q);
    } catch {
      // Fallback nếu chưa có index createdAt
      snap = await getDocs(couponsRef);
    }

    // Lấy các mã mà user đã từng sử dụng qua orders (Mỗi voucher chỉ dùng 1 lần duy nhất giống bản web)
    const usedCoupons = new Set<string>();
    if (userId) {
      try {
        const qUsed = query(collection(db, 'orders'), where('userId', '==', userId));
        const snapOrders = await getDocs(qUsed);
        snapOrders.forEach((d) => {
          const data = d.data();
          if (data.couponCode) usedCoupons.add(String(data.couponCode).toUpperCase());
          if (data.appliedCoupon?.code) usedCoupons.add(String(data.appliedCoupon.code).toUpperCase());
          if (data.appliedCoupon?.id) usedCoupons.add(String(data.appliedCoupon.id).toUpperCase());
          if (typeof data.coupon === 'string') usedCoupons.add(String(data.coupon).toUpperCase());
        });
      } catch (err) {
        console.warn('Lỗi đọc lịch sử voucher đã dùng:', err);
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const validCoupons: CouponItem[] = [];

    snap.forEach((d) => {
      const data = d.data();
      const id = d.id;
      const cleanId = id.toUpperCase();

      // 1. Kiểm tra hạn sử dụng
      if (data.expiryDate) {
        const expDate = new Date(data.expiryDate);
        if (!isNaN(expDate.getTime()) && expDate < today) return;
      }

      // 2. Kiểm tra giới hạn lượt dùng toàn hệ thống
      if (data.limit && Number(data.limit) > 0 && (Number(data.usedCount) || 0) >= Number(data.limit)) {
        return;
      }

      // 3. Kiểm tra mã riêng tư
      if (data.assignedTo && data.assignedTo !== userId) {
        return;
      }
      if (data.assignedBy && data.assignedBy !== userId) {
        return;
      }

      // 4. KIỂM TRA ĐÃ SỬ DỤNG: Mỗi voucher chỉ dùng 1 lần duy nhất cho mỗi khách hàng (giống bản web)
      if (usedCoupons.has(cleanId)) {
        return;
      }

      validCoupons.push({
        id,
        code: id,
        name: data.name || data.title || `Voucher ${id}`,
        type: data.type || data.discountType || 'percent',
        value: Number(data.value || data.discountValue || 0),
        maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : undefined,
        minOrder: Number(data.minOrder || data.minSpend || 0),
        limit: data.limit ? Number(data.limit) : undefined,
        usedCount: data.usedCount ? Number(data.usedCount) : 0,
        expiryDate: data.expiryDate,
        category: data.category,
        conditions: data.conditions || data.description,
        description: data.description || data.conditions,
        assignedTo: data.assignedTo,
        assignedBy: data.assignedBy,
        forNewCustomerOnly: Boolean(data.forNewCustomerOnly),
        isUsed: false,
      });
    });

    // Nếu database Firestore chưa có coupon nào, trả về danh sách voucher mặc định của tiệm
    if (validCoupons.length === 0) {
      return [
        {
          id: 'CHAO-MUNG-GOM',
          code: 'CHAO-MUNG-GOM',
          name: 'Voucher Chào Mừng Hội Viên',
          type: 'percent',
          value: 10,
          maxDiscount: 50000,
          minOrder: 200000,
          expiryDate: '2026-12-31',
          conditions: 'Giảm 10% tối đa 50.000 VND cho đơn hàng từ 200.000 VND.',
          isUsed: false,
        },
        {
          id: 'FREESHIP',
          code: 'FREESHIP',
          name: 'Miễn Phí Giao Hàng Toàn Quốc',
          type: 'free_ship',
          value: 30000,
          minOrder: 350000,
          expiryDate: '2026-11-30',
          conditions: 'Miễn phí vận chuyển tiêu chuẩn cho đơn từ 350.000 VND.',
          isUsed: false,
        },
        {
          id: 'TIEMGOM50K',
          code: 'TIEMGOM50K',
          name: 'Ưu Đãi Tiền Mặt 50.000 VND',
          type: 'fixed',
          value: 50000,
          minOrder: 499000,
          expiryDate: '2026-12-31',
          conditions: 'Giảm trực tiếp 50.000 VND khi thanh toán đơn từ 499.000 VND.',
          isUsed: false,
        },
        {
          id: 'TRIANVIP100',
          code: 'TRIANVIP100',
          name: 'Tri Ân Khách Hàng Thân Thiết',
          type: 'fixed',
          value: 100000,
          minOrder: 999000,
          expiryDate: '2026-12-31',
          conditions: 'Giảm ngay 100.000 VND cho hóa đơn đồ gốm từ 999.000 VND.',
          isUsed: false,
        },
      ];
    }

    return validCoupons;
  } catch (error) {
    console.error('Lỗi lấy vouchers từ Firestore:', error);
    return [];
  }
}

export interface CategorizedCoupons {
  unused: CouponItem[];
  used: CouponItem[];
  expired: CouponItem[];
}

/**
 * Lấy tất cả voucher của người dùng và phân loại thành: Chưa dùng, Đã dùng, Hết hạn
 */
export async function getAllUserCoupons(userId?: string): Promise<CategorizedCoupons> {
  const result: CategorizedCoupons = {
    unused: [],
    used: [],
    expired: [],
  };

  try {
    if (userId) {
      try {
        await syncUserLoyaltyAndVouchers(userId);
      } catch {}
    }

    const couponsRef = collection(db, 'coupons');
    let snap;
    try {
      const q = query(couponsRef, orderBy('createdAt', 'desc'));
      snap = await getDocs(q);
    } catch {
      snap = await getDocs(couponsRef);
    }

    const usedCoupons = new Set<string>();
    if (userId) {
      try {
        const qUsed = query(collection(db, 'orders'), where('userId', '==', userId));
        const snapOrders = await getDocs(qUsed);
        snapOrders.forEach((d) => {
          const data = d.data();
          if (data.couponCode) usedCoupons.add(String(data.couponCode).toUpperCase());
          if (data.appliedCoupon?.code) usedCoupons.add(String(data.appliedCoupon.code).toUpperCase());
          if (data.appliedCoupon?.id) usedCoupons.add(String(data.appliedCoupon.id).toUpperCase());
          if (typeof data.coupon === 'string') usedCoupons.add(String(data.coupon).toUpperCase());
        });
      } catch (err) {
        console.warn('Lỗi đọc đơn hàng đã dùng voucher:', err);
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    snap.forEach((d) => {
      const data = d.data();
      const id = d.id;

      // Bỏ qua mã riêng tư của người khác
      if (data.assignedTo && data.assignedTo !== userId) return;
      if (data.assignedBy && data.assignedBy !== userId) return;

      const isUsed = usedCoupons.has(id.toUpperCase());
      let isExpired = false;

      if (data.expiryDate) {
        const expDate = new Date(data.expiryDate);
        if (!isNaN(expDate.getTime()) && expDate < today) {
          isExpired = true;
        }
      }

      // Kiểm tra hết lượt toàn hệ thống
      if (data.limit && Number(data.limit) > 0 && (Number(data.usedCount) || 0) >= Number(data.limit)) {
        isExpired = true;
      }

      const item: CouponItem = {
        id,
        code: id,
        name: data.name || data.title || `Voucher ${id}`,
        type: data.type || data.discountType || 'percent',
        value: Number(data.value || data.discountValue || 0),
        maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : undefined,
        minOrder: Number(data.minOrder || data.minSpend || 0),
        limit: data.limit ? Number(data.limit) : undefined,
        usedCount: data.usedCount ? Number(data.usedCount) : 0,
        expiryDate: data.expiryDate,
        category: data.category,
        conditions: data.conditions || data.description,
        description: data.description || data.conditions,
        assignedTo: data.assignedTo,
        assignedBy: data.assignedBy,
        forNewCustomerOnly: Boolean(data.forNewCustomerOnly),
        isUsed,
      };

      if (isUsed) {
        result.used.push(item);
      } else if (isExpired) {
        result.expired.push(item);
      } else {
        result.unused.push(item);
      }
    });

    // Fallback dữ liệu mẫu nếu Firestore chưa có dữ liệu đầy đủ
    if (result.unused.length === 0 && result.used.length === 0 && result.expired.length === 0) {
      result.unused = [
        {
          id: 'CHAO-MUNG-GOM',
          code: 'CHAO-MUNG-GOM',
          name: 'GIẢM 10% CHO ĐƠN HÀNG ĐẦU TIÊN',
          type: 'percent',
          value: 10,
          maxDiscount: 50000,
          minOrder: 200000,
          expiryDate: '2026-12-31',
          conditions: 'Giảm 10% tối đa 50.000 VND cho đơn hàng từ 200.000 VND.',
          description: 'Áp dụng cho mọi sản phẩm đồ gốm, chén đĩa và ly tách tại Tiệm Nhà Gốm.',
          isUsed: false,
        },
        {
          id: 'FREESHIP-350K',
          code: 'FREESHIP-350K',
          name: 'MIỄN PHÍ VẬN CHUYỂN TOÀN QUỐC',
          type: 'free_ship',
          value: 30000,
          minOrder: 350000,
          expiryDate: '2026-11-30',
          conditions: 'Miễn phí giao hàng tiêu chuẩn cho đơn từ 350.000 VND.',
          description: 'Giao hàng tận nơi toàn quốc, đóng gói bọc xốp chống sốc an toàn.',
          isUsed: false,
        },
        {
          id: 'TIEMGOM50K',
          code: 'TIEMGOM50K',
          name: 'ƯU ĐÃI TIỀN MẶT 50.000 VND',
          type: 'fixed',
          value: 50000,
          minOrder: 499000,
          expiryDate: '2026-12-31',
          conditions: 'Giảm trực tiếp 50.000 VND khi thanh toán đơn từ 499.000 VND.',
          description: 'Áp dụng khi mua sắm các bộ ấm trà, bình hoa và decor gốm thủ công.',
          isUsed: false,
        },
        {
          id: 'TRIANVIP100',
          code: 'TRIANVIP100',
          name: 'TRI ÂN THÀNH VIÊN THÂN THIẾT',
          type: 'fixed',
          value: 100000,
          minOrder: 999000,
          expiryDate: '2026-12-31',
          conditions: 'Giảm ngay 100.000 VND cho hóa đơn đồ gốm từ 999.000 VND.',
          description: 'Đặc quyền dành riêng cho khách hàng đã đăng ký thẻ thành viên.',
          isUsed: false,
        },
      ];

      result.used = [
        {
          id: 'WELCOME-TNG',
          code: 'WELCOME-TNG',
          name: 'QUÀ TẶNG BÌNH HOA GỐM MINI',
          type: 'fixed',
          value: 40000,
          minOrder: 300000,
          expiryDate: '2026-10-05',
          conditions: 'Tặng 1 lọ hoa gốm mộc hoặc giảm 40.000 VND đơn từ 300.000 VND.',
          description: 'Đã sử dụng thành công trên đơn hàng trước.',
          isUsed: true,
        },
      ];

      result.expired = [
        {
          id: 'SUMMER-SALE20',
          code: 'SUMMER-SALE20',
          name: 'GIẢM 20% BỘ SƯU TẬP GỐM MÙA HÈ',
          type: 'percent',
          value: 20,
          maxDiscount: 80000,
          minOrder: 500000,
          expiryDate: '2026-08-31',
          conditions: 'Giảm 20% tối đa 80.000 VND cho các sản phẩm gốm men hỏa biến.',
          description: 'Chương trình khuyến mãi mùa hè đã kết thúc.',
          isUsed: false,
        },
      ];
    }

    return result;
  } catch (error) {
    console.error('Lỗi phân loại vouchers:', error);
    return result;
  }
}

/**
 * Kiểm tra xem người dùng đã từng sử dụng mã giảm giá này trên đơn hàng nào chưa
 * (Tuân thủ quy chuẩn mỗi voucher chỉ được sử dụng 1 lần duy nhất giống bản Web)
 */
export async function checkUserCouponUsed(userId: string | undefined, couponCode: string): Promise<boolean> {
  if (!userId || !couponCode) return false;
  const clean = couponCode.trim().toUpperCase();
  try {
    const qUsed = query(
      collection(db, 'orders'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(qUsed);
    let used = false;
    snap.forEach((d) => {
      const data = d.data();
      const code1 = String(data.couponCode || '').toUpperCase();
      const code2 = String(data.appliedCoupon?.code || data.appliedCoupon?.id || '').toUpperCase();
      const code3 = String(data.coupon || data.promoCode || '').toUpperCase();
      if (code1 === clean || code2 === clean || code3 === clean) {
        used = true;
      }
    });
    return used;
  } catch (err) {
    console.warn('Lỗi kiểm tra voucher đã dùng:', err);
    return false;
  }
}

