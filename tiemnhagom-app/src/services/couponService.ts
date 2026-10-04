// src/services/couponService.ts
import { collection, getDocs, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

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
  isUsed?: boolean;
}

/**
 * Lấy danh sách Voucher thật từ Firestore collection "coupons"
 * Có kết hợp lọc voucher đã dùng nếu truyền userId
 */
export async function getActiveCoupons(userId?: string): Promise<CouponItem[]> {
  try {
    const couponsRef = collection(db, 'coupons');
    let snap;
    try {
      const q = query(couponsRef, orderBy('createdAt', 'desc'));
      snap = await getDocs(q);
    } catch {
      // Fallback nếu chưa có index createdAt
      snap = await getDocs(couponsRef);
    }

    // Lấy các mã mà user đã từng sử dụng qua orders
    const usedCoupons = new Set<string>();
    if (userId) {
      try {
        const qUsed = query(collection(db, 'orders'), where('userId', '==', userId));
        const snapOrders = await getDocs(qUsed);
        snapOrders.forEach((d) => {
          const data = d.data();
          if (data.couponCode) usedCoupons.add(data.couponCode);
          if (data.appliedCoupon?.code) usedCoupons.add(data.appliedCoupon.code);
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

      const isUsed = usedCoupons.has(id);

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
        isUsed,
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
