// app/cart.tsx
// Màn hình Giỏ hàng riêng biệt (Standalone Screen) - Tách khỏi Tab Bar, có nút quay lại
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState } from '../src/components/EmptyState';
import { BlurButton } from '../src/components/BlurButton';
import { LiquidGlass, LiquidGlassContainerView } from '../src/components/LiquidGlass';
import { useThemeColor } from '../src/constants/theme';
import { useCart } from '../src/context/CartContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { formatCurrency } from '../src/utils/format';
import { getRecentlyViewed, RecentlyViewedItem } from '../src/utils/recentViews';
import { getBestSellingProducts } from '../src/services/productService';
import { Product } from '../src/types';

export default function CartScreen() {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    cart,
    updateQuantity,
    removeFromCart,
    clearCart,
    cartCount,
    subtotal,
    memberTier,
    flyToCart,
    addToCart,
    appliedCoupon,
    appliedCouponItem,
    discountAmount,
    removeCoupon,
  } = useCart();

  const { t } = useSettings();
  const dialog = useDialog();

  const [scrollY, setScrollY] = useState(0);
  const { pageStyle } = usePageAnimation({ itemCount: 10, delay: 40 });

  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    let isCancelled = false;
    getBestSellingProducts(6)
      .then((items) => {
        if (!isCancelled) {
          setSuggestedProducts(items);
        }
      })
      .catch(() => {});

    getRecentlyViewed()
      .then((recents) => {
        if (!isCancelled) {
          setRecentProducts(recents);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const confirmClearCart = () => {
    dialog.confirm(
      t('clearCartTitle') || 'Xóa toàn bộ giỏ hàng',
      t('clearCartMsg') || 'Bạn có chắc muốn xóa tất cả sản phẩm đang có trong giỏ hàng không?',
      clearCart,
      t('clearAll') || 'Xóa ngay',
      t('cancel') || 'Hủy',
      true
    );
  };

  const handleProceedToCheckout = () => {
    if (cart.length === 0) return;
    router.push('/checkout');
  };

  if (cart.length === 0) {
    return (
      <View style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        {/* Header với nút quay lại khi giỏ hàng trống */}
        <View style={[styles.customHeader, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4), height: insets.top + 56 }]}>
          <BlurButton
            onPress={handleGoBack}
            accessibilityLabel={t('back') || 'Quay lại'}
          >
            <Ionicons name="arrow-back" size={20} color={isDark ? '#F5F5F5' : '#2B2928'} />
          </BlurButton>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {t('cartHeader') || 'Giỏ hàng'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingTop: insets.top + 64,
            paddingBottom: Math.max(insets.bottom, 24) + 32,
          }}
        >
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="bag-handle-outline"
              title={t('emptyCartTitle') || 'Giỏ hàng trống'}
              message={t('emptyCartMsg') || 'Bạn chưa có sản phẩm gốm nào trong giỏ. Hãy dạo quanh cửa hàng và chọn những món ưng ý nhé!'}
              buttonText={t('exploreCeramics') || 'Khám phá đồ gốm ngay'}
              onButtonPress={() => router.push('/(tabs)/products')}
            />
          </View>

          {recentProducts.length > 0 && (
            <View style={[styles.crossSellSection, { paddingHorizontal: 16, marginTop: 12 }]}>
              <Text style={styles.crossSellSectionTitle}>{t('recentlyViewedCeramics')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.crossSellScrollContent}
              >
                {recentProducts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.crossSellCard}
                    onPress={() => router.push(`/product/${item.id}`)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.crossSellImg}
                      contentFit="cover"
                    />
                    <Text style={styles.crossSellName} numberOfLines={2} ellipsizeMode="tail">
                      {item.name}
                    </Text>
                    <View style={styles.crossSellBottomRow}>
                      <Text
                        style={styles.crossSellPrice}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {formatCurrency(item.salePrice || item.price)}
                      </Text>
                      <Ionicons name="arrow-forward-circle" size={24} color="#9C7156" />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  const freeShippingThreshold = 500000;
  const remainingForFreeShip = Math.max(0, freeShippingThreshold - subtotal);

  // Vị trí thanh thanh toán dính đáy: dock sát mép đáy màn hình (không có bottom bar)
  const bottomBarOffset = Math.max(insets.bottom, 14);

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header không có vạch kẻ đáy theo chuẩn GEMINI.md, đồng bộ chiều cao insets.top + 56 */}
      <View style={[styles.customHeader, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4), height: insets.top + 56 }]}>
        <View style={[StyleSheet.absoluteFill, { height: insets.top + 56 + 24 }]} pointerEvents="none">
          <LinearGradient
            colors={
              Colors.cardBackground !== '#FFFFFF'
                ? [
                    'rgba(0,0,0,0.85)',
                    'rgba(0,0,0,0.72)',
                    'rgba(0,0,0,0.45)',
                    'rgba(0,0,0,0.15)',
                    'rgba(0,0,0,0)',
                  ]
                : [
                    'rgba(250,248,245,0.88)',
                    'rgba(250,248,245,0.75)',
                    'rgba(250,248,245,0.45)',
                    'rgba(250,248,245,0.15)',
                    'rgba(250,248,245,0)',
                  ]
            }
            locations={[0, 0.40, 0.70, 0.88, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Nhóm tiêu đề bên trái chuẩn GEMINI.md Mục 1: Nút quay lại + Tiêu đề cạnh nhau */}
        <View style={styles.headerLeftGroup}>
          <BlurButton
            onPress={handleGoBack}
            accessibilityLabel={t('back') || 'Quay lại'}
          >
            <Ionicons name="arrow-back" size={20} color={isDark ? '#F5F5F5' : '#2B2928'} />
          </BlurButton>

          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {t('cartHeader') || 'Giỏ hàng'}
          </Text>
        </View>

        {/* Nút xoá tất cả bên phải bọc LiquidGlassContainerView */}
        <LiquidGlassContainerView spacing={20} style={styles.headerRightGroup}>
          <BlurButton
            onPress={confirmClearCart}
            accessibilityLabel={t('clear') || 'Xóa tất cả'}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error || '#DC2626'} />
          </BlurButton>
        </LiquidGlassContainerView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 56 + 4,
            paddingBottom: bottomBarOffset + 85,
          },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Banner tiến độ Freeship */}
        <View style={styles.freeShipNoticeCard}>
          <Ionicons
            name={remainingForFreeShip === 0 ? 'checkmark-circle' : 'gift-outline'}
            size={20}
            color="#9C7156"
          />
          <Text style={styles.freeShipNoticeText}>
            {remainingForFreeShip === 0
              ? t('freeShipQualifiedNotice')
              : t('freeShipRemainingNotice').replace('{amount}', formatCurrency(remainingForFreeShip))}
          </Text>
        </View>

        {/* Danh sách các sản phẩm trong giỏ để khách kiểm tra */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle} numberOfLines={1} ellipsizeMode="tail">
              {`${t('dishes') || 'Sản phẩm'} (${cartCount})`}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/products')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.editActionText}>+ {t('addMoreItems') || 'Thêm món nữa'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.itemList}>
            {cart.map((item) => {
              const itemTotal = item.price * item.quantity;
              const variantName = item.variant?.name || (typeof item.variant === 'string' ? item.variant : '');

              return (
                <View key={item.id} style={styles.cartItemRow}>
                  <Image
                    source={item.imageUrl ? { uri: item.imageUrl } : require('../assets/images/tiemnhagom.png')}
                    style={styles.itemImg}
                    contentFit="cover"
                  />

                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={2} ellipsizeMode="tail">
                      {item.name}
                    </Text>
                    {variantName ? (
                      <Text style={styles.itemVariantText} numberOfLines={1} ellipsizeMode="tail">
                        {variantName}
                      </Text>
                    ) : null}

                    {/* Stepper (-) qty (+) */}
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => updateQuantity(item.id, item.quantity - 1)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="remove" size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>

                      <Text style={styles.stepQtyText}>{item.quantity}</Text>

                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add" size={16} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.itemRightCol}>
                    <Text
                      style={styles.itemPriceText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {formatCurrency(itemTotal)}
                    </Text>
                    <TouchableOpacity
                      style={styles.itemDeleteBtn}
                      onPress={() => removeFromCart(item.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                      <Text style={styles.itemDeleteText}>{t('clear') || 'Xóa'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Khối gợi ý đồ gốm đi kèm ("Món xịn phải thử") */}
        {suggestedProducts.length > 0 && (
          <View style={styles.crossSellSection}>
            <Text style={styles.crossSellSectionTitle}>
              {t('mustTrySection') || 'Món xịn phải thử'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.crossSellScrollContent}
            >
              {suggestedProducts.map((p) => {
                const effPrice = p.salePrice || (p.sale ? Math.round(p.price * (1 - p.sale / 100)) : p.price);

                return (
                  <View key={p.id} style={styles.crossSellCard}>
                    <Image
                      source={p.imageUrl ? { uri: p.imageUrl } : require('../assets/images/tiemnhagom.png')}
                      style={styles.crossSellImg}
                      contentFit="cover"
                    />
                    <Text style={styles.crossSellName} numberOfLines={2} ellipsizeMode="tail">
                      {p.name}
                    </Text>
                    <View style={styles.crossSellBottomRow}>
                      <Text
                        style={styles.crossSellPrice}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {formatCurrency(effPrice)}
                      </Text>
                      <TouchableOpacity
                        style={styles.crossSellAddBtn}
                        onPress={() => {
                          addToCart(p, 1);
                          flyToCart(p.imageUrl || '');
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Khối Mã ưu đãi / Voucher (Đồng bộ với Kho quà & Web) */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="gift-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle} numberOfLines={1} ellipsizeMode="tail">
                {t('cartVoucherHeader') || 'Mã giảm giá / Ưu đãi'}
              </Text>
            </View>
            {(appliedCouponItem || appliedCoupon) && (
              <TouchableOpacity onPress={removeCoupon} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.removeVoucherText}>{t('removeVoucher') || 'Bỏ chọn'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.voucherActionRow}
            onPress={() => router.push('/select-voucher')}
            activeOpacity={0.85}
          >
            <View style={styles.voucherActionLeft}>
              <View style={styles.voucherIconCircle}>
                <Ionicons name="pricetag-outline" size={18} color="#9C7156" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.voucherActionTitle} numberOfLines={1} ellipsizeMode="tail">
                  {appliedCouponItem?.name || appliedCoupon || t('cartVoucherSelect') || 'Chọn hoặc nhập mã ưu đãi'}
                </Text>
                {discountAmount > 0 ? (
                  <Text style={styles.voucherActionSub} numberOfLines={1} ellipsizeMode="tail">
                    -{formatCurrency(discountAmount)} ({appliedCouponItem?.code || appliedCoupon})
                  </Text>
                ) : (
                  <Text style={styles.voucherActionHint} numberOfLines={1} ellipsizeMode="tail">
                    {t('singleUseOnlyNotice') || 'Mỗi voucher chỉ áp dụng 1 lần duy nhất'}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tóm tắt tạm tính giỏ hàng */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('subtotal') || 'Tạm tính'}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>

          {discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: '#9C7156' }]} numberOfLines={1} ellipsizeMode="tail">
                {t('voucherDiscountAmount') || 'Giảm giá Voucher'}{' '}
                {appliedCouponItem?.code || appliedCoupon ? `(${appliedCouponItem?.code || appliedCoupon})` : ''}
              </Text>
              <Text style={[styles.summaryValue, { color: '#9C7156', fontWeight: '700' }]}>
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
          )}

          {memberTier.discount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: '#9C7156' }]} numberOfLines={1} ellipsizeMode="tail">
                {t('memberTierDiscountLabel') || 'Ưu đãi hạng'} {memberTier.name} (-{memberTier.discount}%)
              </Text>
              <Text style={[styles.summaryValue, { color: '#9C7156', fontWeight: '700' }]}>
                {t('appliedAtCheckoutNotice')}
              </Text>
            </View>
          )}

          <Text style={styles.vatNoteText}>{t('vatIncludedNotice') || '(Giá đã bao gồm VAT)'}</Text>
        </View>

        {/* Tác phẩm bạn vừa ngắm (Recently Viewed) */}
        {recentProducts.length > 0 && (
          <View style={styles.crossSellSection}>
            <Text style={styles.crossSellSectionTitle}>{t('recentlyViewedCeramics')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.crossSellScrollContent}
            >
              {recentProducts.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.crossSellCard}
                  onPress={() => router.push(`/product/${item.id}`)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.crossSellImg}
                    contentFit="cover"
                  />
                  <Text style={styles.crossSellName} numberOfLines={2} ellipsizeMode="tail">
                    {item.name}
                  </Text>
                  <View style={styles.crossSellBottomRow}>
                    <Text
                      style={styles.crossSellPrice}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {formatCurrency(item.salePrice || item.price)}
                    </Text>
                    <Ionicons name="arrow-forward-circle" size={24} color="#9C7156" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Thanh thanh toán dính đáy màn hình bọc Liquid Glass chuẩn hệ thống iOS */}
      <View
        style={[styles.bottomStickyWrapper, { bottom: bottomBarOffset }]}
        pointerEvents="box-none"
      >
        <LiquidGlass
          style={styles.bottomStickyBar}
          interactive={true}
          effect="regular"
          isDark={isDark}
        >
          <View style={styles.bottomBarContent}>
            <View style={styles.bottomSubtotalCol}>
              <Text style={styles.bottomSubtotalLabel}>{t('subtotal') || 'Tạm tính'}</Text>
              <Text
                style={styles.bottomSubtotalValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {formatCurrency(Math.max(0, subtotal - discountAmount))}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.proceedPillBtn}
              onPress={handleProceedToCheckout}
              activeOpacity={0.88}
            >
              <Text style={styles.proceedBtnText}>{t('proceedToCheckout') || 'Tiến hành đặt hàng'}</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </LiquidGlass>
      </View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    customHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'android' ? 8 : 4,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      flex: 1,
      marginRight: 8,
    },
    headerRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    scrollContent: {
      paddingHorizontal: 16,
      gap: 14,
    },
    freeShipNoticeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      padding: 14,
      borderRadius: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    freeShipNoticeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: '#9C7156',
      fontWeight: '600',
      flex: 1,
      lineHeight: 18,
    },
    sectionCard: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 8,
    },
    headerIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      flexShrink: 1,
    },
    removeVoucherText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: Colors.error || '#DC2626',
    },
    voucherActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#1A1817' : '#FAF8F5',
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? '#262422' : '#E8E1D8',
    },
    voucherActionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 8,
    },
    voucherIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? '#261F1A' : '#F6F0EA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    voucherActionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    voucherActionSub: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#9C7156',
      marginTop: 2,
    },
    voucherActionHint: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: Colors.textMuted || '#71717A',
      marginTop: 2,
    },
    editActionText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#9C7156',
    },
    itemList: {
      gap: 12,
    },
    cartItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1E1E1E' : '#F6F4EC',
    },
    itemImg: {
      width: 72,
      height: 72,
      borderRadius: 16,
      backgroundColor: isDark ? '#1E1E1E' : '#F4EFEB',
      marginRight: 12,
    },
    itemInfo: {
      flex: 1,
      marginRight: 10,
    },
    itemName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 18,
      marginBottom: 4,
    },
    itemVariantText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
      marginBottom: 8,
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    stepBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#2E2E2E' : '#E8E1D8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepQtyText: {
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      minWidth: 20,
      textAlign: 'center',
    },
    itemRightCol: {
      alignItems: 'flex-end',
      gap: 10,
      flexShrink: 0,
    },
    itemPriceText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#9C7156',
    },
    itemDeleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    itemDeleteText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
      fontWeight: '600',
    },
    crossSellSection: {
      marginVertical: 4,
    },
    crossSellSectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 10,
    },
    crossSellScrollContent: {
      gap: 12,
    },
    crossSellCard: {
      width: 156,
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 10,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    crossSellImg: {
      width: '100%',
      height: 105,
      borderRadius: 14,
      backgroundColor: isDark ? '#1E1E1E' : '#F4EFEB',
      marginBottom: 8,
    },
    crossSellName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 16,
      height: 32,
      marginBottom: 6,
    },
    crossSellBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    crossSellPrice: {
      fontSize: 14,
      fontWeight: '700',
      color: '#9C7156',
      flexShrink: 1,
      marginRight: 6,
    },
    crossSellAddBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    summaryCard: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
      gap: 8,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
      flex: 1,
      marginRight: 8,
    },
    summaryValue: {
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      flexShrink: 0,
    },
    vatNoteText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
      textAlign: 'right',
      marginTop: 2,
    },
    bottomStickyWrapper: {
      position: 'absolute',
      left: 14,
      right: 14,
      zIndex: 50,
    },
    bottomStickyBar: {
      borderRadius: 36,
      paddingHorizontal: 18,
      paddingVertical: 10,
      overflow: 'hidden',
    },
    bottomBarContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
    },
    bottomSubtotalCol: {
      justifyContent: 'center',
      flexShrink: 0,
    },
    bottomSubtotalLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textSecondary,
      marginBottom: 2,
    },
    bottomSubtotalValue: {
      fontSize: 18,
      fontWeight: '700',
      color: '#9C7156',
    },
    proceedPillBtn: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    proceedBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 40,
    },
  });
