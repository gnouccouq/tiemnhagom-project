// app/product/[id].tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Share,
  Platform,
  Clipboard,
  Animated as RNAnimated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { getProductById, getProducts } from '../../src/services/productService';
import { getActiveCoupons, CouponItem } from '../../src/services/couponService';
import { Product, ProductVariant } from '../../src/types';
import { formatCurrency, checkOutOfStock } from '../../src/utils/format';
import { addRecentlyViewed, getRecentlyViewed, RecentlyViewedItem } from '../../src/utils/recentViews';
import { useCart } from '../../src/context/CartContext';
import { useWishlist } from '../../src/context/WishlistContext';
import { useAuth } from '../../src/context/AuthContext';
import { ScalePressable } from '../../src/components/ScalePressable';
import { BlurButton } from '../../src/components/BlurButton';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';
import { LiquidGlass, LiquidGlassContainerView } from '../../src/components/LiquidGlass';
import { SymbolView } from 'expo-symbols';
import { ProductCard } from '../../src/components/ProductCard';
import { AnimatedBottomSheetModal } from '../../src/components/AnimatedBottomSheetModal';
import { ProductDetailSkeleton } from '../../src/components/ShimmerSkeleton';
import { useDialog } from '../../src/context/DialogContext';
import { useSettings } from '../../src/context/SettingsContext';

