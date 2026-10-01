// src/utils/openWebLink.ts
import { router } from 'expo-router';

/**
 * Mở một URL web bên trong app (WebView) thay vì trình duyệt ngoài.
 * @param url  - URL cần mở (bắt đầu bằng http:// hoặc https://)
 * @param title - Tiêu đề hiển thị trên header (tuỳ chọn)
 */
export function openWebLink(url: string, title?: string) {
  router.push({
    pathname: '/webview',
    params: { url, title: title || '' },
  });
}
