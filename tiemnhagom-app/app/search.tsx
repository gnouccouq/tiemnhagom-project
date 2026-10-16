import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Keyboard,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ProductCard } from '../src/components/ProductCard';
import { EmptyState } from '../src/components/EmptyState';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { useThemeColor, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { getProducts } from '../src/services/productService';
import { Product } from '../src/types';
import { removeVietnameseTones } from '../src/utils/format';
import { useSettings } from '../src/context/SettingsContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';

const RECENT_SEARCHES_KEY = 'tng_recent_searches';
const MAX_RECENT_SEARCHES = 10;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const [searchText, setSearchText] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load products
    getProducts().then((data) => {
      setAllProducts(data);
      setLoading(false);
    });
    // Load recent searches
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then((data) => {
      if (data) {
        try {
          setRecentSearches(JSON.parse(data));
        } catch (e) {
          // ignore
        }
      }
    });
  }, []);

  const saveRecentSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    
    let updated = [trimmed, ...recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase())];
    updated = updated.slice(0, MAX_RECENT_SEARCHES);
    
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const handleSelectRecent = (term: string) => {
    setSearchText(term);
    saveRecentSearch(term);
  };

  const searchResults = useMemo(() => {
    const term = removeVietnameseTones(searchText.trim().toLowerCase());
    if (!term) return [];

    return allProducts.filter((product) => {
      const name = removeVietnameseTones(product.name.toLowerCase());
      const cat = removeVietnameseTones((product.category || '').toLowerCase());
      const sku = (product.id || '').toLowerCase();
      return name.includes(term) || cat.includes(term) || sku.includes(term);
    });
  }, [searchText, allProducts]);

  const { pageStyle } = usePageAnimation();

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={Colors.background} />

      {/* Kích hoạt thanh điều hướng gốc UINavigationBar & UISearchController Liquid Glass của iOS 26 */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitle: '',
          headerTintColor: '#9C7156',
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: t('searchPlaceholder') || 'Tìm kiếm sản phẩm...',
            tintColor: '#9C7156',
            textColor: isDark ? '#F5F5F5' : '#2B2928',
            headerIconColor: '#9C7156',
            hintTextColor: isDark ? 'rgba(245, 245, 245, 0.6)' : 'rgba(43, 41, 40, 0.6)',
            autoCapitalize: 'none',
            hideWhenScrolling: false,
            autoFocus: true,
            cancelButtonText: t('cancel') || 'Hủy',
            onChangeText: (e) => setSearchText(e.nativeEvent.text),
            onSearchButtonPress: (e) => {
              saveRecentSearch(e.nativeEvent.text);
              Keyboard.dismiss();
            },
            onCancelButtonPress: () => setSearchText(''),
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/cart')}
              style={styles.cartHeaderBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t('cartTab') || 'Giỏ hàng'}
            >
              <Ionicons name="bag-outline" size={22} color={isDark ? '#F5F5F5' : '#2B2928'} />
            </TouchableOpacity>
          ),
        }}
      />
      <FadingHeaderBackdrop />

      <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? insets.top + 48 : insets.top + 54 }]}>
        {!searchText.trim() ? (
          // Hiển thị Lịch sử tìm kiếm
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.recentSection}
          >
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>{t('recentSearches')}</Text>
              {recentSearches.length > 0 && (
                <TouchableOpacity onPress={clearRecentSearches}>
                  <Text style={styles.recentClearBtn}>{t('clearAll')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {recentSearches.length > 0 ? (
              <View style={styles.recentList}>
                {recentSearches.map((term, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.recentChip}
                    onPress={() => handleSelectRecent(term)}
                  >
                    <Ionicons name="time-outline" size={16} color={Colors.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={styles.recentChipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.recentEmptyText}>{t('noRecentSearches')}</Text>
            )}
            
            <View style={styles.suggestionSection}>
              <Text style={styles.recentTitle}>{t('suggestedKeywords')}</Text>
              <View style={styles.recentList}>
                {['Bình hoa', 'Ấm chén', 'Chén cơm', 'Quà tặng', 'Lọ lộc bình'].map((term, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionChip}
                    onPress={() => handleSelectRecent(term)}
                  >
                    <Ionicons name="search-outline" size={14} color="#9C7156" style={{ marginRight: 6 }} />
                    <Text style={styles.suggestionChipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : (
          // Hiển thị kết quả tìm kiếm realtime
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.listColumnWrapper}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            renderItem={({ item }) => (
              <View style={styles.productCardWrapper}>
                <ProductCard product={item} />
              </View>
            )}
            ListHeaderComponent={
              <Text style={styles.resultCountText}>
                {t('foundProductsCount', { count: searchResults.length, keyword: searchText })}
              </Text>
            }
            ListEmptyComponent={
              !loading ? (
                <EmptyState
                  icon="search-outline"
                  title={t('noProductsFound')}
                  message={t('noProductsFoundDesc', { keyword: searchText })}
                />
              ) : null
            }
          />
        )}
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
    container: {
      flex: 1,
    },
    recentSection: {
      padding: Spacing.lg,
    },
    recentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    recentTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.lg,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    recentClearBtn: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: '#9C7156',
    },
    recentList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    recentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : Colors.borderLight,
    },
    recentChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: Colors.textPrimary,
    },
    recentEmptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: Colors.textMuted,
      fontStyle: 'italic',
    },
    suggestionSection: {
      marginTop: 32,
    },
    suggestionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#2C2C2C' : '#F3F6F4',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: isDark ? 1.2 : 1,
      borderColor: isDark ? '#9C7156' : '#E8CCB2',
    },
    suggestionChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: isDark ? '#E8CCB2' : '#2B2928',
      fontWeight: '500',
    },
    listContent: {
      padding: Spacing.md,
      paddingBottom: 40,
    },
    listColumnWrapper: {
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    productCardWrapper: {
      width: '48%',
    },
    resultCountText: {
      fontFamily: 'ElleGaborStd',
      fontSize: Typography.fontSize.sm,
      color: Colors.textSecondary,
      marginBottom: Spacing.md,
    },
    cartHeaderBtn: {
      padding: 4,
      marginRight: Platform.OS === 'ios' ? 0 : 4,
    },
  });
