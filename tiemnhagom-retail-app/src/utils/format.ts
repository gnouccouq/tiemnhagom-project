// src/utils/format.ts

/**
 * Định dạng tiền tệ VND (vd: 120.000 VND)
 */
export function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '0 VND';
  }
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' VND';
}

/**
 * Định dạng ngày giờ hiển thị
 */
export function formatDate(dateInput: any): string {
  if (!dateInput) return '';
  try {
    let d: Date;
    if (typeof dateInput.toDate === 'function') {
      d = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      d = new Date(dateInput);
    }
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Bỏ dấu tiếng Việt phục vụ tìm kiếm nhanh
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  str = str.replace(/Đ/g, 'D');
  return str.toLowerCase().trim();
}

/**
 * Tạo mã đơn ngẫu nhiên theo chuẩn Tiệm Nhà Gốm: TNG-XXXXXX
 */
export function generateOrderCode(): string {
  const now = new Date();
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TNG${dateStr}${timeStr}-${randomSuffix}`;
}

/**
 * Kiểm tra xem sản phẩm hoặc biến thể có thực sự hết hàng hay không
 */
export function checkOutOfStock(product: any, variantOverride?: any): boolean {
  if (!product) return true;

  // 1. Nếu có chỉ định phân loại biến thể cụ thể (variantOverride)
  if (variantOverride) {
    // A. Quản trị viên đánh dấu hết hàng thủ công
    if (Boolean(variantOverride.manualOutOfStock) || Boolean(variantOverride.isOutOfStock)) {
      return true;
    }
    // B. Kiểm tra số lượng tồn kho riêng của biến thể
    if (variantOverride.stock !== undefined && variantOverride.stock !== null) {
      return Number(variantOverride.stock) <= 0;
    }
    // C. Nếu biến thể không có trường tồn kho riêng, kế thừa theo tồn kho của sản phẩm cha
    return Boolean(product.manualOutOfStock) || Boolean(product.isOutOfStock) || (Number(product.stock) || 0) <= 0;
  }

  // 2. Kiểm tra ở cấp độ sản phẩm cha (không chỉ định biến thể)
  if (Boolean(product.manualOutOfStock) || Boolean(product.isOutOfStock)) {
    return true;
  }

  // 3. Nếu là combo sản phẩm: kiểm tra xem có bất kỳ comboVariant nào còn hàng không
  if (product.isCombo && Array.isArray(product.comboVariants) && product.comboVariants.length > 0) {
    const hasAnyAvailable = product.comboVariants.some((v: any) => {
      const vOut = Boolean(v.manualOutOfStock) || Boolean(v.isOutOfStock);
      const vStock = (v.stock !== undefined && v.stock !== null) ? Number(v.stock) : (Number(product.stock) || 0);
      return !vOut && vStock > 0;
    });
    return !hasAnyAvailable;
  }

  // 4. Nếu sản phẩm có danh sách biến thể (colorVariants, patternVariants, comboVariants):
  // Nếu TẤT CẢ các biến thể đều đã hết hàng thì coi như sản phẩm hết hàng
  const allVariants: any[] = [
    ...(Array.isArray(product.colorVariants) ? product.colorVariants : []),
    ...(Array.isArray(product.patternVariants) ? product.patternVariants : []),
    ...(Array.isArray(product.comboVariants) ? product.comboVariants : []),
  ];

  if (allVariants.length > 0) {
    const hasAnyAvailableVariant = allVariants.some((v: any) => {
      const vOut = Boolean(v.manualOutOfStock) || Boolean(v.isOutOfStock);
      const vStock = (v.stock !== undefined && v.stock !== null) ? Number(v.stock) : (Number(product.stock) || 0);
      return !vOut && vStock > 0;
    });
    if (!hasAnyAvailableVariant) {
      return true;
    }
  }

  // 5. Kiểm tra tồn kho của sản phẩm gốc
  return (Number(product.stock) || 0) <= 0;
}

/**
 * Chuẩn hoá số điện thoại Việt Nam (vd: +8497..., 8497... -> 097...)
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+84')) {
    return '0' + cleaned.substring(3);
  }
  if (cleaned.startsWith('84') && cleaned.length >= 10) {
    return '0' + cleaned.substring(2);
  }
  if (/^[1-9]/.test(cleaned) && cleaned.length >= 9 && cleaned.length <= 11) {
    return '0' + cleaned;
  }
  return cleaned;
}

/**
 * Lấy các biến thể số điện thoại để tra cứu đồng bộ (ví dụ: 0777709662 và +84777709662)
 */
export function getPhoneVariants(phone?: string | null): string[] {
  const p0 = formatPhoneNumber(phone);
  if (!p0) return [];
  const p84 = p0.startsWith('0') ? '+84' + p0.substring(1) : p0;
  return Array.from(new Set([p0, p84, phone ? phone.trim() : ''])).filter(Boolean);
}
