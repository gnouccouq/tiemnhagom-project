// app/gift-claim.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useThemeColor } from '../src/constants/theme';
import { calculateCeramicPoints } from '../src/services/loyaltyService';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurButton } from '../src/components/BlurButton';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { LiquidGlass } from '../src/components/LiquidGlass';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { FadingBottomBackdrop } from '../src/components/FadingBottomBackdrop';
import {
  getGiftPointsById,
  acceptGiftPoints,
  declineGiftPoints,
  getRemainingExpiryTime,
  GiftPointsTransaction,
} from '../src/services/giftPointsService';
import { ALL_GREETING_CARDS, GreetingCardData } from './select-gift-card';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function GiftClaimScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile, updateUserProfileData } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const params = useLocalSearchParams<{ id?: string; code?: string }>();
  const giftId = (params.id || params.code || '').trim();

  const [loading, setLoading] = useState(true);
  const [gift, setGift] = useState<GiftPointsTransaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Điểm hiện tại của người dùng để hiển thị trên huy hiệu đồng bộ chuẩn xác
  const userTotalSpent = Number(userProfile?.totalSpent || (userProfile as any)?.spentTotal || 0);
  const redeemedPoints = Number((userProfile as any)?.redeemedPoints || 0);
  const currentPoints = calculateCeramicPoints(userTotalSpent, userProfile, redeemedPoints);

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(style);
      } catch {}
    }
  };

  // Tải chi tiết món quà
  useEffect(() => {
    let isMounted = true;
    const fetchGift = async () => {
      if (!giftId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await getGiftPointsById(giftId);
        if (isMounted) {
          setGift(data);
        }
      } catch (err) {
        console.warn('Lỗi lấy thông tin món quà:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGift();
    return () => {
      isMounted = false;
    };
  }, [giftId]);

  // Tìm mẫu thiệp tương ứng
  const cardData: GreetingCardData = useMemo(() => {
    if (!gift) return ALL_GREETING_CARDS[0];
    return ALL_GREETING_CARDS.find((c) => c.id === gift.theme) || ALL_GREETING_CARDS[0];
  }, [gift]);

  // Tính thời gian còn lại trước khi hết hạn
  const remaining = useMemo(() => {
    if (!gift?.expiresAt) return { isExpired: false, text: '' };
    return getRemainingExpiryTime(gift.expiresAt);
  }, [gift]);

  // Trạng thái hiển thị món quà
  const isPending = gift?.status === 'pending' && !remaining.isExpired;
  const isClaimed = gift?.status === 'claimed';
  const isCanceled = gift?.status === 'canceled';
  const isExpired = remaining.isExpired || gift?.status === 'refunded';

  // 1. Xử lý Chấp Nhận Điểm
  const handleAccept = async () => {
    if (!user) {
      dialog.confirm(
        'Đăng nhập để nhận điểm',
        'Bạn cần đăng nhập tài khoản để nhận số Điểm Gốm này và tích lũy mua sắm.',
        () => {
          router.push('/auth/login' as any);
        },
        'Đăng nhập ngay',
        'Để sau'
      );
      return;
    }

    if (!gift || !gift.code) return;

    try {
      setIsProcessing(true);
      triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);

      const recipientInfo = {
        giftId: gift.code,
        recipientUid: user.uid,
        recipientName: userProfile?.displayName || userProfile?.name || user.displayName || 'Khách hàng',
        recipientPhone: userProfile?.phone || user.phoneNumber || '',
      };

      const result = await acceptGiftPoints(recipientInfo);

      if (!result.success) {
        let msg = 'Không thể nhận món quà này.';
        if (result.error === 'cannot_claim_own') msg = 'Bạn không thể tự nhận món quà do chính mình tạo ra.';
        else if (result.error === 'already_processed') msg = 'Món quà này đã được nhận trước đó.';
        else if (result.error === 'expired') msg = 'Món quà này đã hết hạn 24 giờ và đã được hoàn lại.';
        dialog.alert('Thông báo', msg);
        return;
      }

      // Cập nhật state cục bộ
      setGift((prev) => (prev ? { ...prev, status: 'claimed' } : null));

      try {
        const raw = await AsyncStorage.getItem('tiemnhagom_claimed_gifts');
        const set = raw ? JSON.parse(raw) : [];
        const codeUpper = gift.code.toUpperCase();
        if (!set.includes(codeUpper)) {
          set.push(codeUpper);
          await AsyncStorage.setItem('tiemnhagom_claimed_gifts', JSON.stringify(set));
        }
      } catch {}

      // Cập nhật lại số điểm trong User Profile cục bộ
      if (updateUserProfileData) {
        const currentGiftBonus = Number((userProfile as any)?.giftPointsBonus || 0);
        const newBonus = currentGiftBonus + gift.points;
        updateUserProfileData({ giftPointsBonus: newBonus } as any);
      }

      dialog.alert(
        'Nhận Điểm Thành Công! 🎉',
        `Bạn đã nhận thành công +${gift.points} Điểm Gốm từ ${gift.senderName || 'người gửi'}.\nSố điểm đã được cộng trực tiếp vào ví điểm của bạn!`,
        [
          {
            text: 'Xem lịch sử điểm',
            style: 'default',
            onPress: () => {
              router.replace('/points-history' as any);
            },
          },
        ]
      );
    } catch (err: any) {
      console.warn('Lỗi nhận điểm:', err);
      dialog.alert('Thông báo', 'Có lỗi xảy ra khi nhận điểm. Vui lòng thử lại sau.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Xử lý Từ Chối Điểm
  const handleDecline = () => {
    if (!gift || !gift.code) return;

    dialog.confirm(
      'Xác nhận từ chối',
      `Bạn có chắc chắn muốn từ chối nhận +${gift.points} Điểm Gốm từ ${gift.senderName || 'người gửi'} không?\n\nSố điểm này sẽ được hoàn lại ngay lập tức cho người gửi.`,
      async () => {
        try {
          setIsProcessing(true);
          triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

          const result = await declineGiftPoints({
            giftId: gift.code,
            recipientUid: user?.uid || '',
            recipientName: userProfile?.displayName || userProfile?.name || user?.displayName || 'Người nhận',
          });

          if (!result.success) {
            dialog.alert('Thông báo', 'Không thể từ chối món quà này hoặc quà đã được xử lý.');
            return;
          }

          setGift((prev) => (prev ? { ...prev, status: 'canceled' } : null));

          dialog.alert(
            'Đã từ chối món quà',
            `Bạn đã từ chối nhận số Điểm Gốm này. Tiệm đã hoàn lại +${gift.points} Điểm Gốm cho ${gift.senderName || 'người gửi'}.`,
            [
              {
                text: 'Đóng',
                style: 'default',
                onPress: () => {
                  router.back();
                },
              },
            ]
          );
        } catch (err) {
          console.warn('Lỗi từ chối quà:', err);
          dialog.alert('Thông báo', 'Có lỗi xảy ra khi từ chối món quà.');
        } finally {
          setIsProcessing(false);
        }
      },
      'Từ chối quà',
      'Giữ lại'
    );
  };

  return (
    <View style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Ảnh nền gốm mộc chuẩn thương hiệu */}
      <Image
        source={require('../assets/images/background_gift-point.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        priority="high"
      />

      {/* Lớp phủ Gradient mờ dần từ trên xuống dưới chuẩn GEMINI.md */}
      <FadingHeaderBackdrop height={insets.top + 56 + 24} />

      {/* ========================================================================= */}
      {/* 1. TOP HEADER (Nút Back tròn bọc LiquidGlass + Tiêu đề + Huy hiệu điểm)     */}
      {/* ========================================================================= */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        <View style={styles.headerLeftGroup}>
          <HeaderBackButton
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)' as any);
            }}
          />
          <Text style={styles.headerTitle} numberOfLines={1}>
            Món Quà Điểm Gốm
          </Text>
        </View>

        {/* Huy hiệu Điểm Gốm bên phải */}
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsBadgeText}>{currentPoints}</Text>
          <Image
            source={require('../assets/images/icon_ceramic_point.png')}
            style={styles.pointsBadgeIcon}
            contentFit="contain"
          />
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 2. NỘI DUNG CHÍNH (Thiệp gốm nghệ thuật + Chi tiết + Lời chúc chân tình)    */}
      {/* ========================================================================= */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 120 }]}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#9C7156" />
            <Text style={styles.loadingText}>Đang mở thiệp quà tặng...</Text>
          </View>
        ) : !gift ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="gift-outline" size={56} color="#A0988F" />
            <Text style={styles.emptyTitle}>Không tìm thấy món quà</Text>
            <Text style={styles.emptyDesc}>Mã quà tặng không tồn tại hoặc đã được hủy.</Text>
            <TouchableOpacity
              style={styles.backHomeBtn}
              activeOpacity={0.85}
              onPress={() => router.replace('/(tabs)' as any)}
            >
              <Text style={styles.backHomeBtnText}>Về trang chủ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.artworkCardWrap}>
            {/* ─── A. PHẦN TRÊN: COVER THIỆP NGHỆ THUẬT (Artwork Cover) ─── */}
            <View style={styles.greetingCardContainer}>
              <LinearGradient
                colors={cardData.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.greetingCardGradient}
              >
                {/* Họa tiết sọc ngang nếu thiệp có thuộc tính stripes */}
                {cardData.stripes && (
                  <View style={styles.stripesWrap} pointerEvents="none">
                    <View style={styles.stripeLine} />
                    <View style={styles.stripeLine} />
                    <View style={styles.stripeLine} />
                    <View style={styles.stripeLine} />
                  </View>
                )}

                <View style={styles.greetingCardTopRow}>
                  <View style={styles.ceramicEmblemBadge}>
                    <Text style={styles.ceramicEmblemText}>TIỆM NHÀ GỐM</Text>
                  </View>
                  <Ionicons name="sparkles" size={18} color={cardData.textColor} style={{ opacity: 0.85 }} />
                </View>

                {/* Tiêu đề & Đề tựa thiệp */}
                <View style={styles.greetingCardTitleBlock}>
                  <Text style={[styles.greetingCardTitle, { color: cardData.textColor }]}>
                    {gift.themeTitle || cardData.title.replace('\n', ' ')}
                  </Text>
                  <Text style={[styles.greetingCardTagline, { color: cardData.textColor }]}>
                    {cardData.tagline}
                  </Text>
                </View>

                {/* Biểu tượng chiếc bình gốm mộc đáy thiệp */}
                <View style={styles.ceramicPotArtWrap}>
                  <Image
                    source={require('../assets/images/icon_ceramic_point.png')}
                    style={styles.ceramicPotArt}
                    contentFit="contain"
                  />
                </View>
              </LinearGradient>
            </View>

            {/* ─── B. PHẦN DƯỚI: NỘI DUNG CHI TIẾT & LỜI CHÚC (Card Body) ─── */}
            <View style={styles.detailsCardBody}>
              {/* 1. Người gửi */}
              <View style={styles.senderHeaderRow}>
                <View style={styles.senderAvatarWrap}>
                  <Ionicons name="person" size={17} color="#9C7156" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.senderSubtitle}>Món quà gửi tặng từ</Text>
                  <Text style={styles.senderNameTitle}>{gift.senderName || 'Người bạn thân thiết'}</Text>
                  {gift.senderPhone ? (
                    <Text style={styles.senderPhoneText}>{gift.senderPhone}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.divider} />

              {/* 2. Khối Điểm Gốm siêu lớn nổi bật */}
              <View style={styles.pointsDisplaySection}>
                <Text style={styles.pointsDisplaySub}>Số điểm tặng bạn</Text>
                <View style={styles.pointsDisplayRow}>
                  <Text style={styles.pointsLargeNumber}>+{gift.points}</Text>
                  <View style={styles.pointsLabelGroup}>
                    <Text style={styles.pointsLabelPrimary}>Điểm Gốm</Text>
                    <Image
                      source={require('../assets/images/icon_ceramic_point.png')}
                      style={styles.pointsCeramicIcon}
                      contentFit="contain"
                    />
                  </View>
                </View>
                <Text style={styles.pointsValueHint}>
                  (Tương đương giảm trừ trực tiếp {new Intl.NumberFormat('vi-VN').format(gift.points * 1000)}₫ khi mua hàng)
                </Text>
              </View>

              {/* 3. Lời chúc chân tình */}
              <View style={styles.messageSection}>
                <View style={styles.messageSectionHeader}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color="#9C7156" />
                  <Text style={styles.messageSectionTitle}>Lời chúc từ người gửi</Text>
                </View>
                <View style={styles.messageQuoteBubble}>
                  <Ionicons name="chatbubble-outline" size={16} color="#E8CCB2" style={{ marginBottom: 4 }} />
                  <Text style={styles.messageQuoteText}>
                    "{gift.message || 'Mến tặng bạn chút điểm gốm mộc, chúc bạn luôn an yên và ngập tràn niềm vui!'}"
                  </Text>
                </View>
              </View>

              {/* 4. Trạng thái / Hạn nhận quà */}
              <View style={styles.statusBannerRow}>
                {isPending ? (
                  <View style={styles.pendingBadgeRow}>
                    <Ionicons name="time-outline" size={16} color="#B45309" />
                    <Text style={styles.pendingBadgeText}>
                      Hiệu lực nhận: Còn {remaining.text} • Hoàn lại nếu sau 24h chưa nhận
                    </Text>
                  </View>
                ) : isClaimed ? (
                  <View style={styles.claimedBadgeRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                    <Text style={styles.claimedBadgeText}>
                      ✓ Bạn đã nhận thành công món quà này
                    </Text>
                  </View>
                ) : isCanceled ? (
                  <View style={styles.canceledBadgeRow}>
                    <Ionicons name="close-circle" size={18} color="#B91C1C" />
                    <Text style={styles.canceledBadgeText}>
                      Đã từ chối món quà này (Số điểm đã được hoàn lại cho người gửi)
                    </Text>
                  </View>
                ) : (
                  <View style={styles.expiredBadgeRow}>
                    <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                    <Text style={styles.expiredBadgeText}>
                      Món quà đã hết hạn 24 giờ và tự động hoàn lại cho người gửi
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* 3. THANH HÀNH ĐỘNG CỐ ĐỊNH ĐÁY (Không bọc LiquidGlass)                    */}
      {/* ========================================================================= */}
      {!loading && gift && (
        <>
          <FadingBottomBackdrop rgbColor="250, 248, 245" />
          <View
            style={[styles.bottomBarWrapper, { bottom: Math.max(insets.bottom, 14) }]}
            pointerEvents="box-none"
          >
          {isPending ? (
            <View style={styles.bottomBarRow}>
              {/* NÚT 1: TỪ CHỐI */}
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
                disabled={isProcessing}
                activeOpacity={0.82}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={20}
                  color={isDark ? '#E8CCB2' : '#6E665D'}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.declineButtonText}>Từ chối</Text>
              </TouchableOpacity>

              {/* NÚT 2: NHẬN ĐIỂM (PRIMARY CTA) */}
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={handleAccept}
                disabled={isProcessing}
                activeOpacity={0.88}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="gift"
                      size={20}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.acceptButtonText}>Nhận điểm</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.bottomDoneBtn}
              onPress={() => router.replace('/points-history' as any)}
              activeOpacity={0.88}
            >
              <Text style={styles.bottomDoneBtnText}>Xem lịch sử điểm</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}
        </View>
      </>
      )}
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      zIndex: 10,
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      marginRight: 8,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#2B2928'),
      flex: 1,
    },
    pointsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8E1D8',
      gap: 5,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    pointsBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: '#9C7156',
    },
    pointsBadgeIcon: {
      width: 17,
      height: 17,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      gap: 14,
    },
    loadingText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textMuted || '#8C7A70',
      fontWeight: '600',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      paddingHorizontal: 24,
      gap: 12,
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    emptyDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
    backHomeBtn: {
      marginTop: 14,
      height: 44,
      paddingHorizontal: 24,
      borderRadius: 22,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
    },
    backHomeBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // A & B: Thẻ Thiệp Gốm Đồng Bộ Khối Sang Trọng
    artworkCardWrap: {
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: isDark ? (Colors.cardBackground || '#181818') : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#2B2928',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 16,
      elevation: 6,
    },

    // Cover thiệp
    greetingCardContainer: {
      width: '100%',
      height: 195,
      overflow: 'hidden',
    },
    greetingCardGradient: {
      flex: 1,
      padding: 18,
      justifyContent: 'space-between',
      position: 'relative',
    },
    stripesWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'space-around',
      opacity: 0.22,
      paddingVertical: 14,
    },
    stripeLine: {
      height: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.45)',
    },
    greetingCardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    ceramicEmblemBadge: {
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
    },
    ceramicEmblemText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 9.5,
      fontWeight: '800',
      color: '#2B2928',
      letterSpacing: 0.8,
    },
    greetingCardTitleBlock: {
      marginTop: 4,
    },
    greetingCardTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 27,
      fontWeight: '800',
      lineHeight: 32,
    },
    greetingCardTagline: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      opacity: 0.9,
      marginTop: 3,
    },
    ceramicPotArtWrap: {
      position: 'absolute',
      right: 18,
      bottom: 14,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: 'rgba(255, 255, 255, 0.24)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ceramicPotArt: {
      width: 36,
      height: 36,
    },

    // Chi tiết thiệp & nội dung lời chúc
    detailsCardBody: {
      padding: 18,
      gap: 16,
    },
    senderHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    senderAvatarWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.25)' : '#FAF7F2',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8CCB2',
    },
    senderSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: Colors.textMuted || '#8C7A70',
      fontWeight: '500',
    },
    senderNameTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#2B2928'),
      marginTop: 1,
    },
    senderPhoneText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: '#9C7156',
      fontWeight: '600',
      marginTop: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? '#2C2C2C' : '#F0ECE6',
    },

    // Khối điểm Gốm lớn
    pointsDisplaySection: {
      backgroundColor: isDark ? '#222222' : '#FAF7F2',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8CCB2',
      paddingVertical: 16,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pointsDisplaySub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: '#9C7156',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    pointsDisplayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    pointsLargeNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 38,
      fontWeight: '800',
      color: '#9C7156',
    },
    pointsLabelGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    pointsLabelPrimary: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#2B2928'),
    },
    pointsCeramicIcon: {
      width: 23,
      height: 23,
    },
    pointsValueHint: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: isDark ? '#A0988F' : '#6E665D',
      marginTop: 6,
      textAlign: 'center',
      fontWeight: '500',
    },

    // Lời chúc chân tình
    messageSection: {
      gap: 8,
    },
    messageSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    messageSectionTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '700',
      color: '#9C7156',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    messageQuoteBubble: {
      backgroundColor: isDark ? '#1C1C1C' : '#FFFDF9',
      borderWidth: 1,
      borderColor: isDark ? '#2E2E2E' : '#E8E1D8',
      borderRadius: 16,
      padding: 14,
    },
    messageQuoteText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      lineHeight: 22,
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#2B2928'),
      fontStyle: 'italic',
    },

    // Hạn nhận & Trạng thái
    statusBannerRow: {
      marginTop: 2,
    },
    pendingBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: isDark ? 'rgba(180, 83, 9, 0.20)' : '#FEF3C7',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
    },
    pendingBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: isDark ? '#FBBF24' : '#B45309',
      fontWeight: '600',
      flex: 1,
    },
    claimedBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(21, 128, 61, 0.15)' : '#DCFCE7',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
    },
    claimedBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#4ADE80' : '#15803D',
      fontWeight: '700',
    },
    canceledBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(185, 28, 28, 0.15)' : '#FEE2E2',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
    },
    canceledBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#F87171' : '#B91C1C',
      fontWeight: '600',
    },
    expiredBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(185, 28, 28, 0.15)' : '#FEE2E2',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
    },
    expiredBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? '#F87171' : '#B91C1C',
      fontWeight: '600',
    },

    // C. Thanh hành động cố định đáy dạng viên thuốc (Không bọc LiquidGlass)
    bottomBarWrapper: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 100,
    },
    bottomBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    declineButton: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#1C1C1C' : '#FFFFFF',
      borderWidth: 1.5,
      borderColor: isDark ? '#3A3A3A' : '#E8CCB2',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    declineButtonText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#6E665D',
    },
    acceptButton: {
      flex: 1.4,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 5,
    },
    acceptButtonText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    bottomDoneBtn: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
    },
    bottomDoneBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
