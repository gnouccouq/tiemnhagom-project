// src/context/NotificationBadgeContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { db, auth } from '../config/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { DELETED_NOTIFS_KEY } from '../services/orderNotificationService';
import { initPersistedNotificationFeed } from '../services/notificationFeedService';
import { READ_IDS_KEY, LOCAL_NOTIFS_KEY } from '../constants/notificationKeys';
import { showInAppNotification, inAppNotification } from '../services/inAppNotificationService';

export { READ_IDS_KEY, LOCAL_NOTIFS_KEY };

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let Notifications: any = null;
if (!(isExpoGo && Platform.OS === 'android')) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    // Graceful fallback
  }
}

interface NotificationBadgeContextType {
  unreadCount: number;
  unreadNotifsCount: number;
  unreadNewsCount: number;
  readIds: Set<string>;
  setUnreadCount: (count: number) => void;
  markAsRead: (idOrIds: string | string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshBadge: () => Promise<void>;
}

const NotificationBadgeContext = createContext<NotificationBadgeContextType>({
  unreadCount: 0,
  unreadNotifsCount: 0,
  unreadNewsCount: 0,
  readIds: new Set<string>(),
  setUnreadCount: () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  refreshBadge: async () => {},
});

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState<number>(0);
  const [unreadNewsCount, setUnreadNewsCount] = useState<number>(0);
  const [readIds, setReadIds] = useState<Set<string>>(new Set<string>());

  const latestGlobalNotifIdsRef = useRef<string[]>([]);
  const latestUserDocNotifIdsRef = useRef<string[]>([]);
  const latestOrderDerivedNotifIdsRef = useRef<string[]>([]);
  const latestNewsIdsRef = useRef<string[]>([]);
  const readIdsRef = useRef<Set<string>>(new Set<string>());
  const deletedIdsRef = useRef<Set<string>>(new Set<string>());
  const currentUserIdRef = useRef<string | null>(null);

  // Sync ref with state
  useEffect(() => {
    readIdsRef.current = readIds;
  }, [readIds]);

