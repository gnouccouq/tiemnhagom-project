// src/utils/shipping.ts
// Đồng bộ 100% công thức tính phí giao hàng và chiết khấu hạng hội viên từ Web (js/cart.js & js/utils.js)

export interface MemberTierInfo {
  id: string;
  name: string;
  min: number;
  discount: number; // Tỷ lệ % giảm giá trực tiếp (0, 1, 3, 5)
  freeShipping: boolean; // Miễn phí vận chuyển
  color?: string;
  badge?: string;
  tierUpVoucher: number;
  birthdayVoucher: number;
  friendVoucher: boolean;
}

export const APP_MEMBERSHIP_TIERS: MemberTierInfo[] = [
  { id: 'null', name: 'Gốm Mộc', min: 0, discount: 0, freeShipping: false, color: '#95a5a6', badge: '🪵', tierUpVoucher: 0, birthdayVoucher: 0, friendVoucher: false },
  { id: 'new', name: 'Gốm Nung', min: 1000000, discount: 1, freeShipping: false, color: '#DC2626', badge: '🔥', tierUpVoucher: 50000, birthdayVoucher: 50000, friendVoucher: false },
  { id: 'mem', name: 'Gốm Men', min: 5000000, discount: 3, freeShipping: true, color: '#CA8A04', badge: '✨', tierUpVoucher: 100000, birthdayVoucher: 200000, friendVoucher: true },
  { id: 'vip', name: 'Gốm Độc Bản', min: 10000000, discount: 5, freeShipping: true, color: '#EF4444', badge: '👑', tierUpVoucher: 300000, birthdayVoucher: 500000, friendVoucher: true },
];

/**
 * Kiểm tra tỉnh thành hoặc địa chỉ có thuộc TP. Hồ Chí Minh hay không
 * Đồng bộ với hàm isHCMProvince(provinceName) trong js/cart.js của Web
 */
export function isHCMProvince(text?: string | null): boolean {
  if (!text) return false;
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    norm.includes('ho chi minh') ||
    norm.includes('hcm') ||
    norm.includes('sai gon') ||
    norm.includes('saigon')
  );
}

/**
 * Lấy thông tin hạng hội viên dựa trên tổng chi tiêu hoặc tên hạng đã lưu
 */
export function getMemberTier(totalSpent: number = 0, tierNameOrId?: string): MemberTierInfo {
  let calculatedIdx = 0;
  for (let i = APP_MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
    if (totalSpent >= APP_MEMBERSHIP_TIERS[i].min) {
      calculatedIdx = i;
      break;
    }
  }
  if (tierNameOrId) {
    const lower = tierNameOrId.toLowerCase().trim();
    let manualIdx = -1;
    if (lower.includes('vip') || lower.includes('độc bản') || lower.includes('doc ban')) manualIdx = 3;
    else if (lower.includes('mem') || lower.includes('men')) manualIdx = 2;
    else if (lower.includes('new') || lower.includes('nung')) manualIdx = 1;
    if (manualIdx > calculatedIdx) {
      calculatedIdx = manualIdx;
    }
  }
  return APP_MEMBERSHIP_TIERS[calculatedIdx] || APP_MEMBERSHIP_TIERS[0];
}
function _unusedGetMemberTierLegacy(totalSpent: number = 0, tierNameOrId?: string): MemberTierInfo {
  if (tierNameOrId) {
    const lower = tierNameOrId.toLowerCase();
    if (lower.includes('vip') || lower.includes('độc bản') || lower.includes('doc ban')) {
      return APP_MEMBERSHIP_TIERS[3];
    }
    if (lower.includes('mem') || lower.includes('men')) {
      return APP_MEMBERSHIP_TIERS[2];
    }
    if (lower.includes('new') || lower.includes('nung')) {
      return APP_MEMBERSHIP_TIERS[1];
    }
  }

  for (let i = APP_MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
    if (totalSpent >= APP_MEMBERSHIP_TIERS[i].min) {
      return APP_MEMBERSHIP_TIERS[i];
    }
  }
  return APP_MEMBERSHIP_TIERS[0];
}

/**
 * Tính số tiền chiết khấu thành viên theo giá trị tạm tính (Subtotal)
 * membershipDiscount = Math.round((subtotal * userTier.discount) / 100)
 */
export function calculateMembershipDiscount(subtotal: number, tier: MemberTierInfo): number {
  if (!tier || tier.discount <= 0 || subtotal <= 0) return 0;
  return Math.round((subtotal * tier.discount) / 100);
}

/**
 * Tính phí vận chuyển đồng bộ tuyệt đối với js/cart.js:
 * 1. Nhận tại showroom: 0đ
 * 2. Hạng Gốm Men & Gốm Độc Bản (freeShipping: true): 0đ
 * 3. Giao tiêu chuẩn đơn từ 500.000đ: 0đ (Freeship)
 * 4. Nội thành TP.HCM:
 *    - Giao nhanh 2 Giờ (express_2h): 30.000đ
 *    - Giao thông thường (standard): 20.000đ
 * 5. Toàn quốc ngoài TP.HCM:
 *    - Giao tiêu chuẩn: 40.000đ
 *    - Hỏa tốc 2 giờ: Không khả dụng (quay về tiêu chuẩn)
 */
export function calculateAppShippingFee(
  method: 'standard' | 'express_2h' | 'pickup',
  isHCM: boolean,
  subtotal: number,
  hasFreeShippingTier: boolean = false
): number {
  if (method === 'pickup') return 0;
  if (hasFreeShippingTier) return 0;
  if (subtotal >= 500000 && method === 'standard') return 0;

  if (isHCM) {
    if (method === 'express_2h') return 30000;
    return 20000;
  }

  // Ngoài TP.HCM
  return 40000;
}
