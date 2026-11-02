// src/services/orderService.ts
import { addDoc, collection, doc, getDocs, getDoc, setDoc, limit, orderBy, query, serverTimestamp, updateDoc, where, runTransaction, increment } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../config/firebase';
import { Order } from '../types';
import { generateOrderCode, getPhoneVariants, formatPhoneNumber } from '../utils/format';

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

    // Kiểm tra quy chuẩn mỗi voucher chỉ được sử dụng 1 lần duy nhất cho mỗi khách hàng (giống bản web)
    if (cleanOrderData.userId && cleanOrderData.couponCode) {
      const cleanCoupon = String(cleanOrderData.couponCode).trim().toUpperCase();
      try {
        const qCheckUsed = query(
          collection(db, 'orders'),
          where('userId', '==', cleanOrderData.userId)
        );
        const checkSnap = await getDocs(qCheckUsed);
        let alreadyUsed = false;
        checkSnap.forEach((d) => {
          const od = d.data();
          const c1 = String(od.couponCode || '').toUpperCase();
          const c2 = String(od.appliedCoupon?.code || od.appliedCoupon?.id || '').toUpperCase();
          const c3 = String(od.coupon || od.promoCode || '').toUpperCase();
          if (c1 === cleanCoupon || c2 === cleanCoupon || c3 === cleanCoupon) {
            alreadyUsed = true;
          }
        });
        if (alreadyUsed) {
          return {
            success: false,
            error: 'Bạn đã sử dụng mã giảm giá này cho một đơn hàng trước đó.',
          };
        }
      } catch (checkErr) {
        console.warn('Lỗi kiểm tra trùng lặp voucher:', checkErr);
      }
    }

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

      // Đọc coupon doc nếu có để cập nhật lượt dùng trong write phase
      let couponDocRef: any = null;
      if (cleanOrderData.couponCode) {
        const cRef = doc(db, 'coupons', cleanOrderData.couponCode);
        const cSnap = await transaction.get(cRef);
        if (cSnap.exists()) {
          couponDocRef = cRef;
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

      if (couponDocRef) {
        transaction.update(couponDocRef, { usedCount: increment(1) });
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
 * Tự động liên kết các đơn hàng cũ (từ POS, đặt hàng vãng lai trên web...) vào tài khoản userId dựa trên SĐT và Email
 */
// ── IN-MEMORY VÀ ASYNCSTORAGE CACHE ĐƠN HÀNG ──
const _ordersMemoryCache = new Map<string, { timestamp: number; orders: Order[] }>();

/**
 * Lấy đơn hàng từ bộ nhớ RAM tức thì (0ms) nếu đã có sẵn
 */
export function getCachedUserOrders(userId: string): Order[] | null {
  if (!userId || userId === 'guest') return null;
  const entry = _ordersMemoryCache.get(userId);
  if (entry && entry.orders && entry.orders.length > 0) {
    return entry.orders;
  }
  return null;
}

/**
 * Lấy đơn hàng từ AsyncStorage (1-5ms) phục vụ render tức thì khi vừa mở màn hình
 */
export async function getCachedUserOrdersAsync(userId: string): Promise<Order[]> {
  if (!userId || userId === 'guest') return [];
  const inMem = getCachedUserOrders(userId);
  if (inMem) return inMem;
  try {
    const raw = await AsyncStorage.getItem(`@tiemnhagom_cached_orders_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _ordersMemoryCache.set(userId, { timestamp: Date.now(), orders: parsed });
        return parsed;
      }
    }
  } catch {}
  return [];
}

export async function autoLinkUserOrders(userId: string, phone?: string | null, email?: string | null): Promise<number> {
  if (!userId || userId === 'guest') return 0;

  try {
    const ordersRef = collection(db, 'orders');
    const orderDocsToUpdate = new Map<string, any>();
    const oldCustIds: string[] = [];

    // 1. Tìm các ghost users cũ (cust_...) có cùng SĐT
    if (phone) {
      const variants = getPhoneVariants(phone);
      if (variants.length > 0) {
        try {
          const qUsers = query(collection(db, 'users'), where('phone', 'in', variants));
          const usersSnap = await getDocs(qUsers);
          usersSnap.forEach((uSnap) => {
            if (uSnap.id !== userId) {
              oldCustIds.push(uSnap.id);
              const uData = uSnap.data() as any;
              if (uData.displayName || uData.address) {
                setDoc(
                  doc(db, 'users', userId),
                  {
                    displayName: uData.displayName || '',
                    address: uData.address || '',
                  },
                  { merge: true }
                ).catch(() => {});
              }
              if (uData.isGhost === true || uSnap.id.startsWith('cust_')) {
                setDoc(uSnap.ref, { isMerged: true, mergedTo: userId }, { merge: true }).catch(() => {});
              }
            }
          });
        } catch {}

        // Gom các truy vấn đơn hàng theo SĐT và Ghost IDs để chạy song song
        const queriesToRun: any[] = [
          query(ordersRef, where('shippingAddress.phone', 'in', variants), limit(50)),
          query(ordersRef, where('customerPhone', 'in', variants), limit(50)),
          query(ordersRef, where('phone', 'in', variants), limit(50)),
        ];

        if (oldCustIds.length > 0) {
          queriesToRun.push(query(ordersRef, where('customerId', 'in', oldCustIds.slice(0, 10)), limit(50)));
        }

        if (email && email.includes('@')) {
          const cleanEmail = email.trim().toLowerCase();
          queriesToRun.push(
            query(ordersRef, where('shippingAddress.email', '==', cleanEmail), limit(50)),
            query(ordersRef, where('customerEmail', '==', cleanEmail), limit(50)),
            query(ordersRef, where('email', '==', cleanEmail), limit(50)),
            query(ordersRef, where('to_email', '==', cleanEmail), limit(50))
          );
        }

        // Chạy song song tất cả các truy vấn
        const snaps = await Promise.allSettled(queriesToRun.map((q) => getDocs(q)));
        snaps.forEach((res) => {
          if (res.status === 'fulfilled' && res.value && !res.value.empty) {
            res.value.forEach((d: any) => {
              const data = d.data() as any;
              if (data.userId !== userId) {
                orderDocsToUpdate.set(d.id, d.ref);
              }
            });
          }
        });
      }
    } else if (email && email.includes('@')) {
      const cleanEmail = email.trim().toLowerCase();
      const emailQueries = [
        query(ordersRef, where('shippingAddress.email', '==', cleanEmail), limit(50)),
        query(ordersRef, where('customerEmail', '==', cleanEmail), limit(50)),
        query(ordersRef, where('email', '==', cleanEmail), limit(50)),
        query(ordersRef, where('to_email', '==', cleanEmail), limit(50)),
      ];
      const snaps = await Promise.allSettled(emailQueries.map((q) => getDocs(q)));
      snaps.forEach((res) => {
        if (res.status === 'fulfilled' && res.value && !res.value.empty) {
          res.value.forEach((d: any) => {
            const data = d.data() as any;
            if (data.userId !== userId) {
              orderDocsToUpdate.set(d.id, d.ref);
            }
          });
        }
      });
    }

    // Cập nhật userId cho tất cả các đơn hàng tìm được
    const updatePromises: Promise<any>[] = [];
    orderDocsToUpdate.forEach((ref) => {
      updatePromises.push(
        setDoc(ref, { userId }, { merge: true }).catch((err) => {
          console.warn('Lỗi liên kết đơn hàng:', err);
        })
      );
    });

    if (updatePromises.length > 0) {
      await Promise.allSettled(updatePromises);
    }

    return orderDocsToUpdate.size;
  } catch (error) {
    console.warn('Lỗi trong autoLinkUserOrders:', error);
    return 0;
  }
}

/**
 * Lấy lịch sử đơn hàng của User đăng nhập (hỗ trợ cả userId và liên kết tự động theo SĐT & Email)
 * Có cơ chế Cache RAM tức thời và chạy song song (Parallel execution) đạt hiệu năng siêu tốc
 */
export async function getUserOrders(
  userId: string,
  userPhone?: string | null,
  userEmail?: string | null,
  forceRefresh: boolean = false
): Promise<Order[]> {
  if (!userId || userId === 'guest') return [];

  // Trả về ngay lập tức nếu đã có cache RAM còn mới (< 45 giây) và không yêu cầu forceRefresh
  if (!forceRefresh) {
    const cached = _ordersMemoryCache.get(userId);
    if (cached && Date.now() - cached.timestamp < 45000 && cached.orders.length > 0) {
      return cached.orders;
    }
  }

  try {
    const ordersRef = collection(db, 'orders');
    let phoneToSearch = userPhone;
    let emailToSearch = userEmail;
    let mergedToId: string | undefined;

    // Nếu thiếu số điện thoại hoặc email, đọc doc users/{userId} để bổ sung
    if (!phoneToSearch || !emailToSearch) {
      try {
        const uSnap = await getDoc(doc(db, 'users', userId));
        if (uSnap.exists()) {
          const uData = uSnap.data() as any;
          if (uData.mergedTo && uData.mergedTo !== userId) {
            mergedToId = uData.mergedTo;
          }
          if (!phoneToSearch) {
            phoneToSearch = uData.phone || uData.phoneNumber || '';
            if (!phoneToSearch && Array.isArray(uData.addresses) && uData.addresses.length > 0) {
              const firstAddr = uData.addresses.find((a: any) => a && a.phone);
              if (firstAddr) phoneToSearch = firstAddr.phone;
            }
          }
          if (!emailToSearch) {
            emailToSearch = uData.email || '';
          }
        }
      } catch {}
    }

    // Tập hợp TẤT CẢ các truy vấn cần thực hiện
    const queriesToRun: any[] = [
      query(ordersRef, where('userId', '==', userId), limit(100)),
    ];

    if (mergedToId) {
      queriesToRun.push(query(ordersRef, where('userId', '==', mergedToId), limit(100)));
    }

    if (phoneToSearch) {
      const variants = getPhoneVariants(phoneToSearch);
      if (variants.length > 0) {
        queriesToRun.push(
          query(ordersRef, where('shippingAddress.phone', 'in', variants), limit(50)),
          query(ordersRef, where('customerPhone', 'in', variants), limit(50)),
          query(ordersRef, where('phone', 'in', variants), limit(50))
        );
      }
    }

    if (emailToSearch && emailToSearch.includes('@')) {
      const cleanEmail = emailToSearch.trim().toLowerCase();
      queriesToRun.push(
        query(ordersRef, where('shippingAddress.email', '==', cleanEmail), limit(50)),
        query(ordersRef, where('customerEmail', '==', cleanEmail), limit(50)),
        query(ordersRef, where('email', '==', cleanEmail), limit(50)),
        query(ordersRef, where('to_email', '==', cleanEmail), limit(50))
      );
    }

    // THỰC THI ĐỒNG THỜI TẤT CẢ TRUY VẤN (TỐC ĐỘ X5 ĐẾN X10 SO VỚI TUẦN TỰ)
    const snapshots = await Promise.allSettled(queriesToRun.map((q) => getDocs(q)));

    const ordersMap = new Map<string, Order>();
    const unlinkedOrderIds: string[] = [];

    snapshots.forEach((res) => {
      if (res.status === 'fulfilled' && res.value && !res.value.empty) {
        res.value.forEach((d: any) => {
          const orderData = d.data() as any;
          ordersMap.set(d.id, { id: d.id, ...orderData });
          if (orderData.userId !== userId) {
            unlinkedOrderIds.push(d.id);
          }
        });
      }
    });

    // Cập nhật liên kết ngầm trong background (fire-and-forget, không đợi để UI load ngay)
    if (unlinkedOrderIds.length > 0) {
      unlinkedOrderIds.forEach((orderId) => {
        setDoc(doc(db, 'orders', orderId), { userId }, { merge: true }).catch(() => {});
      });
    }

    // Chạy ngầm auto-link để quét thêm các trường hợp đặc biệt
    if (phoneToSearch || emailToSearch) {
      setTimeout(() => {
        autoLinkUserOrders(userId, phoneToSearch, emailToSearch).catch(() => {});
      }, 150);
    }

    const orders = Array.from(ordersMap.values());
    orders.sort((a, b) => {
      const timeA = (a as any).createdAt?.seconds || (a as any).orderDate?.seconds || 0;
      const timeB = (b as any).createdAt?.seconds || (b as any).orderDate?.seconds || 0;
      return timeB - timeA;
    });

    // Cập nhật cả cache RAM lẫn AsyncStorage
    _ordersMemoryCache.set(userId, { timestamp: Date.now(), orders });
    AsyncStorage.setItem(`@tiemnhagom_cached_orders_${userId}`, JSON.stringify(orders)).catch(() => {});

    return orders;
  } catch (error) {
    console.error('Lỗi lấy đơn hàng của user:', error);
    // Nếu có cache trong RAM, fallback về cache khi mạng chập chờn
    const cached = _ordersMemoryCache.get(userId);
    if (cached && cached.orders) return cached.orders;
    return [];
  }
}
