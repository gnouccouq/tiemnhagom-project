import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product } from '../types';
import { useAuth } from './AuthContext';

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
        
        // Expand variants
        const processVariant = (v: any, type: 'color' | 'pattern' | 'combo') => {
          if (!v || !v.showOnProductPage) return;
          const rawVStock = (v.stock !== undefined && v.stock !== null) ? Number(v.stock) : (Number(data.stock) || 0);
          const isManualOut = Boolean(v.manualOutOfStock);
          const vStock = (!isManualOut && rawVStock <= 0 && (Number(data.stock) || 0) > 0) ? Number(data.stock) : rawVStock;
          const vIsOutOfStock = isManualOut || (Boolean(v.isOutOfStock) && vStock <= 0) || vStock <= 0;
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
      });

      setProducts(items);
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
    const phone = userProfile?.phone;
    if (!user && !phone) {
      setOrders([]);
      return;
    }

    let q;
    if (user) {
      q = query(collection(db, 'orders'), where('userId', '==', user.uid));
    } else if (phone) {
      q = query(collection(db, 'orders'), where('customerInfo.phone', '==', phone));
    }

    if (q) {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        let items: any[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() });
        });
        
        // Sort manually by createdAt desc to avoid composite index requirement
        items.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
        
        setOrders(items);
      });
      return () => unsubscribe();
    }
  }, [user, userProfile]);

  return (
    <RealtimeDataContext.Provider value={{ products, orders, news, loadingProducts }}>
      {children}
    </RealtimeDataContext.Provider>
  );
};
