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
  Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
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
  const { addToCart, cartCount, applyCoupon, flyToCart } = useCart();
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

  // Vouchers, Gợi ý, Lịch sử đã xem
  const [availableCoupons, setAvailableCoupons] = useState<CouponItem[]>([]);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getProductById(id)
        .then((res) => {
          setProduct(res);
          if (res) {
            // Lưu vào danh sách đã xem gần đây
            addRecentlyViewed(res);

            // Tìm và chọn biến thể
            if (variantParam) {
              const matchColor = res.colorVariants?.find((v) => v.name === variantParam);
              const matchPattern = res.patternVariants?.find((v) => v.name === variantParam);
              const matchCombo = res.comboVariants?.find((v) => v.name === variantParam);
              if (matchColor) {
                setSelectedVariant({ ...matchColor, type: 'color' });
                setModalVariant({ ...matchColor, type: 'color' });
              } else if (matchPattern) {
                setSelectedVariant({ ...matchPattern, type: 'pattern' });
                setModalVariant({ ...matchPattern, type: 'pattern' });
              } else if (matchCombo) {
                setSelectedVariant({ ...matchCombo, type: 'combo' });
                setModalVariant({ ...matchCombo, type: 'combo' });
              } else if (res.colorVariants && res.colorVariants.length > 0) {
                setSelectedVariant({ ...res.colorVariants[0], type: 'color' });
                setModalVariant({ ...res.colorVariants[0], type: 'color' });
              } else if (res.patternVariants && res.patternVariants.length > 0) {
                setSelectedVariant({ ...res.patternVariants[0], type: 'pattern' });
                setModalVariant({ ...res.patternVariants[0], type: 'pattern' });
              }
            } else {
              if (res.colorVariants && res.colorVariants.length > 0) {
                setSelectedVariant({ ...res.colorVariants[0], type: 'color' });
                setModalVariant({ ...res.colorVariants[0], type: 'color' });
              } else if (res.patternVariants && res.patternVariants.length > 0) {
                setSelectedVariant({ ...res.patternVariants[0], type: 'pattern' });
                setModalVariant({ ...res.patternVariants[0], type: 'pattern' });
              }
            }

            // Tải sản phẩm gợi ý cùng danh mục
            getProducts({ category: res.category, maxItems: 8, expandVariants: false })
              .then((sugg) => {
                setSuggestedProducts(sugg.filter((p) => p.id !== res.id).slice(0, 6));
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

  // Danh sách hình ảnh
  const baseImages = (product?.images && product.images.length > 0)
    ? product.images
    : product?.imageUrl
    ? [product.imageUrl]
    : product
    ? ['https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?q=80&w=800&auto=format&fit=crop']
    : [];

  const allImages = [...baseImages];
  const collectImages = (variants?: ProductVariant[]) => {
    if (!variants) return;
    variants.forEach((v) => {
      if (v.imageUrl && !allImages.includes(v.imageUrl)) {
        allImages.push(v.imageUrl);
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
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
        {/* Floating Header cho Skeleton */}
        <View style={styles.floatingHeader}>
          <BlurButton style={styles.headerBtn} onPress={() => router.back()} accessibilityLabel="Quay lại">
            <Ionicons name="chevron-back" size={22} color="#2B2928" style={{ marginLeft: -1 }} />
          </BlurButton>
          <View style={styles.headerRightGroup}>
            <BlurButton style={styles.headerBtn} disabled>
              <Ionicons name="heart-outline" size={20} color="#2B2928" />
            </BlurButton>
            <BlurButton style={styles.headerBtn} disabled>
              <Ionicons name="bag-handle-outline" size={20} color="#2B2928" />
            </BlurButton>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <ProductDetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>{t('productNotFound')}</Text>
        <TouchableOpacity style={styles.backHomeBtn} onPress={() => router.back()}>
          <Text style={styles.backHomeText}>{t('productBack')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
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
  const currentPrice = selectedVariant?.price
    ? selectedVariant.price
    : product.salePrice
    ? product.salePrice
    : product.sale
    ? Math.round(product.price * (1 - product.sale / 100))
    : product.price;

  const currentOriginalPrice = selectedVariant?.price ? selectedVariant.price : product.price;
  const hasDiscount = currentPrice < currentOriginalPrice;
  const maxStock = selectedVariant?.stock ?? product.stock ?? 10;
  const isOutOfStock = checkOutOfStock(product, selectedVariant);

  // Tính giá & tồn kho của modal biến thể
  const activeModalVariant = modalVariant || selectedVariant;
  const modalEffectivePrice = activeModalVariant?.price
    ? activeModalVariant.price
    : product.salePrice
    ? product.salePrice
    : product.sale
    ? Math.round(product.price * (1 - product.sale / 100))
    : product.price;

  const modalStock = activeModalVariant?.stock ?? product.stock ?? 10;
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
      setModalVariant(selectedVariant || allVariants[0]);
      setModalQuantity(quantity);
      setVariantModalVisible(true);
    } else {
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

  const handleShareProduct = async () => {
    try {
      const shareUrl = `https://tiemnhagom.vn/product/?id=${product.id}`;
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />

      {/* Floating Header không vạch kẻ đáy, nút tròn 40px chuẩn GEMINI.md */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.floatingHeader}>
        <BlurButton style={styles.headerBtn} onPress={() => router.back()} accessibilityLabel="Quay lại">
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />
        </BlurButton>

        <View style={styles.headerRightGroup}>
          <BlurButton style={styles.headerBtn} onPress={handleShareProduct} accessibilityLabel="Chia sẻ sản phẩm">
            <Ionicons name="share-social-outline" size={20} color={Colors.textPrimary} />
          </BlurButton>

          <BlurButton style={styles.headerBtn} onPress={() => toggleFavorite(product.id)} accessibilityLabel="Yêu thích">
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={20}
              color={favorite ? Colors.badgeSale : Colors.textPrimary}
            />
          </BlurButton>

          <View ref={headerCartRef} collapsable={false}>
            <RNAnimated.View style={{ transform: [{ scale: headerCartScale }] }}>
              <BlurButton style={styles.headerBtn} onPress={() => router.push('/cart')} accessibilityLabel="Giỏ hàng">
                <Ionicons name="bag-handle-outline" size={20} color={Colors.textPrimary} />
                {cartCount > 0 && (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                  </View>
                )}
              </BlurButton>
            </RNAnimated.View>
          </View>
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
          <Text style={styles.productTitle}>{product.name}</Text>

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
            <Text style={styles.mainPrice}>{formatCurrency(currentPrice)}</Text>
            {hasDiscount && (
              <Text style={styles.strikePrice}>{formatCurrency(currentOriginalPrice)}</Text>
            )}
            {product.sale && product.sale > 0 ? (
              <View style={styles.saleTag}>
                <Text style={styles.saleTagText}>-{product.sale}%</Text>
              </View>
            ) : null}
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

      {/* Bottom Sticky CTA dạng viên thuốc Pill chuẩn GEMINI.md */}
      <Animated.View entering={SlideInDown.duration(500).delay(300)} style={styles.bottomBar}>
        <View ref={ctaBtnRef} collapsable={false} style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={[styles.addToCartBtn, isOutOfStock && styles.btnDisabled]}
            onPress={() => handleOpenActionModal('cart')}
            disabled={isOutOfStock}
            activeOpacity={0.84}
          >
            <Ionicons name="bag-add-outline" size={20} color="#9C7156" />
            <Text style={styles.addToCartText}>{t('addToCartAction')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buyNowBtn, isOutOfStock && styles.btnDisabled]}
            onPress={() => handleOpenActionModal('buy')}
            disabled={isOutOfStock}
            activeOpacity={0.88}
          >
            <Text style={styles.buyNowText}>{isOutOfStock ? t('outOfStock') : t('buyNowAction')}</Text>
            {!isOutOfStock && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />}
          </TouchableOpacity>
        </View>
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
                <Text style={styles.modalPriceText}>{formatCurrency(modalEffectivePrice)}</Text>
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

            {/* Chọn số lượng trong modal */}
            <View style={styles.modalQuantityRow}>
              <Text style={styles.modalSectionTitle}>{t('quantityLabel').replace(':', '')}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setModalQuantity((q) => Math.max(1, q - 1))}
                  disabled={modalQuantity <= 1}
                >
                  <Ionicons name="remove" size={16} color={modalQuantity <= 1 ? Colors.textMuted : Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.qtyNumber}>{modalQuantity}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setModalQuantity((q) => Math.min(modalStock, q + 1))}
                  disabled={modalQuantity >= modalStock}
                >
                  <Ionicons name="add" size={16} color={modalQuantity >= modalStock ? Colors.textMuted : Colors.textPrimary} />
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
    </SafeAreaView>
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
    top: 44,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
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
    borderColor: isDark ? '#121212' : '#FFFFFF',
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'ElleGaborStd',
  },
  scrollContent: {
    paddingBottom: 110,
  },
  carouselContainer: {
    width: width,
    height: width,
    marginTop: 32,
    backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
    position: 'relative',
  },
  carouselItem: {
    width: width,
    height: width,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
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

  /* Bottom Bar dạng viên thuốc chuẩn GEMINI.md */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.96)' : 'rgba(255, 255, 255, 0.96)',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: 8,
    elevation: isDark ? 0 : 6,
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
    backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF',
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
});
