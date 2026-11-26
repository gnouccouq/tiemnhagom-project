// src/components/FlashSaleCard.tsx
import React, { useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkOutOfStock, formatCurrency } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useSettings } from '../context/SettingsContext';
import { ScalePressable } from './ScalePressable';
import { ProductWithFlashSale } from '../services/flashSaleService';

interface FlashSaleCardProps {
  product: ProductWithFlashSale;
  cardWidth?: number;
}

const { width } = Dimensions.get('window');
const DEFAULT_CARD_WIDTH = (width - 52) / 2;

export const FlashSaleCard: React.FC<FlashSaleCardProps> = React.memo(({
  product,
  cardWidth = DEFAULT_CARD_WIDTH,
}) => {
  const router = useRouter();
  const { t } = useSettings();
  const { addToCart, flyToCart } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();

  const targetProductId = product.parentProductId || product.id;
  const favorite = isFavorite(targetProductId);

  const heartScale = useRef(new Animated.Value(1)).current;
  const addScale = useRef(new Animated.Value(1)).current;
  const quickAddRef = useRef<any>(null);

  const fsInfo = product.flashSaleInfo;
  const effectivePrice = product.effectivePrice;
  const originalPrice = product.price;
  const hasDiscount = effectivePrice < originalPrice;
  const discountPercent = product.effectiveSalePercent;

  const imageUri =
    product.imageUrl ||
    (product.images && product.images[0]) ||
    'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d';

  const isSoldOut = checkOutOfStock(product, product.selectedVariant) || Boolean(fsInfo?.isSoldOut);
  const isUpcoming = Boolean(fsInfo?.isUpcoming);

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
    if (isSoldOut) return;
    Animated.sequence([
      Animated.timing(addScale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(addScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
    ]).start();

    if (quickAddRef.current?.measureInWindow) {
      quickAddRef.current.measureInWindow((x: number, y: number, w: number, h: number) => {
        const validX = typeof x === 'number' && !isNaN(x) && x > 0 ? x + w / 2 : undefined;
        const validY = typeof y === 'number' && !isNaN(y) && y > 0 ? y + h / 2 : undefined;
        flyToCart(imageUri, validX, validY);
      });
    } else {
      flyToCart(imageUri);
    }

    addToCart(product, 1, product.selectedVariant);
  };

  const soldCount = fsInfo?.sold || 0;
  const limitCount = fsInfo?.limit || 20;
  const progressRatio = isSoldOut ? 1 : limitCount > 0 ? Math.min(1, soldCount / limitCount) : 0;

  return (
    <ScalePressable
      style={[styles.card, { width: cardWidth }]}
      onPress={handleCardPress}
      activeScale={0.97}
    >
      {/* 1. Ảnh sản phẩm vuông 1:1 */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          cachePolicy="disk"
          recyclingKey={imageUri}
        />

        {/* Badge giảm giá / BOGO góc trái */}
        <View style={styles.badgeContainer}>
          {fsInfo?.isBogo ? (
            <View style={styles.discountPill}>
              <Text style={styles.discountPillText}>{t('buy1Get1Badge')}</Text>
            </View>
          ) : hasDiscount ? (
            <View style={styles.discountPill}>
              <Text style={styles.discountPillText}>-{discountPercent}%</Text>
            </View>
          ) : null}
        </View>

        {/* Nút Yêu thích góc phải */}
        <Animated.View style={[styles.favWrap, { transform: [{ scale: heartScale }] }]}>
          <ScalePressable
            style={styles.favoriteButton}
            onPress={handleFavoritePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={15}
              color={favorite ? '#B91C1C' : '#6E665D'}
            />
          </ScalePressable>
        </Animated.View>

        {isSoldOut && (
          <View style={styles.outOfStockOverlay}>
            <BlurView intensity={30} tint="dark" style={styles.outOfStockCircle}>
              <Text style={styles.outOfStockText}>{t('outOfStock')}</Text>
            </BlurView>
          </View>
        )}
      </View>

      {/* 2. Nội dung thẻ trắng chuẩn đồng bộ Web 12.12 */}
      <View style={styles.content}>
        <Text style={styles.dealHighlight} numberOfLines={1}>
          {product.dealLabel || (hasDiscount ? `DEAL SỐC 12.12 • -${discountPercent}%` : 'ƯU ĐÃI 12.12')}
        </Text>

        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Giá + Nút thêm nhanh */}
        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            <Text style={styles.effectivePrice} adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1}>
              {formatCurrency(effectivePrice)}
            </Text>
            {hasDiscount ? (
              <Text style={styles.originalPrice} numberOfLines={1}>
                {formatCurrency(originalPrice)}
              </Text>
            ) : null}
          </View>

          <View ref={quickAddRef} collapsable={false}>
            <Animated.View style={{ transform: [{ scale: addScale }] }}>
              <ScalePressable
                style={[styles.quickAddButton, isSoldOut && styles.quickAddButtonDisabled]}
                onPress={handleQuickAdd}
                disabled={isSoldOut}
              >
                <Ionicons name="bag-add" size={15} color={isSoldOut ? '#A8A096' : '#FFFFFF'} />
              </ScalePressable>
            </Animated.View>
          </View>
        </View>

        {/* Thanh suất bán dạng viên thuốc dưới đáy thẻ */}
        <View style={[styles.quotaBar, isUpcoming && styles.quotaBarUpcoming, isSoldOut && styles.quotaBarSoldOut]}>
          {!isUpcoming && progressRatio > 0 && (
            <View style={[styles.quotaFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
          )}
          <View style={styles.quotaContent}>
            <Ionicons
              name={isUpcoming ? 'time-outline' : 'flame'}
              size={11}
              color={isUpcoming ? '#7D563D' : progressRatio >= 0.55 ? '#FFFFFF' : '#7E3524'}
            />
            <Text
              style={[
                styles.quotaText,
                isUpcoming && styles.quotaTextUpcoming,
                !isUpcoming && progressRatio >= 0.55 && styles.quotaTextLight,
              ]}
              numberOfLines={1}
            >
              {isSoldOut
                ? `${t('outOfStock')} (${limitCount}/${limitCount})`
                : isUpcoming
                ? `Mở bán 12.12 · ${limitCount} suất`
                : `Đã bán ${soldCount}/${limitCount} suất`}
            </Text>
          </View>
        </View>
      </View>
    </ScalePressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F6F3EE',
    position: 'relative',
    marginBottom: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 10,
  },
  discountPill: {
    backgroundColor: '#9C3323',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  discountPillText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  favWrap: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 12,
  },
  favoriteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFE8DF',
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockCircle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  outOfStockText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  dealHighlight: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9C3323',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F1B18',
    lineHeight: 17.5,
    minHeight: 35,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  priceCol: {
    flex: 1,
    minWidth: 0,
  },
  effectivePrice: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#B91C1C',
  },
  originalPrice: {
    fontSize: 11,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  quickAddButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2B2928',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  quotaBar: {
    height: 22,
    borderRadius: 999,
    backgroundColor: '#F6DDD8',
    borderWidth: 1,
    borderColor: 'rgba(156, 51, 35, 0.16)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  quotaBarUpcoming: {
    backgroundColor: '#FAF5EF',
    borderColor: '#E5D5C3',
  },
  quotaBarSoldOut: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
  },
  quotaFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#B91C1C',
    borderRadius: 999,
  },
  quotaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    zIndex: 2,
  },
  quotaText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#5C1D15',
  },
  quotaTextUpcoming: {
    color: '#7D563D',
  },
  quotaTextLight: {
    color: '#FFFFFF',
  },
});
