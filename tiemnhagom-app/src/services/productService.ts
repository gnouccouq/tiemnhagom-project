// src/services/productService.ts
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';
import { removeVietnameseTones } from '../utils/format';

export interface ProductCategoryItem {
  id: string;
  name: string;
  enName?: string;
  icon: string;
  imageUrl?: string;
  subs?: string[];
  order?: number;
}

export function getCategoryDisplayName(name: string): string {
  const n = (name || '').trim();
  if (n === 'Dining Decor') return 'Bàn Ăn & Bếp';
  if (n === 'Teatime & Drinks') return 'Trà & Cà Phê';
  if (n === 'Home Decor') return 'Trang Trí Nhà';
  if (n === 'Kitchenware') return 'Dụng Cụ Bếp';
  if (n === 'Lifestyle') return 'Phong Cách Sống';
  if (n === 'Value Packs') return 'Combo & Quà Tặng';
  return n;
}

export function getCategoryIcon(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('dining') || n.includes('bát') || n.includes('chén') || n.includes('dĩa') || n.includes('ăn')) return 'restaurant-outline';
  if (n.includes('tea') || n.includes('trà') || n.includes('ly') || n.includes('cốc') || n.includes('drink')) return 'cafe-outline';
  if (n.includes('hoa') || n.includes('bình') || n.includes('decor') || n.includes('tượng') || n.includes('home')) return 'flower-outline';
  if (n.includes('kitchen') || n.includes('nồi') || n.includes('chảo') || n.includes('bếp')) return 'flame-outline';
  if (n.includes('lifestyle') || n.includes('túi') || n.includes('khóa') || n.includes('nến') || n.includes('thơm')) return 'sparkles-outline';
  if (n.includes('value') || n.includes('pack') || n.includes('combo') || n.includes('set') || n.includes('quà')) return 'gift-outline';
  return 'grid-outline';
}

export const DEFAULT_CATEGORIES: ProductCategoryItem[] = [
  { id: 'all', name: 'Tất cả', icon: 'grid-outline' },
  {
    id: 'Dining Decor',
    name: 'Dining Decor',
    icon: 'restaurant-outline',
    subs: ['Tô, Bát & Chén', 'Đĩa Ăn & Decor', 'Muỗng Đũa & Phụ Kiện', 'Gia Vị & Nước Chấm', 'Gác Đũa & Phụ Kiện'],
  },
  {
    id: 'Teatime & Drinks',
    name: 'Teatime & Drinks',
    icon: 'cafe-outline',
    subs: ['Ấm Trà', 'Cốc, Ly & Phụ Kiện', 'Cốc, Ly & Tách', 'Lót Ly & Đế Lót', 'Dụng Cụ Matcha', 'Phin & Dụng Cụ Pha Chế'],
  },
  {
    id: 'Home Decor',
    name: 'Home Decor',
    icon: 'flower-outline',
    subs: ['Bình & Lọ Hoa', 'Đèn & Tượng Decor', 'Khay Decor & Trưng Bày', 'Hoa & Phụ Kiện'],
  },
  {
    id: 'Kitchenware',
    name: 'Kitchenware',
    icon: 'flame-outline',
    subs: ['Nồi & Chảo', 'Dụng Cụ Làm Bếp', 'Phụ Kiện & Bảo Quản'],
  },
  {
    id: 'Lifestyle',
    name: 'Lifestyle',
    icon: 'sparkles-outline',
    subs: ['Tinh Dầu & Nến Thơm', 'Túi & Giỏ Đan', 'Móc Khóa & Quà Tặng', 'Phụ Kiện Cá Nhân'],
  },
  {
    id: 'Value Packs',
    name: 'Value Packs',
    icon: 'gift-outline',
    subs: ['Combo Bàn Ăn', 'Set Matcha & Trà Đạo'],
  },
];

