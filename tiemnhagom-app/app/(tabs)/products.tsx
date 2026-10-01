// app/(tabs)/products.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { ProductCard } from '../../src/components/ProductCard';
import { CategoryChip } from '../../src/components/CategoryChip';
import { EmptyState } from '../../src/components/EmptyState';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { DEFAULT_CATEGORIES, getCategories, ProductCategoryItem, getProducts } from '../../src/services/productService';
import { Product } from '../../src/types';

const SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'popular', label: 'Bán chạy' },
  { id: 'price-asc', label: 'Giá tăng dần' },
  { id: 'price-desc', label: 'Giá giảm dần' },
];

export default function ProductsScreen() {
  const params = useLocalSearchParams<{ category?: string; search?: string; collection?: string }>();
  const [selectedCategory, setSelectedCategory] = useState<string>(params.category || 'all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [selectedCollection, setSelectedCollection] = useState<string>(params.collection || '');
  const [searchTerm, setSearchTerm] = useState<string>(params.search || '');
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc' | 'popular'>('newest');
  const [categories, setCategories] = useState<ProductCategoryItem[]>(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isCategoryView, setIsCategoryView] = useState<boolean>(!params.category && !params.search && !params.collection);

  // Tải danh mục thực tế từ Firestore
  useEffect(() => {
    getCategories().then((cats) => {
      if (cats && cats.length > 0) setCategories(cats);
    });
  }, []);

  // Update category & collection from route params if changed
  useEffect(() => {
    if (params.category || params.search || params.collection) {
      setIsCategoryView(false);
    }
    if (params.category) {
      // Kiểm tra nếu category truyền vào là subcategory
      const isSub = categories.some((c) => c.subs && c.subs.includes(params.category!));
      if (isSub) {
        const parent = categories.find((c) => c.subs && c.subs.includes(params.category!));
        if (parent) setSelectedCategory(parent.id);
        setSelectedSubCategory(params.category);
      } else {
        setSelectedCategory(params.category);
        setSelectedSubCategory('');
      }
    }
    if (params.collection !== undefined) {
      setSelectedCollection(params.collection);
    }
  }, [params.category, params.collection, categories]);

  const fetchItems = useCallback(async () => {
    try {
      const activeFilterCat = selectedSubCategory || selectedCategory;
      const data = await getProducts({
        category: activeFilterCat,
        collection: selectedCollection,
        searchTerm,
        sortBy,
        maxItems: 80,
      });
      setProducts(data);
    } catch (e) {
      console.warn('Lỗi load products:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedSubCategory, selectedCollection, searchTerm, sortBy]);

  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [fetchItems]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchItems();
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      {/* Dùng chung Header với Trang chủ: Logo + Search capsule + Cart */}
      <Header
        searchPlaceholder="Tìm sản phẩm gốm..."
      />

      {isCategoryView ? (
        <ScrollView contentContainerStyle={styles.categoryGridWrap} showsVerticalScrollIndicator={false}>
          <Text style={styles.categoryGridTitle}>Khám phá Danh mục</Text>
          <View style={styles.categoryGrid}>
            {categories.filter(c => c.id !== 'all').map((cat, index) => {
              const bgColors = ['#F9F6F0', '#F3F4F6', '#F5F0F0', '#F0F4F8', '#F4F5F0', '#FDF2F2'];
              const iconColors = ['#9A7B4F', '#4B5563', '#9CA3AF', '#3B82F6', '#65A30D', '#EF4444'];
              const bgColor = bgColors[index % bgColors.length];
              const iconColor = iconColors[index % iconColors.length];
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryGridItem, { backgroundColor: bgColor }]}
                  activeOpacity={0.9}
                  onPress={() => {
                    setSelectedCategory(cat.id);
                    setSelectedSubCategory('');
                    setIsCategoryView(false);
                  }}
                >
                  <View style={styles.categoryGridIconWrap}>
                    <Ionicons name={cat.icon as any} size={32} color={iconColor} />
                  </View>
                  <Text style={[styles.categoryGridText, { color: '#1F2937' }]} numberOfLines={2}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.backButton} onPress={() => setIsCategoryView(true)}>
              <Ionicons name="chevron-back" size={24} color="#18181B" />
              <Text style={styles.backButtonText}>Danh mục</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {categories.find((c) => c.id === selectedCategory)?.name || 'Sản phẩm'}
            </Text>
            <View style={{ width: 24 }} />
          </View>
      {(() => {
        const activeGroup = categories.find((c) => c.id === selectedCategory);
        const subsToShow =
          activeGroup && activeGroup.subs && activeGroup.subs.length > 0
            ? activeGroup.subs
            : Array.from(new Set(categories.flatMap((c) => c.subs || []))).slice(0, 10);

        if (!subsToShow || subsToShow.length === 0) return null;

        return (
          <View style={styles.subCategoriesWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subCategoryList}
            >
              <TouchableOpacity
                style={[
                  styles.subCategoryChip,
                  selectedSubCategory === '' && styles.subCategoryChipActive,
                ]}
                onPress={() => setSelectedSubCategory('')}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.subCategoryText,
                    selectedSubCategory === '' && styles.subCategoryTextActive,
                  ]}
                >
                  {activeGroup && activeGroup.id !== 'all' ? `Tất cả ${activeGroup.name}` : 'Tất cả'}
                </Text>
              </TouchableOpacity>

              {subsToShow.map((sub, idx) => {
                const isSelected = selectedSubCategory === sub;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.subCategoryChip,
                      isSelected && styles.subCategoryChipActive,
                    ]}
                    onPress={() => setSelectedSubCategory(isSelected ? '' : sub)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.subCategoryText,
                        isSelected && styles.subCategoryTextActive,
                      ]}
                    >
                      {sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );
      })()}

      {/* Active Collection Filter Tag */}
      {selectedCollection ? (
        <View style={styles.collectionBadgeWrap}>
          <Text style={styles.collectionBadgeLabel}>Bộ sưu tập: </Text>
          <View style={styles.collectionBadgePill}>
            <Text style={styles.collectionBadgeText}>{selectedCollection}</Text>
            <TouchableOpacity onPress={() => setSelectedCollection('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#8A5A2B" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Sort Options Bar */}
      <View style={styles.sortBar}>
        <Text style={styles.countText}>
          {products.length} sản phẩm
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortOptions}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.sortChip, sortBy === opt.id && styles.sortChipActive]}
              onPress={() => setSortBy(opt.id as any)}
            >
              <Text style={[styles.sortText, sortBy === opt.id && styles.sortTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Products Grid */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải sản phẩm gốm...</Text>
        </View>
      ) : products.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="Không tìm thấy sản phẩm"
          message="Hãy thử tìm bằng từ khóa khác hoặc chuyển sang danh mục khác nhé."
          buttonText="Xem tất cả sản phẩm"
          onButtonPress={() => {
            setSearchTerm('');
            setSelectedCategory('all');
          }}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          renderItem={({ item }) => <ProductCard product={item} />}
        />
      )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  categoriesWrap: {
    marginTop: 10,
  },
  categoryList: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  subCategoriesWrap: {
    marginTop: 6,
    marginBottom: 4,
  },
  subCategoryList: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    gap: 6,
  },
  subCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    borderRadius: 14,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    marginRight: 6,
  },
  subCategoryChipActive: {
    backgroundColor: '#18181B',
    borderColor: '#18181B',
  },
  subCategoryText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  subCategoryTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E8DF',
    marginBottom: 6,
  },
  countText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#7A827E',
    fontWeight: '600',
    marginRight: 8,
  },
  sortOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sortChipActive: {
    backgroundColor: '#EEF3EB',
    borderColor: '#E1E8DF',
  },
  sortText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#7A827E',
  },
  sortTextActive: {
    fontFamily: 'ElleGaborStd',
    color: '#3B4D45',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 110,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    marginTop: 8,
    color: '#7A827E',
    fontSize: 13,
  },
  collectionBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
  },
  collectionBadgeLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#7A827E',
  },
  collectionBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FDF6EC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3DFC6',
  },
  collectionBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#8A5A2B',
    fontWeight: '700',
  },
  categoryGridWrap: {
    padding: 16,
    paddingBottom: 110,
  },
  categoryGridTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 16,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryGridItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  categoryGridIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FAF8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryGridText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#3B4D45',
    textAlign: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FAF8F5',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginLeft: -8,
  },
  backButtonText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '800',
    color: '#18181B',
    textTransform: 'uppercase',
  },
});
