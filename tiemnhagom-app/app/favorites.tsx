import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, FlatList, ActivityIndicator, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Colors, Typography, Spacing, useThemeColor } from '../src/constants/theme';
import { useWishlist } from '../src/context/WishlistContext';
import { useSettings } from '../src/context/SettingsContext';
import { ProductCard } from '../src/components/ProductCard';
import { EmptyState } from '../src/components/EmptyState';
import { Header } from '../src/components/Header';
import { getProducts } from '../src/services/productService';
import { Product } from '../src/types';
import { usePageAnimation } from '../src/hooks/usePageAnimation';

export default function FavoritesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ThemeColors = useThemeColor();
  const isDark = ThemeColors.cardBackground !== '#FFFFFF';
  const { favorites } = useWishlist();
  const { t } = useSettings();
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

  const [scrollY, setScrollY] = useState(0);

  const { pageStyle } = usePageAnimation();

  return (
    <Animated.View style={[styles.safeArea, { backgroundColor: ThemeColors.background }, pageStyle]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={ThemeColors.background} />
      
      {/* Header chuẩn app Tiệm Nhà Gốm */}
      <Header
        title={t('favoriteProducts')}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent={true}
        scrollY={scrollY}
      />

      <View style={styles.container}>
        {loading ? (
          <View style={[styles.loadingWrap, { paddingTop: insets.top + 80 }]}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('loadingProducts')}</Text>
          </View>
        ) : (
          <FlatList
            data={favoriteProducts}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.listColumnWrapper}
            contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 54 + 10 }]}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <View style={styles.productCardWrapper}>
                <ProductCard product={item} />
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="heart-outline"
                title={t('emptyFavoritesTitle')}
                message={t('emptyFavoritesMessage')}
                buttonText={t('exploreNow')}
                onButtonPress={() => router.push('/(tabs)/products')}
              />
            }
          />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
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
