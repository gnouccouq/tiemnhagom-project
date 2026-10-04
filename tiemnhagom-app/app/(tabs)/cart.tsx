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
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { CartItemCard } from '../../src/components/CartItemCard';
import { EmptyState } from '../../src/components/EmptyState';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import { useSettings } from '../../src/context/SettingsContext';
import { formatCurrency } from '../../src/utils/format';

export default function CartScreen() {
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

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');

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
    Alert.alert(t('clearCartTitle'), t('clearCartMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('clearAll'), style: 'destructive', onPress: clearCart },
    ]);
  };

  if (cart.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      {/* Custom Header */}
      <View style={styles.customHeader}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>{t('cartHeader')}</Text>
        {cart.length > 0 ? (
          <TouchableOpacity onPress={confirmClearCart} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.headerClearBtn}>{t('clear')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
    color: '#111111',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: Colors.border,
    shadowColor: '#000',
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
    backgroundColor: '#F5F5F5',
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
    color: '#111111',
  },
  appliedCouponRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
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
    color: '#111111',
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
  },
  couponInput: {
    fontFamily: 'ElleGaborStd',
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 44,
    fontSize: 13,
    color: Colors.textPrimary,
    borderWidth: 1.2,
    borderColor: Colors.border,
  },
  applyCouponBtn: {
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyCouponText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  couponErrorText: {
    fontFamily: 'ElleGaborStd',
    color: Colors.error,
    fontSize: 11,
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1.2,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
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
    color: '#111111',
  },
  checkoutBtn: {
    backgroundColor: '#111111',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
