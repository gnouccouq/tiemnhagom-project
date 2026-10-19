// src/services/adminOrderService.ts
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Order, OrderStatus } from '../types';

export function subscribeOrders(
  onUpdate: (orders: Order[]) => void,
  onError?: (error: Error) => void
) {
  const ordersRef = collection(db, 'orders');
  const q = query(ordersRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const orders: Order[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          orderCode: data.orderCode || docSnap.id,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          customerName: data.customerName || data.shippingAddress?.fullName || 'Khách hàng',
          customerPhone: data.customerPhone || data.shippingAddress?.phone || '',
          customerEmail: data.customerEmail || '',
          shippingAddress: data.shippingAddress,
          items: data.items || [],
          subtotal: data.subtotal || data.totalAmount || 0,
          discountAmount: data.discountAmount || 0,
          pointsUsed: data.pointsUsed || 0,
          pointsEarned: data.pointsEarned || 0,
          shippingFee: data.shippingFee || 0,
          totalAmount: data.totalAmount || 0,
          status: (data.status || 'pending') as OrderStatus,
          paymentMethod: data.paymentMethod || 'cod',
          paymentStatus: data.paymentStatus || 'unpaid',
          source: data.source || 'online',
          staffId: data.staffId,
          staffName: data.staffName,
          notes: data.notes || '',
          internalNotes: data.internalNotes || '',
        };
      });
      onUpdate(orders);
    },
    (error) => {
      console.error('Lỗi lắng nghe đơn hàng:', error);
      if (onError) onError(error);
    }
  );
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  staffName?: string,
  internalNotes?: string
): Promise<boolean> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    const updates: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (staffName) {
      updates.lastUpdatedBy = staffName;
    }
    if (internalNotes) {
      updates.internalNotes = internalNotes;
    }
    // Nếu hoàn tất đơn, tự động đánh dấu đã thanh toán
    if (newStatus === 'completed') {
      updates.paymentStatus = 'paid';
    }
    await updateDoc(orderRef, updates);
    return true;
  } catch (err) {
    console.error('Lỗi cập nhật trạng thái đơn:', err);
    return false;
  }
}

export async function addOrderInternalNote(orderId: string, note: string): Promise<boolean> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, {
      internalNotes: note,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi thêm ghi chú đơn:', err);
    return false;
  }
}
