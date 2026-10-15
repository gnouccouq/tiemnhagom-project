// app/checkout.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurButton } from '../src/components/BlurButton';
import { useThemeColor } from '../src/constants/theme';
import { useCart } from '../src/context/CartContext';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { formatCurrency } from '../src/utils/format';
import { getBestSellingProducts } from '../src/services/productService';
import { createOrder } from '../src/services/orderService';
import { Product } from '../src/types';

export default function CheckoutScreen() {
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
    shippingFee,
    discountAmount,
    memberDiscount,
    memberTier,
    totalAmount,
    appliedCoupon,
    appliedCouponItem,
    shippingMethod,
    setShippingMethod,
    selectedAddress,
    isHCM,
    paymentMethod,
    orderNote,
    setOrderNote,
    flyToCart,
    addToCart,
  } = useCart();

  const { user, userProfile } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const { pageStyle } = usePageAnimation({ itemCount: 10, delay: 40 });

  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    getBestSellingProducts(6)
      .then((items) => {
        if (!isCancelled) {
          setSuggestedProducts(items);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, []);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      dialog.alert(t('error_2') || 'Giỏ hàng rỗng', t('errEmptyCart') || 'Giỏ hàng của bạn đang trống.');
      return;
    }

    if (!selectedAddress) {
      dialog.alert(
        t('error_2') || 'Thiếu thông tin',
        t('errMissingAddress') || 'Vui lòng chọn địa chỉ giao hàng.',
        [{ text: t('confirmBtn') || 'Đồng ý', onPress: () => router.push('/select-address') }]
      );
      return;
    }

    const recipientName = (selectedAddress.fullName || userProfile?.displayName || userProfile?.name || '').trim();
    const recipientPhone = (selectedAddress.phone || userProfile?.phone || '').trim();

    if (!recipientName) {
      dialog.alert(
        t('error_2') || 'Thiếu thông tin',
        t('errMissingName') || 'Vui lòng nhập họ và tên người nhận.',
        [{ text: t('confirmBtn') || 'Đồng ý', onPress: () => router.push('/select-address') }]
      );
      return;
    }

    if (!recipientPhone || recipientPhone.length < 9) {
      dialog.alert(
        t('error_2') || 'Thiếu thông tin',
        t('errInvalidPhone') || 'Số điện thoại không hợp lệ.',
        [{ text: t('confirmBtn') || 'Đồng ý', onPress: () => router.push('/select-address') }]
      );
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const fullLoc =
        selectedAddress.locationName ||
        (selectedAddress.wardName && selectedAddress.provinceName
          ? `${selectedAddress.wardName}, ${selectedAddress.provinceName}`
          : selectedAddress.provinceName || '');

      const fullStreet = selectedAddress.address || '';
      const completeAddress = fullStreet + (fullLoc ? `, ${fullLoc}` : '');

      const orderPayload: any = {
        userId: user ? user.uid : 'guest',
        customerName: recipientName,
        shippingAddress: {
          fullName: recipientName,
          phone: recipientPhone,
          address: completeAddress,
        },
        items: cart,
        subtotal,
        shippingFee,
        discountAmount,
        membershipDiscount: memberDiscount,
        totalAmount,
        couponCode: appliedCoupon || undefined,
        shippingMethod,
        paymentMethod: paymentMethod === 'banking' ? 'banking' : 'cod',
        actualPaymentMethod: paymentMethod,
        note: orderNote.trim() || undefined,
      };

      const res = await createOrder(orderPayload);
      if (res.success && res.orderCode) {
        clearCart();
        router.replace({
          pathname: '/order-success',
          params: {
            orderCode: res.orderCode,
            totalAmount: String(totalAmount),
            customerName: recipientName,
            paymentMethod: paymentMethod,
          },
        });
      } else {
        dialog.alert(t('error_2') || 'Lỗi', res.error || t('errCreateOrderFailed') || 'Không thể tạo đơn hàng.');
      }
    } catch (err: any) {
      console.error('Lỗi đặt hàng:', err);
      dialog.alert(t('error_2') || 'Lỗi', err.message || t('errOrderProcess') || 'Đã xảy ra sự cố khi đặt hàng.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const getPaymentMethodDisplay = () => {
    if (paymentMethod === 'banking') {
      return {
        title: t('vietQR') || 'Chuyển khoản mã QR (VietQR)',
        icon: 'qr-code-outline' as keyof typeof Ionicons.glyphMap,
      };
    }
    return {
      title: t('cod') || 'Tiền mặt khi nhận hàng (COD)',
      icon: 'cash-outline' as keyof typeof Ionicons.glyphMap,
    };
  };

  const paymentDisplay = getPaymentMethodDisplay();

  const getEstimatedDeliveryText = () => {
    if (shippingMethod === 'express_2h') {
      return t('estimatedTime26m') || '26 phút';
    }
    if (shippingMethod === 'pickup') {
      return t('estimatedTimePickup') || 'Nhận ngay trong ngày';
    }
    return isHCM
      ? t('estimatedTime1_2d') || '1 - 2 ngày làm việc'
      : t('estimatedTime3_5d') || '3 - 5 ngày làm việc';
  };

  const recipientDisplayName = selectedAddress?.fullName || userProfile?.displayName || userProfile?.name || 'Nguyễn Cường';
  const recipientPhone = selectedAddress?.phone || userProfile?.phone || '0867291612';
  const recipientAddress = selectedAddress
    ? `${selectedAddress.address}${
        selectedAddress.locationName
          ? `, ${selectedAddress.locationName}`
          : selectedAddress.wardName && selectedAddress.provinceName
          ? `, ${selectedAddress.wardName}, ${selectedAddress.provinceName}`
          : ''
      }`
    : '474/2 Đ. Cô Giang, Cầu Kiệu, Hồ Chí Minh, Việt Nam';

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header chuẩn GEMINI.md (Không có vạch kẻ đáy) */}
      <View style={[styles.customHeader, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        <View style={[StyleSheet.absoluteFill, { height: insets.top + 56 + 24 }]} pointerEvents="none">
          <LinearGradient
            colors={
              isDark
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

        <BlurButton
          style={styles.headerBackBtn}
          onPress={() => router.back()}
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />
        </BlurButton>

        <Text style={styles.headerTitle}>{t('orderHeader') || 'Đơn hàng'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 54 + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 100,
          },
        ]}
      >
        {/* 1. KHỐI Giao đến */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="bicycle-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle}>{t('deliverTo') || 'Giao đến'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/select-address')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.editActionText}>{t('edit') || 'Chỉnh sửa'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.recipientNameText}>{recipientDisplayName}</Text>

          <View style={styles.addressRow}>
            <Ionicons name="location-sharp" size={17} color="#9C7156" style={{ marginTop: 2 }} />
            <Text style={styles.addressBodyText} numberOfLines={2}>
              {recipientAddress}
            </Text>
          </View>

          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.phoneBodyText}>{recipientPhone}</Text>
          </View>

          {/* Ô nhập ghi chú dạng viên thuốc (Pill shape) */}
          <View style={styles.noteInputWrapper}>
            <Ionicons name="document-text-outline" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.noteInput}
              placeholder={t('deliveryNotePlaceholder') || 'Ghi chú (0/120)'}
              placeholderTextColor={Colors.textMuted}
              value={orderNote}
              onChangeText={setOrderNote}
              maxLength={120}
            />
          </View>

          {/* Dự kiến giao hàng */}
          <View style={styles.estimateSection}>
            <Text style={styles.estimateTitle}>{t('estimatedDelivery') || 'Dự kiến giao hàng'}</Text>
            <View style={styles.estimateBadge}>
              <Ionicons name="time-outline" size={16} color="#9C7156" />
              <Text style={styles.estimateTimeText}>{getEstimatedDeliveryText()}</Text>
            </View>
          </View>
        </View>

        {/* 2. KHỐI Cửa hàng */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="storefront-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle}>{t('storeSection') || 'Cửa hàng'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/stores')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.editActionText}>{t('edit') || 'Chỉnh sửa'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.recipientNameText}>{t('storeNameDefault') || 'Tiệm Nhà Gốm — Gia Định'}</Text>

          <View style={styles.storeAddressRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Ionicons name="business-outline" size={17} color="#9C7156" style={{ marginTop: 2 }} />
              <Text style={styles.addressBodyText}>
                {t('storeAddressDefault') || '37 Nguyễn Duy, Phường Gia Định, TP. Hồ Chí Minh'}
              </Text>
            </View>
            <View style={styles.distanceBadge}>
              <Ionicons name="navigate-outline" size={12} color="#9C7156" style={{ marginRight: 3 }} />
              <Text style={styles.distanceBadgeText}>{t('storeDistanceDefault') || '49m'}</Text>
            </View>
          </View>
        </View>

        {/* 3. KHỐI CHỌN HÌNH THỨC GIAO HÀNG (2-Hour Express, Standard, Pickup) */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="cube-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle}>{t('shippingMethod') || 'Phương thức giao hàng'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.shippingPillOption,
              shippingMethod === 'standard' && styles.shippingPillOptionActive,
            ]}
            onPress={() => setShippingMethod('standard')}
            activeOpacity={0.85}
          >
            <View style={styles.shippingPillLeft}>
              <View style={[styles.radioCircle, shippingMethod === 'standard' && styles.radioCircleActive]}>
                {shippingMethod === 'standard' && <View style={styles.radioDot} />}
              </View>
              <View style={[styles.shippingIconBox, shippingMethod === 'standard' && styles.shippingIconBoxActive]}>
                <Ionicons
                  name="cube-outline"
                  size={18}
                  color={shippingMethod === 'standard' ? '#9C7156' : Colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shippingPillTitle}>
                  {isHCM
                    ? (t('shippingStandardHcm') || 'Giao thông thường nội thành')
                    : (t('shippingStandardNationwide') || 'Giao tiêu chuẩn toàn quốc')}
                </Text>
                <Text style={styles.shippingPillSub}>
                  {isHCM
                    ? (t('shippingStandardHcmSub') || 'Nhận hàng trong 1-2 ngày làm việc')
                    : (t('shippingStandardNationwideSub') || 'Giao tận nơi 3-5 ngày làm việc')}
                </Text>
              </View>
            </View>
            <Text style={styles.shippingPillPrice}>
              {subtotal >= 500000 || memberTier.freeShipping
                ? t('free') || 'Miễn phí'
                : formatCurrency(isHCM ? 20000 : 40000)}
            </Text>
          </TouchableOpacity>

          {isHCM && (
            <TouchableOpacity
              style={[
                styles.shippingPillOption,
                shippingMethod === 'express_2h' && styles.shippingPillOptionActive,
              ]}
              onPress={() => setShippingMethod('express_2h')}
              activeOpacity={0.85}
            >
              <View style={styles.shippingPillLeft}>
                <View style={[styles.radioCircle, shippingMethod === 'express_2h' && styles.radioCircleActive]}>
                  {shippingMethod === 'express_2h' && <View style={styles.radioDot} />}
                </View>
                <View style={[styles.shippingIconBox, shippingMethod === 'express_2h' && styles.shippingIconBoxActive]}>
                  <Ionicons
                    name="flash-outline"
                    size={18}
                    color="#9C7156"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shippingPillTitle, { color: '#9C7156' }]}>
                    {t('shippingExpress2hTitle') || 'Giao nhanh 2 Giờ (Hỏa tốc)'}
                  </Text>
                  <Text style={styles.shippingPillSub}>
                    {t('shippingExpress2hSub') || 'Áp dụng nội thành TP.HCM (Khung 10h - 19h)'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.shippingPillPrice, { color: '#9C7156' }]}>
                {memberTier.freeShipping ? t('free') || 'Miễn phí' : formatCurrency(30000)}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.shippingPillOption,
              shippingMethod === 'pickup' && styles.shippingPillOptionActive,
            ]}
            onPress={() => setShippingMethod('pickup')}
            activeOpacity={0.85}
          >
            <View style={styles.shippingPillLeft}>
              <View style={[styles.radioCircle, shippingMethod === 'pickup' && styles.radioCircleActive]}>
                {shippingMethod === 'pickup' && <View style={styles.radioDot} />}
              </View>
              <View style={[styles.shippingIconBox, shippingMethod === 'pickup' && styles.shippingIconBoxActive]}>
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color={shippingMethod === 'pickup' ? '#9C7156' : Colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shippingPillTitle}>{t('shippingPickupTitle') || 'Nhận tại showroom'}</Text>
                <Text style={styles.shippingPillSub}>{t('shippingPickupSub') || '37 Nguyễn Duy, P. Gia Định, TP.HCM'}</Text>
              </View>
            </View>
            <Text style={[styles.shippingPillPrice, { color: '#9C7156' }]}>0đ</Text>
          </TouchableOpacity>
        </View>

        {/* 4. KHỐI DANH SÁCH MÓN */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="bag-handle-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle}>{t('dishes') || 'Món'}</Text>
            </View>
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
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    {variantName ? (
                      <Text style={styles.itemVariantText}>{variantName}</Text>
                    ) : null}

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
                    <Text style={styles.itemPriceText}>{formatCurrency(itemTotal)}</Text>
                    <TouchableOpacity
                      style={styles.itemEditBtn}
                      onPress={() => removeFromCart(item.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.itemEditBtnText}>{t('clear') || 'Xóa'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* 5. GỢI Ý ĐỒ GỐM ("Món xịn phải thử") */}
        {suggestedProducts.length > 0 && (
          <View style={styles.crossSellSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="sparkles" size={16} color="#9C7156" />
              </View>
              <Text style={styles.crossSellSectionTitle}>
                {t('mustTrySection') || 'Món xịn phải thử'}
              </Text>
            </View>

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
                    <Text style={styles.crossSellName} numberOfLines={2}>
                      {p.name}
                    </Text>
                    <View style={styles.crossSellBottomRow}>
                      <Text style={styles.crossSellPrice}>{formatCurrency(effPrice)}</Text>
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

        {/* 6. KHỐI "Ưu đãi" (Mở trang riêng select-voucher) */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="gift-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle}>{t('offersSection') || 'Ưu đãi'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.actionRowCard}
            onPress={() => router.push('/select-voucher')}
            activeOpacity={0.85}
          >
            <View style={styles.actionRowLeft}>
              <View style={styles.iconCircleBadge}>
                <Ionicons name="pricetag-outline" size={18} color="#9C7156" />
              </View>
              <View>
                <Text style={styles.actionRowTitle}>
                  {appliedCouponItem?.name || appliedCoupon || t('selectOfferBtn') || 'Chọn Ưu Đãi'}
                </Text>
                {discountAmount > 0 && (
                  <Text style={styles.actionRowSub}>-{formatCurrency(discountAmount)}</Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 7. KHỐI "Phương thức thanh toán" (Mở trang riêng select-payment) */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="card-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.cardHeaderTitle}>
                {t('paymentMethodSection') || 'Phương thức thanh toán'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.actionRowCard}
            onPress={() => router.push('/select-payment')}
            activeOpacity={0.85}
          >
            <View style={styles.actionRowLeft}>
              <View style={styles.iconCircleBadge}>
                <Ionicons name={paymentDisplay.icon} size={18} color="#9C7156" />
              </View>
              <Text style={styles.actionRowTitle}>{paymentDisplay.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 8. KHỐI "Chi tiết thanh toán" */}
        <View style={styles.summaryCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="receipt-outline" size={18} color="#9C7156" />
              </View>
              <Text style={styles.summaryTitle}>{t('paymentDetailsSection') || 'Chi tiết thanh toán'}</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('subtotal') || 'Tạm tính'}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('shippingFee') || 'Phí giao hàng'}</Text>
            <Text style={styles.summaryValue}>
              {shippingFee === 0 ? (
                <Text style={{ color: '#9C7156', fontWeight: '700' }}>0đ ({t('free') || 'Miễn phí'})</Text>
              ) : (
                formatCurrency(shippingFee)
              )}
            </Text>
          </View>

          {memberDiscount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: '#9C7156' }]}>
                {t('memberTierDiscountLabel') || 'Ưu đãi hạng'} {memberTier.name} (-{memberTier.discount}%)
              </Text>
              <Text style={[styles.summaryValue, { color: '#9C7156', fontWeight: '700' }]}>
                -{formatCurrency(memberDiscount)}
              </Text>
            </View>
          )}

          {discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: '#9C7156' }]}>
                {t('voucherDiscountAmount') || 'Giảm giá ưu đãi'}
              </Text>
              <Text style={[styles.summaryValue, { color: '#9C7156', fontWeight: '700' }]}>
                -{formatCurrency(discountAmount)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryTotalRow}>
            <Text style={styles.totalLabel}>{t('totalPayment') || 'Tổng tiền thanh toán'}</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
          </View>

          <Text style={styles.vatSubtext}>{t('vatIncludedNotice') || '(Giá đã bao gồm VAT)'}</Text>

          <View style={styles.pointsNoticeRow}>
            <Image
              source={require('../assets/images/icon_ceramic_point.png')}
              style={styles.pointsNoticeIcon}
              contentFit="contain"
            />
            <Text style={styles.pointsNoticeText}>
              {(t('earnPointsMessage') || 'Tích thêm {points} Điểm gốm sau khi đơn hàng giao hoàn tất thành công!').replace(
                '{points}',
                String(Math.floor(totalAmount / 10000))
              )}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 9. NÚT ĐẶT HÀNG DÍNH CHÂN TRANG */}
      <View style={[styles.bottomStickyBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TouchableOpacity
          style={[styles.checkoutPillBtn, isSubmittingOrder && { opacity: 0.75 }]}
          onPress={handlePlaceOrder}
          disabled={isSubmittingOrder}
          activeOpacity={0.88}
        >
          {isSubmittingOrder ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.checkoutBtnText}>
              {`${t('orderNowBtn') || 'Đặt hàng ngay'} • ${cartCount} ${t('dishes') || 'Sản phẩm'} • ${formatCurrency(totalAmount)}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
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
      paddingBottom: 10,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
    },
    headerBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
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
      marginBottom: 10,
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      borderWidth: 1,
      borderColor: isDark ? '#2E2B28' : '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    cardHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    editActionText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#9C7156',
    },
    recipientNameText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 4,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginBottom: 4,
    },
    addressBodyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
      lineHeight: 18,
      flex: 1,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    phoneBodyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
    },
    noteInputWrapper: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#2E2E2E' : '#E8E1D8',
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    noteInput: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textPrimary,
      flex: 1,
    },
    estimateSection: {
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#242424' : '#F0ECE6',
    },
    estimateTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 6,
    },
    estimateBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    estimateTimeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
      fontWeight: '600',
    },
    storeAddressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    distanceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E8CCB2',
    },
    distanceBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '700',
      color: '#9C7156',
    },
    sectionSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 12,
    },
    shippingPillOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderRadius: 16,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1.2,
      borderColor: isDark ? '#242424' : '#E8E1D8',
    },
    shippingPillOptionActive: {
      borderColor: '#9C7156',
      backgroundColor: isDark ? '#1A1817' : '#FFFCFA',
    },
    shippingPillLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 8,
    },
    shippingIconBox: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      borderWidth: 1,
      borderColor: isDark ? '#2E2B28' : '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    shippingIconBoxActive: {
      backgroundColor: isDark ? '#2A201A' : '#FAF2EA',
      borderColor: '#9C7156',
    },
    shippingPillTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    shippingPillSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: Colors.textMuted,
    },
    shippingPillPrice: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    radioCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.8,
      borderColor: isDark ? '#4A4A4A' : '#C7BFB5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleActive: {
      borderColor: '#9C7156',
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#9C7156',
    },
    itemList: {
      gap: 12,
    },
    cartItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#1E1E1E' : '#F6F4EC',
    },
    itemImg: {
      width: 68,
      height: 68,
      borderRadius: 14,
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
      marginBottom: 3,
    },
    itemVariantText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
      marginBottom: 6,
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textPrimary,
      minWidth: 20,
      textAlign: 'center',
    },
    itemRightCol: {
      alignItems: 'flex-end',
      gap: 8,
    },
    itemPriceText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    itemEditBtn: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8E1D8',
    },
    itemEditBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '600',
      color: Colors.textSecondary,
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
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: '#9C7156',
    },
    crossSellAddBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    actionRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconCircleBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      borderWidth: 1,
      borderColor: isDark ? '#2E2B28' : '#E8CCB2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },
    actionRowTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    actionRowSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: '#9C7156',
      fontWeight: '700',
      marginTop: 2,
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
      gap: 10,
    },
    summaryTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
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
    },
    summaryValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? '#242424' : '#F0ECE6',
      marginVertical: 4,
    },
    summaryTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 2,
    },
    totalLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    totalValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '800',
      color: Colors.textPrimary,
    },
    vatSubtext: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted,
      textAlign: 'right',
      marginTop: -4,
    },
    pointsNoticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      padding: 10,
      borderRadius: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      marginTop: 4,
    },
    pointsNoticeIcon: {
      width: 18,
      height: 18,
      marginRight: 4,
    },
    pointsNoticeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: '#9C7156',
      fontWeight: '600',
      flex: 1,
    },
    bottomStickyBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.background,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 0,
    },
    checkoutPillBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    checkoutBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
