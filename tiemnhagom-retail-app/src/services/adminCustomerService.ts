// src/services/adminCustomerService.ts
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  increment,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Customer, MembershipTier } from '../types';

export function subscribeCustomers(
  onUpdate: (customers: Customer[]) => void,
  onError?: (error: Error) => void
) {
  const usersRef = collection(db, 'users');

  return onSnapshot(
    usersRef,
    (snapshot) => {
      const customers: Customer[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const totalSpent = data.totalSpent || 0;
        let tier: MembershipTier = 'Gốm Mộc';
        if (totalSpent >= 20000000) tier = 'Gốm Độc Bản';
        else if (totalSpent >= 10000000) tier = 'Gốm Men';
        else if (totalSpent >= 3000000) tier = 'Gốm Nung';

        return {
          id: docSnap.id,
          uid: docSnap.id,
          displayName: data.displayName || data.fullName || 'Khách hàng',
          phone: data.phone || data.phoneNumber || '',
          email: data.email || '',
          points: data.points || 0,
          totalSpent,
          orderCount: data.orderCount || 0,
          tier: (data.tier || tier) as MembershipTier,
          createdAt: data.createdAt,
          address: data.address || '',
        };
      });
      onUpdate(customers);
    },
    (error) => {
      console.error('Lỗi tải danh sách khách hàng:', error);
      if (onError) onError(error);
    }
  );
}

export async function adjustCustomerPoints(
  customerId: string,
  pointsDiff: number,
  reason: string,
  staffName?: string
): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', customerId);
    await updateDoc(userRef, {
      points: increment(pointsDiff),
      updatedAt: serverTimestamp(),
    });

    // Ghi nhật ký biến động điểm
    await addDoc(collection(db, 'users', customerId, 'points_history'), {
      amount: pointsDiff,
      type: pointsDiff >= 0 ? 'admin_add' : 'admin_deduct',
      reason,
      createdBy: staffName || 'Admin',
      createdAt: serverTimestamp(),
    });

    return true;
  } catch (err) {
    console.error('Lỗi điều chỉnh điểm:', err);
    return false;
  }
}

export async function createCustomer(customerData: {
  displayName: string;
  phone: string;
  email?: string;
  address?: string;
}): Promise<{ success: boolean; customer?: Customer; error?: string }> {
  try {
    const usersRef = collection(db, 'users');
    const newDoc = await addDoc(usersRef, {
      displayName: customerData.displayName.trim(),
      phone: customerData.phone.trim(),
      email: customerData.email?.trim() || '',
      address: customerData.address?.trim() || '',
      points: 0,
      totalSpent: 0,
      orderCount: 0,
      tier: 'Gốm Mộc',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const newCustomer: Customer = {
      id: newDoc.id,
      uid: newDoc.id,
      displayName: customerData.displayName.trim(),
      phone: customerData.phone.trim(),
      email: customerData.email?.trim() || '',
      address: customerData.address?.trim() || '',
      points: 0,
      totalSpent: 0,
      orderCount: 0,
      tier: 'Gốm Mộc',
    };

    return { success: true, customer: newCustomer };
  } catch (err: any) {
    console.error('Lỗi tạo khách hàng:', err);
    return { success: false, error: err.message };
  }
}
