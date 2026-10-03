import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../src/constants/theme';
import { useWishlist } from '../src/context/WishlistContext';
import { ProductCard } from '../src/components/ProductCard';
import { EmptyState } from '../src/components/EmptyState';
import { getProducts } from '../src/services/productService';
import { Product } from '../src/types';

export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites } = useWishlist();
  const [loading, setLoading] = useState(true);
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);

  useEffect(() => {
    loadFavorites();
  }, [favorites]); // Re-load when favorites change

  const loadFavorites = async () => {
    try {
      if (favorites.length === 0) {
        setFavoriteProducts([]);
        setLoading(false);
        return;
      }
      
      const allProducts = await getProducts({ expandVariants: true });
      const filtered = allProducts.filter(p => favorites.includes(p.id));
      setFavoriteProducts(filtered);
    } catch (e) {
      console.error('Lỗi tải sản phẩm yêu thích:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color="#111111" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Sản phẩm yêu thích</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải sản phẩm...</Text>
          </View>
        ) : (
          <FlatList
            data={favoriteProducts}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.listColumnWrapper}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.productCardWrapper}>
                <ProductCard product={item} />
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="heart-outline"
                title="Chưa có sản phẩm yêu thích"
                message="Bạn chưa lưu món đồ gốm nào. Hãy thêm vào để dễ dàng xem lại nhé!"
                buttonText="Khám phá ngay"
                onButtonPress={() => router.push('/(tabs)/products')}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FAF8F5',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  headerRight: {
    width: 38,
  },
  container: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    marginTop: Spacing.sm,
    color: Colors.textMuted,
    fontSize: Typography.fontSize.sm,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl + 40,
  },
  listColumnWrapper: {
    justifyContent: 'space-between',
  },
  productCardWrapper: {
    width: '48%',
    marginBottom: Spacing.md,
  },
});
