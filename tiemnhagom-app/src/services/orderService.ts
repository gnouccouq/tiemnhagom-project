// src/services/orderService.ts
import { addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, runTransaction, increment } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Order } from '../types';
import { generateOrderCode } from '../utils/format';

/**
 * Tạo đơn hàng mới trong collection "orders"
 */
export async function createOrder(orderData: Omit<Order, 'orderCode' | 'orderDate' | 'status' | 'paymentStatus'>): Promise<{ success: boolean; orderId?: string; orderCode?: string; error?: string }> {
  try {
    const orderCode = generateOrderCode();
    const ordersRef = collection(db, 'orders');

    // Hàm đệ quy xóa các trường undefined
    const removeUndefined = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(removeUndefined);
      } else if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
          if (obj[key] !== undefined) {
            result[key] = removeUndefined(obj[key]);
          }
        }
        return result;
      }
      return obj;
    };

    const cleanOrderData = removeUndefined(orderData);

    const newOrder = {
      ...cleanOrderData,
      orderCode,
      status: 'Đang xử lý',
      paymentStatus: cleanOrderData.paymentMethod === 'cod' ? 'pending' : 'pending',
      orderDate: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    let newOrderId = '';

    await runTransaction(db, async (transaction) => {
      // 1. Read product stocks
      const productSnapshots: any[] = [];
      const items = cleanOrderData.items || [];
      const productDocsMap: Record<string, any> = {};
      
      for (const item of items) {
        if (!item.id) continue;
        const productRef = doc(db, 'products', item.id);
        const snap = await transaction.get(productRef);
        if (snap.exists()) {
           const productData = snap.data();
           productDocsMap[item.id] = { ref: productRef, data: productData };
           productSnapshots.push({ item, productRef, productData, isChild: false });
        }
      }

      // Second pass: Fetch child items of combo variants
      // Need a traditional loop because we are pushing to productSnapshots while iterating
      const initialLength = productSnapshots.length;
      for (let i = 0; i < initialLength; i++) {
          const { item, productData } = productSnapshots[i];
          if (productData.isCombo && item.variant && item.variant.type === 'combo') {
              const cv = productData.comboVariants?.find((v: any) => v.name === item.variant.name);
              if (cv && cv.items) {
                  for (const child of cv.items) {
                      if (!productDocsMap[child.id]) {
                          const childRef = doc(db, 'products', child.id);
                          const childSnap = await transaction.get(childRef);
                          if (childSnap.exists()) {
                              productDocsMap[child.id] = { ref: childRef, data: childSnap.data() };
                          }
                      }
                      
                      if (productDocsMap[child.id]) {
                          const childQty = item.quantity * Math.max(1, parseInt(child.quantity, 10) || 1);
                          const pseudoItem: any = {
                              id: child.id,
                              quantity: childQty,
                          };
                          if (child.selectedColor) {
                              pseudoItem.variant = { type: 'color', name: child.selectedColor };
                          } else if (child.selectedPattern) {
                              pseudoItem.variant = { type: 'pattern', name: child.selectedPattern };
                          }
                          productSnapshots.push({ 
                              item: pseudoItem, 
                              productRef: productDocsMap[child.id].ref, 
                              productData: productDocsMap[child.id].data, 
                              isChild: true 
                          });
                      }
                  }
              }
          }
      }

      // 2. Compute stock updates
      const productUpdatesMap: any = {};
      for (const { item, productRef, productData, isChild } of productSnapshots) {
         const pId = item.id;
         if (!productUpdatesMap[pId]) {
            productUpdatesMap[pId] = {
               productRef,
               productData,
               totalSold: 0,
               comboQtyMap: {} as any,
               colorQtyMap: {} as any,
               patternQtyMap: {} as any,
            };
         }
         
         const pInfo = productUpdatesMap[pId];
         if (!isChild) {
             pInfo.totalSold += item.quantity;
         } else {
             // For child items, we only deduct stock, we might optionally increment sold count
             pInfo.totalSold += item.quantity; 
         }
         
         if (item.variant && item.variant.type === 'combo') {
            const vName = item.variant.name;
            pInfo.comboQtyMap[vName] = (pInfo.comboQtyMap[vName] || 0) + item.quantity;
         } else if (item.variant && item.variant.type === 'color') {
            const vName = item.variant.name;
            pInfo.colorQtyMap[vName] = (pInfo.colorQtyMap[vName] || 0) + item.quantity;
         } else if (item.variant && item.variant.type === 'pattern') {
            const vName = item.variant.name;
            pInfo.patternQtyMap[vName] = (pInfo.patternQtyMap[vName] || 0) + item.quantity;
         }
      }

      for (const pId of Object.keys(productUpdatesMap)) {
         const { productRef, productData, totalSold, comboQtyMap, colorQtyMap, patternQtyMap } = productUpdatesMap[pId];
         
         let updatePayload: any = {
            sold: increment(totalSold)
         };
         
         if (!productData.isCombo) {
            updatePayload.stock = increment(-totalSold);
         }
         
         if (Array.isArray(productData.comboVariants) && Object.keys(comboQtyMap || {}).length > 0) {
            updatePayload.comboVariants = productData.comboVariants.map((v: any) => {
               const qty = comboQtyMap[v.name] || 0;
               if (qty > 0) {
                  return {
                     ...v,
                     stock: Math.max(0, (v.stock || 0) - qty),
                     sold: (v.sold || 0) + qty
                  };
               }
               return v;
            });
         }
         
         if (Array.isArray(productData.colorVariants) && Object.keys(colorQtyMap || {}).length > 0) {
            updatePayload.colorVariants = productData.colorVariants.map((v: any) => {
               const qty = colorQtyMap[v.name] || 0;
               if (qty > 0) {
                  return {
                     ...v,
                     stock: Math.max(0, (v.stock || 0) - qty),
                     sold: (v.sold || 0) + qty
                  };
               }
               return v;
            });
         }
         
         if (Array.isArray(productData.patternVariants) && Object.keys(patternQtyMap || {}).length > 0) {
            updatePayload.patternVariants = productData.patternVariants.map((v: any) => {
               const qty = patternQtyMap[v.name] || 0;
               if (qty > 0) {
                  return {
                     ...v,
                     stock: Math.max(0, (v.stock || 0) - qty),
                     sold: (v.sold || 0) + qty
                  };
               }
               return v;
            });
         }
         
         transaction.update(productRef, updatePayload);
      }

      const newOrderRef = doc(collection(db, 'orders'));
      newOrderId = newOrderRef.id;
      transaction.set(newOrderRef, newOrder);
    });

    return {
      success: true,
      orderId: newOrderId,
      orderCode,
    };
  } catch (error: any) {
    console.error('Lỗi tạo đơn hàng:', error);
    return {
      success: false,
      error: error.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.',
    };
  }
}

