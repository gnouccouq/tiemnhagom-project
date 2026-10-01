import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '../constants/theme';
import { useCart } from '../context/CartContext';

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showCart?: boolean;
  showSearch?: boolean;
  onSearchPress?: () => void;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  onClearSearch?: () => void;
  searchPlaceholder?: string;
  transparent?: boolean;
  scrollY?: number;
  isScrolled?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBack = false,
  showCart = true,
  showSearch = true,
  onSearchPress,
  searchValue,
  onSearchChange,
  onSubmitEditing,
  autoFocus = false,
  onClearSearch,
  searchPlaceholder,
  transparent = false,
  scrollY,
  isScrolled = false,
}) => {
  const router = useRouter();
  const { cartCount } = useCart();
  const insets = useSafeAreaInsets();

  const statusBarHeight =
    insets.top > 0
      ? insets.top
      : Platform.OS === 'android'
      ? StatusBar.currentHeight || 24
      : 44;

  // Khi không transparent (các màn bình thường), luôn hiển thị màu đen đậm chuẩn xác (progress = 1)
  // Khi transparent (đầu trang chủ), progress chuyển dần từ 0 (trắng) -> 1 (đen) theo scrollY
  const progress = !transparent
    ? 1
    : scrollY !== undefined
    ? Math.min(1, Math.max(0, scrollY / 65))
    : isScrolled
    ? 1
    : 0;

  // Nếu không có title (hoặc trang chủ / tìm kiếm), hiển thị Header phong cách Uniqlo: Logo + Thanh tìm kiếm con nhộng + Giỏ hàng
  const isSearchHeader = !title;

  return (
    <View
      style={[
        styles.container,
        transparent
          ? [
              styles.containerTransparent,
              {
                paddingTop: statusBarHeight + (Platform.OS === 'android' ? 4 : 2),
                height: 54 + statusBarHeight,
              },
            ]
          : styles.containerDefault,
      ]}
    >
      {/* Lớp nền mờ chuyển màu mượt mà theo tiến trình cuộn */}
      {transparent && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.headerBackdrop,
            { opacity: progress },
          ]}
          pointerEvents="none"
        />
      )}

      {isSearchHeader ? (
        // ================= HEADER KIỂU UNIQLO (LOGO + SEARCH PILL + CART) =================
        <View style={styles.searchHeaderRow}>
          {/* 1. Logo tiệm (logongang.webp) hoặc nút quay lại */}
          <View style={styles.leftSection}>
            {showBack ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => router.back()}
                accessibilityLabel="Quay lại"
              >
                <View style={styles.iconCrossfadeBox}>
                  <Ionicons
                    name="chevron-back"
                    size={15}
                    color="#18181B"
                    style={{ opacity: progress }}
                  />
                  <Ionicons
                    name="chevron-back"
                    size={15}
                    color="#FFFFFF"
                    style={[styles.iconOverlay, { opacity: 1 - progress }]}
                  />
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/(tabs)')}
                style={styles.logoBtn}
                accessibilityLabel="Tiệm Nhà Gốm"
              >
                <View style={styles.logoContainer}>
                  {/* Logo đen (hiện dần khi cuộn xuống) */}
                  <Image
                    source={require('../../assets/images/logongang.webp')}
                    style={[styles.logoImage, { opacity: progress }]}
                    contentFit="contain"
                  />
                  {/* Logo trắng (mờ dần khi cuộn xuống) */}
                  <Image
                    source={require('../../assets/images/logongang.webp')}
                    style={[
                      styles.logoImage,
                      styles.logoOverlay,
                      {
                        opacity: 1 - progress,
                        ...(Platform.OS === 'web'
                          ? ({ filter: 'brightness(0) invert(1)' } as any)
                          : {}),
                      },
                    ]}
                    tintColor="#FFFFFF"
                    contentFit="contain"
                  />
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* 2. Thanh tìm kiếm con nhộng (Pill Capsule) */}
          {showSearch && (
            onSearchChange ? (
              <View style={styles.searchPill}>
                <TextInput
                  style={styles.searchInputInline}
                  placeholder={searchPlaceholder || 'Bạn đang tìm sản phẩm...'}
                  placeholderTextColor="#71717A"
                  value={searchValue}
                  onChangeText={onSearchChange}
                  onSubmitEditing={onSubmitEditing}
                  autoFocus={autoFocus}
                  returnKeyType="search"
                />
                {searchValue && searchValue.length > 0 ? (
                  <TouchableOpacity onPress={onClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={17} color="#71717A" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="search-outline" size={19} color="#71717A" />
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.searchPill}
                activeOpacity={0.88}
                onPress={onSearchPress || (() => router.push('/search'))}
                accessibilityLabel="Tìm kiếm sản phẩm"
              >
                <Text style={styles.searchPlaceholder} numberOfLines={1}>
                  {searchPlaceholder || 'Bạn đang tìm sản phẩm...'}
                </Text>
                <Ionicons name="search-outline" size={25} color="#71717A" />
              </TouchableOpacity>
            )
          )}

          {/* 3. Nút Giỏ hàng lớn & sắc nét */}
          {showCart && (
            <TouchableOpacity
              style={styles.cartButton}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/cart')}
              accessibilityLabel="Giỏ hàng"
            >
              <View style={styles.cartIconBox}>
                {/* Icon đen (hiện dần khi cuộn xuống) */}
                <Ionicons
                  name="cart-outline"
                  size={30}
                  color="#18181B"
                  style={{ opacity: progress }}
                />
                {/* Icon trắng (mờ dần khi cuộn xuống) */}
                <Ionicons
                  name="cart-outline"
                  size={30}
                  color="#FFFFFF"
                  style={[styles.iconOverlayCenter, { opacity: 1 - progress }]}
                />
              </View>

              {cartCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {cartCount > 99 ? '99+' : cartCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // ================= HEADER CÓ TIÊU ĐỀ (NOTIFICATIONS, PROFILE, ORDERS...) =================
        <View style={styles.titleHeaderRow}>
          <View style={styles.left}>
            {showBack ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => router.back()}
                accessibilityLabel="Quay lại"
              >
                <Ionicons name="chevron-back" size={26} color="#18181B" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.screenTitle}>{title}</Text>
            )}
          </View>

          {showBack && (
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
          )}

          <View style={styles.right}>
            {showCart && (
              <TouchableOpacity
                style={styles.cartButton}
                activeOpacity={0.8}
                onPress={() => router.push('/(tabs)/cart')}
                accessibilityLabel="Giỏ hàng"
              >
                <View style={styles.cartIconBox}>
                  <Ionicons name="cart-outline" size={35} color="#18181B" />
                </View>
                {cartCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {cartCount > 99 ? '99+' : cartCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  containerDefault: {
    height: 56,
    backgroundColor: '#FAF8F5',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE7DE',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  containerTransparent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    elevation: 0,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  headerBackdrop: {
    backgroundColor: 'rgba(250, 248, 245, 0.98)',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 4,
  },

  // SEARCH HEADER (UNIQLO STYLE)
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  leftSection: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBtn: {
    paddingVertical: 2,
    paddingRight: 2,
  },
  logoContainer: {
    width: 95,
    height: 33,
    position: 'relative',
    justifyContent: 'center',
  },
  logoImage: {
    width: 95,
    height: 33,
  },
  logoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  searchPill: {
    flex: 1,
    height: 39,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 11,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
  },
  searchPlaceholder: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#71717A',
    flex: 1,
    marginRight: 6,
  },
  searchInputInline: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#18181B',
    flex: 1,
    paddingVertical: 0,
    marginRight: 6,
  },
  cartButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartIconBox: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCrossfadeBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  iconOverlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    backgroundColor: '#E53935',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },

  // TITLE HEADER
  titleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  screenTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 19,
    fontWeight: '700',
    color: '#18181B',
    letterSpacing: 0.5,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0ECE6',
  },
});
