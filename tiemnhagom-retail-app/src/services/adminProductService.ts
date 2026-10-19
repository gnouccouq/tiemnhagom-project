// src/services/adminProductService.ts
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product, Category } from '../types';

export function subscribeProducts(
  onUpdate: (products: Product[]) => void,
  onError?: (error: Error) => void
) {
  const productsRef = collection(db, 'products');

  return onSnapshot(
    productsRef,
    (snapshot) => {
      const products: Product[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          code: data.code || docSnap.id,
          name: data.name || '',
          price: data.price || 0,
          sale: data.sale || 0,
          salePrice: data.salePrice || (data.sale ? Math.round(data.price * (1 - data.sale / 100)) : data.price),
          stock: data.stock !== undefined ? data.stock : 0,
          category: data.category || 'Tất cả',
          subCategory: data.subCategory || '',
          collections: data.collections || [],
          images: data.images || (data.imageUrl ? [data.imageUrl] : []),
          imageUrl: data.imageUrl || (data.images && data.images[0]) || '',
          description: data.description || '',
          variants: data.variants || [],
          isHidden: !!data.isHidden,
          isOnlyEvent: !!data.isOnlyEvent,
          sold: data.sold || 0,
          views: data.views || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      onUpdate(products);
    },
    (error) => {
      console.error('Lỗi tải sản phẩm:', error);
      if (onError) onError(error);
    }
  );
}

export async function addProduct(productData: Partial<Product>): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const id = productData.id || `TNG_${Date.now()}`;
    const productRef = doc(db, 'products', id);
    const dataToSave: any = {
      ...productData,
      id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(productRef, dataToSave);
    return { success: true, id };
  } catch (err: any) {
    console.error('Lỗi thêm sản phẩm:', err);
    return { success: false, error: err.message };
  }
}

export async function updateProduct(productId: string, updates: Partial<Product>): Promise<boolean> {
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi cập nhật sản phẩm:', err);
    return false;
  }
}

export async function quickUpdateStock(productId: string, newStock: number): Promise<boolean> {
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi cập nhật tồn kho:', err);
    return false;
  }
}

export async function toggleProductVisibility(productId: string, isHidden: boolean): Promise<boolean> {
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, {
      isHidden,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi đổi trạng thái ẩn/hiện sản phẩm:', err);
    return false;
  }
}

export async function deleteProduct(productId: string): Promise<boolean> {
  try {
    const productRef = doc(db, 'products', productId);
    await deleteDoc(productRef);
    return true;
  } catch (err) {
    console.error('Lỗi xóa sản phẩm:', err);
    return false;
  }
}

const DEFAULT_FALLBACK_CATEGORIES: Category[] = [
  { id: 'Dining Decor', name: 'Dining Decor', order: 1, subcategories: ['Tô, Bát & Chén', 'Đĩa Ăn & Decor', 'Muỗng Đũa & Phụ Kiện', 'Gia Vị & Nước Chấm'] },
  { id: 'Teatime & Drinks', name: 'Teatime & Drinks', order: 2, subcategories: ['Ấm Trà', 'Cốc, Ly & Phụ Kiện', 'Dụng Cụ Matcha', 'Phin & Dụng Cụ Pha Chế'] },
  { id: 'Home Decor', name: 'Home Decor', order: 3, subcategories: ['Bình & Lọ Hoa', 'Đèn & Tượng Decor', 'Khay Decor & Trưng Bày', 'Hoa & Phụ Kiện'] },
  { id: 'Kitchenware', name: 'Kitchenware', order: 4, subcategories: ['Nồi & Chảo', 'Dụng Cụ Làm Bếp', 'Phụ Kiện & Bảo Quản'] },
  { id: 'Lifestyle', name: 'Lifestyle', order: 5, subcategories: ['Tinh Dầu & Nến Thơm', 'Túi & Giỏ Đan', 'Móc Khóa & Quà Tặng', 'Phụ Kiện Cá Nhân'] },
  { id: 'Value Packs', name: 'Value Packs', order: 6, subcategories: ['Combo Bàn Ăn', 'Set Matcha & Trà Đạo'] },
];

export function subscribeCategories(
  onUpdate: (categories: Category[]) => void,
  onError?: (error: Error) => void
) {
  const catDocRef = doc(db, 'settings', 'product_categories');
  return onSnapshot(
    catDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const groups: any[] = data.groups || [];
        if (groups.length > 0) {
          const sorted = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));
          const cats: Category[] = sorted.map((g) => ({
            id: g.name,
            name: g.name,
            code: g.code || g.name,
            icon: g.icon,
            order: g.order,
            subcategories: Array.isArray(g.subs) ? g.subs : (g.subcategories || []),
          }));
          onUpdate(cats);
          return;
        }
      }
      onUpdate(DEFAULT_FALLBACK_CATEGORIES);
    },
    (err) => {
      console.warn('Lỗi đọc danh mục từ settings/product_categories:', err);
      onUpdate(DEFAULT_FALLBACK_CATEGORIES);
      if (onError) onError(err);
    }
  );
}
