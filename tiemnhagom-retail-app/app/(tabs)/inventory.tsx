// app/(tabs)/inventory.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import {
  subscribeProducts,
  quickUpdateStock,
  toggleProductVisibility,
  deleteProduct,
} from '../../src/services/adminProductService';
import { Product } from '../../src/types';
import { formatCurrency } from '../../src/utils/format';
import { ScalePressable } from '../../src/components/ScalePressable';
import { AnimatedCenterModal } from '../../src/components/AnimatedCenterModal';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();
  const { t } = useSettings();

  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Quick Stock Adjustment Modal
  const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
  const [newStockVal, setNewStockVal] = useState('');
  const [isAdditive, setIsAdditive] = useState(false);
  const [stockReason, setStockReason] = useState('Kiểm kê tại quầy');

  useEffect(() => {
    const unsub = subscribeProducts((data) => setProducts(data));
    return () => unsub();
  }, []);

  // Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtered Products (hỗ trợ tên, mã SKU, mã vạch)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCat === 'all' || p.category === selectedCat;
      const matchLow = !onlyLowStock || p.stock <= 5;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));
      return matchCat && matchLow && matchQuery;
    });
  }, [products, selectedCat, onlyLowStock, searchQuery]);

  const handleOpenStockModal = (product: Product) => {
    setStockModalProduct(product);
    setNewStockVal(String(product.stock));
    setIsAdditive(false);
    setStockReason('Kiểm kê tại quầy');
  };

  const handleSaveStock = async () => {
    if (!stockModalProduct) return;
    const num = parseInt(newStockVal, 10);
    if (isNaN(num)) {
      Alert.alert('Số lượng không hợp lệ', 'Vui lòng nhập một số hợp lệ.');
      return;
    }
    const finalStock = isAdditive ? (stockModalProduct.stock || 0) + num : Math.max(0, num);
    await quickUpdateStock(
      stockModalProduct.id,
      finalStock,
      stockModalProduct.name,
      stockModalProduct.stock,
      stockReason || (isAdditive ? 'Nhập thêm hàng vào kho' : 'Điều chỉnh tồn kho'),
      adminProfile?.displayName || 'Thu ngân'
    );
    setStockModalProduct(null);
  };

  const handleToggleHide = async (product: Product) => {
    await toggleProductVisibility(product.id, !product.isHidden);
  };

  const handleDelete = (product: Product) => {
    Alert.alert(
      t('deleteProduct'),
      t('confirmDeleteProduct'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('deleteProduct'),
          style: 'destructive',
          onPress: async () => {
            await deleteProduct(product.id);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
            {t('navInventory')}
          </Text>
          <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
            {products.length} tác phẩm gốm
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {/* Inventory Log Shortcut Pill */}
          <ScalePressable
            style={[styles.btnLogShortcut, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => router.push('/inventory-log' as any)}
          >
            <Ionicons name="time-outline" size={17} color="#9C7156" />
          </ScalePressable>

          {/* Add Product CTA Pill */}
          <ScalePressable
            style={styles.btnAddProduct}
            onPress={() => router.push('/product-edit/new' as any)}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.btnAddProductText}>Thêm mới</Text>
          </ScalePressable>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchPill, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: Colors.textPrimary }]}
            placeholder={t('searchProductPlaceholder')}
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

      {/* Quick Modules Strip */}
      <View style={styles.quickModulesStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickModulesContent}>
          <TouchableOpacity
            style={[styles.quickModulePill, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => router.push('/categories' as any)}
          >
            <Ionicons name="grid-outline" size={13} color="#9C7156" />
            <Text style={[styles.quickModuleText, { color: Colors.textPrimary }]}>Danh mục</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickModulePill, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => router.push('/flash-sale' as any)}
          >
            <Ionicons name="flame-outline" size={13} color="#9C7156" />
            <Text style={[styles.quickModuleText, { color: Colors.textPrimary }]}>Flash Sale</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickModulePill, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => router.push('/restock-alerts' as any)}
          >
            <Ionicons name="alert-circle-outline" size={13} color="#9C7156" />
            <Text style={[styles.quickModuleText, { color: Colors.textPrimary }]}>Báo có hàng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickModulePill, { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}
            onPress={() => router.push('/inventory-log' as any)}
          >
            <Ionicons name="clipboard-outline" size={13} color="#9C7156" />
            <Text style={[styles.quickModuleText, { color: Colors.textPrimary }]}>Nhật ký kho</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Filter Row: Low stock toggle + Category chips */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[
            styles.lowStockToggle,
            onlyLowStock && styles.lowStockToggleActive,
            { borderColor: onlyLowStock ? '#D97706' : Colors.border },
          ]}
          onPress={() => setOnlyLowStock(!onlyLowStock)}
        >
          <Ionicons name="alert-circle" size={14} color={onlyLowStock ? '#D97706' : Colors.textMuted} />
          <Text style={[styles.lowStockToggleText, onlyLowStock && { color: '#D97706', fontWeight: '700' }]} numberOfLines={1}>
            Sắp hết (≤ 5)
          </Text>
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.catScroll}>
          {categories.map((c) => {
            const active = selectedCat === c;
            return (
              <TouchableOpacity
                key={c}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: active ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
                onPress={() => setSelectedCat(c)}
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
                  {c === 'all' ? 'Tất cả' : c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Products List */}
      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 84,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filteredProducts.map((p) => {
          const isLow = p.stock <= 5;
          return (
            <View
              key={p.id}
              style={[
                styles.productCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
                p.isHidden && { opacity: 0.65 },
              ]}
            >
              <TouchableOpacity
                style={styles.cardMainTouch}
                activeOpacity={0.88}
                onPress={() => router.push(`/product-edit/${p.id}` as any)}
              >
                <Image
                  source={p.imageUrl ? { uri: p.imageUrl } : require('../../assets/images/LOGO.jpg')}
                  style={styles.productThumb}
                  contentFit="cover"
                />

                <View style={styles.cardInfo}>
                  <View style={styles.codeRow}>
                    <Text style={[styles.productCode, { color: Colors.textMuted }]} numberOfLines={1}>
                      {p.code || p.id}
                    </Text>
                    {p.isHidden && (
                      <View style={styles.hiddenTag}>
                        <Text style={styles.hiddenTagText}>ĐÃ ẨN</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.productName, { color: Colors.textPrimary }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[styles.productCategory, { color: Colors.textSecondary }]} numberOfLines={1}>
                    {p.category} {p.subCategory ? `› ${p.subCategory}` : ''}
                  </Text>

                  <View style={styles.priceRow}>
                    <Text style={styles.productPrice} numberOfLines={1}>
                      {formatCurrency(p.salePrice || p.price)}
                    </Text>
                    {p.sale ? (
                      <Text style={[styles.productOriginalPrice, { color: Colors.textMuted }]} numberOfLines={1}>
                        {formatCurrency(p.price)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>

              {/* Action Toolbar */}
              <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222222' : '#F0ECE6' }]} />

              <View style={styles.cardActions}>
                {/* Stock button (Click to adjust) */}
                <TouchableOpacity
                  style={[styles.stockPill, isLow && { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                  onPress={() => handleOpenStockModal(p)}
                >
                  <Ionicons name="cube-outline" size={14} color={isLow ? '#D97706' : Colors.textSecondary} />
                  <Text style={[styles.stockPillText, isLow && { color: '#D97706', fontWeight: '700' }]} numberOfLines={1}>
                    Kho: {p.stock}
                  </Text>
                  <Ionicons name="create-outline" size={12} color={isLow ? '#D97706' : Colors.textMuted} />
                </TouchableOpacity>

                <View style={styles.toolIconGroup}>
                  {/* Toggle Hide / Show */}
                  <TouchableOpacity
                    style={styles.toolIconBtn}
                    onPress={() => handleToggleHide(p)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={p.isHidden ? 'eye-off' : 'eye-outline'}
                      size={18}
                      color={p.isHidden ? '#DC2626' : Colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {/* Edit button */}
                  <TouchableOpacity
                    style={styles.toolIconBtn}
                    onPress={() => router.push(`/product-edit/${p.id}` as any)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Delete button */}
                  <TouchableOpacity
                    style={styles.toolIconBtn}
                    onPress={() => handleDelete(p)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* QUICK STOCK ADJUSTMENT MODAL */}
      <AnimatedCenterModal
        visible={!!stockModalProduct}
        onClose={() => setStockModalProduct(null)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Điều chỉnh số lượng tồn kho</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, marginBottom: 12 }]} numberOfLines={1}>
          {stockModalProduct?.name} (Hiện tại: {stockModalProduct?.stock || 0})
        </Text>

        {/* Mode Selector */}
        <View style={[styles.stockModeGroup, { backgroundColor: isDark ? '#1E1E1E' : '#F0ECE6' }]}>
          <TouchableOpacity
            style={[styles.stockModeBtn, !isAdditive && styles.stockModeBtnActive]}
            onPress={() => setIsAdditive(false)}
          >
            <Text style={[styles.stockModeText, !isAdditive && styles.stockModeTextActive]}>Đặt số lượng mới</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stockModeBtn, isAdditive && styles.stockModeBtnActive]}
            onPress={() => {
              setIsAdditive(true);
              setNewStockVal('5');
            }}
          >
            <Text style={[styles.stockModeText, isAdditive && styles.stockModeTextActive]}>+ Nhập thêm hàng</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stockInputRow}>
          <TouchableOpacity
            style={styles.stockStepBtn}
            onPress={() => setNewStockVal(String(Math.max(0, (parseInt(newStockVal, 10) || 0) - 1)))}
          >
            <Ionicons name="remove" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>

          <TextInput
            style={[styles.stockInput, { color: Colors.textPrimary, borderColor: Colors.border, backgroundColor: Colors.surface }]}
            keyboardType="numeric"
            value={newStockVal}
            onChangeText={setNewStockVal}
          />

          <TouchableOpacity
            style={styles.stockStepBtn}
            onPress={() => setNewStockVal(String((parseInt(newStockVal, 10) || 0) + 1))}
          >
            <Ionicons name="add" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Quick Reason Chips */}
        <View style={{ marginTop: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 }}>
            Lý do biến động kho:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['Nhập hàng từ lò', 'Kiểm kê định kỳ', 'Bù trừ kiểm kho', 'Hàng vỡ / nứt'].map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.reasonChip,
                  stockReason === r && styles.reasonChipActive,
                  { borderColor: stockReason === r ? '#9C7156' : isDark ? '#333' : '#E8E1D8' },
                ]}
                onPress={() => setStockReason(r)}
              >
                <Text style={[styles.reasonChipText, stockReason === r && { color: '#9C7156', fontWeight: '700' }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScalePressable style={styles.btnSaveStock} onPress={handleSaveStock}>
          <Text style={styles.btnSaveStockText}>
            {isAdditive ? `Nhập thêm +${newStockVal || 0}` : 'Lưu tồn kho mới'}
          </Text>
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
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
  },
  btnLogShortcut: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnAddProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9C7156',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  btnAddProductText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
  quickModulesStrip: {
    marginBottom: 10,
  },
  quickModulesContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickModulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  quickModuleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  lowStockToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#FFFBEB',
    flexShrink: 0,
  },
  lowStockToggleActive: {
    backgroundColor: '#FEF3C7',
  },
  lowStockToggleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#92400E',
  },
  catScroll: {
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  catChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 4,
  },
  productCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  cardMainTouch: {
    flexDirection: 'row',
    gap: 12,
  },
  productThumb: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: '#FAF8F5',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  productCode: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  hiddenTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hiddenTagText: {
    color: '#DC2626',
    fontSize: 9,
    fontWeight: '700',
  },
  productName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
  },
  productCategory: {
    fontSize: 11.5,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 3,
  },
  productPrice: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  productOriginalPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  cardDivider: {
    height: 1,
    marginVertical: 10,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(156, 113, 86, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 0.8,
    borderColor: '#E8CCB2',
  },
  stockPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#9C7156',
  },
  toolIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  toolIconBtn: {
    padding: 2,
  },
  modalCard: {
    width: '90%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
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
  stockInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  stockStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0ECE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockInput: {
    width: 90,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  btnSaveStock: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSaveStockText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stockModeGroup: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 3,
    marginBottom: 14,
  },
  stockModeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 15,
  },
  stockModeBtnActive: {
    backgroundColor: '#9C7156',
  },
  stockModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E665D',
  },
  stockModeTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  reasonChipActive: {
    backgroundColor: 'rgba(156, 113, 86, 0.08)',
  },
  reasonChipText: {
    fontSize: 11.5,
    color: '#6E665D',
  },
});
