// app/orders.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Animated,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { collection, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { ScalePressable } from '../src/components/ScalePressable';
import { AnimatedCenterModal } from '../src/components/AnimatedCenterModal';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { BlurButton } from '../src/components/BlurButton';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { SymbolView } from 'expo-symbols';
import { OrderCardSkeleton } from '../src/components/ShimmerSkeleton';
import { useAuth } from '../src/context/AuthContext';
import { useRealtimeData } from '../src/context/RealtimeDataContext';
import { useSettings } from '../src/context/SettingsContext';
import { useCart } from '../src/context/CartContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { useThemeColor } from '../src/constants/theme';
import { formatDate } from '../src/utils/format';
import { lookupOrders } from '../src/services/orderService';

// Bảng màu quy chuẩn Tiệm Nhà Gốm (GEMINI.md & Brand Guidelines)
const BRAND = {
  primary: '#9C7156', // Nâu Đất Nung / Gốm Mộc
  textPrimary: '#2B2928', // Nâu Đen Than Chì
  bgCream: '#FAF8F5', // Kem Gốm Mộc Sáng
  warmBeige: '#E8CCB2', // Men Gốm Be Ấm
  cardWhite: '#FFFFFF',
  mutedText: '#6E665D',
  borderSoft: '#E8E1D8',
  tabInactiveBg: '#F3ECE3',
  tabInactiveText: '#716B64',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
};

// Định dạng giá tiền dạng "70.000đ"
const formatDisplayPrice = (amount?: number | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
};

