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

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [stock, setStock] = useState('10');
  const [category, setCategory] = useState('Đồ ăn & Bàn ăn');
  const [subCategory, setSubCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Variant addition modal state
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantStock, setVariantStock] = useState('5');
  const [showAddVariant, setShowAddVariant] = useState(false);

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
            setPrice(String(data.price || ''));
            setSalePrice(data.salePrice ? String(data.salePrice) : '');
            setStock(String(data.stock ?? 0));
            setCategory(data.category || 'Đồ ăn & Bàn ăn');
            setSubCategory(data.subCategory || '');
            setImageUrl(data.imageUrl || (data.images && data.images[0]) || '');
            setDescription(data.description || '');
            setIsHidden(!!data.isHidden);
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

    const saleNum = salePrice ? Number(salePrice.replace(/\D/g, '')) : undefined;
    const stockNum = Number(stock.replace(/\D/g, '')) || 0;

    setIsSaving(true);
    const productPayload: Partial<Product> = {
      name: name.trim(),
      code: code.trim() || undefined,
      price: priceNum,
      salePrice: saleNum,
      stock: stockNum,
      category,
      subCategory: subCategory.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      images: imageUrl.trim() ? [imageUrl.trim()] : [],
      description: description.trim() || undefined,
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
        Alert.alert('Thành công', 'Đã cập nhật thông tin sản phẩm.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Lỗi', 'Không thể cập nhật sản phẩm.');
      }
    }
  };

  const handleAddVariant = () => {
    if (!variantName.trim()) {
      Alert.alert('Thiếu tên biến thể', 'Vui lòng nhập tên biến thể (ví dụ: Men mộc nhám).');
      return;
    }
    const vPrice = variantPrice ? Number(variantPrice.replace(/\D/g, '')) : undefined;
    const vStock = Number(variantStock.replace(/\D/g, '')) || 0;
    const newVariant: ProductVariant = {
      id: `v_${Date.now()}`,
      name: variantName.trim(),
      price: vPrice,
      stock: vStock,
    };
    setVariants([...variants, newVariant]);
    setVariantName('');
    setVariantPrice('');
    setVariantStock('5');
    setShowAddVariant(false);
  };

  const handleRemoveVariant = (variantId: string) => {
    setVariants(variants.filter((v) => v.id !== variantId));
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backCircleBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>
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

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic Information Card */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Thông tin cơ bản</Text>

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
              <Text style={[styles.label, { color: Colors.textSecondary }]}>Tồn kho</Text>
              <TextInput
                style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
                placeholder="10"
                keyboardType="numeric"
                placeholderTextColor={Colors.textMuted}
                value={stock}
                onChangeText={setStock}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: Colors.textSecondary }]}>Giá niêm yết (VNĐ) (*)</Text>
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

          {/* Category Chips Selector */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>Danh mục</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipsRow}>
              {(categories.length > 0 ? categories.map((cat) => cat.name) : ['Dining Decor', 'Teatime & Drinks', 'Home Decor', 'Kitchenware', 'Lifestyle', 'Value Packs']).map((c) => {
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
        </View>

        {/* Media & Images Card */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Hình ảnh sản phẩm</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>Đường dẫn ảnh (URL)</Text>
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
        </View>

        {/* Variants Section */}
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
              <View>
                <Text style={[styles.varNameText, { color: Colors.textPrimary }]}>{v.name}</Text>
                <Text style={[styles.varSubText, { color: Colors.textMuted }]}>
                  {v.price ? `Giá: ${v.price.toLocaleString('vi-VN')}đ • ` : ''}Tồn: {v.stock ?? stock}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveVariant(v.id)}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}

          {showAddVariant && (
            <View style={[styles.addVariantBox, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
              <TextInput
                style={[styles.inputPillSmall, { color: Colors.textPrimary, borderColor: Colors.border }]}
                placeholder="Tên biến thể (VD: Men hỏa biến xanh)"
                placeholderTextColor={Colors.textMuted}
                value={variantName}
                onChangeText={setVariantName}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TextInput
                  style={[styles.inputPillSmall, { flex: 1, color: Colors.textPrimary, borderColor: Colors.border }]}
                  placeholder="Giá riêng (tùy chọn)"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                  value={variantPrice}
                  onChangeText={setVariantPrice}
                />
                <TextInput
                  style={[styles.inputPillSmall, { width: 90, color: Colors.textPrimary, borderColor: Colors.border }]}
                  placeholder="Kho"
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                  value={variantStock}
                  onChangeText={setVariantStock}
                />
              </View>
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

        {/* Visibility Setting */}
        <View style={[styles.card, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.cardTitle, { color: Colors.textPrimary, marginBottom: 2 }]}>Ẩn khỏi Web & App</Text>
              <Text style={[styles.toggleDesc, { color: Colors.textSecondary }]}>
                Khi bật, sản phẩm sẽ tạm ẩn khỏi khách hàng và chỉ hiện trong kho nội bộ
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
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  btnSaveHeader: {
    backgroundColor: '#9C7156',
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSaveHeaderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  label: {
    fontSize: 12.5,
    marginBottom: 6,
    fontWeight: '600',
  },
  inputPill: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  inputPillSmall: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  catChipsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  catChipItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  catChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
  },
  imagePreviewWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: 14,
  },
  variantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  btnAddVarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnAddVarText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#9C7156',
  },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  varNameText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
  },
  varSubText: {
    fontSize: 11.5,
    marginTop: 2,
  },
  addVariantBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  btnConfirmAddVar: {
    backgroundColor: '#9C7156',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
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
});
