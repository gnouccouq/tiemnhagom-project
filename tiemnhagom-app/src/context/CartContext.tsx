import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Product, ProductVariant } from '../types';
import { useAuth } from './AuthContext';
import { FlyingCartOverlay, FlyingItemData } from '../components/FlyingCartOverlay';

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
  totalAmount: number;
  appliedCoupon: string | null;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  shippingMethod: 'standard' | 'express_2h' | 'pickup';
  setShippingMethod: (method: 'standard' | 'express_2h' | 'pickup') => void;
  cartBounceKey: number;
  triggerCartBounce: () => void;
  flyToCart: (imageUri: string, startX?: number, startY?: number, targetX?: number, targetY?: number) => void;
}

const getCartStorageKey = (uid: string) => `@tiemnhagom_cart_${uid}`;
const CartContext = createContext<CartContextType>({} as CartContextType);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const currentUid = user?.uid || 'guest';
  const loadedUserRef = useRef<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express_2h' | 'pickup'>('standard');
  const [cartBounceKey, setCartBounceKey] = useState<number>(0);
  const [flyingItems, setFlyingItems] = useState<FlyingItemData[]>([]);

  const triggerCartBounce = () => {
    setCartBounceKey((k) => k + 1);
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

  // Load cart from storage whenever user changes
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const key = getCartStorageKey(currentUid);
        const stored = await AsyncStorage.getItem(key);
        if (!isCancelled) {
          if (stored) {
            setCart(JSON.parse(stored));
          } else {
            setCart([]);
          }
          setAppliedCoupon(null);
          loadedUserRef.current = currentUid;
        }
      } catch (e) {
        console.warn('Lỗi đọc giỏ hàng từ AsyncStorage:', e);
        if (!isCancelled) {
          setCart([]);
          setAppliedCoupon(null);
          loadedUserRef.current = currentUid;
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [currentUid]);

  // Save cart to storage whenever it changes, but ONLY for currently loaded user
  useEffect(() => {
    if (loadedUserRef.current !== currentUid) return;
    (async () => {
      try {
        const key = getCartStorageKey(currentUid);
        await AsyncStorage.setItem(key, JSON.stringify(cart));
      } catch (e) {
        console.warn('Lỗi lưu giỏ hàng vào AsyncStorage:', e);
      }
    })();
  }, [cart, currentUid]);

  const addToCart = (product: Product, quantity = 1, variant?: ProductVariant) => {
    setCart((prev) => {
      const variantKey = variant ? `_${variant.type || 'var'}_${variant.name}` : '';
      const itemId = `${product.id}${variantKey}`;

      const effectivePrice = variant?.price
        ? variant.price
        : product.salePrice
        ? product.salePrice
        : product.sale
        ? Math.round(product.price * (1 - product.sale / 100))
        : product.price;

      const existingIndex = prev.findIndex((item) => item.id === itemId);

      if (existingIndex > -1) {
        const updated = [...prev];
        const newQty = Math.min(
          updated[existingIndex].quantity + quantity,
          updated[existingIndex].maxStock || 99
        );
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQty,
        };
        return updated;
      } else {
        const newItem: CartItem = {
          id: itemId,
          productId: product.id,
          name: product.name,
          price: effectivePrice,
          originalPrice: product.price,
          quantity: Math.min(quantity, variant?.stock ?? product.stock ?? 99),
          imageUrl: variant?.imageUrl || product.imageUrl || (product.images && product.images[0]) || '',
          variant: variant
            ? {
                type: variant.type,
                name: variant.name,
                imageUrl: variant.imageUrl,
              }
            : undefined,
          maxStock: variant?.stock ?? product.stock ?? 99,
        };
        return [...prev, newItem];
      }
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            quantity: Math.min(quantity, item.maxStock || 99),
          };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
  };

  const applyCoupon = (code: string): boolean => {
    const clean = code.trim().toUpperCase();
    if (clean === 'GOMMOI' || clean === 'TIEMNHAGOM' || clean === 'CHAOBAN') {
      setAppliedCoupon(clean);
      return true;
    }
    return false;
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // Phí ship: Tự lấy tại cửa hàng = 0, Hỏa tốc 2h = 30k, Tiêu chuẩn = 20k
  let shippingFee = 20000;
  if (shippingMethod === 'pickup') shippingFee = 0;
  if (shippingMethod === 'express_2h') shippingFee = 35000;
  if (subtotal >= 500000 && shippingMethod === 'standard') shippingFee = 0; // Miễn phí ship đơn từ 500k

  // Giảm giá voucher
  let discountAmount = 0;
  if (appliedCoupon === 'GOMMOI') {
    discountAmount = Math.min(30000, subtotal * 0.1);
  } else if (appliedCoupon === 'TIEMNHAGOM') {
    discountAmount = 20000;
  } else if (appliedCoupon === 'CHAOBAN') {
    discountAmount = Math.min(50000, subtotal * 0.15);
  }

  const totalAmount = Math.max(0, subtotal + shippingFee - discountAmount);

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
        totalAmount,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        shippingMethod,
        setShippingMethod,
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