/**
 * Lấy danh mục sản phẩm từ Firestore (settings/product_categories)
 * Giữ nguyên vẹn 100% tên danh mục cha và con từ Firestore theo yêu cầu
 */
export async function getCategories(): Promise<ProductCategoryItem[]> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'product_categories'));
    if (snap.exists()) {
      const data = snap.data();
      const groups: any[] = data.groups || [];
      if (groups.length > 0) {
        const sorted = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));
        return [
          { id: 'all', name: 'Tất cả', icon: 'grid-outline' },
          ...sorted.map((g) => ({
            id: g.name,
            name: g.name, // Giữ nguyên tên gốc từ Firestore
            icon: getCategoryIcon(g.name),
            imageUrl: g.imageUrl || g.image || undefined,
            subs: Array.isArray(g.subs) ? g.subs : [],
            order: g.order,
          })),
        ];
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc danh mục từ settings/product_categories:', e);
  }
  return DEFAULT_CATEGORIES;
}


export interface BannerSlide {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string;
  link?: string;
  title?: string;
  subtitle?: string;
}

/**
 * Lấy danh sách banner trang chủ từ Firestore (settings/banners)
 * Ưu tiên mobileImageUrl cho phiên bản ứng dụng di động
 */
export async function getHeroBanners(): Promise<BannerSlide[]> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'banners'));
    if (snap.exists()) {
      const data = snap.data();
      const slides: any[] = data.slides || [];
      if (slides.length > 0) {
        return slides.map((s, idx) => ({
          id: String(idx),
          imageUrl: s.imageUrl || '',
          mobileImageUrl: s.mobileImageUrl || '',
          link: s.link || '',
          title: s.title || '',
          subtitle: s.subtitle || '',
        }));
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc banner từ settings/banners:', e);
  }

  // Danh sách banner mobile chính thức từ tiệm
  return [
    {
      id: '0',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1789473604739_trungthutng2026.webp?alt=media&token=3738531e-4c85-4aba-ae0f-1370947b22dd',
      mobileImageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fmb_1789473606465_trungthutng2026_916.webp?alt=media&token=862e84ee-289c-46b4-aeaf-fe69c97d5e9e',
      link: '',
    },
    {
      id: '1',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
      mobileImageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fmb_1787036957985__MG_2519.webp?alt=media&token=c9abcb3b-8409-438d-9ee9-2081d2071387',
      link: '',
    },
    {
      id: '2',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036647258_ChatGPT%20Image%2014_03_47%2018%20thg%208%2C%202026.webp?alt=media&token=e5da360e-338f-43b9-9056-cab7610500c2',
      mobileImageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fmb_1787036648751__MG_2842.webp?alt=media&token=6d37aca3-3542-4dd9-b42f-4e78546225b9',
      link: '',
    },
    {
      id: '3',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1784352576732_L%C3%B3t%20ly%20(1920%20x%201080%20px)%20(2).webp?alt=media&token=07e7c680-ebf7-48ea-8ef0-6313124ab082',
      mobileImageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fmb_1784352578090_L%C3%B3t%20ly%20(1080%20x%201920%20px)%20(1).webp?alt=media&token=019cec6d-dc0d-491a-9bb6-835f261c0a94',
      link: 'TNGCB01',
    },
    {
      id: '4',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1788589788688_TNGHANDMADE.webp?alt=media&token=9890f8cf-a2e0-436b-88b8-98ed7b894fb0',
      mobileImageUrl: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1788589788688_TNGHANDMADE.webp?alt=media&token=9890f8cf-a2e0-436b-88b8-98ed7b894fb0',
      link: '',
    },
  ];
}

export interface CollectionItem {
  id?: string;
  name: string;
  imageUrl: string;
  description?: string;
  showOnHome?: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  imageUrl: string;
  content?: string;
  excerpt?: string;
  createdAt?: any;
  dateStr?: string;
}

/**
 * Lấy danh sách bộ sưu tập (Collections) từ Firestore (settings/collections)
 */
