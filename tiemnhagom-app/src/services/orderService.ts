// src/services/orderService.ts
import { addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Order } from '../types';
import { generateOrderCode } from '../utils/format';

/**
 * Tạo đơn hàng mới trong collection "orders"
 */
export async function createOrder(orderData: Omit<Order, 'orderCode' | 'orderDate' | 'status' | 'paymentStatus'>): Promise<{ success: boolean; orderId?: string; orderCode?: string; error?: string }> {
  try {
    const orderCode = generateOrderCode();
    const ordersRef = collection(db, 'orders');

    const newOrder = {
      ...orderData,
      orderCode,
      status: 'Đang xử lý',
      paymentStatus: orderData.paymentMethod === 'cod' ? 'pending' : 'pending',
      orderDate: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(ordersRef, newOrder);
    return {
      success: true,
      orderId: docRef.id,
      orderCode,
    };
  } catch (error: any) {
    console.error('Lỗi tạo đơn hàng:', error);
    return {
      success: false,
      error: error.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.',
    };
  }
}

/**
 * Tra cứu đơn hàng theo Số Điện Thoại hoặc Mã Đơn Hàng
 */
export async function lookupOrders(searchTerm: string): Promise<Order[]> {
  const clean = searchTerm.trim();
  if (!clean) return [];

  try {
    const ordersRef = collection(db, 'orders');
    const results: Order[] = [];

    // 1. Tìm theo Order Code
    const qCode = query(ordersRef, where('orderCode', '==', clean.toUpperCase()));
    const snapCode = await getDocs(qCode);
    snapCode.forEach((d) => {
      results.push({ id: d.id, ...(d.data() as any) });
    });

    // 2. Tìm theo Số điện thoại người nhận nếu chưa thấy hoặc nếu là số
    if (clean.length >= 8) {
      const qPhone = query(ordersRef, where('shippingAddress.phone', '==', clean));
      const snapPhone = await getDocs(qPhone);
      snapPhone.forEach((d) => {
        if (!results.some((r) => r.id === d.id)) {
          results.push({ id: d.id, ...(d.data() as any) });
        }
      });
    }

    // Sắp xếp đơn mới nhất lên đầu
    results.sort((a, b) => {
      const timeA = a.orderDate?.seconds || 0;
      const timeB = b.orderDate?.seconds || 0;
      return timeB - timeA;
    });

    return results;
  } catch (error) {
    console.error('Lỗi tra cứu đơn hàng:', error);
    return [];
  }
}

/**
 * Lấy lịch sử đơn hàng của User đăng nhập
 */
export async function getUserOrders(userId: string): Promise<Order[]> {
  if (!userId) return [];
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', userId),
      limit(30)
    );
    const snap = await getDocs(q);
    const orders: Order[] = [];
    snap.forEach((d) => {
      orders.push({ id: d.id, ...(d.data() as any) });
    });

    orders.sort((a, b) => {
      const timeA = a.orderDate?.seconds || 0;
      const timeB = b.orderDate?.seconds || 0;
      return timeB - timeA;
    });

    return orders;
  } catch (error) {
    console.error('Lỗi lấy đơn hàng của user:', error);
    return [];
  }
}
