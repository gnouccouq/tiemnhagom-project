// src/services/inAppNotificationService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { READ_IDS_KEY, DELETED_NOTIFS_KEY } from '../constants/notificationKeys';

export const SHOWN_IN_APP_NOTIFS_KEY = '@tiemnhagom_shown_in_app_notif_ids';

export interface InAppNotificationPayload {
  id?: string;
  title: string;
  message: string;
  link?: string;
  imageUrl?: string;
  icon?: string;
  type?: 'order' | 'promo' | 'system' | 'news';
  duration?: number;
  timestamp?: number;
  isRead?: boolean;
}

type NotificationListener = (payload: InAppNotificationPayload) => void;
type DismissListener = () => void;

class InAppNotificationManager {
  private showListeners: Set<NotificationListener> = new Set();
  private dismissListeners: Set<DismissListener> = new Set();
  private currentNotification: InAppNotificationPayload | null = null;
  private shownNotificationIds: Set<string> = new Set();
  private readNotificationIds: Set<string> = new Set();
  private isStorageLoaded = false;

  constructor() {
    this.initStorage();
  }

  private async initStorage() {
    try {
      const [rawShown, rawRead] = await Promise.all([
        AsyncStorage.getItem(SHOWN_IN_APP_NOTIFS_KEY),
        AsyncStorage.getItem(READ_IDS_KEY),
      ]);

      if (rawShown) {
        const parsed = JSON.parse(rawShown);
        if (Array.isArray(parsed)) {
          this.shownNotificationIds = new Set(parsed);
        }
      }

      if (rawRead) {
        const parsed = JSON.parse(rawRead);
        if (Array.isArray(parsed)) {
          this.readNotificationIds = new Set(parsed);
        }
      }
      this.isStorageLoaded = true;
    } catch {
      this.isStorageLoaded = true;
    }
  }

  /**
   * Đánh dấu ID này đã đọc (không bao giờ hiển thị push lại)
   */
  markAsRead(idOrIds: string | string[]) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    ids.forEach((id) => {
      if (id) {
        this.readNotificationIds.add(id);
        this.shownNotificationIds.add(id);
      }
    });
  }

  /**
   * Đăng ký lắng nghe sự kiện hiển thị thông báo trong app
   */
  onShow(listener: NotificationListener) {
    this.showListeners.add(listener);
    return () => {
      this.showListeners.delete(listener);
    };
  }

  /**
   * Đăng ký lắng nghe sự kiện ẩn thông báo
   */
  onDismiss(listener: DismissListener) {
    this.dismissListeners.add(listener);
    return () => {
      this.dismissListeners.delete(listener);
    };
  }

  /**
   * Kích hoạt hiển thị thông báo đẩy nổi trên Header
   */
  async show(payload: InAppNotificationPayload) {
    if (!payload || !payload.title) return;

    // 1. Nếu payload đã đánh dấu isRead thì tuyệt đối không hiện push
    if (payload.isRead) {
      if (payload.id) this.readNotificationIds.add(payload.id);
      return;
    }

    if (payload.id) {
      // 2. Kiểm tra bộ nhớ tạm đã xem hoặc đã hiển thị chưa
      if (
        this.readNotificationIds.has(payload.id) ||
        this.shownNotificationIds.has(payload.id)
      ) {
        return;
      }

      // 3. Kiểm tra AsyncStorage nếu chưa nạp xong
      if (!this.isStorageLoaded) {
        await this.initStorage();
        if (
          this.readNotificationIds.has(payload.id) ||
          this.shownNotificationIds.has(payload.id)
        ) {
          return;
        }
      }

      // 4. Kiểm tra thêm danh sách đã đọc từ AsyncStorage
      try {
        const [rawRead, rawDeleted] = await Promise.all([
          AsyncStorage.getItem(READ_IDS_KEY),
          AsyncStorage.getItem(DELETED_NOTIFS_KEY),
        ]);
        if (rawRead) {
          const parsedRead = JSON.parse(rawRead);
          if (Array.isArray(parsedRead) && parsedRead.includes(payload.id)) {
            this.readNotificationIds.add(payload.id);
            return;
          }
        }
        if (rawDeleted) {
          const parsedDeleted = JSON.parse(rawDeleted);
          if (Array.isArray(parsedDeleted) && parsedDeleted.includes(payload.id)) {
            return;
          }
        }
      } catch {}

      // Ghi nhận vĩnh viễn đã hiển thị thông báo này để không bao giờ hiện lặp lại
      this.shownNotificationIds.add(payload.id);
      try {
        AsyncStorage.setItem(
          SHOWN_IN_APP_NOTIFS_KEY,
          JSON.stringify(Array.from(this.shownNotificationIds))
        ).catch(() => {});
      } catch {}
    }

    this.currentNotification = {
      ...payload,
      timestamp: payload.timestamp || Date.now(),
      duration: payload.duration || 4800,
    };

    // Rung phản hồi nhẹ tạo cảm giác Native
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {}

    this.showListeners.forEach((fn) => {
      try {
        fn(this.currentNotification!);
      } catch (err) {
        console.warn('InAppNotification show error:', err);
      }
    });
  }

  /**
   * Đóng thông báo đang hiển thị
   */
  dismiss() {
    this.currentNotification = null;
    this.dismissListeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  getCurrent() {
    return this.currentNotification;
  }
}

export const inAppNotification = new InAppNotificationManager();

/**
 * Helper function gọi từ mọi nơi trong ứng dụng
 */
export function showInAppNotification(payload: InAppNotificationPayload) {
  inAppNotification.show(payload);
}
