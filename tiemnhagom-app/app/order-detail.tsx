// app/order-detail.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Animated,
  Clipboard,
  Alert,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { ScalePressable } from '../src/components/ScalePressable';
import { GlazeFluidCard } from '../src/components/GlazeFluidCard';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { BlurButton } from '../src/components/BlurButton';
import { useAuth } from '../src/context/AuthContext';
import { useCart } from '../src/context/CartContext';
import { useRealtimeData } from '../src/context/RealtimeDataContext';
import { useSettings } from '../src/context/SettingsContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { useThemeColor } from '../src/constants/theme';

// Cấu hình hạng thành viên đồng bộ chuẩn xác từ Profile & Hệ thống Tiệm Nhà Gốm
const MEMBERSHIP_TIERS = [
  {
    id: 'null',
    nameKey: 'tierGomMoc',
    defaultName: 'Gốm Mộc',
    min: 0,
    gradientColors: ['#543824', '#3E2718', '#28170D'] as [string, string, ...string[]],
    watercolorBlobs: ['#8A5A2B', '#A16207', '#6B4226', '#B45309'],
  },
  {
    id: 'new',
    nameKey: 'tierGomNung',
    defaultName: 'Gốm Nung',
    min: 1000000,
    gradientColors: ['#A31D1D', '#821414', '#520B0B'] as [string, string, ...string[]],
    watercolorBlobs: ['#DC2626', '#E11D48', '#D97706', '#991B1B'],
  },
  {
    id: 'mem',
    nameKey: 'tierGomMen',
    defaultName: 'Gốm Men',
    min: 5000000,
    gradientColors: ['#B45309', '#92400E', '#5C2D07'] as [string, string, ...string[]],
    watercolorBlobs: ['#F59E0B', '#D97706', '#B45309', '#CA8A04'],
  },
  {
    id: 'vip',
    nameKey: 'tierGomDocBan',
    defaultName: 'Gốm Độc Bản',
    min: 10000000,
    gradientColors: ['#27272A', '#18181B', '#09090B'] as [string, string, ...string[]],
    watercolorBlobs: ['#52525B', '#3F3F46', '#71717A', '#3F3F46'],
  },
];

// Bảng màu chuẩn từ GEMINI.md & Brand Guidelines
const BRAND = {
  primary: '#9C7156', // Nâu Đất Nung / Gốm Mộc
  textPrimary: '#2B2928', // Nâu Đen Than Chì
  bgCream: '#FAF8F5', // Kem Gốm Mộc Sáng
  warmBeige: '#E8CCB2', // Men Gốm Be Ấm
  cardWhite: '#FFFFFF',
  mutedText: '#6E665D',
  borderSoft: '#E8E1D8',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
};

// Khôi phục URL Firebase Storage nếu bị giải mã nhầm qua URL router parameters
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

      // Nếu pathPart chứa dấu '/', các ký tự phân cách thư mục bị giải mã nhầm -> mã hóa lại
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

// Kiểm tra URL ảnh có phải là placeholder không hợp lệ không
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

// Fallback ảnh đồ gốm Tiệm Nhà Gốm
const FALLBACK_CERAMIC_IMAGE =
  'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d';

