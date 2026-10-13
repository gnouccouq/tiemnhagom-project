import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Platform,
  Share,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';

interface StoreBranch {
  id: string;
  name: string;
  badgeKey: string;
  defaultBadge: string;
  address: string;
  district: string;
  city: string;
  hoursKey: string;
  defaultHours: string;
  phone: string;
  mapUrl: string;
  image: string;
  features: { icon: keyof typeof Ionicons.glyphMap; labelKey: string; defaultLabel: string }[];
}

const STORE_BRANCHES: StoreBranch[] = [
  {
    id: 'store-gia-dinh',
    name: 'Tiệm Nhà Gốm — Gia Định',
    badgeKey: 'mainShowroomBadge',
    defaultBadge: 'Showroom Chính',
    address: '37 Nguyễn Duy, Phường Gia Định, TP. Hồ Chí Minh',
    district: 'Bình Thạnh / Gia Định',
    city: 'Hồ Chí Minh',
    hoursKey: 'dailyHoursText',
    defaultHours: '09:00 — 21:00 (Hàng ngày)',
    phone: '0777709662',
    mapUrl: 'https://maps.app.goo.gl/7Jxw7yJyaQG8wkHeA',
    image: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
    features: [
      { icon: 'sparkles-outline', labelKey: 'featUniqueWorks', defaultLabel: 'Trưng bày tác phẩm độc bản' },
      { icon: 'flower-outline', labelKey: 'featFlowerArranging', defaultLabel: 'Cắm hoa nghệ thuật theo yêu cầu' },
      { icon: 'gift-outline', labelKey: 'featFreeGiftWrap', defaultLabel: 'Gói quà & Viết thiệp tay miễn phí' },
      { icon: 'card-outline', labelKey: 'featMultiplePayment', defaultLabel: 'Thanh toán thẻ / Chuyển khoản / Tiền mặt' },
      { icon: 'bicycle-outline', labelKey: 'featParkingConvenient', defaultLabel: 'Chỗ đỗ xe máy thuận tiện' },
    ],
  },
];

