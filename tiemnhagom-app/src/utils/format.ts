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
 * Kiểm tra xem sản phẩm có thực sự hết hàng hay không
 */
export function checkOutOfStock(product: any, variantOverride?: any): boolean {
  if (!product) return true;
  
  let isOutOfStock = Boolean(product.manualOutOfStock) || Boolean(product.isOutOfStock) || (Number(product.stock) || 0) <= 0;
  
  if (product.isCombo && Array.isArray(product.comboVariants) && product.comboVariants.length > 0) {
    const hasAnyAvailable = product.comboVariants.some((v: any) => {
      const vStock = (v.stock !== undefined && v.stock !== null) ? Number(v.stock) : (Number(product.stock) || 0);
      const vOut = Boolean(v.manualOutOfStock) || Boolean(v.isOutOfStock);
      return !vOut && vStock > 0;
    });
    isOutOfStock = !hasAnyAvailable;
  }
  
  if (variantOverride) {
    const isManualOut = Boolean(variantOverride.manualOutOfStock);
    const rawStock = (variantOverride.stock !== undefined && variantOverride.stock !== null)
      ? Number(variantOverride.stock)
      : (Number(product.stock) || 0);
    const vStock = (!isManualOut && rawStock <= 0 && (Number(product.stock) || 0) > 0)
      ? Number(product.stock)
      : rawStock;
    isOutOfStock = isManualOut || (Boolean(variantOverride.isOutOfStock) && vStock <= 0) || vStock <= 0;
  }
  
  return isOutOfStock;
}