  // Load persisted deleted notification IDs
  const loadDeletedIds = useCallback(async (): Promise<Set<string>> => {
    try {
      const raw = await AsyncStorage.getItem(DELETED_NOTIFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const s = new Set<string>(parsed);
          deletedIdsRef.current = s;
          return s;
        }
      }
    } catch {}
    return new Set<string>();
  }, []);

  // Load persisted read IDs
  const loadReadIds = useCallback(async (): Promise<Set<string>> => {
    try {
      const raw = await AsyncStorage.getItem(READ_IDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const s = new Set<string>(parsed);
          setReadIds(s);
          readIdsRef.current = s;
          return s;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc readIds từ AsyncStorage:', e);
    }
    return new Set<string>();
  }, []);

  // Compute counts based on read IDs and current list of item IDs
  const recomputeCounts = useCallback((currentReadIds: Set<string>) => {
    const deleted = deletedIdsRef.current;

    // 1. Notifs (Global + Account User Notifs + Order Notifs) loại trừ các ID đã xóa
    const allNotifIds = Array.from(
      new Set([
        ...latestGlobalNotifIdsRef.current,
        ...latestUserDocNotifIdsRef.current,
        ...latestOrderDerivedNotifIdsRef.current,
      ])
    ).filter((id) => !deleted.has(id));

    const unreadNotifs = allNotifIds.filter((id) => !currentReadIds.has(id)).length;

    // 2. News
    const unreadNews = latestNewsIdsRef.current.filter((id) => !currentReadIds.has(id)).length;

    // 3. Total
    const total = unreadNotifs + unreadNews;

    setUnreadNotifsCount(unreadNotifs);
    setUnreadNewsCount(unreadNews);
    setUnreadCount(total);

    // Update app icon badge if available
    if (Notifications && typeof Notifications.setBadgeCountAsync === 'function') {
      try {
        Notifications.setBadgeCountAsync(total).catch(() => {});
      } catch {}
    }
  }, []);

  // Listeners for Global notifications & News
  useEffect(() => {
    let unsubscribeNotifs: (() => void) | null = null;
    let unsubscribeNews: (() => void) | null = null;

    const setupListeners = async () => {
      await initPersistedNotificationFeed();
      await loadDeletedIds();
      await loadReadIds();

      // Read local push notifications as well
      let localIds: string[] = [];
      try {
        const localRaw = await AsyncStorage.getItem(LOCAL_NOTIFS_KEY);
        if (localRaw) {
          const parsed = JSON.parse(localRaw);
          if (Array.isArray(parsed)) {
            localIds = parsed.map((item: any) => item.id).filter(Boolean);
          }
        }
      } catch {}

      // Listener 1: Firestore global_notifications
      try {
        const notifQuery = query(
          collection(db, 'global_notifications'),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        let isFirstNotifSnapshot = true;
        unsubscribeNotifs = onSnapshot(
          notifQuery,
          (snapshot) => {
            const firestoreIds = snapshot.docs.map((d) => d.id);
            const combined = Array.from(new Set([...firestoreIds, ...localIds]));
            latestGlobalNotifIdsRef.current = combined;
            recomputeCounts(readIdsRef.current);

            // Bỏ qua pop-up cho lần đọc dữ liệu đầu tiên khi mở app
            if (isFirstNotifSnapshot) {
              isFirstNotifSnapshot = false;
              return;
            }

            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                const notifId = change.doc.id;

                // Nếu thông báo đã xem hoặc đã xóa -> tuyệt đối không hiện push lặp lại
                if (
                  readIdsRef.current.has(notifId) ||
                  deletedIdsRef.current.has(notifId) ||
                  data.isRead
                ) {
                  return;
                }

                showInAppNotification({
                  id: notifId,
                  title: data.title || 'Thông báo mới từ Tiệm',
                  message: data.message || data.body || '',
                  imageUrl: data.imageUrl || data.image,
                  link: data.link || data.url || `/notification-detail?id=${notifId}`,
                  type: 'system',
                  isRead: Boolean(data.isRead),
                });
              }
            });
          },
          () => {} // Bỏ qua lỗi thầm lặng
        );
      } catch {}

      // Listener 2: Firestore news (tin tức & bài viết)
      try {
        const newsQuery = query(
          collection(db, 'news'),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        unsubscribeNews = onSnapshot(
          newsQuery,
          (snapshot) => {
            const newsIds = snapshot.docs.map((d) => d.id);
            latestNewsIdsRef.current = newsIds;
            recomputeCounts(readIdsRef.current);
          },
          () => {} // Bỏ qua lỗi thầm lặng
        );
      } catch {}
    };

    setupListeners();

    // Listen to incoming push notifications while app is in foreground
    let pushSub: any = null;
    if (Notifications && typeof Notifications.addNotificationReceivedListener === 'function') {
      try {
        pushSub = Notifications.addNotificationReceivedListener((notification: any) => {
          const id = notification?.request?.identifier || Date.now().toString();
          const content = notification?.request?.content;
          const title = content?.title || 'Thông báo mới';
          const body = content?.body || '';
          const data = content?.data || {};

          if (!latestGlobalNotifIdsRef.current.includes(id)) {
            latestGlobalNotifIdsRef.current = [id, ...latestGlobalNotifIdsRef.current];
            recomputeCounts(readIdsRef.current);
          }

          // Kiểm tra nếu thông báo này đã được xem / xóa
          if (readIdsRef.current.has(id) || deletedIdsRef.current.has(id)) {
            return;
          }

          showInAppNotification({
            id,
            title,
            message: body,
            imageUrl: data?.imageUrl || data?.image,
            link: data?.link || data?.url,
            type: data?.type || 'system',
          });
        });
      } catch {}
    }

    return () => {
      unsubscribeNotifs?.();
      unsubscribeNews?.();
      pushSub?.remove?.();
    };
  }, [loadDeletedIds, loadReadIds, recomputeCounts]);

  // Listener for Account-Specific Order Notifications & Realtime Orders
  useEffect(() => {
    let unsubscribeUserNotifs: (() => void) | null = null;
    let unsubscribeOrders: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      currentUserIdRef.current = user ? user.uid : null;

      if (unsubscribeUserNotifs) {
        unsubscribeUserNotifs();
        unsubscribeUserNotifs = null;
      }
      if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
      }

      if (!user) {
        latestUserDocNotifIdsRef.current = [];
        latestOrderDerivedNotifIdsRef.current = [];
        recomputeCounts(readIdsRef.current);
        return;
      }

      // 1. Lắng nghe đơn hàng để tự động suy ra các ID thông báo đơn hàng
      try {
        const ordersQuery = query(
          collection(db, 'orders'),
          where('userId', '==', user.uid)
        );
        let isFirstOrderSnapshot = true;
        unsubscribeOrders = onSnapshot(
          ordersQuery,
          (snapshot) => {
            const derivedIds: string[] = [];
            snapshot.docs.forEach((docSnap) => {
              const order = docSnap.data();
              const orderId = docSnap.id;
              const orderCode = (order.orderCode || order.orderId || order.code || orderId).toString().toUpperCase();
              const isPos =
                order.source === 'pos' ||
                order.orderSource === 'pos' ||
                order.channel === 'pos' ||
                order.inStore ||
                orderCode.startsWith('POS');
              const statusRaw = (order.status || '').toString().toLowerCase();

              if (isPos) {
                derivedIds.push(`order_${orderId}_pos`);
              } else {
                derivedIds.push(`order_${orderId}_created`);
                if (statusRaw === 'shipping' || statusRaw.includes('đang giao') || statusRaw.includes('vận chuyển')) {
                  derivedIds.push(`order_${orderId}_shipping`);
                }
                if (statusRaw === 'completed' || statusRaw.includes('hoàn thành') || statusRaw.includes('đã giao') || statusRaw.includes('hoàn tất')) {
                  derivedIds.push(`order_${orderId}_completed`);
                }
              }
            });

            latestOrderDerivedNotifIdsRef.current = derivedIds;
            recomputeCounts(readIdsRef.current);

            // Bỏ qua pop-up cho lần đọc dữ liệu đầu tiên khi mở app
            if (isFirstOrderSnapshot) {
              isFirstOrderSnapshot = false;
              return;
            }

            snapshot.docChanges().forEach((change) => {
              const order = change.doc.data();
              const orderId = change.doc.id;
              const orderCode = (order.orderCode || order.orderId || order.code || orderId).toString().toUpperCase();
              const statusRaw = (order.status || '').toString().toLowerCase();

              if (change.type === 'added') {
                const derivedId = `order_${orderId}_created`;
                if (readIdsRef.current.has(derivedId) || deletedIdsRef.current.has(derivedId)) {
                  return;
                }
                showInAppNotification({
                  id: derivedId,
                  title: `Đơn hàng #${orderCode} đã đặt thành công`,
                  message: `Tiệm Nhà Gốm đã ghi nhận đơn hàng và đang chuẩn bị đóng gói.`,
                  link: `/order-detail?orderId=${orderId}`,
                  type: 'order',
                  icon: 'cube',
                });
              } else if (change.type === 'modified') {
                if (statusRaw === 'shipping' || statusRaw.includes('đang giao') || statusRaw.includes('vận chuyển')) {
                  const derivedId = `order_${orderId}_shipping`;
                  if (readIdsRef.current.has(derivedId) || deletedIdsRef.current.has(derivedId)) {
                    return;
                  }
                  showInAppNotification({
                    id: derivedId,
                    title: `Đơn hàng #${orderCode} đang giao`,
                    message: `Đơn hàng của bạn đang trên đường vận chuyển tới địa chỉ nhận.`,
                    link: `/order-detail?orderId=${orderId}`,
                    type: 'order',
                    icon: 'bicycle',
                  });
                } else if (statusRaw === 'completed' || statusRaw.includes('hoàn thành') || statusRaw.includes('đã giao') || statusRaw.includes('hoàn tất')) {
                  const derivedId = `order_${orderId}_completed`;
                  if (readIdsRef.current.has(derivedId) || deletedIdsRef.current.has(derivedId)) {
                    return;
                  }
                  showInAppNotification({
                    id: derivedId,
                    title: `Đơn hàng #${orderCode} giao thành công`,
                    message: `Cảm ơn bạn đã mua sắm tại Tiệm Nhà Gốm! Điểm gốm đã được cộng vào tài khoản.`,
                    link: `/order-detail?orderId=${orderId}`,
                    type: 'order',
                    icon: 'checkmark-circle',
                  });
                }
              }
            });
          },
          () => {} // Thầm lặng bỏ qua nếu có lỗi
        );
      } catch {}

      // 2. Lắng nghe subcollection users/{userId}/notifications (nếu có thông báo riêng từ admin)
      try {
        const userNotifQuery = query(
          collection(db, 'users', user.uid, 'notifications'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        let isFirstUserNotifSnapshot = true;
        unsubscribeUserNotifs = onSnapshot(
          userNotifQuery,
          (snapshot) => {
            const userNotifIds: string[] = [];
            const readIdsFromDocs: string[] = [];

            snapshot.docs.forEach((docSnap) => {
              const d = docSnap.data();
              userNotifIds.push(docSnap.id);
              if (d.isRead) {
                readIdsFromDocs.push(docSnap.id);
              }
            });

            latestUserDocNotifIdsRef.current = userNotifIds;

            // Merge any read IDs from docs into readIdsRef
            if (readIdsFromDocs.length > 0) {
              const updated = new Set<string>(readIdsRef.current);
              let changed = false;
              readIdsFromDocs.forEach((id) => {
                if (!updated.has(id)) {
                  updated.add(id);
                  changed = true;
                }
              });
              if (changed) {
                setReadIds(updated);
                readIdsRef.current = updated;
              }
            }

            recomputeCounts(readIdsRef.current);

            // Bỏ qua pop-up cho lần đọc dữ liệu đầu tiên khi mở app
            if (isFirstUserNotifSnapshot) {
              isFirstUserNotifSnapshot = false;
              return;
            }

            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                const notifId = change.doc.id;

                if (
                  readIdsRef.current.has(notifId) ||
                  deletedIdsRef.current.has(notifId) ||
                  data.isRead
                ) {
                  return;
                }

                showInAppNotification({
                  id: notifId,
                  title: data.title || 'Thông báo mới',
                  message: data.message || data.body || '',
                  imageUrl: data.imageUrl || data.image,
                  link: data.link || data.url || `/notification-detail?id=${notifId}`,
                  type: 'system',
                  isRead: Boolean(data.isRead),
                });
              }
            });
          },
          () => {} // Thầm lặng bỏ qua nếu rules hoặc mạng chưa sẵn sàng
        );
      } catch {}
    });

    return () => {
      authUnsub();
      if (unsubscribeUserNotifs) unsubscribeUserNotifs();
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, [recomputeCounts]);

  // Mark single or multiple IDs as read
  const markAsRead = useCallback(
    async (idOrIds: string | string[]) => {
      const idsToAdd = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      if (idsToAdd.length === 0) return;

      const updated = new Set<string>(readIdsRef.current);
      let changed = false;
      idsToAdd.forEach((id) => {
        if (!updated.has(id)) {
          updated.add(id);
          changed = true;
        }
      });

      if (changed) {
        setReadIds(updated);
        readIdsRef.current = updated;
        inAppNotification.markAsRead(idsToAdd);
        recomputeCounts(updated);
        try {
          await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(updated)));
        } catch (e) {
          console.warn('Lỗi lưu readIds:', e);
        }

        // Cập nhật trạng thái isRead trong Firestore users/{userId}/notifications nếu là thông báo đơn hàng
        const uid = currentUserIdRef.current;
        if (uid) {
          idsToAdd.forEach((id) => {
            if (id.startsWith('order_')) {
              updateDoc(doc(db, 'users', uid, 'notifications', id), { isRead: true }).catch(() => {});
            }
          });
        }
      }
    },
    [recomputeCounts]
  );

  // Mark all currently tracked notifications and news as read
  const markAllAsRead = useCallback(async () => {
    const allIds = Array.from(
      new Set([
        ...latestGlobalNotifIdsRef.current,
        ...latestUserDocNotifIdsRef.current,
        ...latestOrderDerivedNotifIdsRef.current,
        ...latestNewsIdsRef.current,
        ...Array.from(readIdsRef.current),
      ])
    );
    const updated = new Set<string>(allIds);
    setReadIds(updated);
    readIdsRef.current = updated;
    inAppNotification.markAsRead(allIds);
    recomputeCounts(updated);
    try {
      await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(allIds));
    } catch (e) {
      console.warn('Lỗi lưu markAllAsRead:', e);
    }

    const uid = currentUserIdRef.current;
    if (uid) {
      latestUserDocNotifIdsRef.current.forEach((id) => {
        if (id.startsWith('order_')) {
          updateDoc(doc(db, 'users', uid, 'notifications', id), { isRead: true }).catch(() => {});
        }
      });
    }
  }, [recomputeCounts]);

  // Manual refresh
  const refreshBadge = useCallback(async () => {
    await loadDeletedIds();
    const current = await loadReadIds();
    recomputeCounts(current);
  }, [loadDeletedIds, loadReadIds, recomputeCounts]);

  return (
    <NotificationBadgeContext.Provider
      value={{
        unreadCount,
        unreadNotifsCount,
        unreadNewsCount,
        readIds,
        setUnreadCount,
        markAsRead,
        markAllAsRead,
        refreshBadge,
      }}
    >
      {children}
    </NotificationBadgeContext.Provider>
  );
}

export function useNotificationBadge() {
  return useContext(NotificationBadgeContext);
}
