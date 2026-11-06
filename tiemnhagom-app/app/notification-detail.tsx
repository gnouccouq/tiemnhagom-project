import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../src/components/Header';
import { FadingBottomBackdrop } from '../src/components/FadingBottomBackdrop';
import { useThemeColor, Typography } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';
import { db } from '../src/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getGiftPointsById, GiftPointsTransaction } from '../src/services/giftPointsService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function NotificationDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const notifId = (params.id as string) || '';
  const initialType = (params.type as string) || '';
  const initialGiftId = (params.giftId as string) || '';

  // Nhận biết thông báo quà tặng điểm gốm
  const isGift =
    initialType === 'gift' ||
    Boolean(initialGiftId) ||
    notifId.startsWith('claimed_') ||
    notifId.startsWith('rejected_') ||
    notifId.startsWith('gift_') ||
    Boolean(params.title && ((params.title as string).includes('đã nhận') || (params.title as string).includes('Điểm Gốm')));

  const cleanGiftId =
    initialGiftId ||
    (notifId.startsWith('claimed_')
      ? notifId.replace('claimed_', '')
      : notifId.startsWith('rejected_')
      ? notifId.replace('rejected_', '')
      : notifId.startsWith('gift_')
      ? notifId.replace('gift_', '')
      : '');

  const [loading, setLoading] = useState(false);
  const [giftTransaction, setGiftTransaction] = useState<GiftPointsTransaction | null>(null);

  const [detailData, setDetailData] = useState<{
    title: string;
    message: string;
    imageUrl?: string;
    type: string;
    time: string;
    link?: string;
    giftStatus?: 'pending' | 'claimed' | 'canceled';
  }>({
    title: (params.title as string) || '',
    message: (params.message as string) || '',
    imageUrl: (params.imageUrl as string) || '',
    type: isGift ? 'gift' : initialType || 'promo',
    time: (params.time as string) || 'Mới đây',
    link: (params.link as string) || '',
    giftStatus: (params.giftStatus as any) || (notifId.startsWith('claimed_') ? 'claimed' : notifId.startsWith('rejected_') ? 'canceled' : undefined),
  });

  // Tự động tải từ Firestore và Gift Cache
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // 1. Tải giao dịch quà tặng nếu có giftId
      if (cleanGiftId) {
        try {
          const gift = await getGiftPointsById(cleanGiftId);
          if (gift && isMounted) {
            setGiftTransaction(gift);
            if (gift.status) {
              setDetailData((prev) => ({
                ...prev,
                giftStatus: gift.status === 'refunded' ? 'canceled' : (gift.status as any),
              }));
            }
          }
        } catch {}
      }

      // 2. Tải thông báo từ Firestore nếu thiếu tiêu đề hoặc nội dung
      if (notifId && (!detailData.title || !detailData.message)) {
        try {
          setLoading(true);

          // Thử tải từ global_notifications trước
          let snap = await getDoc(doc(db, 'global_notifications', notifId));

          // Nếu không có, thử tải từ hộp thư cá nhân của user
          if (!snap.exists() && user?.uid) {
            snap = await getDoc(doc(db, 'users', user.uid, 'notifications', notifId));
          }

          if (snap.exists() && isMounted) {
            const data = snap.data();
            let timeStr = 'Mới đây';
            if (data.createdAt) {
              try {
                const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                timeStr = `${day}/${month}/${year}`;
              } catch {}
            }

            const notifType = data.type === 'gift' || isGift ? 'gift' : data.type || 'promo';

            setDetailData((prev) => ({
              ...prev,
              title: data.title || prev.title || 'Thông báo từ Tiệm Nhà Gốm',
              message: data.message || data.body || prev.message || '',
              imageUrl: data.imageUrl || prev.imageUrl || '',
              type: notifType,
              time: timeStr,
              link: data.link || prev.link || '',
              giftStatus: data.giftStatus || prev.giftStatus,
            }));
          }
        } catch (err) {
          console.log('Lỗi tải chi tiết thông báo:', err);
        } finally {
          if (isMounted) setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [notifId, cleanGiftId]);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/notifications' as any);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: detailData.title,
        message: `${detailData.title}\n\n${detailData.message}\n\nKhám phá tại Tiệm Nhà Gốm!`,
      });
    } catch {}
  };

  const handleAction = () => {
    if (detailData.type === 'gift') {
      router.push('/points-history' as any);
      return;
    }

    if (detailData.link) {
      router.push(detailData.link as any);
      return;
    }

    if (detailData.type === 'order') {
      router.push('/orders' as any);
    } else if (detailData.type === 'promo') {
      router.push('/(tabs)/deals' as any);
    } else {
      router.push('/(tabs)/products' as any);
    }
  };

  const handleViewGreetingCard = () => {
    if (cleanGiftId) {
      router.push({
        pathname: '/gift-claim',
        params: { id: cleanGiftId },
      });
    }
  };

  // Xác định cấu hình theme theo loại thông báo
  const getTypeBadgeConfig = () => {
    switch (detailData.type) {
      case 'gift':
        return {
          label: t('giftPointsBadge') || 'Món quà Điểm Gốm',
          icon: 'gift-outline' as const,
          bgColor: isDark ? '#2C2C2C' : '#FAF7F2',
          textColor: '#9C7156',
          borderColor: isDark ? 'transparent' : '#E8CCB2',
          actionText: t('viewPointsHistoryAction') || 'Xem lịch sử Điểm Gốm',
          actionIcon: 'sparkles-outline' as const,
        };
      case 'order':
        return {
          label: t('notifTabOrder'),
          icon: 'cube-outline' as const,
          bgColor: isDark ? '#2C2C2C' : '#F6F4EC',
          textColor: isDark ? '#E8CCB2' : '#9C7156',
          borderColor: isDark ? 'transparent' : '#E8CCB2',
          actionText: t('viewOrder'),
          actionIcon: 'receipt-outline' as const,
        };
      case 'system':
        return {
          label: t('notifTabSystem'),
          icon: 'shield-checkmark-outline' as const,
          bgColor: isDark ? '#2C2C2C' : '#F1F5F9',
          textColor: isDark ? '#B0B0B0' : '#475569',
          borderColor: isDark ? 'transparent' : '#E2E8F0',
          actionText: t('viewAccount'),
          actionIcon: 'person-outline' as const,
        };
      default:
        return {
          label: t('notifPromoAndDiscount'),
          icon: 'pricetag-outline' as const,
          bgColor: isDark ? '#2C2C2C' : '#FDF4ED',
          textColor: isDark ? '#E8CCB2' : '#C86432',
          borderColor: isDark ? 'transparent' : '#F8D8C3',
          actionText: t('exploreDealsAction'),
          actionIcon: 'bag-handle-outline' as const,
        };
    }
  };

  const badgeConfig = getTypeBadgeConfig();
  const [scrollY, setScrollY] = useState(0);

  const isClaimedState =
    detailData.giftStatus === 'claimed' ||
    giftTransaction?.status === 'claimed' ||
    notifId.startsWith('claimed_') ||
    detailData.title.includes('đã nhận');

  const isCanceledState =
    detailData.giftStatus === 'canceled' ||
    giftTransaction?.status === 'canceled' ||
    giftTransaction?.status === 'refunded' ||
    notifId.startsWith('rejected_') ||
    detailData.title.includes('từ chối');

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header chuẩn trang trong app với nút quay lại */}
      <Header
        title={t('notificationDetailTitle')}
        showBack={true}
        showSearch={false}
        showCart={false}
        scrollY={scrollY}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9C7156" />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>
            {t('loadingNotification')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 54 + 10,
              paddingBottom: Math.max(insets.bottom, 24) + 80,
            },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {/* Card nội dung chính */}
          <View style={styles.mainCard}>
            {/* Meta row: Huy hiệu loại thông báo & Thời gian & Nút chia sẻ */}
            <View style={styles.metaRow}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: badgeConfig.bgColor, borderColor: badgeConfig.borderColor },
                ]}
              >
                <Ionicons name={badgeConfig.icon} size={14} color={badgeConfig.textColor} />
                <Text style={[styles.badgeText, { color: badgeConfig.textColor }]}>
                  {badgeConfig.label}
                </Text>
              </View>

              <View style={styles.metaRight}>
                <View style={styles.timeWrap}>
                  <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                  <Text style={[styles.timeText, { color: Colors.textMuted }]}>
                    {detailData.time}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.shareBtn,
                    {
                      borderColor: isDark ? 'transparent' : Colors.border,
                      backgroundColor: isDark ? '#2C2C2C' : 'transparent',
                    },
                  ]}
                  onPress={handleShare}
                  activeOpacity={0.7}
                  accessibilityLabel="Chia sẻ thông báo"
                >
                  <Ionicons name="share-outline" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Tiêu đề thông báo */}
            <Text style={[styles.title, { color: Colors.textPrimary }]}>
              {detailData.title || 'Thông báo từ Tiệm Nhà Gốm'}
            </Text>

            {/* Đường phân cách nhẹ */}
            <View style={[styles.divider, { backgroundColor: isDark ? '#2A2A2A' : Colors.border }]} />

            {/* Hình ảnh thông báo đính kèm (nếu có) */}
            {Boolean(detailData.imageUrl) && (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: detailData.imageUrl }}
                  style={styles.notifImage}
                  contentFit="cover"
                  transition={250}
                />
              </View>
            )}

            {/* Giao diện đặc biệt dành cho Món quà Điểm Gốm của Người Gửi */}
            {isGift && (
              <View style={styles.giftShowcaseBox}>
                {/* Status pill header */}
                <View style={styles.giftStatusHeader}>
                  <View
                    style={[
                      styles.giftStatusBadge,
                      {
                        backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2',
                        borderColor: isDark ? '#9C7156' : '#E8CCB2',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        isClaimedState
                          ? 'checkmark-circle'
                          : isCanceledState
                          ? 'refresh-circle'
                          : 'time-outline'
                      }
                      size={15}
                      color="#9C7156"
                    />
                    <Text style={styles.giftStatusBadgeText}>
                      {isClaimedState
                        ? t('giftClaimedBadge') || 'Đã nhận thành công'
                        : isCanceledState
                        ? t('giftRefundedBadge') || 'Đã hoàn lại vào ví'
                        : t('giftPendingBadge') || 'Đang chờ nhận điểm'}
                    </Text>
                  </View>
                </View>

                {/* Khối Điểm Gốm nổi bật */}
                <View style={styles.giftPointsHero}>
                  <View style={styles.pointsIconCircle}>
                    <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.pointsHeroTextWrap}>
                    <Text style={styles.pointsHeroAmount}>
                      {giftTransaction?.points ? `+${giftTransaction.points} Điểm Gốm` : 'Điểm Gốm'}
                    </Text>
                    <Text style={[styles.pointsHeroDesc, { color: Colors.textSecondary }]}>
                      {isClaimedState
                        ? t('giftSenderSuccessDesc') || 'Món quà Điểm Gốm kèm lời chúc của bạn đã được trao gửi trọn vẹn đến người nhận.'
                        : isCanceledState
                        ? t('giftSenderRefundedDesc') || 'Món quà Điểm Gốm đã hết hạn hoặc được hoàn lại đầy đủ vào số dư tài khoản của bạn.'
                        : 'Món quà đang chờ người nhận mở thiệp để nạp điểm.'}
                    </Text>
                  </View>
                </View>

                {/* Chi tiết người nhận & thiệp */}
                {(Boolean(giftTransaction?.recipientName) || Boolean(giftTransaction?.themeTitle)) && (
                  <View
                    style={[
                      styles.giftDetailGrid,
                      {
                        backgroundColor: isDark ? '#1A1816' : '#FAF7F2',
                        borderColor: isDark ? 'transparent' : '#E8E1D8',
                      },
                    ]}
                  >
                    {Boolean(giftTransaction?.recipientName) && (
                      <View style={styles.giftGridRow}>
                        <Text style={[styles.giftGridLabel, { color: Colors.textMuted }]}>
                          Người nhận:
                        </Text>
                        <Text style={[styles.giftGridValue, { color: Colors.textPrimary }]}>
                          {giftTransaction?.recipientName}
                        </Text>
                      </View>
                    )}

                    {Boolean(giftTransaction?.themeTitle) && (
                      <View style={styles.giftGridRow}>
                        <Text style={[styles.giftGridLabel, { color: Colors.textMuted }]}>
                          Chủ đề thiệp:
                        </Text>
                        <Text style={[styles.giftGridValue, { color: '#9C7156' }]}>
                          {giftTransaction?.themeTitle}
                        </Text>
                      </View>
                    )}

                    {Boolean(cleanGiftId) && (
                      <View style={styles.giftGridRow}>
                        <Text style={[styles.giftGridLabel, { color: Colors.textMuted }]}>
                          Mã quà tặng:
                        </Text>
                        <Text style={[styles.giftGridValue, { color: Colors.textPrimary }]}>
                          {cleanGiftId}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Lời chúc đã gửi */}
                {Boolean(giftTransaction?.message) && (
                  <View
                    style={[
                      styles.giftQuoteBox,
                      {
                        backgroundColor: isDark ? '#161412' : '#F6F4EC',
                        borderColor: isDark ? 'transparent' : '#E8CCB2',
                      },
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#9C7156" />
                    <Text style={[styles.giftQuoteText, { color: Colors.textPrimary }]}>
                      "{giftTransaction?.message}"
                    </Text>
                  </View>
                )}

                {/* Nút xem thiệp chúc mừng đã gửi */}
                {Boolean(cleanGiftId) && (
                  <TouchableOpacity
                    style={[
                      styles.viewGreetingCardBtn,
                      {
                        backgroundColor: isDark ? '#231F1C' : '#FAF7F2',
                        borderColor: isDark ? '#3D342D' : '#E8CCB2',
                      },
                    ]}
                    onPress={handleViewGreetingCard}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="mail-open-outline" size={18} color="#9C7156" />
                    <Text style={styles.viewGreetingCardText}>
                      {t('viewSentGreetingCard') || 'Xem thiệp chúc mừng đã gửi'}
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color="#9C7156" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Nội dung chi tiết thông báo */}
            {!isGift && (
              <View style={styles.bodyWrap}>
                <Text style={[styles.message, { color: Colors.textSecondary }]}>
                  {detailData.message || 'Không có nội dung chi tiết.'}
                </Text>
              </View>
            )}
          </View>

          {/* Hộp gợi ý dịch vụ & hỗ trợ */}
          <View style={styles.supportBox}>
            <View style={styles.supportHeader}>
              <Ionicons name="chatbubbles-outline" size={18} color="#9C7156" />
              <Text style={[styles.supportTitle, { color: Colors.textPrimary }]}>
                {t('needSupportAboutNotif')}
              </Text>
            </View>
            <Text style={[styles.supportDesc, { color: Colors.textSecondary }]}>
              {t('needSupportAboutNotifDesc')}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Thanh Action Bar cố định dưới đáy */}
      {!loading && (
        <>
          {/* Lớp phủ mờ dần đáy màn hình bên dưới các nút */}
          <FadingBottomBackdrop />

          <View
            style={[
              styles.bottomBarWrapper,
              {
                bottom: Math.max(insets.bottom, 14),
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.bottomBarContent}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleAction}
                activeOpacity={0.85}
              >
                <Ionicons name={badgeConfig.actionIcon} size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{badgeConfig.actionText}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleGoBack}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={Colors.textSecondary}
                  style={{ marginLeft: -1 }}
                />
                <Text style={[styles.secondaryBtnText, { color: Colors.textSecondary }]}>
                  {t('back')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: '500',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      gap: 16,
    },
    mainCard: {
      borderRadius: 20,
      backgroundColor: Colors.cardBackground,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.border || '#E8E1D8'),
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 12,
      elevation: isDark ? 0 : 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      borderWidth: isDark ? 0 : 1,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    metaRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    timeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timeText: {
      fontSize: 12,
    },
    shareBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: isDark ? 0 : 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: Typography.fontFamily.bold,
      fontSize: 20,
      lineHeight: 27,
      fontWeight: '700',
      marginBottom: 16,
    },
    divider: {
      height: 1,
      marginBottom: 16,
    },
    imageContainer: {
      width: '100%',
      height: 220,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: isDark ? '#2C2C2C' : '#F3E5DC',
      marginBottom: 18,
    },
    notifImage: {
      width: '100%',
      height: '100%',
    },
    bodyWrap: {
      paddingVertical: 4,
    },
    message: {
      fontFamily: Typography.fontFamily.regular,
      fontSize: 15.5,
      lineHeight: 25,
      letterSpacing: 0.2,
    },
    giftShowcaseBox: {
      gap: 14,
      marginTop: 4,
    },
    giftStatusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    giftStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    giftStatusBadgeText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#9C7156',
    },
    giftPointsHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 4,
    },
    pointsIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 3,
    },
    pointsHeroTextWrap: {
      flex: 1,
    },
    pointsHeroAmount: {
      fontSize: 22,
      fontWeight: '700',
      color: '#9C7156',
      letterSpacing: -0.3,
    },
    pointsHeroDesc: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    giftDetailGrid: {
      borderRadius: 16,
      padding: 14,
      gap: 8,
      borderWidth: isDark ? 0 : 1,
    },
    giftGridRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    giftGridLabel: {
      fontSize: 13,
    },
    giftGridValue: {
      fontSize: 13.5,
      fontWeight: '600',
    },
    giftQuoteBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 16,
      padding: 14,
      borderWidth: isDark ? 0 : 1,
    },
    giftQuoteText: {
      flex: 1,
      fontSize: 13.5,
      lineHeight: 20,
      fontStyle: 'italic',
    },
    viewGreetingCardBtn: {
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginTop: 2,
    },
    viewGreetingCardText: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '600',
      color: '#9C7156',
      marginLeft: 8,
    },
    supportBox: {
      borderRadius: 20,
      backgroundColor: Colors.cardBackground,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.border || '#E8E1D8'),
      padding: 16,
      gap: 8,
    },
    supportHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    supportTitle: {
      fontSize: 14,
      fontWeight: '700',
    },
    supportDesc: {
      fontSize: 13,
      lineHeight: 19,
    },
    bottomBarWrapper: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 50,
    },
    bottomBarContent: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    primaryBtn: {
      flex: 1,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryBtnText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryBtn: {
      height: 52,
      paddingHorizontal: 20,
      borderRadius: 26,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : (Colors.border || '#E8E1D8'),
      backgroundColor: isDark ? '#2C2C2C' : 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    secondaryBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
    },
  });
