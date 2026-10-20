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
import { Order, OrderStatus, PaymentStatus, PaymentMethod } from '../types';

export function normalizeOrder(docId: string, data: any): Order {
  const code = (data.orderCode || data.orderId || docId || '').toString();
  const isPos =
    data.source === 'pos' ||
    data.orderSource === 'pos' ||
    code.toUpperCase().includes('POS') ||
    docId.toUpperCase().includes('POS') ||
    Boolean(data.cashierId) ||
    Boolean(data.isPOS);

  // Xử lý status
  let status: OrderStatus = 'pending';
  const rawStatus = (data.status || '').toString().toLowerCase();

  if (isPos) {
    // Đơn có mã POS luôn luôn là đã hoàn tất thanh toán & giao nhận tại quầy
    if (rawStatus === 'cancelled' || rawStatus.includes('hủy')) {
      status = 'cancelled';
    } else {
      status = 'completed';
    }
  } else {
    if (
      rawStatus === 'completed' ||
      rawStatus.includes('hoàn thành') ||
      rawStatus.includes('đã giao') ||
      rawStatus.includes('hoàn tất')
    ) {
      status = 'completed';
    } else if (
      rawStatus === 'shipping' ||
      rawStatus.includes('đang giao') ||
      rawStatus.includes('vận chuyển')
    ) {
      status = 'shipping';
    } else if (
      rawStatus === 'processing' ||
      rawStatus.includes('đang xử lý') ||
      rawStatus.includes('chuẩn bị')
    ) {
      status = 'processing';
    } else if (rawStatus === 'cancelled' || rawStatus.includes('hủy')) {
      status = 'cancelled';
    } else {
      status = 'pending';
    }
  }

  // Xử lý paymentStatus
  let paymentStatus: PaymentStatus = 'unpaid';
  const rawPaymentStatus = (data.paymentStatus || '').toString().toLowerCase();

  if (isPos) {
    // Đơn có mã POS mặc định 100% đã hoàn tất thanh toán
    paymentStatus = 'paid';
  } else if (
    rawPaymentStatus === 'paid' ||
    rawPaymentStatus.includes('đã thanh toán') ||
    rawPaymentStatus.includes('thành công') ||
    status === 'completed'
  ) {
    paymentStatus = 'paid';
  } else if (rawPaymentStatus === 'refunded' || rawPaymentStatus.includes('hoàn tiền')) {
    paymentStatus = 'refunded';
  }

  // Xử lý paymentMethod
  let paymentMethod: PaymentMethod = 'cod';
  const rawMethod = (data.paymentMethod || '').toString().toLowerCase();
  if (rawMethod.includes('vietqr') || rawMethod.includes('chuyển khoản') || rawMethod.includes('qr')) {
    paymentMethod = 'vietqr';
  } else if (rawMethod.includes('tiền mặt') || rawMethod.includes('cash')) {
    paymentMethod = 'cash';
  } else if (rawMethod.includes('thẻ') || rawMethod.includes('card')) {
    paymentMethod = 'card';
  } else if (rawMethod.includes('momo')) {
    paymentMethod = 'momo';
  } else if (isPos) {
    paymentMethod = 'cash';
  }

  return {
    id: docId,
    orderCode: code || docId,
    createdAt: data.createdAt || data.orderDate,
    updatedAt: data.updatedAt,
    customerName: data.customerName || data.shippingAddress?.fullName || (isPos ? 'Khách lẻ tại tiệm' : 'Khách hàng'),
    customerPhone: data.customerPhone || data.shippingAddress?.phone || '',
    customerEmail: data.customerEmail || '',
    shippingAddress: data.shippingAddress,
    items: data.items || [],
    subtotal: data.subtotal || data.totalAmount || 0,
    discountAmount: data.discountAmount || data.discount || 0,
    pointsUsed: data.pointsUsed || 0,
    pointsEarned: data.pointsEarned || 0,
    shippingFee: data.shippingFee || 0,
    totalAmount: data.totalAmount || 0,
    status,
    paymentMethod,
    paymentStatus,
    source: isPos ? 'pos' : 'online',
    orderSource: isPos ? 'pos' : 'online',
    staffId: data.staffId,
    staffName: data.staffName,
    notes: data.notes || '',
    internalNotes: data.internalNotes || '',
  };
}

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
        return normalizeOrder(docSnap.id, docSnap.data());
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
