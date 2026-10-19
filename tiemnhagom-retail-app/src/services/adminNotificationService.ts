// src/services/adminNotificationService.ts
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface PushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  type: 'order' | 'deal' | 'system' | 'news';
  link?: string;
  senderName?: string;
}

export async function sendPushNotification(payload: PushNotificationPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const notiRef = collection(db, 'notifications');
    await addDoc(notiRef, {
      ...payload,
      createdAt: serverTimestamp(),
      isRead: false,
    });
    return { success: true };
  } catch (e: any) {
    console.error('Lỗi gửi thông báo:', e);
    return { success: false, error: e.message };
  }
}
