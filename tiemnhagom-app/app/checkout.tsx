// app/checkout.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { AddressPicker } from '../src/components/AddressPicker';
import { useThemeColor, Typography, Spacing, BorderRadius, Shadows } from '../src/constants/theme';
import { useCart } from '../src/context/CartContext';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { createOrder } from '../src/services/orderService';
import { formatCurrency } from '../src/utils/format';

export default function CheckoutScreen() {
  const Colors = useThemeColor();
  const themeStyles = getStyles(Colors);
  const router = useRouter();
  const { cart, subtotal, shippingFee, discountAmount, totalAmount, appliedCoupon, clearCart, shippingMethod } = useCart();
  const { user, userProfile } = useAuth();

  const [fullName, setFullName] = useState(userProfile?.displayName || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [streetAddress, setStreetAddress] = useState(userProfile?.streetAddress || userProfile?.address || '');
  const [locationName, setLocationName] = useState(userProfile?.locationName || '');
  const [provinceCode, setProvinceCode] = useState<string | undefined>(userProfile?.provinceCode);
  const [wardCode, setWardCode] = useState<string | undefined>(userProfile?.wardCode);
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'banking'>('cod');
  const [loading, setLoading] = useState(false);
  const { t } = useSettings();

  const handleSubmitOrder = async () => {
    if (!fullName.trim()) {
      Alert.alert(t('error'), t('errMissingName'));
      return;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      Alert.alert(t('error'), t('errInvalidPhone'));
      return;
    }
    if (!streetAddress.trim() || !locationName) {
      Alert.alert(t('error'), t('errMissingAddress'));
      return;
    }
    if (cart.length === 0) {
      Alert.alert(t('error'), t('errEmptyCart'));
      return;
    }

    setLoading(true);
    try {
      const orderPayload = {
        userId: user ? user.uid : 'guest',
        customerName: fullName.trim(),
        shippingAddress: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          address: `${streetAddress.trim()}, ${locationName}`,
        },
        items: cart,
        subtotal,
        shippingFee,
        discountAmount,
        couponCode: appliedCoupon || undefined,
        totalAmount,
        paymentMethod,
        note: note.trim() || undefined,
      };

      const result = await createOrder(orderPayload);
      if (result.success && result.orderCode) {
        clearCart();
        router.replace({
          pathname: '/order-success',
          params: {
            orderCode: result.orderCode,
            totalAmount: totalAmount.toString(),
            customerName: fullName.trim(),
            paymentMethod,
          },
        });
      } else {
        Alert.alert(t('error'), result.error || t('errCreateOrderFailed'));
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('errOrderProcess'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={themeStyles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <Header title={t('checkoutTitle')} showBack showCart={false} showSearch={false} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={themeStyles.scrollContent}>
        {/* Recipient Information */}
        <View style={themeStyles.card}>
          <View style={themeStyles.cardHeader}>
            <Ionicons name="location-outline" size={20} color={Colors.primary} />
            <Text style={themeStyles.cardTitle}>{t('recipientInfo')}</Text>
          </View>

          <View style={themeStyles.formGroup}>
            <Text style={themeStyles.label}>{t('fullNameReq')}</Text>
            <TextInput
              style={themeStyles.input}
              placeholder="Nguyễn Văn A"
              placeholderTextColor={Colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={themeStyles.formGroup}>
            <Text style={themeStyles.label}>{t('phoneReq')}</Text>
            <TextInput
              style={themeStyles.input}
              placeholder="0901234567"
              placeholderTextColor={Colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={themeStyles.formGroup}>
            <Text style={themeStyles.label}>{t('provinceWardReq')}</Text>
            <TouchableOpacity
              style={themeStyles.locationSelector}
              onPress={() => setAddressPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[themeStyles.locationText, !locationName && themeStyles.locationPlaceholder]}>
                {locationName || t('selectDeliveryArea')}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={themeStyles.formGroup}>
            <Text style={themeStyles.label}>{t('streetNameReq')}</Text>
            <TextInput
              style={[themeStyles.input, themeStyles.textArea]}
              placeholder={t('streetNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              value={streetAddress}
              onChangeText={setStreetAddress}
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={themeStyles.formGroup}>
            <Text style={themeStyles.label}>{t('orderNote')}</Text>
            <TextInput
              style={themeStyles.input}
              placeholder={t('orderNotePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              value={note}
              onChangeText={setNote}
            />
          </View>
        </View>

        {/* Payment Method */}
        <View style={themeStyles.card}>
          <View style={themeStyles.cardHeader}>
            <Ionicons name="card-outline" size={20} color={Colors.primary} />
            <Text style={themeStyles.cardTitle}>{t('paymentMethodTitle')}</Text>
          </View>

          <TouchableOpacity
            style={[themeStyles.paymentOption, paymentMethod === 'cod' && themeStyles.paymentOptionActive]}
            onPress={() => setPaymentMethod('cod')}
          >
            <Ionicons
              name={paymentMethod === 'cod' ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={paymentMethod === 'cod' ? Colors.primary : Colors.textMuted}
            />
            <View style={themeStyles.paymentTextWrap}>
              <Text style={themeStyles.paymentName}>{t('cod')}</Text>
              <Text style={themeStyles.paymentDesc}>{t('codDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[themeStyles.paymentOption, paymentMethod === 'banking' && themeStyles.paymentOptionActive]}
            onPress={() => setPaymentMethod('banking')}
          >
            <Ionicons
              name={paymentMethod === 'banking' ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={paymentMethod === 'banking' ? Colors.primary : Colors.textMuted}
            />
            <View style={themeStyles.paymentTextWrap}>
              <Text style={themeStyles.paymentName}>{t('vietQR')}</Text>
              <Text style={themeStyles.paymentDesc}>{t('vietQRDesc')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Order Items Preview */}
        <View style={themeStyles.card}>
          <Text style={themeStyles.cardTitle}>{t('orderTitle')} ({cart.length} {t('itemsCount')})</Text>
          <View style={themeStyles.itemsWrap}>
            {cart.map((item) => (
              <View key={item.id} style={themeStyles.itemRow}>
                <Text style={themeStyles.itemName} numberOfLines={1}>
                  {item.name} {item.variant?.name ? `(${item.variant.name})` : ''}
                </Text>
                <Text style={themeStyles.itemDetail}>
                  x{item.quantity} • {formatCurrency(item.price * item.quantity)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Summary Card */}
        <View style={themeStyles.card}>
          <View style={themeStyles.summaryRow}>
            <Text style={themeStyles.summaryLabel}>{t('subtotal')}:</Text>
            <Text style={themeStyles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={themeStyles.summaryRow}>
            <Text style={themeStyles.summaryLabel}>{t('shippingFee')}:</Text>
            <Text style={themeStyles.summaryValue}>
              {shippingFee === 0 ? t('free') : formatCurrency(shippingFee)}
            </Text>
          </View>
          {discountAmount > 0 && (
            <View style={themeStyles.summaryRow}>
              <Text style={[themeStyles.summaryLabel, { color: Colors.badgeSale }]}>{t('voucherDiscountAmount')}:</Text>
              <Text style={[themeStyles.summaryValue, { color: Colors.badgeSale }]}>
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
          )}
          <View style={themeStyles.divider} />
          <View style={themeStyles.summaryRowTotal}>
            <Text style={themeStyles.totalLabel}>{t('totalToPay')}</Text>
            <Text style={themeStyles.totalValue}>{formatCurrency(totalAmount)}</Text>
          </View>
        </View>
      </ScrollView>

      <AddressPicker
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        initialProvinceCode={provinceCode}
        initialWardCode={wardCode}
        onSelect={(prov, ward) => {
          setProvinceCode(prov.province_code);
          setWardCode(ward.ward_code);
          setLocationName(`${ward.name}, ${prov.name}`);
        }}
      />

      {/* Submit Button */}
      <View style={themeStyles.bottomBar}>
        <View style={themeStyles.bottomTotal}>
          <Text style={themeStyles.bottomTotalLabel}>{t('totalPayment')}</Text>
          <Text style={themeStyles.bottomTotalValue}>{formatCurrency(totalAmount)}</Text>
        </View>

        <TouchableOpacity
          style={[themeStyles.submitBtn, loading && themeStyles.submitBtnDisabled]}
          onPress={handleSubmitOrder}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <>
              <Text style={themeStyles.submitBtnText}>{t('confirmOrder')}</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.textInverse} style={{ marginLeft: 4 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (Colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 110,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  formGroup: {
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    fontFamily: 'ElleGaborStd',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    height: 42,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  textArea: {
    height: 60,
    paddingTop: Spacing.sm,
    textAlignVertical: 'top',
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    height: 42,
  },
  locationText: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    flex: 1,
  },
  locationPlaceholder: {
    color: Colors.textMuted,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  paymentOptionActive: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 6,
  },
  paymentTextWrap: {
    flex: 1,
  },
  paymentName: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  paymentDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  itemsWrap: {
    marginTop: Spacing.sm,
    gap: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  itemDetail: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  totalValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.lg,
    fontWeight: '800',
    color: Colors.primary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.cardBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadows.md,
  },
  bottomTotal: {
    flex: 1,
  },
  bottomTotalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  bottomTotalValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.lg,
    fontWeight: '800',
    color: Colors.primary,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: 24,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: Colors.textInverse,
    fontWeight: '700',
    fontSize: Typography.fontSize.base,
  },
});
