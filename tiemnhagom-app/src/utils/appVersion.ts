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
 * Lấy thông tin phiên bản OTA (Over-The-Air) hiện tại
 * - Nếu app đang chạy bản cập nhật OTA: trả về ngày phát hành OTA (YYYYMMDD) hoặc 8 ký tự đầu updateId
 * - Nếu đang chạy bản gốc nhúng trong file cài đặt (.ipa / .apk): hiển thị ngày build nhúng hoặc mã release
 */
export function getOtaVersion(): string {
  try {
    // 1. Nếu có ngày tạo bản OTA update
    if (Updates.createdAt) {
      return formatDateToYYYYMMDD(new Date(Updates.createdAt));
    }

    // 2. Nếu có Update ID (UUID của bản cập nhật EAS Update)
    if (Updates.updateId) {
      return Updates.updateId.slice(0, 8);
    }

    // 3. Nếu là bản nhúng (chưa có OTA hoặc bản cài gốc), lấy ngày hiện tại/ngày publish
    return '20261014';
  } catch {
    return '20261014';
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
