import { Product } from '../types';
import { removeVietnameseTones } from './format';

export interface ProductMatchResult {
  isMatch: boolean;
  score: number;
  tokensInName: number;
  tokensInProduct: number;
}

/**
 * Thuật toán tìm kiếm thông minh & xếp hạng sản phẩm (Smart Search & Relevance Scoring)
 * Hỗ trợ gõ đảo từ, không dấu, từ không liền nhau (ví dụ: "bình gốm", "gốm hoa", "hoa gốm" đều khớp "Bình hoa gốm")
 */
export function matchAndScoreProduct(product: Product, queryStr: string): ProductMatchResult | null {
  if (!product || !queryStr) return null;
  const rawQuery = String(queryStr).trim().toLowerCase();
  if (!rawQuery) return null;

  const cleanQuery = removeVietnameseTones(rawQuery);
  const cleanTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const rawTokens = rawQuery.split(/\s+/).filter(Boolean);
  if (cleanTokens.length === 0) return null;

  const nameRaw = String(product.name || '').toLowerCase();
  const nameClean = removeVietnameseTones(nameRaw);

  const skuRaw = String(product.id || '').toLowerCase();
  const skuClean = removeVietnameseTones(skuRaw);

  const catClean = removeVietnameseTones(product.category || '');

  let variantsText = '';
  if (Array.isArray(product.colorVariants)) {
    variantsText += ' ' + product.colorVariants.map(v => v.name || '').join(' ');
  }
  if (Array.isArray(product.patternVariants)) {
    variantsText += ' ' + product.patternVariants.map(v => v.name || '').join(' ');
  }
  if (Array.isArray(product.comboVariants)) {
    variantsText += ' ' + product.comboVariants.map(v => v.name || '').join(' ');
  }
  const variantsClean = removeVietnameseTones(variantsText);
  const descClean = removeVietnameseTones(product.description || '');
  const collectionsClean = (product.collections || []).map(c => removeVietnameseTones(String(c))).join(' ');

  const nameWords = nameClean.split(/\s+/).filter(Boolean);
  const allSearchable = `${nameClean} ${skuClean} ${catClean} ${variantsClean} ${collectionsClean} ${descClean}`;

  let score = 0;

  // 1. Khớp chính xác SKU / ID
  if (skuClean === cleanQuery || skuRaw === rawQuery) {
    return { isMatch: true, score: 3000, tokensInName: cleanTokens.length, tokensInProduct: cleanTokens.length };
  }
  if (skuClean && skuClean.includes(cleanQuery)) {
    score += 1500;
  }

  // 2. Khớp trọn vẹn cụm từ trong tên (Exact Phrase Match)
  if (nameClean.includes(cleanQuery)) {
    score += 800;
    if (nameRaw.includes(rawQuery)) score += 200;
    if (nameClean.startsWith(cleanQuery)) score += 250;
  }

  // 3. Khớp từng token (từ khóa) không phụ thuộc thứ tự
  let tokensInName = 0;
  let tokensInProduct = 0;
  let firstMatchedIndexInName = -1;
  let lastMatchedIndexInName = -1;
  let isSameOrderInName = true;

  for (let i = 0; i < cleanTokens.length; i++) {
    const token = cleanTokens[i];
    const rawToken = rawTokens[i];

    const posInName = nameClean.indexOf(token);
    if (posInName !== -1) {
      tokensInName++;
      if (firstMatchedIndexInName === -1) {
        firstMatchedIndexInName = posInName;
      }
      if (lastMatchedIndexInName !== -1 && posInName < lastMatchedIndexInName) {
        isSameOrderInName = false;
      }
      lastMatchedIndexInName = posInName;

      const isExactWord = nameWords.includes(token);
      score += isExactWord ? 120 : 70;

      if (nameRaw.includes(rawToken)) {
        score += 30;
      }
    }

    if (allSearchable.includes(token)) {
      tokensInProduct++;
    }
  }

  const totalTokens = cleanTokens.length;
  let isQualified = false;

  if (totalTokens === 1) {
    isQualified = tokensInProduct >= 1;
  } else if (totalTokens === 2) {
    // Cả 2 từ phải xuất hiện trong sản phẩm (ví dụ: "bình gốm", "gốm hoa", "hoa gốm")
    isQualified = tokensInProduct === 2;
  } else {
    isQualified = tokensInProduct >= Math.ceil(totalTokens * 0.7) || tokensInName >= Math.ceil(totalTokens * 0.6);
  }

  if (!isQualified && score === 0) return null;

  if (tokensInName === totalTokens) {
    score += 500;
    if (isSameOrderInName) score += 100;
    const density = Math.min(1, totalTokens / Math.max(1, nameWords.length));
    score += Math.round(density * 150);
  } else if (tokensInName > 0) {
    score += (tokensInName / totalTokens) * 300;
  }

  if (catClean.includes(cleanQuery)) {
    score += 120;
  }
  if (variantsClean.includes(cleanQuery)) {
    score += 100;
  }

  const popularity = Number(product.sold || 0);
  score += Math.min(50, Math.round(popularity));

  return {
    isMatch: true,
    score,
    tokensInName,
    tokensInProduct
  };
}

export function searchAndRankProducts<T extends Product>(products: T[], queryStr: string, maxResults = 100): T[] {
  if (!Array.isArray(products) || products.length === 0) return [];
  if (!queryStr || !String(queryStr).trim()) return products.slice(0, maxResults);

  const scored: { product: T; score: number }[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const res = matchAndScoreProduct(p, queryStr);
    if (res && res.isMatch) {
      scored.push({ product: p, score: res.score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(item => item.product);
}
