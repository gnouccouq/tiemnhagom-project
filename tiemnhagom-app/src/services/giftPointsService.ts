// src/services/giftPointsService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type GiftTheme = 'housewarming' | 'birthday' | 'friendship' | 'gratitude' | 'peace' | 'trending';

export interface GiftPointsTransaction {
  id: string;
  code: string;
  senderUid: string;
  senderName: string;
  senderPhone?: string;
  recipientPhone?: string;
  recipientUid?: string;
  recipientName?: string;
  points: number;
  theme: GiftTheme;
  themeTitle: string;
  message: string;
  status: 'pending' | 'claimed' | 'refunded' | 'canceled';
  createdAt: string;
  expiresAt: string; // Hết hạn sau 24h
  claimedAt?: string;
  refundedAt?: string;
}

const STORAGE_KEY_GIFTS = '@tiemnhagom_gift_points_cache';
export const GIFT_EXPIRATION_HOURS = 24;
export const GIFT_EXPIRATION_MS = GIFT_EXPIRATION_HOURS * 60 * 60 * 1000;

/**
 * Tạo mã quà tặng độc nhất 6 ký tự viết hoa: GIFT-XXXXXX
 */
function generateGiftCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GIFT-${rand}`;
}

/**
 * Đọc toàn bộ danh sách gift points được lưu trong AsyncStorage
 */
async function getLocalGiftsCache(): Promise<Record<string, GiftPointsTransaction>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_GIFTS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Lỗi đọc gift points cache:', err);
  }
  return {};
}

/**
 * Lưu giao dịch vào AsyncStorage cache
 */
async function saveToLocalGiftsCache(gift: GiftPointsTransaction): Promise<void> {
  try {
    const current = await getLocalGiftsCache();
    current[gift.code.toUpperCase()] = gift;
    await AsyncStorage.setItem(STORAGE_KEY_GIFTS, JSON.stringify(current));
  } catch (err) {
    console.warn('Lỗi lưu gift points cache:', err);
  }
}

/**
 * Lưu nhiều giao dịch vào AsyncStorage cache
 */
async function saveMultipleToLocalGiftsCache(gifts: GiftPointsTransaction[]): Promise<void> {
  try {
    const current = await getLocalGiftsCache();
    gifts.forEach((g) => {
      current[g.code.toUpperCase()] = g;
    });
    await AsyncStorage.setItem(STORAGE_KEY_GIFTS, JSON.stringify(current));
  } catch (err) {
    console.warn('Lỗi lưu multiple gift points cache:', err);
  }
}

/**
 * Tạo gói quà tặng điểm gốm mới (Hạn sử dụng 24h)
 */
export async function createGiftPoints(params: {
  senderUid: string;
  senderName: string;
  senderPhone?: string;
  points: number;
  theme: GiftTheme;
  themeTitle: string;
  message: string;
  recipientPhone?: string;
}): Promise<GiftPointsTransaction> {
  const code = generateGiftCode();
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + GIFT_EXPIRATION_MS).toISOString();

  const giftData: GiftPointsTransaction = {
    id: code,
    code,
    senderUid: params.senderUid,
    senderName: params.senderName || 'Thành viên Tiệm Nhà Gốm',
    senderPhone: params.senderPhone || '',
    recipientPhone: params.recipientPhone || '',
    points: Math.max(5, Math.floor(params.points)),
    theme: params.theme,
    themeTitle: params.themeTitle,
    message: params.message,
    status: 'pending',
    createdAt,
    expiresAt,
  };

  // 1. Lưu vào AsyncStorage cache
  await saveToLocalGiftsCache(giftData);

  // 2. Ghi lên Firestore `points_gifts/{code}`
  try {
    const docRef = doc(db, 'points_gifts', code);
    await setDoc(docRef, {
      ...giftData,
      createdAtTimestamp: serverTimestamp(),
    });
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi ghi points_gifts lên Firestore (đã lưu cache cục bộ):', err);
    }
  }

  return giftData;
}

/**
 * Quét và tự động hoàn điểm cho các mã quà đã gửi quá 24h chưa được nhập
 */
export async function checkAndProcessExpiredGifts(userId: string): Promise<{
  refundedPoints: number;
  refundedGifts: GiftPointsTransaction[];
}> {
  if (!userId) return { refundedPoints: 0, refundedGifts: [] };

  const now = Date.now();
  let totalRefunded = 0;
  const expiredList: GiftPointsTransaction[] = [];

  // 1. Quét từ local cache
  const localCache = await getLocalGiftsCache();
  Object.values(localCache).forEach((gift) => {
    if (gift.senderUid === userId && gift.status === 'pending') {
      const expTime = new Date(gift.expiresAt).getTime();
      if (now > expTime) {
        totalRefunded += gift.points;
        const updatedGift: GiftPointsTransaction = {
          ...gift,
          status: 'refunded',
          refundedAt: new Date(now).toISOString(),
        };
        expiredList.push(updatedGift);
      }
    }
  });

  // 2. Quét từ Firestore (để đồng bộ trạng thái đám mây)
  try {
    const giftsRef = collection(db, 'points_gifts');
    const qSent = query(giftsRef, where('senderUid', '==', userId), where('status', '==', 'pending'));
    const snap = await getDocs(qSent);

    for (const d of snap.docs) {
      const gift = d.data() as GiftPointsTransaction;
      const expTime = new Date(gift.expiresAt).getTime();
      if (now > expTime) {
        if (!expiredList.find((g) => g.code === gift.code)) {
          totalRefunded += gift.points;
          const updatedGift: GiftPointsTransaction = {
            ...gift,
            status: 'refunded',
            refundedAt: new Date(now).toISOString(),
          };
          expiredList.push(updatedGift);
        }

        // Cập nhật lên Firestore
        updateDoc(d.ref, {
          status: 'refunded',
          refundedAt: new Date(now).toISOString(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi kiểm tra expired gifts từ Firestore:', err);
    }
  }

  if (expiredList.length > 0) {
    await saveMultipleToLocalGiftsCache(expiredList);
  }

  return { refundedPoints: totalRefunded, refundedGifts: expiredList };
}

/**
 * Nạp / Đổi mã quà tặng Điểm Gốm
 */
export async function claimGiftPoints(params: {
  code: string;
  recipientUid: string;
  recipientName: string;
  recipientPhone?: string;
}): Promise<{
  success: boolean;
  error?: 'invalid_code' | 'already_claimed' | 'cannot_claim_own' | 'expired' | 'general_error';
  gift?: GiftPointsTransaction;
}> {
  const cleanCode = (params.code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'invalid_code' };
  }

  let gift: GiftPointsTransaction | null = null;

  // 1. Thử đọc từ Firestore
  try {
    const docRef = doc(db, 'points_gifts', cleanCode);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      gift = snap.data() as GiftPointsTransaction;
    }
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi đọc points_gifts từ Firestore, thử đọc cache:', err);
    }
  }

  // 2. Fallback đọc từ AsyncStorage cache
  if (!gift) {
    const cache = await getLocalGiftsCache();
    gift = cache[cleanCode] || null;
  }

  if (!gift) {
    return { success: false, error: 'invalid_code' };
  }

  // Không cho phép tự nhận quà của chính mình
  if (gift.senderUid && gift.senderUid === params.recipientUid) {
    return { success: false, error: 'cannot_claim_own' };
  }

  // Kiểm tra trạng thái đã nhận
  if (gift.status === 'claimed') {
    return { success: false, error: 'already_claimed', gift };
  }

  // Kiểm tra hết hạn 24h
  const now = Date.now();
  const expTime = new Date(gift.expiresAt).getTime();
  if (gift.status === 'refunded' || now > expTime) {
    // Nếu chưa đánh dấu refunded thì cập nhật trạng thái
    if (gift.status !== 'refunded') {
      const expiredGift: GiftPointsTransaction = {
        ...gift,
        status: 'refunded',
        refundedAt: new Date(now).toISOString(),
      };
      await saveToLocalGiftsCache(expiredGift);
      try {
        const docRef = doc(db, 'points_gifts', cleanCode);
        await updateDoc(docRef, {
          status: 'refunded',
          refundedAt: new Date(now).toISOString(),
          updatedAt: serverTimestamp(),
        });
      } catch {}
    }
    return { success: false, error: 'expired', gift };
  }

  // Cập nhật trạng thái nhận quà
  const claimedAt = new Date().toISOString();
  const updatedGift: GiftPointsTransaction = {
    ...gift,
    status: 'claimed',
    recipientUid: params.recipientUid,
    recipientName: params.recipientName,
    recipientPhone: params.recipientPhone || '',
    claimedAt,
  };

  // Cập nhật AsyncStorage
  await saveToLocalGiftsCache(updatedGift);

  // Cập nhật Firestore
  try {
    const docRef = doc(db, 'points_gifts', cleanCode);
    await updateDoc(docRef, {
      status: 'claimed',
      recipientUid: params.recipientUid,
      recipientName: params.recipientName,
      recipientPhone: params.recipientPhone || '',
      claimedAt,
      claimedAtTimestamp: serverTimestamp(),
    });
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi update points_gifts trên Firestore:', err);
    }
  }

  return { success: true, gift: updatedGift };
}

/**
 * Lấy lịch sử quà tặng đã gửi và đã nhận của người dùng
 * Tự động chạy kiểm tra và hoàn lại các món quà quá 24h chưa nhận
 */
export async function getUserGiftHistory(userId: string): Promise<{
  sent: GiftPointsTransaction[];
  received: GiftPointsTransaction[];
  autoRefundedPoints: number;
}> {
  if (!userId) {
    return { sent: [], received: [], autoRefundedPoints: 0 };
  }

  // 1. Xử lý tự động hoàn lại các mã quá 24h
  const { refundedPoints } = await checkAndProcessExpiredGifts(userId);

  const sentMap = new Map<string, GiftPointsTransaction>();
  const receivedMap = new Map<string, GiftPointsTransaction>();

  // 2. Đọc từ local cache
  const localCache = await getLocalGiftsCache();
  Object.values(localCache).forEach((g) => {
    if (g.senderUid === userId) sentMap.set(g.code, g);
    if (g.recipientUid === userId) receivedMap.set(g.code, g);
  });

  // 3. Đọc từ Firestore
  try {
    const giftsRef = collection(db, 'points_gifts');

    // Giao dịch đã gửi
    const qSent = query(giftsRef, where('senderUid', '==', userId));
    const snapSent = await getDocs(qSent);
    snapSent.forEach((docSnap) => {
      const data = docSnap.data() as GiftPointsTransaction;
      sentMap.set(data.code, data);
    });

    // Giao dịch đã nhận
    const qRecv = query(giftsRef, where('recipientUid', '==', userId));
    const snapRecv = await getDocs(qRecv);
    snapRecv.forEach((docSnap) => {
      const data = docSnap.data() as GiftPointsTransaction;
      receivedMap.set(data.code, data);
    });
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi lấy lịch sử quà tặng từ Firestore:', err);
    }
  }

  const sent = Array.from(sentMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const received = Array.from(receivedMap.values()).sort(
    (a, b) => new Date(b.claimedAt || b.createdAt).getTime() - new Date(a.claimedAt || a.createdAt).getTime()
  );

  return { sent, received, autoRefundedPoints: refundedPoints };
}

/**
 * Helper tính thời gian còn lại trước khi hết hạn 24h
 */
export function getRemainingExpiryTime(expiresAt: string): {
  isExpired: boolean;
  hours: number;
  minutes: number;
  text: string;
} {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { isExpired: true, hours: 0, minutes: 0, text: 'Hết hạn' };
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let text = '';
  if (hours > 0) {
    text = `${hours}h ${minutes}p`;
  } else {
    text = `${minutes} phút`;
  }

  return { isExpired: false, hours, minutes, text };
}
