import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';
import { useAuth } from './AuthContext';
import { syncOrderNotificationsForUser } from '../services/orderNotificationService';
import { syncUserLoyaltyAndVouchers } from '../services/loyaltyService';
import { getUserOrders } from '../services/orderService';
import { seedProductCache, extractProductImages } from '../services/productService';

interface RealtimeDataContextProps {
  products: Product[];
  orders: any[];
  news: any[];
  loadingProducts: boolean;
}

const RealtimeDataContext = createContext<RealtimeDataContextProps>({
  products: [],
  orders: [],
  news: [],
  loadingProducts: true,
});

export const useRealtimeData = () => useContext(RealtimeDataContext);

export const RealtimeDataProvider = ({ children }: { children: ReactNode }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const { user, userProfile } = useAuth();

  // Listen to Products
  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
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

        const baseImages = extractProductImages(data, finalImageUrl);

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
          images: baseImages,
          additionalImages: Array.isArray(data.additionalImages) ? data.additionalImages : [],
          hoverImageUrl: data.hoverImageUrl || undefined,
          imageUrl: finalImageUrl,
          colorVariants: data.colorVariants || [],
          patternVariants: data.patternVariants || [],
          comboVariants: data.comboVariants || [],
          collections: data.collections || [],
          isBestSeller: Boolean(data.isBestSeller || (Number(data.sold) >= 5)),
          isNew: Boolean(data.isNew),
          isFeatured: Boolean(data.isFeatured),
          rating: Number(data.rating) || 5,
          createdAt: data.createdAt || data.createdDate,
          updatedAt: data.updatedAt,
          dimensions: data.dimensions,
          details: data.details,
          specs: data.specs,
          usage: data.usage,
        };
        items.push(baseProduct);
        
        // Expand variants
        const processVariant = (v: any, type: 'color' | 'pattern' | 'combo') => {
          if (!v || !v.showOnProductPage) return;
          const hasOwnStock = (v.stock !== undefined && v.stock !== null && v.stock !== '');
          const vStock = hasOwnStock ? Number(v.stock) : (Number(data.stock) || 0);
          const isManualOut = Boolean(v.manualOutOfStock);
          const vIsOutOfStock = isManualOut || Boolean(v.isOutOfStock) || vStock <= 0;
          const vSold = Number(v.sold) || 0;
          const vIsBestSeller = !vIsOutOfStock && (vSold >= 5 || Boolean(v.isBestSeller));
          const vPrice = (v.price && Number(v.price) > 0) ? Number(v.price) : (Number(data.price) || 0);
          const vCustomSalePrice = (v.salePrice && Number(v.salePrice) > 0) ? Number(v.salePrice) : undefined;
          const vSalePrice = vCustomSalePrice || (
            (v.sale !== undefined && v.sale !== null && v.sale !== '' && Number(v.sale) > 0)
              ? Math.round(vPrice * (1 - Number(v.sale) / 100))
              : (data.salePrice && Number(data.salePrice) > 0 && (!v.price || Number(v.price) === Number(data.price)))
              ? Number(data.salePrice)
              : (data.sale && Number(data.sale) > 0)
              ? Math.round(vPrice * (1 - Number(data.sale) / 100))
              : undefined
          );
          const vSale = (vSalePrice && vPrice > 0 && vSalePrice < vPrice)
            ? Math.round((1 - vSalePrice / vPrice) * 100)
            : (v.sale !== undefined && v.sale !== null && v.sale !== '')
            ? Number(v.sale)
            : (data.sale !== undefined ? Number(data.sale) : undefined);

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
            images: Array.from(new Set([v.imageUrl || v.thumbUrl, ...baseImages].filter(Boolean))),
            additionalImages: Array.isArray(data.additionalImages) ? data.additionalImages : [],
            hoverImageUrl: data.hoverImageUrl || undefined,
            imageUrl: v.imageUrl || v.thumbUrl || finalImageUrl,
            colorVariants: data.colorVariants || [],
            patternVariants: data.patternVariants || [],
            comboVariants: data.comboVariants || [],
            collections: data.collections || [],
            isBestSeller: vIsBestSeller,
            isNew: Boolean(data.isNew),
            isFeatured: Boolean(data.isFeatured),
            rating: Number(data.rating) || 5,
            createdAt: data.createdAt || data.createdDate,
            updatedAt: data.updatedAt,
            dimensions: data.dimensions,
            details: data.details,
            specs: data.specs,
            usage: data.usage,
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
      });

      setProducts(items);
      seedProductCache(items);
      setLoadingProducts(false);
    }, (error) => {
      console.warn('Realtime Products Error:', error);
      setLoadingProducts(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to News
  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let items: any[] = [];
      snapshot.forEach((d) => {
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

        items.push({
          id: d.id,
          title: data.title || 'Bài viết từ Tiệm',
          imageUrl: data.imageUrl || 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
          content: data.content || '',
          excerpt,
          dateStr,
        });
      });
      setNews(items);
    });
    return () => unsubscribe();
  }, []);

  // Listen to User Orders
  useEffect(() => {
    const targetUid = userProfile?.uid || user?.uid;
    const phone = userProfile?.phone;
    if (!targetUid && !phone) {
      setOrders([]);
      return;
    }

    if (targetUid) {
      getUserOrders(targetUid, phone, user?.email || userProfile?.email)
        .then((linked) => {
          if (linked && linked.length > 0) {
            setOrders(linked);
          }
        })
        .catch(() => {});
    }

    const q = targetUid
      ? query(collection(db, 'orders'), where('userId', '==', targetUid))
      : query(collection(db, 'orders'), where('customerInfo.phone', '==', phone));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let items: any[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() });
        });

        // Sort manually by createdAt/orderDate desc
        items.sort((a, b) => {
          const timeA = a.createdAt?.seconds || a.orderDate?.seconds || 0;
          const timeB = b.createdAt?.seconds || b.orderDate?.seconds || 0;
          return timeB - timeA;
        });

        if (items.length > 0) {
          setOrders(items);
        }

        // Tự động đồng bộ thông báo đơn hàng cho tài khoản người dùng
        if (targetUid) {
          syncOrderNotificationsForUser(targetUid, items).catch(() => {});
          syncUserLoyaltyAndVouchers(targetUid, userProfile, true).catch(() => {});
        }
      },
      (error) => {
        console.warn('Realtime Orders Error:', error);
      }
    );
    return () => unsubscribe();
  }, [user, userProfile]);

  const value = useMemo(
    () => ({ products, orders, news, loadingProducts }),
    [products, orders, news, loadingProducts]
  );

  return (
    <RealtimeDataContext.Provider value={value}>
      {children}
    </RealtimeDataContext.Provider>
  );
};
