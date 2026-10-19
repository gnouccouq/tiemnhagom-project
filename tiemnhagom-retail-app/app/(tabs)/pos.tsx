// app/(tabs)/pos.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useThemeColor } from '../../src/constants/theme';
import { usePOS } from '../../src/context/POSContext';
import { useSettings } from '../../src/context/SettingsContext';
import { subscribeProducts } from '../../src/services/adminProductService';
import { subscribeCustomers } from '../../src/services/adminCustomerService';
import { Product, ProductVariant, Customer } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { LiquidGlass } from '../../src/components/LiquidGlass';
import { AnimatedBottomSheetModal } from '../../src/components/AnimatedBottomSheetModal';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { t } = useSettings();

  const {
    cart,
    customer,
    usePoints,
    subtotal,
    memberDiscountAmount,
    couponDiscountAmount,
    pointsDiscountAmount,
    totalAmount,
    paymentMethod,
    cashGiven,
    changeDue,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    selectCustomer,
    setUsePoints,
    setPaymentMethod,
    setCashGiven,
    generateVietQRUrl,
    completePOSOrder,
    lastCompletedOrder,
    resetAfterOrder,
  } = usePOS();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);

  // Modals
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [successReceiptModalVisible, setSuccessReceiptModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubProd = subscribeProducts((data) => setProducts(data.filter((p) => !p.isHidden)));
    const unsubCust = subscribeCustomers((data) => setCustomers(data));
    return () => {
      unsubProd();
      unsubCust();
    };
  }, []);

  // Filter Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filter Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery = !q || p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  // Filter Customers
  const filteredCustomers = useMemo(() => {
    const q = custSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 15);
    return customers.filter(
      (c) => c.displayName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [customers, custSearchQuery]);

  const handleProductPress = (product: Product) => {
    if (product.variants && product.variants.length > 0) {
      setSelectedProductForVariant(product);
    } else {
      addToCart(product);
    }
  };

  const handleSelectVariant = (variant: ProductVariant) => {
    if (selectedProductForVariant) {
      addToCart(selectedProductForVariant, variant);
      setSelectedProductForVariant(null);
    }
  };

  const handleOpenCheckout = () => {
    if (cart.length === 0) {
      Alert.alert('Giỏ hàng trống', 'Vui lòng chọn ít nhất 1 sản phẩm.');
      return;
    }
    setCashGiven(totalAmount);
    setCheckoutModalVisible(true);
  };

  const handleExecutePayment = async () => {
    if (paymentMethod === 'cash' && cashGiven < totalAmount) {
      Alert.alert('Chưa đủ tiền', 'Số tiền khách đưa chưa đủ để thanh toán đơn hàng.');
      return;
    }

    if (paymentMethod === 'vietqr') {
      setQrModalVisible(true);
      return;
    }

    setIsProcessing(true);
    const res = await completePOSOrder();
    setIsProcessing(false);

    if (res.success) {
      setCheckoutModalVisible(false);
      setSuccessReceiptModalVisible(true);
    } else {
      Alert.alert('Lỗi', res.error || 'Không thể tạo đơn hàng.');
    }
  };

  const handleConfirmQRSuccess = async () => {
    setQrModalVisible(false);
    setIsProcessing(true);
    const res = await completePOSOrder();
    setIsProcessing(false);

    if (res.success) {
      setCheckoutModalVisible(false);
      setSuccessReceiptModalVisible(true);
    } else {
      Alert.alert('Lỗi', res.error || 'Không thể tạo đơn hàng.');
    }
  };

  const cartTotalQuantity = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>{t('navPOS')}</Text>
          <Text style={[styles.headerSub, { color: Colors.textSecondary }]}>Thu ngân tại quầy</Text>
        </View>

        {/* Customer Select Pill */}
        <TouchableOpacity
          style={[styles.customerPill, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
          onPress={() => setCustomerModalVisible(true)}
        >
          <Ionicons name="person-circle-outline" size={18} color="#9C7156" />
          <Text style={[styles.customerPillText, { color: customer ? '#9C7156' : Colors.textSecondary }]} numberOfLines={1}>
            {customer ? `${customer.displayName} (${customer.tier})` : t('posSelectCustomer')}
          </Text>
          {customer ? (
            <TouchableOpacity onPress={() => selectCustomer(null)}>
              <Ionicons name="close" size={15} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      {/* Search Input (Pill 48px) */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchPill, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: Colors.textPrimary }]}
            placeholder={t('posSearchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category Chips Scroll */}
      <View style={styles.catChipsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipsScroll}>
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: active ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.catChipText,
                    {
                      color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary,
                      fontWeight: active ? '700' : '500',
                    },
                  ]}
                >
                  {cat === 'all' ? t('posAllCategories') : cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Product Grid */}
      <ScrollView
        contentContainerStyle={[
          styles.gridContent,
          {
            paddingBottom: cart.length > 0 ? 170 : 100, // Thêm khoảng trống để không bị che bởi Bottom Cart Bar
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.productsGrid}>
          {filteredProducts.map((p) => {
            const hasVariants = p.variants && p.variants.length > 0;
            const inCartItem = cart.find((i) => i.product.id === p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.productCard,
                  {
                    backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: inCartItem ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
                activeOpacity={0.88}
                onPress={() => handleProductPress(p)}
              >
                <View style={styles.productImgWrap}>
                  <Image
                    source={p.imageUrl ? { uri: p.imageUrl } : require('../../assets/images/LOGO.jpg')}
                    style={styles.productImg}
                    contentFit="cover"
                  />
                  {inCartItem && (
                    <View style={styles.inCartBadge}>
                      <Text style={styles.inCartBadgeText}>{inCartItem.quantity}</Text>
                    </View>
                  )}
                  {hasVariants && (
                    <View style={styles.variantBadge}>
                      <Text style={styles.variantBadgeText}>Biến thể</Text>
                    </View>
                  )}
                </View>

                <View style={styles.productBody}>
                  <Text style={[styles.productName, { color: Colors.textPrimary }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <View style={styles.productBottomRow}>
                    <Text style={styles.productPrice}>{formatCurrency(p.salePrice || p.price)}</Text>
                    <View style={styles.btnAddQuick}>
                      <Ionicons name="add" size={17} color="#FFFFFF" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Floating Bottom POS Cart Bar (Liquid Glass Pill) */}
      {cart.length > 0 && (
        <View style={[styles.floatingCartWrap, { bottom: Math.max(insets.bottom, 12) + 72 }]}>
          <LiquidGlass style={styles.floatingCartInner}>
            <View style={styles.cartInfoLeft}>
              <View style={styles.cartBadgeCircle}>
                <Ionicons name="cart" size={18} color="#FFFFFF" />
                <View style={styles.cartBadgeNumber}>
                  <Text style={styles.cartBadgeNumberText}>{cartTotalQuantity}</Text>
                </View>
              </View>
              <View>
                <Text style={styles.cartTotalLabel}>Tạm tính ({cartTotalQuantity} món)</Text>
                <Text style={styles.cartTotalValue}>{formatCurrency(totalAmount)}</Text>
              </View>
            </View>

            <ScalePressable style={styles.btnCheckoutPill} onPress={handleOpenCheckout}>
              <Text style={styles.btnCheckoutPillText}>Thanh toán</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </ScalePressable>
          </LiquidGlass>
        </View>
      )}

      {/* VARIANT SELECTOR BOTTOM SHEET */}
      <AnimatedBottomSheetModal
        visible={!!selectedProductForVariant}
        onClose={() => setSelectedProductForVariant(null)}
        title={selectedProductForVariant?.name || 'Chọn biến thể men gốm'}
      >
        <View style={styles.variantList}>
          {selectedProductForVariant?.variants?.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[styles.variantItem, { borderColor: Colors.border, backgroundColor: Colors.surface }]}
              onPress={() => handleSelectVariant(v)}
            >
              <View>
                <Text style={[styles.variantName, { color: Colors.textPrimary }]}>{v.name}</Text>
                <Text style={[styles.variantStock, { color: Colors.textMuted }]}>Tồn kho: {v.stock ?? selectedProductForVariant?.stock}</Text>
              </View>
              <Text style={styles.variantPrice}>
                {formatCurrency(v.salePrice || v.price || selectedProductForVariant?.salePrice || selectedProductForVariant?.price)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </AnimatedBottomSheetModal>

      {/* CUSTOMER SEARCH & SELECT MODAL */}
      <AnimatedCenterModal
        visible={customerModalVisible}
        onClose={() => setCustomerModalVisible(false)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Gắn khách hàng vào đơn</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary }]}>Để áp dụng chiết khấu hạng hội viên & tích điểm gốm</Text>

        <View style={[styles.searchPill, { backgroundColor: Colors.surface, borderColor: Colors.border, marginVertical: 12 }]}>
          <Ionicons name="search" size={17} color={Colors.textSecondary} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: Colors.textPrimary }]}
            placeholder="Tìm theo Số điện thoại hoặc Tên khách..."
            placeholderTextColor={Colors.textMuted}
            value={custSearchQuery}
            onChangeText={setCustSearchQuery}
          />
        </View>

        <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
          {filteredCustomers.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.customerRow, { borderBottomColor: Colors.border }]}
              onPress={() => {
                selectCustomer(c);
                setCustomerModalVisible(false);
              }}
            >
              <View>
                <Text style={[styles.custItemName, { color: Colors.textPrimary }]}>{c.displayName}</Text>
                <Text style={[styles.custItemPhone, { color: Colors.textSecondary }]}>{c.phone || 'Chưa có SĐT'}</Text>
              </View>
              <View style={styles.custBadgeRight}>
                <Text style={styles.custBadgeTier}>{c.tier}</Text>
                <Text style={[styles.custItemPoints, { color: Colors.textMuted }]}>{c.points} điểm</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </AnimatedCenterModal>

      {/* CHECKOUT MODAL */}
      <Modal visible={checkoutModalVisible} animationType="slide" transparent={false}>
        <View style={[styles.checkoutContainer, { backgroundColor: Colors.background, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
          {/* Header */}
          <View style={styles.checkoutHeader}>
            <TouchableOpacity onPress={() => setCheckoutModalVisible(false)} style={styles.backCircleBtn}>
              <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.checkoutTitle, { color: Colors.textPrimary }]}>Thanh toán đơn quầy</Text>
            <TouchableOpacity onPress={clearCart}>
              <Text style={styles.clearCartText}>Hủy đơn</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.checkoutScroll} showsVerticalScrollIndicator={false}>
            {/* Cart Items List */}
            <View style={[styles.checkoutCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Sản phẩm trong đơn ({cart.length})</Text>
              {cart.map((item) => {
                const itemPrice = item.customPrice ?? (item.selectedVariant?.salePrice || item.selectedVariant?.price || item.product.salePrice || item.product.price);
                return (
                  <View key={item.cartItemId} style={[styles.cartItemRow, { borderBottomColor: isDark ? '#222222' : '#F0ECE6' }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.cartItemName, { color: Colors.textPrimary }]} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      {item.selectedVariant && (
                        <Text style={[styles.cartItemVariant, { color: Colors.textMuted }]}>Phân loại: {item.selectedVariant.name}</Text>
                      )}
                      <Text style={styles.cartItemPriceSingle}>{formatCurrency(itemPrice)}</Text>
                    </View>

                    <View style={styles.qtyControlRow}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.cartItemId, item.quantity - 1)}>
                        <Ionicons name="remove" size={15} color={Colors.textPrimary} />
                      </TouchableOpacity>
                      <Text style={[styles.qtyNumber, { color: Colors.textPrimary }]}>{item.quantity}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.cartItemId, item.quantity + 1)}>
                        <Ionicons name="add" size={15} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Loyalty & Member Perks */}
            {customer && (
              <View style={[styles.checkoutCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
                <View style={styles.customerHeaderRow}>
                  <View>
                    <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Hội viên: {customer.displayName}</Text>
                    <Text style={[styles.customerTierSub, { color: '#9C7156' }]}>Hạng {customer.tier} • Khả dụng {customer.points} điểm</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.togglePointsBtn, usePoints && styles.togglePointsBtnActive]}
                    onPress={() => setUsePoints(!usePoints)}
                  >
                    <Text style={[styles.togglePointsText, usePoints && { color: '#FFFFFF' }]}>
                      {usePoints ? 'Đang dùng điểm' : 'Dùng điểm'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Payment Method Selector */}
            <View style={[styles.checkoutCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Phương thức thanh toán</Text>
              <View style={styles.paymentMethodsRow}>
                {[
                  { id: 'cash', label: 'Tiền mặt', icon: 'cash-outline' },
                  { id: 'vietqr', label: 'VietQR', icon: 'qr-code-outline' },
                  { id: 'card', label: 'Quẹt thẻ', icon: 'card-outline' },
                ].map((pm) => {
                  const active = paymentMethod === pm.id;
                  return (
                    <TouchableOpacity
                      key={pm.id}
                      style={[
                        styles.payMethodBtn,
                        active && styles.payMethodBtnActive,
                        { borderColor: active ? '#9C7156' : isDark ? '#333' : '#E8E1D8' },
                      ]}
                      onPress={() => setPaymentMethod(pm.id as any)}
                    >
                      <Ionicons name={pm.icon as any} size={22} color={active ? '#9C7156' : Colors.textSecondary} />
                      <Text style={[styles.payMethodText, active && { color: '#9C7156', fontWeight: '700' }]}>{pm.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Cash given & Change calculator */}
              {paymentMethod === 'cash' && (
                <View style={styles.cashCalcWrap}>
                  <Text style={[styles.cashCalcLabel, { color: Colors.textSecondary }]}>Tiền khách đưa (VNĐ):</Text>
                  <TextInput
                    style={[styles.cashInput, { color: Colors.textPrimary, borderColor: Colors.border, backgroundColor: Colors.surface }]}
                    keyboardType="numeric"
                    value={String(cashGiven || '')}
                    onChangeText={(val) => setCashGiven(Number(val.replace(/\D/g, '')) || 0)}
                  />

                  {/* Quick Cash Buttons */}
                  <View style={styles.quickCashRow}>
                    {[totalAmount, 100000, 200000, 500000].map((amt, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.quickCashChip}
                        onPress={() => setCashGiven(amt)}
                      >
                        <Text style={styles.quickCashChipText}>{idx === 0 ? 'Đủ tiền' : formatCurrency(amt)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.changeDueRow}>
                    <Text style={[styles.changeDueLabel, { color: Colors.textSecondary }]}>Tiền thừa trả khách:</Text>
                    <Text style={styles.changeDueValue}>{formatCurrency(changeDue)}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Bill Summary */}
            <View style={[styles.checkoutCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <View style={styles.billRow}>
                <Text style={[styles.billLabel, { color: Colors.textSecondary }]}>Tiền hàng:</Text>
                <Text style={[styles.billVal, { color: Colors.textPrimary }]}>{formatCurrency(subtotal)}</Text>
              </View>
              {memberDiscountAmount > 0 && (
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, { color: '#9C7156' }]}>Ưu đãi hạng hội viên:</Text>
                  <Text style={[styles.billVal, { color: '#9C7156' }]}>-{formatCurrency(memberDiscountAmount)}</Text>
                </View>
              )}
              {pointsDiscountAmount > 0 && (
                <View style={styles.billRow}>
                  <Text style={[styles.billLabel, { color: '#9C7156' }]}>Điểm gốm khấu trừ:</Text>
                  <Text style={[styles.billVal, { color: '#9C7156' }]}>-{formatCurrency(pointsDiscountAmount)}</Text>
                </View>
              )}
              <View style={[styles.billDivider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />
              <View style={styles.billRow}>
                <Text style={[styles.billTotalLabel, { color: Colors.textPrimary }]}>TỔNG THANH TOÁN:</Text>
                <Text style={styles.billTotalVal}>{formatCurrency(totalAmount)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Confirm Button (Pill 52px) */}
          <ScalePressable
            style={[styles.btnFinalCheckout, isProcessing && { opacity: 0.6 }]}
            onPress={handleExecutePayment}
            disabled={isProcessing}
          >
            <Text style={styles.btnFinalCheckoutText}>
              {paymentMethod === 'vietqr' ? 'Hiển thị mã VietQR' : 'Xác nhận thu tiền'}
            </Text>
            <Ionicons name="checkmark-circle" size={19} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </ScalePressable>
        </View>
      </Modal>

      {/* VIETQR MODAL */}
      <AnimatedCenterModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', alignItems: 'center' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Quét mã VietQR thanh toán</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, marginBottom: 16 }]}>
          Khách dùng App ngân hàng quét mã chính xác số tiền
        </Text>

        <Image
          source={{ uri: generateVietQRUrl('POS', totalAmount) }}
          style={styles.qrImage}
          contentFit="contain"
        />

        <Text style={styles.qrAmountText}>{formatCurrency(totalAmount)}</Text>
        <Text style={[styles.qrBankSub, { color: Colors.textMuted }]}>Vietcombank • 1059447798 • TIEM NHA GOM</Text>

        <ScalePressable style={styles.btnQrDone} onPress={handleConfirmQRSuccess}>
          <Text style={styles.btnQrDoneText}>Khách đã chuyển khoản thành công</Text>
        </ScalePressable>
      </AnimatedCenterModal>

      {/* SUCCESS RECEIPT MODAL */}
      <AnimatedCenterModal
        visible={successReceiptModalVisible}
        onClose={() => {
          setSuccessReceiptModalVisible(false);
          resetAfterOrder();
        }}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', alignItems: 'center' }]}
      >
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark" size={32} color="#FFFFFF" />
        </View>
        <Text style={[styles.modalTitle, { color: Colors.textPrimary, marginTop: 12 }]}>Thanh toán thành công!</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 }]}>
          Đơn hàng {lastCompletedOrder?.orderCode} đã được lưu vào hệ thống
        </Text>

        <View style={styles.receiptBox}>
          <Text style={styles.receiptTotalLabel}>Tổng thu tại quầy</Text>
          <Text style={styles.receiptTotalVal}>{formatCurrency(lastCompletedOrder?.totalAmount || 0)}</Text>
        </View>

        <ScalePressable
          style={styles.btnNewPOSOrder}
          onPress={() => {
            setSuccessReceiptModalVisible(false);
            resetAfterOrder();
          }}
        >
          <Text style={styles.btnNewPOSOrderText}>Tạo đơn POS tiếp theo</Text>
        </ScalePressable>
      </AnimatedCenterModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerLeft: {},
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
  },
  customerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 190,
  },
  customerPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
  },
  searchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchPill: {
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
  },
  catChipsWrapper: {
    marginBottom: 8,
  },
  catChipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  catChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  productImgWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#FAF8F5',
    position: 'relative',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  inCartBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#9C7156',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  inCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  variantBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  variantBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  productBody: {
    padding: 10,
  },
  productName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    height: 34,
  },
  productBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  productPrice: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  btnAddQuick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingCartWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99,
  },
  floatingCartInner: {
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1.2,
    borderColor: '#9C7156',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  cartInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartBadgeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cartBadgeNumber: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#2B2928',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeNumberText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  cartTotalLabel: {
    fontSize: 11,
    color: '#6E665D',
  },
  cartTotalValue: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#2B2928',
  },
  btnCheckoutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#9C7156',
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
  },
  btnCheckoutPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  variantList: {
    gap: 10,
    marginTop: 10,
  },
  variantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  variantName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
  },
  variantStock: {
    fontSize: 12,
    marginTop: 2,
  },
  variantPrice: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  modalCard: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 2,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  custItemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  custItemPhone: {
    fontSize: 12,
  },
  custBadgeRight: {
    alignItems: 'flex-end',
  },
  custBadgeTier: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  custItemPoints: {
    fontSize: 11,
  },
  checkoutContainer: {
    flex: 1,
  },
  checkoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0ECE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  clearCartText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  checkoutScroll: {
    paddingHorizontal: 16,
  },
  checkoutCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    marginBottom: 10,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  cartItemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  cartItemVariant: {
    fontSize: 11.5,
    marginTop: 1,
  },
  cartItemPriceSingle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#9C7156',
    marginTop: 2,
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0ECE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyNumber: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 16,
    textAlign: 'center',
  },
  customerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerTierSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  togglePointsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F0ECE6',
  },
  togglePointsBtnActive: {
    backgroundColor: '#9C7156',
  },
  togglePointsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2B2928',
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  payMethodBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  payMethodBtnActive: {
    backgroundColor: 'rgba(156, 113, 86, 0.08)',
  },
  payMethodText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
  },
  cashCalcWrap: {
    marginTop: 14,
  },
  cashCalcLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  cashInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
  },
  quickCashRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  quickCashChip: {
    flex: 1,
    backgroundColor: '#F0ECE6',
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  quickCashChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2B2928',
  },
  changeDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#E8E1D8',
  },
  changeDueLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  changeDueValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9C7156',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  billLabel: {
    fontSize: 13,
  },
  billVal: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  billDivider: {
    height: 1,
    marginVertical: 8,
  },
  billTotalLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
  },
  billTotalVal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9C7156',
  },
  btnFinalCheckout: {
    marginHorizontal: 16,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  btnFinalCheckoutText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
  },
  qrAmountText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#9C7156',
    marginTop: 12,
  },
  qrBankSub: {
    fontSize: 11,
    marginTop: 4,
    marginBottom: 16,
  },
  btnQrDone: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnQrDoneText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptBox: {
    width: '100%',
    backgroundColor: 'rgba(156, 113, 86, 0.08)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  receiptTotalLabel: {
    fontSize: 12,
    color: '#6E665D',
  },
  receiptTotalVal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#9C7156',
    marginTop: 4,
  },
  btnNewPOSOrder: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2B2928',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnNewPOSOrderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