// Hàm giải quyết ảnh chuẩn xác cho từng món
const resolveItemImage = (item: any, productsCatalog: any[] = []): string => {
  if (!item) return FALLBACK_CERAMIC_IMAGE;

  // 1. Ảnh trực tiếp của item trong đơn (item.image, item.imageUrl, item.resolvedImage)
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

  // 2. Ảnh từ variant lưu trực tiếp trên item
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

    // 3.1 Biến thể Họa Tiết (patternVariants)
    if (Array.isArray(catalogProduct.patternVariants)) {
      const matchPattern = catalogProduct.patternVariants.find(
        (v: any) => v && v.name && v.name.trim().toLowerCase() === cleanVarName
      );
      if (matchPattern) {
        const vImg = matchPattern.imageUrl || matchPattern.thumbUrl;
        if (!isInvalidImage(vImg)) return sanitizeFirebaseStorageUrl(vImg);
      }
    }

    // 3.2 Biến thể Màu Sắc (colorVariants)
    if (Array.isArray(catalogProduct.colorVariants)) {
      const matchColor = catalogProduct.colorVariants.find(
        (v: any) => v && v.name && v.name.trim().toLowerCase() === cleanVarName
      );
      if (matchColor) {
        const vImg = matchColor.imageUrl || matchColor.thumbUrl;
        if (!isInvalidImage(vImg)) return sanitizeFirebaseStorageUrl(vImg);
      }
    }

    // 3.3 Biến thể Combo (comboVariants)
    if (Array.isArray(catalogProduct.comboVariants)) {
      const matchCombo = catalogProduct.comboVariants.find(
        (v: any) => v && v.name && v.name.trim().toLowerCase() === cleanVarName
      );
      if (matchCombo) {
        const vImg = matchCombo.imageUrl || matchCombo.thumbUrl;
        if (!isInvalidImage(vImg)) return sanitizeFirebaseStorageUrl(vImg);
      }
    }
  }

  // 4. Ảnh sản phẩm từ catalog
  if (catalogProduct) {
    if (catalogProduct.imageUrl && !isInvalidImage(catalogProduct.imageUrl)) {
      return sanitizeFirebaseStorageUrl(catalogProduct.imageUrl);
    }
    if (Array.isArray(catalogProduct.images) && catalogProduct.images.length > 0) {
      const validFirst = catalogProduct.images.find((img: string) => !isInvalidImage(img));
      if (validFirst) return sanitizeFirebaseStorageUrl(validFirst);
    }

    const allVariants = [
      ...(catalogProduct.patternVariants || []),
      ...(catalogProduct.colorVariants || []),
      ...(catalogProduct.comboVariants || []),
    ];
    const firstVarWithImg = allVariants.find(
      (v: any) => v && (v.imageUrl || v.thumbUrl) && !isInvalidImage(v.imageUrl || v.thumbUrl)
    );
    if (firstVarWithImg) {
      return sanitizeFirebaseStorageUrl(firstVarWithImg.imageUrl || firstVarWithImg.thumbUrl);
    }
  }

  // 5. Fallback ảnh gốm Tiệm Nhà Gốm
  return FALLBACK_CERAMIC_IMAGE;
};

// Lấy nhãn biến thể hiển thị đồng bộ (Họa tiết, Màu sắc, Combo)
const getVariantDisplayLabel = (item: any): string => {
  if (item.variantDisplay) return item.variantDisplay;
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

// Định dạng giá tiền dạng "75.000đ"
const formatDisplayPrice = (amount?: number | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
};

// Định dạng giờ và ngày "12:15 02/10/2026"
const formatFullDateTime = (dateInput: any) => {
  if (!dateInput) return '12:15 02/10/2026';
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
      return '12:15 02/10/2026';
    }
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return '12:15 02/10/2026';
  }
};

