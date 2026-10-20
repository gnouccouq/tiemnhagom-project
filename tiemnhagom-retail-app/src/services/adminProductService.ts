// src/services/adminProductService.ts
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Product, Category, InventoryLog, RestockAlert } from '../types';

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
          barcode: data.barcode || '',
          cost: data.cost || 0,
          name: data.name || '',
          price: data.price || 0,
          sale: data.sale || 0,
          salePrice: data.salePrice || (data.sale ? Math.round(data.price * (1 - data.sale / 100)) : data.price),
          rentalPrice: data.rentalPrice || 0,
          stock: data.stock !== undefined ? data.stock : 0,
          stockMin: data.stockMin !== undefined ? data.stockMin : 0,
          stockMax: data.stockMax !== undefined ? data.stockMax : 999999,
          category: data.category || 'Tất cả',
          subCategory: data.subCategory || '',
          collections: data.collections || [],
          events: data.events || [],
          images: data.images || (data.imageUrl ? [data.imageUrl] : []),
          imageUrl: data.imageUrl || (data.images && data.images[0]) || '',
          hoverImageUrl: data.hoverImageUrl || '',
          description: data.description || '',
          variants: data.variants || [],
          productType: data.productType || 'normal',
          comboVariants: data.comboVariants || [],
          dimLength: data.dimLength || undefined,
          dimWidth: data.dimWidth || undefined,
          dimHeight: data.dimHeight || undefined,
          weight: data.weight || undefined,
          capacity: data.capacity || undefined,
          material: data.material || '',
          origin: data.origin || '',
          dishwasherSafe: data.dishwasherSafe !== undefined ? !!data.dishwasherSafe : true,
          microwaveSafe: data.microwaveSafe !== undefined ? !!data.microwaveSafe : true,
          foodSafe: data.foodSafe !== undefined ? !!data.foodSafe : true,
          ovenSafe: !!data.ovenSafe,
          flashSaleGroupId: data.flashSaleGroupId || '',
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

export async function quickUpdateStock(
  productId: string,
  newStock: number,
  productName?: string,
  previousStock?: number,
  reason?: string,
  staffName?: string
): Promise<boolean> {
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });

    // Ghi nhật ký tồn kho (Inventory Log)
    if (previousStock !== undefined && previousStock !== newStock) {
      await addDoc(collection(db, 'inventory_logs'), {
        productId,
        productName: productName || productId,
        previousStock,
        newStock,
        diff: newStock - previousStock,
        reason: reason || 'Kiểm kê điều chỉnh tại quầy POS',
        staffName: staffName || 'Nhân viên',
        createdAt: serverTimestamp(),
      });
    }

    return true;
  } catch (err) {
    console.error('Lỗi cập nhật tồn kho:', err);
    return false;
  }
}

export function subscribeInventoryLogs(
  onUpdate: (logs: InventoryLog[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(collection(db, 'inventory_logs'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs: InventoryLog[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          productId: d.productId || '',
          productName: d.productName || 'Sản phẩm',
          previousStock: d.previousStock ?? 0,
          newStock: d.newStock ?? 0,
          diff: d.diff ?? 0,
          reason: d.reason || 'Điều chỉnh kho',
          staffName: d.staffName || 'Thu ngân',
          createdAt: d.createdAt,
        };
      });
      onUpdate(logs);
    },
    (err) => {
      console.warn('Lỗi đọc nhật ký kho:', err);
      if (onError) onError(err);
    }
  );
}

export function subscribeRestockAlerts(
  onUpdate: (alerts: RestockAlert[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(collection(db, 'restock_alerts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snapshot) => {
      const alerts: RestockAlert[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          productId: d.productId || '',
          productName: d.productName || 'Sản phẩm',
          productImage: d.productImage || '',
          customerPhone: d.customerPhone || '',
          customerEmail: d.customerEmail || '',
          customerName: d.customerName || 'Khách hàng',
          status: d.status || 'pending',
          createdAt: d.createdAt,
        };
      });
      onUpdate(alerts);
    },
    (err) => {
      console.warn('Lỗi đọc yêu cầu báo có hàng:', err);
      if (onError) onError(err);
    }
  );
}

export async function resolveRestockAlert(alertId: string, status: 'notified' | 'cancelled'): Promise<boolean> {
  try {
    const alertRef = doc(db, 'restock_alerts', alertId);
    await updateDoc(alertRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('Lỗi cập nhật yêu cầu báo có hàng:', err);
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

export async function saveProductCategories(categories: Category[]): Promise<boolean> {
  try {
    const catDocRef = doc(db, 'settings', 'product_categories');
    const groups = categories.map((c, idx) => ({
      name: c.name,
      code: c.code || c.name,
      icon: c.icon || '',
      order: c.order !== undefined ? c.order : idx + 1,
      subs: c.subcategories || [],
    }));
    await setDoc(catDocRef, { groups, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (err) {
    console.error('Lỗi lưu danh mục:', err);
    return false;
  }
}
