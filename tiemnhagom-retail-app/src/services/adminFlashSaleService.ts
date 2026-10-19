// src/services/adminFlashSaleService.ts
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FlashSaleSettings } from '../types';

export function subscribeFlashSale(
  onUpdate: (settings: FlashSaleSettings) => void,
  onError?: (error: Error) => void
) {
  const docRef = doc(db, 'settings', 'flash_sale');

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onUpdate({
          isActive: !!data.isActive,
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          bannerUrl: data.bannerUrl || '',
          products: data.products || [],
        });
      } else {
        onUpdate({
          isActive: false,
          products: [],
        });
      }
    },
    (err) => {
      console.error('Lỗi tải flash sale:', err);
      if (onError) onError(err);
    }
  );
}

export async function saveFlashSaleSettings(settings: FlashSaleSettings): Promise<boolean> {
  try {
    const docRef = doc(db, 'settings', 'flash_sale');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi lưu cấu hình flash sale:', err);
    return false;
  }
}
