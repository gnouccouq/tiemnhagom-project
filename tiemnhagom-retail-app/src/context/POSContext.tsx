// src/context/POSContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { Product, ProductVariant, Customer, Coupon, POSCartItem, Order } from '../types';

interface POSContextType {
  cart: POSCartItem[];
  customer: Customer | null;
  coupon: Coupon | null;
  usePoints: boolean;
  pointsToRedeem: number;
  subtotal: number;
  memberDiscountAmount: number;
  couponDiscountAmount: number;
  pointsDiscountAmount: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'vietqr' | 'card';
  cashGiven: number;
  changeDue: number;
  lastCompletedOrder: Order | null;
  addToCart: (product: Product, variant?: ProductVariant, customPrice?: number) => void;
  updateQuantity: (cartItemId: string, qty: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  selectCustomer: (cust: Customer | null) => void;
  setUsePoints: (use: boolean) => void;
  applyCoupon: (cp: Coupon | null) => void;
  setPaymentMethod: (method: 'cash' | 'vietqr' | 'card') => void;
  setCashGiven: (cash: number) => void;
  generateVietQRUrl: (orderCode: string, amount: number) => string;
  completePOSOrder: (notes?: string) => Promise<{ success: boolean; order?: Order; error?: string }>;
  resetAfterOrder: () => void;
}

const BANK_ID = '970436'; // Vietcombank
const ACCOUNT_NO = '1059447798';
const ACCOUNT_NAME = 'HO KINH DOANH TIEM NHA GOM';

const POSContext = createContext<POSContextType>({} as POSContextType);

export const POSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { adminProfile } = useAuth();
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [usePoints, setUsePointsState] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'vietqr' | 'card'>('cash');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);

  // 1. Thêm vào giỏ
  const addToCart = (product: Product, variant?: ProductVariant, customPrice?: number) => {
    const cartItemId = variant ? `${product.id}_${variant.id}` : product.id;
    setCart((prev) => {
      const existing = prev.find((i) => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map((i) =>
          i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          product,
          quantity: 1,
          selectedVariant: variant,
          customPrice: customPrice ?? (variant?.salePrice || variant?.price || product.salePrice || product.price),
        },
      ];
    });
  };

  const updateQuantity = (cartItemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: qty } : i))
    );
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setCoupon(null);
    setUsePointsState(false);
    setCashGiven(0);
  };

  const selectCustomer = (cust: Customer | null) => {
    setCustomer(cust);
    if (!cust) setUsePointsState(false);
  };

  const setUsePoints = (use: boolean) => {
    setUsePointsState(use);
  };

  const applyCoupon = (cp: Coupon | null) => {
    setCoupon(cp);
  };

  // Tính toán
  const subtotal = cart.reduce((sum, item) => {
    const price = item.customPrice ?? (item.selectedVariant?.salePrice || item.selectedVariant?.price || item.product.salePrice || item.product.price);
    return sum + price * item.quantity;
  }, 0);

  // Chiết khấu hội viên theo hạng:
  // Gốm Nung: 3%, Gốm Men: 5%, Gốm Độc Bản: 10%
  let memberDiscountPercent = 0;
  if (customer) {
    if (customer.tier === 'Gốm Nung') memberDiscountPercent = 0.03;
    else if (customer.tier === 'Gốm Men') memberDiscountPercent = 0.05;
    else if (customer.tier === 'Gốm Độc Bản') memberDiscountPercent = 0.10;
  }
  const memberDiscountAmount = Math.round(subtotal * memberDiscountPercent);

  // Chiết khấu Voucher
  let couponDiscountAmount = 0;
  if (coupon && subtotal >= (coupon.minOrder || 0)) {
    if (coupon.type === 'percent') {
      const calc = Math.round((subtotal * coupon.value) / 100);
      couponDiscountAmount = coupon.maxDiscount ? Math.min(calc, coupon.maxDiscount) : calc;
    } else {
      couponDiscountAmount = coupon.value;
    }
  }

  // Giảm giá điểm tích lũy: 1 điểm = 1.000đ, tối đa 50% tiền còn lại
  const afterDiscounts = Math.max(0, subtotal - memberDiscountAmount - couponDiscountAmount);
  let pointsToRedeem = 0;
  let pointsDiscountAmount = 0;

  if (usePoints && customer && customer.points > 0) {
    const maxDiscountAllowed = Math.round(afterDiscounts * 0.5);
    const availablePointsValue = customer.points * 1000;
    pointsDiscountAmount = Math.min(availablePointsValue, maxDiscountAllowed);
    pointsToRedeem = Math.ceil(pointsDiscountAmount / 1000);
  }

  const totalAmount = Math.max(0, afterDiscounts - pointsDiscountAmount);
  const changeDue = cashGiven >= totalAmount ? cashGiven - totalAmount : 0;

  // VietQR động
  const generateVietQRUrl = (orderCode: string, amount: number) => {
    const desc = encodeURIComponent(`${orderCode} POS`);
    const acc = encodeURIComponent(ACCOUNT_NAME);
    return `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${amount}&addInfo=${desc}&accountName=${acc}`;
  };

  // Hoàn tất đơn POS
  const completePOSOrder = async (notes?: string): Promise<{ success: boolean; order?: Order; error?: string }> => {
    if (cart.length === 0) return { success: false, error: 'Giỏ hàng đang trống.' };

    try {
      const orderCode = `POS-${Date.now().toString().slice(-6)}`;
      const orderId = `pos_${Date.now()}`;

      // Điểm tích lũy cho đơn POS này (1% chi tiêu)
      const pointsEarned = Math.floor(totalAmount / 100000);

      const orderData: Order = {
        id: orderId,
        orderCode,
        createdAt: serverTimestamp(),
        customerName: customer?.displayName || 'Khách lẻ tại tiệm',
        customerPhone: customer?.phone || '',
        customerEmail: customer?.email || '',
        items: cart.map((i) => ({
          id: i.product.id,
          name: i.selectedVariant ? `${i.product.name} (${i.selectedVariant.name})` : i.product.name,
          price: i.customPrice || i.product.price,
          quantity: i.quantity,
          imageUrl: i.product.imageUrl || (i.product.images && i.product.images[0]) || '',
          selectedVariant: i.selectedVariant?.name || '',
          category: i.product.category,
        })),
        subtotal,
        discountAmount: memberDiscountAmount + couponDiscountAmount + pointsDiscountAmount,
        pointsUsed: pointsToRedeem,
        pointsEarned,
        shippingFee: 0,
        totalAmount,
        status: 'completed',
        paymentMethod,
        paymentStatus: 'paid',
        source: 'pos',
        staffId: adminProfile?.uid || '',
        staffName: adminProfile?.displayName || 'Thu ngân',
        notes: notes || '',
        internalNotes: `Thanh toán tại quầy qua ${paymentMethod.toUpperCase()}`,
      };

      // Ghi đơn hàng vào Firestore
      await setDoc(doc(db, 'orders', orderId), orderData);

      // Cập nhật tồn kho sản phẩm trong Firestore
      for (const item of cart) {
        try {
          const prodRef = doc(db, 'products', item.product.id);
          await updateDoc(prodRef, {
            stock: increment(-item.quantity),
            sold: increment(item.quantity),
          });
        } catch (e) {
          console.warn('Lỗi trừ tồn kho sản phẩm:', item.product.id, e);
        }
      }

      // Cập nhật điểm & tổng chi tiêu của khách hàng
      if (customer && customer.id) {
        try {
          const custRef = doc(db, 'users', customer.id);
          await updateDoc(custRef, {
            points: increment(pointsEarned - pointsToRedeem),
            totalSpent: increment(totalAmount),
            orderCount: increment(1),
          });
        } catch (e) {
          console.warn('Lỗi cập nhật điểm khách hàng:', e);
        }
      }

      // Cập nhật lượt dùng voucher
      if (coupon && coupon.id) {
        try {
          const cpRef = doc(db, 'coupons', coupon.id);
          await updateDoc(cpRef, {
            usedCount: increment(1),
          });
        } catch (e) {
          console.warn('Lỗi cập nhật lượt voucher:', e);
        }
      }

      setLastCompletedOrder(orderData);
      clearCart();

      return { success: true, order: orderData };
    } catch (err: any) {
      console.error('Lỗi tạo đơn POS:', err);
      return { success: false, error: err.message || 'Lỗi khi thanh toán đơn POS.' };
    }
  };

  const resetAfterOrder = () => {
    setLastCompletedOrder(null);
  };

  return (
    <POSContext.Provider
      value={{
        cart,
        customer,
        coupon,
        usePoints,
        pointsToRedeem,
        subtotal,
        memberDiscountAmount,
        couponDiscountAmount,
        pointsDiscountAmount,
        totalAmount,
        paymentMethod,
        cashGiven,
        changeDue,
        lastCompletedOrder,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        selectCustomer,
        setUsePoints,
        applyCoupon,
        setPaymentMethod,
        setCashGiven,
        generateVietQRUrl,
        completePOSOrder,
        resetAfterOrder,
      }}
    >
      {children}
    </POSContext.Provider>
  );
};

export const usePOS = () => useContext(POSContext);
export default POSContext;
