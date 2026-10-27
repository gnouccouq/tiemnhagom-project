import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CartItem, Product, ProductVariant, UserAddress } from '../types';
import { CouponItem } from '../services/couponService';
import { useAuth } from './AuthContext';
import { FlyingCartOverlay, FlyingItemData } from '../components/FlyingCartOverlay';
import {
  isHCMProvince,
  getMemberTier,
  calculateMembershipDiscount,
  calculateAppShippingFee,
  MemberTierInfo,
} from '../utils/shipping';
import { syncUserLoyaltyAndVouchers } from '../services/loyaltyService';
import { checkOutOfStock } from '../utils/format';

export type PaymentMethodType = 'cod' | 'banking';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, variant?: ProductVariant) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  memberDiscount: number;
  memberTier: MemberTierInfo;
  totalAmount: number;
  appliedCoupon: string | null;
  appliedCouponItem: CouponItem | null;
  applyCoupon: (code: string) => boolean;
  applyCouponItem: (coupon: CouponItem | null) => void;
  removeCoupon: () => void;
  shippingMethod: 'standard' | 'express_2h' | 'pickup';
  setShippingMethod: (method: 'standard' | 'express_2h' | 'pickup') => void;
  selectedAddress: UserAddress | null;
  setSelectedAddress: (addr: UserAddress | null) => void;
  isHCM: boolean;
  paymentMethod: PaymentMethodType;
  setPaymentMethod: (method: PaymentMethodType) => void;
  orderNote: string;
  setOrderNote: (note: string) => void;
  isGiftWrap: boolean;
  setIsGiftWrap: (val: boolean) => void;
  giftCardMessage: string;
  setGiftCardMessage: (msg: string) => void;
  cartBounceKey: number;
  triggerCartBounce: () => void;
  flyToCart: (imageUri: string, startX?: number, startY?: number, targetX?: number, targetY?: number) => void;
}

const STORAGE_KEY_GUEST = '@tiemnhagom_cart_guest';
const getCartStorageKey = (uid: string) => `@tiemnhagom_cart_${uid}`;
const CartContext = createContext<CartContextType>({} as CartContextType);

// Hàm chuẩn hóa dữ liệu giỏ hàng để lưu Firestore tương thích 100% với Web (không chứa trường undefined)
const sanitizeCartForFirestore = (items: CartItem[]) => {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId || item.id,
    name: item.name || 'Sản phẩm gốm',
    price: Number(item.price) || 0,
    originalPrice: Number(item.originalPrice ?? item.price) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
    imageUrl: item.imageUrl || '',
    image: item.imageUrl || '', // Web sử dụng field image
    variant: item.variant?.name || (typeof item.variant === 'string' ? item.variant : ''), // Web hiển thị variant dạng chuỗi
    variantObj: item.variant
      ? {
          type: item.variant.type || '',
          name: item.variant.name || '',
          imageUrl: item.variant.imageUrl || '',
        }
      : null,
    maxStock: Number(item.maxStock) || 99,
    isGift: false,
  }));
};