export async function getCollections(): Promise<CollectionItem[]> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'collections'));
    if (snap.exists() && snap.data().items) {
      const items: any[] = snap.data().items;
      return items.filter((c) => c.showOnHome !== false && c.imageUrl && c.name);
    }
  } catch (e) {
    console.warn('Lỗi lấy collections:', e);
  }
  return [];
}

/**
 * Lấy sản phẩm bán chạy theo trường 'sold' từ Firestore
 */
export async function getBestSellingProducts(maxItems = 10): Promise<Product[]> {
  try {
    const items = await getProducts({ sortBy: 'popular', maxItems, expandVariants: false });
    return items;
  } catch (e) {
    console.warn('Lỗi lấy sản phẩm bán chạy:', e);
    return [];
  }
}

/**
 * Lấy bài viết tin tức mới nhất từ collection('news')
 */
export async function getNewsArticles(maxItems = 6): Promise<NewsArticle[]> {
  try {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(maxItems));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      let dateStr = '';
      if (data.createdAt) {
        try {
          dateStr = typeof data.createdAt.toDate === 'function'
            ? data.createdAt.toDate().toLocaleDateString('vi-VN')
            : new Date(data.createdAt).toLocaleDateString('vi-VN');
        } catch {}
      }
      const plainText = (data.content || '').replace(/<[^>]*>?/gm, '');
      const excerpt = plainText.length > 90 ? plainText.substring(0, 90) + '...' : plainText;

      return {
        id: d.id,
        title: data.title || 'Bài viết từ Tiệm',
        imageUrl: data.imageUrl || 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
        content: data.content || '',
        excerpt,
        dateStr,
      };
    });
  } catch (e) {
    console.warn('Lỗi lấy tin tức:', e);
    return [];
  }
}

/**
 * Lấy chi tiết 1 bài viết theo ID
 */
