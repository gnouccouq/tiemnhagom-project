// src/utils/videoCacheManager.ts
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VIDEO_CACHE_DIR = `${FileSystem.documentDirectory}tng_video_cache/`;
const STORAGE_KEY_CACHED_VIDEO_URL = '@tng_cached_hero_video_remote_url';
const STORAGE_KEY_CACHED_VIDEO_LOCAL = '@tng_cached_hero_video_local_uri';

/**
 * Đảm bảo thư mục lưu trữ video offline tồn tại
 */
async function ensureDirExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
  }
}

/**
 * Lấy đường dẫn file video offline đã lưu trong máy (nếu có và khớp với URL hiện tại)
 */
export async function getLocalCachedVideoUri(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl) return null;
  try {
    const savedRemoteUrl = await AsyncStorage.getItem(STORAGE_KEY_CACHED_VIDEO_URL);
    const savedLocalUri = await AsyncStorage.getItem(STORAGE_KEY_CACHED_VIDEO_LOCAL);

    if (savedRemoteUrl === remoteUrl && savedLocalUri) {
      const fileInfo = await FileSystem.getInfoAsync(savedLocalUri);
      if (fileInfo.exists && (fileInfo as any).size > 1000) {
        return savedLocalUri;
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc local cached video:', err);
  }
  return null;
}

/**
 * Tự động tải ngầm file video từ remoteUrl về bộ nhớ máy (offline)
 * Nếu URL thay đổi, tự động xóa file cũ và tải file mới
 */
let isDownloading = false;
export async function cacheVideoOffline(
  remoteUrl: string,
  onDownloaded?: (localUri: string) => void
): Promise<string | null> {
  if (!remoteUrl || isDownloading) return null;

  try {
    // 1. Kiểm tra nếu đã có sẵn trong máy thì không tải lại
    const localUri = await getLocalCachedVideoUri(remoteUrl);
    if (localUri) {
      return localUri;
    }

    isDownloading = true;
    await ensureDirExists();

    // 2. Tạo tên file duy nhất theo timestamp và đuôi file
    const ext = remoteUrl.split('?')[0].split('.').pop() || 'mp4';
    const cleanExt = ext.length <= 4 ? ext : 'mp4';
    const targetFileUri = `${VIDEO_CACHE_DIR}hero_banner_${Date.now()}.${cleanExt}`;

    // 3. Tải file về máy ngầm
    const downloadRes = await FileSystem.downloadAsync(remoteUrl, targetFileUri);
    if (downloadRes && downloadRes.status === 200 && downloadRes.uri) {
      // 4. Xóa các video cũ trước đó để tiết kiệm dung lượng bộ nhớ máy
      try {
        const oldLocalUri = await AsyncStorage.getItem(STORAGE_KEY_CACHED_VIDEO_LOCAL);
        if (oldLocalUri && oldLocalUri !== downloadRes.uri) {
          await FileSystem.deleteAsync(oldLocalUri, { idempotent: true });
        }
      } catch {}

      // 5. Lưu thông tin video offline mới
      await AsyncStorage.setItem(STORAGE_KEY_CACHED_VIDEO_URL, remoteUrl);
      await AsyncStorage.setItem(STORAGE_KEY_CACHED_VIDEO_LOCAL, downloadRes.uri);

      onDownloaded?.(downloadRes.uri);
      return downloadRes.uri;
    }
  } catch (err) {
    console.warn('Lỗi tải video ngoại tuyến:', err);
  } finally {
    isDownloading = false;
  }
  return null;
}
