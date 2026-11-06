// src/services/notificationFeedService.ts
import { collection, getDocs, getDoc, doc, query, orderBy, limit } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../config/firebase';
import { getUserOrders } from './orderService';
import {
  generateOrderNotificationsFromOrders,
  DELETED_NOTIFS_KEY,
} from './orderNotificationService';
import { getLocalGiftsCache } from './giftPointsService';
import {
  READ_IDS_KEY,
  LOCAL_NOTIFS_KEY,
  CACHED_FEED_KEY,
} from '../constants/notificationKeys';

export { READ_IDS_KEY, LOCAL_NOTIFS_KEY, CACHED_FEED_KEY };

export type NotificationType = 'order' | 'promo' | 'system';
export type FilterType = 'all' | 'unread' | 'promo' | 'order' | 'article';

export interface UnifiedFeedItem {
  id: string;
  kind: 'notification' | 'article';
  type: NotificationType | 'news';
  title: string;
  message: string;
  time: string;
  createdAtMs?: number;
  isRead: boolean;
  icon?: any;
  iconBg?: string;
  iconColor?: string;
  imageUrl?: string;
  link?: string;
  giftId?: string;
  expiresAt?: string;
  expiresAtMs?: number;
  isGift?: boolean;
  giftStatus?: 'pending' | 'claimed' | 'canceled';
}


// In-Memory Cache lưu trữ danh sách feed thông báo đã tải sẵn
let _cachedFeed: UnifiedFeedItem[] = [];
let _isPreloading = false;
let _preloadPromise: Promise<UnifiedFeedItem[]> | null = null;
let _lastPreloadedAt = 0;

/**
 * Lấy feed thông báo hiện có trong bộ nhớ RAM (0ms latency, không chờ mạng)
 */
export function getCachedNotificationFeed(): UnifiedFeedItem[] {
  return _cachedFeed;
}

/**
 * Khôi phục danh sách thông báo đã lưu trong AsyncStorage (chạy ngay khi app khởi động)
 */
export async function initPersistedNotificationFeed(): Promise<UnifiedFeedItem[]> {
  if (_cachedFeed.length > 0) return _cachedFeed;
  try {
    const raw = await AsyncStorage.getItem(CACHED_FEED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _cachedFeed = parsed;
        return parsed;
      }
    }
  } catch {}
  return _cachedFeed;
}

// Helper chuyển đổi Date sang chuỗi thời gian thân thiện
function formatTimeFriendly(timestamp: any): { timeStr: string; ms: number } {
  let date = new Date();
  let ms = Date.now();
  if (timestamp) {
    try {
      if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      }
      ms = date.getTime();
    } catch {}
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  let timeStr = 'Vừa xong';
  if (diffMin < 1) timeStr = 'Vừa xong';
  else if (diffMin < 60) timeStr = `${diffMin} phút trước`;
  else if (diffHr < 24) timeStr = `${diffHr} giờ trước`;
  else if (diffDay < 7) timeStr = `${diffDay} ngày trước`;
  else {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    timeStr = `${day}/${month}/${year}`;
  }

  return { timeStr, ms };
}

/**
 * Tải sẵn toàn bộ thông báo Firestore (Tin tức, Thông báo chung, Thông báo riêng, Đơn hàng, Quà tặng gốm)
 * Chạy ngay khi ở màn hình SplashScreen để khi vào màn hình chính ko cần tải lại.
 */
