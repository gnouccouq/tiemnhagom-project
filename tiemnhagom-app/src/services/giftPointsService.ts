// src/services/giftPointsService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getPhoneVariants } from '../utils/format';

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
  rejectedBy?: string;
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
 * Gửi push notification qua Expo Push API
 */
export async function sendExpoPushNotification(
  targetToken: string,
  payload: { title: string; body: string; data?: any }
): Promise<void> {
  if (!targetToken || typeof targetToken !== 'string') return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: targetToken,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
      }),
    });
  } catch (err) {
    // Thầm lặng bỏ qua nếu mạng lỗi
  }
}

/**
 * Đọc toàn bộ danh sách gift points được lưu trong AsyncStorage
 */
export async function getLocalGiftsCache(): Promise<Record<string, GiftPointsTransaction>> {
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
    if (gift.id && gift.id !== gift.code) {
      current[gift.id.toUpperCase()] = gift;
    }
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
      if (g.id && g.id !== g.code) {
        current[g.id.toUpperCase()] = g;
      }
    });
    await AsyncStorage.setItem(STORAGE_KEY_GIFTS, JSON.stringify(current));
  } catch (err) {
    console.warn('Lỗi lưu multiple gift points cache:', err);
  }
}

/**
 * Lấy chi tiết món quà tặng theo ID hoặc Code
 */
export async function getGiftPointsById(giftId: string): Promise<GiftPointsTransaction | null> {
  const cleanId = (giftId || '').trim().toUpperCase();
  if (!cleanId) return null;

  // 1. Đọc từ Firestore
  try {
    const docRef = doc(db, 'points_gifts', cleanId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as GiftPointsTransaction;
    }
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi đọc gift points từ Firestore:', err);
    }
  }

  // 2. Fallback đọc từ Local Cache
  const localCache = await getLocalGiftsCache();
  return localCache[cleanId] || null;
}

/**
 * Tạo gói quà tặng điểm gốm mới (Hạn sử dụng 24h)
 * Tự động tìm người nhận theo số điện thoại và phát thông báo vào tài khoản người nhận
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

  let recipientUid = '';
  let recipientName = '';
  let recipientPushToken = '';

  // 1. Tìm thông tin người nhận trong Firestore theo SĐT
  if (params.recipientPhone) {
    const variants = getPhoneVariants(params.recipientPhone);
    if (variants.length > 0) {
      try {
        const qUsers = query(collection(db, 'users'), where('phone', 'in', variants), limit(1));
        const snap = await getDocs(qUsers);
        if (!snap.empty) {
          const uDoc = snap.docs[0];
          recipientUid = uDoc.id;
          const uData = uDoc.data();
          recipientName = uData.displayName || uData.name || uData.fullName || '';
          recipientPushToken = uData.expoPushToken || '';
        }
      } catch (e) {
        console.warn('Lỗi tìm recipient theo phone:', e);
      }
    }
  }

  const giftData: GiftPointsTransaction = {
    id: code,
    code,
    senderUid: params.senderUid,
    senderName: params.senderName || 'Thành viên Tiệm Nhà Gốm',
    senderPhone: params.senderPhone || '',
    recipientPhone: params.recipientPhone || '',
    recipientUid: recipientUid || undefined,
    recipientName: recipientName || undefined,
    points: Math.max(5, Math.floor(params.points)),
    theme: params.theme,
    themeTitle: params.themeTitle,
    message: params.message,
    status: 'pending',
    createdAt,
    expiresAt,
  };

  // 2. Lưu vào AsyncStorage cache
  await saveToLocalGiftsCache(giftData);

  // 3. Ghi lên Firestore `points_gifts/{code}`
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

  // 4. Nếu đã tìm thấy tài khoản người nhận, phát thông báo trực tiếp vào hộp thư người nhận!
  if (recipientUid) {
    try {
      const notifRef = doc(db, 'users', recipientUid, 'notifications', `gift_${code}`);
      const notifData = {
        id: `gift_${code}`,
        giftId: code,
        type: 'gift',
        kind: 'notification',
        stage: 'gift',
        title: `🎁 ${params.senderName} đã tặng bạn ${giftData.points} Điểm Gốm!`,
        message: `"${giftData.message}" — Bấm vào để xem thiệp và nhận điểm nhé!`,
        link: `/gift-claim?id=${code}`,
        isRead: false,
        icon: 'gift',
        iconBg: '#FAF7F2',
        iconColor: '#9C7156',
        createdAt: serverTimestamp(),
        createdAtMs: now,
        expiresAt: giftData.expiresAt,
        expiresAtMs: now + GIFT_EXPIRATION_MS,
        giftPoints: giftData.points,
        giftStatus: 'pending',
      };
      await setDoc(notifRef, notifData);

      // Nếu có push token, gửi push notification qua Expo
      if (recipientPushToken) {
        sendExpoPushNotification(recipientPushToken, {
          title: `🎁 ${params.senderName} đã tặng bạn ${giftData.points} Điểm Gốm!`,
          body: `"${giftData.message}" — Bấm để mở thiệp và nhận điểm`,
          data: { link: `/gift-claim?id=${code}`, giftId: code },
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Lỗi tạo notification cho người nhận:', e);
    }
  }

  return giftData;
}

/**
 * Chấp nhận món quà điểm gốm:
 * 1. Đổi trạng thái món quà thành 'claimed'
 * 2. Cộng điểm (giftPointsBonus) cho người nhận
 * 3. Gửi thông báo xác nhận thành công cho người gửi
 */
