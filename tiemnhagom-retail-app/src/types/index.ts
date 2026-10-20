// src/types/index.ts

export type AdminRole = 'super_admin' | 'manager' | 'staff';

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions?: string[];
  isLocked?: boolean;
  avatarUrl?: string;
  phone?: string;
}

export type OrderStatus = 'pending' | 'processing' | 'shipping' | 'completed' | 'cancelled';
export type PaymentMethod = 'cod' | 'vietqr' | 'cash' | 'card' | 'momo';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  selectedVariant?: string;
  category?: string;
}

export interface Order {
  id: string;
  orderCode?: string;
  createdAt: any;
  updatedAt?: any;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress?: any;
  items: OrderItem[];
  subtotal: number;
  discountAmount?: number;
  pointsUsed?: number;
  pointsEarned?: number;
  shippingFee?: number;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  source?: 'online' | 'pos' | 'app';
  orderSource?: 'online' | 'pos' | 'app' | string;
  cashierId?: string;
  staffId?: string;
  staffName?: string;
  notes?: string;
  internalNotes?: string;
}

export type RentalStatus = 'pending_deposit' | 'deposit_paid' | 'renting' | 'returned' | 'cancelled';

export interface RentalOrderItem {
  id: string;
  name: string;
  rentalPrice: number;
  depositPrice: number;
  quantity: number;
  imageUrl?: string;
}

export interface RentalOrder {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  eventDate?: string;
  startDate: string;
  endDate: string;
  rentalDays: number;
  items: RentalOrderItem[];
  totalRentalFee: number;
  totalDeposit: number;
  totalAmount: number;
  status: RentalStatus;
  shippingAddress?: string;
  notes?: string;
  createdAt: any;
  staffId?: string;
  staffName?: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  price?: number;
  salePrice?: number;
  stock?: number;
  sku?: string;
  code?: string;
  cost?: number;
  color?: string;
  pattern?: string;
  discountPercent?: number;
  isOutOfStock?: boolean;
  independent?: boolean;
  imageUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  code?: string;
  barcode?: string;
  cost?: number;
  price: number;
  sale?: number;
  salePrice?: number;
  rentalPrice?: number;
  stock: number;
  stockMin?: number;
  stockMax?: number;
  category: string;
  subCategory?: string;
  collections?: string[];
  events?: string[];
  images?: string[];
  imageUrl?: string;
  hoverImageUrl?: string;
  description?: string;
  variants?: ProductVariant[];
  productType?: 'normal' | 'combo';
  comboVariants?: any[];
  dimLength?: number;
  dimWidth?: number;
  dimHeight?: number;
  weight?: number;
  capacity?: number;
  material?: string;
  origin?: string;
  dishwasherSafe?: boolean;
  microwaveSafe?: boolean;
  foodSafe?: boolean;
  ovenSafe?: boolean;
  flashSaleGroupId?: string;
  isHidden?: boolean;
  isOnlyEvent?: boolean;
  sold?: number;
  views?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  diff: number;
  reason: string;
  staffName: string;
  createdAt: any;
}

export interface RestockAlert {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  status: 'pending' | 'notified' | 'cancelled';
  createdAt: any;
}

export interface Category {
  id: string;
  name: string;
  code?: string;
  icon?: string;
  order?: number;
  subcategories?: string[];
}

export type MembershipTier = 'Gốm Mộc' | 'Gốm Nung' | 'Gốm Men' | 'Gốm Độc Bản';

export interface Customer {
  id: string;
  uid?: string;
  displayName: string;
  phone: string;
  email?: string;
  points: number;
  totalSpent: number;
  orderCount: number;
  tier: MembershipTier;
  createdAt?: any;
  address?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder: number;
  maxDiscount?: number;
  startDate?: string;
  expiryDate: string;
  usageLimit?: number;
  usedCount?: number;
  isActive: boolean;
  description?: string;
}

export interface POSCartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  selectedVariant?: ProductVariant;
  customPrice?: number;
  note?: string;
}

export interface FlashSaleProductConfig {
  dealType?: 'sale' | 'bogo_same' | 'bogo_custom';
  salePrice?: number;
  giftProductId?: string;
  limit?: number;
  sold?: number;
}

export interface FlashSaleItem {
  id: string;
  name?: string;
  price?: number;
  salePrice: number;
  quantity: number;
  sold?: number;
  imageUrl?: string;
}

export interface FlashSaleSettings {
  isActive: boolean;
  title?: string;
  subtitle?: string;
  startTime?: any;
  endTime?: any;
  bannerUrl?: string;
  priceGroups?: number[];
  items?: Record<string, FlashSaleProductConfig>;
  products?: FlashSaleItem[];
}

export interface ShiftReport {
  id?: string;
  staffId: string;
  staffName: string;
  startTime: any;
  endTime?: any;
  initialCash: number;
  totalCashSales: number;
  totalVietQRSales: number;
  totalCardSales: number;
  totalOrders: number;
  expectedCashInDrawer: number;
  actualCashInDrawer?: number;
  notes?: string;
}
