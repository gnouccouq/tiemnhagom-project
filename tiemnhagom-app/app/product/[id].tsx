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
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { getProductById } from '../../src/services/productService';
import { Product, ProductVariant } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { useCart } from '../../src/context/CartContext';
import { useWishlist } from '../../src/context/WishlistContext';

const { width } = Dimensions.get('window');

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function ProductDetailScreen() {
  const { id, variant: variantParam } = useLocalSearchParams<{ id: string; variant?: string }>();
  const router = useRouter();
  const { addToCart, cartCount } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();

  const scrollViewRef = useRef<ScrollView>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(undefined);
  const [quantity, setQuantity] = useState<number>(1);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const isAutoPlayPaused = useRef(false);

  useEffect(() => {
    if (id) {
      getProductById(id)
        .then((res) => {
          setProduct(res);
          if (res) {
            // Nếu có variant param (từ việc click sản phẩm biến thể độc lập), tìm và chọn đúng biến thể
            if (variantParam) {
              const matchColor = res.colorVariants?.find((v) => v.name === variantParam);
              const matchPattern = res.patternVariants?.find((v) => v.name === variantParam);
              const matchCombo = res.comboVariants?.find((v) => v.name === variantParam);
              if (matchColor) {
                setSelectedVariant({ ...matchColor, type: 'color' });
              } else if (matchPattern) {
                setSelectedVariant({ ...matchPattern, type: 'pattern' });
              } else if (matchCombo) {
                setSelectedVariant({ ...matchCombo, type: 'combo' });
              } else if (res.colorVariants && res.colorVariants.length > 0) {
                setSelectedVariant({ ...res.colorVariants[0], type: 'color' });
              } else if (res.patternVariants && res.patternVariants.length > 0) {
                setSelectedVariant({ ...res.patternVariants[0], type: 'pattern' });
              }
            } else {
              // Tự động chọn biến thể đầu tiên nếu có
              if (res.colorVariants && res.colorVariants.length > 0) {
                setSelectedVariant({ ...res.colorVariants[0], type: 'color' });
              } else if (res.patternVariants && res.patternVariants.length > 0) {
                setSelectedVariant({ ...res.patternVariants[0], type: 'pattern' });
              }
            }
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id, variantParam]);

  // Danh sách hình ảnh (Cần tính toán trước các lệnh return sớm để đảm bảo Rules of Hooks)
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

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (images.length > 1) {
      interval = setInterval(() => {
        if (!isAutoPlayPaused.current) {
          setActiveImageIndex((prevIndex) => {
            const nextIndex = (prevIndex + 1) % images.length;
            scrollViewRef.current?.scrollTo({ x: nextIndex * width, animated: true });
            return nextIndex;
          });
        }
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [images.length]);


  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Đang tải thông tin sản phẩm gốm...</Text>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>Không tìm thấy sản phẩm</Text>
        <TouchableOpacity style={styles.backHomeBtn} onPress={() => router.back()}>
          <Text style={styles.backHomeText}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const favorite = isFavorite(product.id);

  // Tính giá hiệu lực (nếu biến thể có giá riêng thì ưu tiên)
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
  const isOutOfStock = maxStock <= 0;

  const handleAddToCart = () => {
    if (isOutOfStock) {
      Alert.alert('Thông báo', 'Sản phẩm hoặc phân loại này hiện đã tạm hết hàng.');
      return;
    }
    addToCart(product, quantity, selectedVariant);
    Alert.alert('Thành công', 'Đã thêm sản phẩm vào giỏ hàng!', [
      { text: 'Tiếp tục xem', style: 'cancel' },
      { text: 'Xem giỏ hàng', onPress: () => router.push('/cart') },
    ]);
  };

  const handleBuyNow = () => {
    if (isOutOfStock) {
      Alert.alert('Thông báo', 'Sản phẩm hoặc phân loại này hiện đã tạm hết hàng.');
      return;
    }
    addToCart(product, quantity, selectedVariant);
    router.push('/checkout');
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Floating Header */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.floatingHeader}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerRightGroup}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => toggleFavorite(product.id)}>
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={22}
              color={favorite ? Colors.badgeSale : Colors.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/cart')}>
            <Ionicons name="cart-outline" size={28} color={Colors.textPrimary} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
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
              setActiveImageIndex(idx);
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

          {images.length > 1 && (
            <View style={styles.dotsWrap}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, activeImageIndex === i && styles.activeDot]} />
              ))}
            </View>
          )}
        </Animated.View>

        {/* Thumbnails */}
        {images.length > 1 && (
          <View style={styles.thumbnailContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailList}>
              {images.map((imgUri, index) => (
                <AnimatedTouchableOpacity
                  key={index}
                  entering={ZoomIn.delay(200 + index * 50).springify()}
                  style={[styles.thumbnailWrap, activeImageIndex === index && styles.thumbnailActive]}
                  onPress={() => {
                    setActiveImageIndex(index);
                    scrollViewRef.current?.scrollTo({ x: index * width, animated: true });
                  }}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: imgUri }} style={styles.thumbnailImage} contentFit="cover" />
                </AnimatedTouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Content Details */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.detailContainer}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
            <Text style={styles.categoryBadge}>{product.category || 'Gốm sứ thủ công'}</Text>
            <Text style={{fontFamily: 'ElleGaborStd', fontSize: 13, color: '#7A827E', fontWeight: '600'}}>
              Mã SP: {product.parentProductId || product.id}
            </Text>
          </View>
          <Text style={styles.productTitle}>{product.name}</Text>

          {/* Rating & Sold count */}
          <View style={styles.statsRow}>
            <Text style={styles.soldText}>Đã bán {product.sold || 0}</Text>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.stockStatusText}>
              {isOutOfStock ? 'Hết hàng' : `Còn ${maxStock} sản phẩm`}
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

          {/* Color / Pattern Variants */}
          {product.colorVariants && product.colorVariants.length > 0 && (
            <View style={styles.variantSection}>
              <Text style={styles.variantSectionTitle}>
                Màu sắc: <Text style={styles.variantSelectedName}>{selectedVariant?.name || 'Chọn màu'}</Text>
              </Text>
              <View style={styles.variantsRow}>
                {product.colorVariants.map((v, i) => {
                  const isSelected = selectedVariant?.name === v.name;
                  return (
                    <AnimatedTouchableOpacity
                      key={i}
                      entering={ZoomIn.delay(300 + i * 50).springify()}
                      style={[styles.variantChip, isSelected && styles.variantChipSelected]}
                      onPress={() => setSelectedVariant({ ...v, type: 'color' })}
                    >
                      {v.hex && <View style={[styles.colorCircle, { backgroundColor: v.hex }]} />}
                      <Text style={[styles.variantChipText, isSelected && styles.variantChipTextSelected]}>
                        {v.name}
                      </Text>
                    </AnimatedTouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {product.patternVariants && product.patternVariants.length > 0 && (
            <View style={styles.variantSection}>
              <Text style={styles.variantSectionTitle}>
                Họa tiết: <Text style={styles.variantSelectedName}>{selectedVariant?.name || 'Chọn mẫu'}</Text>
              </Text>
              <View style={styles.variantsRow}>
                {product.patternVariants.map((v, i) => {
                  const isSelected = selectedVariant?.name === v.name;
                  return (
                    <AnimatedTouchableOpacity
                      key={i}
                      entering={ZoomIn.delay(300 + i * 50).springify()}
                      style={[styles.variantChip, isSelected && styles.variantChipSelected]}
                      onPress={() => setSelectedVariant({ ...v, type: 'pattern' })}
                    >
                      <Text style={[styles.variantChipText, isSelected && styles.variantChipTextSelected]}>
                        {v.name}
                      </Text>
                    </AnimatedTouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Quantity Selector */}
          <View style={styles.quantitySection}>
            <Text style={styles.variantSectionTitle}>Số lượng:</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >
                <Ionicons name="remove" size={16} color={quantity <= 1 ? Colors.textMuted : Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.qtyNumber}>{quantity}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                disabled={quantity >= maxStock}
              >
                <Ionicons name="add" size={16} color={quantity >= maxStock ? Colors.textMuted : Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={styles.descTitle}>Mô tả sản phẩm</Text>
            <Text style={styles.descText}>
              {parsedDesc}
            </Text>
          </View>

          {/* Specifications */}
          {(product.details?.material || dimString || product.specs?.weight || product.specs?.capacity) && (
            <View style={styles.descSection}>
              <Text style={styles.descTitle}>Thông số sản phẩm</Text>
              <View style={styles.specsContainer}>
                {product.details?.material && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Chất liệu:</Text>
                    <Text style={styles.specValue}>{product.details.material}</Text>
                  </View>
                )}
                {product.details?.origin && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Xuất xứ:</Text>
                    <Text style={styles.specValue}>{product.details.origin}</Text>
                  </View>
                )}
                {dimString !== '' && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Kích thước:</Text>
                    <Text style={styles.specValue}>{dimString}</Text>
                  </View>
                )}
                {product.specs?.weight && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Trọng lượng:</Text>
                    <Text style={styles.specValue}>{product.specs.weight} g</Text>
                  </View>
                )}
                {product.specs?.capacity && (
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Dung tích:</Text>
                    <Text style={styles.specValue}>{product.specs.capacity} ml</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Care Guide */}
          <View style={styles.descSection}>
            <Text style={styles.descTitle}>Bảo quản gốm sứ</Text>
            <View style={styles.careGrid}>
              <View style={styles.careCard}>
                <Ionicons name="thermometer-outline" size={24} color="#8A5A2B" style={styles.careIcon} />
                <Text style={styles.careTitle}>Sốc nhiệt</Text>
                <Text style={styles.careText}>Tránh đổi nhiệt độ đột ngột. Để nguội trước khi làm nóng.</Text>
              </View>
              <View style={styles.careCard}>
                <Ionicons name="water-outline" size={24} color="#8A5A2B" style={styles.careIcon} />
                <Text style={styles.careTitle}>Vệ sinh</Text>
                <Text style={styles.careText}>Dùng bọt biển mềm, tránh bùi nhùi kim loại chà xát mạnh.</Text>
              </View>
              <View style={styles.careCard}>
                <Ionicons name="snow-outline" size={24} color="#8A5A2B" style={styles.careIcon} />
                <Text style={styles.careTitle}>Máy rửa chén</Text>
                <Text style={styles.careText}>Xếp an toàn khoảng cách, tránh va chạm mép.</Text>
              </View>
              <View style={styles.careCard}>
                <Ionicons name="cube-outline" size={24} color="#8A5A2B" style={styles.careIcon} />
                <Text style={styles.careTitle}>Lưu trữ</Text>
                <Text style={styles.careText}>Lót lớp giấy/khăn khi xếp chồng để tránh xước men.</Text>
              </View>
            </View>
          </View>
          {/* Quality Guarantees */}
          <View style={styles.guaranteeBox}>
            <View style={styles.guaranteeItem}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
              <Text style={styles.guaranteeText}>Gốm nung 1200°C an toàn sức khỏe</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="cube-outline" size={20} color={Colors.primary} />
              <Text style={styles.guaranteeText}>Đóng gói chống sốc 3 lớp an tâm toàn quốc</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
              <Text style={styles.guaranteeText}>Đổi trả 1-1 miễn phí nếu sứt mẻ khi vận chuyển</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Bottom Sticky CTA */}
      <Animated.View entering={SlideInDown.duration(500).delay(300)} style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.addToCartBtn, isOutOfStock && styles.btnDisabled]}
          onPress={handleAddToCart}
          disabled={isOutOfStock}
          activeOpacity={0.8}
        >
          <Ionicons name="bag-add-outline" size={20} color="#18181B" />
          <Text style={styles.addToCartText}>Thêm vào giỏ</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buyNowBtn, isOutOfStock && styles.btnDisabled]}
          onPress={handleBuyNow}
          disabled={isOutOfStock}
          activeOpacity={0.88}
        >
          <Text style={styles.buyNowText}>{isOutOfStock ? 'Tạm hết hàng' : 'Mua ngay'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: Colors.textMuted,
    fontSize: Typography.fontSize.sm,
  },
  errorTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginVertical: Spacing.md,
  },
  backHomeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  backHomeText: {
    color: Colors.textInverse,
    fontWeight: '600',
  },
  floatingHeader: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  headerRightGroup: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cartBadgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  carouselContainer: {
    width: width,
    height: width,
    marginTop: 32,
    backgroundColor: Colors.background,
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
  dotsWrap: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  activeDot: {
    width: 18,
    backgroundColor: Colors.primary,
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
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbnailActive: {
    borderColor: '#18181B',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  detailContainer: {
    padding: Spacing.lg,
  },
  categoryBadge: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.primaryDark,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  productTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: 6,
  },
  starsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bullet: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
  },
  soldText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  stockStatusText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.md,
    gap: Spacing.sm,
  },
  mainPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xxl,
    fontWeight: '800',
    color: Colors.primary,
  },
  strikePrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.base,
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
  variantSection: {
    marginBottom: Spacing.md,
  },
  variantSectionTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  variantSelectedName: {
    fontFamily: 'ElleGaborStd',
    color: '#18181B',
    fontWeight: '700',
  },
  variantsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  variantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    gap: 6,
  },
  variantChipSelected: {
    borderColor: '#18181B',
    backgroundColor: '#F4F4F5',
  },
  colorCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  variantChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: '#5D6160',
  },
  variantChipTextSelected: {
    fontFamily: 'ElleGaborStd',
    color: '#18181B',
    fontWeight: '700',
  },
  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    overflow: 'hidden',
  },
  stepBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3EB',
  },
  qtyNumber: {
    fontFamily: 'ElleGaborStd',
    minWidth: 40,
    textAlign: 'center',
    fontSize: Typography.fontSize.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  descSection: {
    marginVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  descTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 12,
  },
  descText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#3B4D45',
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
    borderBottomColor: '#F0F0F0',
  },
  specLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#7A827E',
    width: 100,
  },
  specValue: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    color: '#3B4D45',
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
    backgroundColor: '#FAF8F5',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    alignItems: 'center',
    marginBottom: 8,
  },
  careIcon: {
    marginBottom: 8,
  },
  careTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#3B4D45',
    marginBottom: 4,
  },
  careText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#7A827E',
    textAlign: 'center',
    lineHeight: 16,
  },
  guaranteeBox: {
    backgroundColor: '#EEF3EB',
    padding: 16,
    borderRadius: 20,
    gap: 10,
    marginTop: Spacing.md,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  guaranteeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: '#3B4D45',
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E1E8DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 4,
  },
  addToCartBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#18181B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  addToCartText: {
    fontFamily: 'ElleGaborStd',
    color: '#18181B',
    fontWeight: '700',
    fontSize: 13,
  },
  buyNowBtn: {
    flex: 1.2,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
