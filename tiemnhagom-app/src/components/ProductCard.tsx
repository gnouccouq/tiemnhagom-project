import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '../types';
import { formatCurrency } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';

interface ProductCardProps {
  product: Product;
  cardWidth?: number;
}

const { width } = Dimensions.get('window');
const DEFAULT_CARD_WIDTH = (width - 32 - 12) / 2;

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  cardWidth = DEFAULT_CARD_WIDTH,
}) => {
  const router = useRouter();
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();

  const targetProductId = product.parentProductId || product.id;
  const favorite = isFavorite(targetProductId);

  const heartScale = useRef(new Animated.Value(1)).current;
  const addScale = useRef(new Animated.Value(1)).current;

  const effectivePrice = product.salePrice
    ? product.salePrice
    : product.sale
    ? Math.round(product.price * (1 - product.sale / 100))
    : product.price;

  const hasDiscount =
    (product.sale && product.sale > 0) ||
    (product.salePrice && product.salePrice < product.price);

  const discountPercent =
    product.sale ||
    (product.salePrice ? Math.round((1 - product.salePrice / product.price) * 100) : 0);

  const imageUri =
    product.imageUrl ||
    (product.images && product.images[0]) ||
    'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d';

  const handleCardPress = () => {
    router.push({
      pathname: '/product/[id]',
      params: {
        id: targetProductId,
        ...(product.selectedVariant?.name ? { variant: product.selectedVariant.name } : {}),
      },
    });
  };

  const handleFavoritePress = (e: any) => {
    e.stopPropagation?.();
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.35, duration: 110, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }),
    ]).start();
    toggleFavorite(targetProductId);
  };

  const handleQuickAdd = (e: any) => {
    e.stopPropagation?.();
    Animated.sequence([
      Animated.timing(addScale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(addScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
    ]).start();
    addToCart(product, 1, product.selectedVariant);
  };

  const isSoldOut = product.stock !== undefined && product.stock <= 0;

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      onPress={handleCardPress}
      activeOpacity={0.88}
    >
      {/* 1. KHU VỰC HÌNH ẢNH SẢN PHẨM */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
          transition={250}
          cachePolicy="memory-disk"
        />

        {/* Nút Yêu Thích Glassmorphism với animation nảy */}
        <Animated.View style={{ transform: [{ scale: heartScale }], position: 'absolute', top: 8, right: 8, zIndex: 12 }}>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={handleFavoritePress}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Thêm vào yêu thích"
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={16}
              color={favorite ? '#E11D48' : '#27272A'}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Huy Hiệu Badges Hình Tròn Chuẩn Web (.product-badge-circle) */}
        <View style={styles.badgeContainer}>
          {hasDiscount ? (
            <View style={styles.circleBadgeSale}>
              <Text style={styles.circleBadgeSaleSmall}>GIẢM</Text>
              <Text style={styles.circleBadgeSaleText}>-{discountPercent}%</Text>
            </View>
          ) : null}

          {product.isBestSeller ? (
            <View style={styles.circleBadgeHot}>
              <Text style={styles.circleBadgeHotSmall}>BÁN</Text>
              <Text style={styles.circleBadgeHotText}>CHẠY</Text>
            </View>
          ) : null}
        </View>

        {/* Overlay Hết hàng */}
        {isSoldOut && (
          <View style={styles.outOfStockOverlay}>
            <View style={styles.outOfStockPill}>
              <Text style={styles.outOfStockText}>Tạm hết hàng</Text>
            </View>
          </View>
        )}
      </View>

      {/* 2. THÔNG TIN SẢN PHẨM */}
      <View style={styles.content}>
        {/* Hàng Danh mục & Số lượng bán */}
        <View style={styles.metaRow}>
          <Text style={styles.category} numberOfLines={1}>
            {product.parentProductId || product.id}
          </Text>
          {product.sold && product.sold > 0 ? (
            <Text style={styles.soldText}>Đã bán {product.sold}</Text>
          ) : null}
        </View>

        {/* Tên sản phẩm */}
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Biến thể màu sắc thu nhỏ (nếu có) */}
        {product.colorVariants && product.colorVariants.length > 0 ? (
          <View style={styles.variantsRow}>
            {product.colorVariants.slice(0, 3).map((v, idx) => (
              <View
                key={idx}
                style={[
                  styles.colorDot,
                  { backgroundColor: v.hex || '#D4D4D8' },
                ]}
              />
            ))}
            {product.colorVariants.length > 3 ? (
              <Text style={styles.moreVariantsText}>
                +{product.colorVariants.length - 3}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Hàng Giá & Nút Thêm Giỏ Hàng có animation nảy */}
        <View style={styles.priceRow}>
          <View style={styles.priceWrap}>
            <Text style={styles.effectivePrice}>
              {formatCurrency(effectivePrice)}
            </Text>
            {hasDiscount ? (
              <Text style={styles.originalPrice}>
                {formatCurrency(product.price)}
              </Text>
            ) : null}
          </View>

          <Animated.View style={{ transform: [{ scale: addScale }] }}>
            <TouchableOpacity
              style={[styles.quickAddButton, isSoldOut && styles.quickAddButtonDisabled]}
              onPress={handleQuickAdd}
              disabled={isSoldOut}
              activeOpacity={0.8}
              accessibilityLabel="Thêm vào giỏ"
            >
              <Ionicons name="bag-add" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#18181B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1.02,
    backgroundColor: '#FAF8F5',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#F3EFE9',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    gap: 4,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  circleBadgeSale: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 3,
    transform: [{ rotate: '-8deg' }],
  },
  circleBadgeSaleSmall: {
    fontFamily: 'ElleGaborStd',
    fontSize: 7.5,
    fontWeight: '800',
    color: '#FFFFFF',
    opacity: 0.9,
    lineHeight: 8.5,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  circleBadgeSaleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 11,
  },
  circleBadgeHot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FCD9C6',
    borderWidth: 1,
    borderColor: 'rgba(156, 54, 21, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    transform: [{ rotate: '10deg' }],
  },
  circleBadgeHotSmall: {
    fontFamily: 'ElleGaborStd',
    fontSize: 7.5,
    fontWeight: '700',
    color: '#9C3615',
    opacity: 0.85,
    lineHeight: 8.5,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  circleBadgeHotText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    fontWeight: '800',
    color: '#9C3615',
    lineHeight: 11,
    textTransform: 'uppercase',
  },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  outOfStockPill: {
    backgroundColor: 'rgba(24, 24, 27, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  outOfStockText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: 10,
    flex: 1,
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  category: {
    fontFamily: 'ElleGaborStd',
    fontSize: 9.5,
    color: '#9C7156',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  soldText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#A1A1AA',
    fontWeight: '500',
    marginLeft: 4,
  },
  name: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#18181B',
    lineHeight: 18,
    minHeight: 36,
    marginBottom: 4,
  },
  variantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  moreVariantsText: {
    fontSize: 9,
    color: '#71717A',
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  priceWrap: {
    flex: 1,
  },
  effectivePrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '800',
    color: '#18181B',
  },
  originalPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#A1A1AA',
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  quickAddButton: {
    backgroundColor: '#18181B',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  quickAddButtonDisabled: {
    backgroundColor: '#D4D4D8',
  },
});
