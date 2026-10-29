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
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor, Typography, Spacing } from '../constants/theme';
import { useCart } from '../context/CartContext';
import { useNotificationBadge } from '../context/NotificationBadgeContext';
import { ScalePressable } from './ScalePressable';
import { BlurButton } from './BlurButton';
import { LiquidGlass, LiquidGlassContainerView } from './LiquidGlass';
import { SymbolView } from 'expo-symbols';
import { FadingHeaderBackdrop } from './FadingHeaderBackdrop';

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showCart?: boolean;
  showSearch?: boolean;
  showSettings?: boolean;
  rightComponent?: React.ReactNode;
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
  disableBlur?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBack = false,
  showCart = true,
  showSearch = true,
  showSettings = false,
  rightComponent,
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
  disableBlur = false,
}) => {
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { cartCount } = useCart();
  const { unreadCount } = useNotificationBadge();
  const insets = useSafeAreaInsets();

  const statusBarHeight =
    insets.top > 0
      ? insets.top
      : Platform.OS === 'android'
      ? StatusBar.currentHeight || 24
      : 44;

  // blurProgress:
  // - Nếu transparent: tiến trình từ 0 -> 1 dựa vào scrollY
  // - Nếu không transparent:
  //   * Khi ở đầu trang (scrollY <= 5 và !isScrolled): 0 (nền trong suốt để lộ màu background)
  //   * Khi cuộn xuống (scrollY > 5 hoặc isScrolled): tiến trình mờ dần và kích hoạt BlurView frosted glass
  const blurProgress = transparent
    ? (scrollY !== undefined ? Math.min(1, Math.max(0, scrollY / 65)) : isScrolled ? 1 : 0)
    : (scrollY !== undefined ? Math.min(1, Math.max(0, scrollY / 30)) : isScrolled ? 1 : 0);

  const progress = !transparent
    ? 1
    : scrollY !== undefined
    ? Math.min(1, Math.max(0, scrollY / 65))
    : isScrolled
    ? 1
    : 0;

  // Tắt thanh header blur để trong suốt theo yêu cầu: khi transparent=true hoặc disableBlur=true sẽ không hiện blur background
  const showBlurBackground = !disableBlur && !transparent && blurProgress > 0;

  // Nếu không có title (hoặc trang chủ / tìm kiếm), hiển thị Header phong cách Uniqlo: Logo + Thanh tìm kiếm con nhộng + Giỏ hàng
  const isSearchHeader = !title;

  // ================= THIẾT KẾ GỐC IOS LIQUID GLASS CHO TẤT CẢ CÁC TRANG CÓ NÚT BACK =================
  // Luôn ẩn Stack header mặc định để render toàn bộ bằng Header kính lỏng Liquid Glass
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={[
          styles.container,
          transparent
            ? [
                styles.containerTransparent,
                {
                  paddingTop: statusBarHeight + (Platform.OS === 'android' ? 8 : 4),
                  paddingBottom: Platform.OS === 'android' ? 8 : 4,
                  height: 56 + statusBarHeight,
                },
              ]
            : [
                styles.containerDefault,
                {
                  paddingTop: statusBarHeight + (Platform.OS === 'android' ? 8 : 4),
                  paddingBottom: Platform.OS === 'android' ? 8 : 4,
                  height: 56 + statusBarHeight,
                },
              ],
        ]}
      >
      {/* Nền Gradient trong suốt 80% mờ dần từ trên xuống dưới áp dụng đồng bộ toàn bộ app */}
      {!disableBlur && (
        <View
          style={[
            styles.gradientBackdropWrap,
            {
              height: 56 + statusBarHeight + 24,
              opacity: transparent ? progress : 1,
            },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={
              isDark
                ? [
                    'rgba(0,0,0,0.85)',
                    'rgba(0,0,0,0.72)',
                    'rgba(0,0,0,0.45)',
                    'rgba(0,0,0,0.15)',
                    'rgba(0,0,0,0)',
                  ]
                : [
                    'rgba(250,248,245,0.88)',
                    'rgba(250,248,245,0.75)',
                    'rgba(250,248,245,0.45)',
                    'rgba(250,248,245,0.15)',
                    'rgba(250,248,245,0)',
                  ]
            }
            locations={[0, 0.40, 0.70, 0.88, 1]}
            style={StyleSheet.absoluteFill}
          />
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
                <SymbolView
                  name="chevron.left"
                  size={20}
                  tintColor={Colors.textPrimary}
                  fallback={<Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />}
                />
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

          {/* Cụm Kính lỏng chứa Thanh tìm kiếm con nhộng + Nút chuông thông báo (kéo dãn giọt nước khi chạm) */}
          <LiquidGlassContainerView
            spacing={20}
            style={styles.searchAndActionGroup}
          >
            {showSearch && (
              onSearchChange ? (
                <View style={styles.searchPillWrapper}>
                  <LiquidGlass style={styles.searchPill}>
                    <TextInput
                      style={styles.searchInputInline}
                      placeholder={searchPlaceholder || 'Bạn đang tìm sản phẩm...'}
                      placeholderTextColor={isDark ? 'rgba(245, 245, 245, 0.72)' : 'rgba(43, 41, 40, 0.68)'}
                      value={searchValue}
                      onChangeText={onSearchChange}
                      onSubmitEditing={onSubmitEditing}
                      autoFocus={autoFocus}
                      returnKeyType="search"
                    />
                    {searchValue && searchValue.length > 0 ? (
                      <TouchableOpacity onPress={onClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <SymbolView
                          name="xmark.circle.fill"
                          size={18}
                          tintColor={isDark ? '#F5F5F5' : '#2B2928'}
                          fallback={<Ionicons name="close-circle" size={18} color={isDark ? '#F5F5F5' : '#2B2928'} />}
                        />
                      </TouchableOpacity>
                    ) : (
                      <SymbolView
                        name="magnifyingglass"
                        size={18}
                        tintColor={isDark ? '#F5F5F5' : '#2B2928'}
                        fallback={<Ionicons name="search-outline" size={19} color={isDark ? '#F5F5F5' : '#2B2928'} />}
                      />
                    )}
                  </LiquidGlass>
                </View>
              ) : (
                <ScalePressable
                  style={styles.searchPillWrapper}
                  activeScale={0.98}
                  onPress={onSearchPress || (() => router.push('/search'))}
                  accessibilityLabel="Tìm kiếm sản phẩm"
                >
                  <LiquidGlass style={styles.searchPill} interactive={true}>
                    <Text style={styles.searchPlaceholder} numberOfLines={1}>
                      {searchPlaceholder || 'Bạn đang tìm sản phẩm...'}
                    </Text>
                    <SymbolView
                      name="magnifyingglass"
                      size={18}
                      tintColor={isDark ? '#F5F5F5' : '#2B2928'}
                      fallback={<Ionicons name="search-outline" size={19} color={isDark ? '#F5F5F5' : '#2B2928'} />}
                    />
                  </LiquidGlass>
                </ScalePressable>
              )
            )}

            {/* Nút Thông báo (giọt nước giao nhau cùng thanh tìm kiếm) */}
            {showCart && (
              <BlurButton
                style={styles.iconButton}
                containerStyle={styles.iconButtonContainer}
                onPress={() => router.push('/notifications')}
                accessibilityLabel="Thông báo"
              >
                <SymbolView
                  name="bell"
                  size={20}
                  tintColor={Colors.textPrimary}
                  fallback={<Ionicons name="notifications-outline" size={21} color={Colors.textPrimary} />}
                />
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge} pointerEvents="none">
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </BlurButton>
            )}
          </LiquidGlassContainerView>
        </View>
      ) : (
        // ================= HEADER CÓ TIÊU ĐỀ (NOTIFICATIONS, PROFILE, ORDERS, SETTINGS, VERSION...) =================
        <View style={styles.titleHeaderRow}>
          <View style={styles.headerLeftGroup}>
            {showBack ? (
              <BlurButton
                style={styles.iconButton}
                containerStyle={styles.iconButtonContainer}
                onPress={() => router.back()}
                accessibilityLabel="Quay lại"
              >
                <SymbolView
                  name="chevron.left"
                  size={20}
                  tintColor={Colors.textPrimary}
                  fallback={<Ionicons name="chevron-back" size={22} color={Colors.textPrimary} style={{ marginLeft: -1 }} />}
                />
              </BlurButton>
            ) : null}
            <Text style={styles.screenTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* Cụm nút kính lỏng bên phải: Cài đặt + Thông báo + Nút tùy chọn (kéo dãn giọt nước) */}
          <LiquidGlassContainerView spacing={20} style={[styles.right, { gap: 12 }]}>
            {rightComponent}
            {showSettings && (
              <BlurButton
                style={styles.iconButton}
                containerStyle={styles.iconButtonContainer}
                onPress={onSettingsPress}
                accessibilityLabel="Cài đặt"
              >
                <SymbolView
                  name="gearshape"
                  size={20}
                  tintColor={Colors.textPrimary}
                  fallback={<Ionicons name="settings-outline" size={22} color={Colors.textPrimary} />}
                />
              </BlurButton>
            )}
            {showCart && (
              <BlurButton
                style={styles.iconButton}
                containerStyle={styles.iconButtonContainer}
                onPress={() => router.push('/notifications')}
                accessibilityLabel="Thông báo"
              >
                <SymbolView
                  name="bell"
                  size={20}
                  tintColor={Colors.textPrimary}
                  fallback={<Ionicons name="notifications-outline" size={21} color={Colors.textPrimary} />}
                />
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge} pointerEvents="none">
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </BlurButton>
            )}
          </LiquidGlassContainerView>
        </View>
      )}
    </View>
    </>
  );
};

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  navHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  navHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: Platform.OS === 'ios' ? 0 : 4,
  },
  navHeaderIconBtn: {
    padding: 6,
  },
  container: {
    width: '100%',
  },
  containerDefault: {
    height: 56,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  gradientBackdropWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  headerBackdrop: {
    backgroundColor: isDark 
      ? (Platform.OS === 'ios' ? 'rgba(18,18,18,0.85)' : 'rgba(18,18,18,0.95)')
      : (Platform.OS === 'ios' ? 'rgba(255,255,255,0.85)' : 'rgba(250,248,245,0.95)'),
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
    flexShrink: 0,
  },
  logoBtn: {
    paddingVertical: 2,
    paddingRight: 2,
  },
  logoContainer: {
    width: 86,
    height: 30,
    position: 'relative',
    justifyContent: 'center',
  },
  logoImage: {
    width: 86,
    height: 30,
  },
  logoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  searchAndActionGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 12,
  },
  searchPillWrapper: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  searchPill: {
    width: '100%',
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 12,
  },
  searchPlaceholder: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    color: isDark ? '#F5F5F5' : '#2B2928',
    flex: 1,
    marginRight: 6,
  },
  searchInputInline: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    color: isDark ? '#F5F5F5' : '#2B2928',
    flex: 1,
    paddingVertical: 0,
    marginRight: 6,
  },
  iconButtonContainer: {
    width: 40,
    height: 40,
    flexShrink: 0,
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
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#9C7156',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: isDark ? '#121212' : '#FAF8F5',
    zIndex: 10,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // TITLE HEADER
  titleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 8,
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
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
