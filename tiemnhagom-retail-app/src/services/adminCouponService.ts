// src/services/adminCouponService.ts
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Coupon } from '../types';

export function subscribeCoupons(
  onUpdate: (coupons: Coupon[]) => void,
  onError?: (error: Error) => void
) {
  const couponsRef = collection(db, 'coupons');

  return onSnapshot(
    couponsRef,
    (snapshot) => {
      const coupons: Coupon[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          code: docSnap.id,
          type: data.type || 'percent',
          value: data.value || 0,
          minOrder: data.minOrder || 0,
          maxDiscount: data.maxDiscount,
          startDate: data.startDate,
          expiryDate: data.expiryDate || '',
          usageLimit: data.usageLimit,
          usedCount: data.usedCount || 0,
          isActive: data.isActive !== undefined ? data.isActive : true,
          description: data.description || '',
        };
      });
      onUpdate(coupons);
    },
    (error) => {
      console.error('Lỗi tải mã giảm giá:', error);
      if (onError) onError(error);
    }
  );
}

export async function addCoupon(coupon: Coupon): Promise<{ success: boolean; error?: string }> {
  try {
    const code = coupon.code.trim().toUpperCase();
    const docRef = doc(db, 'coupons', code);
    await setDoc(docRef, {
      ...coupon,
      code,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (e: any) {
    console.error('Lỗi tạo mã giảm giá:', e);
    return { success: false, error: e.message };
  }
}

export async function toggleCouponActive(couponId: string, isActive: boolean): Promise<boolean> {
  try {
    const docRef = doc(db, 'coupons', couponId);
    await updateDoc(docRef, { isActive, updatedAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.error('Lỗi bật/tắt coupon:', e);
    return false;
  }
}

export async function deleteCoupon(couponId: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'coupons', couponId);
    await deleteDoc(docRef);
    return true;
  } catch (e) {
    console.error('Lỗi xóa coupon:', e);
    return false;
  }
}
