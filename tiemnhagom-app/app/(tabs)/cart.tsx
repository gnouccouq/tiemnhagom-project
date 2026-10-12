// app/cart.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Header } from '../../src/components/Header';
import { BlurButton } from '../../src/components/BlurButton';
import { CartItemCard } from '../../src/components/CartItemCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useThemeColor, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useDialog } from '../../src/context/DialogContext';
import { usePageAnimation } from '../../src/hooks/usePageAnimation';
import { formatCurrency } from '../../src/utils/format';

export default function CartScreen() {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    cart,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    shippingFee,
    discountAmount,
    totalAmount,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    shippingMethod,
    setShippingMethod,
  } = useCart();
  const { t } = useSettings();
  const dialog = useDialog();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [scrollY, setScrollY] = useState(0);
  const { pageStyle, getItemStyle } = usePageAnimation({ itemCount: 10, delay: 40 });

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) return;
    const ok = applyCoupon(couponInput);
    if (ok) {
      setCouponError('');
      setCouponInput('');
    } else {
      setCouponError(t('invalidCoupon'));
    }
  };

  const handleCheckoutPress = () => {
    if (cart.length === 0) return;
    router.push('/checkout');
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

  if (cart.length === 0) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
        {/* Custom Header */}
        <View style={styles.customHeader}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>{t('cartHeader')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon="bag-handle-outline"
          title={t('emptyCartTitle')}
          message={t('emptyCartMsg')}
          buttonText={t('exploreCeramics')}
          onButtonPress={() => router.push('/(tabs)/products')}
        />
      </View>
    );
  }

  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      {/* Custom Header */}
      <View style={[styles.customHeader, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        {blurProgress > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: blurProgress }]} pointerEvents="none">
            <BlurView
              intensity={Platform.OS === 'ios' ? 85 : 75}
              tint={Colors.cardBackground === '#FFFFFF' ? 'light' : 'dark'}
              blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Colors.cardBackground === '#FFFFFF'
                      ? Platform.OS === 'ios' ? 'rgba(255,255,255,0.12)' : 'rgba(250,248,245,0.45)'
                      : Platform.OS === 'ios' ? 'rgba(30,30,30,0.12)' : 'rgba(30,30,30,0.45)',
                },
              ]}
            />
          </View>
        )}
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>{t('cartHeader')}</Text>
        {cart.length > 0 ? (
          <BlurButton
            style={styles.roundClearBtn}
            onPress={confirmClearCart}
            accessibilityLabel={t('clear') || 'Xóa tất cả'}
          >
            <Ionicons name="trash-outline" size={19} color={Colors.error || '#DC2626'} />
          </BlurButton>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[
          styles.scrollContent,
          { 
            paddingTop: insets.top + 54 + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 120,
          }
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Cart Header Action */}
        <View style={styles.cartTopBar}>
          <Text style={styles.cartTotalCount}>
            {cart.reduce((a, b) => a + b.quantity, 0)} {t('productsInCart')}
          </Text>
        </View>

        {/* Item List */}
        <View style={styles.itemList}>
          {cart.map((item) => (
            <CartItemCard
              key={item.id}
              item={item}
              onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
              onRemove={() => removeFromCart(item.id)}
            />
          ))}
        </View>

        {/* Shipping Method Selector */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>{t('shippingMethod')}</Text>

          <TouchableOpacity
            style={[styles.shippingOption, shippingMethod === 'standard' && styles.shippingOptionActive]}
            onPress={() => setShippingMethod('standard')}
          >
            <Ionicons
              name={shippingMethod === 'standard' ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={shippingMethod === 'standard' ? Colors.primary : Colors.textMuted}
            />
            <View style={styles.shippingTextWrap}>
              <Text style={styles.shippingTitle}>{t('standardDelivery')}</Text>
              <Text style={styles.shippingSub}>{t('standardDeliveryDesc')}</Text>
            </View>
            <Text style={styles.shippingPrice}>
              {subtotal >= 500000 ? t('free') : formatCurrency(20000)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shippingOption, shippingMethod === 'express_2h' && styles.shippingOptionActive]}
            onPress={() => setShippingMethod('express_2h')}
          >
            <Ionicons
              name={shippingMethod === 'express_2h' ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={shippingMethod === 'express_2h' ? Colors.primary : Colors.textMuted}
            />
            <View style={styles.shippingTextWrap}>
              <Text style={styles.shippingTitle}>{t('expressDelivery')}</Text>
              <Text style={styles.shippingSub}>{t('expressDeliveryDesc')}</Text>
            </View>
            <Text style={styles.shippingPrice}>{formatCurrency(35000)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shippingOption, shippingMethod === 'pickup' && styles.shippingOptionActive]}
            onPress={() => setShippingMethod('pickup')}
          >
            <Ionicons
              name={shippingMethod === 'pickup' ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={shippingMethod === 'pickup' ? Colors.primary : Colors.textMuted}
            />
            <View style={styles.shippingTextWrap}>
              <Text style={styles.shippingTitle}>{t('pickup')}</Text>
              <Text style={styles.shippingSub}>{t('pickupDesc')}</Text>
            </View>
            <Text style={styles.shippingPrice}>{formatCurrency(0)}</Text>
          </TouchableOpacity>
        </View>

        {/* Voucher / Mã giảm giá */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>{t('voucherDiscount')}</Text>
          {appliedCoupon ? (
            <View style={styles.appliedCouponRow}>
              <View style={styles.couponTag}>
                <Ionicons name="pricetag" size={16} color={Colors.primary} />
                <Text style={styles.couponCodeText}>{appliedCoupon}</Text>
              </View>
              <TouchableOpacity onPress={removeCoupon} style={styles.removeCouponBtn}>
                <Text style={styles.removeCouponText}>{t('remove')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.couponInputRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder={t('enterCoupon')}
                  placeholderTextColor={Colors.textMuted}
                  value={couponInput}
                  onChangeText={setCouponInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.applyCouponBtn} onPress={handleApplyCoupon}>
                  <Text style={styles.applyCouponText}>{t('apply')}</Text>
                </TouchableOpacity>
              </View>
              {couponError ? <Text style={styles.couponErrorText}>{couponError}</Text> : null}
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('subtotal')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('shippingFee')}</Text>
            <Text style={styles.summaryValue}>
              {shippingFee === 0 ? t('free') : formatCurrency(shippingFee)}
            </Text>
          </View>

          {discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: Colors.badgeSale }]}>{t('voucherDiscountAmount')}</Text>
              <Text style={[styles.summaryValue, { color: Colors.badgeSale }]}>
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryRowTotal}>
            <Text style={styles.totalLabel}>{t('totalPayment')}</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
          </View>
        </View>

        {/* Checkout Button */}
        <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckoutPress} activeOpacity={0.88}>
          <Text style={styles.checkoutBtnText}>{t('proceedToCheckout')}</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} />
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
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
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  roundClearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackground || '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerClearBtn: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: Colors.error,
    paddingHorizontal: 8,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl * 2,
  },
  cartTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  cartTotalCount: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  clearAllBtn: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.error,
    fontWeight: '600',
  },
  itemList: {
    marginBottom: Spacing.md,
  },
  sectionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: Colors.border,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  sectionHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  shippingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  shippingOptionActive: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 8,
  },
  shippingTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  shippingTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  shippingSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  shippingPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  appliedCouponRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  couponTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  couponCodeText: {
    fontFamily: 'ElleGaborStd',
    fontWeight: '700',
    color: Colors.textPrimary,
    fontSize: 13,
  },
  removeCouponBtn: {
    padding: 4,
  },
  removeCouponText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  couponInput: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    backgroundColor: Colors.background || '#FAF8F5',
    borderRadius: 26,
    paddingHorizontal: 18,
    height: 52,
    fontSize: 14,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  applyCouponBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 26,
    paddingHorizontal: 22,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  applyCouponText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: 14,
  },
  couponErrorText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.error,
    fontSize: 11,
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 10,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  totalValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  checkoutBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 52,
    borderRadius: 26,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  checkoutBtnText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
});