export async function preloadNotificationFeed(userId?: string | null): Promise<UnifiedFeedItem[]> {
  // Tránh gọi trùng lặp nếu đang có tiến trình preload đang chạy
  if (_isPreloading && _preloadPromise) {
    return _preloadPromise;
  }

  // Nếu vừa tải cách đây dưới 20 giây và đã có dữ liệu, trả về ngay lập tức
  if (Date.now() - _lastPreloadedAt < 20000 && _cachedFeed.length > 0) {
    return _cachedFeed;
  }

  _isPreloading = true;
  _preloadPromise = (async () => {
    try {
      // 1. Tải readIds và deletedIds từ AsyncStorage
      let currentReadIds = new Set<string>();
      try {
        const raw = await AsyncStorage.getItem(READ_IDS_KEY);
        if (raw) currentReadIds = new Set(JSON.parse(raw));
      } catch {}

      let deletedIds = new Set<string>();
      try {
        const delRaw = await AsyncStorage.getItem(DELETED_NOTIFS_KEY);
        if (delRaw) {
          const parsed = JSON.parse(delRaw);
          if (Array.isArray(parsed)) deletedIds = new Set(parsed);
        }
      } catch {}

      let claimedGiftIds = new Set<string>();
      try {
        const rawClaimed = await AsyncStorage.getItem('tiemnhagom_claimed_gifts');
        if (rawClaimed) claimedGiftIds = new Set(JSON.parse(rawClaimed));
      } catch {}

      let localGifts: Record<string, any> = {};
      try {
        if (typeof getLocalGiftsCache === 'function') {
          localGifts = await getLocalGiftsCache();
        }
      } catch {}

      // 2. Chạy song song các truy vấn Firestore
      const targetUid = userId || undefined;

      const [snapNewsRes, snapGlobalRes, snapUserNotifsRes, userOrdersRes] = await Promise.allSettled([
        // Truy vấn A: Tin tức bài viết
        getDocs(query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(25))),
        // Truy vấn B: Thông báo chung
        getDocs(query(collection(db, 'global_notifications'), orderBy('createdAt', 'desc'), limit(25))),
        // Truy vấn C: Thông báo riêng của user (nếu đã đăng nhập)
        targetUid
          ? getDocs(query(collection(db, 'users', targetUid, 'notifications'), orderBy('createdAt', 'desc'), limit(50)))
          : Promise.resolve(null),
        // Truy vấn D: Đơn hàng của user (nếu đã đăng nhập)
        targetUid
          ? getUserOrders(targetUid)
          : Promise.resolve([]),
      ]);

      // A. Xử lý tin tức
      let newsItems: UnifiedFeedItem[] = [];
      if (snapNewsRes.status === 'fulfilled' && snapNewsRes.value) {
        newsItems = snapNewsRes.value.docs
          .filter((d) => !deletedIds.has(d.id))
          .map((docSnap) => {
            const data = docSnap.data();
            const { timeStr, ms } = formatTimeFriendly(data.createdAt);
            const plainText = (data.content || '').replace(/<[^>]*>?/gm, '').trim();
            const excerpt = plainText.length > 110 ? plainText.substring(0, 110) + '...' : plainText;

            return {
              id: docSnap.id,
              kind: 'article',
              type: 'news',
              title: data.title || 'Bài viết từ Tiệm Nhà Gốm',
              message: excerpt,
              time: timeStr,
              createdAtMs: ms,
              isRead: currentReadIds.has(docSnap.id),
              imageUrl:
                data.imageUrl ||
                'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
            };
          });
      }

      // B. Xử lý thông báo chung
      let firestoreNotifs: UnifiedFeedItem[] = [];
      if (snapGlobalRes.status === 'fulfilled' && snapGlobalRes.value) {
        firestoreNotifs = snapGlobalRes.value.docs
          .filter((d) => !deletedIds.has(d.id))
          .map((docSnap) => {
            const data = docSnap.data();
            const { timeStr, ms } = formatTimeFriendly(data.createdAt);
            const notifType = (data.type || 'promo') as NotificationType;

            let iconName: any = 'pricetag';
            let iconBg = '#F3E5DC';
            let iconColor = '#9C7156';

            if (notifType === 'order') {
              iconName = 'cube';
              iconBg = '#F6F4EC';
              iconColor = '#9C7156';
            } else if (notifType === 'system') {
              iconName = 'shield-checkmark';
              iconBg = '#F1F5F9';
              iconColor = '#2B2928';
            }

            return {
              id: docSnap.id,
              kind: 'notification',
              type: notifType,
              title: data.title || 'Thông báo từ Tiệm Nhà Gốm',
              message: data.body || '',
              time: timeStr,
              createdAtMs: ms,
              isRead: currentReadIds.has(docSnap.id),
              icon: iconName,
              iconBg,
              iconColor,
              imageUrl: data.imageUrl || undefined,
              link: data.link || (notifType === 'promo' ? '/(tabs)/deals' : undefined),
            };
          });
      }

      // C. Xử lý thông báo riêng của user
      let customUserNotifs: UnifiedFeedItem[] = [];
      if (snapUserNotifsRes.status === 'fulfilled' && snapUserNotifsRes.value) {
        customUserNotifs = snapUserNotifsRes.value.docs
          .filter((docSnap) => !deletedIds.has(docSnap.id))
          .map((docSnap) => {
            const data = docSnap.data();
            const { timeStr, ms } = formatTimeFriendly(data.createdAt);
            const isRead = currentReadIds.has(docSnap.id) || Boolean(data.isRead);

            let iconName: any = 'receipt';
            if (data.stage === 'pos') iconName = 'storefront';
            else if (data.stage === 'shipping') iconName = 'cube';
            else if (data.stage === 'completed') iconName = 'checkmark-circle';
            else if (data.stage === 'gift' || data.type === 'gift') iconName = 'gift';
            else if (data.icon) iconName = data.icon;

            // Trích xuất giftId thông minh
            let rawGiftId = data.giftId;
            if (!rawGiftId && docSnap.id) {
              if (docSnap.id.startsWith('claimed_')) rawGiftId = docSnap.id.replace('claimed_', '');
              else if (docSnap.id.startsWith('rejected_')) rawGiftId = docSnap.id.replace('rejected_', '');
              else if (docSnap.id.startsWith('gift_')) rawGiftId = docSnap.id.replace('gift_', '');
            }
            if (!rawGiftId && data.link && data.link.includes('gift-claim')) {
              rawGiftId = data.link.split('id=')[1];
            }
            const cleanGiftId = (rawGiftId || '').trim().toUpperCase();
            const createdAtMs = data.createdAtMs || ms;

            const isClaimedGift =
              docSnap.id.startsWith('claimed_') ||
              data.giftStatus === 'claimed' ||
              Boolean(data.title && (data.title.includes('đã nhận') || data.title.includes('da nhan'))) ||
              Boolean(data.message && (data.message.includes('trao gửi trọn vẹn') || data.message.includes('trao goi tron ven')));

            const isCanceledGift =
              docSnap.id.startsWith('rejected_') ||
              data.giftStatus === 'canceled' ||
              Boolean(data.title && (data.title.includes('từ chối') || data.title.includes('tu choi')));

            const isGift =
              data.type === 'gift' ||
              data.stage === 'gift' ||
              Boolean(cleanGiftId) ||
              isClaimedGift ||
              isCanceledGift ||
              (data.link && data.link.includes('gift-claim'));

            let giftStatus: 'pending' | 'claimed' | 'canceled' = data.giftStatus || (data.status as any) || 'pending';
            if (isClaimedGift) {
              giftStatus = 'claimed';
              if (cleanGiftId) claimedGiftIds.add(cleanGiftId);
            } else if (isCanceledGift) {
              giftStatus = 'canceled';
            } else if (cleanGiftId && claimedGiftIds.has(cleanGiftId)) {
              giftStatus = 'claimed';
            } else if (cleanGiftId && (localGifts[cleanGiftId] || localGifts[rawGiftId])) {
              const g = localGifts[cleanGiftId] || localGifts[rawGiftId];
              if (g.status) giftStatus = g.status;
            }

            // Thời gian hết hạn: CHỈ tính nếu là món quà đang chờ nhận (pending)
            let expiresAt: string | undefined = undefined;
            let expiresAtMs: number | undefined = undefined;
            if (isGift && giftStatus === 'pending') {
              expiresAt = data.expiresAt;
              expiresAtMs = data.expiresAtMs;
              if (cleanGiftId && (localGifts[cleanGiftId] || localGifts[rawGiftId])) {
                const g = localGifts[cleanGiftId] || localGifts[rawGiftId];
                if (g.expiresAt) expiresAt = g.expiresAt;
              }
              if (!expiresAt && createdAtMs) {
                expiresAt = new Date(createdAtMs + 24 * 60 * 60 * 1000).toISOString();
                expiresAtMs = createdAtMs + 24 * 60 * 60 * 1000;
              }
            }

            // Link điều hướng thông minh
            let notifLink = data.link;
            if (!notifLink || notifLink === '/orders') {
              if (isClaimedGift || docSnap.id.startsWith('claimed_')) {
                notifLink = `/notification-detail?id=${docSnap.id}&type=gift&giftId=${cleanGiftId}&giftStatus=claimed`;
              } else if (isCanceledGift || docSnap.id.startsWith('rejected_')) {
                notifLink = `/notification-detail?id=${docSnap.id}&type=gift&giftId=${cleanGiftId}&giftStatus=canceled`;
              } else if (isGift) {
                notifLink = cleanGiftId ? `/gift-claim?id=${cleanGiftId}` : '/points-history';
              } else if (data.orderId) {
                notifLink = `/order-detail?orderId=${data.orderId}`;
              } else {
                notifLink = `/notification-detail?id=${docSnap.id}`;
              }
            }

            return {
              id: docSnap.id,
              kind: 'notification',
              type: isGift ? 'system' : 'order',
              title: data.title || (isGift ? '🎁 Món quà Điểm Gốm' : `Đơn hàng #${data.orderCode || ''}`),
              message: data.message || '',
              time: timeStr,
              createdAtMs,
              isRead,
              icon: iconName,
              iconBg: data.iconBg || (isGift ? '#FAF7F2' : data.stage === 'pos' ? '#FAF7F2' : '#F6F4EC'),
              iconColor: data.iconColor || '#9C7156',
              imageUrl: data.imageUrl,
              link: notifLink,
              giftId: cleanGiftId || rawGiftId,
              expiresAt,
              expiresAtMs,
              isGift,
              giftStatus,
            };
          });
      }

      // D. Xử lý thông báo tạo từ danh sách đơn hàng
      let userOrderNotifs: UnifiedFeedItem[] = [];
      if (userOrdersRes.status === 'fulfilled' && Array.isArray(userOrdersRes.value)) {
        const generatedNotifs = generateOrderNotificationsFromOrders(
          userOrdersRes.value,
          currentReadIds,
          deletedIds
        );
        userOrderNotifs = generatedNotifs.map((item) => ({
          id: item.id,
          kind: 'notification',
          type: 'order',
          title: item.title,
          message: item.message,
          time: item.time,
          createdAtMs: item.createdAtMs,
          isRead: item.isRead,
          icon: item.icon as any,
          iconBg: item.iconBg,
          iconColor: item.iconColor,
          imageUrl: item.imageUrl,
          link: item.link,
        }));
      }

      // E. Tải thông báo cục bộ từ AsyncStorage
      let localNotifs: UnifiedFeedItem[] = [];
      try {
        const rawLocal = await AsyncStorage.getItem(LOCAL_NOTIFS_KEY);
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed)) {
            localNotifs = parsed.map((item: any) => {
              const isGift = item.type === 'gift' || Boolean(item.giftId) || (item.link && item.link.includes('gift-claim'));
              const giftId = item.giftId || (item.link && item.link.includes('gift-claim') ? item.link.split('id=')[1] : undefined);
              const cleanGiftId = (giftId || '').trim().toUpperCase();
              const createdAtMs = Number(item.id) || Date.now();
              let giftStatus: 'pending' | 'claimed' | 'canceled' = item.giftStatus || 'pending';
              let expiresAt = item.expiresAt;

              if (cleanGiftId && claimedGiftIds.has(cleanGiftId)) {
                giftStatus = 'claimed';
              } else if (giftId && (localGifts[giftId] || localGifts[cleanGiftId])) {
                const g = localGifts[giftId] || localGifts[cleanGiftId];
                if (g.status) giftStatus = g.status;
                if (g.expiresAt) expiresAt = g.expiresAt;
              }
              if (!expiresAt && createdAtMs) {
                expiresAt = new Date(createdAtMs + 24 * 60 * 60 * 1000).toISOString();
              }
              return {
                id: item.id || Date.now().toString(),
                kind: 'notification',
                type: (item.type || 'promo') as NotificationType,
                title: item.title || 'Thông báo mới',
                message: item.message || '',
                time: item.time || 'Vừa xong',
                createdAtMs,
                isRead: currentReadIds.has(item.id),
                icon: item.icon || (isGift ? 'gift' : 'notifications'),
                iconBg: item.iconBg || (isGift ? '#FAF7F2' : '#F3E5DC'),
                iconColor: item.iconColor || '#9C7156',
                imageUrl: item.imageUrl,
                link: item.link,
                giftId,
                expiresAt,
                expiresAtMs: expiresAt ? new Date(expiresAt).getTime() : undefined,
                isGift,
                giftStatus,
              };
            });
          }
        }
      } catch {}

      // F. Đồng bộ trạng thái thực tế từ Firestore points_gifts nếu còn item quà tặng nào pending
      const allGiftItems = [...userOrderNotifs, ...customUserNotifs, ...localNotifs].filter(
        (it) => it.isGift && it.giftId && it.giftStatus === 'pending'
      );
      if (allGiftItems.length > 0) {
        await Promise.all(
          allGiftItems.map(async (item) => {
            try {
              const cleanCode = (item.giftId || '').trim().toUpperCase();
              const gSnap = await getDoc(doc(db, 'points_gifts', cleanCode));
              if (gSnap.exists()) {
                const gData = gSnap.data();
                if (gData.status) {
                  item.giftStatus = gData.status;
                  if (gData.status === 'claimed') {
                    claimedGiftIds.add(cleanCode);
                  }
                }
              }
            } catch {}
          })
        );
        if (claimedGiftIds.size > 0) {
          AsyncStorage.setItem('tiemnhagom_claimed_gifts', JSON.stringify([...claimedGiftIds])).catch(() => {});
        }
      }

      // G. Gộp tất cả thông báo và loại trừ trùng lặp
      const combinedNotifs = [...userOrderNotifs, ...customUserNotifs, ...firestoreNotifs, ...localNotifs].filter(
        (val, idx, arr) =>
          idx === arr.findIndex((x) => x.id === val.id || (x.title === val.title && x.message === val.message))
      );

      // H. Hợp nhất cả Thông báo và Bài viết, sắp xếp mới nhất lên đầu
      const allUnified = [...combinedNotifs, ...newsItems].sort(
        (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
      );

      _cachedFeed = allUnified;
      _lastPreloadedAt = Date.now();

      // Lưu đệm xuống AsyncStorage để dùng ngay lập tức cho các lần mở app tiếp theo
      AsyncStorage.setItem(CACHED_FEED_KEY, JSON.stringify(allUnified)).catch(() => {});

      return allUnified;
    } catch (e) {
      console.warn('Lỗi preloadNotificationFeed:', e);
      return _cachedFeed;
    } finally {
      _isPreloading = false;
      _preloadPromise = null;
    }
  })();

  return _preloadPromise;
}