// Định dạng ngày giờ ngắn "02/10, 13:00"
const formatShortPickupTime = (dateInput: any) => {
  if (!dateInput) return '02/10, 13:00';
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
      return '02/10, 13:00';
    }
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}, ${hours}:${minutes}`;
  } catch {
    return '02/10, 13:00';
  }
};

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; orderData?: string }>();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const { addToCart } = useCart();
  const { products: productsCatalog } = useRealtimeData();
  const { t } = useSettings();

  // Dữ liệu đơn hàng tải từ Firestore (nếu có orderId)
  const [firestoreOrder, setFirestoreOrder] = useState<any | null>(null);

  useEffect(() => {
    const rawId = params.orderId;
    if (!rawId) return;

    let isMounted = true;
    getDoc(doc(db, 'orders', rawId))
      .then((snap) => {
        if (isMounted && snap.exists()) {
          setFirestoreOrder({ id: snap.id, ...snap.data() });
        }
      })
      .catch((err) => {
        console.warn('Lỗi đọc đơn từ Firestore:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [params.orderId]);

  // Đọc dữ liệu đơn hàng từ params hoặc Firestore
  const order = useMemo(() => {
    if (firestoreOrder) {
      return firestoreOrder;
    }
    if (params.orderData) {
      try {
        return JSON.parse(params.orderData);
      } catch (e) {
        console.warn('Lỗi phân tích cú pháp orderData:', e);
      }
    }
    // Dữ liệu mẫu chuẩn nếu không có params
    return {
      id: '1227007156578',
      orderCode: '1227007156578',
      orderMethod: 'Tự đến lấy',
      orderDate: new Date('2026-10-02T12:15:00'),
      status: 'Đã hoàn thành',
      statusRaw: 'Đã hoàn thành',
      storeName: 'Tiệm Nhà Gốm - 740A Nguyễn Kiệm',
      storeAddress: '740A Nguyễn Kiệm, P4, Phú Nhuận, Thành phố Hồ Chí Minh, Vietnam',
      expectedTime: '15 phút',
      items: [
        {
          id: 'pot_matcha_1',
          name: 'Cốc Gốm Men Matcha Dừa Mây',
          variantDisplay: 'Họa tiết: Gấu Nâu',
          quantity: 1,
          price: 75000,
          resolvedImage:
            'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1784352576732_L%C3%B3t%20ly%20(1920%20x%201080%20px)%20(2).webp?alt=media&token=07e7c680-ebf7-48ea-8ef0-6313124ab082',
        },
        {
          id: 'pot_banh_mi_que',
          name: 'Khay Đỡ Đũa Gốm Mộc Nghệ Thuật',
          variantDisplay: '',
          quantity: 1,
          price: 19000,
          resolvedImage:
            'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1788589788688_TNGHANDMADE.webp?alt=media&token=9890f8cf-a2e0-436b-88b8-98ed7b894fb0',
        },
      ],
      couponCode: 'GIẢM 15K CHO HÓA ĐƠN TỪ 89K',
      discountAmount: 15000,
      subtotal: 94000,
      shippingFee: 0,
      totalAmount: 79000,
      paymentMethod: 'MoMo',
    };
  }, [firestoreOrder, params.orderData]);

  // Modals đánh giá
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [starCount, setStarCount] = useState(5);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewTags, setReviewTags] = useState<string[]>(['Men gốm tinh xảo', 'Đóng gói kỹ lưỡng']);

  // Hiệu ứng cuộn
  const [scrollY, setScrollY] = useState(0);
  const blurProgress = Math.min(1, Math.max(0, scrollY / 60));
  const { pageStyle } = usePageAnimation({ itemCount: 8, delay: 35 });

  // Sao chép mã đơn hàng
  const handleCopyCode = () => {
    const code = order.orderCode || order.orderId || order.id || '';
    if (code) {
      Clipboard.setString(code);
      Alert.alert(t('copyCodeSuccess') || 'Đã sao chép', `#${code}`);
    }
  };

  // Đặt lại đơn này (Reorder)
  const handleReorder = () => {
    if (!order.items || order.items.length === 0) {
      Alert.alert(t('notification') || 'Thông báo', 'Đơn hàng này không có danh sách sản phẩm để đặt lại.');
      return;
    }

    let count = 0;
    order.items.forEach((item: any) => {
      const resolvedImg = resolveItemImage(item, productsCatalog);
      const productObj: any = {
        id: item.productId || item.id,
        name: item.name,
        price: item.price,
        stock: 50,
        imageUrl: resolvedImg,
      };
      addToCart(productObj, item.quantity || 1, item.variant);
      count += item.quantity || 1;
    });

    Alert.alert(
      t('reorderConfirmTitle') || 'Đã thêm vào giỏ hàng',
      t('reorderConfirmDesc') || 'Đã đưa các sản phẩm vào giỏ hàng của bạn. Bạn có muốn đến giỏ hàng ngay không?',
      [
        { text: t('continueBrowsingAction') || 'Tiếp tục xem', style: 'cancel' },
        { text: t('goToCartAction') || 'Đến Giỏ Hàng', onPress: () => router.push('/(tabs)/cart') },
      ]
    );
  };

  // Gửi đánh giá
  const handleSubmitRating = () => {
    setRatingModalVisible(false);
    Alert.alert(
      'Cảm ơn bạn! ✨',
      `Đánh giá ${starCount} sao cho đơn #${order.orderCode || order.id} đã được gửi thành công!`
    );
  };

  // Liên hệ hotline hỗ trợ
  const handleContactSupport = () => {
    Alert.alert('Hỗ trợ đơn hàng', 'Bạn muốn liên hệ Tiệm Nhà Gốm qua hình thức nào?', [
      { text: 'Gọi Hotline (0777.709.662)', onPress: () => Linking.openURL('tel:0777709662') },
      { text: 'Nhắn tin Fanpage', onPress: () => Linking.openURL('https://m.me/tiemnhagom') },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  // Xác định trạng thái đơn
  const stText = (order.statusRaw || order.status || 'Hoàn tất').toLowerCase();
  const isCancelled = stText.includes('hủy') || stText.includes('cancel');
  const isShipping = stText.includes('giao') || stText.includes('ship');
  const isCompleted = !isCancelled && (stText.includes('hoàn') || stText.includes('complete') || stText.includes('thành công') || stText.includes('nhận'));

  // Hình thức nhận hàng
  const isPickup = order.orderMethod === 'Tự đến lấy' || order.shippingMethod === 'pickup';
  const isInStore = order.orderMethod === 'Mua tại cửa hàng' || String(order.orderCode || '').toUpperCase().startsWith('POS');

  // Tính điểm nhận được (10.000đ = 1 điểm)
  const earnedPoints = Math.floor((order.totalAmount || 0) / 10000);

  // Xác định đúng hạng thành viên của user
  const userTierConfig = useMemo(() => {
    const rawTier = (userProfile?.tier || '').toLowerCase();
    const totalSpent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);

    // 1. Khớp theo tier ID trực tiếp nếu có
    if (rawTier === 'vip' || rawTier === 'diamond' || rawTier.includes('độc bản')) {
      return MEMBERSHIP_TIERS[3];
    }
    if (rawTier === 'mem' || rawTier === 'gold' || rawTier.includes('men')) {
      return MEMBERSHIP_TIERS[2];
    }
    if (rawTier === 'new' || rawTier === 'silver' || rawTier.includes('nung')) {
      return MEMBERSHIP_TIERS[1];
    }
    if (rawTier === 'null' || rawTier === 'moc' || rawTier.includes('mộc')) {
      return MEMBERSHIP_TIERS[0];
    }

    // 2. Tự động tính toán theo mốc chi tiêu giống ProfileScreen
    for (let i = MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
      if (totalSpent >= MEMBERSHIP_TIERS[i].min) {
        return MEMBERSHIP_TIERS[i];
      }
    }
    return MEMBERSHIP_TIERS[0];
  }, [userProfile]);

  const tierDisplayName = t(userTierConfig.nameKey) || userTierConfig.defaultName;

  // Xác định text voucher đang áp dụng
  const appliedVoucherText = useMemo(() => {
    if (order.couponCode && String(order.couponCode).trim() !== '') {
      return String(order.couponCode).trim();
    }
    if (order.discountCode && String(order.discountCode).trim() !== '') {
      return String(order.discountCode).trim();
    }
    if (order.voucherCode && String(order.voucherCode).trim() !== '') {
      return String(order.voucherCode).trim();
    }
    if (order.discountAmount && Number(order.discountAmount) > 0) {
      return `GIẢM ${formatDisplayPrice(order.discountAmount).toUpperCase()}`;
    }
    return t('noVoucherApplied') || 'Không áp dụng ưu đãi';
  }, [order, t]);

  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = useMemo(() => getStyles(Colors, isDark), [Colors, isDark]);

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'light-content'} backgroundColor="transparent" translucent />

      {/* ── HEADER CỐ ĐỊNH TRÊN CÙNG (KHÔNG VẠCH KẺ ĐÁY, PHỦ TRÊN HERO BANNER) ── */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        {blurProgress > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: blurProgress }]} pointerEvents="none">
            <BlurView
              intensity={Platform.OS === 'ios' ? 80 : 70}
              tint="dark"
              blurMethod="none"
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(35, 27, 21, 0.45)' }]} />
          </View>
        )}

        {/* Nút quay lại tròn chuẩn quy cách BlurButton */}
        <BlurButton
          onPress={() => router.back()}
          accessibilityLabel={t('back') || 'Quay lại'}
          style={{ width: 40, height: 40, borderRadius: 20 }}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" style={{ marginLeft: -1 }} />
        </BlurButton>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitleText}>{t('orderDetailTitle') || 'Đơn hàng'}</Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* ================= 1. HERO BANNER FULL TRÊN CÙNG (TRÀN QUA HEADER) ================= */}
        <View style={styles.heroBannerWrap}>
          <GlazeFluidCard
            gradientColors={userTierConfig.gradientColors}
            blobs={userTierConfig.watercolorBlobs}
            borderRadius={0}
            style={[styles.heroFluidBackground, { paddingTop: insets.top + 56 }]}
          >
            <View style={styles.heroContentRow}>
              {/* Bên trái: Hạng hội viên */}
              <View style={styles.heroLeft}>
                <Text style={styles.heroTierSub}>{t('tierPrefix') || 'Hạng'}</Text>
                <Text style={styles.heroTierTitle}>{tierDisplayName}</Text>
              </View>

              {/* Bên phải: Logo Tiệm Nhà Gốm */}
              <View style={styles.heroRight}>
                <Image
                  source={require('../assets/images/logongang.webp')}
                  style={styles.heroBrandLogo}
                  contentFit="contain"
                  tintColor="#FFFFFF"
                />
              </View>
            </View>
          </GlazeFluidCard>
        </View>

        {/* ================= 2. THẺ 1: TRẠNG THÁI & MÃ ĐƠN HÀNG (OVERLAPPING CARD) ================= */}
        <View style={styles.overlapCardContainer}>
          <View style={styles.orderStatusCard}>
            {/* Hàng 1: Mã đơn & Ngày giờ đặt */}
            <View style={styles.statusCardTopRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.statusCardCodeLabel}>{t('orderCode') || 'Mã đơn hàng'}</Text>
                <Text style={styles.statusCardDateSub}>
                  {t('orderDateLabel') || 'Thời gian đặt hàng'}: {formatFullDateTime(order.orderDate)}
                </Text>
              </View>

              {/* Mã đơn và nút copy */}
              <TouchableOpacity
                style={styles.copyCodeTouch}
                activeOpacity={0.75}
                onPress={handleCopyCode}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.statusCardCodeText} numberOfLines={1}>
                  {order.orderCode || order.orderId || order.id}
                </Text>
                <Ionicons name="copy-outline" size={17} color={BRAND.textPrimary} style={{ marginLeft: 5 }} />
              </TouchableOpacity>
            </View>

            {/* Hàng 2: Tên trạng thái to rõ */}
            <Text style={[styles.statusStateTitle, isCancelled && { color: BRAND.danger }]}>
              {isCancelled
                ? t('statusCancelledTitle') || 'Đã hủy'
                : isCompleted
                ? t('statusCompletedTitle') || 'Hoàn tất'
                : isShipping
                ? t('statusShippingTitle') || 'Đang giao hàng'
                : t('statusProcessingTitle') || 'Đang xử lý'}
            </Text>

            {/* Hàng 3: Timeline tiến trình 3 bước */}
            <View style={styles.timelineRow}>
              {/* Bước 1: Tiếp nhận */}
              <View style={styles.timelineStepWrap}>
                <View style={[styles.timelineIconCircle, styles.timelineIconCircleActive]}>
                  <Ionicons name="receipt" size={16} color="#FFFFFF" />
                </View>
              </View>

              {/* Vạch nối 1 */}
              <View style={[styles.timelineTrackLine, (isShipping || isCompleted) && styles.timelineTrackLineActive]} />

              {/* Bước 2: Chuẩn bị / Đóng gói */}
              <View style={styles.timelineStepWrap}>
                <View style={[styles.timelineIconCircle, (isShipping || isCompleted) && styles.timelineIconCircleActive]}>
                  <Ionicons name="cube" size={16} color={isShipping || isCompleted ? '#FFFFFF' : '#A3998F'} />
                </View>
              </View>

              {/* Vạch nối 2 */}
              <View style={[styles.timelineTrackLine, isCompleted && styles.timelineTrackLineActive]} />

              {/* Bước 3: Hoàn tất */}
              <View style={styles.timelineStepWrap}>
                <View style={[styles.timelineIconCircle, isCompleted && styles.timelineIconCircleActive]}>
                  <Ionicons name="checkmark-circle" size={18} color={isCompleted ? '#FFFFFF' : '#A3998F'} />
                </View>
              </View>
            </View>

            {/* Hàng 4: Nút Đánh giá & Đặt lại đơn này */}
            <View style={styles.statusActionsRow}>
              <TouchableOpacity
                style={styles.reviewPillBtn}
                activeOpacity={0.8}
                onPress={() => setRatingModalVisible(true)}
              >
                <Text style={styles.reviewPillBtnText}>{t('reviewAction') || 'Đánh giá'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reorderPillBtn}
                activeOpacity={0.8}
                onPress={handleReorder}
              >
                <Text style={styles.reorderPillBtnText}>{t('reorderAction') || 'Đặt lại đơn này'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ================= 3. THẺ 2: HÌNH THỨC NHẬN HÀNG ================= */}
        <View style={styles.sectionBlock}>
          {/* Tiêu đề phân khu có icon */}
          <View style={styles.sectionHeaderRow}>
            <Ionicons
              name={isPickup ? 'storefront-outline' : isInStore ? 'bag-handle-outline' : 'bicycle-outline'}
              size={20}
              color={BRAND.textPrimary}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.sectionHeaderTitle}>
              {isPickup
                ? t('pickupPurchase') || 'Tự đến lấy'
                : isInStore
                ? t('inStorePurchase') || 'Mua tại cửa hàng'
                : t('deliveryPurchase') || 'Giao tận nơi'}
            </Text>
          </View>

          {/* Card thông tin chi nhánh */}
          <View style={styles.infoCard}>
            <Text style={styles.storeBranchNameTitle}>
              {order.storeName || (isPickup ? 'Tiệm Nhà Gốm - 740A Nguyễn Kiệm' : 'Tiệm Nhà Gốm - 37 Nguyễn Duy')}
            </Text>

            <View style={styles.storeAddressRow}>
              <Ionicons name="location-outline" size={16} color={BRAND.mutedText} style={{ marginRight: 4, marginTop: 2 }} />
              <Text style={styles.storeAddressText}>
                {order.storeAddress ||
                  order.shippingAddress?.address ||
                  '37 Nguyễn Duy, Phường Gia Định, Bình Thạnh, TP. Hồ Chí Minh, Vietnam'}
              </Text>
            </View>

            <Text style={styles.expectedTimeTitle}>{t('expectedReceiveTitle') || 'Dự kiến nhận món'}</Text>
            <View style={styles.expectedTimeRow}>
              <Ionicons name="time-outline" size={16} color={BRAND.textPrimary} style={{ marginRight: 5 }} />
              <Text style={styles.expectedTimeVal}>
                {order.expectedTime || (isPickup ? `15 ${t('minutesUnit') || 'phút'}` : `2 - 3 ${t('businessDaysUnit') || 'ngày làm việc'}`)}
              </Text>
            </View>
          </View>
        </View>

        {/* ================= 4. THẺ 3: THỜI GIAN ĐẾN LẤY HÀNG / GIAO HÀNG ================= */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeaderTitleNoIcon}>
            {isPickup ? t('pickupTimeLabel') || 'Thời gian đến lấy hàng' : t('orderDateLabel') || 'Thời gian đặt hàng'}
          </Text>

          <View style={styles.timePillCard}>
            <Ionicons name="time-outline" size={18} color={BRAND.textPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.timePillText}>{formatShortPickupTime(order.orderDate)}</Text>
          </View>
        </View>

        {/* ================= 5. THẺ 4: DANH SÁCH MÓN ĐÃ ĐẶT ================= */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeaderTitleNoIcon}>{t('itemsSectionTitle') || 'Món'}</Text>

          <View style={styles.itemsListContainer}>
            {order.items?.map((item: any, idx: number) => {
              const itemImg = resolveItemImage(item, productsCatalog);

              return (
                <View key={item.id || idx} style={styles.itemDetailCard}>
                  {/* Thumbnail ảnh sản phẩm / biến thể chuẩn xác 100% */}
                  <Image
                    source={{ uri: itemImg }}
                    style={styles.itemCardThumb}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="disk"
                    recyclingKey={itemImg}
                  />

                  {/* Chi tiết tên, phân loại, số lượng */}
                  <View style={styles.itemCardCenter}>
                    <Text style={styles.itemCardName} numberOfLines={2}>
                      {item.name}
                    </Text>

                    {Boolean(getVariantDisplayLabel(item)) && (
                      <Text style={styles.itemCardVariant}>
                        {getVariantDisplayLabel(item)}
                      </Text>
                    )}

                    <Text style={styles.itemCardQuantity}>x {item.quantity || 1}</Text>
                  </View>

                  {/* Giá tiền của món */}
                  <Text style={styles.itemCardPrice}>
                    {formatDisplayPrice((item.price || 0) * (item.quantity || 1))}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ================= 6. THẺ 5: ƯU ĐÃI ================= */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeaderTitleNoIcon}>{t('dealsSectionTitle') || 'Ưu đãi'}</Text>

          <View style={styles.voucherCard}>
            <Ionicons name="gift-outline" size={22} color={BRAND.textPrimary} style={{ marginRight: 10 }} />
            <Text style={styles.voucherCodeText} numberOfLines={1}>
              {appliedVoucherText}
            </Text>
          </View>
        </View>

        {/* ================= 7. THẺ 6: PHƯƠNG THỨC THANH TOÁN ================= */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeaderTitleNoIcon}>{t('paymentMethodSectionTitle') || 'Phương thức thanh toán'}</Text>

          <View style={styles.paymentMethodCard}>
            {/* Icon logo MoMo hoặc ví/thẻ */}
            <View style={styles.paymentIconWrap}>
              <Ionicons
                name={
                  String(order.paymentMethod).toLowerCase().includes('momo')
                    ? 'wallet-outline'
                    : String(order.paymentMethod).toLowerCase().includes('chuyển khoản')
                    ? 'qr-code-outline'
                    : 'cash-outline'
                }
                size={22}
                color={BRAND.textPrimary}
              />
            </View>
            <Text style={styles.paymentMethodText}>
              {order.paymentMethod || 'MoMo'}
            </Text>
          </View>
        </View>

        {/* ================= 8. THẺ 7: CHI TIẾT THANH TOÁN & ĐIỂM THƯỞNG ================= */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeaderTitleNoIcon}>{t('paymentDetailsSectionTitle') || 'Chi tiết thanh toán'}</Text>

          <View style={styles.billBreakdownWrap}>
            {/* Tạm tính */}
            <View style={styles.billLineRow}>
              <Text style={styles.billLineLabel}>{t('subtotalLabel') || 'Tạm tính'}</Text>
              <Text style={styles.billLineVal}>
                {formatDisplayPrice(order.subtotal || order.totalAmount + (order.discountAmount || 0))}
              </Text>
            </View>

            {/* Ưu đãi (nếu có) */}
            {Boolean(order.discountAmount) && (
              <View style={styles.billLineRow}>
                <Text style={styles.billLineLabel}>{t('dealsSectionTitle') || 'Ưu đãi'}</Text>
                <Text style={[styles.billLineVal, styles.discountVal]}>
                  -{formatDisplayPrice(order.discountAmount)}
                </Text>
              </View>
            )}

            {/* Phí giao hàng (nếu có) */}
            {Boolean(order.shippingFee) && (
              <View style={styles.billLineRow}>
                <Text style={styles.billLineLabel}>{t('shippingFeeLabel') || 'Phí giao hàng'}</Text>
                <Text style={styles.billLineVal}>
                  {formatDisplayPrice(order.shippingFee)}
                </Text>
              </View>
            )}

            {/* Tổng tiền thanh toán to đậm */}
            <View style={styles.totalPaymentRow}>
              <View>
                <Text style={styles.totalPaymentLabel}>{t('totalPaymentLabel') || 'Tổng tiền thanh toán'}</Text>
                <Text style={styles.vatSubtext}>{t('vatIncludedNotice') || '(Giá đã bao gồm VAT)'}</Text>
              </View>
              <Text style={styles.totalPaymentAmount}>
                {formatDisplayPrice(order.totalAmount)}
              </Text>
            </View>

            {/* Dòng tích điểm gốm */}
            {!isCancelled && earnedPoints > 0 && (
              <View style={styles.rewardPointsLine}>
                <Ionicons
                  name={isCompleted ? "checkmark-circle" : "time-outline"}
                  size={17}
                  color={BRAND.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.rewardPointsText}>
                  {isCompleted ? (
                    <>
                      {t('orderCompletedPointsAwarded') || 'Đơn hàng đã hoàn tất, bạn đã được tích lũy'}{' '}
                      <Text style={styles.rewardPointsBold}>
                        +{earnedPoints} {t('rewardPointsUnit') || 'Điểm gốm'}
                      </Text>!
                    </>
                  ) : (
                    <>
                      {t('rewardPointsNotice') || 'Bạn sẽ nhận được'}{' '}
                      <Text style={styles.rewardPointsBold}>
                        +{earnedPoints} {t('rewardPointsUnit') || 'Điểm gốm'}
                      </Text>{' '}
                      {t('rewardPointsSuffix') || 'sau khi đơn hàng được giao và hoàn tất thành công.'}
                    </>
                  )}
                </Text>
              </View>
            )}

            {/* Link hỗ trợ */}
            <TouchableOpacity
              style={styles.supportLinkTouch}
              activeOpacity={0.7}
              onPress={handleContactSupport}
            >
              <Text style={styles.supportLinkText}>{t('needSupportPrompt') || 'Bạn cần hỗ trợ?'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── MODAL ĐÁNH GIÁ ĐƠN HÀNG (5 SAO & NHẬN XÉT) ── */}
      <AnimatedBottomSheetModal
        visible={ratingModalVisible}
        onClose={() => setRatingModalVisible(false)}
        contentStyle={styles.ratingSheetCard}
        avoidKeyboard
      >
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalHeaderTitle}>{t('reviewAction') || 'Đánh giá đơn hàng'}</Text>
          <ScalePressable onPress={() => setRatingModalVisible(false)} activeScale={0.88}>
            <Ionicons name="close" size={22} color={BRAND.textPrimary} />
          </ScalePressable>
        </View>

        <Text style={styles.ratingSubtitle}>
          Bạn cảm thấy thế nào về đơn hàng #{order.orderCode || order.id}?
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

        {/* Tags cảm nhận */}
        <View style={styles.tagsWrap}>
          {['Men gốm tinh xảo', 'Đóng gói kỹ lưỡng', 'Giao nhanh chóng', 'Hài lòng 100%'].map((tag) => {
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

        {/* Ô ghi chú cảm nhận */}
        <TextInput
          style={styles.reviewTextInput}
          placeholder="Chia sẻ thêm cảm nhận của bạn về sản phẩm gốm..."
          placeholderTextColor="#9E968D"
          multiline
          numberOfLines={3}
          value={reviewNote}
          onChangeText={setReviewNote}
        />

        <ScalePressable style={styles.submitReviewBtn} activeScale={0.96} onPress={handleSubmitRating}>
          <Text style={styles.submitReviewBtnText}>{t('reviewAction') || 'Gửi đánh giá'}</Text>
        </ScalePressable>
      </AnimatedBottomSheetModal>
    </Animated.View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
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
      zIndex: 60,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ── CUỘN NỘI DUNG ──
    scrollContent: {
      paddingBottom: 50,
    },

    // ── 1. HERO BANNER HẠNG HỘI VIÊN FULL TRÀN QUA HEADER ──
    heroBannerWrap: {
      height: 250,
      overflow: 'hidden',
    },
    heroFluidBackground: {
      flex: 1,
      paddingHorizontal: 20,
      justifyContent: 'center',
    },
    heroContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    heroLeft: {
      justifyContent: 'center',
    },
    heroTierSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      color: '#FFFFFF',
      fontWeight: '600',
      opacity: 0.9,
    },
    heroTierTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 28,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    heroRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    heroBrandLogo: {
      width: 140,
      height: 52,
    },

    // ── 2. THẺ 1: TRẠNG THÁI & MÃ ĐƠN (OVERLAPPING CARD) ──
    overlapCardContainer: {
      marginTop: -38,
      paddingHorizontal: 16,
      zIndex: 10,
    },
    orderStatusCard: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 10,
      elevation: isDark ? 0 : 3,
    },
    statusCardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    statusCardCodeLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    statusCardDateSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#9E968D' : BRAND.mutedText,
    },
    copyCodeTouch: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
    },
    statusCardCodeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textPrimary,
      maxWidth: 130,
    },
    statusStateTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginTop: 6,
      marginBottom: 16,
    },

    // Timeline
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 20,
    },
    timelineStepWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    timelineIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? '#2C2C2C' : '#EBE5DE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    timelineIconCircleActive: {
      backgroundColor: BRAND.primary,
    },
    timelineTrackLine: {
      flex: 1,
      height: 2.5,
      backgroundColor: isDark ? '#2C2C2C' : '#EBE5DE',
      marginHorizontal: -4,
      zIndex: 1,
    },
    timelineTrackLineActive: {
      backgroundColor: BRAND.primary,
    },

    // Nút hành động
    statusActionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    reviewPillBtn: {
      flex: 1,
      height: 42,
      borderRadius: 21,
      borderWidth: isDark ? 0 : 1.2,
      borderColor: isDark ? 'transparent' : BRAND.warmBeige,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : BRAND.cardWhite,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewPillBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    reorderPillBtn: {
      flex: 1,
      height: 42,
      borderRadius: 21,
      borderWidth: 1.2,
      borderColor: BRAND.primary,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFDF9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reorderPillBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : BRAND.primary,
    },

    // ── PHÂN KHU CHUNG ──
    sectionBlock: {
      paddingHorizontal: 16,
      marginTop: 22,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    sectionHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    sectionHeaderTitleNoIcon: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 10,
    },

    // Card thông tin địa chỉ / chi nhánh
    infoCard: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    storeBranchNameTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 6,
    },
    storeAddressRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
    },
    storeAddressText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9E968D' : BRAND.mutedText,
      lineHeight: 18,
      flex: 1,
    },
    expectedTimeTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 4,
    },
    expectedTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    expectedTimeVal: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textPrimary,
    },

    // Thẻ thời gian viên thuốc
    timePillCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.03,
      shadowRadius: 5,
      elevation: isDark ? 0 : 1,
    },
    timePillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textPrimary,
    },

    // ── DANH SÁCH MÓN ──
    itemsListContainer: {
      gap: 12,
    },
    itemDetailCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    itemCardThumb: {
      width: 68,
      height: 68,
      borderRadius: 12,
      marginRight: 14,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      overflow: 'hidden',
    },
    itemCardCenter: {
      flex: 1,
      justifyContent: 'center',
    },
    itemCardName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 20,
      marginBottom: 2,
    },
    itemCardVariant: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#9E968D' : BRAND.mutedText,
      marginBottom: 4,
    },
    itemCardQuantity: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    itemCardPrice: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginLeft: 10,
    },

    // ── ƯU ĐÃI ──
    voucherCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.03,
      shadowRadius: 5,
      elevation: isDark ? 0 : 1,
    },
    voucherCodeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      flex: 1,
      letterSpacing: 0.3,
    },

    // ── PHƯƠNG THỨC THANH TOÁN ──
    paymentMethodCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.borderSoft,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.03,
      shadowRadius: 5,
      elevation: isDark ? 0 : 1,
    },
    paymentIconWrap: {
      marginRight: 10,
    },
    paymentMethodText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },

    // ── CHI TIẾT THANH TOÁN ──
    billBreakdownWrap: {
      paddingTop: 4,
    },
    billLineRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    billLineLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      color: isDark ? '#9E968D' : BRAND.mutedText,
    },
    billLineVal: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    discountVal: {
      color: BRAND.danger,
      fontWeight: '700',
    },
    totalPaymentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
      marginBottom: 14,
    },
    totalPaymentLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    vatSubtext: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#9E968D' : BRAND.mutedText,
    },
    totalPaymentAmount: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '800',
      color: Colors.textPrimary,
    },
    rewardPointsLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFDF9',
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : BRAND.warmBeige,
      marginTop: 8,
      marginBottom: 18,
    },
    rewardPointsText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textPrimary,
    },
    rewardPointsBold: {
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : BRAND.primary,
    },
    supportLinkTouch: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    supportLinkText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : BRAND.primary,
      textDecorationLine: 'underline',
    },

    // ── MODAL ĐÁNH GIÁ ──
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    ratingSheetCard: {
      backgroundColor: Colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 36,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary,
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
  });
