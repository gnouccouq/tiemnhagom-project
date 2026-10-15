import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/**
 * Format ngày từ Timestamp/Date hoặc chuỗi ISO sang YYYYMMDD
 */
function formatDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Lấy version chính từ app.json (vd: '1.0.0')
 */
export function getAppVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

/**
 * Lấy buildNumber (iOS) hoặc versionCode (Android) từ app.json (vd: '1')
 */
export function getAppBuildNumber(): string {
  if (Platform.OS === 'ios') {
    return Constants.expoConfig?.ios?.buildNumber || '1';
  }
  return String(Constants.expoConfig?.android?.versionCode || 1);
}

/**
 * Phiên bản OTA mặc định cho bản build hiện tại (hỗ trợ .01, .02 nếu nhiều bản trong ngày)
 */
export const CURRENT_OTA_RELEASE = '20261015.02';

/**
 * Lấy thông tin phiên bản OTA (Over-The-Air) hiện tại
 * - Nếu app đang chạy bản cập nhật OTA: trả về ngày phát hành OTA (YYYYMMDD hoặc YYYYMMDD.xx)
 * - Nếu là bản nhúng: trả về mã CURRENT_OTA_RELEASE
 */
export function getOtaVersion(): string {
  try {
    if (CURRENT_OTA_RELEASE) {
      return CURRENT_OTA_RELEASE;
    }
    if (Updates.createdAt) {
      return formatDateToYYYYMMDD(new Date(Updates.createdAt));
    }
    if (Updates.updateId) {
      return Updates.updateId.slice(0, 8);
    }
    return '1.0.0';
  } catch {
    return CURRENT_OTA_RELEASE || '1.0.0';
  }
}

/**
 * Trả về chuỗi version đầy đủ: `1.0.0 (1) - 20261014`
 * (Version chính - Build number - Version OTA)
 */
export function getFullAppVersionString(): string {
  const version = getAppVersion();
  const build = getAppBuildNumber();
  const ota = getOtaVersion();
  return `${version} (${build}) - ${ota}`;
}