export async function acceptGiftPoints(params: {
  giftId: string;
  recipientUid: string;
  recipientName: string;
  recipientPhone?: string;
}): Promise<{
  success: boolean;
  error?: 'not_found' | 'already_processed' | 'cannot_claim_own' | 'expired' | 'general_error';
  gift?: GiftPointsTransaction;
}> {
  const cleanId = (params.giftId || '').trim().toUpperCase();
  if (!cleanId) return { success: false, error: 'not_found' };

  let gift = await getGiftPointsById(cleanId);
  if (!gift) return { success: false, error: 'not_found' };

  // Không cho phép tự nhận quà của chính mình
  if (gift.senderUid && gift.senderUid === params.recipientUid) {
    return { success: false, error: 'cannot_claim_own' };
  }

  // Đã được nhận hoặc đã xử lý trước đó
  if (gift.status === 'claimed') {
    return { success: false, error: 'already_processed', gift };
  }

  // Kiểm tra hết hạn 24h
  const now = Date.now();
  const expTime = new Date(gift.expiresAt).getTime();
  if (gift.status === 'refunded' || now > expTime) {
    return { success: false, error: 'expired', gift };
  }

  // 1. Cập nhật trạng thái quà tặng: 'claimed'
  const claimedAt = new Date(now).toISOString();
  const updatedGift: GiftPointsTransaction = {
    ...gift,
    status: 'claimed',
    recipientUid: params.recipientUid,
    recipientName: params.recipientName,
    recipientPhone: params.recipientPhone || gift.recipientPhone || '',
    claimedAt,
  };

  await saveToLocalGiftsCache(updatedGift);

  try {
    const docRef = doc(db, 'points_gifts', cleanId);
    await updateDoc(docRef, {
      status: 'claimed',
      recipientUid: params.recipientUid,
      recipientName: params.recipientName,
      recipientPhone: params.recipientPhone || gift.recipientPhone || '',
      claimedAt,
      claimedAtTimestamp: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi update points_gifts trên Firestore:', err);
    }
  }

  // 2. Cộng điểm cho người nhận (giftPointsBonus)
  try {
    const userDocRef = doc(db, 'users', params.recipientUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const currentBonus = Number(uData.giftPointsBonus || 0);
      await updateDoc(userDocRef, {
        giftPointsBonus: currentBonus + gift.points,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Lỗi cộng điểm quà tặng cho recipient:', err);
  }

  // 2.5. Cập nhật thông báo của người nhận thành đã nhận điểm (claimed)
  if (params.recipientUid) {
    try {
      const raw = await AsyncStorage.getItem('tiemnhagom_claimed_gifts');
      const set = raw ? JSON.parse(raw) : [];
      if (!set.includes(cleanId)) {
        set.push(cleanId);
        await AsyncStorage.setItem('tiemnhagom_claimed_gifts', JSON.stringify(set));
      }
    } catch {}

    try {
      const recNotifRef = doc(db, 'users', params.recipientUid, 'notifications', `gift_${cleanId}`);
      await updateDoc(recNotifRef, {
        giftStatus: 'claimed',
        isRead: true,
        updatedAt: serverTimestamp(),
      });
    } catch {}
  }

  // 3. Gửi thông báo cho người gửi: Người nhận đã chấp nhận điểm
  if (gift.senderUid) {
    try {
      const senderNotifRef = doc(db, 'users', gift.senderUid, 'notifications', `claimed_${cleanId}`);
      await setDoc(senderNotifRef, {
        id: `claimed_${cleanId}`,
        type: 'gift',
        kind: 'notification',
        stage: 'gift',
        title: `🎉 ${params.recipientName} đã nhận ${gift.points} Điểm Gốm!`,
        message: `Món quà "${gift.themeTitle}" kèm lời chúc của bạn đã được trao gửi trọn vẹn.`,
        isRead: false,
        icon: 'checkmark-circle',
        iconBg: '#FAF7F2',
        iconColor: '#9C7156',
        createdAt: serverTimestamp(),
        createdAtMs: now,
        giftId: cleanId,
        giftStatus: 'claimed',
        giftPoints: gift.points,
        recipientName: params.recipientName,
        themeTitle: gift.themeTitle,
        link: `/notification-detail?id=claimed_${cleanId}&type=gift&giftId=${cleanId}&giftStatus=claimed`,
      });
    } catch {}
  }

  return { success: true, gift: updatedGift };
}

/**
 * Từ chối món quà điểm gốm:
 * 1. Đổi trạng thái món quà thành 'canceled'
 * 2. Hoàn lại số điểm ngay lập tức cho người gửi (giảm trừ giftPointsDeduction)
 * 3. Gửi thông báo cho người gửi biết món quà đã được hoàn lại
 */
export async function declineGiftPoints(params: {
  giftId: string;
  recipientUid: string;
  recipientName?: string;
}): Promise<{
  success: boolean;
  error?: 'not_found' | 'already_processed' | 'expired' | 'general_error';
  gift?: GiftPointsTransaction;
}> {
  const cleanId = (params.giftId || '').trim().toUpperCase();
  if (!cleanId) return { success: false, error: 'not_found' };

  let gift = await getGiftPointsById(cleanId);
  if (!gift) return { success: false, error: 'not_found' };

  if (gift.status !== 'pending') {
    return { success: false, error: 'already_processed', gift };
  }

  const now = Date.now();
  const refundedAt = new Date(now).toISOString();
  const updatedGift: GiftPointsTransaction = {
    ...gift,
    status: 'canceled',
    refundedAt,
    rejectedBy: params.recipientUid,
  };

  await saveToLocalGiftsCache(updatedGift);

  try {
    const docRef = doc(db, 'points_gifts', cleanId);
    await updateDoc(docRef, {
      status: 'canceled',
      refundedAt,
      rejectedBy: params.recipientUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Lỗi update points_gifts khi từ chối:', err);
    }
  }

  // 1. Hoàn lại điểm cho người gửi (Giảm trừ giftPointsDeduction)
  if (gift.senderUid) {
    try {
      const senderDocRef = doc(db, 'users', gift.senderUid);
      const senderSnap = await getDoc(senderDocRef);
      if (senderSnap.exists()) {
        const sData = senderSnap.data();
        const currentDeduction = Number(sData.giftPointsDeduction || 0);
        await updateDoc(senderDocRef, {
          giftPointsDeduction: Math.max(0, currentDeduction - gift.points),
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Gửi thông báo cho người gửi: Người nhận từ chối và điểm đã được hoàn lại
      const senderNotifRef = doc(db, 'users', gift.senderUid, 'notifications', `rejected_${cleanId}`);
      await setDoc(senderNotifRef, {
        id: `rejected_${cleanId}`,
        type: 'gift',
        kind: 'notification',
        stage: 'gift',
        title: `↩️ ${params.recipientName || 'Người nhận'} đã từ chối nhận điểm`,
        message: `Món quà ${gift.points} Điểm Gốm đã được hoàn lại đầy đủ vào tài khoản của bạn.`,
        isRead: false,
        icon: 'refresh-circle',
        iconBg: '#FAF7F2',
        iconColor: '#9C7156',
        createdAt: serverTimestamp(),
        createdAtMs: now,
        giftId: cleanId,
        giftStatus: 'canceled',
        giftPoints: gift.points,
        recipientName: params.recipientName,
        link: `/notification-detail?id=rejected_${cleanId}&type=gift&giftId=${cleanId}&giftStatus=canceled`,
      });
    } catch (err) {
      console.warn('Lỗi hoàn điểm cho sender khi bị từ chối:', err);
    }
  }

  // 3. Cập nhật thông báo của người nhận thành đã từ chối (canceled)
  if (params.recipientUid) {
    try {
      const recNotifRef = doc(db, 'users', params.recipientUid, 'notifications', `gift_${cleanId}`);
      await updateDoc(recNotifRef, {
        giftStatus: 'canceled',
        isRead: true,
        updatedAt: serverTimestamp(),
      });
    } catch {}
  }

  return { success: true, gift: updatedGift };
}

/**
 * Quét và tự động hoàn điểm cho các mã quà đã gửi quá 24h chưa được nhận
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
 * Nạp / Đổi mã quà tặng Điểm Gốm (Hỗ trợ tương thích ngược)
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
  const res = await acceptGiftPoints({
    giftId: params.code,
    recipientUid: params.recipientUid,
    recipientName: params.recipientName,
    recipientPhone: params.recipientPhone,
  });

  if (res.success) {
    return { success: true, gift: res.gift };
  }
  if (res.error === 'not_found') return { success: false, error: 'invalid_code' };
  if (res.error === 'already_processed') return { success: false, error: 'already_claimed', gift: res.gift };
  if (res.error === 'cannot_claim_own') return { success: false, error: 'cannot_claim_own' };
  if (res.error === 'expired') return { success: false, error: 'expired', gift: res.gift };
  return { success: false, error: 'general_error' };
}

/**
 * Lấy lịch sử quà tặng đã gửi và đã nhận của người dùng
 * Tự động chạy kiểm tra và hoàn lại các món quà quá 24h chưa nhận
 */
export async function getUserGiftHistory(
  userId: string,
  userPhone?: string,
  altUid?: string
): Promise<{
  sent: GiftPointsTransaction[];
  received: GiftPointsTransaction[];
  autoRefundedPoints: number;
}> {
  if (!userId && !altUid && !userPhone) {
    return { sent: [], received: [], autoRefundedPoints: 0 };
  }

  const uids = Array.from(new Set([userId, altUid].filter(Boolean))) as string[];
  const phoneVariants = userPhone ? getPhoneVariants(userPhone) : [];

  // 1. Xử lý tự động hoàn lại các mã quá 24h
  let refundedPoints = 0;
  for (const uid of uids) {
    try {
      const res = await checkAndProcessExpiredGifts(uid);
      refundedPoints += res.refundedPoints;
    } catch {}
  }

  const sentMap = new Map<string, GiftPointsTransaction>();
  const receivedMap = new Map<string, GiftPointsTransaction>();

  // 2. Đọc từ local cache
  const localCache = await getLocalGiftsCache();
  Object.values(localCache).forEach((g) => {
    const isSender =
      (g.senderUid && uids.includes(g.senderUid)) ||
      (g.senderPhone && phoneVariants.includes(g.senderPhone));
    if (isSender) {
      sentMap.set(g.code, g);
    }

    const isRecipient =
      (g.recipientUid && uids.includes(g.recipientUid)) ||
      (g.recipientPhone && phoneVariants.includes(g.recipientPhone));
    if (isRecipient) {
      receivedMap.set(g.code, g);
    }
  });

  // 3. Đọc từ Firestore
  try {
    const giftsRef = collection(db, 'points_gifts');

    // Giao dịch đã gửi & đã nhận theo từng UID
    for (const uid of uids) {
      try {
        const qSent = query(giftsRef, where('senderUid', '==', uid));
        const snapSent = await getDocs(qSent);
        snapSent.forEach((docSnap) => {
          const data = docSnap.data() as GiftPointsTransaction;
          sentMap.set(data.code, data);
        });
      } catch {}

      try {
        const qRecvUid = query(giftsRef, where('recipientUid', '==', uid));
        const snapRecvUid = await getDocs(qRecvUid);
        snapRecvUid.forEach((docSnap) => {
          const data = docSnap.data() as GiftPointsTransaction;
          receivedMap.set(data.code, data);
        });
      } catch {}
    }

    // Giao dịch theo biến thể số điện thoại
    if (phoneVariants.length > 0) {
      const chunks = phoneVariants.slice(0, 10);
      try {
        const qSentPhone = query(giftsRef, where('senderPhone', 'in', chunks));
        const snapSentPhone = await getDocs(qSentPhone);
        snapSentPhone.forEach((docSnap) => {
          const data = docSnap.data() as GiftPointsTransaction;
          sentMap.set(data.code, data);
        });
      } catch {}

      try {
        const qRecvPhone = query(giftsRef, where('recipientPhone', 'in', chunks));
        const snapRecvPhone = await getDocs(qRecvPhone);
        snapRecvPhone.forEach((docSnap) => {
          const data = docSnap.data() as GiftPointsTransaction;
          receivedMap.set(data.code, data);
        });
      } catch {}
    }
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
