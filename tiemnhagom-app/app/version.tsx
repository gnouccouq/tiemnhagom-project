// app/version.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Updates from 'expo-updates';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { getAppVersion, getAppBuildNumber, getOtaVersion, getFullAppVersionString } from '../src/utils/appVersion';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { CHANGELOG_HISTORY, ReleaseVersion } from '../src/constants/changelog';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function VersionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const dialog = useDialog();
  const { pageStyle } = usePageAnimation();

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Mặc định mở rộng bản mới nhất (20261018.01)
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({
    '20261018.01': true,
  });

  const toggleExpand = (otaKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedVersions((prev) => ({
      ...prev,
      [otaKey]: !prev[otaKey],
    }));
  };

  const appVersion = getAppVersion();
  const buildNumber = getAppBuildNumber();
  const otaVersion = getOtaVersion();

  // Kiểm tra cập nhật OTA tức thì
  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      if (__DEV__) {
        dialog.alert(
          'Môi trường phát triển',
          'Bạn đang chạy ứng dụng trong môi trường thử nghiệm (Expo Go / Development). Tính năng OTA Update chỉ kích hoạt trên bản Release / Preview.'
        );
        return;
      }

      if (!Updates.isEnabled) {
        dialog.alert('Thông báo', 'Cơ chế cập nhật OTA đang không được bật trên thiết bị này.');
        return;
      }

      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        dialog.confirm(
          'Đã có bản cập nhật mới! 🎉',
          'Tiệm Nhà Gốm đã sẵn sàng phiên bản mới với nhiều cải tiến. Bạn có muốn tải về và làm mới ngay không?',
          async () => {
            try {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            } catch (err: any) {
              dialog.alert('Lỗi cập nhật', 'Không thể áp dụng bản cập nhật lúc này. Vui lòng thử lại sau.');
            }
          },
          'Cập nhật ngay',
          'Để sau'
        );
      } else {
        const otaStatus = Updates.isEmbeddedLaunch ? 'Bản cài đặt gốc' : 'Bản cập nhật OTA';
        const updateIdStr = Updates.updateId ? `\n• Mã cập nhật: ${Updates.updateId.slice(0, 8)}` : '';
        dialog.alert(
          'Đã là bản mới nhất ✨',
          `Ứng dụng Tiệm Nhà Gốm của bạn đang ở phiên bản mới nhất v${getFullAppVersionString()}.\n\n• Kênh: ${Updates.channel || 'preview'}\n• Tình trạng: ${otaStatus}${updateIdStr}`
        );
      }
    } catch (e: any) {
      console.warn('Lỗi kiểm tra update:', e);
      dialog.alert(
        'Thông tin cập nhật',
        `Chi tiết: ${e?.message || e || 'Không có phản hồi từ máy chủ'}\n\nUpdates.isEnabled: ${Updates.isEnabled}\nRuntime: ${Updates.runtimeVersion || '1.0.1'}\nChannel: ${Updates.channel || 'preview'}`
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleOpenBCT = () => {
    Linking.openURL('https://tiemnhagom.vn');
  };

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header chuẩn không vạch kẻ đáy */}
      <Header
        title={t('appVersionTitle') || 'Thông tin phiên bản'}
        showBack={true}
        showCart={false}
        showSearch={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 54 + 12,
            paddingBottom: Math.max(insets.bottom, 16) + 84,
          },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Khối Hero Logo Tiệm Nhà Gốm */}
        <View style={styles.heroBox}>
          <View style={styles.logoCircle}>
            <Image
              source={
                isDark
                  ? require('../assets/images/LOGO_WHITE.png')
                  : require('../assets/images/LOGO_2_PNG.png')
              }
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>
          <Text style={styles.appName}>TIỆM NHÀ GỐM</Text>
          <Text style={styles.appTagline}>{t('tagline')}</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>
              {t('versionBadgeText', { version: appVersion, build: buildNumber })}
            </Text>
          </View>
        </View>

        {/* Khối Thông Tin Chi Tiết Kỹ Thuật */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>{t('techDetails')}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('appVersion')}</Text>
            <Text style={styles.infoValue}>v{appVersion}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('buildNumber')}</Text>
            <Text style={styles.infoValue}>{buildNumber}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('otaRelease')}</Text>
            <View style={styles.otaBadgeWrap}>
              <Text style={styles.otaBadgeText}>{otaVersion}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('releaseChannel')}</Text>
            <Text style={[styles.infoValue, { color: Colors.primary }]}>
              {Updates.channel || 'preview'}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('otaStatusLabel')}</Text>
            <Text style={[styles.infoValue, { color: Updates.isEmbeddedLaunch ? Colors.textSecondary : '#9C7156', fontWeight: '600' }]}>
              {Updates.isEmbeddedLaunch ? t('otaStatusEmbedded') : t('otaStatusOta')}
            </Text>
          </View>
          {Boolean(Updates.updateId) && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('otaUpdateIdLabel')}</Text>
                <Text style={[styles.infoValue, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 13 }]}>
                  {Updates.updateId ? Updates.updateId.slice(0, 8) : 'Embedded'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Tiêu đề phân khu: Lịch Sử Cập Nhật */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderIconWrap}>
            <Ionicons name="time-outline" size={18} color="#9C7156" />
          </View>
          <Text style={styles.sectionHeaderText}>{t('changelogHistoryTitle')}</Text>
        </View>

        {/* Danh sách các bản cập nhật (Changelog History) */}
        {CHANGELOG_HISTORY.map((item: ReleaseVersion, index: number) => {
          const isExpanded = !!expandedVersions[item.otaVersion];
          const isCurrent = item.otaVersion === otaVersion || index === 0;

          return (
            <View key={item.otaVersion} style={styles.card}>
              <TouchableOpacity
                style={styles.changelogCardHeader}
                activeOpacity={0.7}
                onPress={() => toggleExpand(item.otaVersion)}
              >
                <View style={styles.changelogHeaderLeft}>
                  <View style={styles.versionTitleRow}>
                    <Text style={styles.versionNumberText}>v{item.version}</Text>
                    <View style={[styles.otaChip, isCurrent && styles.otaChipActive]}>
                      <Text style={[styles.otaChipText, isCurrent && styles.otaChipTextActive]}>
                        OTA {item.otaVersion}
                      </Text>
                    </View>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>{t('currentBadge')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.releaseDateText}>
                    {t('releaseDateLabel', { date: item.releaseDate })}
                  </Text>
                  <Text style={styles.releaseSummaryTitle}>{item.title}</Text>
                </View>

                <View style={styles.changelogHeaderRight}>
                  <View style={styles.expandIconCircle}>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Chi tiết nội dung khi mở rộng */}
              {isExpanded && (
                <View style={styles.changelogBody}>
                  <View style={styles.divider} />
                  {item.changes.map((change, cIdx) => (
                    <View key={cIdx} style={styles.changelogItem}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.changelogText}>
                        <Text style={styles.changelogBold}>{change.title}: </Text>
                        {change.description}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Khối Chứng Nhận Bộ Công Thương & Bản Quyền */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>{t('certAndCopyright')}</Text>
          
          <TouchableOpacity
            style={styles.bctRow}
            activeOpacity={0.8}
            onPress={handleOpenBCT}
          >
            <Image
              source={require('../assets/images/logo_bct.png')}
              style={styles.bctLogo}
              contentFit="contain"
            />
            <View style={styles.bctTextWrap}>
              <Text style={styles.bctTitle}>{t('bctTitle')}</Text>
              <Text style={styles.bctDesc}>{t('bctDesc')}</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.copyrightBox}>
            <Text style={styles.copyrightText}>
              © {new Date().getFullYear()} TIỆM NHÀ GỐM. All rights reserved.
            </Text>
            <Text style={styles.businessText}>
              Đại diện pháp lý: HỘ KINH DOANH TIỆM NHÀ GỐM
            </Text>
            <Text style={styles.businessText}>
              Hotline hỗ trợ: 0777 709 662
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Nút Kiểm Tra Cập Nhật OTA Cố Định Dưới Cùng */}
      <View
        style={[
          styles.bottomFixedContainer,
          {
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <LinearGradient
          colors={
            isDark
              ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.98)']
              : ['rgba(250,248,245,0)', 'rgba(250,248,245,0.88)', 'rgba(250,248,245,0.98)']
          }
          locations={[0, 0.38, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={styles.checkUpdateBtn}
          onPress={handleCheckUpdate}
          activeOpacity={0.85}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="cloud-download-outline" size={19} color="#FFFFFF" />
          )}
          <Text style={styles.checkUpdateBtnText}>
            {checkingUpdate ? t('checkingUpdate') : t('checkUpdateBtn')}
          </Text>
        </TouchableOpacity>
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
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 40,
      alignItems: 'center',
    },
    heroBox: {
      alignItems: 'center',
      marginBottom: 20,
      marginTop: 8,
    },
    logoCircle: {
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 10,
      elevation: 3,
      marginBottom: 12,
    },
    logoImage: {
      width: 65,
      height: 65,
    },
    appName: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '800',
      color: Colors.textPrimary,
      letterSpacing: 1.2,
      marginBottom: 4,
    },
    appTagline: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textSecondary,
      marginBottom: 10,
    },
    versionBadge: {
      backgroundColor: isDark ? '#1E1E1E' : '#E8CCB2',
      paddingVertical: 4,
      paddingHorizontal: 14,
      borderRadius: 14,
    },
    versionBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#2B2928',
    },
    card: {
      width: '100%',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
      marginBottom: 14,
    },
    cardHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    infoLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: Colors.textSecondary,
    },
    infoValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    otaBadgeWrap: {
      backgroundColor: isDark ? '#1E1E1E' : '#E8CCB2',
      paddingVertical: 3,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    otaBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#2B2928',
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? '#222222' : '#F0ECE6',
      marginVertical: 4,
    },
    bottomFixedContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkUpdateBtn: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    checkUpdateBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    sectionHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    sectionHeaderIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionHeaderText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    changelogCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    changelogHeaderLeft: {
      flex: 1,
      paddingRight: 8,
    },
    versionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 4,
    },
    versionNumberText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    otaChip: {
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#2E2E2E' : '#E8E1D8',
    },
    otaChipActive: {
      backgroundColor: isDark ? '#2B2928' : '#E8CCB2',
      borderColor: isDark ? '#9C7156' : '#9C7156',
    },
    otaChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: Colors.textSecondary,
      fontWeight: '600',
    },
    otaChipTextActive: {
      color: isDark ? '#E8CCB2' : '#2B2928',
      fontWeight: '700',
    },
    currentBadge: {
      backgroundColor: '#9C7156',
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    currentBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    releaseDateText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: Colors.textSecondary,
      marginBottom: 4,
    },
    releaseSummaryTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: '#9C7156',
      marginTop: 2,
    },
    changelogHeaderRight: {
      paddingTop: 2,
    },
    expandIconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    changelogBody: {
      marginTop: 8,
    },
    changelogItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 8,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#9C7156',
      marginTop: 6,
    },
    changelogText: {
      flex: 1,
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: Colors.textPrimary,
      lineHeight: 18,
    },
    changelogBold: {
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    bctRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    bctLogo: {
      width: 90,
      height: 38,
    },
    bctTextWrap: {
      flex: 1,
    },
    bctTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    bctDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10.5,
      color: Colors.textSecondary,
      marginTop: 2,
    },
    copyrightBox: {
      paddingTop: 10,
      gap: 3,
    },
    copyrightText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    businessText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      color: Colors.textSecondary,
    },
  });