export async function getArticleById(id: string): Promise<NewsArticle | null> {
  try {
    const snap = await getDoc(doc(db, 'news', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    let dateStr = '';
    if (data.createdAt) {
      try {
        dateStr = typeof data.createdAt.toDate === 'function'
          ? data.createdAt.toDate().toLocaleDateString('vi-VN')
          : new Date(data.createdAt).toLocaleDateString('vi-VN');
      } catch {}
    }
    const plainText = (data.content || '').replace(/<[^>]*>?/gm, '');
    const excerpt = plainText.length > 90 ? plainText.substring(0, 90) + '...' : plainText;

    return {
      id: snap.id,
      title: data.title || 'Bài viết từ Tiệm',
      imageUrl: data.imageUrl || '',
      content: data.content || '',
      excerpt,
      dateStr,
    };
  } catch (e) {
    console.warn('Lỗi lấy bài viết:', e);
    return null;
  }
}

/**
 * Lấy danh sách sản phẩm từ Firestore
 */
export async function getProducts(options?: {
  category?: string;
  collection?: string;
  searchTerm?: string;
  sortBy?: 'newest' | 'price-asc' | 'price-desc' | 'popular';
  maxItems?: number;
  expandVariants?: boolean;
}): Promise<Product[]> {
  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef); // Không giới hạn số lượng sớm để lọc chuẩn
    const snapshot = await getDocs(q);

    let items: Product[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const isHidden = Boolean(
        data.isHidden ||
        data.hidden ||
        data.isOnlyEvent ||
        (typeof data.status === 'string' && data.status.toLowerCase() === 'inactive')
      );
      if (isHidden) return;

      let finalImageUrl = data.imageUrl || (Array.isArray(data.images) && data.images[0]) || '';
      const isPlaceholder = !finalImageUrl || finalImageUrl.includes('placehold.co') || finalImageUrl.includes('via.placeholder.com');
      if (isPlaceholder) {
        const allVars = [
          ...(data.comboVariants || []),
          ...(data.colorVariants || []),
          ...(data.patternVariants || []),
        ];
        const firstWithImage = allVars.find((v: any) => v && (v.imageUrl || v.thumbUrl));
        if (firstWithImage) {
          finalImageUrl = firstWithImage.imageUrl || firstWithImage.thumbUrl;
        }
      }

      const baseProduct: Product = {
        id: docSnap.id,
        name: data.name || 'Sản phẩm gốm',
        price: Number(data.price) || 0,
        salePrice: data.salePrice ? Number(data.salePrice) : undefined,
        sale: data.sale !== undefined ? Number(data.sale) : undefined,
        stock: Number(data.stock) ?? 10,
        sold: Number(data.sold) || 0,
        category: data.category || 'Gốm sứ',
        description: data.description || '',
        images: Array.isArray(data.images) && data.images.length > 0 ? data.images : (finalImageUrl ? [finalImageUrl] : []),
        imageUrl: finalImageUrl,
        colorVariants: data.colorVariants || [],
        patternVariants: data.patternVariants || [],
        comboVariants: data.comboVariants || [],
        collections: data.collections || [],
        isBestSeller: Boolean(data.isBestSeller || (Number(data.sold) >= 5)),
        isFeatured: Boolean(data.isFeatured),
        rating: Number(data.rating) || 5,
        createdAt: data.createdAt,
      };
      items.push(baseProduct);

      if (options?.expandVariants !== false) {
        const processVariant = (v: any, type: 'color' | 'pattern' | 'combo') => {
          if (!v || !v.showOnProductPage) return;
          const hasOwnStock = (v.stock !== undefined && v.stock !== null && v.stock !== '');
          const vStock = hasOwnStock ? Number(v.stock) : (Number(data.stock) || 0);
          const isManualOut = Boolean(v.manualOutOfStock);
          const vIsOutOfStock = isManualOut || Boolean(v.isOutOfStock) || vStock <= 0;
          const vSold = Number(v.sold) || 0;
          const vIsBestSeller = !vIsOutOfStock && (vSold >= 5 || Boolean(v.isBestSeller));
          const vPrice = (v.price && Number(v.price) > 0) ? Number(v.price) : (Number(data.price) || 0);
          const vSale = (v.sale !== undefined && v.sale !== null && v.sale !== '') ? Number(v.sale) : (data.sale !== undefined ? Number(data.sale) : undefined);
          const vSalePrice = (vSale && vSale > 0) ? Math.round(vPrice * (1 - vSale / 100)) : undefined;

          items.push({
            id: `${docSnap.id}_${type}_${v.name}`,
            parentProductId: docSnap.id,
            selectedVariant: { ...v, type },
            name: `${data.name || 'Sản phẩm gốm'} - ${v.name}`,
            price: vPrice,
            salePrice: vSalePrice,
            sale: vSale,
            stock: vStock,
            sold: vSold,
            category: data.category || 'Gốm sứ',
            description: data.description || '',
            images: v.imageUrl ? [v.imageUrl] : (finalImageUrl ? [finalImageUrl] : []),
            imageUrl: v.imageUrl || v.thumbUrl || finalImageUrl,
            colorVariants: data.colorVariants || [],
            patternVariants: data.patternVariants || [],
            comboVariants: data.comboVariants || [],
            collections: data.collections || [],
            isBestSeller: vIsBestSeller,
            isFeatured: Boolean(data.isFeatured),
            rating: Number(data.rating) || 5,
            createdAt: data.createdAt,
          });
        };

        if (Array.isArray(data.colorVariants)) {
          data.colorVariants.forEach((v: any) => processVariant(v, 'color'));
        }
        if (Array.isArray(data.patternVariants)) {
          data.patternVariants.forEach((v: any) => processVariant(v, 'pattern'));
        }
        if (Array.isArray(data.comboVariants)) {
          data.comboVariants.forEach((v: any) => processVariant(v, 'combo'));
        }
      }
    });

    // Lọc theo danh mục (hỗ trợ cả nhóm danh mục chính, tên tiếng Việt, tên tiếng Anh và danh mục con)
    if (options?.category && options.category !== 'all') {
      const target = options.category.toLowerCase().trim();
      let allCategoryDefs = DEFAULT_CATEGORIES;
      try {
        const dynCats = await getCategories();
        if (dynCats && dynCats.length > 0) allCategoryDefs = dynCats;
      } catch {}

      const matchedGroup = allCategoryDefs.find(
        (g) =>
          g.id.toLowerCase() === target ||
          g.name.toLowerCase() === target ||
          (g.enName && g.enName.toLowerCase() === target)
      );

      const targetSubs = matchedGroup?.subs ? matchedGroup.subs.map((s) => s.toLowerCase()) : [];
      const matchCriteria = [
        target,
        ...(matchedGroup?.id ? [matchedGroup.id.toLowerCase()] : []),
        ...(matchedGroup?.name ? [matchedGroup.name.toLowerCase()] : []),
        ...(matchedGroup?.enName ? [matchedGroup.enName.toLowerCase()] : []),
        ...targetSubs,
      ];

      items = items.filter((p) => {
        const pCat = (p.category || '').toLowerCase();
        return matchCriteria.some((c) => pCat.includes(c) || c.includes(pCat));
      });
    }

    // Lọc theo bộ sưu tập (collection)
    if (options?.collection && options.collection !== 'all') {
      const targetCol = options.collection.toLowerCase();
      items = items.filter((p) =>
        (p.collections || []).some((c) => c.toLowerCase().includes(targetCol)) ||
        (p.name || '').toLowerCase().includes(targetCol)
      );
    }

    // Lọc theo từ khóa tìm kiếm (hỗ trợ cả tiếng Việt có dấu và không dấu)
    if (options?.searchTerm && options.searchTerm.trim() !== '') {
      const cleanTerm = removeVietnameseTones(options.searchTerm);
      items = items.filter((p) => {
        const cleanName = removeVietnameseTones(p.name);
        const sku = p.id.toLowerCase();
        return cleanName.includes(cleanTerm) || sku.includes(cleanTerm);
      });
    }

    // Sắp xếp
    if (options?.sortBy === 'price-asc') {
      items.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
    } else if (options?.sortBy === 'price-desc') {
      items.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
    } else if (options?.sortBy === 'popular') {
      items.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    }

    if (options?.maxItems) {
      items = items.slice(0, options.maxItems);
    }

    return items;
  } catch (error) {
    console.error('Lỗi khi tải danh sách sản phẩm:', error);
    return [];
  }
}

