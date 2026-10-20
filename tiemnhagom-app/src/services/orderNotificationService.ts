// src/services/orderNotificationService.ts
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { db } from '../config/firebase';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let Notifications: any = null;
if (!(isExpoGo && Platform.OS === 'android')) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    // Graceful fallback
  }
}

export const DELETED_NOTIFS_KEY = '@tiemnhagom_deleted_notif_ids';

export type OrderNotificationStage = 'created' | 'shipping' | 'completed' | 'pos';

export interface OrderNotificationItem {
  id: string;
  kind: 'notification';
  type: 'order';
  stage: OrderNotificationStage;
  title: string;
  message: string;
  time: string;
  createdAtMs: number;
  isRead: boolean;
  link: string;
  imageUrl?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  totalAmount?: number;
}

// Format price utility
export const formatVND = (amount?: number): string => {
  if (!amount || isNaN(amount)) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
};

// Helper chuyển đổi Date sang chuỗi thời gian thân thiện
export const formatFriendlyTime = (timestamp: any): { timeStr: string; ms: number } => {
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
};

// Trigger local push notification banner
async function triggerLocalPush(title: string, body: string, dataPayload: any) {
  if (Notifications && typeof Notifications.scheduleNotificationAsync === 'function') {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: dataPayload,
          sound: true,
          color: '#9C7156',
        },
        trigger: null, // Send immediately
      });
    } catch (e) {
      // Ignore background/permission errors
    }
  }
}

/**
 * Tự động chuyển đổi danh sách Đơn hàng của khách thành các Thông báo chi tiết
 * Chạy 100% an toàn ở client, không phụ thuộc quyền subcollection của Firestore
 */
