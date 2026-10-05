// src/types/index.ts

export interface ProductVariant {
  id?: string;
  name: string;
  imageUrl?: string;
  thumbUrl?: string;
  price?: number;
  sale?: number;
  stock?: number;
  sold?: number;
  hex?: string;
  manualOutOfStock?: boolean;
  isOutOfStock?: boolean;
  isBestSeller?: boolean;
  showOnProductPage?: boolean;
  type?: 'color' | 'pattern' | 'combo';
}

export interface Product {
  id: string;
  name: string;
  price: number;
  salePrice?: number;
  sale?: number; // % giảm giá
  stock: number;
  sold?: number;
  category?: string;
  description?: string;
  images?: string[];
  imageUrl?: string;
  colorVariants?: ProductVariant[];
  patternVariants?: ProductVariant[];
  comboVariants?: ProductVariant[];
  collections?: string[];
  isBestSeller?: boolean;
  isFeatured?: boolean;
  isHidden?: boolean;
  isOnlyEvent?: boolean;
  parentProductId?: string;
  selectedVariant?: ProductVariant;
  rating?: number;
  createdAt?: any;
  dimensions?: { length?: number; width?: number; height?: number };
  details?: { material?: string; origin?: string };
  specs?: { weight?: number; capacity?: number };
  usage?: { isDishwasherSafe?: boolean; isMicrowaveSafe?: boolean; isFoodSafe?: boolean };
}

export interface CartItem {
  id: string; // unique item key: productId + variantKey
  productId: string;
  name: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  imageUrl?: string;
  variant?: {
    type?: 'color' | 'pattern' | 'combo';
    name?: string;
    imageUrl?: string;
  };
  maxStock: number;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city?: string;
  district?: string;
  ward?: string;
}

export interface Order {
  id?: string;
  orderCode: string;
  userId: string;
  customerName: string;
  shippingAddress: ShippingAddress;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  couponCode?: string;
  totalAmount: number;
  paymentMethod: 'cod' | 'banking';
  paymentStatus: 'pending' | 'paid';
  status: 'Đang xử lý' | 'Đã xác nhận' | 'Đang giao' | 'Hoàn thành' | 'Đã hủy' | 'Yêu cầu mới';
  note?: string;
  orderDate: any;
  canceledBy?: string;
  canceledAt?: any;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  name?: string;
  fullName?: string;
  phone?: string;
  photoURL?: string | null;
  gender?: string;
  dob?: string;
  birthday?: string;
  address?: string;
  fullAddress?: string;
  streetAddress?: string;
  provinceCode?: string;
  wardCode?: string;
  locationName?: string;
  addresses?: any[];
  points?: number;
  spentTotal?: number;
  totalSpent?: number;
  tier?: 'standard' | 'bronze' | 'silver' | 'gold' | 'diamond' | string;
  membershipTier?: string;
  createdAt?: any;
  updatedAt?: any;
  expoPushToken?: string;
}

export interface Coupon {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  expiryDate?: any;
  isActive?: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  icon?: string;
  imageUrl?: string;
  subCategories?: string[];
}