/**
 * Lấy chi tiết 1 sản phẩm theo ID
 */
export async function getProductById(productId: string): Promise<Product | null> {
  try {
    const docRef = doc(db, 'products', productId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
      id: snap.id,
      name: data.name || '',
      price: Number(data.price) || 0,
      salePrice: data.salePrice ? Number(data.salePrice) : undefined,
      sale: data.sale !== undefined ? Number(data.sale) : undefined,
      stock: Number(data.stock) ?? 10,
      sold: Number(data.sold) || 0,
      category: data.category || 'Gốm sứ',
      description: data.description || '',
      images: Array.isArray(data.images) ? data.images : (data.imageUrl ? [data.imageUrl] : []),
      imageUrl: data.imageUrl || (Array.isArray(data.images) && data.images[0]) || '',
      colorVariants: data.colorVariants || [],
      patternVariants: data.patternVariants || [],
      comboVariants: data.comboVariants || [],
      collections: data.collections || [],
      isBestSeller: Boolean(data.isBestSeller || (Number(data.sold) >= 5)),
      isFeatured: Boolean(data.isFeatured),
      rating: Number(data.rating) || 5,
      createdAt: data.createdAt,
      dimensions: data.dimensions,
      details: data.details,
      specs: data.specs,
      usage: data.usage,
    };
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết sản phẩm:', error);
    return null;
  }
}