const { width } = Dimensions.get('window');

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function ProductDetailScreen() {
  const { id, variant: variantParam } = useLocalSearchParams<{ id: string; variant?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { user } = useAuth();
  const { addToCart, cartCount, applyCoupon, flyToCart, memberTier } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();
  const dialog = useDialog();

  const scrollViewRef = useRef<ScrollView>(null);
  const thumbnailScrollRef = useRef<ScrollView>(null);
  const headerCartRef = useRef<View>(null);
  const ctaBtnRef = useRef<View>(null);

  // Hiệu ứng nảy giỏ hàng ở header
  const headerCartScale = useRef(new RNAnimated.Value(1)).current;

  const triggerHeaderCartBounce = () => {
    RNAnimated.sequence([
      RNAnimated.timing(headerCartScale, { toValue: 1.4, duration: 120, useNativeDriver: true }),
      RNAnimated.spring(headerCartScale, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }),
    ]).start();
  };

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(undefined);
  const [quantity, setQuantity] = useState<number>(1);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const isAutoPlayPaused = useRef(false);

  // Modal biến thể chọn mua
  const [variantModalVisible, setVariantModalVisible] = useState<boolean>(false);
  const [modalActionType, setModalActionType] = useState<'cart' | 'buy'>('cart');
  const [modalVariant, setModalVariant] = useState<ProductVariant | undefined>(undefined);
  const [modalQuantity, setModalQuantity] = useState<number>(1);

  // Vouchers, Gợi ý, Lịch sử đã xem, Phối theo bộ & Chia sẻ
  const [availableCoupons, setAvailableCoupons] = useState<CouponItem[]>([]);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<RecentlyViewedItem[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<string[]>([]);
  const [shareModalVisible, setShareModalVisible] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getProductById(id)
        .then((res) => {
          setProduct(res);
          if (res) {
            // Lưu vào danh sách đã xem gần đây
            addRecentlyViewed(res);

            // Tìm và chọn biến thể: Nếu được mở từ card biến thể (có variantParam) thì chọn đúng biến thể đó
            if (variantParam) {
              const decodedParam = decodeURIComponent(variantParam).trim().toLowerCase();
              const matchColor = res.colorVariants?.find((v) => v.name?.trim().toLowerCase() === decodedParam);
              const matchPattern = res.patternVariants?.find((v) => v.name?.trim().toLowerCase() === decodedParam);
              const matchCombo = res.comboVariants?.find((v) => v.name?.trim().toLowerCase() === decodedParam);
              if (matchColor) {
                setSelectedVariant({ ...matchColor, type: 'color' });
                setModalVariant({ ...matchColor, type: 'color' });
              } else if (matchPattern) {
                setSelectedVariant({ ...matchPattern, type: 'pattern' });
                setModalVariant({ ...matchPattern, type: 'pattern' });
              } else if (matchCombo) {
                setSelectedVariant({ ...matchCombo, type: 'combo' });
                setModalVariant({ ...matchCombo, type: 'combo' });
              }
            } else {
              // Bấm vào card sản phẩm gốc: Giữ hiển thị sản phẩm gốc bình thường (ảnh đại diện gốc, giá gốc, tên sản phẩm gốc)
              setSelectedVariant(undefined);
              const defaultVariant = (res.colorVariants && res.colorVariants[0])
                ? { ...res.colorVariants[0], type: 'color' as const }
                : (res.patternVariants && res.patternVariants[0])
                ? { ...res.patternVariants[0], type: 'pattern' as const }
                : (res.comboVariants && res.comboVariants[0])
                ? { ...res.comboVariants[0], type: 'combo' as const }
                : undefined;
              setModalVariant(defaultVariant);
            }

            // Tải sản phẩm gợi ý cùng danh mục
            getProducts({ category: res.category, maxItems: 8, expandVariants: false })
              .then((sugg) => {
                const filtered = sugg.filter((p) => p.id !== res.id).slice(0, 6);
                setSuggestedProducts(filtered);
                const availablePairings = filtered.filter((p) => !checkOutOfStock(p)).slice(0, 2);
                setSelectedBundleIds(availablePairings.map((p) => p.id));
              })
              .catch(() => {});
          }
        })
        .finally(() => setLoading(false));

      // Tải danh sách đã xem gần đây
      getRecentlyViewed(id)
        .then((recents) => setRecentProducts(recents))
        .catch(() => {});

      // Tải voucher khả dụng
      getActiveCoupons(user?.uid)
        .then((coupons) => {
          setAvailableCoupons(coupons.slice(0, 5));
        })
        .catch(() => {});
    }
  }, [id, variantParam, user?.uid]);

  // Danh sách hình ảnh: Nếu có biến thể đang chọn có ảnh riêng, đưa ảnh đó lên đầu tiên
  const baseImages = (product?.images && product.images.length > 0)
    ? product.images
    : product?.imageUrl
    ? [product.imageUrl]
    : product
    ? ['https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?q=80&w=800&auto=format&fit=crop']
    : [];

  const variantImg = selectedVariant?.imageUrl || selectedVariant?.thumbUrl;
  const allImages = variantImg ? [variantImg] : [];
  baseImages.forEach((img) => {
    if (!allImages.includes(img)) allImages.push(img);
  });

  const collectImages = (variants?: ProductVariant[]) => {
    if (!variants) return;
    variants.forEach((v) => {
      const vImg = v.imageUrl || v.thumbUrl;
      if (vImg && !allImages.includes(vImg)) {
        allImages.push(vImg);
      }
    });
  };
  if (product) {
    collectImages(product.colorVariants);
    collectImages(product.patternVariants);
    collectImages(product.comboVariants);
  }

  const images = allImages;

  // Tự động lướt slider và cuộn hàng ảnh nhỏ theo ảnh đang hiện
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (images.length > 1) {
      interval = setInterval(() => {
        if (!isAutoPlayPaused.current) {
          setActiveImageIndex((prevIndex) => {
            const nextIndex = (prevIndex + 1) % images.length;
            scrollViewRef.current?.scrollTo({ x: nextIndex * width, animated: true });
            // Tự động cuộn hàng thumbnail theo ảnh đang hiện
            thumbnailScrollRef.current?.scrollTo({
              x: Math.max(0, nextIndex * 76 - width / 2 + 38),
              animated: true,
            });
            return nextIndex;
          });
        }
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [images.length]);

  // Khi activeImageIndex thay đổi từ thao tác vuốt tay, cuộn thumbnail tương ứng
  const handleCarouselScroll = (idx: number) => {
    setActiveImageIndex(idx);
    thumbnailScrollRef.current?.scrollTo({
      x: Math.max(0, idx * 76 - width / 2 + 38),
      animated: true,
    });
  };

  if (loading) {
    return (
      <View style={styles.safeArea}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
        {/* Thanh điều hướng gốc iOS UINavigationBar */}
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />
        <View
          style={[
            styles.floatingHeader,
            { top: insets.top + (Platform.OS === 'android' ? 8 : 4) },
          ]}
          pointerEvents="box-none"
        >
          <BlurButton
            onPress={() => router.back()}
            accessibilityLabel="Quay lại"
          >
            <SymbolView
              name="chevron.left"
              size={20}
              tintColor={Colors.textPrimary}
              fallback={<Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />}
            />
          </BlurButton>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingBottom: 40, paddingTop: insets.top + 48 }}
        >
          <ProductDetailSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>{t('productNotFound')}</Text>
        <TouchableOpacity style={styles.backHomeBtn} onPress={() => router.back()}>
          <Text style={styles.backHomeText}>{t('productBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const favorite = isFavorite(product.id);

  // Biến thể
  const allVariants: ProductVariant[] = [
    ...(product.colorVariants?.map((v) => ({ ...v, type: 'color' as const })) || []),
    ...(product.patternVariants?.map((v) => ({ ...v, type: 'pattern' as const })) || []),
    ...(product.comboVariants?.map((v) => ({ ...v, type: 'combo' as const })) || []),
  ];
  const hasVariants = allVariants.length > 0;

  // Tính giá hiệu lực trang chính
  const getVariantEffectivePrice = (v?: ProductVariant, p?: Product) => {
    if (!p) return 0;
    const basePrice = (v?.price && v.price > 0) ? v.price : p.price;
    if (v?.salePrice && v.salePrice > 0) {
      return v.salePrice;
    }
    if (v?.sale !== undefined && v.sale !== null && v.sale > 0) {
      return Math.round(basePrice * (1 - v.sale / 100));
    }
    if (v?.price && v.price > 0) {
      // Biến thể có giá riêng nhưng không giảm giá
      return v.price;
    }
    if (p.salePrice && p.salePrice > 0) {
      return p.salePrice;
    }
    if (p.sale && p.sale > 0) {
      return Math.round(p.price * (1 - p.sale / 100));
    }
    return p.price;
  };

  const currentPrice = getVariantEffectivePrice(selectedVariant, product);
  const currentOriginalPrice = (selectedVariant?.price && selectedVariant.price > 0) ? selectedVariant.price : product.price;
  const hasDiscount = currentPrice < currentOriginalPrice;
  const maxStock = (selectedVariant?.stock !== undefined && selectedVariant?.stock !== null)
    ? Number(selectedVariant.stock)
    : (Number(product.stock) || 0);
  const isOutOfStock = checkOutOfStock(product, selectedVariant);

  // Chiết khấu thành viên
  const hasMemberDiscount = Boolean(memberTier && memberTier.discount > 0 && currentPrice > 0);
  const memberDiscountPercent = hasMemberDiscount ? memberTier.discount : 0;
  const memberPrice = hasMemberDiscount
    ? Math.round(currentPrice * (1 - memberDiscountPercent / 100))
    : currentPrice;

  // Tính giá & tồn kho của modal biến thể
  const activeModalVariant = modalVariant || selectedVariant;
  const modalEffectivePrice = getVariantEffectivePrice(activeModalVariant, product);
  const modalMemberPrice = hasMemberDiscount
    ? Math.round(modalEffectivePrice * (1 - memberDiscountPercent / 100))
    : modalEffectivePrice;

  const modalStock = (activeModalVariant?.stock !== undefined && activeModalVariant?.stock !== null)
    ? Number(activeModalVariant.stock)
    : (Number(product.stock) || 0);
  const modalSold = activeModalVariant?.sold ?? product.sold ?? 0;
  const isModalOutOfStock = checkOutOfStock(product, activeModalVariant);

  const modalVariantImage =
    activeModalVariant?.imageUrl ||
    activeModalVariant?.thumbUrl ||
    product.imageUrl ||
    (product.images && product.images[0]) ||
    'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?q=80&w=800&auto=format&fit=crop';

  // Kích hoạt animation bay vào giỏ hàng ở header
  const triggerFlyToHeaderCart = (imageUrl: string) => {
    headerCartRef.current?.measureInWindow((hx, hy, hw, hh) => {
      const targetX = typeof hx === 'number' && !isNaN(hx) ? hx + hw / 2 : width - 40;
      const targetY = typeof hy === 'number' && !isNaN(hy) ? hy + hh / 2 : 44 + 20;

      ctaBtnRef.current?.measureInWindow((cx, cy, cw, ch) => {
        const startX = typeof cx === 'number' && !isNaN(cx) ? cx + cw / 2 : width / 2;
        const startY = typeof cy === 'number' && !isNaN(cy) ? cy + ch / 2 : Dimensions.get('window').height - 60;
        flyToCart(imageUrl, startX, startY, targetX, targetY);
      });
    });

    // Sau khi bay tới (khoảng 620ms), nảy icon giỏ hàng ở header
    setTimeout(() => {
      triggerHeaderCartBounce();
    }, 620);
  };

  // Xử lý mở Modal biến thể hoặc thực hiện mua
  const handleOpenActionModal = (action: 'cart' | 'buy') => {
    if (hasVariants) {
      setModalActionType(action);
      // Ưu tiên chọn biến thể đang chọn, hoặc biến thể đầu tiên còn hàng
      const initialVariant = selectedVariant || allVariants.find((v) => !checkOutOfStock(product, v)) || allVariants[0];
      setModalVariant(initialVariant);
      setModalQuantity(1);
      setVariantModalVisible(true);
    } else {
      if (isOutOfStock) {
        dialog.alert(t('notification'), t('outOfStockAlert'));
        return;
      }
      if (action === 'cart') {
        performAddToCart(product, quantity, undefined);
      } else {
        performBuyNow(product, quantity, undefined);
      }
    }
  };

  const performAddToCart = (prod: Product, qty: number, variant?: ProductVariant) => {
    if (checkOutOfStock(prod, variant)) {
      dialog.alert(t('notification'), t('outOfStockAlert'));
      return;
    }
    addToCart(prod, qty, variant);

    // Bắn animation hình ảnh bay lên icon giỏ hàng ở Header
    const flyImg = variant?.imageUrl || variant?.thumbUrl || prod.imageUrl || (prod.images && prod.images[0]) || '';
    triggerFlyToHeaderCart(flyImg);
  };

  const performBuyNow = (prod: Product, qty: number, variant?: ProductVariant) => {
    if (checkOutOfStock(prod, variant)) {
      dialog.alert(t('notification'), t('outOfStockAlert'));
      return;
    }
    addToCart(prod, qty, variant);
    router.push('/checkout');
  };

  const handleConfirmModalAction = () => {
    if (!activeModalVariant) {
      dialog.alert(t('notification'), t('selectVariantRequired'));
      return;
    }
    if (isModalOutOfStock) {
      dialog.alert(t('notification'), t('outOfStockAlert'));
      return;
    }
    setSelectedVariant(activeModalVariant);
    setQuantity(modalQuantity);
    setVariantModalVisible(false);

    if (modalActionType === 'cart') {
      performAddToCart(product, modalQuantity, activeModalVariant);
    } else {
      performBuyNow(product, modalQuantity, activeModalVariant);
    }
  };

  const parsedDesc = product.description
    ? product.description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]*>?/gm, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
    : 'Sản phẩm gốm sứ mộc mạc được chế tác thủ công tinh xảo bởi nghệ nhân Tiệm Nhà Gốm. Lớp men tự nhiên, nung ở nhiệt độ cao trên 1200°C đảm bảo an toàn tuyệt đối cho sức khỏe khi dùng với thực phẩm nóng hoặc lò vi sóng.';

  const dimParts: string[] = [];
  if (product.dimensions?.length) dimParts.push(`Dài ${product.dimensions.length}cm`);
  if (product.dimensions?.width) dimParts.push(`Rộng ${product.dimensions.width}cm`);
  if (product.dimensions?.height) dimParts.push(`Cao ${product.dimensions.height}cm`);
  const dimString = dimParts.join(' × ');

  const shareUrl = `https://tiemnhagom.vn/product/?id=${product.id}`;
  const shareQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=2B2928&bgcolor=FFFFFF&data=${encodeURIComponent(shareUrl)}`;

  const handleShareProduct = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShareModalVisible(true);
  };

  const handleNativeShare = async () => {
    try {
      const message = `${product.name} - ${formatCurrency(currentPrice)}\nKhám phá tác phẩm gốm mộc tinh tuyển tại Tiệm Nhà Gốm: ${shareUrl}`;
      await Share.share({
        title: product.name,
        message: message,
        url: shareUrl,
      });
    } catch (err) {
      console.warn('Lỗi chia sẻ sản phẩm:', err);
    }
  };

  const handleCopyShareLink = () => {
    Clipboard.setString(shareUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2200);
  };

  const bundleCandidates = suggestedProducts.filter((p) => !checkOutOfStock(p)).slice(0, 3);
  const selectedBundleProducts = bundleCandidates.filter((p) => selectedBundleIds.includes(p.id));
  const bundleTotalPrice =
    (!isOutOfStock ? currentPrice : 0) +
    selectedBundleProducts.reduce((sum, p) => sum + (p.salePrice || p.price), 0);
  const bundleTotalCount = (!isOutOfStock ? 1 : 0) + selectedBundleProducts.length;

  const toggleBundleItem = (itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedBundleIds((prev) =>
      prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]
    );
  };

  const handleAddBundleToCart = () => {
    if (bundleTotalCount === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!isOutOfStock) {
      addToCart(product, 1, selectedVariant);
    }
    selectedBundleProducts.forEach((p) => {
      addToCart(p, 1);
    });
    const flyImg =
      selectedVariant?.imageUrl ||
      product.imageUrl ||
      (product.images && product.images[0]) ||
      '';
    triggerFlyToHeaderCart(flyImg);
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      {/* Thanh điều hướng với nút Back và 3 nút riêng biệt chuẩn Liquid Glass */}
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <FadingHeaderBackdrop height={insets.top + 56 + 24} />

      {/* Header nổi: 1 nút Back bên trái & 3 nút riêng biệt [Chia sẻ] [Yêu thích] [Giỏ hàng] bên phải chuẩn Liquid Glass */}
      <View
        style={[
          styles.floatingHeader,
          { top: insets.top + (Platform.OS === 'android' ? 8 : 4) },
        ]}
        pointerEvents="box-none"
      >
        <BlurButton
          onPress={() => router.back()}
          accessibilityLabel="Quay lại"
        >
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor={Colors.textPrimary}
            fallback={<Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />}
          />
        </BlurButton>

        {/* Cụm 3 nút kính lỏng giao nhau: Chia sẻ + Yêu thích + Giỏ hàng (kéo dãn giọt nước) */}
        <LiquidGlassContainerView spacing={18} style={styles.headerRightGroup} pointerEvents="box-none">
          <BlurButton
            onPress={handleShareProduct}
            accessibilityLabel="Chia sẻ sản phẩm"
          >
            <SymbolView
              name="square.and.arrow.up"
              size={20}
              tintColor={Colors.textPrimary}
              fallback={<Ionicons name="share-social-outline" size={21} color={Colors.textPrimary} />}
            />
          </BlurButton>

          <BlurButton
            onPress={() => toggleFavorite(product.id)}
            accessibilityLabel="Yêu thích"
          >
            <SymbolView
              name={favorite ? 'heart.fill' : 'heart'}
              size={20}
              tintColor={favorite ? Colors.badgeSale : Colors.textPrimary}
              fallback={
                <Ionicons
                  name={favorite ? 'heart' : 'heart-outline'}
                  size={21}
                  color={favorite ? Colors.badgeSale : Colors.textPrimary}
                />
              }
            />
          </BlurButton>

          <View ref={headerCartRef} collapsable={false}>
            <RNAnimated.View style={{ transform: [{ scale: headerCartScale }] }}>
              <BlurButton
                onPress={() => router.push('/cart')}
                accessibilityLabel="Giỏ hàng"
              >
                <SymbolView
                  name="bag"
                  size={20}
                  tintColor={Colors.textPrimary}
                  fallback={<Ionicons name="bag-handle-outline" size={21} color={Colors.textPrimary} />}
                />
                {cartCount > 0 && (
                  <View style={styles.cartBadge} pointerEvents="none">
                    <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                  </View>
                )}
              </BlurButton>
            </RNAnimated.View>
          </View>
        </LiquidGlassContainerView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 16) + 96,
          },
        ]}
      >
        {/* Images Carousel */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.carouselContainer}>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              handleCarouselScroll(idx);
            }}
            onScrollBeginDrag={() => { isAutoPlayPaused.current = true; }}
            onScrollEndDrag={() => { isAutoPlayPaused.current = false; }}
            scrollEventThrottle={16}
          >
            {images.map((imgUri, index) => (
              <View key={index} style={styles.carouselItem}>
                <Image
                  source={{ uri: imgUri }}
                  style={styles.carouselImage}
                  contentFit="cover"
                />
              </View>
            ))}
          </ScrollView>

          {/* Chỉ số ảnh dạng "01/10" thanh lịch thay thế các dot */}
          {images.length > 1 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {String(activeImageIndex + 1).padStart(2, '0')}/{String(images.length).padStart(2, '0')}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Thumbnails tự động trượt theo ảnh đang hiện */}
        {images.length > 1 && (
          <View style={styles.thumbnailContainer}>
            <ScrollView
              ref={thumbnailScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailList}
            >
              {images.map((imgUri, index) => (
                <AnimatedTouchableOpacity
                  key={index}
                  entering={ZoomIn.delay(200 + index * 40).springify()}
                  style={[styles.thumbnailWrap, activeImageIndex === index && styles.thumbnailActive]}
                  onPress={() => {
                    setActiveImageIndex(index);
                    scrollViewRef.current?.scrollTo({ x: index * width, animated: true });
                    thumbnailScrollRef.current?.scrollTo({
                      x: Math.max(0, index * 76 - width / 2 + 38),
                      animated: true,
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: imgUri }} style={styles.thumbnailImage} contentFit="cover" />
                </AnimatedTouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Content Details trong Khối Card bo tròn 20px chuẩn GEMINI.md */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.detailContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.categoryBadge}>{product.category || 'Gốm sứ thủ công'}</Text>
            <Text style={{ fontFamily: 'ElleGaborStd', fontSize: 13, color: '#7A827E', fontWeight: '600' }}>
              {t('productCodeLabel')} {product.parentProductId || product.id}
            </Text>
          </View>
          <Text style={styles.productTitle}>
            {product.name}
            {selectedVariant?.name ? (
              <Text style={{ color: '#9C7156', fontWeight: '700' }}>
                {' '}• {selectedVariant.name}
              </Text>
            ) : null}
          </Text>

          {/* Rating & Sold count */}
          <View style={styles.statsRow}>
            <Text style={styles.soldText}>{t('soldCount')} {product.sold || 0}</Text>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.stockStatusText}>
              {isOutOfStock ? t('outOfStock') : `${t('stockRemaining')} ${maxStock}`}
            </Text>
          </View>

          {/* Price Row */}
          <View style={styles.priceRow}>
            {hasMemberDiscount ? (
              <>
                <Text style={styles.mainPrice}>{formatCurrency(memberPrice)}</Text>
                <Text style={styles.strikePrice}>{formatCurrency(currentPrice)}</Text>
                <View style={styles.memberPerkBadge}>
                  <Text style={styles.memberPerkBadgeText}>
                    {memberTier.name} -{memberDiscountPercent}%
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.mainPrice}>{formatCurrency(currentPrice)}</Text>
                {hasDiscount && (
                  <Text style={styles.strikePrice}>{formatCurrency(currentOriginalPrice)}</Text>
                )}
                {product.sale && product.sale > 0 ? (
                  <View style={styles.saleTag}>
                    <Text style={styles.saleTagText}>-{product.sale}%</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* RÚT GỌN BIẾN THỂ TRÊN TRANG CHI TIẾT DẠNG COMPACT PILL BAR */}
          {hasVariants && (
            <TouchableOpacity
              style={styles.variantCompactBar}
              onPress={() => handleOpenActionModal('cart')}
              activeOpacity={0.85}
            >
              <View style={styles.variantCompactLeft}>
                <Text style={styles.variantCompactLabel}>{t('variantLabel')}</Text>
                <View style={styles.variantCompactPreview}>
                  {selectedVariant?.type === 'color' && selectedVariant.hex ? (
                    <View style={[styles.variantCompactColorDot, { backgroundColor: selectedVariant.hex }]} />
                  ) : selectedVariant?.imageUrl ? (
                    <Image source={{ uri: selectedVariant.imageUrl }} style={styles.variantCompactThumb} contentFit="cover" />
                  ) : null}
                  <Text style={styles.variantCompactValue} numberOfLines={1}>
                    {selectedVariant?.name || t('selectVariantPrompt')}
                  </Text>
                  {selectedVariant && isOutOfStock ? (
                    <View style={styles.compactOutOfStockBadge}>
                      <Text style={styles.compactOutOfStockText}>{t('outOfStock')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.variantCompactRight}>
                <Text style={styles.variantCompactCount}>+{allVariants.length} {t('variantCountSuffix')}</Text>
                <Ionicons name="chevron-forward" size={16} color="#9C7156" />
              </View>
            </TouchableOpacity>
          )}

          {/* Vouchers Khả Dụng */}
          {availableCoupons.length > 0 && (
            <View style={styles.voucherSection}>
              <View style={styles.voucherHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="ticket-outline" size={18} color="#9C7156" />
                  <Text style={styles.voucherSectionTitle}>{t('availableVouchersTitle')}</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/deals')}>
                  <Text style={styles.voucherSeeAll}>{t('viewAll')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voucherList}>
                {availableCoupons.map((c, i) => {
                  const isApplied = copiedCoupon === c.code;
                  return (
                    <View key={i} style={styles.voucherCard}>
                      <View style={styles.voucherLeft}>
                        <Text style={styles.voucherCode}>{c.code}</Text>
                        <Text style={styles.voucherDesc} numberOfLines={1}>{c.name || 'Giảm giá đơn hàng'}</Text>
                        {c.minOrder ? (
                          <Text style={styles.voucherCondition}>Đơn từ {formatCurrency(c.minOrder)}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[styles.voucherApplyBtn, isApplied && styles.voucherAppliedBtn]}
                        onPress={() => {
                          applyCoupon(c.code);
                          setCopiedCoupon(c.code);
                          dialog.showDialog({
                            title: t('voucherSavedTitle'),
                            message: t('voucherSavedMsg'),
                            type: 'success',
                            buttons: [{ text: t('agree'), style: 'primary' }],
                          });
                        }}
                      >
                        <Text style={[styles.voucherApplyText, isApplied && styles.voucherAppliedText]}>
                          {isApplied ? t('savedVoucherBtn') : t('useVoucherBtn')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Safety Icons: Chỉ hiển thị các icon được tick trong dashboard admin */}
          {Boolean(
            product.usage &&
            (product.usage.isMicrowaveSafe !== false ||
              product.usage.isDishwasherSafe !== false ||
              product.usage.isFoodSafe !== false ||
              product.usage.isOvenSafe === true)
          ) && (
            <View style={styles.safetyBox}>
              <Text style={styles.safetyBoxTitle}>{t('safetyTitle')}</Text>
              <View style={styles.safetyIconsRow}>
                {/* 1. Lò vi sóng */}
                {product.usage?.isMicrowaveSafe !== false && (
                  <View style={styles.safetyItem}>
                    <View style={styles.safetyIconWrapper}>
                      <Image
                        source={require('../../assets/images/microwavesafe.webp')}
                        style={styles.safetyImg}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.safetyItemTitle}>{t('safetyMicrowave')}</Text>
                    <Text style={styles.safetyItemSub}>{t('safetyMicrowaveSub')}</Text>
                  </View>
                )}

                {/* 2. Đút lò / Lò nướng */}
                {product.usage?.isOvenSafe === true && (
                  <View style={styles.safetyItem}>
                    <View style={styles.safetyIconWrapper}>
                      <Ionicons name="flame-outline" size={24} color="#9C7156" />
                    </View>
                    <Text style={styles.safetyItemTitle}>{t('safetyOven')}</Text>
                    <Text style={styles.safetyItemSub}>{t('safetyOvenSub')}</Text>
                  </View>
                )}

                {/* 3. Máy rửa chén */}
                {product.usage?.isDishwasherSafe !== false && (
                  <View style={styles.safetyItem}>
                    <View style={styles.safetyIconWrapper}>
                      <Image
                        source={require('../../assets/images/dishwashersafe.webp')}
                        style={styles.safetyImg}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.safetyItemTitle}>{t('safetyDishwasher')}</Text>
                    <Text style={styles.safetyItemSub}>{t('safetyDishwasherSub')}</Text>
                  </View>
                )}

                {/* 4. An toàn thực phẩm */}
                {product.usage?.isFoodSafe !== false && (
                  <View style={styles.safetyItem}>
                    <View style={styles.safetyIconWrapper}>
                      <Image
                        source={require('../../assets/images/foodsafe.webp')}
                        style={styles.safetyImg}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.safetyItemTitle}>{t('safetyFood')}</Text>
                    <Text style={styles.safetyItemSub}>{t('safetyFoodSub')}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={styles.descTitle}>{t('productDescTitle')}</Text>
            <Text style={styles.descText}>{parsedDesc}</Text>
          </View>

          {/* Specifications */}
          {Boolean(product.details?.material || dimString || product.specs?.weight || product.specs?.capacity) && (
            <View style={styles.descSection}>
              <Text style={styles.descTitle}>{t('productSpecsTitle')}</Text>
              <View style={styles.specsContainer}>
                {Boolean(product.details?.material) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>{t('materialLabel')}</Text>
                    <Text style={styles.specValue}>{product.details?.material}</Text>
                  </View>
                )}
                {Boolean(product.details?.origin) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>{t('originLabel')}</Text>
                    <Text style={styles.specValue}>{product.details?.origin}</Text>
                  </View>
                )}
                {Boolean(dimString) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>{t('dimensionLabel')}</Text>
                    <Text style={styles.specValue}>{dimString}</Text>
                  </View>
                )}
                {Boolean(product.specs?.weight) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>{t('weightLabel')}</Text>
                    <Text style={styles.specValue}>{product.specs?.weight} g</Text>
                  </View>
                )}
                {Boolean(product.specs?.capacity) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>{t('capacityLabel')}</Text>
                    <Text style={styles.specValue}>{product.specs?.capacity} ml</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Care Guide */}
          <View style={styles.descSection}>
            <Text style={styles.descTitle}>{t('careGuideTitle')}</Text>
            <View style={styles.careGrid}>
              <View style={styles.careCard}>
                <Ionicons name="thermometer-outline" size={24} color="#9C7156" style={styles.careIcon} />
                <Text style={styles.careTitle}>{t('careThermalShock')}</Text>
                <Text style={styles.careText}>{t('careThermalShockSub')}</Text>
              </View>
              <View style={styles.careCard}>
                <Ionicons name="water-outline" size={24} color="#9C7156" style={styles.careIcon} />
                <Text style={styles.careTitle}>{t('careCleaning')}</Text>
                <Text style={styles.careText}>{t('careCleaningSub')}</Text>
              </View>
              <View style={styles.careCard}>
                <Ionicons name="snow-outline" size={24} color="#9C7156" style={styles.careIcon} />
                <Text style={styles.careTitle}>{t('careDishwasher')}</Text>
                <Text style={styles.careText}>{t('careDishwasherSub')}</Text>
              </View>
              <View style={styles.careCard}>
                <Ionicons name="cube-outline" size={24} color="#9C7156" style={styles.careIcon} />
                <Text style={styles.careTitle}>{t('careStorage')}</Text>
                <Text style={styles.careText}>{t('careStorageSub')}</Text>
              </View>
            </View>
          </View>

          {/* Quality Guarantees */}
          <View style={styles.guaranteeBox}>
            <View style={styles.guaranteeItem}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#9C7156" />
              <Text style={styles.guaranteeText}>{t('guaranteeHealth')}</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="cube-outline" size={20} color="#9C7156" />
              <Text style={styles.guaranteeText}>{t('guaranteePackage')}</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="refresh-outline" size={20} color="#9C7156" />
              <Text style={styles.guaranteeText}>{t('guaranteeReturn')}</Text>
            </View>
          </View>

          {/* Phối cùng bộ gốm đồng điệu (Complete the Set) */}
          {bundleCandidates.length > 0 && (
            <View style={styles.bundleCard}>
              <View style={styles.bundleHeader}>
                <View style={styles.bundleIconWrap}>
                  <Ionicons name="layers-outline" size={18} color="#9C7156" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bundleTitle}>{t('completeTheSetTitle')}</Text>
                  <Text style={styles.bundleSubtitle}>{t('completeTheSetSubtitle')}</Text>
                </View>
              </View>

              <View style={styles.bundleItemsList}>
                {bundleCandidates.map((item) => {
                  const isChecked = selectedBundleIds.includes(item.id);
                  const itemEffPrice = item.salePrice || item.price;
                  const itemImg = item.imageUrl || (item.images && item.images[0]) || '';

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.bundleItemRow, isChecked && styles.bundleItemRowActive]}
                      onPress={() => toggleBundleItem(item.id)}
                      activeOpacity={0.84}
                    >
                      <View style={[styles.bundleCheckbox, isChecked && styles.bundleCheckboxActive]}>
                        {isChecked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                      <Image source={{ uri: itemImg }} style={styles.bundleItemThumb} contentFit="cover" />
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.bundleItemName} numberOfLines={1} ellipsizeMode="tail">
                          {item.name}
                        </Text>
                        <Text style={styles.bundleItemPrice}>{formatCurrency(itemEffPrice)}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push(`/product/${item.id}`)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="chevron-forward" size={17} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedBundleProducts.length > 0 && (
                <TouchableOpacity
                  style={styles.bundleAddBtn}
                  onPress={handleAddBundleToCart}
                  activeOpacity={0.88}
                >
                  <Ionicons name="bag-add-outline" size={18} color="#FFFFFF" />
                  <Text
                    style={styles.bundleAddBtnText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {`${t('addBundleToCartBtn').replace('{count}', String(bundleTotalCount))} • ${formatCurrency(bundleTotalPrice)}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Gợi ý sản phẩm tương tự (Suggested Products) */}
          {suggestedProducts.length > 0 && (
            <View style={styles.suggestedSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>{t('suggestedForYou')}</Text>
                <TouchableOpacity onPress={() => router.push('/products')}>
                  <Text style={styles.sectionSeeAll}>{t('viewAll')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.suggestedGrid}>
                {suggestedProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    cardWidth={(width - 32 - 12) / 2}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Lịch sử sản phẩm đã xem (Recently Viewed) */}
          {recentProducts.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.sectionHeading}>{t('recentlyViewedTitle')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentList}>
                {recentProducts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.recentCard}
                    onPress={() => router.push(`/product/${item.id}`)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: item.imageUrl }} style={styles.recentImg} contentFit="cover" />
                    <Text style={styles.recentName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.recentPrice}>{formatCurrency(item.salePrice || item.price)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Bottom Sticky CTA bo tròn dạng viên thuốc bọc Liquid Glass chuẩn hệ thống iOS */}
      <Animated.View
        entering={SlideInDown.duration(500).delay(300)}
        style={[styles.bottomBarWrapper, { bottom: Math.max(insets.bottom, 14) }]}
        pointerEvents="box-none"
      >
        <LiquidGlass
          style={styles.bottomBar}
          interactive={true}
          effect="regular"
          isDark={isDark}
        >
          <View style={styles.bottomBarContent}>
            <TouchableOpacity
              style={[styles.addToCartBtn, isOutOfStock && styles.btnDisabled]}
              onPress={() => handleOpenActionModal('cart')}
              disabled={isOutOfStock}
              activeOpacity={0.84}
            >
              <Ionicons
                name="bag-add-outline"
                size={20}
                color={isOutOfStock ? (isDark ? '#6E665D' : '#A8A096') : (isDark ? '#E8CCB2' : '#9C7156')}
              />
              <Text
                style={[styles.addToCartText, isOutOfStock && { color: isDark ? '#6E665D' : '#A8A096' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {isOutOfStock ? t('outOfStock') : t('addToCartAction')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.buyNowBtn, isOutOfStock && styles.btnDisabled]}
              onPress={() => handleOpenActionModal('buy')}
              disabled={isOutOfStock}
              activeOpacity={0.88}
            >
              <Text
                style={styles.buyNowText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {isOutOfStock ? t('outOfStock') : t('buyNowAction')}
              </Text>
              {!isOutOfStock && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />}
            </TouchableOpacity>
          </View>
        </LiquidGlass>
      </Animated.View>

      {/* ── MODAL CHỌN BIẾN THỂ TRƯỚC KHI THÊM GIỎ HOẶC MUA NGAY (ANIMATED BOTTOM SHEET MODAL UX) ── */}
      <AnimatedBottomSheetModal
        visible={variantModalVisible}
        onClose={() => setVariantModalVisible(false)}
        showHandle={true}
        contentStyle={styles.modalSheet}
      >
        <View style={{ paddingBottom: 6 }}>
          {/* Header Modal */}
          <View style={styles.modalHeader}>
            <View style={styles.modalProductInfo}>
              <Image
                source={{ uri: modalVariantImage }}
                style={styles.modalThumbnail}
                contentFit="cover"
              />
              <View style={styles.modalMetaWrap}>
                {hasMemberDiscount ? (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text style={styles.modalPriceText}>{formatCurrency(modalMemberPrice)}</Text>
                    <Text style={[styles.strikePrice, { fontSize: 13 }]}>{formatCurrency(modalEffectivePrice)}</Text>
                  </View>
                ) : (
                  <Text style={styles.modalPriceText}>{formatCurrency(modalEffectivePrice)}</Text>
                )}
                <Text style={styles.modalSelectedVariantText}>
                  {t('variantLabel')}{' '}
                  <Text style={{ color: '#9C7156', fontWeight: '700' }}>
                    {activeModalVariant?.name || t('modalDefaultVariant')}
                  </Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={[styles.modalStockText, isModalOutOfStock && { color: '#DC2626' }]}>
                    {isModalOutOfStock ? t('outOfStock') : `${t('modalStockLabel')} ${modalStock}`}
                  </Text>
                  {modalSold > 0 ? (
                    <>
                      <Text style={{ color: '#D4CECA' }}>|</Text>
                      <Text style={styles.modalSoldText}>{t('soldCount')} {modalSold}</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setVariantModalVisible(false)}
            >
              <Ionicons name="close" size={20} color="#2B2928" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {/* Danh sách biến thể màu sắc */}
            {product.colorVariants && product.colorVariants.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>{t('colorLabel').replace(':', '')}</Text>
                <View style={styles.modalVariantsGrid}>
                  {product.colorVariants.map((v, i) => {
                    const isSelected = activeModalVariant?.name === v.name;
                    const isVOutOfStock = checkOutOfStock(product, v);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.modalVariantCard,
                          isSelected && styles.modalVariantCardSelected,
                          isVOutOfStock && styles.modalVariantCardDisabled,
                        ]}
                        onPress={() => setModalVariant({ ...v, type: 'color' })}
                      >
                        {Boolean(v.imageUrl || v.thumbUrl) ? (
                          <Image
                            source={{ uri: v.imageUrl || v.thumbUrl }}
                            style={styles.modalVariantImg}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.modalColorDot, { backgroundColor: v.hex || '#E8CCB2' }]} />
                        )}
                        <Text
                          style={[
                            styles.modalVariantName,
                            isSelected && styles.modalVariantNameSelected,
                            isVOutOfStock && { color: '#9E968D' },
                          ]}
                          numberOfLines={1}
                        >
                          {v.name}
                        </Text>
                        {isVOutOfStock ? (
                          <View style={styles.modalOutOfStockTag}>
                            <Text style={styles.modalOutOfStockTagText}>{t('outOfStock')}</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Danh sách biến thể họa tiết */}
            {product.patternVariants && product.patternVariants.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>{t('patternLabel').replace(':', '')}</Text>
                <View style={styles.modalVariantsGrid}>
                  {product.patternVariants.map((v, i) => {
                    const isSelected = activeModalVariant?.name === v.name;
                    const isVOutOfStock = checkOutOfStock(product, v);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.modalVariantCard,
                          isSelected && styles.modalVariantCardSelected,
                          isVOutOfStock && styles.modalVariantCardDisabled,
                        ]}
                        onPress={() => setModalVariant({ ...v, type: 'pattern' })}
                      >
                        {Boolean(v.imageUrl || v.thumbUrl) ? (
                          <Image
                            source={{ uri: v.imageUrl || v.thumbUrl }}
                            style={styles.modalVariantImg}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons name="color-palette-outline" size={24} color="#9C7156" />
                        )}
                        <Text
                          style={[
                            styles.modalVariantName,
                            isSelected && styles.modalVariantNameSelected,
                            isVOutOfStock && { color: '#9E968D' },
                          ]}
                          numberOfLines={1}
                        >
                          {v.name}
                        </Text>
                        {isVOutOfStock ? (
                          <View style={styles.modalOutOfStockTag}>
                            <Text style={styles.modalOutOfStockTagText}>{t('outOfStock')}</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Danh sách biến thể Combo */}
            {product.comboVariants && product.comboVariants.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>{t('comboLabel') || 'Combo'}</Text>
                <View style={styles.modalVariantsGrid}>
                  {product.comboVariants.map((v, i) => {
                    const isSelected = activeModalVariant?.name === v.name;
                    const isVOutOfStock = checkOutOfStock(product, v);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.modalVariantCard,
                          isSelected && styles.modalVariantCardSelected,
                          isVOutOfStock && styles.modalVariantCardDisabled,
                        ]}
                        onPress={() => setModalVariant({ ...v, type: 'combo' })}
                      >
                        {Boolean(v.imageUrl || v.thumbUrl) ? (
                          <Image
                            source={{ uri: v.imageUrl || v.thumbUrl }}
                            style={styles.modalVariantImg}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons name="gift-outline" size={24} color="#9C7156" />
                        )}
                        <Text
                          style={[
                            styles.modalVariantName,
                            isSelected && styles.modalVariantNameSelected,
                            isVOutOfStock && { color: '#9E968D' },
                          ]}
                          numberOfLines={1}
                        >
                          {v.name}
                        </Text>
                        {isVOutOfStock ? (
                          <View style={styles.modalOutOfStockTag}>
                            <Text style={styles.modalOutOfStockTagText}>{t('outOfStock')}</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Chọn số lượng trong modal */}
            <View style={styles.modalQuantityRow}>
              <Text style={styles.modalSectionTitle}>{t('quantityLabel').replace(':', '')}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setModalQuantity((q) => Math.max(1, q - 1))}
                  disabled={isModalOutOfStock || modalQuantity <= 1}
                >
                  <Ionicons name="remove" size={16} color={(isModalOutOfStock || modalQuantity <= 1) ? Colors.textMuted : Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.qtyNumber, isModalOutOfStock && { color: Colors.textMuted }]}>
                  {isModalOutOfStock ? 0 : modalQuantity}
                </Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setModalQuantity((q) => Math.min(modalStock, q + 1))}
                  disabled={isModalOutOfStock || modalQuantity >= modalStock}
                >
                  <Ionicons name="add" size={16} color={(isModalOutOfStock || modalQuantity >= modalStock) ? Colors.textMuted : Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Nút hành động xác nhận */}
          <TouchableOpacity
            style={[
              styles.modalConfirmBtn,
              isModalOutOfStock && styles.btnDisabled,
              modalActionType === 'buy' ? { backgroundColor: '#9C7156' } : { backgroundColor: '#2B2928' },
            ]}
            onPress={handleConfirmModalAction}
            disabled={isModalOutOfStock}
            activeOpacity={0.88}
          >
            <Text style={styles.modalConfirmBtnText}>
              {isModalOutOfStock
                ? t('outOfStock')
                : modalActionType === 'buy'
                ? t('confirmBuyNow')
                : t('confirmAddToCart')}
            </Text>
          </TouchableOpacity>
        </View>
      </AnimatedBottomSheetModal>

      {/* ── MODAL THẺ CHIA SẺ TÁC PHẨM GỐM (CERAMIC SHARE CARD PREVIEW) ── */}
      <AnimatedBottomSheetModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        showHandle={true}
        contentStyle={styles.modalSheet}
      >
        <View style={{ paddingBottom: 12 }}>
          <View style={styles.shareModalHeaderRow}>
            <Text style={styles.shareModalTitle}>{t('shareCeramicCardTitle')}</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShareModalVisible(false)}
            >
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Thẻ gốm nghệ thuật màu Kem Gốm Mộc #F6F4EC */}
          <View style={styles.sharePreviewCard}>
            <View style={styles.shareCardImageWrap}>
              <Image
                source={{ uri: images[activeImageIndex] || images[0] }}
                style={styles.shareCardImage}
                contentFit="cover"
              />
              <View style={styles.shareBrandBadge}>
                <Text style={styles.shareBrandBadgeText}>{t('handcraftedAtTiemNhaGom')}</Text>
              </View>
            </View>

            <View style={styles.shareCardBottomRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.shareCardCategory}>{product.category || 'Gốm sứ thủ công'}</Text>
                <Text style={styles.shareCardProductName} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={styles.shareCardPrice}>{formatCurrency(currentPrice)}</Text>
                <Text style={styles.shareCardQrHint}>{t('scanToViewProduct')}</Text>
              </View>

              <View style={styles.shareQrBox}>
                <Image source={{ uri: shareQrUrl }} style={styles.shareQrImg} contentFit="contain" />
              </View>
            </View>
          </View>

          {/* Hàng nút Chia sẻ & Sao chép liên kết */}
          <View style={styles.shareActionsRow}>
            <TouchableOpacity
              style={styles.copyLinkBtn}
              onPress={handleCopyShareLink}
              activeOpacity={0.84}
            >
              <Ionicons
                name={copiedShareLink ? 'checkmark-circle' : 'link-outline'}
                size={18}
                color="#9C7156"
              />
              <Text style={styles.copyLinkBtnText} numberOfLines={1}>
                {copiedShareLink ? t('copiedShort') : t('copyProductLinkBtn')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareNowBtn}
              onPress={handleNativeShare}
              activeOpacity={0.88}
            >
              <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
              <Text style={styles.shareNowBtnText} numberOfLines={1}>
                {t('shareCeramicNowBtn')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AnimatedBottomSheetModal>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'ElleGaborStd',
  },
  errorTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginVertical: Spacing.md,
  },
  backHomeBtn: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 26,
  },
  backHomeText: {
    color: '#FFFFFF',
    fontFamily: 'ElleGaborStd',
    fontWeight: '700',
  },
  /* Header chuẩn GEMINI.md: Không vạch kẻ đáy (borderBottomWidth: 0), nút tròn 40px */
  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#9C7156',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: isDark ? '#121212' : '#FAF8F5',
    zIndex: 10,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'ElleGaborStd',
  },
  scrollContent: {
    paddingBottom: 110,
  },
  carouselContainer: {
    width: width,
    height: width,
    marginTop: 32,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  carouselItem: {
    width: width,
    height: width,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  carouselImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  counterBadge: {
    position: 'absolute',
    bottom: 26,
    right: 28,
    backgroundColor: 'rgba(43, 41, 40, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  counterText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  thumbnailContainer: {
    marginTop: 12,
  },
  thumbnailList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  thumbnailWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
  },
  thumbnailActive: {
    borderColor: '#9C7156',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  detailContainer: {
    padding: 16,
  },
  categoryBadge: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#9C7156',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  productTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  bullet: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  soldText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  stockStatusText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  mainPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 24,
    fontWeight: '800',
    color: '#9C7156',
  },
  strikePrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  saleTag: {
    backgroundColor: '#C86432',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  saleTagText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  memberPerkBadge: {
    backgroundColor: isDark ? '#2D1B13' : '#F7ECE1',
    borderWidth: 0.8,
    borderColor: isDark ? '#5C2D07' : '#E8CCB2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  memberPerkBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#9C7156',
    letterSpacing: 0.2,
  },

  /* Rút gọn biến thể dạng Compact Pill Bar */
  variantCompactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  variantCompactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  variantCompactLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  variantCompactPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  variantCompactColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
  },
  variantCompactThumb: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  variantCompactValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  compactOutOfStockBadge: {
    backgroundColor: isDark ? 'rgba(220, 38, 38, 0.2)' : '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  compactOutOfStockText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  variantCompactRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  variantCompactCount: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#9C7156',
    fontWeight: '700',
  },

  /* Vouchers */
  voucherSection: {
    marginVertical: 10,
    backgroundColor: Colors.cardBackground,
    padding: 14,
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  voucherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  voucherSectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  voucherSeeAll: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#9C7156',
    fontWeight: '700',
  },
  voucherList: {
    gap: 10,
  },
  voucherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
    borderRadius: 14,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8CCB2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  voucherLeft: {
    minWidth: 110,
  },
  voucherCode: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '800',
    color: '#9C7156',
  },
  voucherDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  voucherCondition: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    color: Colors.textMuted,
  },
  voucherApplyBtn: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  voucherAppliedBtn: {
    backgroundColor: isDark ? '#2C2C2C' : '#FAF4EF',
    borderWidth: 1,
    borderColor: '#9C7156',
  },
  voucherApplyText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  voucherAppliedText: {
    color: '#9C7156',
  },

  /* Safety Icons */
  safetyBox: {
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  safetyBoxTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '800',
    color: '#9C7156',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 14,
  },
  safetyIconsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  safetyItem: {
    alignItems: 'center',
    width: '32%',
  },
  safetyIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? '#2C2C2C' : '#F6F4EC',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8CCB2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  safetyImg: {
    width: 26,
    height: 26,
  },
  safetyItemTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  safetyItemSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },

  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
    backgroundColor: Colors.cardBackground,
    padding: 14,
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
  },
  sectionHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
    borderRadius: 26,
    borderWidth: isDark ? 0 : 1.2,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    overflow: 'hidden',
  },
  stepBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
  },
  qtyNumber: {
    fontFamily: 'ElleGaborStd',
    minWidth: 40,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  descSection: {
    marginVertical: 10,
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 6,
    elevation: isDark ? 0 : 2,
  },
  descTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  descText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  specsContainer: {
    gap: 8,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? '#2A2A2A' : '#F0ECE6',
  },
  specLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: Colors.textSecondary,
    width: 100,
  },
  specValue: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  careGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  careCard: {
    width: '48%',
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
    borderRadius: 16,
    padding: 12,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    alignItems: 'center',
    marginBottom: 8,
  },
  careIcon: {
    marginBottom: 6,
  },
  careTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#9C7156',
    marginBottom: 4,
  },
  careText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  guaranteeBox: {
    backgroundColor: isDark ? '#2C2C2C' : '#F6F4EC',
    padding: 16,
    borderRadius: 20,
    gap: 10,
    marginTop: 10,
    borderWidth: isDark ? 0 : 1.2,
    borderColor: isDark ? 'transparent' : '#E8CCB2',
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  guaranteeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textPrimary,
    flex: 1,
  },

  /* Suggested Products Grid */
  suggestedSection: {
    marginTop: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeading: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionSeeAll: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#9C7156',
  },
  suggestedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  /* Recently Viewed List */
  recentSection: {
    marginTop: 20,
  },
  recentList: {
    gap: 12,
    paddingTop: 10,
  },
  recentCard: {
    width: 116,
    backgroundColor: Colors.cardBackground,
    borderRadius: 18,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    padding: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.04,
    shadowRadius: 4,
    elevation: isDark ? 0 : 2,
  },
  recentImg: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
  },
  recentName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 6,
    textAlign: 'center',
  },
  recentPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#9C7156',
    marginTop: 2,
  },

  /* Bottom Bar bo tròn dạng viên thuốc bọc Liquid Glass chuẩn GEMINI.md */
  bottomBarWrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 50,
  },
  bottomBar: {
    borderRadius: 36,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  addToCartBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.55)' : 'rgba(255, 255, 255, 0.72)',
  },
  addToCartText: {
    fontFamily: 'ElleGaborStd',
    color: isDark ? '#E8CCB2' : '#9C7156',
    fontWeight: '700',
    fontSize: 14,
  },
  buyNowBtn: {
    flex: 1.2,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  buyNowText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  /* Modal chọn biến thể (BottomSheet) */
  modalSheet: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: Colors.cardBackground,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2A2A2A' : '#F0ECE6',
  },
  modalProductInfo: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  modalThumbnail: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
  },
  modalMetaWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  modalPriceText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 19,
    fontWeight: '800',
    color: '#9C7156',
  },
  modalSelectedVariantText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalStockText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: Colors.textSecondary,
  },
  modalSoldText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: Colors.textMuted,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? '#2C2C2C' : '#F6F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSection: {
    marginTop: 14,
  },
  modalSectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  modalVariantsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalVariantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
    borderWidth: isDark ? 0 : 1.2,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  modalVariantCardSelected: {
    borderWidth: 1.2,
    borderColor: '#9C7156',
    backgroundColor: isDark ? '#2C2C2C' : '#FAF4EF',
  },
  modalVariantCardDisabled: {
    opacity: 0.5,
    borderColor: isDark ? 'transparent' : '#E5E0DA',
  },
  modalVariantImg: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  modalColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  modalVariantName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  modalVariantNameSelected: {
    color: '#9C7156',
    fontWeight: '700',
  },
  modalOutOfStockTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalOutOfStockTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#DC2626',
    fontFamily: 'ElleGaborStd',
  },
  modalQuantityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#2A2A2A' : '#F0ECE6',
  },
  modalConfirmBtn: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0 : 0.14,
    shadowRadius: 6,
    elevation: isDark ? 0 : 3,
  },
  modalConfirmBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bundleCard: {
    marginTop: 18,
    backgroundColor: isDark ? '#181615' : '#FAF7F2',
    borderRadius: 20,
    padding: 16,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E8CCB2',
  },
  bundleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  bundleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? '#2A201A' : '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8CCB2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bundleTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bundleSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  bundleItemsList: {
    gap: 8,
  },
  bundleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.2,
    borderColor: isDark ? 'transparent' : '#E8E1D8',
  },
  bundleItemRowActive: {
    borderColor: '#9C7156',
  },
  bundleCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#9C7156',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bundleCheckboxActive: {
    backgroundColor: '#9C7156',
  },
  bundleItemThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    marginRight: 10,
  },
  bundleItemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  bundleItemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9C7156',
  },
  bundleAddBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  bundleAddBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shareModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  shareModalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sharePreviewCard: {
    backgroundColor: '#F6F4EC',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8CCB2',
    marginBottom: 16,
  },
  shareCardImageWrap: {
    width: '100%',
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  shareCardImage: {
    width: '100%',
    height: '100%',
  },
  shareBrandBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(43, 41, 40, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shareBrandBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shareCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareCardCategory: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#9C7156',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  shareCardProductName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '800',
    color: '#2B2928',
    lineHeight: 20,
    marginBottom: 4,
  },
  shareCardPrice: {
    fontSize: 17,
    fontWeight: '700',
    color: '#9C7156',
    marginBottom: 4,
  },
  shareCardQrHint: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#6E665D',
  },
  shareQrBox: {
    width: 76,
    height: 76,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  shareQrImg: {
    width: '100%',
    height: '100%',
  },
  shareActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copyLinkBtn: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.2,
    borderColor: '#9C7156',
    backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  copyLinkBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? '#E8CCB2' : '#9C7156',
  },
  shareNowBtn: {
    flex: 1.25,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  shareNowBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
