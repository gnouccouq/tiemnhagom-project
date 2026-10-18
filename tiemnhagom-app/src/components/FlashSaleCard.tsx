// src/components/FlashSaleCard.tsx
import { useThemeColor } from '../constants/theme';
import React, { useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { checkOutOfStock } from '../utils/format';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../utils/format';
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
const DEFAULT_CARD_WIDTH = (width - 32 - 12) / 2;

export const FlashSaleCard: React.FC<FlashSaleCardProps> = React.memo(({
  product,
  cardWidth = DEFAULT_CARD_WIDTH,
}) => {
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { addToCart, flyToCart } = useCart();
  const { isFavorite, toggleFavorite } = useWishlist();

  const targetProductId = product.parentProductId || product.id;
  const favorite = isFavorite(targetProductId);

  const heartScale = useRef(new Animated.Value(1)).current;
  const addScale = useRef(new Animated.Value(1)).current;
  const quickAddRef = useRef<View>(null);

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
      quickAddRef.current.measureInWindow((x, y, w, h) => {
        const validX = typeof x === 'number' && !isNaN(x) && x > 0 ? x + w / 2 : undefined;
        const validY = typeof y === 'number' && !isNaN(y) && y > 0 ? y + h / 2 : undefined;
        flyToCart(imageUri, validX, validY);
      });
    } else {
      flyToCart(imageUri);
    }

    addToCart(product, 1, product.selectedVariant);
  };

  // Tính thanh tiến độ bán
  const soldCount = fsInfo?.sold || product.sold || 0;
  const limitCount = fsInfo?.limit || (soldCount > 0 ? soldCount + 10 : 20);
  const progressRatio = Math.min(1, Math.max(0.12, limitCount > 0 ? soldCount / limitCount : 0.2));
  const isAlmostSoldOut = progressRatio >= 0.8 && !isSoldOut;

  return (
    <ScalePressable
      style={[styles.card, { width: cardWidth }]}
      onPress={handleCardPress}
      activeScale={0.97}
    >
      {/* 1. KHU VỰC HÌNH ẢNH */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          cachePolicy="disk"
          recyclingKey={imageUri}
        />

        {/* Nút Yêu Thích hình tròn */}
        <Animated.View style={{ transform: [{ scale: heartScale }], position: 'absolute', top: 8, right: 8, zIndex: 12 }}>
          <ScalePressable
            style={styles.favoriteButton}
            onPress={handleFavoritePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Thêm vào yêu thích"
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={16}
              color={favorite ? '#9C7156' : (isDark ? '#B0B0B0' : '#6E665D')}
            />
          </ScalePressable>
        </Animated.View>

        {/* Badges Flash Sale */}
        <View style={styles.badgeContainer}>
          {fsInfo?.isBogo ? (
            <View style={styles.bogoBadge}>
              <Text style={styles.bogoBadgeText}>{t('buy1Get1Badge')}</Text>
            </View>
          ) : hasDiscount ? (
            <View style={styles.saleBadge}>
              <Text style={styles.saleBadgeText}>-{discountPercent}%</Text>
            </View>
          ) : null}
        </View>

        {/* Overlay Hết hàng */}
        {isSoldOut && (
          <View style={styles.outOfStockOverlay}>
            <BlurView intensity={30} tint="dark" style={styles.outOfStockCircle} blurMethod="none">
              <Text style={styles.outOfStockText}>{t('outOfStock')}</Text>
            </BlurView>
          </View>
        )}
      </View>

      {/* 2. THÔNG TIN & TIẾN ĐỘ BÁN */}
      <View style={styles.content}>
        {/* Tên sản phẩm */}
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Thanh tiến độ Flash Sale (Shopee style với tone gốm ấm) */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressRatio * 100}%` }]} />
          </View>
          <View style={styles.progressLabelWrap}>
            <Text style={styles.progressLabel}>
              {isSoldOut
                ? t('outOfStock')
                : isAlmostSoldOut
                ? `🔥 ${t('almostSoldOut')}`
                : `${t('soldCount')} ${soldCount}`}
            </Text>
          </View>
        </View>

        {/* Hàng Giá & Nút Thêm Giỏ Hàng */}
        <View style={styles.priceRow}>
          <View style={styles.priceWrap}>
            <Text style={styles.effectivePrice}>
              {formatCurrency(effectivePrice)}
            </Text>
            {hasDiscount ? (
              <Text style={styles.originalPrice}>
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
                accessibilityLabel={t('addToCartAction')}
              >
                <Ionicons
                  name="bag-add"
                  size={17}
                  color={isSoldOut ? '#A8A096' : '#FFFFFF'}
                />
              </ScalePressable>
            </Animated.View>
          </View>
        </View>
      </View>
    </ScalePressable>
  );
});

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.border || '#E8E1D8'),
      overflow: 'hidden',
      marginBottom: 14,
      shadowColor: '#2B2928',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 8,
      elevation: isDark ? 0 : 2,
    },
    imageContainer: {
      width: '100%',
      aspectRatio: 1.02,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      position: 'relative',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    favoriteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
    },
    badgeContainer: {
      position: 'absolute',
      top: 8,
      left: 8,
      zIndex: 10,
      flexDirection: 'column',
      gap: 4,
    },
    bogoBadge: {
      backgroundColor: '#9C7156',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    bogoBadgeText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    saleBadge: {
      backgroundColor: '#9C7156',
      paddingHorizontal: 7,
      paddingVertical: 3.5,
      borderRadius: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    saleBadgeText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    outOfStockOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 15,
    },
    outOfStockCircle: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      overflow: 'hidden',
    },
    outOfStockText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    content: {
      padding: 10,
      flex: 1,
      justifyContent: 'space-between',
    },
    name: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: Colors.textPrimary,
      lineHeight: 17,
      minHeight: 34,
      marginBottom: 6,
    },
    progressContainer: {
      position: 'relative',
      height: 16,
      borderRadius: 8,
      overflow: 'hidden',
      justifyContent: 'center',
      marginBottom: 8,
    },
    progressBarBg: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isDark ? '#262626' : '#EDE8E1',
      borderRadius: 8,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#9C7156',
      borderRadius: 8,
      opacity: 0.9,
    },
    progressLabelWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    progressLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
      textShadowColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    priceWrap: {
      flex: 1,
      marginRight: 6,
    },
    effectivePrice: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: '#9C7156',
      lineHeight: 18,
    },
    originalPrice: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: isDark ? '#8A8A8A' : '#9E968D',
      textDecorationLine: 'line-through',
      marginTop: 1,
    },
    quickAddButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
    quickAddButtonDisabled: {
      backgroundColor: isDark ? '#333333' : '#D1C8BD',
      shadowOpacity: 0,
      elevation: 0,
    },
  });