// Hàm phân tích dữ liệu giỏ hàng từ Firestore (từ Web hoặc App khác) về chuẩn CartItem của App
const parseCartFromFirestore = (rawItems: any[]): CartItem[] => {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item) => {
    let variantObj: any = undefined;
    if (item.variantObj && typeof item.variantObj === 'object') {
      variantObj = {
        type: item.variantObj.type || 'pattern',
        name: item.variantObj.name || '',
        imageUrl: item.variantObj.imageUrl || '',
      };
    } else if (item.variant && typeof item.variant === 'string') {
      variantObj = {
        type: 'pattern',
        name: item.variant,
        imageUrl: item.imageUrl || item.image || '',
      };
    } else if (item.variant && typeof item.variant === 'object') {
      variantObj = item.variant;
    }

    return {
      id: String(item.id || item.productId || `item_${Date.now()}`),
      productId: String(item.productId || item.id || ''),
      name: String(item.name || 'Sản phẩm gốm'),
      price: Number(item.price) || 0,
      originalPrice: Number(item.originalPrice || item.price) || 0,
      quantity: Math.max(1, Number(item.quantity) || 1),
      imageUrl: item.imageUrl || item.image || '',
      variant: variantObj,
      maxStock: Number(item.maxStock) || 99,
    };
  });
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile } = useAuth();
  const currentUid = user?.uid || null;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [appliedCouponItem, setAppliedCouponItem] = useState<CouponItem | null>(null);
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express_2h' | 'pickup'>('standard');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('cod');
  const [orderNote, setOrderNote] = useState<string>('');
  const [isGiftWrap, setIsGiftWrap] = useState<boolean>(false);
  const [giftCardMessage, setGiftCardMessage] = useState<string>('');
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(null);

  const [cartBounceKey, setCartBounceKey] = useState<number>(0);
  const [flyingItems, setFlyingItems] = useState<FlyingItemData[]>([]);
  const isSyncingRef = useRef(false);

  // Tự động khởi tạo địa chỉ mặc định từ hồ sơ người dùng nếu chưa chọn
  useEffect(() => {
    if (selectedAddress) return;

    if (userProfile?.addresses && userProfile.addresses.length > 0) {
      const defaultAddr = userProfile.addresses.find((a) => a.isDefault) || userProfile.addresses[0];
      setSelectedAddress(defaultAddr);
    } else if (userProfile?.address || userProfile?.streetAddress) {
      setSelectedAddress({
        fullName: userProfile.fullName || userProfile.displayName || '',
        phone: userProfile.phone || '',
        address: userProfile.address || userProfile.streetAddress || '',
        locationName: userProfile.locationName,
        provinceName: userProfile.locationName,
        isDefault: true,
      });
    }
  }, [userProfile, selectedAddress]);

  // Kiểm tra địa chỉ đã chọn có thuộc TP. Hồ Chí Minh hay không
  const isHCM = useMemo(() => {
    if (!selectedAddress) return true; // Mặc định trong TP.HCM nếu chưa chọn
    return (
      isHCMProvince(selectedAddress.provinceName) ||
      isHCMProvince(selectedAddress.locationName) ||
      isHCMProvince(selectedAddress.address)
    );
  }, [selectedAddress]);

  // Nếu chuyển sang địa chỉ ngoại tỉnh nhưng đang chọn Hỏa tốc 2 giờ, tự động quay về Giao tiêu chuẩn
  useEffect(() => {
    if (!isHCM && shippingMethod === 'express_2h') {
      setShippingMethod('standard');
    }
  }, [isHCM, shippingMethod]);

  const [loyaltySpent, setLoyaltySpent] = useState<number>(() => {
    return Number(userProfile?.totalSpent || (userProfile as any)?.spentTotal || 0);
  });

  // Tự động đồng bộ chi tiêu thực tế từ các đơn hàng và thăng hạng thành viên
  useEffect(() => {
    let isCancelled = false;
    if (currentUid) {
      syncUserLoyaltyAndVouchers(currentUid, userProfile)
        .then((res) => {
          if (!isCancelled) {
            setLoyaltySpent(res.totalSpent);
          }
        })
        .catch(() => {});
    } else {
      setLoyaltySpent(0);
    }
    return () => {
      isCancelled = true;
    };
  }, [currentUid, userProfile]);

  // Lấy thông tin hạng thành viên từ chi tiêu thực tế (Đồng bộ với Web)
  const memberTier = useMemo(() => {
    const profileSpent = Number(userProfile?.totalSpent || (userProfile as any)?.spentTotal || 0);
    const effectiveSpent = Math.max(loyaltySpent, profileSpent);
    return getMemberTier(effectiveSpent, userProfile?.tier || userProfile?.membershipTier);
  }, [loyaltySpent, userProfile]);

  const triggerCartBounce = () => {
    setCartBounceKey((k) => k + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const flyToCart = (
    imageUri: string,
    startX?: number,
    startY?: number,
    targetX?: number,
    targetY?: number
  ) => {
    if (!imageUri) {
      triggerCartBounce();
      return;
    }
    const { width: winWidth, height: winHeight } = Dimensions.get('window');
    const newItem: FlyingItemData = {
      id: `fly_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      imageUri,
      startX: typeof startX === 'number' && !isNaN(startX) ? startX : winWidth / 2,
      startY: typeof startY === 'number' && !isNaN(startY) ? startY : winHeight * 0.45,
      targetX,
      targetY,
    };
    setFlyingItems((prev) => [...prev, newItem]);
  };

  const handleFlyingItemFinish = (id: string) => {
    setFlyingItems((prev) => prev.filter((item) => item.id !== id));
    triggerCartBounce();
  };

  // 1. Phục hồi và đồng bộ giỏ hàng khi người dùng thay đổi (Đăng nhập / Đăng xuất / Khởi động)
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | undefined;
    let isCancelled = false;

    const initCart = async () => {
      if (currentUid) {
        // --- NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP ---
        const cacheKey = getCartStorageKey(currentUid);
        try {
          // A. Đọc nhanh từ cache AsyncStorage để render ngay tức thì
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && !isCancelled) {
            setCart(JSON.parse(cached));
          }

          // B. Kiểm tra xem có giỏ hàng khách lưu tạm trước khi login không
          let guestCart: CartItem[] = [];
          const guestCached = await AsyncStorage.getItem(STORAGE_KEY_GUEST);
          if (guestCached) {
            try {
              guestCart = JSON.parse(guestCached) || [];
            } catch {}
          }

          // C. Lắng nghe Realtime từ Firestore collection `carts/{uid}` (Đồng bộ trực tiếp 2 chiều với Web)
          const cartRef = doc(db, 'carts', currentUid);
          unsubscribeFirestore = onSnapshot(cartRef, async (snap) => {
            if (isCancelled) return;
            let firestoreItems: CartItem[] = [];
            if (snap.exists()) {
              firestoreItems = parseCartFromFirestore(snap.data()?.items || []);
            }

            // Nếu có giỏ hàng khách trước khi login, gộp vào giỏ hàng tài khoản
            if (guestCart.length > 0) {
              const merged = [...firestoreItems];
              guestCart.forEach((gItem) => {
                const exIdx = merged.findIndex((m) => m.id === gItem.id);
                if (exIdx > -1) {
                  merged[exIdx].quantity += gItem.quantity;
                } else {
                  merged.push(gItem);
                }
              });
              guestCart = [];
              await AsyncStorage.removeItem(STORAGE_KEY_GUEST).catch(() => {});
              isSyncingRef.current = true;
              await setDoc(cartRef, { items: sanitizeCartForFirestore(merged), updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
              isSyncingRef.current = false;
              firestoreItems = merged;
            }

            setCart(firestoreItems);
            await AsyncStorage.setItem(cacheKey, JSON.stringify(firestoreItems)).catch(() => {});
          });
        } catch (e) {
          console.warn('Lỗi đọc giỏ hàng Firestore:', e);
        }
      } else {
        // --- KHÁCH CHƯA ĐĂNG NHẬP ---
        try {
          const guestCached = await AsyncStorage.getItem(STORAGE_KEY_GUEST);
          if (!isCancelled) {
            setCart(guestCached ? JSON.parse(guestCached) : []);
          }
        } catch (e) {
          console.warn('Lỗi đọc giỏ hàng khách:', e);
          if (!isCancelled) setCart([]);
        }
      }
      setAppliedCoupon(null);
      setAppliedCouponItem(null);
    };

    initCart();

    return () => {
      isCancelled = true;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [currentUid]);

  // Hàm trung gian cập nhật State, lưu AsyncStorage và đẩy Realtime lên Firestore
  const saveCartState = async (nextCart: CartItem[]) => {
    setCart(nextCart);
    try {
      if (currentUid) {
        const cacheKey = getCartStorageKey(currentUid);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(nextCart));

        const cartRef = doc(db, 'carts', currentUid);
        await setDoc(
          cartRef,
          {
            items: sanitizeCartForFirestore(nextCart),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        await AsyncStorage.setItem(STORAGE_KEY_GUEST, JSON.stringify(nextCart));
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ giỏ hàng lên Firestore:', err);
    }
  };

  const addToCart = (product: Product, quantity = 1, variant?: ProductVariant) => {
    // Chặn hoàn toàn nếu sản phẩm hoặc biến thể đã hết hàng
    if (checkOutOfStock(product, variant)) {
      console.warn('Sản phẩm hoặc phân loại đã hết hàng, không thể thêm vào giỏ');
      return;
    }

    const effectiveStock = (variant?.stock !== undefined && variant?.stock !== null)
      ? Number(variant.stock)
      : (product.stock !== undefined && product.stock !== null ? Number(product.stock) : 99);

    if (effectiveStock <= 0) {
      console.warn('Số lượng tồn kho bằng 0, không thể thêm vào giỏ');
      return;
    }

    const variantKey = variant ? `_${variant.type || 'var'}_${variant.name}` : '';
    const itemId = `${product.id}${variantKey}`;

    const basePrice = (variant?.price && variant.price > 0) ? variant.price : product.price;
    let effectivePrice = basePrice;
    if (variant?.salePrice && variant.salePrice > 0) {
      effectivePrice = variant.salePrice;
    } else if (variant?.sale !== undefined && variant.sale !== null && variant.sale > 0) {
      effectivePrice = Math.round(basePrice * (1 - variant.sale / 100));
    } else if (variant?.price && variant.price > 0) {
      effectivePrice = variant.price;
    } else if (product.salePrice && product.salePrice > 0) {
      effectivePrice = product.salePrice;
    } else if (product.sale && product.sale > 0) {
      effectivePrice = Math.round(product.price * (1 - product.sale / 100));
    } else {
      effectivePrice = product.price;
    }

    const existingIndex = cart.findIndex((item) => item.id === itemId);
    let nextCart: CartItem[];

    if (existingIndex > -1) {
      nextCart = [...cart];
      const maxAllowed = nextCart[existingIndex].maxStock > 0 ? nextCart[existingIndex].maxStock : effectiveStock;
      const newQty = Math.min(
        nextCart[existingIndex].quantity + quantity,
        maxAllowed || 99
      );
      nextCart[existingIndex] = {
        ...nextCart[existingIndex],
        quantity: newQty,
        maxStock: maxAllowed,
      };
    } else {
      const newItem: CartItem = {
        id: itemId,
        productId: product.id,
        name: product.name,
        price: effectivePrice,
        originalPrice: product.price,
        quantity: Math.max(1, Math.min(quantity, effectiveStock)),
        imageUrl: variant?.imageUrl || product.imageUrl || (product.images && product.images[0]) || '',
        variant: variant
          ? {
              type: variant.type,
              name: variant.name,
              imageUrl: variant.imageUrl,
            }
          : undefined,
        maxStock: effectiveStock,
      };
      nextCart = [...cart, newItem];
    }

    saveCartState(nextCart);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const removeFromCart = (itemId: string) => {
    const nextCart = cart.filter((item) => item.id !== itemId);
    saveCartState(nextCart);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    const nextCart = cart.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          quantity: Math.min(quantity, item.maxStock || 99),
        };
      }
      return item;
    });
    saveCartState(nextCart);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const clearCart = () => {
    saveCartState([]);
    setAppliedCoupon(null);
    setAppliedCouponItem(null);
    setIsGiftWrap(false);
    setGiftCardMessage('');
  };

  const applyCoupon = (code: string): boolean => {
    const clean = code.trim().toUpperCase();
    if (clean === 'GOMMOI' || clean === 'TIEMNHAGOM' || clean === 'CHAOBAN') {
      setAppliedCoupon(clean);
      setAppliedCouponItem(null);
      return true;
    }
    return false;
  };

  const applyCouponItem = (coupon: CouponItem | null) => {
    if (!coupon) {
      setAppliedCouponItem(null);
      setAppliedCoupon(null);
      return;
    }

    // Fail-safe: Không cho phép tự áp dụng voucher tặng người thân (khách mới) cho chính tài khoản của mình giống trên web
    const isFriendCode = Boolean(
      coupon.assignedBy ||
      coupon.forNewCustomerOnly ||
      coupon.id.startsWith('GIFT') ||
      coupon.code.startsWith('GIFT')
    );
    if (
      isFriendCode &&
      (coupon.assignedBy === currentUid ||
        (currentUid &&
          (coupon.id === `GIFT${currentUid.substring(0, 5).toUpperCase()}` ||
            coupon.code === `GIFT${currentUid.substring(0, 5).toUpperCase()}`)))
    ) {
      setAppliedCouponItem(null);
      setAppliedCoupon(null);
      return;
    }

    setAppliedCouponItem(coupon);
    setAppliedCoupon(coupon.code || coupon.id);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setAppliedCouponItem(null);
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // Phí ship: Chuẩn hóa theo bản web
  let shippingFee = calculateAppShippingFee(shippingMethod, isHCM, subtotal, memberTier.freeShipping);

  // Chiết khấu thành viên (Membership Discount): Chuẩn hóa theo bản web
  const memberDiscount = calculateMembershipDiscount(subtotal, memberTier);

  // Giảm giá voucher
  let discountAmount = 0;
  if (appliedCouponItem) {
    if (appliedCouponItem.type === 'free_ship') {
      discountAmount = shippingFee;
      shippingFee = 0;
    } else if (appliedCouponItem.type === 'percent') {
      const raw = Math.round((subtotal * appliedCouponItem.value) / 100);
      discountAmount = appliedCouponItem.maxDiscount ? Math.min(raw, appliedCouponItem.maxDiscount) : raw;
    } else {
      // 'fixed'
      discountAmount = Math.min(appliedCouponItem.value, subtotal);
    }
  } else if (appliedCoupon === 'GOMMOI') {
    discountAmount = Math.min(30000, Math.round(subtotal * 0.1));
  } else if (appliedCoupon === 'TIEMNHAGOM') {
    discountAmount = 20000;
  } else if (appliedCoupon === 'CHAOBAN') {
    discountAmount = Math.min(50000, Math.round(subtotal * 0.15));
  }

  const totalAmount = Math.max(0, subtotal + shippingFee - discountAmount - memberDiscount);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        subtotal,
        shippingFee,
        discountAmount,
        memberDiscount,
        memberTier,
        totalAmount,
        appliedCoupon,
        appliedCouponItem,
        applyCoupon,
        applyCouponItem,
        removeCoupon,
        shippingMethod,
        setShippingMethod,
        selectedAddress,
        setSelectedAddress,
        isHCM,
        paymentMethod,
        setPaymentMethod,
        orderNote,
        setOrderNote,
        isGiftWrap,
        setIsGiftWrap,
        giftCardMessage,
        setGiftCardMessage,
        cartBounceKey,
        triggerCartBounce,
        flyToCart,
      }}
    >
      {children}
      <FlyingCartOverlay items={flyingItems} onFinish={handleFlyingItemFinish} />
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