export default function StoresScreen() {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const [scrollY, setScrollY] = useState(0);

  const handleOpenMap = (url: string) => {
    Linking.openURL(url).catch(() => { });
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => { });
  };

  const handleShare = async (branch: StoreBranch) => {
    try {
      const hours = t(branch.hoursKey) || branch.defaultHours;
      await Share.share({
        title: branch.name,
        message: `${branch.name}\n📍 ${t('visitAddressLabel') || 'Địa chỉ'}: ${branch.address}\n⏰ ${t('openingHoursLabel') || 'Mở cửa'}: ${hours}\n📞 Hotline: ${branch.phone}\n🗺️ ${t('directionsGoogleMaps') || 'Chỉ đường'}: ${branch.mapUrl}`,
      });
    } catch { }
  };

  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { pageStyle, getItemStyle } = usePageAnimation({ itemCount: STORE_BRANCHES.length + 3 });

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <Header
        title={t('storesScreenTitle') || t('storeLocationsUtility') || 'Hệ thống Cửa hàng'}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 54 + 14, paddingBottom: Math.max(insets.bottom, 16) + 32 },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Banner giới thiệu không gian gốm */}
        <View style={styles.heroIntroCard}>
          <Text style={styles.heroGreeting}>
            {t('storesHeroGreeting') || 'CHÀO MỪNG BẠN ĐẾN VỚI'}
          </Text>
          <Text style={styles.heroTitle}>
            {t('storesHeroTitle') || 'Không Gian Tiệm Nhà Gốm'}
          </Text>
          <Text style={styles.heroDesc}>
            {t('storesHeroDesc') || 'Nơi lưu giữ nét đẹp mộc mạc của đất và lửa. Mời bạn ghé tiệm để tận mắt ngắm nhìn, chạm tay vào từng đường vân men và thưởng trà trong không gian gốm ấm cúng.'}
          </Text>
        </View>

        {/* Danh sách các chi nhánh */}
        <Text style={styles.sectionHeaderTitle}>
          {t('activeStoresSection') || 'CỬA HÀNG ĐANG HOẠT ĐỘNG'}
        </Text>

        {STORE_BRANCHES.map((branch, branchIdx) => (
          <Animated.View key={branch.id} style={getItemStyle(branchIdx + 1)}>
          <View style={styles.storeCard}>
            {/* Ảnh đại diện chi nhánh */}
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: branch.image }}
                style={styles.storeImage}
                contentFit="cover"
                transition={200}
              />
              <View style={styles.badgePill}>
                <Ionicons name="sparkles" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.badgePillText}>
                  {t(branch.badgeKey) || branch.defaultBadge}
                </Text>
              </View>
            </View>

            {/* Thông tin chi tiết */}
            <View style={styles.cardBody}>
              <Text style={styles.storeName}>{branch.name}</Text>

              {/* Hàng Địa chỉ */}
              <TouchableOpacity
                style={styles.infoRow}
                activeOpacity={0.7}
                onPress={() => handleOpenMap(branch.mapUrl)}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="location" size={18} color="#9C7156" />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>
                    {t('visitAddressLabel') || 'Địa chỉ ghé thăm'}
                  </Text>
                  <Text style={styles.infoValue}>{branch.address}</Text>
                </View>
                <Ionicons name="navigate-outline" size={18} color="#9C7156" />
              </TouchableOpacity>

              {/* Hàng Giờ mở cửa */}
              <View style={styles.infoRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name="time" size={18} color="#D89E3A" />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>
                    {t('openingHoursLabel') || 'Giờ mở cửa đón khách'}
                  </Text>
                  <Text style={styles.infoValue}>
                    {t(branch.hoursKey) || branch.defaultHours}
                  </Text>
                </View>
              </View>

              {/* Hàng Hotline */}
              <TouchableOpacity
                style={styles.infoRow}
                activeOpacity={0.7}
                onPress={() => handleCall(branch.phone)}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="call" size={18} color="#C86432" />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>
                    {t('hotlineConsultLabel') || 'Hotline / Zalo tư vấn'}
                  </Text>
                  <Text style={[styles.infoValue, styles.phoneHighlight]}>{branch.phone}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Đặc quyền khi ghé tiệm */}
              <View style={styles.featuresSection}>
                <Text style={styles.featuresTitle}>
                  {t('inStoreExperiences') || 'Trải nghiệm tại tiệm:'}
                </Text>
                <View style={styles.featuresList}>
                  {branch.features.map((feat, fIdx) => (
                    <View key={fIdx} style={styles.featureItem}>
                      <Ionicons name={feat.icon} size={15} color="#9C7156" style={{ marginRight: 6 }} />
                      <Text style={styles.featureLabel}>
                        {t(feat.labelKey) || feat.defaultLabel}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Các nút hành động chính (Pill CTA) */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.primaryPillBtn}
                  activeOpacity={0.85}
                  onPress={() => handleOpenMap(branch.mapUrl)}
                >
                  <Ionicons name="map" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryPillBtnText}>
                    {t('directionsGoogleMaps') || 'Chỉ đường Google Maps'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryPillBtn}
                  activeOpacity={0.8}
                  onPress={() => handleShare(branch)}
                >
                  <Ionicons name="share-social-outline" size={19} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </Animated.View>
        ))}

        {/* Hộp cam kết dịch vụ */}
        <View style={styles.supportNoteCard}>
          <Ionicons name="heart" size={20} color="#C86432" style={{ marginBottom: 6 }} />
          <Text style={styles.supportNoteTitle}>
            {t('storeSupportTitle') || 'Hỗ trợ đón tiếp chu đáo'}
          </Text>
          <Text style={styles.supportNoteText}>
            {t('storeSupportDesc') || 'Nếu bạn cần đặt trước quà tặng, cắm hoa trang trí sự kiện hoặc cần hỗ trợ tìm đường, hãy liên hệ hotline trước khi đến để Tiệm chuẩn bị chu đáo nhất nhé!'}
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const getStyles = (Colors: any) => {
  const isDark = Colors.cardBackground !== '#FFFFFF';

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || '#FAF8F5',
    },
    scrollContent: {
      paddingHorizontal: 16,
    },
    heroIntroCard: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      borderRadius: 20,
      padding: 20,
      marginBottom: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.borderLight || '#E8E1D8'),
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    heroGreeting: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      color: '#9C7156',
      letterSpacing: 1,
      marginBottom: 4,
    },
    heroTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 21,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
      marginBottom: 8,
    },
    heroDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      lineHeight: 20,
      color: Colors.textSecondary || '#6E665D',
    },
    sectionHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textSecondary || '#6E665D',
      letterSpacing: 0.8,
      marginBottom: 12,
      marginLeft: 4,
    },
    storeCard: {
      backgroundColor: Colors.cardBackground || '#FFFFFF',
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.borderLight || '#E8E1D8'),
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 8,
      elevation: isDark ? 0 : 3,
    },
    imageContainer: {
      position: 'relative',
      width: '100%',
      height: 180,
    },
    storeImage: {
      width: '100%',
      height: '100%',
    },
    badgePill: {
      position: 'absolute',
      top: 14,
      left: 14,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(35, 27, 21, 0.78)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    badgePillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    cardBody: {
      padding: 18,
    },
    storeName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
      marginBottom: 14,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#F0ECE6',
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    infoTextCol: {
      flex: 1,
    },
    infoLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: Colors.textMuted || '#9E968D',
      marginBottom: 2,
    },
    infoValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textPrimary || '#231B15',
      lineHeight: 18,
      fontWeight: '600',
    },
    phoneHighlight: {
      color: isDark ? '#E57373' : '#C86432',
      fontWeight: '700',
    },
    featuresSection: {
      marginTop: 14,
      marginBottom: 16,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderRadius: 14,
      padding: 12,
    },
    featuresTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
      marginBottom: 8,
    },
    featuresList: {
      gap: 6,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    featureLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textSecondary || '#6E665D',
      flex: 1,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
    },
    primaryPillBtn: {
      flex: 1,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.2,
      shadowRadius: 6,
      elevation: isDark ? 0 : 3,
    },
    primaryPillBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    secondaryPillBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.borderLight || '#E8E1D8'),
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.05,
      shadowRadius: 4,
      elevation: isDark ? 0 : 2,
    },
    supportNoteCard: {
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
      borderWidth: isDark ? 0 : 1,
      borderStyle: 'dashed',
      borderColor: isDark ? 'transparent' : (Colors.borderLight || '#E8E1D8'),
      marginTop: 6,
      marginBottom: 20,
    },
    supportNoteTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: Colors.textPrimary || '#231B15',
      marginBottom: 4,
    },
    supportNoteText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: 'center',
      color: Colors.textSecondary || '#6E665D',
    },
  });
};
