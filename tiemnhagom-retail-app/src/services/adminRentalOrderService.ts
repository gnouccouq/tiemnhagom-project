// src/services/adminRentalOrderService.ts
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { RentalOrder, RentalStatus } from '../types';

export function subscribeRentalOrders(
  onUpdate: (rentals: RentalOrder[]) => void,
  onError?: (error: Error) => void
) {
  const rentalRef = collection(db, 'rental_orders');
  const q = query(rentalRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const rentals: RentalOrder[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          orderCode: data.code || data.orderCode || docSnap.id,
          customerName: data.customerName || data.name || 'Khách thuê decor',
          customerPhone: data.customerPhone || data.phone || '',
          customerEmail: data.customerEmail || data.email || '',
          eventDate: data.eventDate || '',
          startDate: data.startDate || '',
          endDate: data.endDate || '',
          rentalDays: data.rentalDays || 1,
          items: data.items || [],
          totalRentalFee: data.totalRentalFee || data.totalFee || 0,
          totalDeposit: data.totalDeposit || data.deposit || 0,
          totalAmount: data.totalAmount || 0,
          status: (data.status || 'pending_deposit') as RentalStatus,
          shippingAddress: data.address || data.shippingAddress || '',
          notes: data.notes || '',
          createdAt: data.createdAt,
          staffId: data.staffId,
          staffName: data.staffName,
        };
      });
      onUpdate(rentals);
    },
    (error) => {
      console.error('Lỗi lắng nghe đơn thuê decor:', error);
      if (onError) onError(error);
    }
  );
}

export async function updateRentalStatus(
  rentalId: string,
  newStatus: RentalStatus,
  staffName?: string
): Promise<boolean> {
  try {
    const rentalRef = doc(db, 'rental_orders', rentalId);
    const updates: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (staffName) updates.lastUpdatedBy = staffName;
    await updateDoc(rentalRef, updates);
    return true;
  } catch (err) {
    console.error('Lỗi cập nhật trạng thái đơn thuê decor:', err);
    return false;
  }
}
