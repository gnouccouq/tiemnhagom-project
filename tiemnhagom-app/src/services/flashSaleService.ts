// src/services/flashSaleService.ts
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';
import { DEFAULT_CATEGORIES, ProductCategoryItem } from './productService';

export interface FlashSaleItemConfig {
  salePrice?: number;
  limit?: number;
  sold?: number;
  dealType?: 'sale' | 'bogo_same' | 'bogo_custom';
  giftProductId?: string;
}

export interface FlashSaleSettings {
  isActive?: boolean;
  title?: string;
  subtitle?: string;
  startTime?: any;
  endTime?: any;
  priceGroups?: number[];
  items?: Record<string, FlashSaleItemConfig>;
  bannerUrl?: string;
}

export interface FlashSaleStatus {
  isRunning: boolean;
  isUpcoming: boolean;
  isEnded: boolean;
  startTime: Date | null;
  endTime: Date | null;
  title: string;
  subtitle: string;
}

export interface ProductWithFlashSale extends Product {
  flashSaleInfo?: {
    isRunning: boolean;
    isUpcoming: boolean;
    dealType: 'sale' | 'bogo_same' | 'bogo_custom';
    isBogo: boolean;
    giftProductId?: string;
    salePrice: number;
    limit: number;
    sold: number;
    isSoldOut: boolean;
    soldRatio: number;
  };
  effectivePrice: number;
  effectiveSalePercent: number;
}

export interface FlashSaleData {
  settings: FlashSaleSettings | null;
  status: FlashSaleStatus;
  bogoProducts: ProductWithFlashSale[];
  shockCampaignProducts: ProductWithFlashSale[];
  priceGroupProducts: Record<number, ProductWithFlashSale[]>;
  otherSaleProducts: ProductWithFlashSale[];
  allProducts: ProductWithFlashSale[];
  categoryCounts: Record<string, number>;
  totalCount: number;
}

let cachedSettings: FlashSaleSettings | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30s cache

export async function fetchFlashSaleSettings(forceRefresh = false): Promise<FlashSaleSettings | null> {
  const now = Date.now();
  if (cachedSettings && !forceRefresh && now - lastFetchTime < CACHE_TTL) {
    return cachedSettings;
  }
  try {
    const fsRef = doc(db, 'settings', 'flash_sale');
    const fsSnap = await getDoc(fsRef);
    if (fsSnap.exists()) {
      cachedSettings = fsSnap.data() as FlashSaleSettings;
      lastFetchTime = now;
      return cachedSettings;
    }
    return null;
  } catch (error) {
    console.error('Lỗi tải flash_sale settings:', error);
    return null;
  }
}

