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
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { Header } from '../src/components/Header';
import { useThemeColor, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { getAppVersion, getAppBuildNumber, getOtaVersion, getFullAppVersionString } from '../src/utils/appVersion';
import { usePageAnimation } from '../src/hooks/usePageAnimation';

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
        dialog.alert(
          'Đã là bản mới nhất ✨',
          `Ứng dụng Tiệm Nhà Gốm của bạn đang ở phiên bản mới nhất v${getFullAppVersionString()}.`
        );
      }
    } catch (e: any) {
      console.warn('Lỗi kiểm tra update:', e);
      dialog.alert('Thông tin cập nhật', `Chi tiết: ${e?.message || e || 'Không có phản hồi từ máy chủ'}\n\nUpdates.isEnabled: ${Updates.isEnabled}\nRuntime: ${Updates.runtimeVersion || '1.0.0'}\nChannel: ${Updates.channel || 'mặc định'}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleOpenBCT = () => {
    Linking.openURL('https://tiemnhagom.vn');
  };

  const [scrollY, setScrollY] = useState(0);

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header chuẩn không vạch kẻ đáy, căn chỉnh tai thỏ tự động qua Header transparent */}
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
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 54 + 12 }]}
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
          <Text style={styles.appTagline}>Nghệ Thuật Gốm Sứ Thủ Công Việt</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>Phiên bản {appVersion} (Build {buildNumber})</Text>
          </View>
        </View>

        {/* Khối Thông Tin Chi Tiết Bản Build */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>Chi tiết kỹ thuật</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phiên bản ứng dụng</Text>
            <Text style={styles.infoValue}>v{appVersion}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mã bản dựng (Build)</Text>
            <Text style={styles.infoValue}>{buildNumber}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Bản phát hành OTA</Text>
            <Text style={styles.infoValue}>{otaVersion}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Kênh phát hành</Text>
            <Text style={[styles.infoValue, { color: Colors.primary }]}>
              {Updates.channel || 'Production'}
            </Text>
          </View>
        </View>

        {/* Nút Kiểm Tra Cập Nhật OTA */}
        <TouchableOpacity
          style={styles.checkUpdateBtn}
          onPress={handleCheckUpdate}
          activeOpacity={0.85}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="cloud-download-outline" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.checkUpdateBtnText}>
            {checkingUpdate ? 'Đang kiểm tra...' : 'Kiểm tra bản cập nhật mới'}
          </Text>
        </TouchableOpacity>

        {/* Khối Nhật Ký Cập Nhật (Release Notes) */}
        <View style={styles.card}>
          <View style={styles.releaseHeaderRow}>
            <Text style={styles.cardHeaderTitle}>
              Nhật ký bản cập nhật v{appVersion} (OTA: {otaVersion})
            </Text>
          </View>

          <View style={styles.changelogItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.changelogText}>
              <Text style={styles.changelogBold}>Thanh toán VietQR chuẩn xác:</Text> Tự động tạo mã QR chứa số tiền và nội dung đơn cho Hộ Kinh Doanh Tiệm Nhà Gốm.
            </Text>
          </View>

          <View style={styles.changelogItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.changelogText}>
              <Text style={styles.changelogBold}>Lưu ảnh QR & Mở App Ngân hàng:</Text> Dễ dàng lưu ảnh mã QR vào máy hoặc mở app ngân hàng quét thanh toán trong 3 giây.
            </Text>
          </View>

          <View style={styles.changelogItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.changelogText}>
              <Text style={styles.changelogBold}>Chia sẻ sản phẩm:</Text> Gửi link sản phẩm gốm mộc kèm thông tin qua Zalo, Facebook, Tin nhắn.
            </Text>
          </View>

          <View style={styles.changelogItem}>
            <View style={styles.bulletDot} />
            <Text style={styles.changelogText}>
              <Text style={styles.changelogBold}>Hiệu ứng Splash Screen mượt mà:</Text> Tối ưu hóa trải nghiệm khởi động ứng dụng với hiệu ứng zoom chuẩn nhịp.
            </Text>
          </View>
        </View>

        {/* Khối Chứng Nhận Bộ Công Thương & Bản Quyền */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>Chứng nhận & Bản quyền</Text>
          
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
              <Text style={styles.bctTitle}>Đã Đăng Ký Bộ Công Thương</Text>
              <Text style={styles.bctDesc}>Website & Ứng dụng TMĐT chính thức của Hộ Kinh Doanh Tiệm Nhà Gốm</Text>
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
    divider: {
      height: 1,
      backgroundColor: isDark ? '#222222' : '#F0ECE6',
      marginVertical: 4,
    },
    checkUpdateBtn: {
      width: '100%',
      height: 48,
      borderRadius: 24,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.16,
      shadowRadius: 6,
      elevation: 3,
      marginBottom: 14,
    },
    checkUpdateBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    releaseHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    changelogItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 8,
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
      color: '#9C7156',
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