// Định dạng ngày ngắn DD/MM/YYYY
const formatShortDate = (dateInput: any) => {
  if (!dateInput) return '';
  try {
    let d: Date;
    if (typeof dateInput.toDate === 'function') {
      d = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else if (typeof dateInput === 'number' || typeof dateInput === 'string') {
      d = new Date(dateInput);
    } else if (dateInput.seconds) {
      d = new Date(dateInput.seconds * 1000);
    } else {
      return '';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
};

// Kiểm tra URL ảnh có phải là ảnh placeholder không hợp lệ không
const isInvalidImage = (url?: string | null) => {
  if (!url || typeof url !== 'string') return true;
  const lower = url.trim().toLowerCase();
  return (
    lower === '' ||
    lower.includes('placehold.co') ||
    lower.includes('placeholder') ||
    lower.includes('no+image') ||
    lower.includes('no-image')
  );
};

// Khôi phục URL Firebase Storage nếu bị giải mã nhầm qua router params
export const sanitizeFirebaseStorageUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed.includes('firebasestorage.googleapis.com')) return trimmed;

  try {
    const parts = trimmed.split('/o/');
    if (parts.length === 2) {
      const base = parts[0];
      const rest = parts[1];
      const queryIdx = rest.indexOf('?');
      let pathPart = queryIdx !== -1 ? rest.substring(0, queryIdx) : rest;
      const queryPart = queryIdx !== -1 ? rest.substring(queryIdx) : '';

      if (pathPart.includes('/')) {
        pathPart = pathPart
          .split('/')
          .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
          .join('%2F');
      } else {
        pathPart = encodeURIComponent(decodeURIComponent(pathPart));
      }
      return `${base}/o/${pathPart}${queryPart}`;
    }
  } catch {}
  return trimmed;
};

const FALLBACK_CERAMIC_IMAGE =
  'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d';

/**
 * HÀM GIẢI QUYẾT ẢNH CHÍNH XÁC CHO TỪNG SẢN PHẨM TRONG ĐƠN:
 * 1. Ưu tiên tuyệt đối ảnh biến thể (họa tiết hoặc màu sắc)
 * 2. Tra cứu trong danh mục sản phẩm Firestore (patternVariants, colorVariants, comboVariants)
 * 3. Lấy ảnh thật từ item (item.image, item.imageUrl)
 * 4. Lấy ảnh sản phẩm từ catalog
 */
export const resolveItemImage = (item: any, productsCatalog: any[] = []): string => {
  if (!item) return FALLBACK_CERAMIC_IMAGE;

  // 1. Kiểm tra ảnh trực tiếp từ item
  if (item.resolvedImage && !isInvalidImage(item.resolvedImage)) {
    return sanitizeFirebaseStorageUrl(item.resolvedImage);
  }
  if (item.imageUrl && !isInvalidImage(item.imageUrl)) {
    return sanitizeFirebaseStorageUrl(item.imageUrl);
  }
  if (item.image && !isInvalidImage(item.image)) {
    return sanitizeFirebaseStorageUrl(item.image);
  }
  if (item.thumbUrl && !isInvalidImage(item.thumbUrl)) {
    return sanitizeFirebaseStorageUrl(item.thumbUrl);
  }

  // 2. Kiểm tra ảnh biến thể lưu trực tiếp trên item
  if (item.variant?.imageUrl && !isInvalidImage(item.variant.imageUrl)) {
    return sanitizeFirebaseStorageUrl(item.variant.imageUrl);
  }
  if (item.variant?.thumbUrl && !isInvalidImage(item.variant.thumbUrl)) {
    return sanitizeFirebaseStorageUrl(item.variant.thumbUrl);
  }

  const prodId = item.productId || item.id;
  const catalogProduct = productsCatalog.find(
    (p) =>
      p &&
      (p.id === prodId ||
        (item.id && p.id?.startsWith(item.id)) ||
        (prodId && p.id?.includes(prodId)) ||
        (p.name && item.name && p.name.trim().toLowerCase() === item.name.trim().toLowerCase()))
  );

  const variantName =
    item.variant?.name ||
    item.selectedPattern ||
    item.pattern ||
    item.selectedColor ||
    item.color ||
    item.variantName ||
    '';

  // 3. Tra cứu trong các biến thể của catalog Firestore
  if (catalogProduct && variantName) {
    const cleanVarName = String(variantName).trim().toLowerCase();

    // 2.1 Biến thể Họa Tiết (patternVariants)
    if (Array.isArray(catalogProduct.patternVariants)) {
      const matchPattern = catalogProduct.patternVariants.find(
        (v: any) => v && v.name && v.name.trim().toLowerCase() === cleanVarName
      );
      if (matchPattern) {
        const vImg = matchPattern.imageUrl || matchPattern.thumbUrl;
        if (!isInvalidImage(vImg)) return vImg;
      }
    }

    // 2.2 Biến thể Màu Sắc (colorVariants)
    if (Array.isArray(catalogProduct.colorVariants)) {
      const matchColor = catalogProduct.colorVariants.find(
        (v: any) => v && v.name && v.name.trim().toLowerCase() === cleanVarName
      );
      if (matchColor) {
        const vImg = matchColor.imageUrl || matchColor.thumbUrl;
        if (!isInvalidImage(vImg)) return vImg;
      }
    }

    // 2.3 Biến thể Combo (comboVariants)
    if (Array.isArray(catalogProduct.comboVariants)) {
      const matchCombo = catalogProduct.comboVariants.find(
        (v: any) => v && v.name && v.name.trim().toLowerCase() === cleanVarName
      );
      if (matchCombo) {
        const vImg = matchCombo.imageUrl || matchCombo.thumbUrl;
        if (!isInvalidImage(vImg)) return vImg;
      }
    }
  }

  // 3. Ảnh trực tiếp của item trong đơn (item.image hoặc item.imageUrl) nếu không phải placeholder
  if (item.imageUrl && !isInvalidImage(item.imageUrl)) {
    return item.imageUrl;
  }
  if (item.image && !isInvalidImage(item.image)) {
    return item.image;
  }
  if (item.thumbUrl && !isInvalidImage(item.thumbUrl)) {
    return item.thumbUrl;
  }

  // 4. Lấy ảnh chính của sản phẩm trong catalog Firestore
  if (catalogProduct) {
    if (catalogProduct.imageUrl && !isInvalidImage(catalogProduct.imageUrl)) {
      return catalogProduct.imageUrl;
    }
    if (Array.isArray(catalogProduct.images) && catalogProduct.images.length > 0) {
      const validFirst = catalogProduct.images.find((img: string) => !isInvalidImage(img));
      if (validFirst) return validFirst;
    }

    // Nếu product có biến thể nào có ảnh thật thì lấy ảnh đó
    const allVariants = [
      ...(catalogProduct.patternVariants || []),
      ...(catalogProduct.colorVariants || []),
      ...(catalogProduct.comboVariants || []),
    ];
    const firstVarWithImg = allVariants.find(
      (v: any) => v && (v.imageUrl || v.thumbUrl) && !isInvalidImage(v.imageUrl || v.thumbUrl)
    );
    if (firstVarWithImg) {
      return firstVarWithImg.imageUrl || firstVarWithImg.thumbUrl;
    }
  }

  // Fallback an toàn về ảnh men gốm Tiệm Nhà Gốm
  return FALLBACK_CERAMIC_IMAGE;
};

// Lấy nhãn biến thể để hiển thị chi tiết (vd: "Họa tiết: Gấu Nâu" hoặc "Màu sắc: Men Rạn")
const getVariantDisplayLabel = (item: any): string => {
  if (item.selectedPattern || item.pattern) {
    return `Họa tiết: ${item.selectedPattern || item.pattern}`;
  }
  if (item.selectedColor || item.color) {
    return `Màu sắc: ${item.selectedColor || item.color}`;
  }
  if (item.variant?.name) {
    const typeLabel =
      item.variant.type === 'color'
        ? 'Màu sắc'
        : item.variant.type === 'pattern'
        ? 'Họa tiết'
        : item.variant.type === 'combo'
        ? 'Combo'
        : 'Phân loại';
    return `${typeLabel}: ${item.variant.name}`;
  }
  if (item.variantName) {
    return `Phân loại: ${item.variantName}`;
  }
  return '';
};

type MainTab = 'ongoing' | 'completed' | 'cancelled';

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { user } = useAuth();
  const { products: productsCatalog, orders: realtimeOrders } = useRealtimeData();
  const { addToCart } = useCart();

  // Tab lọc chính (Đang diễn ra | Hoàn thành | Đã hủy)
  const [activeTab, setActiveTab] = useState<MainTab>('completed');

  // Lọc phụ (Thời gian | Cửa hàng)
  const [timeFilter, setTimeFilter] = useState<'all' | '30days' | '3months' | '6months' | '2026'>('all');
  const [storeFilter, setStoreFilter] = useState<'all' | 'gia-dinh' | 'online' | 'pickup'>('all');

  // Đơn hàng lấy trực tiếp từ Firestore
  const [firestoreOrders, setFirestoreOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Modals
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [lookupModalVisible, setLookupModalVisible] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingOrder, setRatingOrder] = useState<any | null>(null);
  const [starCount, setStarCount] = useState(5);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewTags, setReviewTags] = useState<string[]>(['Men gốm tinh xảo']);

  // Tra cứu đơn
  const [searchInput, setSearchInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Hiệu ứng cuộn và vào trang
  const [scrollY, setScrollY] = useState(0);
  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));
  const { pageStyle } = usePageAnimation({ itemCount: 10, delay: 35 });

  // ── LẤY ĐƠN HÀNG TRỰC TIẾP TỪ FIRESTORE CỦA USER ĐĂNG NHẬP ──
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (!user?.uid) {
      setFirestoreOrders([]);
      setLoadingOrders(false);
      return;
    }

    setLoadingOrders(true);
    try {
      const ordersRef = collection(db, 'orders');
      const qUser = query(ordersRef, where('userId', '==', user.uid), limit(50));

      unsubscribe = onSnapshot(
        qUser,
        (snapshot) => {
          const userOrdersList: any[] = [];
          snapshot.forEach((d) => userOrdersList.push({ id: d.id, ...d.data() }));

          userOrdersList.sort((a, b) => {
            const timeA = a.createdAt?.seconds || a.orderDate?.seconds || 0;
            const timeB = b.createdAt?.seconds || b.orderDate?.seconds || 0;
            return timeB - timeA;
          });

          setFirestoreOrders(userOrdersList);
          setLoadingOrders(false);
        },
        (err) => {
          console.warn('Lỗi lắng nghe đơn hàng Firestore:', err);
          setFirestoreOrders([]);
          setLoadingOrders(false);
        }
      );
    } catch (e) {
      console.warn('Lỗi đọc đơn hàng từ Firestore:', e);
      setFirestoreOrders([]);
      setLoadingOrders(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid]);

  // ── CHUẨN HÓA ĐƠN HÀNG LẤY ĐÚNG MÃ TRONG FIRESTORE & ĐÚNG ẢNH SẢN PHẨM / BIẾN THỂ ──
  const allOrders = useMemo(() => {
    // Chỉ lấy đơn hàng thuộc về chính tài khoản user đang đăng nhập
    const rawList = firestoreOrders;

    return rawList.map((item: any) => {
      // 1. MÃ ĐƠN HÀNG PHẢI LẤY ĐÚNG TRONG FIRESTORE (orderCode hoặc orderId hoặc doc.id)
      const exactOrderCode = item.orderCode || item.orderId || item.code || item.id || '';
      const upperCode = exactOrderCode.toUpperCase();

      const orderDate = item.orderDate || item.createdAt || new Date();
      const statusRaw = item.status || 'Đã hoàn thành';

      // Hình thức nhận hàng theo quy tắc:
      // - Nếu là đơn từ máy POS (mã POS-xxxx, source: pos): để là "Mua tại cửa hàng"
      // - Nếu là mã TNG-xxxx hoặc đơn trực tuyến: để là "Mua online"
      let orderMethod = item.orderMethod;
      if (upperCode.startsWith('POS') || item.source === 'pos' || item.channel === 'pos' || item.inStore) {
        orderMethod = 'Mua tại cửa hàng';
      } else if (upperCode.startsWith('TNG')) {
        orderMethod = 'Mua online';
      } else if (item.shippingMethod === 'pickup' || item.deliveryMethod === 'pickup') {
        orderMethod = 'Tự đến lấy';
      } else if (!orderMethod) {
        orderMethod = 'Mua online';
      }

      // Tên chi nhánh / showroom
      let storeName = item.storeName;
      if (!storeName) {
        if (orderMethod === 'Mua tại cửa hàng' || upperCode.startsWith('POS')) {
          storeName = 'Tiệm Nhà Gốm — 37 Nguyễn Duy, Gia Định';
        } else if (orderMethod === 'Tự đến lấy') {
          storeName = 'Tiệm Nhà Gốm — Showroom Gia Định';
        } else {
          storeName = 'Tiệm Nhà Gốm — Đặt hàng Trực tuyến';
        }
      }

      // Danh sách sản phẩm kèm ảnh chính xác (biến thể hoạ tiết / màu sắc / combo)
      const items = Array.isArray(item.items)
        ? item.items.map((it: any) => {
            const resolvedImg = resolveItemImage(it, productsCatalog);
            const variantText = getVariantDisplayLabel(it);
            return {
              ...it,
              resolvedImage: resolvedImg,
              variantDisplay: variantText,
            };
          })
        : [];

      // Tóm tắt danh sách tên sản phẩm kèm biến thể (ví dụ: "Cốc gốm (Họa tiết: Gấu Nâu), Đĩa men rạn")
      let summaryName = item.summaryName;
      if (!summaryName) {
        if (Array.isArray(item.productNames) && item.productNames.length > 0) {
          summaryName = item.productNames.join(', ');
        } else if (items.length > 0) {
          summaryName = items
            .map((i: any) => {
              if (i.variantDisplay) {
                return `${i.name} (${i.variantDisplay})`;
              }
              if (i.variant?.name) {
                return `${i.name} (${i.variant.name})`;
              }
              return i.name;
            })
            .filter(Boolean)
            .join(', ');
        }
      }

      return {
        ...item,
        id: item.id || exactOrderCode,
        orderCode: exactOrderCode, // Giữ nguyên 100% mã đơn hàng từ Firestore
        orderDate,
        orderMethod,
        storeName,
        items,
        summaryName: summaryName || 'Sản phẩm gốm thủ công Tiệm Nhà Gốm',
        statusRaw,
      };
    });
  }, [firestoreOrders, realtimeOrders, productsCatalog]);

  // Phân loại đơn theo 3 Tab chính (Đang diễn ra | Hoàn thành | Đã hủy)
  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      const s = (order.statusRaw || '').toLowerCase();
      const isCancelled = s.includes('hủy') || s.includes('cancel');
      const isCompleted =
        s.includes('hoàn') ||
        s.includes('complete') ||
        s.includes('giao thành công') ||
        s.includes('đã nhận');
      const isOngoing = !isCancelled && !isCompleted;

      // 1. Lọc theo Tab chính
      if (activeTab === 'ongoing' && !isOngoing) return false;
      if (activeTab === 'completed' && !isCompleted) return false;
      if (activeTab === 'cancelled' && !isCancelled) return false;

      // 2. Lọc theo Thời gian
      if (timeFilter !== 'all') {
        const orderTime = order.orderDate?.seconds
          ? order.orderDate.seconds * 1000
          : new Date(order.orderDate).getTime();
        const now = Date.now();
        const diffDays = (now - orderTime) / (1000 * 60 * 60 * 24);
        if (timeFilter === '30days' && diffDays > 30) return false;
        if (timeFilter === '3months' && diffDays > 90) return false;
        if (timeFilter === '6months' && diffDays > 180) return false;
      }

      // 3. Lọc theo Cửa hàng
      if (storeFilter !== 'all') {
        if (storeFilter === 'gia-dinh' && order.orderMethod !== 'Mua tại cửa hàng') return false;
        if (storeFilter === 'online' && order.orderMethod !== 'Mua online') return false;
        if (storeFilter === 'pickup' && order.orderMethod !== 'Tự đến lấy') return false;
      }

      return true;
    });
  }, [allOrders, activeTab, timeFilter, storeFilter]);

  // Nhãn hiển thị Dropdown Thời Gian
  const timeFilterLabel = useMemo(() => {
    switch (timeFilter) {
      case '30days':
        return t('timeFilter30Days') || '30 ngày qua';
      case '3months':
        return t('timeFilter3Months') || '3 tháng qua';
      case '6months':
        return t('timeFilter6Months') || '6 tháng qua';
      case '2026':
        return '2026';
      default:
        return t('timeFilterAll') || 'Thời gian';
    }
  }, [timeFilter, t]);

  // Nhãn hiển thị Dropdown Cửa Hàng
  const storeFilterLabel = useMemo(() => {
    switch (storeFilter) {
      case 'gia-dinh':
        return t('inStorePurchase') || 'Tại cửa hàng';
      case 'online':
        return t('onlinePurchase') || 'Mua online';
      case 'pickup':
        return t('pickupPurchase') || 'Tự đến lấy';
      default:
        return t('storeLabel') || 'Cửa hàng';
    }
  }, [storeFilter, t]);


  // Xử lý nút "Đặt lại món quen"
  const handleReorder = (order: any) => {
    if (!order.items || order.items.length === 0) {
      Alert.alert('Thông báo', 'Đơn hàng này không có danh sách sản phẩm để đặt lại.');
      return;
    }

    let count = 0;
    order.items.forEach((item: any) => {
      const productObj: any = {
        id: item.productId || item.id,
        name: item.name,
        price: item.price,
        stock: 50,
        imageUrl: item.resolvedImage || item.image || item.imageUrl,
      };
      addToCart(productObj, item.quantity || 1, item.variant);
      count += item.quantity || 1;
    });

    Alert.alert(
      t('reorderConfirmTitle'),
      t('reorderConfirmDesc'),
      [
        { text: t('continueBrowsingAction'), style: 'cancel' },
        { text: t('goToCartAction'), onPress: () => router.push('/(tabs)/cart') },
      ]
    );
  };

  // Mở modal Đánh giá
  const handleOpenRating = (order: any) => {
    setRatingOrder(order);
    setStarCount(5);
    setReviewNote('');
    setReviewTags(['Men gốm tinh xảo', 'Đóng gói cẩn thận']);
    setRatingModalVisible(true);
  };

  // Gửi đánh giá
  const handleSubmitRating = () => {
    setRatingModalVisible(false);
    Alert.alert(
      'Cảm ơn bạn! ✨',
      `Đánh giá ${starCount} sao cho đơn #${ratingOrder?.orderCode} đã được ghi nhận. Tiệm Nhà Gốm rất trân quý phản hồi từ bạn.`
    );
  };

  // Tra cứu đơn hàng theo mã hoặc SĐT
  const handleLookup = async () => {
    if (!searchInput.trim()) return;
    setLookupLoading(true);
    setHasSearched(true);
    try {
      const res = await lookupOrders(searchInput.trim());
      setLookupResults(res);
    } catch (e) {
      console.warn('Lỗi tra cứu đơn:', e);
    } finally {
      setLookupLoading(false);
    }
  };

  // Cấu hình nhãn và màu sắc badge trạng thái (TUYỆT ĐỐI KHÔNG DÙNG MÀU XANH LÁ)
  const getBadgeStyle = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('hủy') || s.includes('cancel')) {
      return {
        bg: isDark ? 'rgba(220, 38, 38, 0.15)' : BRAND.dangerBg,
        borderColor: isDark ? 'transparent' : BRAND.dangerBorder,
        textColor: '#EF5350',
        label: t('statusCancelledTitle'),
      };
    }
    if (s.includes('giao') || s.includes('ship')) {
      return {
        bg: isDark ? (Colors.surface || '#2C2C2C') : '#FAF4ED',
        borderColor: isDark ? 'transparent' : BRAND.warmBeige,
        textColor: isDark ? '#E8CCB2' : '#8A5A2B',
        label: t('statusShippingTitle'),
      };
    }
    if (s.includes('xác nhận') || s.includes('xử lý') || s.includes('chuẩn bị')) {
      return {
        bg: isDark ? (Colors.surface || '#2C2C2C') : '#F5F3EF',
        borderColor: isDark ? 'transparent' : BRAND.borderSoft,
        textColor: Colors.textMuted || BRAND.mutedText,
        label: t('statusProcessingTitle'),
      };
    }
    // Hoàn tất: Tông kem gốm sang trọng, viền men gốm ấm, chữ nâu đất nung
    return {
      bg: isDark ? 'rgba(156, 113, 86, 0.2)' : '#F6F4EC',
      borderColor: isDark ? 'transparent' : BRAND.warmBeige,
      textColor: isDark ? '#E8CCB2' : BRAND.primary,
      label: t('statusCompletedTitle'),
    };
  };

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />

      {/* Thanh điều hướng gốc iOS UINavigationBar chuẩn Liquid Glass giống trang Tìm kiếm */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitle: () => (
            <Text style={styles.navHeaderTitle}>
              {t('orderHistoryTitle') || 'Lịch sử mua hàng'}
            </Text>
          ),
          headerTintColor: '#9C7156',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setLookupModalVisible(true)}
              style={styles.headerRightBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Tra cứu đơn hàng"
            >
              <Ionicons name="search-outline" size={21} color={Colors.textPrimary} />
            </TouchableOpacity>
          ),
        }}
      />
      <FadingHeaderBackdrop />

      {/* ── KHỐI BỘ LỌC CỐ ĐỊNH TRÊN CÙNG (3 TABS + HÀNG THỜI GIAN/CỬA HÀNG) ── */}
      <View style={[styles.fixedFilterContainer, { paddingTop: Platform.OS === 'ios' ? insets.top + 48 : insets.top + 54 }]}>
        {/* 1. Hàng 3 Tab Viên Thuốc: Đang diễn ra | Hoàn thành | Đã hủy */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'ongoing' ? styles.tabPillActive : styles.tabPillInactive]}
            activeOpacity={0.85}
            onPress={() => setActiveTab('ongoing')}
          >
            <Text style={[styles.tabText, activeTab === 'ongoing' ? styles.tabTextActive : styles.tabTextInactive]}>
              {t('tabOngoing') || 'Đang diễn ra'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'completed' ? styles.tabPillActive : styles.tabPillInactive]}
            activeOpacity={0.85}
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' ? styles.tabTextActive : styles.tabTextInactive]}>
              {t('tabCompleted') || 'Hoàn thành'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'cancelled' ? styles.tabPillActive : styles.tabPillInactive]}
            activeOpacity={0.85}
            onPress={() => setActiveTab('cancelled')}
          >
            <Text style={[styles.tabText, activeTab === 'cancelled' ? styles.tabTextActive : styles.tabTextInactive]}>
              {t('tabCancelled') || 'Đã hủy'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 2. Hàng Dropdown Lọc Phụ: Thời gian | Cửa hàng */}
        <View style={styles.subFilterRow}>
          <TouchableOpacity
            style={[styles.filterDropdownTouch, timeFilter !== 'all' && styles.filterDropdownTouchActive]}
            activeOpacity={0.7}
            onPress={() => setTimeModalVisible(true)}
          >
            <Text style={[styles.filterDropdownText, timeFilter !== 'all' && styles.filterDropdownTextActive]}>
              {timeFilterLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={15}
              color={timeFilter !== 'all' ? BRAND.primary : BRAND.textPrimary}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterDropdownTouch, storeFilter !== 'all' && styles.filterDropdownTouchActive]}
            activeOpacity={0.7}
            onPress={() => setStoreModalVisible(true)}
          >
            <Text style={[styles.filterDropdownText, storeFilter !== 'all' && styles.filterDropdownTextActive]}>
              {storeFilterLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={15}
              color={storeFilter !== 'all' ? BRAND.primary : BRAND.textPrimary}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── NỘI DUNG DANH SÁCH CUỘN ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollListContent}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Skeleton Shimmer Loading thay cho vòng xoay đơn điệu */}
        {loadingOrders && firestoreOrders.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </View>
        ) : filteredOrders.length === 0 ? (
          /* TRƯỜNG HỢP: KHÔNG CÓ ĐƠN HÀNG (EMPTY STATE CHUẨN ẢNH 1) */
          <View style={styles.emptyContainer}>
            <View style={styles.boxIllustrationWrap}>
              <View style={styles.boxAura} />
              <View style={styles.boxArtIcon}>
                <Ionicons name="cube-outline" size={76} color={BRAND.primary} />
                <View style={styles.boxBubbleBadge}>
                  <Ionicons name="chatbubble-ellipses" size={24} color={BRAND.primary} />
                </View>
                <Ionicons name="sparkles" size={18} color={BRAND.primary} style={styles.boxSparkleTop} />
              </View>
            </View>

            <Text style={styles.emptyMainText}>
              {activeTab === 'ongoing'
                ? t('emptyOrdersOngoing') || 'Không có đơn hàng nào đang diễn ra'
                : activeTab === 'completed'
                ? t('emptyOrdersCompleted') || 'Bạn chưa có đơn hàng nào đã hoàn tất'
                : t('emptyOrdersCancelled') || 'Không có đơn hàng nào bị hủy'}
            </Text>

            <Text style={styles.emptySubText}>
              {t('emptyOrdersDesc') || 'Hãy khám phá các tác phẩm gốm mộc tinh xảo và chọn cho mình những món đồ ưng ý nhé!'}
            </Text>

            <TouchableOpacity
              style={styles.emptyExploreBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/products')}
            >
              <Text style={styles.emptyExploreBtnText}>{t('exploreCeramicsNow') || 'Khám phá đồ gốm ngay'}</Text>
              <Ionicons name="arrow-forward" size={17} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        ) : (
          /* TRƯỜNG HỢP: CÓ ĐƠN HÀNG (DANH SÁCH THẺ ĐƠN HÀNG CHUẨN ẢNH 2) */
          <View style={styles.ordersListWrap}>

            {filteredOrders.map((order, index) => {
              const badge = getBadgeStyle(order.statusRaw);
              const itemsList = order.items || [];
              const previewThumbnails = itemsList.slice(0, 4);
              const extraCount = Math.max(0, itemsList.length - 4);

              return (
                <TouchableOpacity
                  key={order.id || index}
                  style={styles.orderCard}
                  activeOpacity={0.92}
                  onPress={() => {
                    router.push({
                      pathname: '/order-detail',
                      params: { orderId: order.id, orderData: JSON.stringify(order) },
                    });
                  }}
                >
                  {/* ── HÀNG 1: THÔNG TIN HÌNH THỨC, NGÀY ĐẶT & MÃ ĐƠN CHUẨN FIRESTORE ── */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTopLeft}>
                      <Text style={styles.orderMethodDateText}>
                        {order.orderMethod} | {formatShortDate(order.orderDate)}
                      </Text>
                      {/* Hiển thị chính xác 100% mã đơn hàng từ Firestore */}
                      <Text style={styles.orderCodeText} numberOfLines={1}>
                        {t('orderCode')}: {order.orderCode}
                      </Text>
                    </View>

                    {/* Badge trạng thái */}
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.borderColor }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.textColor }]}>{badge.label}</Text>
                    </View>
                  </View>

                  {/* ── HÀNG 2: TÊN CỬA HÀNG / CHI NHÁNH ── */}
                  <Text style={styles.storeNameTitle} numberOfLines={1}>
                    {order.storeName}
                  </Text>

                  {/* ── HÀNG 3: DANH SÁCH THUMBNAIL ẢNH SẢN PHẨM & BIẾN THỂ CHUẨN XÁC ── */}
                  {itemsList.length > 0 && (
                    <View style={styles.thumbnailsRow}>
                      {previewThumbnails.map((item: any, thumbIdx: number) => {
                        const imgUri = item.resolvedImage;

                        return (
                          <View key={thumbIdx} style={styles.thumbnailWrapper}>
                            <Image
                              source={{ uri: imgUri }}
                              style={styles.productThumbnail}
                              contentFit="cover"
                              transition={150}
                              cachePolicy="disk"
                              recyclingKey={imgUri}
                            />
                            {/* Ô cuối cùng có hiển thị số lượng món còn lại nếu > 4 */}
                            {thumbIdx === 3 && extraCount > 0 && (
                              <View style={styles.extraCountOverlay}>
                                <Text style={styles.extraCountText}>+{extraCount}</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* ── HÀNG 4: TÊN SẢN PHẨM TÓM TẮT & TỔNG TIỀN ĐƠN ── */}
                  <View style={styles.summaryAndPriceRow}>
                    <Text style={styles.summaryItemsText} numberOfLines={1}>
                      {order.summaryName}
                    </Text>
                    <Text style={styles.totalPriceBoldText}>
                      {formatDisplayPrice(order.totalAmount)}
                    </Text>
                  </View>

                  {/* ── HÀNG 5: CÁC NÚT HÀNH ĐỘNG DẠNG VIÊN THUỐC ── */}
                  <View style={styles.cardActionsRow}>
                    {/* Nút Đánh giá (Hiện khi đơn đã hoàn thành) */}
                    {activeTab === 'completed' && (
                      <TouchableOpacity
                        style={styles.reviewBtn}
                        activeOpacity={0.8}
                        onPress={() => handleOpenRating(order)}
                      >
                        <Text style={styles.reviewBtnText}>{t('reviewAction') || 'Đánh giá'}</Text>
                      </TouchableOpacity>
                    )}

                    {/* Nút Đặt lại món quen (Cho đơn hoàn thành hoặc đã hủy) */}
                    {activeTab !== 'ongoing' ? (
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        activeOpacity={0.8}
                        onPress={() => handleReorder(order)}
                      >
                        <Text style={styles.reorderBtnText}>{t('reorderAction') || 'Đặt lại món quen'}</Text>
                      </TouchableOpacity>
                    ) : (
                      /* Đơn đang diễn ra: Nút Theo dõi tiến trình / Xem chi tiết */
                      <TouchableOpacity
                        style={styles.trackOrderBtn}
                        activeOpacity={0.85}
                        onPress={() => {
                          router.push({
                            pathname: '/order-detail',
                            params: { orderId: order.id, orderData: JSON.stringify(order) },
                          });
                        }}
                      >
                        <Ionicons name="time-outline" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
                        <Text style={styles.trackOrderBtnText}>{t('trackOrderAction') || 'Theo dõi đơn hàng'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── MODAL LỌC THỜI GIAN (BOTTOM SHEET) ── */}
      <AnimatedBottomSheetModal
        visible={timeModalVisible}
        onClose={() => setTimeModalVisible(false)}
        contentStyle={styles.sheetContent}
      >
        <Text style={styles.sheetTitle}>Chọn khoảng thời gian</Text>

        {[
          { key: 'all', label: 'Tất cả thời gian' },
          { key: '30days', label: '30 ngày gần đây' },
          { key: '3months', label: '3 tháng gần đây' },
          { key: '6months', label: '6 tháng gần đây' },
          { key: '2026', label: 'Năm 2026' },
        ].map((opt) => (
          <ScalePressable
            key={opt.key}
            style={[styles.sheetOptionRow, timeFilter === opt.key && styles.sheetOptionRowActive]}
            activeScale={0.96}
            onPress={() => {
              setTimeFilter(opt.key as any);
              setTimeModalVisible(false);
            }}
          >
            <Text style={[styles.sheetOptionText, timeFilter === opt.key && styles.sheetOptionTextActive]}>
              {opt.label}
            </Text>
            {timeFilter === opt.key && <Ionicons name="checkmark-circle" size={20} color={BRAND.primary} />}
          </ScalePressable>
        ))}
      </AnimatedBottomSheetModal>

      {/* ── MODAL LỌC CỬA HÀNG (BOTTOM SHEET) ── */}
      <AnimatedBottomSheetModal
        visible={storeModalVisible}
        onClose={() => setStoreModalVisible(false)}
        contentStyle={styles.sheetContent}
      >
        <Text style={styles.sheetTitle}>Chọn cửa hàng & hình thức</Text>

        {[
          { key: 'all', label: 'Tất cả cửa hàng & hình thức' },
          { key: 'gia-dinh', label: 'Mua tại cửa hàng (Mã POS)' },
          { key: 'online', label: 'Mua online (Mã TNG)' },
          { key: 'pickup', label: 'Tự đến lấy tại Showroom' },
        ].map((opt) => (
          <ScalePressable
            key={opt.key}
            style={[styles.sheetOptionRow, storeFilter === opt.key && styles.sheetOptionRowActive]}
            activeScale={0.96}
            onPress={() => {
              setStoreFilter(opt.key as any);
              setStoreModalVisible(false);
            }}
          >
            <Text style={[styles.sheetOptionText, storeFilter === opt.key && styles.sheetOptionTextActive]}>
              {opt.label}
            </Text>
            {storeFilter === opt.key && <Ionicons name="checkmark-circle" size={20} color={BRAND.primary} />}
          </ScalePressable>
        ))}
      </AnimatedBottomSheetModal>

      {/* ── MODAL TRA CỨU ĐƠN HÀNG NHANH (MÃ ĐƠN HOẶC SĐT TỪ FIRESTORE) ── */}
      <AnimatedCenterModal
        visible={lookupModalVisible}
        onClose={() => setLookupModalVisible(false)}
        contentStyle={styles.lookupModalCard}
        avoidKeyboard
      >
        <View style={styles.modalHeaderRow}>
          <View style={styles.modalHeaderLeft}>
            <Ionicons name="search" size={20} color={BRAND.primary} style={{ marginRight: 6 }} />
            <Text style={styles.modalHeaderTitle}>Tra cứu đơn hàng</Text>
          </View>
          <ScalePressable onPress={() => setLookupModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeScale={0.88}>
            <Ionicons name="close" size={22} color={BRAND.textPrimary} />
          </ScalePressable>
        </View>

        <Text style={styles.lookupIntroText}>
          Nhập mã đơn hàng hoặc số điện thoại người nhận để tìm kiếm thông tin đơn hàng nhanh chóng trong hệ thống:
        </Text>

        <View style={styles.lookupInputWrap}>
          <Ionicons name="receipt-outline" size={18} color={isDark ? '#F5F5F5' : '#2B2928'} style={{ marginRight: 8 }} />
          <TextInput
                style={styles.lookupInput}
                placeholder="VD: POS-1784293830832 hoặc SĐT"
                placeholderTextColor={isDark ? 'rgba(245, 245, 245, 0.72)' : 'rgba(43, 41, 40, 0.68)'}
                value={searchInput}
                onChangeText={setSearchInput}
                returnKeyType="search"
                onSubmitEditing={handleLookup}
              />
              {searchInput.length > 0 && (
                <TouchableOpacity onPress={() => setSearchInput('')}>
                  <Ionicons name="close-circle" size={18} color={isDark ? '#F5F5F5' : '#2B2928'} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.lookupSubmitBtn} activeOpacity={0.85} onPress={handleLookup}>
              {lookupLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.lookupSubmitBtnText}>Tìm kiếm đơn</Text>
              )}
            </TouchableOpacity>

            {/* Kết quả tra cứu */}
            {hasSearched && (
              <View style={{ marginTop: 16 }}>
                {lookupResults.length === 0 ? (
                  <Text style={styles.noLookupText}>Không tìm thấy đơn hàng nào khớp với từ khóa.</Text>
                ) : (
                  <Text style={styles.foundLookupText}>Tìm thấy {lookupResults.length} đơn hàng liên quan.</Text>
                )}
              </View>
            )}
      </AnimatedCenterModal>

      {/* ── MODAL ĐÁNH GIÁ ĐƠN HÀNG (RATING & REVIEW) ── */}
      <AnimatedBottomSheetModal
        visible={ratingModalVisible}
        onClose={() => setRatingModalVisible(false)}
        contentStyle={styles.ratingSheetCard}
        avoidKeyboard
      >
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalHeaderTitle}>Đánh giá trải nghiệm</Text>
          <ScalePressable onPress={() => setRatingModalVisible(false)} activeScale={0.88}>
            <Ionicons name="close" size={22} color={BRAND.textPrimary} />
          </ScalePressable>
        </View>

        <Text style={styles.ratingSubtitle}>
          Bạn cảm thấy thế nào về đơn hàng #{ratingOrder?.orderCode}?
        </Text>

        {/* 5 sao đánh giá */}
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <ScalePressable key={star} onPress={() => setStarCount(star)} activeScale={0.85} style={{ padding: 6 }}>
              <Ionicons
                name={star <= starCount ? 'star' : 'star-outline'}
                size={36}
                color={star <= starCount ? '#E5B869' : '#D1C7BD'}
              />
            </ScalePressable>
          ))}
        </View>

        {/* Các tags cảm nhận */}
        <View style={styles.tagsWrap}>
          {['Men gốm tinh xảo', 'Đóng gói kỹ lưỡng', 'Giao nhanh chóng', 'Tư vấn nhiệt tình', 'Hài lòng 100%'].map((tag) => {
            const isSelected = reviewTags.includes(tag);
            return (
              <ScalePressable
                key={tag}
                style={[styles.tagPill, isSelected && styles.tagPillActive]}
                activeScale={0.92}
                onPress={() => {
                  if (isSelected) {
                    setReviewTags(reviewTags.filter((t) => t !== tag));
                  } else {
                    setReviewTags([...reviewTags, tag]);
                  }
                }}
              >
                <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>{tag}</Text>
              </ScalePressable>
            );
          })}
        </View>

        {/* Ô ghi chú cảm nghĩ */}
        <TextInput
          style={styles.reviewTextInput}
          placeholder="Chia sẻ thêm cảm nhận của bạn về sản phẩm gốm..."
          placeholderTextColor="#9E968D"
          multiline
          numberOfLines={3}
          value={reviewNote}
          onChangeText={setReviewNote}
        />

        {/* Nút gửi đánh giá */}
        <ScalePressable style={styles.submitReviewBtn} activeScale={0.96} onPress={handleSubmitRating}>
          <Text style={styles.submitReviewBtnText}>Gửi đánh giá</Text>
        </ScalePressable>
      </AnimatedBottomSheetModal>

      {/* ── MODAL CHI TIẾT ĐƠN HÀNG ĐẦY ĐỦ ── */}
      <AnimatedBottomSheetModal
        visible={Boolean(selectedOrderDetail)}
        onClose={() => setSelectedOrderDetail(null)}
        contentStyle={styles.detailSheetCard}
      >
        <View style={styles.modalHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalHeaderTitle}>Chi tiết đơn hàng</Text>
            {/* Hiển thị chuẩn xác mã đơn Firestore */}
            <Text style={styles.detailCodeSub}>#{selectedOrderDetail?.orderCode}</Text>
          </View>
          <ScalePressable onPress={() => setSelectedOrderDetail(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeScale={0.88}>
            <Ionicons name="close" size={24} color={BRAND.textPrimary} />
          </ScalePressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520, marginTop: 12 }}>
          {/* Trạng thái & ngày giờ */}
          <View style={styles.detailMetaBox}>
            <View style={styles.detailMetaRow}>
              <Text style={styles.detailMetaLabel}>Trạng thái:</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: getBadgeStyle(selectedOrderDetail?.statusRaw).bg,
                    borderColor: getBadgeStyle(selectedOrderDetail?.statusRaw).borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: getBadgeStyle(selectedOrderDetail?.statusRaw).textColor },
                  ]}
                >
                  {getBadgeStyle(selectedOrderDetail?.statusRaw).label}
                </Text>
              </View>
            </View>
            <View style={styles.detailMetaRow}>
              <Text style={styles.detailMetaLabel}>Ngày đặt hàng:</Text>
              <Text style={styles.detailMetaVal}>{formatDate(selectedOrderDetail?.orderDate)}</Text>
            </View>
            <View style={styles.detailMetaRow}>
              <Text style={styles.detailMetaLabel}>Hình thức:</Text>
              <Text style={styles.detailMetaVal}>{selectedOrderDetail?.orderMethod || 'Giao tận nơi'}</Text>
            </View>
          </View>

          {/* Danh sách từng món với ảnh sản phẩm/biến thể đúng từ Firestore */}
          <Text style={styles.detailSectionTitle}>SẢN PHẨM ({selectedOrderDetail?.items?.length || 0})</Text>
          {selectedOrderDetail?.items?.map((item: any, idx: number) => (
            <View key={idx} style={styles.detailItemRow}>
              <Image
                source={{ uri: item.resolvedImage }}
                style={styles.detailItemThumb}
                contentFit="cover"
              />
              <View style={styles.detailItemInfo}>
                <Text style={styles.detailItemName} numberOfLines={2}>
                  {item.name}
                </Text>
                {Boolean(item.variantDisplay) && (
                  <Text style={styles.detailItemVariantBadge}>{item.variantDisplay}</Text>
                )}
                <Text style={styles.detailItemQty}>Số lượng: x{item.quantity || 1}</Text>
              </View>
              <Text style={styles.detailItemPrice}>
                {formatDisplayPrice((item.price || 0) * (item.quantity || 1))}
              </Text>
            </View>
          ))}

          {/* Thông tin nhận hàng */}
          <Text style={[styles.detailSectionTitle, { marginTop: 18 }]}>THÔNG TIN NHẬN HÀNG</Text>
          <View style={styles.detailAddressBox}>
            <Text style={styles.detailCustomerName}>
              {selectedOrderDetail?.shippingAddress?.fullName ||
                selectedOrderDetail?.customerName ||
                'Khách hàng Tiệm Nhà Gốm'}
            </Text>
            <Text style={styles.detailCustomerPhone}>
              {selectedOrderDetail?.shippingAddress?.phone || '0777709662'}
            </Text>
            <Text style={styles.detailCustomerAddress}>
              {selectedOrderDetail?.shippingAddress?.address || 'Tại showroom Tiệm Nhà Gốm (37 Nguyễn Duy)'}
            </Text>
          </View>

          {/* Tóm tắt thanh toán */}
          <Text style={[styles.detailSectionTitle, { marginTop: 18 }]}>CHI TIẾT THANH TOÁN</Text>
          <View style={styles.detailSummaryBox}>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Tạm tính:</Text>
              <Text style={styles.summaryLineVal}>
                {formatDisplayPrice(selectedOrderDetail?.subtotal || selectedOrderDetail?.totalAmount)}
              </Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Phí giao hàng:</Text>
              <Text style={styles.summaryLineVal}>
                {selectedOrderDetail?.shippingFee ? formatDisplayPrice(selectedOrderDetail.shippingFee) : 'Miễn phí'}
              </Text>
            </View>
            <View style={[styles.summaryLine, styles.totalLineBorder]}>
              <Text style={styles.totalLineLabel}>Tổng cộng:</Text>
              <Text style={styles.totalLineVal}>
                {formatDisplayPrice(selectedOrderDetail?.totalAmount)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Nút đặt lại món quen */}
        <ScalePressable
          style={styles.detailReorderBtn}
          activeScale={0.96}
          onPress={() => {
            setSelectedOrderDetail(null);
            handleReorder(selectedOrderDetail);
          }}
        >
          <Text style={styles.detailReorderBtnText}>Đặt lại đơn hàng này</Text>
        </ScalePressable>
      </AnimatedBottomSheetModal>
    </Animated.View>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── HEADER ──
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 0, // Tuyệt đối không có vạch kẻ đáy
  },
  navHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  headerRightBtn: {
    padding: 6,
    marginRight: Platform.OS === 'ios' ? 0 : 4,
  },

  // ── KHỐI FILTER CỐ ĐỊNH ──
  fixedFilterContainer: {
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    paddingBottom: 6,
    zIndex: 40,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  tabPill: {
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFDF9',
    borderWidth: 1.2,
    borderColor: '#9C7156',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.05,
    shadowRadius: 4,
    elevation: isDark ? 0 : 1,
  },
  tabPillInactive: {
    backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : BRAND.tabInactiveBg,
    borderWidth: isDark ? 0 : 0,
  },
  tabText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
  },
  tabTextActive: {
    color: isDark ? '#E8CCB2' : Colors.textPrimary,
    fontWeight: '700',
  },
  tabTextInactive: {
    color: Colors.textMuted || BRAND.tabInactiveText,
    fontWeight: '600',
  },

  // Dropdowns lọc phụ
  subFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 14,
    marginBottom: 8,
  },
  filterDropdownTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  filterDropdownTouchActive: {
    opacity: 1,
  },
  filterDropdownText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  filterDropdownTextActive: {
    color: '#9C7156',
    fontWeight: '700',
  },

  // ── DANH SÁCH CUỘN ──
  scrollListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  loadingWrap: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textMuted,
  },

  // ── EMPTY STATE ──
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 70,
    paddingHorizontal: 24,
  },
  boxIllustrationWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  boxAura: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#F3ECE3',
    opacity: 0.6,
  },
  boxArtIcon: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxBubbleBadge: {
    position: 'absolute',
    top: 4,
    right: -4,
  },
  boxSparkleTop: {
    position: 'absolute',
    top: -10,
    left: 20,
  },
  emptyMainText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyExploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.primary,
    paddingHorizontal: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0 : 0.16,
    shadowRadius: 8,
    elevation: isDark ? 0 : 3,
  },
  emptyExploreBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── THẺ ĐƠN HÀNG CHUẨN ẢNH MẪU ──
  ordersListWrap: {
    gap: 14,
    marginTop: 4,
  },
  orderCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 16,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },

  // Hàng trên cùng của thẻ
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTopLeft: {
    flex: 1,
    marginRight: 10,
  },
  orderMethodDateText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  orderCodeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '700',
    color: isDark ? '#E8CCB2' : '#5C544D',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: isDark ? 0 : 1,
  },
  statusBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
  },

  // Tiêu đề cửa hàng
  storeNameTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },

  // Danh sách thumbnails ảnh sản phẩm
  thumbnailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  thumbnailWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    overflow: 'hidden',
    position: 'relative',
  },
  productThumbnail: {
    width: '100%',
    height: '100%',
  },
  extraCountOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(43, 41, 40, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraCountText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Dòng tóm tắt tên món & giá tiền
  summaryAndPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryItemsText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    marginRight: 12,
  },
  totalPriceBoldText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Hàng nút hành động dưới đáy thẻ
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewBtn: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 16,
    borderWidth: isDark ? 0 : 1.2,
    borderColor: isDark ? 'transparent' : BRAND.warmBeige,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : BRAND.cardWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  reorderBtn: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 18,
    borderWidth: 1.2,
    borderColor: BRAND.primary,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFDF9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: isDark ? '#E8CCB2' : BRAND.primary,
  },
  trackOrderBtn: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 18,
    backgroundColor: BRAND.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.12,
    shadowRadius: 4,
    elevation: isDark ? 0 : 2,
  },
  trackOrderBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── BOTTOM SHEET MODALS ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? '#444444' : '#DDD5CC',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F4EFEA',
  },
  sheetOptionRowActive: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FCFAF7',
  },
  sheetOptionText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    color: Colors.textPrimary,
  },
  sheetOptionTextActive: {
    fontWeight: '700',
    color: BRAND.primary,
  },

  // ── MODAL TRA CỨU ĐƠN ──
  lookupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  lookupModalCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 24,
    padding: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0 : 0.16,
    shadowRadius: 12,
    elevation: isDark ? 0 : 6,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  lookupIntroText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: isDark ? '#9E968D' : BRAND.mutedText,
    marginTop: 10,
    marginBottom: 14,
    lineHeight: 18,
  },
  lookupInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  lookupInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: Colors.textPrimary,
  },
  lookupSubmitBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0 : 0.15,
    shadowRadius: 6,
    elevation: isDark ? 0 : 3,
  },
  lookupSubmitBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noLookupText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: isDark ? '#9E968D' : BRAND.mutedText,
    textAlign: 'center',
  },
  foundLookupText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: BRAND.primary,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── MODAL ĐÁNH GIÁ ──
  ratingSheetCard: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  ratingSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: isDark ? '#9E968D' : BRAND.mutedText,
    marginTop: 6,
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
  },
  tagPillActive: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFDF9',
    borderColor: BRAND.primary,
  },
  tagText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: isDark ? '#9E968D' : BRAND.mutedText,
  },
  tagTextActive: {
    color: BRAND.primary,
    fontWeight: '700',
  },
  reviewTextInput: {
    height: 72,
    borderRadius: 16,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  submitReviewBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0 : 0.16,
    shadowRadius: 8,
    elevation: isDark ? 0 : 3,
  },
  submitReviewBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── MODAL CHI TIẾT ĐƠN ──
  detailSheetCard: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  detailCodeSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.primary,
    marginTop: 2,
  },
  detailMetaBox: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderRadius: 16,
    padding: 12,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    gap: 8,
    marginBottom: 14,
  },
  detailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailMetaLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: isDark ? '#9E968D' : BRAND.mutedText,
  },
  detailMetaVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailSectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#9E968D' : '#8A847C',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F5EFE9',
  },
  detailItemThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
  },
  detailItemInfo: {
    flex: 1,
  },
  detailItemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  detailItemVariantBadge: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: BRAND.primary,
    marginTop: 2,
  },
  detailItemQty: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: isDark ? '#9E968D' : BRAND.mutedText,
    marginTop: 2,
  },
  detailItemPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailAddressBox: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderRadius: 14,
    padding: 12,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    gap: 3,
  },
  detailCustomerName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailCustomerPhone: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: isDark ? '#9E968D' : BRAND.mutedText,
  },
  detailCustomerAddress: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textPrimary,
    lineHeight: 17,
  },
  detailSummaryBox: {
    backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
    borderRadius: 14,
    padding: 12,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    gap: 6,
    marginBottom: 16,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLineLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: isDark ? '#9E968D' : BRAND.mutedText,
  },
  summaryLineVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  totalLineBorder: {
    borderTopWidth: 1,
    borderTopColor: isDark ? (Colors.divider || '#2A2A2A') : '#E8E1D8',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLineLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  totalLineVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.primary,
  },
  detailReorderBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0 : 0.16,
    shadowRadius: 8,
    elevation: isDark ? 0 : 3,
  },
  detailReorderBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
