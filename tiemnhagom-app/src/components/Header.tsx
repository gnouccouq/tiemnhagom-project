import React from 'react';
import {
  View, useColorScheme,
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
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor, Typography, Spacing } from '../constants/theme';
import { useCart } from '../context/CartContext';
import { useNotificationBadge } from '../context/NotificationBadgeContext';
import { ScalePressable } from './ScalePressable';
import { BlurButton } from './BlurButton';

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showCart?: boolean;
  showSearch?: boolean;
  showSettings?: boolean;
  onSettingsPress?: () => void;
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
  showSettings = false,
  onSettingsPress,
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
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const { cartCount } = useCart();
  const { unreadCount } = useNotificationBadge();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';

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
        <View style={[StyleSheet.absoluteFill, { opacity: progress }]} pointerEvents="none">
          <BlurView
            intensity={Platform.OS === 'ios' ? 95 : 85}
            tint={Colors.cardBackground === "#FFFFFF" ? "light" : "dark"}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.headerBackdrop]} />
        </View>
      )}

      {isSearchHeader ? (
        // ================= HEADER KIỂU UNIQLO (LOGO + SEARCH PILL + CART) =================
        <View style={styles.searchHeaderRow}>
          {/* 1. Logo tiệm (logongang.webp) hoặc nút quay lại */}
          <View style={styles.leftSection}>
            {showBack ? (
              <BlurButton
                style={styles.iconButton}
                onPress={() => router.back()}
                accessibilityLabel="Quay lại"
              >
                <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
              </BlurButton>
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
                    style={[styles.logoImage, { opacity: isDark ? 0 : progress }]}
                    tintColor={isDark ? undefined : Colors.textPrimary}
                    contentFit="contain"
                  />
                  {/* Logo trắng (mờ dần khi cuộn xuống) */}
                  <Image
                    source={require('../../assets/images/logongang.webp')}
                    style={[
                      styles.logoImage,
                      styles.logoOverlay,
                      {
                        opacity: isDark ? 1 : (1 - progress),
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
              <View style={styles.searchPill}><BlurView intensity={Platform.OS === 'ios' ? 95 : 85} tint={Colors.cardBackground === "#FFFFFF" ? "light" : "dark"} experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'} style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, styles.searchPillOverlay]} />
                <TextInput
                  style={styles.searchInputInline}
                  placeholder={searchPlaceholder || 'Bạn đang tìm sản phẩm...'}
                  placeholderTextColor={Colors.textMuted}
                  value={searchValue}
                  onChangeText={onSearchChange}
                  onSubmitEditing={onSubmitEditing}
                  autoFocus={autoFocus}
                  returnKeyType="search"
                />
                {searchValue && searchValue.length > 0 ? (
                  <TouchableOpacity onPress={onClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="search-outline" size={19} color={Colors.textMuted} />
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.searchPill}
                activeOpacity={0.88}
                onPress={onSearchPress || (() => router.push('/search'))}
                accessibilityLabel="Tìm kiếm sản phẩm"
              >
                <BlurView intensity={Platform.OS === 'ios' ? 95 : 85} tint={Colors.cardBackground === "#FFFFFF" ? "light" : "dark"} experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'} style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, styles.searchPillOverlay]} /><Text style={styles.searchPlaceholder} numberOfLines={1}>
                  {searchPlaceholder || 'Bạn đang tìm sản phẩm...'}
                </Text>
                <Ionicons name="search-outline" size={25} color={Colors.textMuted} />
              </TouchableOpacity>
            )
          )}

          {/* 3. Nút Thông báo (Thay cho Giỏ hàng) */}
          {showCart && (
            <BlurButton
                style={styles.iconButton}
              onPress={() => router.push('/notifications')}
              accessibilityLabel="Thông báo"
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={[styles.badge, { width: 10, height: 10, borderRadius: 5, paddingHorizontal: 0, minWidth: 10, top: -2, right: -2 }]} />
              )}
            </BlurButton>
          )}
        </View>
      ) : (
        // ================= HEADER CÓ TIÊU ĐỀ (NOTIFICATIONS, PROFILE, ORDERS...) =================
        <View style={styles.titleHeaderRow}>
          <View style={styles.left}>
            {showBack ? (
              <BlurButton
                style={styles.iconButton}
                onPress={() => router.back()}
                accessibilityLabel="Quay lại"
              >
                <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
              </BlurButton>
            ) : (
              <Text style={styles.screenTitle}>{title}</Text>
            )}
          </View>

          {showBack && (
            <View style={styles.titleContainer} pointerEvents="none">
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
          )}

          <View style={styles.right}>
            {showSettings && (
              <BlurButton
                style={[styles.iconButton, { marginRight: 8 }]}
                onPress={onSettingsPress}
                accessibilityLabel="Cài đặt"
              >
                <Ionicons name="settings-outline" size={22} color={Colors.textPrimary} />
              </BlurButton>
            )}
            {showCart && (
              <BlurButton
                style={styles.iconButton}
                onPress={() => router.push('/notifications')}
                accessibilityLabel="Thông báo"
              >
                <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
                {unreadCount > 0 && (
                  <View style={[styles.badge, { width: 10, height: 10, borderRadius: 5, paddingHorizontal: 0, minWidth: 10, top: -2, right: -2 }]} />
                )}
              </BlurButton>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const getStyles = (Colors: any) => StyleSheet.create({
  container: {
    width: '100%',
  },
  containerDefault: {
    height: 56,
    backgroundColor: 'transparent',
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
    backgroundColor: Colors.cardBackground === '#FFFFFF' 
      ? (Platform.OS === 'ios' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.35)')
      : (Platform.OS === 'ios' ? 'rgba(30,30,30,0.25)' : 'rgba(30,30,30,0.35)'),
    borderBottomWidth: 0,
    borderBottomColor: Colors.borderLight,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 6,
    elevation: 0,
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
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 11,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 5,
    elevation: 3,
    overflow: 'hidden',
  },
  searchPillOverlay: {
    backgroundColor: Colors.cardBackground === '#FFFFFF' 
      ? (Platform.OS === 'ios' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.6)')
      : (Platform.OS === 'ios' ? 'rgba(30,30,30,0.45)' : 'rgba(30,30,30,0.6)'),
    overflow: 'hidden',
  },
  searchPillOverlay: {
    backgroundColor: Colors.cardBackground === '#FFFFFF' 
      ? (Platform.OS === 'ios' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.6)')
      : (Platform.OS === 'ios' ? 'rgba(30,30,30,0.45)' : 'rgba(30,30,30,0.6)'),
  },
  searchPlaceholder: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    marginRight: 6,
  },
  searchInputInline: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: Colors.textPrimary,
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
    borderColor: Colors.textInverse,
  },
  badgeText: {
    color: Colors.textInverse,
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
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 50, // Tránh đè lên nút back/cart
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
  },
});
