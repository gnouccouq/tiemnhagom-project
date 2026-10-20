// app/product-edit/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useThemeColor } from '../../src/constants/theme';
import { addProduct, updateProduct, subscribeCategories } from '../../src/services/adminProductService';
import { Product, ProductVariant, Category } from '../../src/types';
import { ScalePressable } from '../../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../../src/components/FadingHeaderBackdrop';

export default function ProductEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Tab switcher in edit screen for clean organization
  const [activeTab, setActiveTab] = useState<'basic' | 'specs' | 'media' | 'variants'>('basic');

  // Form states - Thông tin cơ bản & Giá
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [rentalPrice, setRentalPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [stockMin, setStockMin] = useState('0');
  const [stockMax, setStockMax] = useState('999');
  const [category, setCategory] = useState('Dining Decor');
  const [subCategory, setSubCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isHidden, setIsHidden] = useState(false);

  // Kích thước, Trọng lượng & An toàn
  const [dimLength, setDimLength] = useState('');
  const [dimWidth, setDimWidth] = useState('');
  const [dimHeight, setDimHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [capacity, setCapacity] = useState('');
  const [material, setMaterial] = useState('');
  const [origin, setOrigin] = useState('');
  const [dishwasherSafe, setDishwasherSafe] = useState(true);
  const [microwaveSafe, setMicrowaveSafe] = useState(true);
  const [foodSafe, setFoodSafe] = useState(true);
  const [ovenSafe, setOvenSafe] = useState(false);

  // Hình ảnh & Gallery
  const [imageUrl, setImageUrl] = useState('');
  const [hoverImageUrl, setHoverImageUrl] = useState('');
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [newImageInput, setNewImageInput] = useState('');

  // Biến thể
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [varName, setVarName] = useState('');
  const [varPrice, setVarPrice] = useState('');
  const [varStock, setVarStock] = useState('5');
  const [varSku, setVarSku] = useState('');

  useEffect(() => {
    const unsubCat = subscribeCategories((cats) => setCategories(cats));
    return () => unsubCat();
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      (async () => {
        try {
          const docRef = doc(db, 'products', id);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            setName(data.name || '');
            setCode(data.code || snap.id);
            setBarcode(data.barcode || '');
            setCost(data.cost ? String(data.cost) : '');
            setPrice(String(data.price || ''));
            setSalePrice(data.salePrice ? String(data.salePrice) : '');
            setRentalPrice(data.rentalPrice ? String(data.rentalPrice) : '');
            setStock(String(data.stock ?? 0));
            setStockMin(data.stockMin !== undefined ? String(data.stockMin) : '0');
            setStockMax(data.stockMax !== undefined ? String(data.stockMax) : '999');
            setCategory(data.category || 'Dining Decor');
            setSubCategory(data.subCategory || '');
            setDescription(data.description || '');
            setIsHidden(!!data.isHidden);

            // Kích thước & an toàn
            setDimLength(data.dimLength ? String(data.dimLength) : '');
            setDimWidth(data.dimWidth ? String(data.dimWidth) : '');
            setDimHeight(data.dimHeight ? String(data.dimHeight) : '');
            setWeight(data.weight ? String(data.weight) : '');
            setCapacity(data.capacity ? String(data.capacity) : '');
            setMaterial(data.material || '');
            setOrigin(data.origin || '');
            setDishwasherSafe(data.dishwasherSafe !== undefined ? !!data.dishwasherSafe : true);
            setMicrowaveSafe(data.microwaveSafe !== undefined ? !!data.microwaveSafe : true);
            setFoodSafe(data.foodSafe !== undefined ? !!data.foodSafe : true);
            setOvenSafe(!!data.ovenSafe);

            // Ảnh
            const mainImg = data.imageUrl || (data.images && data.images[0]) || '';
            setImageUrl(mainImg);
            setHoverImageUrl(data.hoverImageUrl || '');
            setGalleryImages(Array.isArray(data.images) ? data.images : mainImg ? [mainImg] : []);

            // Biến thể
            setVariants(data.variants || []);
          }
        } catch (e) {
          console.warn(e);
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [id, isNew]);

  const handleAddGalleryImage = () => {
    if (!newImageInput.trim()) return;
    const url = newImageInput.trim();
    if (!galleryImages.includes(url)) {
      const updated = [...galleryImages, url];
      setGalleryImages(updated);
      if (!imageUrl) setImageUrl(url);
    }
    setNewImageInput('');
  };

  const handleRemoveGalleryImage = (urlToRemove: string) => {
    const updated = galleryImages.filter((img) => img !== urlToRemove);
    setGalleryImages(updated);
    if (imageUrl === urlToRemove) {
      setImageUrl(updated[0] || '');
    }
  };

  const handleAddVariant = () => {
    if (!varName.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên biến thể men gốm.');
      return;
    }
    const pNum = varPrice ? Number(varPrice.replace(/\D/g, '')) : undefined;
    const sNum = Number(varStock.replace(/\D/g, '')) || 0;

    const newVar: ProductVariant = {
      id: `v_${Date.now()}`,
      name: varName.trim(),
      price: pNum,
      stock: sNum,
      sku: varSku.trim() || undefined,
      isOutOfStock: sNum <= 0,
    };
    setVariants([...variants, newVar]);
    setVarName('');
    setVarPrice('');
    setVarStock('5');
    setVarSku('');
    setShowAddVariant(false);
  };

  const handleRemoveVariant = (variantId: string) => {
    setVariants(variants.filter((v) => v.id !== variantId));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên tác phẩm gốm.');
      return;
    }
    const priceNum = Number(price.replace(/\D/g, '')) || 0;
    if (priceNum <= 0) {
      Alert.alert('Giá không hợp lệ', 'Vui lòng nhập giá niêm yết của sản phẩm.');
      return;
    }

    const costNum = cost ? Number(cost.replace(/\D/g, '')) : undefined;
    const saleNum = salePrice ? Number(salePrice.replace(/\D/g, '')) : undefined;
    const rentalNum = rentalPrice ? Number(rentalPrice.replace(/\D/g, '')) : undefined;
    const stockNum = Number(stock.replace(/\D/g, '')) || 0;
    const sMinNum = stockMin ? Number(stockMin.replace(/\D/g, '')) : 0;
    const sMaxNum = stockMax ? Number(stockMax.replace(/\D/g, '')) : 999;

    // Kích thước specs
    const dL = dimLength ? parseFloat(dimLength) : undefined;
    const dW = dimWidth ? parseFloat(dimWidth) : undefined;
    const dH = dimHeight ? parseFloat(dimHeight) : undefined;
    const wNum = weight ? parseFloat(weight) : undefined;
    const capNum = capacity ? parseFloat(capacity) : undefined;

    // Tất cả ảnh
    const allImages = [...galleryImages];
    if (imageUrl && !allImages.includes(imageUrl)) {
      allImages.unshift(imageUrl);
    }

    setIsSaving(true);
    const productPayload: Partial<Product> = {
      name: name.trim(),
      code: code.trim() || undefined,
      barcode: barcode.trim() || undefined,
      cost: costNum,
      price: priceNum,
      salePrice: saleNum,
      rentalPrice: rentalNum,
      stock: stockNum,
      stockMin: sMinNum,
      stockMax: sMaxNum,
      category,
      subCategory: subCategory.trim() || undefined,
      imageUrl: imageUrl.trim() || allImages[0] || undefined,
      hoverImageUrl: hoverImageUrl.trim() || undefined,
      images: allImages,
      description: description.trim() || undefined,
      dimLength: dL,
      dimWidth: dW,
      dimHeight: dH,
      weight: wNum,
      capacity: capNum,
      material: material.trim() || undefined,
      origin: origin.trim() || undefined,
      dishwasherSafe,
      microwaveSafe,
      foodSafe,
      ovenSafe,
      isHidden,
      variants,
    };

    if (isNew) {
      const res = await addProduct(productPayload);
      setIsSaving(false);
      if (res.success) {
        Alert.alert('Thành công', 'Đã thêm tác phẩm gốm mới vào kho.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Lỗi', res.error || 'Không thể thêm sản phẩm.');
      }
    } else {
      const ok = await updateProduct(id, productPayload);
      setIsSaving(false);
      if (ok) {
        Alert.alert('Thành công', 'Đã cập nhật thông tin tác phẩm gốm.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Lỗi', 'Không thể cập nhật sản phẩm.');
      }
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color="#9C7156" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backCircleBtn, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1}>
            {isNew ? 'Thêm gốm mới' : 'Chỉnh sửa tác phẩm'}
          </Text>
        </View>

        <ScalePressable
          style={[styles.btnSaveHeader, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.btnSaveHeaderText}>Lưu</Text>
          )}
        </ScalePressable>
      </View>

      {/* 4 Tabs Selector for Organization */}
      <View style={styles.tabNavContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabNavRow}>
          {[
            { id: 'basic', label: 'Thông tin & Giá', icon: 'cube-outline' },
            { id: 'specs', label: 'Thông số & An toàn', icon: 'options-outline' },
            { id: 'media', label: 'Hình ảnh Gallery', icon: 'images-outline' },
            { id: 'variants', label: `Biến thể (${variants.length})`, icon: 'color-palette-outline' },
          ].map((t) => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tabNavPill,
                  {
                    backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: active ? '#9C7156' : isDark ? '#222222' : '#E8E1D8',
                  },
                ]}
                onPress={() => setActiveTab(t.id as any)}
              >
                <Ionicons
                  name={t.icon as any}
                  size={16}
                  color={active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.tabNavText,
                    { color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ==================== TAB 1: THÔNG TIN & GIÁ ==================== */}
        {activeTab === 'basic' && (
          <>
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Thông tin định danh</Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: Colors.textSecondary }]}>Tên tác phẩm gốm (*)</Text>
                <TextInput
                  style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                  placeholder="Ví dụ: Bình gốm men tro Bát Tràng"
                  placeholderTextColor={Colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Mã SKU / Mã gốm</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="TNG-B01"
                    placeholderTextColor={Colors.textMuted}
                    value={code}
                    onChangeText={setCode}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Mã vạch (Barcode)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="Quét mã vạch"
                    placeholderTextColor={Colors.textMuted}
                    value={barcode}
                    onChangeText={setBarcode}
                  />
                </View>
              </View>

              {/* Category Chips Selector */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: Colors.textSecondary }]}>Nhóm hàng / Danh mục</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipsRow}>
                  {(categories.length > 0 ? categories.map((c) => c.name) : ['Dining Decor', 'Teatime & Drinks', 'Home Decor', 'Kitchenware', 'Lifestyle', 'Value Packs']).map((c) => {
                    const active = category === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.catChipItem,
                          {
                            backgroundColor: active ? (isDark ? '#1E1E1E' : '#9C7156') : isDark ? Colors.cardBackground : '#FFFFFF',
                            borderColor: active ? '#9C7156' : Colors.border,
                          },
                        ]}
                        onPress={() => setCategory(c)}
                      >
                        <Text style={[styles.catChipText, { color: active ? (isDark ? '#E8CCB2' : '#FFFFFF') : Colors.textSecondary }]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: Colors.textSecondary }]}>Phân loại phụ (Subcategory)</Text>
                <TextInput
                  style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                  placeholder="Ví dụ: Bình & Lọ Hoa, Ấm Trà..."
                  placeholderTextColor={Colors.textMuted}
                  value={subCategory}
                  onChangeText={setSubCategory}
                />
              </View>
            </View>

            {/* Pricing & Stock Card */}
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Giá vốn, giá bán & Kho hàng</Text>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Giá bán (VNĐ) (*)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="250000"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Giá khuyến mãi</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="199000"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={salePrice}
                    onChangeText={setSalePrice}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Giá vốn nội bộ</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="120000"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={cost}
                    onChangeText={setCost}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Giá thuê đồ Decor</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="50000"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={rentalPrice}
                    onChangeText={setRentalPrice}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Tồn kho hiện tại</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="10"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={stock}
                    onChangeText={setStock}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Báo động tồn thấp nhất</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="2"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={stockMin}
                    onChangeText={setStockMin}
                  />
                </View>
              </View>
            </View>

            {/* Visibility Toggle */}
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.cardTitle, { color: Colors.textPrimary, marginBottom: 2 }]}>Ẩn khỏi Web & App</Text>
                  <Text style={[styles.toggleDesc, { color: Colors.textSecondary }]}>
                    Khi bật, sản phẩm sẽ tạm ẩn khỏi khách hàng và chỉ hiển thị trong kho nội bộ
                  </Text>
                </View>
                <Switch
                  value={isHidden}
                  onValueChange={setIsHidden}
                  trackColor={{ false: '#E8E1D8', true: '#9C7156' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </>
        )}

        {/* ==================== TAB 2: THÔNG SỐ & AN TOÀN ==================== */}
        {activeTab === 'specs' && (
          <>
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Kích thước & Quy cách gốm</Text>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Dài (cm)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="15"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={dimLength}
                    onChangeText={setDimLength}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Rộng (cm)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="15"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={dimWidth}
                    onChangeText={setDimWidth}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Cao (cm)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="22"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={dimHeight}
                    onChangeText={setDimHeight}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Trọng lượng (gram)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="850"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={weight}
                    onChangeText={setWeight}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Dung tích (ml)</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="450"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={capacity}
                    onChangeText={setCapacity}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Chất liệu men & đất</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="Gốm men tro mộc"
                    placeholderTextColor={Colors.textMuted}
                    value={material}
                    onChangeText={setMaterial}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: Colors.textSecondary }]}>Xuất xứ xưởng gốm</Text>
                  <TextInput
                    style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                    placeholder="Bát Tràng, Việt Nam"
                    placeholderTextColor={Colors.textMuted}
                    value={origin}
                    onChangeText={setOrigin}
                  />
                </View>
              </View>
            </View>

            {/* Safety & Care Card */}
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Tính năng an toàn & Sử dụng</Text>

              <View style={styles.safetyGrid}>
                <TouchableOpacity
                  style={[styles.safetyItem, dishwasherSafe && styles.safetyItemActive, { backgroundColor: dishwasherSafe ? 'rgba(156,113,86,0.1)' : Colors.surface }]}
                  onPress={() => setDishwasherSafe(!dishwasherSafe)}
                >
                  <Ionicons name="water-outline" size={20} color={dishwasherSafe ? '#9C7156' : Colors.textMuted} />
                  <Text style={[styles.safetyText, dishwasherSafe && { color: '#9C7156', fontWeight: '700' }]}>Máy rửa chén</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.safetyItem, microwaveSafe && styles.safetyItemActive, { backgroundColor: microwaveSafe ? 'rgba(156,113,86,0.1)' : Colors.surface }]}
                  onPress={() => setMicrowaveSafe(!microwaveSafe)}
                >
                  <Ionicons name="radio-outline" size={20} color={microwaveSafe ? '#9C7156' : Colors.textMuted} />
                  <Text style={[styles.safetyText, microwaveSafe && { color: '#9C7156', fontWeight: '700' }]}>Lò vi sóng</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.safetyItem, foodSafe && styles.safetyItemActive, { backgroundColor: foodSafe ? 'rgba(156,113,86,0.1)' : Colors.surface }]}
                  onPress={() => setFoodSafe(!foodSafe)}
                >
                  <Ionicons name="shield-checkmark-outline" size={20} color={foodSafe ? '#9C7156' : Colors.textMuted} />
                  <Text style={[styles.safetyText, foodSafe && { color: '#9C7156', fontWeight: '700' }]}>An toàn ăn uống</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.safetyItem, ovenSafe && styles.safetyItemActive, { backgroundColor: ovenSafe ? 'rgba(156,113,86,0.1)' : Colors.surface }]}
                  onPress={() => setOvenSafe(!ovenSafe)}
                >
                  <Ionicons name="flame-outline" size={20} color={ovenSafe ? '#9C7156' : Colors.textMuted} />
                  <Text style={[styles.safetyText, ovenSafe && { color: '#9C7156', fontWeight: '700' }]}>Lò nướng nhiệt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ==================== TAB 3: HÌNH ẢNH GALLERY ==================== */}
        {activeTab === 'media' && (
          <>
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Ảnh đại diện & Hover</Text>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: Colors.textSecondary }]}>URL Ảnh đại diện chính</Text>
                <TextInput
                  style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                  placeholder="https://tiemnhagom.vn/Asset/..."
                  placeholderTextColor={Colors.textMuted}
                  value={imageUrl}
                  onChangeText={setImageUrl}
                />
              </View>

              {imageUrl ? (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: imageUrl }} style={styles.imagePreview} contentFit="cover" />
                </View>
              ) : null}

              <View style={[styles.inputGroup, { marginTop: 14 }]}>
                <Text style={[styles.label, { color: Colors.textSecondary }]}>URL Ảnh thứ 2 (Hover card ngoài Web)</Text>
                <TextInput
                  style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                  placeholder="URL ảnh riêng khi di chuột..."
                  placeholderTextColor={Colors.textMuted}
                  value={hoverImageUrl}
                  onChangeText={setHoverImageUrl}
                />
              </View>

              {hoverImageUrl ? (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: hoverImageUrl }} style={styles.imagePreview} contentFit="cover" />
                </View>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Thư viện ảnh sản phẩm ({galleryImages.length})</Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.inputPill, { flex: 1, color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                  placeholder="Dán link ảnh gốm..."
                  placeholderTextColor={Colors.textMuted}
                  value={newImageInput}
                  onChangeText={setNewImageInput}
                />
                <TouchableOpacity style={styles.btnAddImgBtn} onPress={handleAddGalleryImage}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.galleryGrid}>
                {galleryImages.map((imgUrl, idx) => (
                  <View key={idx} style={styles.galleryItem}>
                    <Image source={{ uri: imgUrl }} style={styles.galleryThumb} contentFit="cover" />
                    <TouchableOpacity
                      style={styles.btnRemoveGallery}
                      onPress={() => handleRemoveGalleryImage(imgUrl)}
                    >
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                    {imageUrl === imgUrl && (
                      <View style={styles.coverBadge}>
                        <Text style={styles.coverBadgeText}>Ảnh bìa</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Description Text Area */}
            <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Câu chuyện & Mô tả gốm</Text>
              <TextInput
                style={[styles.textArea, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                placeholder="Mô tả chất đất, kỹ thuật tráng men, câu chuyện thủ công và hướng dẫn bảo quản..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
              />
            </View>
          </>
        )}

        {/* ==================== TAB 4: BIẾN THỂ ==================== */}
        {activeTab === 'variants' && (
          <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <View style={styles.variantsHeader}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary, marginBottom: 0 }]}>
                Biến thể men gốm ({variants.length})
              </Text>
              <TouchableOpacity onPress={() => setShowAddVariant(true)} style={styles.btnAddVarLink}>
                <Ionicons name="add-circle" size={18} color="#9C7156" />
                <Text style={styles.btnAddVarText}>Thêm biến thể</Text>
              </TouchableOpacity>
            </View>

            {variants.map((v) => (
              <View key={v.id} style={[styles.variantRow, { borderBottomColor: isDark ? '#222' : '#F0ECE6' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.varNameText, { color: Colors.textPrimary }]}>{v.name}</Text>
                  <Text style={[styles.varSubText, { color: Colors.textMuted }]}>
                    {v.price ? `Giá: ${v.price.toLocaleString('vi-VN')}đ • ` : ''}Tồn kho: {v.stock ?? stock} {v.sku ? `• SKU: ${v.sku}` : ''}
                  </Text>
                  {(v.stock !== undefined && v.stock <= 0) && (
                    <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700', marginTop: 2 }}>Hết hàng</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleRemoveVariant(v.id)} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}

            {showAddVariant && (
              <View style={[styles.addVariantBox, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                <TextInput
                  style={[styles.inputPillSmall, { color: Colors.textPrimary, borderColor: Colors.border }]}
                  placeholder="Tên biến thể (VD: Men hỏa biến ngọc bích)"
                  placeholderTextColor={Colors.textMuted}
                  value={varName}
                  onChangeText={setVarName}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={[styles.inputPillSmall, { flex: 1, color: Colors.textPrimary, borderColor: Colors.border }]}
                    placeholder="Giá riêng (tùy chọn)"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={varPrice}
                    onChangeText={setVarPrice}
                  />
                  <TextInput
                    style={[styles.inputPillSmall, { width: 85, color: Colors.textPrimary, borderColor: Colors.border }]}
                    placeholder="Kho"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={varStock}
                    onChangeText={setVarStock}
                  />
                </View>
                <TextInput
                  style={[styles.inputPillSmall, { marginTop: 8, color: Colors.textPrimary, borderColor: Colors.border }]}
                  placeholder="Mã SKU riêng (tùy chọn)"
                  placeholderTextColor={Colors.textMuted}
                  value={varSku}
                  onChangeText={setVarSku}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => setShowAddVariant(false)} style={{ padding: 6 }}>
                    <Text style={{ fontSize: 13, color: Colors.textSecondary }}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleAddVariant} style={styles.btnConfirmAddVar}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Lưu biến thể</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  btnSaveHeader: {
    backgroundColor: '#9C7156',
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  btnSaveHeaderText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  tabNavContainer: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  tabNavRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabNavPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
  },
  tabNavText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputPill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    fontSize: 14.5,
  },
  inputPillSmall: {
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13.5,
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  catChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  catChipItem: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  safetyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  safetyItemActive: {
    borderColor: '#9C7156',
  },
  safetyText: {
    fontSize: 13,
    color: '#6E665D',
  },
  imagePreviewWrap: {
    marginTop: 8,
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E8E1D8',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  btnAddImgBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryItem: {
    width: 75,
    height: 75,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E8E1D8',
  },
  galleryThumb: {
    width: '100%',
    height: '100%',
  },
  btnRemoveGallery: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    backgroundColor: '#9C7156',
    paddingVertical: 1,
    borderRadius: 4,
    alignItems: 'center',
  },
  coverBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  variantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnAddVarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnAddVarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9C7156',
  },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  varNameText: {
    fontSize: 14,
    fontWeight: '600',
  },
  varSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  addVariantBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  btnConfirmAddVar: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
});
