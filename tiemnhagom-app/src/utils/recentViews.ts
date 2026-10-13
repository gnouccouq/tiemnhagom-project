// src/utils/recentViews.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';

const RECENTLY_VIEWED_KEY = '@tiemnhagom_recently_viewed_v1';
const MAX_RECENT_ITEMS = 12;

export interface RecentlyViewedItem {
  id: string;
  name: string;
  price: number;
  salePrice?: number;
  sale?: number;
  imageUrl?: string;
  category?: string;
  sold?: number;
  viewedAt: number;
}

/**
 * Thêm sản phẩm vào danh sách đã xem gần đây trong AsyncStorage
 */
export async function addRecentlyViewed(product: Product): Promise<void> {
  if (!product || !product.id) return;
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    let items: RecentlyViewedItem[] = raw ? JSON.parse(raw) : [];

    // Lọc bỏ nếu đã tồn tại để đưa lên đầu danh sách
    items = items.filter((item) => item.id !== product.id);

    const newItem: RecentlyViewedItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      salePrice: product.salePrice,
      sale: product.sale,
      imageUrl: product.imageUrl || (product.images && product.images[0]) || '',
      category: product.category,
      sold: product.sold,
      viewedAt: Date.now(),
    };

    items.unshift(newItem);

    if (items.length > MAX_RECENT_ITEMS) {
      items = items.slice(0, MAX_RECENT_ITEMS);
    }

    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Lỗi lưu lịch sử xem sản phẩm:', err);
  }
}

/**
 * Lấy danh sách sản phẩm đã xem gần đây (loại trừ ID sản phẩm hiện tại nếu có)
 */
export async function getRecentlyViewed(excludeId?: string): Promise<RecentlyViewedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    let items: RecentlyViewedItem[] = JSON.parse(raw);
    if (excludeId) {
      items = items.filter((item) => item.id !== excludeId);
    }
    return items;
  } catch (err) {
    console.warn('Lỗi đọc lịch sử xem sản phẩm:', err);
    return [];
  }
}
