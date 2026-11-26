// src/services/flashSaleService.ts
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';
import { DEFAULT_CATEGORIES } from './productService';

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
  dealLabel?: string;
  variantKey?: string;
}

export interface FlashSaleStage {
  id: string;
  shortNav: string;
  crownTitle: string;
  theme: 'terracotta' | 'kiln';
  subCategories: string[];
  products: ProductWithFlashSale[];
  note: string;
}

export interface FlashSaleData {
  settings: FlashSaleSettings | null;
  status: FlashSaleStatus;
  stages: FlashSaleStage[];
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
const CACHE_TTL = 30000;

function getDefault1212Window() {
  const now = new Date();
  let year = now.getFullYear();
  if (now > new Date(year, 11, 12, 23, 59, 59)) year += 1;
  return {
    start: new Date(year, 11, 12, 0, 0, 0),
    end: new Date(year, 11, 12, 23, 59, 59),
  };
}

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
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function getFlashSaleStatus(settings: FlashSaleSettings | null): FlashSaleStatus {
  const now = new Date();
  const def1212 = getDefault1212Window();

  let startTime = parseDate(settings?.startTime);
  let endTime = parseDate(settings?.endTime);

  const hasValidCampaign = Boolean(settings?.isActive && endTime && endTime > now);
  if (!hasValidCampaign) {
    startTime = def1212.start;
    endTime = def1212.end;
  }

  const isRunning = Boolean(startTime && endTime && now >= startTime && now <= endTime);
  const isUpcoming = Boolean(startTime && now < startTime);

  return {
    isRunning,
    isUpcoming,
    isEnded: !isRunning && !isUpcoming,
    startTime,
    endTime,
    title:
      hasValidCampaign && settings?.title
        ? settings.title
        : 'Ngày Đôi 12.12 — Siêu Sale Gốm Thủ Công',
    subtitle:
      hasValidCampaign && settings?.subtitle
        ? settings.subtitle
        : 'Đại tiệc ưu đãi duy nhất 1 ngày 12/12 tại Tiệm Nhà Gốm. Lưu món yêu thích để sẵn sàng săn deal lúc 00:00!',
  };
}

export function getProductFlashSaleInfo(
  product: Product,
  settings: FlashSaleSettings | null,
  status: FlashSaleStatus
): ProductWithFlashSale['flashSaleInfo'] | undefined {
  const pid = product.parentProductId || product.id;
  const itemConfig = settings?.items?.[pid];

  if (!itemConfig) {
    const groupPrice = Number((product as any).flashSaleGroup) || 0;
    if (groupPrice > 0) {
      return {
        isRunning: status.isRunning,
        isUpcoming: status.isUpcoming,
        dealType: 'sale',
        isBogo: false,
        salePrice: groupPrice,
        limit: Math.max(5, Math.min(20, product.stock || 10)),
        sold: Math.min(product.sold || 0, 5),
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
  const giftProductId = itemConfig.giftProductId || (dealType === 'bogo_same' ? pid : '');
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

function expandIndependentVariants(products: Product[]): Product[] {
  const result: Product[] = [];
  products.forEach((p) => {
    result.push(p);

    const pushVariant = (v: any, type: string, idx: number) => {
      if (!v || !v.showOnProductPage) return;
      const label = v.name || v.color || v.pattern || v.label || `Mẫu ${idx + 1}`;
      const vImg = v.imageUrl || v.image || p.imageUrl;
      const vPrice = v.price !== undefined && v.price !== null && v.price !== '' && Number(v.price) > 0
        ? Number(v.price)
        : p.price;
      const vSalePrice = v.salePrice !== undefined && v.salePrice !== null && v.salePrice !== '' && Number(v.salePrice) > 0
        ? Number(v.salePrice)
        : p.salePrice;
      const vSale = v.sale !== undefined && v.sale !== null && v.sale !== '' ? Number(v.sale) : p.sale;

      result.push({
        ...p,
        id: `${p.id}__${type}_${idx}`,
        parentProductId: p.id,
        selectedVariant: { name: label, ...v },
        name: `${p.name} - ${label}`,
        imageUrl: vImg,
        price: vPrice,
        salePrice: vSalePrice,
        sale: vSale,
        stock: v.stock !== undefined && v.stock !== null && v.stock !== '' ? Number(v.stock) : p.stock,
      } as Product);
    };

    const anyP = p as any;
    if (Array.isArray(anyP.colorVariants)) anyP.colorVariants.forEach((v: any, i: number) => pushVariant(v, 'color', i));
    if (Array.isArray(anyP.patternVariants)) anyP.patternVariants.forEach((v: any, i: number) => pushVariant(v, 'pattern', i));
    if (Array.isArray(anyP.comboVariants)) anyP.comboVariants.forEach((v: any, i: number) => pushVariant(v, 'combo', i));
  });
  return result;
}

export async function fetchFlashSaleData(_selectedCategory = 'all', forceRefresh = false): Promise<FlashSaleData> {
  const settings = await fetchFlashSaleSettings(forceRefresh);
  const status = getFlashSaleStatus(settings);

  const collected: Product[] = [];
  const seenIds = new Set<string>();

  // 1. CHỈ LẤY sản phẩm thuộc chiến dịch 12.12 (settings.items + đồng giá priceGroups), không trộn sale thường ngày
  const fsItemIds = settings?.items ? Object.keys(settings.items) : [];
  if (fsItemIds.length > 0) {
    await Promise.all(
      fsItemIds.map(async (pid) => {
        try {
          const snap = await getDoc(doc(db, 'products', pid));
          if (snap.exists()) {
            const data = snap.data() as Product;
            if (!data.isHidden && !data.isOnlyEvent && !seenIds.has(snap.id)) {
              collected.push({ ...data, id: snap.id });
              seenIds.add(snap.id);
            }
          }
        } catch (err) {
          console.warn(`Lỗi fetch fs product ${pid}:`, err);
        }
      })
    );
  }

  const priceGroups = Array.isArray(settings?.priceGroups)
    ? settings!.priceGroups.map(Number).filter((n) => n > 0).sort((a, b) => a - b)
    : [];

  if (priceGroups.length > 0) {
    try {
      const qGroup = query(collection(db, 'products'), where('flashSaleGroup', '>', 0));
      const groupSnap = await getDocs(qGroup);
      groupSnap.docs.forEach((d) => {
        if (!seenIds.has(d.id)) {
          const p = { id: d.id, ...d.data() } as Product;
          if (!p.isHidden && !p.isOnlyEvent && priceGroups.includes(Number((p as any).flashSaleGroup))) {
            collected.push(p);
            seenIds.add(d.id);
          }
        }
      });
    } catch (err) {
      console.warn('Lỗi fetch đồng giá flashSaleGroup:', err);
    }
  }

  // 2. Tách biến thể hiển thị độc lập (showOnProductPage) giống bản Web
  const expandedProducts = expandIndependentVariants(collected);

  // 3. Nâng cấp metadata Flash Sale cho từng sản phẩm
  const bogoProducts: ProductWithFlashSale[] = [];
  const shockCampaignProducts: ProductWithFlashSale[] = [];
  const priceGroupProducts: Record<number, ProductWithFlashSale[]> = {};
  const otherSaleProducts: ProductWithFlashSale[] = [];
  const allEnhancedProducts: ProductWithFlashSale[] = [];

  priceGroups.forEach((pg) => {
    priceGroupProducts[pg] = [];
  });

  expandedProducts.forEach((p) => {
    const fsInfo = getProductFlashSaleInfo(p, settings, status);
    const basePrice = Number(p.price) || 0;
    let effectivePrice = basePrice;
    let dealLabel = 'ƯU ĐÃI NGÀY ĐÔI 12.12';

    if (fsInfo) {
      if (fsInfo.isBogo) {
        effectivePrice = basePrice;
        dealLabel = 'MUA 1 TẶNG 1';
      } else if (fsInfo.salePrice > 0) {
        effectivePrice = fsInfo.salePrice;
        const pct = basePrice > 0 ? Math.max(1, Math.round(((basePrice - effectivePrice) / basePrice) * 100)) : 0;
        dealLabel = `DEAL SỐC 12.12 • -${pct}%`;
      }
    } else if (p.salePrice && p.salePrice > 0) {
      effectivePrice = p.salePrice;
    } else if (p.sale && p.sale > 0) {
      effectivePrice = Math.round(basePrice * (1 - p.sale / 100));
    }

    const effectiveSalePercent = fsInfo?.isBogo
      ? 50
      : basePrice > 0 && effectivePrice < basePrice
      ? Math.round(((basePrice - effectivePrice) / basePrice) * 100)
      : p.sale || 0;

    const enhanced: ProductWithFlashSale = {
      ...p,
      flashSaleInfo: fsInfo,
      effectivePrice,
      effectiveSalePercent,
      dealLabel,
      variantKey: p.id,
    };

    allEnhancedProducts.push(enhanced);

    if (fsInfo?.isBogo) bogoProducts.push(enhanced);
    else if (fsInfo) shockCampaignProducts.push(enhanced);
    else otherSaleProducts.push(enhanced);

    const gVal = Number((p as any).flashSaleGroup) || effectivePrice;
    if (priceGroups.includes(gVal)) {
      if (!priceGroupProducts[gVal]) priceGroupProducts[gVal] = [];
      priceGroupProducts[gVal].push(enhanced);
    }
  });

  // 4. Xây dựng các Khối Kệ Phân Loại giống bản Web (Tâm điểm 12.12 + Nhóm danh mục)
  const stages: FlashSaleStage[] = [];
  const heroItems = allEnhancedProducts.filter((p) => {
    const rootId = p.parentProductId || p.id;
    return Boolean(settings?.items?.[rootId]);
  });

  if (heroItems.length > 0) {
    const subSet = new Set<string>();
    heroItems.forEach((p) => {
      if (p.category) subSet.add(p.category);
    });
    stages.push({
      id: 'stage-hero-1212',
      shortNav: 'Tâm điểm 12.12',
      crownTitle: 'FLASH SALE • TÂM ĐIỂM 12.12',
      theme: 'terracotta',
      subCategories: Array.from(subSet),
      products: heroItems,
      note: 'Suất ưu đãi đặc quyền Ngày Đôi 12.12 — Miễn phí gói quà & thiệp viết tay',
    });
  }

  const assignedIds = new Set<string>();
  DEFAULT_CATEGORIES.forEach((cat, idx) => {
    if (cat.id === 'all') return;
    const subs = cat.subs || [];
    const matched = allEnhancedProducts.filter((p) => {
      const c = (p.category || '').trim();
      return c === cat.name || subs.includes(c);
    });
    if (matched.length > 0) {
      matched.forEach((p) => assignedIds.add(p.id));
      const activeSubs = subs.filter((s) => matched.some((p) => (p.category || '').trim() === s));
      stages.push({
        id: `stage-cat-${idx}`,
        shortNav: cat.name,
        crownTitle: `FLASH SALE • ${cat.name.toUpperCase()}`,
        theme: stages.length % 2 === 1 ? 'kiln' : 'terracotta',
        subCategories: activeSubs,
        products: matched,
        note: `Ưu đãi chuyên mục ${cat.name} duy nhất ngày 12.12 — Đóng gói chống sốc 3 lớp`,
      });
    }
  });

  const categoryCounts: Record<string, number> = { all: allEnhancedProducts.length };
  DEFAULT_CATEGORIES.forEach((cat) => {
    if (cat.id === 'all') return;
    categoryCounts[cat.name] = allEnhancedProducts.filter((p) =>
      cat.subs && cat.subs.length > 0 ? cat.subs.includes(p.category || '') || p.category === cat.name : p.category === cat.name
    ).length;
  });

  return {
    settings,
    status,
    stages,
    bogoProducts,
    shockCampaignProducts,
    priceGroupProducts,
    otherSaleProducts,
    allProducts: allEnhancedProducts,
    categoryCounts,
    totalCount: allEnhancedProducts.length,
  };
}
