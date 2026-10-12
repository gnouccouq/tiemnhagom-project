// src/utils/memoryManager.ts
import { Image } from 'expo-image';
import { AppState, AppStateStatus } from 'react-native';

let lastTrimTime = 0;
const TRIM_COOLDOWN_MS = 15000; // 15 giây cooldown để không gọi quá thường xuyên

/**
 * Thu dọn bộ nhớ đệm hình ảnh (RAM cache) giải phóng heap native
 */
export const trimImageMemory = async (force: boolean = false): Promise<void> => {
  const now = Date.now();
  if (!force && now - lastTrimTime < TRIM_COOLDOWN_MS) {
    return;
  }
  lastTrimTime = now;

  try {
    if (typeof Image.clearMemoryCache === 'function') {
      await Image.clearMemoryCache();
    }
  } catch (err) {
    // ignore
  }
};

/**
 * Khởi tạo listener tự động giải phóng RAM khi app chuyển sang chế độ nền (background)
 */
export const initMemoryManager = () => {
  const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      trimImageMemory(true);
    }
  });

  return () => {
    subscription.remove();
  };
};