/**
 * Tra cứu đơn hàng theo Số Điện Thoại hoặc Mã Đơn Hàng
 */
export async function lookupOrders(searchTerm: string): Promise<Order[]> {
  const clean = searchTerm.trim();
  if (!clean) return [];

  try {
    const ordersRef = collection(db, 'orders');
    const results: Order[] = [];

    // 1. Tìm theo Order Code
    const qCode = query(ordersRef, where('orderCode', '==', clean.toUpperCase()));
    const snapCode = await getDocs(qCode);
    snapCode.forEach((d) => {
      results.push({ id: d.id, ...(d.data() as any) });
    });

    // 2. Tìm theo Số điện thoại người nhận nếu chưa thấy hoặc nếu là số
    if (clean.length >= 8) {
      const qPhone = query(ordersRef, where('shippingAddress.phone', '==', clean));
      const snapPhone = await getDocs(qPhone);
      snapPhone.forEach((d) => {
        if (!results.some((r) => r.id === d.id)) {
          results.push({ id: d.id, ...(d.data() as any) });
        }
      });
    }

    // Sắp xếp đơn mới nhất lên đầu
    results.sort((a, b) => {
      const timeA = a.orderDate?.seconds || 0;
      const timeB = b.orderDate?.seconds || 0;
      return timeB - timeA;
    });

    return results;
  } catch (error) {
    console.error('Lỗi tra cứu đơn hàng:', error);
    return [];
  }
}

/**
 * Lấy lịch sử đơn hàng của User đăng nhập
 */
export async function getUserOrders(userId: string): Promise<Order[]> {
  if (!userId) return [];
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', userId),
      limit(30)
    );
    const snap = await getDocs(q);
    const orders: Order[] = [];
    snap.forEach((d) => {
      orders.push({ id: d.id, ...(d.data() as any) });
    });

    orders.sort((a, b) => {
      const timeA = a.orderDate?.seconds || 0;
      const timeB = b.orderDate?.seconds || 0;
      return timeB - timeA;
    });

    return orders;
  } catch (error) {
    console.error('Lỗi lấy đơn hàng của user:', error);
    return [];
  }
}
