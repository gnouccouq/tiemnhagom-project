// app/(tabs)/cart.tsx
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
        <Header title="Giỏ hàng" showCart={false} showSearch={false} />
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
      <Header title="Giỏ hàng" showCart={false} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Cart Header Action */}
        <View style={styles.cartTopBar}>
          <Text style={styles.cartTotalCount}>
            {cart.reduce((a, b) => a + b.quantity, 0)} sản phẩm trong giỏ
          </Text>
          <TouchableOpacity onPress={confirmClearCart}>
            <Text style={styles.clearAllBtn}>Xóa tất cả</Text>
          </TouchableOpacity>
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
    borderColor: '#E1E8DF',
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
    color: '#2D3B34',
    marginBottom: 12,
  },
  shippingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E8DF',
  },
  shippingOptionActive: {
    backgroundColor: '#EEF3EB',
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
    color: '#2D3B34',
  },
  shippingSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#7A827E',
    marginTop: 2,
  },
  shippingPrice: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#3B4D45',
  },
  appliedCouponRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EEF3EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E1E8DF',
  },
  couponTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  couponCodeText: {
    fontFamily: 'ElleGaborStd',
    fontWeight: '700',
    color: '#3B4D45',
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
    backgroundColor: '#EEF3EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 44,
    fontSize: 13,
    color: '#2D3B34',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
  },
  applyCouponBtn: {
    backgroundColor: '#3B4D45',
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
    borderColor: '#E1E8DF',
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
    color: '#7A827E',
  },
  summaryValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3B34',
  },
  divider: {
    height: 1,
    backgroundColor: '#E1E8DF',
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
    color: '#2D3B34',
  },
  totalValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '800',
    color: '#3B4D45',
  },
  checkoutBtn: {
    backgroundColor: '#3B4D45',
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