export function generateOrderNotificationsFromOrders(
  orders: any[],
  readIds: Set<string> = new Set(),
  deletedIds: Set<string> = new Set()
): OrderNotificationItem[] {
  if (!Array.isArray(orders) || orders.length === 0) return [];

  const items: OrderNotificationItem[] = [];

  for (const order of orders) {
    const orderId = order.id;
    if (!orderId) continue;

    const orderCode = (order.orderCode || order.orderId || order.code || orderId).toString();
    const upperCode = orderCode.toUpperCase();
    const totalAmount = Number(order.totalAmount || order.total || order.subtotal || 0);
    const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null;
    const imageUrl = firstItem?.resolvedImage || firstItem?.imageUrl || firstItem?.image || undefined;

    const { timeStr, ms } = formatFriendlyTime(order.createdAt || order.orderDate);

    // Kiểm tra loại đơn: POS hay Online
    const isPos =
      order.source === 'pos' ||
      order.orderSource === 'pos' ||
      order.channel === 'pos' ||
      order.inStore ||
      upperCode.startsWith('POS');

    const statusRaw = (order.status || '').toString().toLowerCase();

    if (isPos) {
      // 4. Mua tại quầy POS
      const posId = `order_${orderId}_pos`;
      if (!deletedIds.has(posId)) {
        items.push({
          id: posId,
          kind: 'notification',
          type: 'order',
          stage: 'pos',
          title: `Mua sắm tại quầy #${orderCode}`,
          message: totalAmount > 0
            ? `Cảm ơn bạn đã ghé thăm showroom Tiệm Nhà Gốm! Đơn hàng trị giá ${formatVND(totalAmount)} và điểm tích lũy đã được ghi nhận vào tài khoản.`
            : `Cảm ơn bạn đã ghé thăm showroom Tiệm Nhà Gốm! Đơn hàng #${orderCode} và điểm tích lũy đã được ghi nhận vào tài khoản.`,
          time: timeStr,
          createdAtMs: ms,
          isRead: readIds.has(posId),
          link: `/order-detail?orderId=${orderId}`,
          imageUrl,
          icon: 'storefront',
          iconBg: '#FAF7F2',
          iconColor: '#9C7156',
          totalAmount,
        });
      }
    } else {
      // Đơn hàng Online:

      // 1. Thông báo đặt hàng thành công
      const createdId = `order_${orderId}_created`;
      if (!deletedIds.has(createdId)) {
        items.push({
          id: createdId,
          kind: 'notification',
          type: 'order',
          stage: 'created',
          title: `Đơn hàng #${orderCode} đã đặt thành công`,
          message: totalAmount > 0
            ? `Tiệm Nhà Gốm đã nhận đơn hàng trị giá ${formatVND(totalAmount)}. Tiệm đang chuẩn bị các món đồ gốm để gửi đến bạn.`
            : `Tiệm Nhà Gốm đã nhận đơn hàng #${orderCode}. Tiệm đang chuẩn bị các món đồ gốm để gửi đến bạn.`,
          time: timeStr,
          createdAtMs: ms,
          isRead: readIds.has(createdId),
          link: `/order-detail?orderId=${orderId}`,
          imageUrl,
          icon: 'receipt',
          iconBg: '#F6F4EC',
          iconColor: '#9C7156',
          totalAmount,
        });
      }

      // 2. Thông báo khi giao hàng (shipping)
      const isShipping =
        statusRaw === 'shipping' ||
        statusRaw.includes('đang giao') ||
        statusRaw.includes('vận chuyển');

      if (isShipping) {
        const shippingId = `order_${orderId}_shipping`;
        if (!deletedIds.has(shippingId)) {
          items.push({
            id: shippingId,
            kind: 'notification',
            type: 'order',
            stage: 'shipping',
            title: `Đơn hàng #${orderCode} đang được giao`,
            message: `Kiện hàng đồ gốm đã được bọc xốp chống sốc cẩn thận và đang trên đường vận chuyển tới địa chỉ của bạn.`,
            time: timeStr,
            createdAtMs: ms + 1000, // Đặt sau một chút để sắp xếp trên đơn tạo
            isRead: readIds.has(shippingId),
            link: `/order-detail?orderId=${orderId}`,
            imageUrl,
            icon: 'cube',
            iconBg: '#F6F4EC',
            iconColor: '#9C7156',
            totalAmount,
          });
        }
      }

      // 3. Thông báo khi hoàn thành (completed)
      const isCompleted =
        statusRaw === 'completed' ||
        statusRaw.includes('hoàn thành') ||
        statusRaw.includes('đã giao') ||
        statusRaw.includes('hoàn tất');

      if (isCompleted) {
        const completedId = `order_${orderId}_completed`;
        if (!deletedIds.has(completedId)) {
          items.push({
            id: completedId,
            kind: 'notification',
            type: 'order',
            stage: 'completed',
            title: `Đơn hàng #${orderCode} đã hoàn tất`,
            message: `Đơn hàng đã được giao thành công. Cảm ơn bạn đã tin chọn các tác phẩm gốm thủ công của Tiệm!`,
            time: timeStr,
            createdAtMs: ms + 2000,
            isRead: readIds.has(completedId),
            link: `/order-detail?orderId=${orderId}`,
            imageUrl,
            icon: 'checkmark-circle',
            iconBg: '#F6F4EC',
            iconColor: '#9C7156',
            totalAmount,
          });
        }
      }
    }
  }

  // Sắp xếp giảm dần theo thời gian
  return items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

/**
 * 1. Thông báo khi khách đặt hàng thành công
 */
export async function createOrderPlacedNotification(
  userId: string,
  orderId: string,
  orderCode: string,
  totalAmount?: number,
  imageUrl?: string
): Promise<void> {
  const title = `Đơn hàng #${orderCode} đã đặt thành công`;
  const message = totalAmount
    ? `Tiệm Nhà Gốm đã nhận đơn hàng trị giá ${formatVND(totalAmount)}. Tiệm đang chuẩn bị các món đồ gốm để gửi đến bạn.`
    : `Tiệm Nhà Gốm đã nhận đơn hàng #${orderCode}. Tiệm đang chuẩn bị các món đồ gốm để gửi đến bạn.`;

  await triggerLocalPush(title, message, { orderId, orderCode, link: `/order-detail?orderId=${orderId}` });

  if (!userId || userId === 'guest' || !orderId) return;

  try {
    const docId = `order_${orderId}_created`;
    const notifRef = doc(db, 'users', userId, 'notifications', docId);
    await setDoc(
      notifRef,
      {
        id: docId,
        userId,
        orderId,
        orderCode,
        type: 'order',
        stage: 'created',
        title,
        message,
        link: `/order-detail?orderId=${orderId}`,
        totalAmount,
        imageUrl,
        icon: 'receipt',
        iconBg: '#F6F4EC',
        iconColor: '#9C7156',
        isRead: false,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    // Không ném lỗi nếu Firestore rules chưa mở subcollection
  }
}

/**
 * 2. Thông báo khi đơn hàng đang giao
 */
export async function createOrderShippingNotification(
  userId: string,
  orderId: string,
  orderCode: string,
  totalAmount?: number,
  imageUrl?: string
): Promise<void> {
  const title = `Đơn hàng #${orderCode} đang được giao`;
  const message = `Kiện hàng đồ gốm đã được bọc xốp chống sốc cẩn thận và đang trên đường vận chuyển tới địa chỉ của bạn.`;

  await triggerLocalPush(title, message, { orderId, orderCode, link: `/order-detail?orderId=${orderId}` });

  if (!userId || userId === 'guest' || !orderId) return;

  try {
    const docId = `order_${orderId}_shipping`;
    const notifRef = doc(db, 'users', userId, 'notifications', docId);
    await setDoc(
      notifRef,
      {
        id: docId,
        userId,
        orderId,
        orderCode,
        type: 'order',
        stage: 'shipping',
        title,
        message,
        link: `/order-detail?orderId=${orderId}`,
        totalAmount,
        imageUrl,
        icon: 'cube',
        iconBg: '#F6F4EC',
        iconColor: '#9C7156',
        isRead: false,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    // Thầm lặng bỏ qua
  }
}

/**
 * 3. Thông báo khi đơn hàng hoàn thành
 */
export async function createOrderCompletedNotification(
  userId: string,
  orderId: string,
  orderCode: string,
  totalAmount?: number,
  imageUrl?: string
): Promise<void> {
  const title = `Đơn hàng #${orderCode} đã hoàn tất`;
  const message = `Đơn hàng đã được giao thành công. Cảm ơn bạn đã tin chọn các tác phẩm gốm thủ công của Tiệm!`;

  await triggerLocalPush(title, message, { orderId, orderCode, link: `/order-detail?orderId=${orderId}` });

  if (!userId || userId === 'guest' || !orderId) return;

  try {
    const docId = `order_${orderId}_completed`;
    const notifRef = doc(db, 'users', userId, 'notifications', docId);
    await setDoc(
      notifRef,
      {
        id: docId,
        userId,
        orderId,
        orderCode,
        type: 'order',
        stage: 'completed',
        title,
        message,
        link: `/order-detail?orderId=${orderId}`,
        totalAmount,
        imageUrl,
        icon: 'checkmark-circle',
        iconBg: '#F6F4EC',
        iconColor: '#9C7156',
        isRead: false,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    // Thầm lặng bỏ qua
  }
}

/**
 * 4. Thông báo khi khách mua tại cửa hàng (đơn hàng POS)
 */
export async function createPosPurchaseNotification(
  userId: string,
  orderId: string,
  orderCode: string,
  totalAmount?: number,
  imageUrl?: string
): Promise<void> {
  const title = `Mua sắm tại quầy #${orderCode}`;
  const message = totalAmount
    ? `Cảm ơn bạn đã ghé thăm showroom Tiệm Nhà Gốm! Đơn hàng ${formatVND(totalAmount)} và điểm tích lũy đã được ghi nhận vào tài khoản.`
    : `Cảm ơn bạn đã ghé thăm showroom Tiệm Nhà Gốm! Đơn hàng #${orderCode} và điểm tích lũy đã được ghi nhận vào tài khoản.`;

  await triggerLocalPush(title, message, { orderId, orderCode, link: `/order-detail?orderId=${orderId}` });

  if (!userId || userId === 'guest' || !orderId) return;

  try {
    const docId = `order_${orderId}_pos`;
    const notifRef = doc(db, 'users', userId, 'notifications', docId);
    await setDoc(
      notifRef,
      {
        id: docId,
        userId,
        orderId,
        orderCode,
        type: 'order',
        stage: 'pos',
        title,
        message,
        link: `/order-detail?orderId=${orderId}`,
        totalAmount,
        imageUrl,
        icon: 'storefront',
        iconBg: '#FAF7F2',
        iconColor: '#9C7156',
        isRead: false,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    // Thầm lặng bỏ qua
  }
}

// Bộ nhớ đệm các notification ID đã được đồng bộ trong session
const syncedNotifIds = new Set<string>();

/**
 * Đồng bộ thông báo cho toàn bộ danh sách đơn hàng của khách
 */
export async function syncOrderNotificationsForUser(
  userId: string,
  orders: any[]
): Promise<void> {
  if (!userId || userId === 'guest' || !Array.isArray(orders) || orders.length === 0) return;

  for (const order of orders) {
    const orderId = order.id;
    if (!orderId) continue;

    const orderCode = (order.orderCode || order.orderId || order.code || orderId).toString();
    const upperCode = orderCode.toUpperCase();
    const totalAmount = Number(order.totalAmount || order.total || order.subtotal || 0);
    const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null;
    const imageUrl = firstItem?.resolvedImage || firstItem?.imageUrl || firstItem?.image || undefined;

    const isPos =
      order.source === 'pos' ||
      order.orderSource === 'pos' ||
      order.channel === 'pos' ||
      order.inStore ||
      upperCode.startsWith('POS');

    const statusRaw = (order.status || '').toString().toLowerCase();

    if (isPos) {
      const notifId = `order_${orderId}_pos`;
      if (!syncedNotifIds.has(notifId)) {
        syncedNotifIds.add(notifId);
        await createPosPurchaseNotification(userId, orderId, orderCode, totalAmount, imageUrl);
      }
    } else {
      const createdNotifId = `order_${orderId}_created`;
      if (!syncedNotifIds.has(createdNotifId)) {
        syncedNotifIds.add(createdNotifId);
        await createOrderPlacedNotification(userId, orderId, orderCode, totalAmount, imageUrl);
      }

      const isShipping =
        statusRaw === 'shipping' ||
        statusRaw.includes('đang giao') ||
        statusRaw.includes('vận chuyển');

      if (isShipping) {
        const shippingNotifId = `order_${orderId}_shipping`;
        if (!syncedNotifIds.has(shippingNotifId)) {
          syncedNotifIds.add(shippingNotifId);
          await createOrderShippingNotification(userId, orderId, orderCode, totalAmount, imageUrl);
        }
      }

      const isCompleted =
        statusRaw === 'completed' ||
        statusRaw.includes('hoàn thành') ||
        statusRaw.includes('đã giao') ||
        statusRaw.includes('hoàn tất');

      if (isCompleted) {
        const completedNotifId = `order_${orderId}_completed`;
        if (!syncedNotifIds.has(completedNotifId)) {
          syncedNotifIds.add(completedNotifId);
          await createOrderCompletedNotification(userId, orderId, orderCode, totalAmount, imageUrl);
        }
      }
    }
  }
}
