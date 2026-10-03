// app/cart.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { CartItemCard } from '../../src/components/CartItemCard';
import { EmptyState } from '../../src/components/EmptyState';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
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

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) return;
    const ok = applyCoupon(couponInput);
    if (ok) {
      setCouponError('');
      setCouponInput('');
    } else {
      setCouponError('Mã không hợp lệ. Thử GOMMOI, TIEMNHAGOM hoặc CHAOBAN');
    }
  };

  const handleCheckoutPress = () => {
    if (cart.length === 0) return;
    router.push('/checkout');
  };

  const confirmClearCart = () => {
    Alert.alert('Xóa giỏ hàng', 'Bạn có chắc chắn muốn xóa toàn bộ sản phẩm khỏi giỏ hàng?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa hết', style: 'destructive', onPress: clearCart },
    ]);
  };

  if (cart.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
        {/* Custom Header với nút back */}
        <View style={styles.customHeader}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBackBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color="#111111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Giỏ hàng</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon="bag-handle-outline"
          title="Giỏ hàng trống"
          message="Bạn chưa có sản phẩm gốm nào trong giỏ. Hãy dạo quanh cửa hàng và chọn những món ưng ý nhé!"
          buttonText="Khám phá đồ gốm ngay"
          onButtonPress={() => router.push('/(tabs)/products')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      {/* Custom Header với nút back */}
      <View style={styles.customHeader}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>Giỏ hàng</Text>
        {cart.length > 0 ? (
          <TouchableOpacity onPress={confirmClearCart} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.headerClearBtn}>Xóa</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Cart Header Action */}
        <View style={styles.cartTopBar}>
          <Text style={styles.cartTotalCount}>
            {cart.reduce((a, b) => a + b.quantity, 0)} sản phẩm trong giỏ
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
          <Text style={styles.sectionHeaderTitle}>Phương thức giao hàng</Text>

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
              <Text style={styles.shippingTitle}>Giao hàng tiêu chuẩn (Toàn quốc)</Text>
              <Text style={styles.shippingSub}>2-4 ngày làm việc • Bọc chống sốc kỹ càng</Text>
            </View>
            <Text style={styles.shippingPrice}>
              {subtotal >= 500000 ? 'Miễn phí' : '20.000 ₫'}
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
              <Text style={styles.shippingTitle}>Giao hỏa tốc 2 giờ (Nội thành TP.HCM)</Text>
              <Text style={styles.shippingSub}>Nhận hàng ngay trong 2h</Text>
            </View>
            <Text style={styles.shippingPrice}>35.000 ₫</Text>
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
              <Text style={styles.shippingTitle}>Nhận tại tiệm (Pick-up)</Text>
              <Text style={styles.shippingSub}>Ghé tiệm nhận trực tiếp & kiểm tra sản phẩm</Text>
            </View>
            <Text style={styles.shippingPrice}>0 ₫</Text>
          </TouchableOpacity>
        </View>

        {/* Voucher / Mã giảm giá */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeaderTitle}>Mã giảm giá / Ưu đãi</Text>
          {appliedCoupon ? (
            <View style={styles.appliedCouponRow}>
              <View style={styles.couponTag}>
                <Ionicons name="pricetag" size={16} color={Colors.primary} />
                <Text style={styles.couponCodeText}>{appliedCoupon}</Text>
              </View>
              <TouchableOpacity onPress={removeCoupon} style={styles.removeCouponBtn}>
                <Text style={styles.removeCouponText}>Gỡ bỏ</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.couponInputRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="Nhập mã (GOMMOI, TIEMNHAGOM...)"
                  placeholderTextColor={Colors.textMuted}
                  value={couponInput}
                  onChangeText={setCouponInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.applyCouponBtn} onPress={handleApplyCoupon}>
                  <Text style={styles.applyCouponText}>Áp dụng</Text>
                </TouchableOpacity>
              </View>
              {couponError ? <Text style={styles.couponErrorText}>{couponError}</Text> : null}
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tạm tính</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Phí vận chuyển</Text>
            <Text style={styles.summaryValue}>
              {shippingFee === 0 ? 'Miễn phí' : formatCurrency(shippingFee)}
            </Text>
          </View>

          {discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: Colors.badgeSale }]}>Giảm giá Voucher</Text>
              <Text style={[styles.summaryValue, { color: Colors.badgeSale }]}>
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryRowTotal}>
            <Text style={styles.totalLabel}>Tổng thanh toán</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
          </View>
        </View>

        {/* Checkout Button */}
        <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckoutPress} activeOpacity={0.88}>
          <Text style={styles.checkoutBtnText}>Tiến hành đặt hàng</Text>
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
    backgroundColor: Colors.primaryLight,
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
    color: Colors.primary,
  },
  appliedCouponRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
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
    color: Colors.primaryDark,
    fontSize: 13,
  },
  removeCouponBtn: {
    padding: 4,
  },
  removeCouponText: {
    fontFamily: 'ElleGaborStd',
    color: '#C86432',
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
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  couponErrorText: {
    fontFamily: 'ElleGaborStd',
    color: '#C86432',
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
    color: Colors.primary,
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
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