export function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (val.seconds) {
    return new Date(val.seconds * 1000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function getFlashSaleStatus(settings: FlashSaleSettings | null): FlashSaleStatus {
  if (!settings || !settings.isActive) {
    return {
      isRunning: false,
      isUpcoming: false,
      isEnded: true,
      startTime: null,
      endTime: null,
      title: settings?.title || 'Flash Sale',
      subtitle: settings?.subtitle || 'Ưu đãi gốm sứ độc bản có hạn.',
    };
  }

  const now = new Date();
  const startTime = parseDate(settings.startTime);
  const endTime = parseDate(settings.endTime);

  const isRunning =
    Boolean(settings.isActive) &&
    (!startTime || now >= startTime) &&
    (!endTime || now <= endTime);

  const isUpcoming = Boolean(settings.isActive) && Boolean(startTime && now < startTime);
  const isEnded = !isRunning && !isUpcoming;

  return {
    isRunning,
    isUpcoming,
    isEnded,
    startTime,
    endTime,
    title: settings.title || 'Flash Sale',
    subtitle: settings.subtitle || 'Nhanh tay sở hữu những món gốm độc bản với ưu đãi tốt nhất.',
  };
}

export function getProductFlashSaleInfo(
  product: Product,
  settings: FlashSaleSettings | null,
  status: FlashSaleStatus
): ProductWithFlashSale['flashSaleInfo'] | undefined {
  if (!settings || !settings.isActive) return undefined;

  const itemConfig = settings.items?.[product.id];
  if (!itemConfig) {
    if (status.isRunning && (product as any).flashSaleGroup) {
      const price = Number((product as any).flashSaleGroup);
      return {
        isRunning: true,
        isUpcoming: false,
        dealType: 'sale',
        isBogo: false,
        salePrice: price,
        limit: product.stock || 999,
        sold: 0,
        isSoldOut: false,
        soldRatio: 0,
      };
    }
    return undefined;
  }

  const limit = itemConfig.limit !== undefined ? Number(itemConfig.limit) : 20;
  const sold = itemConfig.sold !== undefined ? Number(itemConfig.sold) : 0;
  const isSoldOut = limit > 0 && sold >= limit;
  const salePrice = Number(itemConfig.salePrice) || 0;
  const dealType = itemConfig.dealType || 'sale';
  const isBogo = dealType === 'bogo_same' || dealType === 'bogo_custom';
  const giftProductId = itemConfig.giftProductId || (dealType === 'bogo_same' ? product.id : '');
  const soldRatio = limit > 0 ? Math.min(1, sold / limit) : 0;

  return {
    isRunning: status.isRunning,
    isUpcoming: status.isUpcoming,
    dealType,
    isBogo,
    giftProductId,
    salePrice: isBogo ? product.price : salePrice,
    limit,
    sold,
    isSoldOut,
    soldRatio,
  };
}

export async function fetchFlashSaleData(selectedCategory = 'all', forceRefresh = false): Promise<FlashSaleData> {
  const settings = await fetchFlashSaleSettings(forceRefresh);
  const status = getFlashSaleStatus(settings);

  const fsItemIds =
    (status.isRunning || status.isUpcoming) && settings?.items
      ? Object.keys(settings.items)
      : [];

  const fsProductsMap: Record<string, Product> = {};

  // 1. Fetch chi tiết các sản phẩm cấu hình trong flashSaleSettings.items
  if (fsItemIds.length > 0) {
    const fsPromises = fsItemIds.map(async (pid) => {
      try {
        const snap = await getDoc(doc(db, 'products', pid));
        if (snap.exists()) {
          const data = snap.data() as Product;
          if (!data.isHidden && !data.isOnlyEvent) {
            fsProductsMap[snap.id] = { ...data, id: snap.id };
          }
        }
      } catch (err) {
        console.warn(`Lỗi fetch fs product ${pid}:`, err);
      }
    });
    await Promise.all(fsPromises);
  }

  // 2. Fetch danh sách sản phẩm có sale > 0 thông thường
  const allFetchedProducts: Product[] = [];
  const seenIds = new Set<string>();

  // Ưu tiên sản phẩm trong Campaign
  Object.values(fsProductsMap).forEach((p) => {
    allFetchedProducts.push(p);
    seenIds.add(p.id);
  });

  try {
    const qAll = query(
      collection(db, 'products'),
      where('sale', '>', 0),
      orderBy('sale', 'desc')
    );
    const snap = await getDocs(qAll);
    snap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        const p = { id: d.id, ...d.data() } as Product;
        if (!p.isHidden && !p.isOnlyEvent) {
          allFetchedProducts.push(p);
          seenIds.add(p.id);
        }
      }
    });
  } catch (err) {
    console.warn('Lỗi fetch sản phẩm sale > 0:', err);
  }

  // 3. Đếm số lượng sản phẩm sale theo từng danh mục
  const categoryCounts: Record<string, number> = { all: allFetchedProducts.length };
  DEFAULT_CATEGORIES.forEach((cat) => {
    if (cat.id === 'all') return;
    const count = allFetchedProducts.filter((p) => {
      if (cat.subs && cat.subs.length > 0) {
        return cat.subs.includes(p.category || '') || p.category === cat.name;
      }
      return p.category === cat.name;
    }).length;
    categoryCounts[cat.name] = count;
  });

  // 4. Lọc theo danh mục được chọn
  let filteredList = allFetchedProducts;
  if (selectedCategory !== 'all') {
    const catObj = DEFAULT_CATEGORIES.find(
      (c) => c.name.toLowerCase() === selectedCategory.toLowerCase() || c.id === selectedCategory
    );
    if (catObj && catObj.subs && catObj.subs.length > 0) {
      filteredList = allFetchedProducts.filter(
        (p) => catObj.subs!.includes(p.category || '') || p.category === catObj.name
      );
    } else {
      filteredList = allFetchedProducts.filter(
        (p) => (p.category || '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }
  }

  // 5. Chuẩn hóa & Phân loại sản phẩm
  const bogoProducts: ProductWithFlashSale[] = [];
  const shockCampaignProducts: ProductWithFlashSale[] = [];
  const priceGroupProducts: Record<number, ProductWithFlashSale[]> = {};
  const otherSaleProducts: ProductWithFlashSale[] = [];
  const allEnhancedProducts: ProductWithFlashSale[] = [];

  const priceGroups = settings?.priceGroups || [];
  priceGroups.forEach((pg) => {
    priceGroupProducts[pg] = [];
  });

  filteredList.forEach((p) => {
    const fsInfo = getProductFlashSaleInfo(p, settings, status);

    let effectivePrice = p.price;
    if (fsInfo && fsInfo.isRunning && !fsInfo.isSoldOut && fsInfo.salePrice > 0) {
      effectivePrice = fsInfo.salePrice;
    } else if (p.salePrice && p.salePrice > 0) {
      effectivePrice = p.salePrice;
    } else if (p.sale && p.sale > 0) {
      effectivePrice = Math.round(p.price * (1 - p.sale / 100));
    }

    const effectiveSalePercent =
      p.price > 0 && effectivePrice < p.price
        ? Math.round(((p.price - effectivePrice) / p.price) * 100)
        : p.sale || 0;

    const enhanced: ProductWithFlashSale = {
      ...p,
      flashSaleInfo: fsInfo,
      effectivePrice,
      effectiveSalePercent,
    };

    allEnhancedProducts.push(enhanced);

    if (fsInfo) {
      if (fsInfo.dealType === 'bogo_same' || fsInfo.dealType === 'bogo_custom') {
        bogoProducts.push(enhanced);
      } else {
        shockCampaignProducts.push(enhanced);
      }
    } else if (status.isRunning && (p as any).flashSaleGroup && priceGroups.includes((p as any).flashSaleGroup)) {
      const g = (p as any).flashSaleGroup;
      if (!priceGroupProducts[g]) priceGroupProducts[g] = [];
      priceGroupProducts[g].push(enhanced);
    } else {
      otherSaleProducts.push(enhanced);
    }
  });

  return {
    settings,
    status,
    bogoProducts,
    shockCampaignProducts,
    priceGroupProducts,
    otherSaleProducts,
    allProducts: allEnhancedProducts,
    categoryCounts,
    totalCount: allFetchedProducts.length,
  };
}
