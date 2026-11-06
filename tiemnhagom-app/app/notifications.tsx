// app/notifications.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../src/config/firebase';
import { collection, getDocs, getDoc, query, orderBy, limit, doc, deleteDoc } from 'firebase/firestore';
import { Header } from '../src/components/Header';
import { useThemeColor, Typography } from '../src/constants/theme';
import { useNotificationBadge } from '../src/context/NotificationBadgeContext';
import { READ_IDS_KEY, LOCAL_NOTIFS_KEY } from '../src/constants/notificationKeys';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { ScalePressable } from '../src/components/ScalePressable';
import { getUserOrders } from '../src/services/orderService';
import {
  generateOrderNotificationsFromOrders,
  DELETED_NOTIFS_KEY,
} from '../src/services/orderNotificationService';
import { getRemainingExpiryTime, getLocalGiftsCache } from '../src/services/giftPointsService';
import {
  UnifiedFeedItem,
  FilterType,
  NotificationType,
  getCachedNotificationFeed,
  preloadNotificationFeed,
} from '../src/services/notificationFeedService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;

// UnifiedFeedItem, FilterType, NotificationType imported from notificationFeedService

// ─── SwipeableNotificationCard: Trượt sang trái để xóa thông báo đẩy ───────
function SwipeableNotificationCard({
  item,
  onPress,
  onDelete,
  setScrollEnabled,
  styles,
  isDark,
  t,
}: {
  item: UnifiedFeedItem;
  onPress: () => void;
  onDelete: () => void;
  setScrollEnabled: (v: boolean) => void;
  styles: any;
  isDark: boolean;
  t: (key: string) => string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const deleteOpacity = useRef(new Animated.Value(0)).current;

  // Tính toán thời gian hết hạn cho thông báo tặng điểm gốm
  const isGift = Boolean(item.isGift || item.giftId || (item.link && item.link.includes('gift-claim')));
  const isClaimed =
    item.giftStatus === 'claimed' ||
    item.id.startsWith('claimed_') ||
    Boolean(item.title && (item.title.includes('đã nhận') || item.title.includes('da nhan'))) ||
    Boolean(item.message && (item.message.includes('trao gửi trọn vẹn') || item.message.includes('trao goi tron ven')));
  const isCanceled =
    item.giftStatus === 'canceled' ||
    item.id.startsWith('rejected_') ||
    Boolean(item.title && (item.title.includes('từ chối') || item.title.includes('tu choi')));

  // Nếu điểm đã nhận hoặc đã từ chối -> KHÔNG hiện thời gian hết hạn nữa
  const showExpiryBadge = isGift && !isClaimed && !isCanceled && item.giftStatus === 'pending';
  const giftExpiresAt = showExpiryBadge ? (item.expiresAt || (item.createdAtMs ? new Date(item.createdAtMs + 24 * 3600 * 1000).toISOString() : '')) : '';

  const [remainingText, setRemainingText] = useState<string>(() => {
    if (!showExpiryBadge || !giftExpiresAt) return '';
    return typeof getRemainingExpiryTime === 'function' ? getRemainingExpiryTime(giftExpiresAt).text : '';
  });
  const [isExpired, setIsExpired] = useState<boolean>(() => {
    if (!showExpiryBadge || !giftExpiresAt) return false;
    return typeof getRemainingExpiryTime === 'function' ? getRemainingExpiryTime(giftExpiresAt).isExpired : false;
  });

  useEffect(() => {
    if (!showExpiryBadge || !giftExpiresAt || typeof getRemainingExpiryTime !== 'function') return;
    const updateExpiry = () => {
      const res = getRemainingExpiryTime(giftExpiresAt);
      setRemainingText(res.text);
      setIsExpired(res.isExpired);
    };
    updateExpiry();
    const interval = setInterval(updateExpiry, 30000);
    return () => clearInterval(interval);
  }, [showExpiryBadge, giftExpiresAt]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && g.dx < 0,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && g.dx < 0,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => false,
      onPanResponderGrant: () => {
        setScrollEnabled(false);
      },
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(Math.max(g.dx, -110));
          deleteOpacity.setValue(Math.min(Math.abs(g.dx) / SWIPE_THRESHOLD, 1));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD || g.vx < -0.5) {
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setScrollEnabled(true);
            onDelete();
          });
        } else {
          setScrollEnabled(true);
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
            Animated.timing(deleteOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        setScrollEnabled(true);
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        Animated.timing(deleteOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <View style={styles.cardContainer}>
      {/* Nền xóa phía sau */}
      <Animated.View style={[styles.deleteBg, { opacity: deleteOpacity }]}>
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.deleteText}>{t('delete') || 'Xóa'}</Text>
      </Animated.View>

      {/* Card nội dung trượt */}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={[styles.itemCard, !item.isRead && styles.itemCardUnread]}
          activeOpacity={0.88}
          onPress={onPress}
        >
          {/* Cột trái: Icon phân loại */}
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isDark ? '#1E1E1E' : item.iconBg || '#FAF7F2' },
            ]}
          >
            <Ionicons
              name={item.icon || 'notifications-outline'}
              size={20}
              color={isDark ? '#E8CCB2' : item.iconColor || '#9C7156'}
            />
          </View>

          {/* Cột giữa: Nội dung */}
          <View style={styles.cardBody}>
            <View style={styles.cardHeaderRow}>
              <Text
                style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.title}
              </Text>
              {!item.isRead && <View style={styles.unreadDot} />}
            </View>

            <Text style={styles.cardMessage} numberOfLines={2} ellipsizeMode="tail">
              {item.message}
            </Text>

            {/* HUY HIỆU THỜI GIAN HẾT HẠN CHO THÔNG BÁO TẶNG ĐIỂM GỐM (CHỈ HIỆN KHI CHƯA NHẬN ĐIỂM) */}
            {showExpiryBadge && (
              <View
                style={[
                  styles.giftExpiryBadge,
                  isExpired ? styles.giftBadgeExpired : styles.giftBadgePending,
                ]}
              >
                <Ionicons
                  name={isExpired ? 'time-outline' : 'hourglass-outline'}
                  size={12.5}
                  color={isExpired ? (isDark ? '#807A73' : '#9E968D') : '#9C7156'}
                />
                <Text
                  style={[
                    styles.giftExpiryText,
                    isExpired ? styles.giftTextExpired : styles.giftTextPending,
                  ]}
                >
                  {isExpired
                    ? 'Đã hết hạn 24h nhận điểm'
                    : `Hết hạn sau: ${remainingText}`}
                </Text>
              </View>
            )}

            <View style={styles.cardFooterRow}>
              <Text style={styles.cardTime}>{item.time}</Text>
              <View style={styles.cardActionRow}>
                <Text style={styles.cardActionText}>
                  {item.link && item.link.includes('gift-claim') && !isClaimed
                    ? 'Mở thiệp nhận điểm'
                    : isGift || isClaimed || isCanceled || (item.link && item.link.includes('type=gift'))
                    ? t('viewNotificationDetail') || 'Xem chi tiết thông báo'
                    : item.type === 'order'
                    ? t('viewOrder') || 'Xem đơn hàng'
                    : t('viewNotificationDetail') || 'Xem chi tiết'}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={isDark ? '#E8CCB2' : '#9C7156'}
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── ArticleFeedCard: Thẻ bài viết tin tức cao cấp phong cách Tiệm Nhà Gốm ─
function ArticleFeedCard({
  item,
  onPress,
  styles,
  isDark,
  t,
}: {
  item: UnifiedFeedItem;
  onPress: () => void;
  styles: any;
  isDark: boolean;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity
        style={[styles.itemCard, styles.articleCard, !item.isRead && styles.itemCardUnread]}
        activeOpacity={0.88}
        onPress={onPress}
      >
        {/* Ảnh đại diện bài viết */}
        {item.imageUrl ? (
          <View style={styles.articleThumbWrap}>
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.articleThumb}
              contentFit="cover"
              transition={200}
            />
            {!item.isRead && (
              <View style={styles.articleNewBadge}>
                <Text style={styles.articleNewBadgeText}>{t('newBadgeText') || 'Mới'}</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Nội dung bài viết */}
        <View style={styles.articleBody}>
          <View style={styles.articleTagRow}>
            <View style={styles.articleTagPill}>
              <Text style={styles.articleTagText}>{t('articleTag') || 'Tin tức & Gốm'}</Text>
            </View>
            {!item.isRead && !item.imageUrl && <View style={styles.unreadDot} />}
          </View>

          <Text
            style={[styles.articleTitle, !item.isRead && styles.cardTitleUnread]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>

          {item.message ? (
            <Text style={styles.articleExcerpt} numberOfLines={2} ellipsizeMode="tail">
              {item.message}
            </Text>
          ) : null}

          <View style={styles.cardFooterRow}>
            <Text style={styles.cardTime}>{item.time}</Text>
            <View style={styles.cardActionRow}>
              <Text style={styles.cardActionText}>{t('readArticle') || 'Đọc bài viết'}</Text>
              <Ionicons
                name="chevron-forward"
                size={12}
                color={isDark ? '#E8CCB2' : '#9C7156'}
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen: NotificationsScreen ──────────────────────────────────────
export default function NotificationsScreen({ isTab = false }: { isTab?: boolean } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { user } = useAuth();

  const {
    unreadCount,
    unreadNotifsCount,
    unreadNewsCount,
    readIds,
    markAsRead,
    markAllAsRead,
    refreshBadge,
  } = useNotificationBadge();

  const [feedItems, setFeedItems] = useState<UnifiedFeedItem[]>(() => getCachedNotificationFeed());
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [scrollY, setScrollY] = useState(0);

  // Tải đồng thời cả Tin tức bài viết và Thông báo từ Cache RAM hoặc Firestore
  const loadFeedData = useCallback(async () => {
    try {
      const items = await preloadNotificationFeed(user?.uid);
      setFeedItems(items);
      refreshBadge();
    } catch (e) {
      console.warn('Lỗi tải feed thông báo:', e);
    }
  }, [refreshBadge, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      loadFeedData();
    }, [loadFeedData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFeedData();
    setRefreshing(false);
  };

  const handlePressItem = async (item: UnifiedFeedItem) => {
    // Đánh dấu đã đọc ngay lập tức
    if (!item.isRead) {
      await markAsRead(item.id);
      setFeedItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, isRead: true } : it))
      );
    }

    const isClaimedGift =
      item.giftStatus === 'claimed' ||
      item.id.startsWith('claimed_') ||
      Boolean(item.title && (item.title.includes('đã nhận') || item.title.includes('da nhan')));
    const isCanceledGift =
      item.giftStatus === 'canceled' ||
      item.id.startsWith('rejected_') ||
      Boolean(item.title && (item.title.includes('từ chối') || item.title.includes('tu choi')));
    const isGiftNotif = item.isGift || Boolean(item.giftId) || isClaimedGift || isCanceledGift;

    // Nếu là thông báo quà tặng điểm cho người nhận chưa nhận
    if (item.link && item.link.includes('gift-claim') && !isClaimedGift) {
      router.push(item.link as any);
      return;
    }

    // Điều hướng theo loại bài viết
    if (item.kind === 'article') {
      router.push({
        pathname: '/article/[id]',
        params: { id: item.id },
      });
      return;
    }

    // Nếu có link trực tiếp hợp lệ (không phải fallback /orders của quà tặng)
    if (item.link && !item.link.startsWith('/notification-detail')) {
      if (item.link === '/orders' && isGiftNotif) {
        // Bỏ qua /orders khi đây là thông báo quà tặng điểm
      } else {
        router.push(item.link as any);
        return;
      }
    }

    const cleanGiftId =
      item.giftId ||
      (item.id.startsWith('claimed_')
        ? item.id.replace('claimed_', '')
        : item.id.startsWith('rejected_')
        ? item.id.replace('rejected_', '')
        : item.id.startsWith('gift_')
        ? item.id.replace('gift_', '')
        : '');

    router.push({
      pathname: '/notification-detail',
      params: {
        id: item.id,
        title: item.title,
        message: item.message,
        time: item.time,
        type: isGiftNotif ? 'gift' : item.type,
        imageUrl: item.imageUrl || '',
        link: item.link || '',
        giftId: cleanGiftId,
        giftStatus: item.giftStatus || (isClaimedGift ? 'claimed' : isCanceledGift ? 'canceled' : ''),
      },
    });
  };

  const handleDeleteItem = async (id: string) => {
    setFeedItems((prev) => prev.filter((it) => it.id !== id));
    try {
      // 1. Lưu vào danh sách ID đã xóa trong AsyncStorage để không bị tạo lại từ đơn hàng
      const delRaw = await AsyncStorage.getItem(DELETED_NOTIFS_KEY);
      let deletedList: string[] = [];
      if (delRaw) {
        try {
          const parsed = JSON.parse(delRaw);
          if (Array.isArray(parsed)) deletedList = parsed;
        } catch {}
      }
      if (!deletedList.includes(id)) {
        deletedList.push(id);
        await AsyncStorage.setItem(DELETED_NOTIFS_KEY, JSON.stringify(deletedList));
      }

      // 2. Nếu có trong Firestore cá nhân thì xóa thầm lặng
      if (id.startsWith('order_') && user && user.uid) {
        deleteDoc(doc(db, 'users', user.uid, 'notifications', id)).catch(() => {});
      }

      // 3. Nếu là thông báo cục bộ
      const rawLocal = await AsyncStorage.getItem(LOCAL_NOTIFS_KEY);
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter((it: any) => it.id !== id);
          await AsyncStorage.setItem(LOCAL_NOTIFS_KEY, JSON.stringify(updated));
        }
      }
    } catch {}
    refreshBadge();
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setFeedItems((prev) => prev.map((it) => ({ ...it, isRead: true })));
  };

  // Lọc theo tab đang chọn
  const filteredItems = feedItems.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'news') return item.kind === 'article';
    return item.kind === 'notification' && item.type === filter;
  });

  // Số lượng chưa đọc theo tab
  const getFilterBadgeCount = (tabId: FilterType): number => {
    if (tabId === 'all') return unreadCount;
    if (tabId === 'news') return unreadNewsCount;
    return feedItems.filter((it) => it.kind === 'notification' && it.type === tabId && !it.isRead).length;
  };

  // Tiêu đề & mô tả trạng thái rỗng tương ứng với từng tab
  const getEmptyStateContent = () => {
    switch (filter) {
      case 'news':
        return {
          icon: 'newspaper-outline' as const,
          title: t('emptyNewsTitle') || 'Chưa có bài viết mới',
          desc: t('emptyNewsDesc') || 'Các câu chuyện gốm sứ và tin tức tiệm sẽ được cập nhật liên tục tại đây.',
        };
      case 'promo':
        return {
          icon: 'pricetag-outline' as const,
          title: t('emptyPromoTitle') || 'Chưa có ưu đãi mới',
          desc: t('emptyPromoDesc') || 'Theo dõi thường xuyên để không bỏ lỡ các voucher giảm giá độc quyền nhé.',
        };
      case 'order':
        return {
          icon: 'cube-outline' as const,
          title: t('emptyOrderTitle') || 'Chưa có thông báo đơn hàng',
          desc: t('emptyOrderDesc') || 'Trạng thái vận chuyển và đóng gói đồ gốm sẽ hiển thị tại đây khi bạn đặt hàng.',
        };
      case 'system':
        return {
          icon: 'shield-checkmark-outline' as const,
          title: t('emptySystemTitle') || 'Hệ thống ổn định',
          desc: t('emptySystemDesc') || 'Chưa có thông báo nâng cấp hoặc kỹ thuật nào.',
        };
      default:
        return {
          icon: 'notifications-off-outline' as const,
          title: t('emptyNotificationsTitle') || 'Không có thông báo nào',
          desc: t('emptyNotificationsDesc') || 'Các thông báo về đơn hàng và ưu đãi sẽ xuất hiện tại đây.',
        };
    }
  };

  const emptyState = getEmptyStateContent();

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header chuẩn Tiệm Nhà Gốm với nút back tròn và gradient mờ dần */}
      <Header
        title={t('notifications') || 'Thông báo'}
        showSearch={false}
        showBack={!isTab}
        showCart={true}
        transparent={true}
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + (Platform.OS === 'android' ? 64 : 56),
            paddingBottom: isTab ? Math.max(insets.bottom, 20) + 110 : Math.max(insets.bottom, 16) + 40,
          },
        ]}
        scrollEnabled={scrollEnabled}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDark ? '#E8CCB2' : '#9C7156'}
            colors={[isDark ? '#E8CCB2' : '#9C7156']}
          />
        }
      >
        {/* Thanh trạng thái tổng & Nút "Đã đọc tất cả" */}
        <View style={styles.topActionsBar}>
          <View style={styles.unreadInfo}>
            {unreadCount > 0 ? (
              <View style={styles.unreadPill}>
                <Ionicons name="notifications-outline" size={13} color="#FFFFFF" />
                <Text style={styles.unreadPillText}>
                  {unreadCount} {t('newCount') || 'mới'}
                </Text>
              </View>
            ) : (
              <Text style={styles.allReadText}>
                {t('notifUnreadBadge')?.replace('{count}', '0') || 'Đã đọc hết'}
              </Text>
            )}
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={handleMarkAllRead}
              activeOpacity={0.8}
            >
              <Ionicons
                name="checkmark-done"
                size={16}
                color={isDark ? '#E8CCB2' : '#9C7156'}
              />
              <Text style={styles.markAllText}>
                {t('markAllAsReadAction') || 'Đã đọc tất cả'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Danh sách Tab Lọc Con Nhộng (Filter Pills) */}
        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {[
              { id: 'all', label: t('notifTabAll') || 'Tất cả' },
              { id: 'news', label: t('notifTabNews') || 'Tin tức & Bài viết' },
              { id: 'promo', label: t('notifTabPromo') || 'Khuyến mãi' },
              { id: 'order', label: t('notifTabOrder') || 'Đơn hàng' },
              { id: 'system', label: t('notifTabSystem') || 'Hệ thống' },
            ].map((tab) => {
              const isActive = filter === tab.id;
              const badgeCount = getFilterBadgeCount(tab.id as FilterType);

              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setFilter(tab.id as FilterType)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                  >
                    {tab.label}
                  </Text>
                  {badgeCount > 0 && (
                    <View
                      style={[
                        styles.chipBadge,
                        isActive ? styles.chipBadgeActive : styles.chipBadgeInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipBadgeText,
                          isActive ? styles.chipBadgeTextActive : styles.chipBadgeTextInactive,
                        ]}
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Danh sách hiển thị Card */}
        {filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name={emptyState.icon}
                size={34}
                color={isDark ? '#E8CCB2' : '#9C7156'}
              />
            </View>
            <Text style={styles.emptyTitle}>{emptyState.title}</Text>
            <Text style={styles.emptyDesc}>{emptyState.desc}</Text>
          </View>
        ) : (
          filteredItems.map((item) =>
            item.kind === 'article' ? (
              <ArticleFeedCard
                key={item.id}
                item={item}
                onPress={() => handlePressItem(item)}
                styles={styles}
                isDark={isDark}
                t={t}
              />
            ) : (
              <SwipeableNotificationCard
                key={item.id}
                item={item}
                onPress={() => handlePressItem(item)}
                onDelete={() => handleDeleteItem(item.id)}
                setScrollEnabled={setScrollEnabled}
                styles={styles}
                isDark={isDark}
                t={t}
              />
            )
          )
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles tuân thủ nghiêm ngặt GEMINI.md & Bộ quy chuẩn Tiệm Nhà Gốm ──────
const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 90,
    },

    // Top action bar
    topActionsBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    unreadInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    unreadPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#9C7156',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 16,
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.25,
      shadowRadius: 4,
      elevation: 2,
    },
    unreadPillText: {
      fontFamily: 'ElleGaborStd',
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    allReadText: {
      fontFamily: 'ElleGaborStd',
      color: isDark ? '#9E968D' : '#6E665D',
      fontSize: 13,
      fontWeight: '600',
    },
    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 4,
      elevation: isDark ? 0 : 1,
    },
    markAllText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },

    // Filter Chips
    filterWrap: {
      marginBottom: 14,
      marginHorizontal: -16,
    },
    filterScroll: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 22,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.03,
      shadowRadius: 3,
      elevation: isDark ? 0 : 1,
    },
    filterChipActive: {
      backgroundColor: isDark ? '#1E1E1E' : '#9C7156',
      borderWidth: 1.2,
      borderColor: '#9C7156',
    },
    filterChipText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#9E968D' : '#6E665D',
    },
    filterChipTextActive: {
      color: isDark ? '#E8CCB2' : '#FFFFFF',
      fontWeight: '700',
    },
    chipBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    chipBadgeActive: {
      backgroundColor: isDark ? '#9C7156' : '#FFFFFF',
    },
    chipBadgeInactive: {
      backgroundColor: isDark ? '#2C2C2C' : '#E8CCB2',
    },
    chipBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    chipBadgeTextActive: {
      color: isDark ? '#FFFFFF' : '#9C7156',
    },
    chipBadgeTextInactive: {
      color: isDark ? '#E8CCB2' : '#2B2928',
    },

    // Card Container & Shared styles
    cardContainer: {
      marginBottom: 12,
      overflow: 'visible',
    },
    itemCard: {
      flexDirection: 'row',
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#2B2928',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    itemCardUnread: {
      borderWidth: 1.2,
      borderColor: '#9C7156',
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    cardBody: {
      flex: 1,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    cardTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '600',
      color: isDark ? '#B0B0B0' : '#4A4643',
      flex: 1,
      marginRight: 6,
    },
    cardTitleUnread: {
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#9C7156',
      marginLeft: 4,
    },
    cardMessage: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#9E968D' : '#6E665D',
      lineHeight: 18,
      marginBottom: 8,
    },
    // Huy hiệu thời gian hết hạn quà tặng điểm gốm
    giftExpiryBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 3.5,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
    },
    giftBadgePending: {
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.16)' : '#FAF7F2',
      borderColor: isDark ? 'rgba(232, 204, 178, 0.25)' : '#E8CCB2',
    },
    giftBadgeExpired: {
      backgroundColor: isDark ? '#1C1C1C' : '#F5F5F4',
      borderColor: isDark ? '#333333' : '#E7E5E4',
    },
    giftBadgeClaimed: {
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.18)' : '#FAF7F2',
      borderColor: isDark ? '#9C7156' : '#9C7156',
    },
    giftBadgeCanceled: {
      backgroundColor: isDark ? '#1A1816' : '#F5F5F4',
      borderColor: isDark ? '#2E2B28' : '#E8E1D8',
    },
    giftExpiryText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '600',
    },
    giftTextPending: {
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    giftTextExpired: {
      color: isDark ? '#807A73' : '#9E968D',
    },
    giftTextClaimed: {
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    giftTextCanceled: {
      color: isDark ? '#807A73' : '#9E968D',
    },
    cardFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    cardTime: {
      fontSize: 11.5,
      color: isDark ? '#807A73' : '#9E968D',
      fontWeight: '500',
    },
    cardActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    cardActionText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },

    // Swipe Delete background
    deleteBg: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 80,
      backgroundColor: '#9C7156',
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    deleteText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
      fontFamily: 'ElleGaborStd',
    },

    // Article Specific Styling
    articleCard: {
      padding: 14,
    },
    articleThumbWrap: {
      width: 90,
      height: 90,
      borderRadius: 14,
      overflow: 'hidden',
      marginRight: 14,
      position: 'relative',
      backgroundColor: isDark ? '#1E1E1E' : '#F6F4EC',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    articleThumb: {
      width: '100%',
      height: '100%',
    },
    articleNewBadge: {
      position: 'absolute',
      top: 5,
      left: 5,
      backgroundColor: '#9C7156',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    articleNewBadgeText: {
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: '700',
      fontFamily: 'ElleGaborStd',
    },
    articleBody: {
      flex: 1,
      justifyContent: 'center',
    },
    articleTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    articleTagPill: {
      backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    articleTagText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    articleTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '600',
      color: isDark ? '#E0E0E0' : '#2B2928',
      lineHeight: 18,
      marginBottom: 4,
    },
    articleExcerpt: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11.5,
      color: isDark ? '#9E968D' : '#6E665D',
      lineHeight: 16,
      marginBottom: 6,
    },

    // Empty state
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF7F2',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      borderWidth: isDark ? 0 : 1.2,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9E968D' : '#6E665D',
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 280,
    },
  });
