// src/utils/haptics.ts
import * as Haptics from 'expo-haptics';

let isHapticsGloballyEnabled = true;

/**
 * Cập nhật trạng thái bật/tắt rung toàn cục (được đồng bộ từ SettingsContext)
 */
export function setGlobalHapticsEnabled(enabled: boolean) {
  isHapticsGloballyEnabled = enabled;
}

/**
 * Kiểm tra trạng thái rung toàn cục
 */
export function isGlobalHapticsEnabled(): boolean {
  return isHapticsGloballyEnabled;
}

/**
 * Kích hoạt rung phản hồi xúc giác (Impact feedback)
 * Mặc định: Light cho cảm giác chạm nhẹ nhàng, thanh lịch
 */
export function triggerHaptic(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light
) {
  if (!isHapticsGloballyEnabled) return;
  try {
    Haptics.impactAsync(style);
  } catch {}
}

/**
 * Kích hoạt rung khi chọn lựa (selection tick)
 */
export function triggerSelectionHaptic() {
  if (!isHapticsGloballyEnabled) return;
  try {
    Haptics.selectionAsync();
  } catch {}
}

/**
 * Kích hoạt rung dạng thông báo (Success, Warning, Error)
 */
export function triggerNotificationHaptic(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
) {
  if (!isHapticsGloballyEnabled) return;
  try {
    Haptics.notificationAsync(type);
  } catch {}
}

export { Haptics };
