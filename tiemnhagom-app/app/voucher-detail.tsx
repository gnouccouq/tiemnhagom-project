// app/voucher-detail.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Modal,
  Dimensions,
  Clipboard,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor, Typography } from '../src/constants/theme';
import { BlurButton } from '../src/components/BlurButton';
import { ScalePressable } from '../src/components/ScalePressable';
import { CouponItem } from '../src/services/couponService';
import { useDialog } from '../src/context/DialogContext';
import { useCart } from '../src/context/CartContext';
import { formatCurrency } from '../src/utils/format';
import { useSettings } from '../src/context/SettingsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function VoucherDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const dialog = useDialog();
  const { applyCoupon } = useCart();
  const { t } = useSettings();
  const styles = getStyles(Colors, isDark);

  const { voucher: voucherParam } = useLocalSearchParams<{ voucher?: string }>();

  // Parse voucher data
  const voucher: CouponItem = useMemo(() => {
    if (voucherParam) {
      try {
        return JSON.parse(voucherParam);
      } catch (e) {
        console.warn('Failed to parse voucher param', e);
      }
    }
    return {
      id: 'default',
      code: 'TIEMNHAGOM',
      name: 'Ưu đãi Tiệm Nhà Gốm',
      type: 'percent',
      value: 10,
    };
  }, [voucherParam]);

  const [copied, setCopied] = useState(false);

  // ================= MODAL ANIMATION STATE =================
  const [isTermsRendered, setIsTermsRendered] = useState(false);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(500)).current;

  const openTermsModal = () => {
    setIsTermsRendered(true);
    backdropAnim.setValue(0);
    sheetTranslateY.setValue(500);

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 24,
        stiffness: 280,
        mass: 0.85,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeTermsModal = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 500,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsTermsRendered(false);
    });
  };

  // Tính hạn sử dụng & độ cấp bách
  const expiryInfo = useMemo(() => {
    if (!voucher.expiryDate) {
      return { text: 'Vô thời hạn', isUrgent: false, dateStr: 'Vô thời hạn' };
    }
    try {
      const d = new Date(voucher.expiryDate);
      if (isNaN(d.getTime())) {
        return { text: `Hết hạn: ${voucher.expiryDate}`, isUrgent: false, dateStr: voucher.expiryDate };
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffMs = target.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateStr = `23:59 ${day}/${month}/${year}`;

      if (diffDays > 0 && diffDays <= 3) {
        return {
          text: `Hết hạn trong ${diffDays} ngày nữa`,
          isUrgent: true,
          dateStr,
        };
      } else if (diffDays === 0) {
        return {
          text: 'Hết hạn hôm nay',
          isUrgent: true,
          dateStr,
        };
      }
      return {
        text: `Hết hạn vào ${dateStr}`,
        isUrgent: false,
        dateStr,
      };
    } catch {
      return { text: `Hết hạn vào ${voucher.expiryDate}`, isUrgent: false, dateStr: voucher.expiryDate };
    }
  }, [voucher.expiryDate]);

  // Nhãn ưu đãi tóm tắt
  const discountHighlight = useMemo(() => {
    if (voucher.type === 'percent') {
      return `GIẢM ${voucher.value}%`;
    }
    if (voucher.type === 'free_ship') {
      return 'MIỄN PHÍ VẬN CHUYỂN';
    }
    if (voucher.value && voucher.value > 0) {
      return `GIẢM ${formatCurrency(voucher.value).toUpperCase()}`;
    }
    return 'ƯU ĐÃI ĐẶC QUYỀN';
  }, [voucher]);

  // Đơn tối thiểu
  const minSpendDisplay = useMemo(() => {
    const min = voucher.minOrder ?? voucher.minSpend ?? 0;
    if (min > 0) {
      return `${t('minSpendFrom')} ${formatCurrency(min)}`;
    }
    return t('noMinSpend');
  }, [voucher, t]);

  // Sao chép mã
  const handleCopyCode = () => {
    Clipboard.setString(voucher.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  // Áp dụng voucher
  const handleApply = () => {
    Clipboard.setString(voucher.code);
    applyCoupon(voucher.code);
    dialog.showDialog({
      title: t('appliedSuccessTitle'),
      message: (t('appliedSuccessMsg') || 'Mã "{code}" đã được kích hoạt trong giỏ hàng của bạn.').replace('{code}', voucher.code),
      type: 'success',
      buttons: [
        {
          text: t('goToCartBtn') || 'Đến giỏ hàng',
          style: 'primary',
          onPress: () => router.push('/(tabs)/cart'),
        },
        {
          text: t('continueBrowsingBtn') || 'Tiếp tục xem',
          style: 'cancel',
          onPress: () => router.push('/(tabs)/products'),
        },
      ],
    });
  };

  // Chiều cao ảnh Hero full ở phần trên
  const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.78);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Hiệu ứng lướt: ảnh nằm cố định ở đỉnh và mờ dần
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.72],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Hiệu ứng kéo dãn khi kéo xuống (overscroll elastic zoom)
  const heroScale = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0],
    outputRange: [2.0, 1.0],
    extrapolateRight: 'clamp',
  });

  // Giữ mép trên của ảnh luôn cố định ở top: 0 khi zoom phóng to
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0, HERO_HEIGHT],
    outputRange: [HERO_HEIGHT / 2, 0, -HERO_HEIGHT * 0.22],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* ================= HERO BACKGROUND FULL CỐ ĐỊNH Ở ĐỈNH, NẰM DƯỚI CONTENT ================= */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pinnedHeroWrap,
          {
            height: HERO_HEIGHT,
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
          },
        ]}
      >
        <Image
          source={require('../assets/images/hero-bg.webp')}
          style={styles.pinnedHeroImage}
          contentFit="cover"
          priority="high"
        />
        {/* Lớp gradient dịu mắt mép trên cho Status Bar & nút Back, không đè lên content bên dưới */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.12)', 'transparent']}
          locations={[0, 0.35, 0.7]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Nền Gradient trong suốt 80% mờ dần từ trên xuống dưới */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 54 + 24,
          zIndex: 9,
        }}
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

      {/* Floating Back Button bọc Liquid Glass */}
      <View style={[styles.floatingHeader, { top: insets.top + (Platform.OS === 'android' ? 10 : 8) }]}>
        <BlurButton
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Quay lại"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={isDark ? '#F5F5F5' : '#2B2928'}
            style={{ marginLeft: -1 }}
          />
        </BlurButton>
      </View>

      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 95 }]}
      >
        {/* Khoảng đệm spacer để lộ ảnh Hero full ở đỉnh ban đầu */}
        <View style={{ height: HERO_HEIGHT - 20 }} />

        {/* ================= 2. NỘI DUNG VOUCHER CHÍNH (MAIN SHEET TRƯỢT LÊN TRÊN) ================= */}
        <View style={[styles.mainSheet, { backgroundColor: Colors.background }]}>
          {/* Tag Thương hiệu & Tiêu đề Voucher */}
          <View style={styles.brandTagRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brandSubtitle}>TIỆM NHÀ GỐM</Text>
          </View>

          <Text style={styles.voucherTitle}>{voucher.name.toUpperCase()}</Text>

          {/* Badge loại ưu đãi nổi bật */}
          <View style={styles.highlightBadgeRow}>
            <View style={styles.highlightBadge}>
              <Ionicons name="sparkles" size={13} color="#9C7156" style={{ marginRight: 5 }} />
              <Text style={styles.highlightBadgeText}>{discountHighlight}</Text>
            </View>
            <View style={styles.minSpendChip}>
              <Text style={styles.minSpendChipText}>{minSpendDisplay}</Text>
            </View>
          </View>

          {/* ================= 3. THẺ VOUCHER TICKET CAO CẤP (THAY MÃ VẠCH) ================= */}
          <View style={styles.ticketCard}>
            {/* Phần trên vé */}
            <View style={styles.ticketTopSection}>
              <View style={styles.ticketLogoBadge}>
                <Image
                  source={require('../assets/images/logo.webp')}
                  style={styles.ticketLogoImg}
                  contentFit="contain"
                />
              </View>
              <View style={styles.ticketTopMeta}>
                <Text style={styles.ticketTopLabel}>{t('exclusiveVoucherCode')}</Text>
                <Text style={styles.ticketTopSub}>{t('applyAtTiemNhaGom')}</Text>
              </View>
            </View>

            {/* Vạch đứt & Vết khía vé thủ công (Ticket Notches & Dashed Divider) */}
            <View style={styles.ticketDividerWrap}>
              <View style={[styles.ticketNotch, styles.ticketNotchLeft, { backgroundColor: Colors.background }]} />
              <View style={styles.dashedLine} />
              <View style={[styles.ticketNotch, styles.ticketNotchRight, { backgroundColor: Colors.background }]} />
            </View>

            {/* Phần dưới vé: Khung mã & nút Sao chép */}
            <View style={styles.ticketBottomSection}>
              <View style={styles.codeCapsule}>
                <Text style={styles.codeText}>{voucher.code}</Text>
              </View>

              <ScalePressable
                style={[
                  styles.copyActionBtn,
                  copied && styles.copyActionBtnDone,
                ]}
                onPress={handleCopyCode}
                activeScale={0.93}
              >
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={15}
                  color={copied ? '#FFFFFF' : '#9C7156'}
                />
                <Text
                  style={[
                    styles.copyActionBtnText,
                    copied && styles.copyActionBtnTextDone,
                  ]}
                >
                  {copied ? t('copiedCode') : t('copyCode')}
                </Text>
              </ScalePressable>
            </View>
          </View>

          {/* ================= 4. KHỐI CHI TIẾT ƯU ĐÃI NGHỆ NHÂN ================= */}
          <View style={styles.detailsCard}>
            <Text style={styles.detailsSectionTitle}>{t('offerDetails')}</Text>

            {/* Danh sách các dòng thông tin với icon tròn nhã nhặn */}
            <View style={styles.infoList}>

              {/* Dòng 2: Thời hạn sử dụng */}
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <Ionicons name="time-outline" size={17} color={isDark ? '#E8CCB2' : '#9C7156'} />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>{t('expiryDateLabel')}</Text>
                  <View style={styles.expiryValueRow}>
                    <Text style={styles.infoValue}>
                      {voucher.expiryDate ? expiryInfo.dateStr : (t('unlimitedTime') || 'Vô thời hạn')}
                    </Text>
                    {expiryInfo.isUrgent && (
                      <View style={styles.urgentBadge}>
                        <Text style={styles.urgentBadgeText}>{expiryInfo.text}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.infoDivider} />

              {/* Dòng 3: Đơn hàng tối thiểu */}
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <Ionicons name="cart-outline" size={17} color={isDark ? '#E8CCB2' : '#9C7156'} />
                </View>
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>{t('conditionLabel')}</Text>
                  <Text style={styles.infoValue}>{minSpendDisplay}</Text>
                </View>
              </View>

              {Boolean(voucher.maxDiscount && voucher.maxDiscount > 0) && (
                <>
                  <View style={styles.infoDivider} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconCircle}>
                      <Ionicons name="pricetag-outline" size={17} color={isDark ? '#E8CCB2' : '#9C7156'} />
                    </View>
                    <View style={styles.infoTextCol}>
                      <Text style={styles.infoLabel}>{t('maxDiscountLabel')}</Text>
                      <Text style={styles.infoValue}>{formatCurrency(voucher.maxDiscount)}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Nút Điều khoản & Điều kiện tương tác */}
            <ScalePressable
              style={styles.termsActionRow}
              onPress={openTermsModal}
              activeScale={0.98}
            >
              <View style={styles.termsActionLeft}>
                <Ionicons name="document-text-outline" size={18} color={isDark ? '#E8CCB2' : '#9C7156'} />
                <Text style={styles.termsActionText}>{t('termsAndConditionsLabel')}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isDark ? '#9E968D' : '#6E665D'}
              />
            </ScalePressable>
          </View>
        </View>
      </Animated.ScrollView>

      {/* ================= 5. NÚT ÁP DỤNG STICKY CỐ ĐỊNH Ở ĐÁY ================= */}
      <View
        style={[
          styles.stickyBottomBar,
          {
            paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 18,
            backgroundColor: isDark ? '#000000' : '#F6F4EC',
          },
        ]}
      >
        <ScalePressable
          style={styles.applyBtn}
          onPress={handleApply}
          activeScale={0.96}
        >
          <Text style={styles.applyBtnText}>{t('applyVoucher')}</Text>
        </ScalePressable>
      </View>

      {/* ================= 6. MODAL ĐIỀU KHOẢN VỚI SPRING ANIMATION UX ================= */}
      <Modal
        visible={isTermsRendered}
        transparent={true}
        animationType="none"
        onRequestClose={closeTermsModal}
      >
        <View style={styles.modalBackdrop}>
          {/* Backdrop tối mờ dần với Animated Opacity */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.backdropFade,
              { opacity: backdropAnim },
            ]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeTermsModal}
            />
          </Animated.View>

          {/* Bottom Sheet trượt nảy lò xo với Spring TranslateY */}
          <Animated.View
            style={[
              styles.termsBottomSheet,
              {
                paddingBottom: insets.bottom > 0 ? insets.bottom + 14 : 24,
                backgroundColor: isDark ? '#161616' : '#FFFFFF',
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            {/* Thanh gạt nhỏ đầu Sheet (Sheet Handle) */}
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: isDark ? '#383838' : '#DCD3C9' }]} />
            </View>

            {/* Header Modal */}
            <View style={styles.termsModalHeader}>
              <Text style={styles.termsModalTitle}>{t('termsOfUseTitle')}</Text>
              <ScalePressable
                style={styles.termsModalCloseBtn}
                onPress={closeTermsModal}
                activeScale={0.88}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close"
                  size={19}
                  color={isDark ? '#E5E5E5' : '#2B2928'}
                />
              </ScalePressable>
            </View>

            {/* Danh sách điều khoản cuộn mượt */}
            <ScrollView
              style={styles.termsModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.termsBannerBadge}>
                <Text style={styles.termsBannerTitle}>{voucher.name}</Text>
                <Text style={styles.termsBannerCode}>Mã: {voucher.code}</Text>
              </View>

              <View style={styles.termsList}>
                <View style={styles.termItem}>
                  <View style={styles.termBulletCircle}>
                    <Text style={styles.termBulletText}>1</Text>
                  </View>
                  <Text style={styles.termText}>
                    <Text style={styles.termStrong}>Sản phẩm áp dụng: </Text>
                    Các sản phẩm gốm mộc, bình hoa gốm, chén đĩa thủ công, đồ trang trí nội thất và quà tặng gốm tại Tiệm Nhà Gốm.
                  </Text>
                </View>

                {Boolean(voucher.minOrder && voucher.minOrder > 0) && (
                  <View style={styles.termItem}>
                    <View style={styles.termBulletCircle}>
                      <Text style={styles.termBulletText}>2</Text>
                    </View>
                    <Text style={styles.termText}>
                      <Text style={styles.termStrong}>Đơn hàng tối thiểu: </Text>
                      Áp dụng cho hóa đơn có giá trị từ {formatCurrency(voucher.minOrder)}.
                    </Text>
                  </View>
                )}

                {Boolean(voucher.maxDiscount && voucher.maxDiscount > 0) && (
                  <View style={styles.termItem}>
                    <View style={styles.termBulletCircle}>
                      <Text style={styles.termBulletText}>3</Text>
                    </View>
                    <Text style={styles.termText}>
                      <Text style={styles.termStrong}>Mức giảm tối đa: </Text>
                      Giảm tối đa {formatCurrency(voucher.maxDiscount)} cho mỗi lượt thanh toán đơn hàng.
                    </Text>
                  </View>
                )}

                <View style={styles.termItem}>
                  <View style={styles.termBulletCircle}>
                    <Text style={styles.termBulletText}>4</Text>
                  </View>
                  <Text style={styles.termText}>
                    <Text style={styles.termStrong}>Kênh áp dụng: </Text>
                    Áp dụng đặt hàng trực tiếp qua Ứng dụng Tiệm Nhà Gốm và tại toàn bộ các chi nhánh cửa hàng Tiệm Nhà Gốm trên toàn quốc.
                  </Text>
                </View>

                <View style={styles.termItem}>
                  <View style={styles.termBulletCircle}>
                    <Text style={styles.termBulletText}>5</Text>
                  </View>
                  <Text style={styles.termText}>
                    <Text style={styles.termStrong}>Quy định sử dụng: </Text>
                    Voucher không có giá trị quy đổi thành tiền mặt, không hoàn lại tiền thừa. Mỗi đơn hàng chỉ áp dụng tối đa 01 voucher ưu đãi.
                  </Text>
                </View>

                <View style={styles.termItem}>
                  <View style={styles.termBulletCircle}>
                    <Text style={styles.termBulletText}>6</Text>
                  </View>
                  <Text style={styles.termText}>
                    <Text style={styles.termStrong}>Thời hạn & Số lượng: </Text>
                    Ưu đãi có số lượng giới hạn và có thể kết thúc sớm hơn dự kiến khi hết ngân sách khuyến mại.
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Nút OK / Đã hiểu lớn */}
            <View style={styles.termsModalFooter}>
              <ScalePressable
                style={styles.termsModalOkBtn}
                onPress={closeTermsModal}
                activeScale={0.96}
              >
                <Text style={styles.termsModalOkBtnText}>{t('understoodBtn')}</Text>
              </ScalePressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    floatingHeader: {
      position: 'absolute',
      left: 16,
      zIndex: 50,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    scrollContent: {
      flexGrow: 1,
    },
    scrollView: {
      flex: 1,
      zIndex: 2,
    },

    // ================= HERO PINNED BACKGROUND (NẰM DƯỚI NỘI DUNG) =================
    pinnedHeroWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      width: SCREEN_WIDTH,
      zIndex: 0,
      overflow: 'hidden',
    },
    pinnedHeroImage: {
      width: '100%',
      height: '100%',
    },

    // ================= MAIN SHEET (SLIDES UP OVER HERO, Z-INDEX CAO HƠN) =================
    mainSheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 24,
      paddingHorizontal: 20,
      minHeight: 700,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      elevation: 6,
      zIndex: 2,
    },
    brandTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    brandDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#9C7156',
      marginRight: 7,
    },
    brandSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 1.5,
      color: '#9C7156',
    },
    voucherTitle: {
      fontFamily: Typography.fontFamily.bold,
      fontSize: 21,
      fontWeight: '700',
      lineHeight: 29,
      color: Colors.textPrimary,
      marginBottom: 12,
      letterSpacing: 0.2,
    },
    highlightBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    highlightBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.18)' : '#F5EBE1',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#9C7156' : '#E8CCB2',
    },
    highlightBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '700',
      color: '#9C7156',
      letterSpacing: 0.5,
    },
    minSpendChip: {
      backgroundColor: isDark ? '#1C1C1C' : '#FFFFFF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
    },
    minSpendChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#B0B0B0' : '#6E665D',
      fontWeight: '500',
    },

    // ================= TICKET CARD (REPLACES BARCODE) =================
    ticketCard: {
      backgroundColor: isDark ? '#141414' : '#FFFFFF',
      borderRadius: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 10,
      elevation: isDark ? 0 : 2.5,
      marginBottom: 20,
      overflow: 'hidden',
    },
    ticketTopSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    ticketLogoBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#222222' : '#F6F4EC',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8CCB2',
    },
    ticketLogoImg: {
      width: 28,
      height: 28,
    },
    ticketTopMeta: {
      flex: 1,
    },
    ticketTopLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: '#9C7156',
      marginBottom: 2,
    },
    ticketTopSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#9E968D' : '#6E665D',
    },

    // Notches & Dashed Divider
    ticketDividerWrap: {
      position: 'relative',
      height: 20,
      justifyContent: 'center',
    },
    dashedLine: {
      height: 1,
      borderWidth: 1,
      borderColor: isDark ? '#282828' : '#E8E1D8',
      borderStyle: 'dashed',
      marginHorizontal: 18,
    },
    ticketNotch: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: 11,
      top: -1,
      zIndex: 2,
    },
    ticketNotchLeft: {
      left: -11,
    },
    ticketNotchRight: {
      right: -11,
    },

    // Ticket Bottom
    ticketBottomSection: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 18,
      alignItems: 'center',
    },
    codeCapsule: {
      width: '100%',
      backgroundColor: isDark ? '#1C1A18' : '#FAF8F5',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#332B25' : '#E8CCB2',
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    codeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 3,
      color: Colors.textPrimary,
    },
    copyActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 42,
      borderRadius: 21,
      paddingHorizontal: 22,
      backgroundColor: isDark ? '#1F1F1F' : '#F6F4EC',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8CCB2',
    },
    copyActionBtnDone: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    copyActionBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '600',
      color: '#9C7156',
    },
    copyActionBtnTextDone: {
      color: '#FFFFFF',
    },

    // ================= DETAILS CARD =================
    detailsCard: {
      backgroundColor: isDark ? '#141414' : '#FFFFFF',
      borderRadius: 20,
      padding: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 8,
      elevation: isDark ? 0 : 1.5,
      marginBottom: 20,
    },
    detailsSectionTitle: {
      fontFamily: Typography.fontFamily.bold,
      fontSize: 16.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 16,
    },
    infoList: {
      marginBottom: 16,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 8,
    },
    infoIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#202020' : '#F7F3EE',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    infoTextCol: {
      flex: 1,
    },
    infoLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#9E968D' : '#6E665D',
      marginBottom: 2,
    },
    infoValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textPrimary,
      fontWeight: '500',
      lineHeight: 19,
    },
    expiryValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    urgentBadge: {
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.25)' : '#F5EBE1',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#9C7156',
    },
    urgentBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '600',
      color: '#9C7156',
    },
    infoDivider: {
      height: 1,
      backgroundColor: isDark ? '#222222' : '#F0ECE6',
      marginLeft: 50,
      marginVertical: 4,
    },

    // Terms Action Row Trigger
    termsActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#1C1C1C' : '#FAF8F5',
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: isDark ? '#2E2E2E' : '#E8E1D8',
    },
    termsActionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    termsActionText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '600',
      color: Colors.textPrimary,
    },

    // ================= STICKY BOTTOM BAR =================
    stickyBottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingTop: 12,
      paddingHorizontal: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? '#222222' : 'rgba(232, 225, 216, 0.7)',
      zIndex: 40,
      elevation: 10,
    },
    applyBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    applyBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },

    // ================= MODAL BOTTOM SHEET & ANIMATION =================
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdropFade: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.52)',
    },
    termsBottomSheet: {
      width: '100%',
      maxHeight: '82%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 22,
      paddingTop: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.4 : 0.12,
      shadowRadius: 16,
      elevation: 12,
    },
    sheetHandleWrap: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    sheetHandle: {
      width: 42,
      height: 4.5,
      borderRadius: 2.5,
    },
    termsModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#262626' : '#F0ECE6',
    },
    termsModalTitle: {
      fontFamily: Typography.fontFamily.bold,
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    termsModalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#242424' : '#F5EFE7',
      justifyContent: 'center',
      alignItems: 'center',
    },
    termsModalScroll: {
      marginTop: 14,
    },
    termsBannerBadge: {
      backgroundColor: isDark ? '#201C19' : '#F7EFE6',
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: isDark ? '#3D2F25' : '#E8CCB2',
      marginBottom: 16,
    },
    termsBannerTitle: {
      fontFamily: Typography.fontFamily.bold,
      fontSize: 14.5,
      fontWeight: '700',
      color: '#9C7156',
      marginBottom: 3,
    },
    termsBannerCode: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#B0B0B0' : '#6E665D',
    },
    termsList: {
      gap: 14,
      paddingBottom: 16,
    },
    termItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    termBulletCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: isDark ? '#262626' : '#EFE7DE',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
      marginTop: 2,
    },
    termBulletText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      fontWeight: '700',
      color: '#9C7156',
    },
    termText: {
      flex: 1,
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      lineHeight: 19.5,
      color: isDark ? '#CCCCCC' : '#4A423B',
    },
    termStrong: {
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    termsModalFooter: {
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#262626' : '#F0ECE6',
    },
    termsModalOkBtn: {
      height: 48,
      borderRadius: 24,
      backgroundColor: '#9C7156',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.14,
      shadowRadius: 6,
      elevation: 3,
    },
    termsModalOkBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
