import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  Platform,
  ActivityIndicator,
  Dimensions,
  Animated,
  RefreshControl,
  TextInput,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useThemeColor } from '../src/constants/theme';
import { useDialog } from '../src/context/DialogContext';
import { BlurButton } from '../src/components/BlurButton';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { SymbolView } from 'expo-symbols';
import { AnimatedCenterModal } from '../src/components/AnimatedCenterModal';
import { AnimatedBottomSheetModal } from '../src/components/AnimatedBottomSheetModal';
import { ScalePressable } from '../src/components/ScalePressable';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { Order } from '../src/types';
import { PointHistorySkeleton } from '../src/components/ShimmerSkeleton';
import { getUserOrders, getCachedUserOrders } from '../src/services/orderService';
import { getUserGiftHistory, claimGiftPoints } from '../src/services/giftPointsService';
import { formatCurrency } from '../src/utils/format';

interface PointTransaction {
  id: string;
  type: 'earn' | 'redeem'; // 'earn' = Tích, 'redeem' = Đổi
  points: number;
  date: string;
  dateTimestamp: number;
  orderCode: string;
  store: string;
  orderValue: string;
  badgeLabel?: string;
}

type FilterType = 'all' | 'earn' | 'redeem';
type DatePreset = 'last30Days' | 'thisMonth' | 'last3Months' | 'all';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper định dạng ngày ngắn DD/MM/YYYY
const formatDisplayDate = (d: Date): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Helper định dạng ngày trên nút bộ lọc DD/MM/YY
const formatFilterPillDate = (d: Date): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const yearShort = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${yearShort}`;
};

const formatVND = (num: number) => {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(num))}đ`;
};

// Helper chuyển danh sách Order thành danh sách PointTransaction và số liệu chi tiêu
const parseOrdersToPointData = (orders: Order[]) => {
  const list: PointTransaction[] = [];
  let accCompletedSpent = 0;
  let accPendingPoints = 0;

  orders.forEach((o: Order, idx: number) => {
    const code = (o.orderCode || o.id || '').toUpperCase();
    const isPos = code.includes('POS') || (o as any).source === 'pos' || (o as any).channel === 'pos' || (o as any).inStore;
    const status = (o.status || '').toLowerCase();
    const isCancelled = status.includes('hủy') || status.includes('cancel');
    const isDone =
      !isCancelled && (
        isPos ||
        status.includes('hoàn') ||
        status.includes('thành công') ||
        status.includes('completed') ||
        status.includes('đã giao') ||
        status.includes('đã nhận') ||
        status.includes('nhận') ||
        status.includes('đã thanh toán') ||
        status.includes('paid')
      );

    let dateObj = new Date();
    const rawDate = o.orderDate || (o as any).createdAt || (o as any).date;
    if (rawDate) {
      if (typeof (rawDate as any).toDate === 'function') {
        dateObj = (rawDate as any).toDate();
      } else if (rawDate instanceof Date) {
        dateObj = rawDate;
      } else if (typeof rawDate === 'object' && (rawDate as any).seconds) {
        dateObj = new Date((rawDate as any).seconds * 1000);
      } else if (typeof rawDate === 'number') {
        dateObj = new Date(rawDate);
      } else if (typeof rawDate === 'string') {
        const cleaned = rawDate.trim().replace(' ', 'T');
        const d = new Date(cleaned);
        dateObj = isNaN(d.getTime()) ? new Date(rawDate) : d;
      }
    }
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }

    const orderAmount = Number(o.totalAmount || 0);
    const pointsEarned = Math.floor(orderAmount / 10000);
    const orderCodeStr = o.orderCode || o.id || `2107012647664951${idx}`;
    const storeName = 'Tiệm Nhà Gốm - 37 Nguyễn Duy, Bình Thạnh';

    // Giao dịch tích điểm: CHỈ TÍCH KHI ĐƠN HÀNG ĐÃ HOÀN TẤT THÀNH CÔNG
    if (isDone && pointsEarned > 0) {
      accCompletedSpent += orderAmount;
      list.push({
        id: `earn_${o.id || idx}`,
        type: 'earn',
        points: pointsEarned,
        date: formatDisplayDate(dateObj),
        dateTimestamp: dateObj.getTime(),
        orderCode: orderCodeStr,
        store: storeName,
        orderValue: formatVND(orderAmount),
        badgeLabel: 'Tích điểm',
      });
    } else if (!isCancelled && !isDone && pointsEarned > 0) {
      accPendingPoints += pointsEarned;
    }

    // Giao dịch đổi điểm (nếu đơn có dùng điểm / mã giảm)
    let pointsRedeemed = 0;
    if ((o as any).pointsUsed && Number((o as any).pointsUsed) > 0) {
      pointsRedeemed = Number((o as any).pointsUsed);
    } else if (Number(o.discountAmount || 0) >= 10000 && !o.couponCode) {
      pointsRedeemed = Math.floor(Number(o.discountAmount) / 1000);
    }
    if (pointsRedeemed > 0 && !isCancelled) {
      list.push({
        id: `redeem_${o.id || idx}`,
        type: 'redeem',
        points: pointsRedeemed,
        date: formatDisplayDate(dateObj),
        dateTimestamp: dateObj.getTime(),
        orderCode: orderCodeStr,
        store: storeName,
        orderValue: formatVND(Number(o.discountAmount || pointsRedeemed * 1000)),
        badgeLabel: 'Đổi điểm',
      });
    }
  });

  list.sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  return { transactions: list, completedSpent: accCompletedSpent, pendingPoints: accPendingPoints };
};

const runAfterTransition = (callback: () => void) => {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(callback, { timeout: 150 });
    return {
      cancel: () => {
        if (typeof cancelIdleCallback === 'function') {
          cancelIdleCallback(handle);
        }
      },
    };
  }
  const timer = setTimeout(callback, 80);
  return { cancel: () => clearTimeout(timer) };
};

export default function PointsHistoryScreen() {
  const router = useRouter();

  // Cờ isReady: Giúp màn hình hiện NGAY LẬP TỨC 0ms kèm Skeleton Shimmer, triệt tiêu hoàn toàn delay khi bấm
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile, updateUserProfileData } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const [claimInputCode, setClaimInputCode] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [rulesModalVisible, setRulesModalVisible] = useState(false);
  const targetUid = userProfile?.uid || user?.uid;
  const initialCache = useMemo(() => {
    if (!isReady || !targetUid) return null;
    const cached = getCachedUserOrders(targetUid);
    if (cached && cached.length > 0) {
      return parseOrdersToPointData(cached);
    }
    return null;
  }, [isReady, targetUid]);

  const [loading, setLoading] = useState<boolean>(() => !initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<PointTransaction[]>(() => initialCache?.transactions || []);
  const [completedSpent, setCompletedSpent] = useState<number | null>(() => initialCache ? initialCache.completedSpent : null);
  const [pendingPoints, setPendingPoints] = useState<number>(() => initialCache?.pendingPoints || 0);
  const [ordersLoaded, setOrdersLoaded] = useState<boolean>(() => Boolean(initialCache));

  // Tính số điểm hiện tại của người dùng (10.000đ = 1 điểm, chỉ tích lũy khi đơn đã hoàn thành)
  const totalSpent = completedSpent !== null ? completedSpent : Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
  const earnedPoints = Math.floor(totalSpent / 10000);
  const rawProfilePoints = userProfile?.points !== undefined && userProfile?.points !== null ? Number(userProfile.points) : 0;
  const cleanProfilePoints = (rawProfilePoints === 50 && totalSpent < 500000) ? 0 : rawProfilePoints;

  // Tải danh sách đơn hàng thực tế của người dùng để sinh lịch sử điểm
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async (force: boolean = false) => {
      if (!targetUid) {
        setTransactions([]);
        setPendingPoints(0);
        setCompletedSpent(0);
        setOrdersLoaded(true);
        setLoading(false);
        return;
      }

      if (!initialCache && transactions.length === 0) {
        setLoading(true);
      }

      try {
        const [orders, gifts] = await Promise.all([
          getUserOrders(targetUid, userProfile?.phone, user?.email || userProfile?.email, force),
          getUserGiftHistory(targetUid).catch(() => ({ sent: [], received: [] })),
        ]);
        if (!isMounted) return;
        const parsed = parseOrdersToPointData(orders);
        const allTransactions = [...parsed.transactions];

        gifts.sent.forEach((g) => {
          allTransactions.push({
            id: `gift_sent_${g.id}`,
            type: 'redeem',
            points: g.points,
            date: formatDisplayDate(new Date(g.createdAt)),
            dateTimestamp: new Date(g.createdAt).getTime(),
            orderCode: g.code,
            store: `Tặng Điểm Gốm: ${g.themeTitle || 'Quà tặng'}${g.recipientPhone ? ` (${g.recipientPhone})` : ''}`,
            orderValue: formatVND(g.points * 1000),
            badgeLabel: 'Tặng điểm',
          });

          // Nếu quà đã hết hạn và hoàn lại điểm sau 24h
          if (g.status === 'refunded') {
            const refDate = g.refundedAt ? new Date(g.refundedAt) : new Date(new Date(g.createdAt).getTime() + 24 * 60 * 60 * 1000);
            allTransactions.push({
              id: `gift_refund_${g.id}`,
              type: 'earn',
              points: g.points,
              date: formatDisplayDate(refDate),
              dateTimestamp: refDate.getTime(),
              orderCode: g.code,
              store: `Hoàn điểm: Mã ${g.code} hết hạn 24h`,
              orderValue: formatVND(g.points * 1000),
              badgeLabel: 'Hoàn điểm',
            });
          }
        });

        gifts.received.forEach((g) => {
          allTransactions.push({
            id: `gift_recv_${g.id}`,
            type: 'earn',
            points: g.points,
            date: formatDisplayDate(new Date(g.claimedAt || g.createdAt)),
            dateTimestamp: new Date(g.claimedAt || g.createdAt).getTime(),
            orderCode: g.code,
            store: `Nhận Điểm Gốm từ: ${g.senderName || 'Bạn bè'}`,
            orderValue: formatVND(g.points * 1000),
            badgeLabel: 'Nhận điểm',
          });
        });

        allTransactions.sort((a, b) => b.dateTimestamp - a.dateTimestamp);
        setTransactions(allTransactions);
        setCompletedSpent(parsed.completedSpent);
        setPendingPoints(parsed.pendingPoints);
        setOrdersLoaded(true);
      } catch (err) {
        if (!isMounted) return;
        if (transactions.length === 0) {
          setTransactions([]);
        }
        setOrdersLoaded(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    let task: any = null;
    task = runAfterTransition(() => {
      fetchHistory();
    });
    return () => {
      isMounted = false;
      if (task && typeof task.cancel === 'function') task.cancel();
    };
  }, [targetUid, userProfile?.phone, user?.email]);

  const handlePasteClaimCode = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) {
        const match = text.match(/GIFT-[A-Z0-9]{6}/i);
        setClaimInputCode(match ? match[0].toUpperCase() : text.trim().toUpperCase());
      }
    } catch {}
  };

  const handleClaimGiftCode = async () => {
    const code = claimInputCode.trim().toUpperCase();
    if (!code) {
      dialog.alert('Nhận Điểm Gốm', 'Vui lòng nhập mã quà tặng.');
      return;
    }
    if (!user) {
      dialog.confirm(
        'Nhận Điểm Gốm',
        'Vui lòng đăng nhập để nhận điểm thưởng.',
        () => router.push('/auth/login'),
        'Đăng nhập',
        'Đóng'
      );
      return;
    }

    try {
      setIsClaiming(true);
      const res = await claimGiftPoints({
        code,
        recipientUid: targetUid || 'guest',
        recipientName: userProfile?.displayName || userProfile?.name || user?.displayName || 'Thành viên',
        recipientPhone: userProfile?.phone || '',
      });

      if (!res.success) {
        let msg = 'Mã quà tặng không hợp lệ hoặc không tồn tại.';
        if (res.error === 'already_claimed') msg = 'Mã quà tặng này đã được nhận trước đó.';
        if (res.error === 'cannot_claim_own') msg = 'Bạn không thể tự nhận mã quà tặng do chính mình tạo ra.';
        if (res.error === 'expired') msg = 'Mã quà tặng đã hết hạn 24 giờ và điểm đã được hoàn lại cho người gửi.';
        dialog.alert('Nhận Điểm Gốm', msg);
        return;
      }

      const pts = res.gift?.points || 0;
      const currentBonus = Number((userProfile as any)?.giftPointsBonus || 0);
      if (updateUserProfileData) {
        await updateUserProfileData({ giftPointsBonus: currentBonus + pts } as any);
      }
      setClaimInputCode('');
      dialog.alert('Nạp điểm thành công', `Bạn đã nhận được +${pts} Điểm Gốm từ ${res.gift?.senderName || 'Bạn bè'}!`);
      await onRefresh();
    } catch (err) {
      console.warn('Lỗi nhận điểm:', err);
      dialog.alert('Nhận Điểm Gốm', 'Có lỗi xảy ra khi nạp điểm. Vui lòng thử lại sau.');
    } finally {
      setIsClaiming(false);
    }
  };

  const onRefresh = async () => {
    if (!targetUid) return;
    setRefreshing(true);
    try {
      const [orders, gifts] = await Promise.all([
        getUserOrders(targetUid, userProfile?.phone, user?.email || userProfile?.email, true),
        getUserGiftHistory(targetUid).catch(() => ({ sent: [], received: [] })),
      ]);
      const parsed = parseOrdersToPointData(orders);
      const allTransactions = [...parsed.transactions];

      gifts.sent.forEach((g) => {
        allTransactions.push({
          id: `gift_sent_${g.id}`,
          type: 'redeem',
          points: g.points,
          date: formatDisplayDate(new Date(g.createdAt)),
          dateTimestamp: new Date(g.createdAt).getTime(),
          orderCode: g.code,
          store: `Tặng Điểm Gốm: ${g.themeTitle || 'Quà tặng'}${g.recipientPhone ? ` (${g.recipientPhone})` : ''}`,
          orderValue: formatVND(g.points * 1000),
          badgeLabel: 'Tặng điểm',
        });

        // Nếu quà đã hết hạn và hoàn lại điểm sau 24h
        if (g.status === 'refunded') {
          const refDate = g.refundedAt ? new Date(g.refundedAt) : new Date(new Date(g.createdAt).getTime() + 24 * 60 * 60 * 1000);
          allTransactions.push({
            id: `gift_refund_${g.id}`,
            type: 'earn',
            points: g.points,
            date: formatDisplayDate(refDate),
            dateTimestamp: refDate.getTime(),
            orderCode: g.code,
            store: `Hoàn điểm: Mã ${g.code} hết hạn 24h`,
            orderValue: formatVND(g.points * 1000),
            badgeLabel: 'Hoàn điểm',
          });
        }
      });

      gifts.received.forEach((g) => {
        allTransactions.push({
          id: `gift_recv_${g.id}`,
          type: 'earn',
          points: g.points,
          date: formatDisplayDate(new Date(g.claimedAt || g.createdAt)),
          dateTimestamp: new Date(g.claimedAt || g.createdAt).getTime(),
          orderCode: g.code,
          store: `Nhận Điểm Gốm từ: ${g.senderName || 'Bạn bè'}`,
          orderValue: formatVND(g.points * 1000),
          badgeLabel: 'Nhận điểm',
        });
      });

      allTransactions.sort((a, b) => b.dateTimestamp - a.dateTimestamp);
      setTransactions(allTransactions);
      setCompletedSpent(parsed.completedSpent);
      setPendingPoints(parsed.pendingPoints);
      setOrdersLoaded(true);
    } catch (e) {
      console.warn('Lỗi refresh points history:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Tính tổng điểm tích & điểm đã đổi từ danh sách giao dịch
  const totalEarnedInHistory = useMemo(() => {
    return transactions.filter((t) => t.type === 'earn').reduce((sum, t) => sum + t.points, 0);
  }, [transactions]);

  const totalRedeemedInHistory = useMemo(() => {
    return transactions.filter((t) => t.type === 'redeem').reduce((sum, t) => sum + t.points, 0);
  }, [transactions]);

  const availablePoints = useMemo(() => {
    if (!user) {
      return 0;
    }
    // Khi đã load danh sách đơn hàng, chỉ lấy điểm từ các đơn đã hoàn thành thành công
    const base = ordersLoaded
      ? totalEarnedInHistory
      : Math.max(earnedPoints, cleanProfilePoints, totalEarnedInHistory);
    return Math.max(0, base - totalRedeemedInHistory);
  }, [user, ordersLoaded, earnedPoints, cleanProfilePoints, totalEarnedInHistory, totalRedeemedInHistory]);

  // Tính toán khoảng ngày hiển thị trên nút Pill theo DatePreset
  const dateRangeDisplay = useMemo(() => {
    const now = new Date();
    const endDateStr = formatFilterPillDate(now);

    let startDate = new Date(now);
    if (datePreset === 'last30Days') {
      startDate.setDate(now.getDate() - 30);
    } else if (datePreset === 'thisMonth') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (datePreset === 'last3Months') {
      startDate.setMonth(now.getMonth() - 3);
    } else {
      // all
      return t('dateRangePresetAll') || 'Tất cả';
    }

    const startDateStr = formatFilterPillDate(startDate);
    return `${startDateStr} - ${endDateStr}`;
  }, [datePreset, t]);

  // Lọc danh sách giao dịch theo loại (Tích/Đổi) và theo thời gian
  const filteredList = useMemo(() => {
    if (!isReady) return [];
    const now = new Date();
    let minTimestamp = 0;

    if (datePreset === 'last30Days') {
      const d = new Date(now);
      d.setDate(now.getDate() - 30);
      minTimestamp = d.getTime();
    } else if (datePreset === 'thisMonth') {
      minTimestamp = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (datePreset === 'last3Months') {
      const d = new Date(now);
      d.setMonth(now.getMonth() - 3);
      minTimestamp = d.getTime();
    }

    return transactions.filter((item) => {
      // Lọc theo loại
      if (filterType !== 'all' && item.type !== filterType) {
        return false;
      }
      // Lọc theo ngày
      if (minTimestamp > 0 && item.dateTimestamp < minTimestamp) {
        return false;
      }
      return true;
    });
  }, [isReady, transactions, filterType, datePreset]);

  const toggleFilter = (type: 'earn' | 'redeem') => {
    if (filterType === type) {
      setFilterType('all'); // Bỏ chọn để xem tất cả
    } else {
      setFilterType(type);
    }
  };

  const [scrollY, setScrollY] = useState(0);
  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));
  const { pageStyle } = usePageAnimation();

  return (
    <Animated.View style={[styles.container, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Thanh điều hướng gốc iOS UINavigationBar chuẩn Liquid Glass */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitle: () => (
            <Text style={styles.navHeaderTitle}>
              {t('pointsHistoryTitle') || 'Lịch sử Điểm'}
            </Text>
          ),
          headerTintColor: '#9C7156',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setRulesModalVisible(true)}
              style={styles.headerRightBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t('pointsRulesInfo') || 'Quy tắc tích điểm'}
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={Colors.textPrimary}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <FadingHeaderBackdrop />

      <View style={[styles.headerSafeArea, { paddingTop: Platform.OS === 'ios' ? insets.top + 46 : insets.top + 54 }]}>

        {/* BỘ LỌC PILLS (TÍCH / ĐỔI / KHOẢNG NGÀY) */}
        <View style={styles.filtersBar}>
          {/* NÚT LỌC "TÍCH" */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              filterType === 'earn' && styles.filterPillActive,
            ]}
            activeOpacity={0.75}
            onPress={() => toggleFilter('earn')}
          >
            <Text
              style={[
                styles.filterPillText,
                filterType === 'earn' && styles.filterPillTextActive,
              ]}
            >
              {t('filterEarn') || 'Tích'}
            </Text>
          </TouchableOpacity>

          {/* NÚT LỌC "ĐỔI" */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              filterType === 'redeem' && styles.filterPillActive,
            ]}
            activeOpacity={0.75}
            onPress={() => toggleFilter('redeem')}
          >
            <Text
              style={[
                styles.filterPillText,
                filterType === 'redeem' && styles.filterPillTextActive,
              ]}
            >
              {t('filterRedeem') || 'Đổi'}
            </Text>
          </TouchableOpacity>

          {/* NÚT LỌC KHOẢNG NGÀY + ICON LỊCH */}
          <TouchableOpacity
            style={styles.datePill}
            activeOpacity={0.75}
            onPress={() => setDateModalVisible(true)}
          >
            <Text style={styles.datePillText}>{dateRangeDisplay}</Text>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={isDark ? '#9CA3AF' : '#6B7280'}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* DANH SÁCH CÁC THẺ GIAO DỊCH ĐIỂM (CARD LAYOUT CHUẨN XÁC THEO ẢNH) */}
      <ScrollView
        style={styles.contentScrollView}
        contentContainerStyle={[styles.scrollContentContainer, { paddingTop: insets.top + 105 }]}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#E8CCB2' : '#9C7156'}
            colors={['#9C7156']}
          />
        }
      >
        {/* THẺ ĐIỂM ĐANG CHỜ TÍCH LŨY (KHI CÓ ĐƠN HÀNG ĐANG XỬ LÝ / ĐANG VẬN CHUYỂN) */}
        {!loading && pendingPoints > 0 && filterType !== 'redeem' && (
          <View style={styles.pendingPointsCard}>
            <View style={styles.pendingPointsHeader}>
              <View style={styles.pendingIconBox}>
                <Ionicons name="time-outline" size={16} color="#9C7156" />
              </View>
              <Text style={styles.pendingPointsTitle}>
                {t('pendingPointsTitle') || 'Điểm đang chờ tích lũy'}
              </Text>
              <Text style={styles.pendingPointsBadge}>
                +{pendingPoints} {t('points') || 'điểm'}
              </Text>
            </View>
            <Text style={styles.pendingPointsDesc}>
              {t('pendingPointsNotice', { points: pendingPoints }) ||
                `Bạn có ${pendingPoints} Điểm gốm sẽ được cộng ngay sau khi đơn hàng được giao và hoàn tất thành công.`}
            </Text>
          </View>
        )}

        {/* THẺ NHẬP MÃ QUÀ TẶNG / NHẬN ĐIỂM GỐM */}
        <View style={styles.claimGiftCard}>
          <View style={styles.claimGiftHeader}>
            <View style={styles.claimGiftIconWrap}>
              <Ionicons name="gift" size={16} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.claimGiftTitle}>Nhận Điểm Gốm từ bạn bè</Text>
              <Text style={styles.claimGiftSubtitle}>Nhập mã GIFT-XXXXXX để nạp điểm</Text>
            </View>
          </View>
          <View style={styles.claimInputRow}>
            <TextInput
              style={styles.claimTextInput}
              placeholder="Nhập mã GIFT-XXXXXX..."
              placeholderTextColor={isDark ? '#888888' : '#A0988F'}
              value={claimInputCode}
              onChangeText={(txt) => setClaimInputCode(txt.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.pasteIconBtn}
              activeOpacity={0.7}
              onPress={handlePasteClaimCode}
            >
              <Ionicons name="clipboard-outline" size={16} color={isDark ? '#E8CCB2' : '#9C7156'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.claimSubmitBtn,
                (!claimInputCode.trim() || isClaiming) && styles.claimSubmitBtnDisabled,
              ]}
              disabled={!claimInputCode.trim() || isClaiming}
              onPress={handleClaimGiftCode}
              activeOpacity={0.85}
            >
              <Text style={styles.claimSubmitBtnText}>
                {isClaiming ? '...' : 'Nhận điểm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isReady || (loading && transactions.length === 0) ? (
          <View style={{ paddingTop: 8 }}>
            <PointHistorySkeleton isDark={isDark} />
            <PointHistorySkeleton isDark={isDark} />
            <PointHistorySkeleton isDark={isDark} />
            <PointHistorySkeleton isDark={isDark} />
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="receipt-outline"
              size={56}
              color={isDark ? '#4B5563' : '#D1D5DB'}
              style={{ marginBottom: 14 }}
            />
            <Text style={styles.emptyTitle}>
              {t('emptyPointsHistory') || 'Chưa có lịch sử giao dịch điểm'}
            </Text>
            <Text style={styles.emptyDesc}>
              {t('emptyPointsHistoryDesc') ||
                'Mỗi đơn hàng thanh toán thành công từ 10.000đ sẽ tích ngay 1 Điểm Gốm.'}
            </Text>
          </View>
        ) : (
          filteredList.map((item) => {
            const isEarn = item.type === 'earn';

            return (
              <View key={item.id} style={styles.transactionCard}>
                {/* DÒNG TIÊU ĐỀ: LOẠI (TÍCH / ĐỔI / TẶNG / NHẬN / HOÀN ĐIỂM) & SỐ ĐIỂM (+/- X ĐIỂM) */}
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTypeTitle}>
                    {item.badgeLabel || (isEarn ? (t('filterEarn') || 'Tích') : (t('filterRedeem') || 'Đổi'))}
                  </Text>
                  <Text
                    style={[
                      styles.cardPointsValue,
                      isEarn ? styles.pointsEarnText : styles.pointsRedeemText,
                    ]}
                  >
                    {isEarn ? `+${item.points} Điểm` : `-${item.points} Điểm`}
                  </Text>
                </View>

                {/* DÒNG 1: NGÀY GIAO DỊCH */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('transactionDate') || 'Ngày giao dịch'}
                  </Text>
                  <Text style={styles.cardInfoValue}>{item.date}</Text>
                </View>

                {/* DÒNG 2: MÃ ĐƠN HÀNG */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('orderCode') || 'Mã đơn hàng'}
                  </Text>
                  <Text style={styles.cardInfoValue} numberOfLines={1}>
                    {item.orderCode}
                  </Text>
                </View>

                {/* DÒNG 3: CỬA HÀNG */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('storeLabel') || 'Cửa hàng'}
                  </Text>
                  <Text style={styles.cardInfoValue} numberOfLines={1}>
                    {item.store}
                  </Text>
                </View>

                {/* DÒNG 4: GIÁ TRỊ ĐƠN HÀNG (MÀU ĐỎ/NÂU NỔI BẬT GIỐNG ẢNH MẪU) */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('orderValue') || 'Giá trị đơn hàng'}
                  </Text>
                  <Text style={styles.cardOrderValueHighlight}>
                    {item.orderValue}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: CHỌN KHOẢNG THỜI GIAN LỌC (DATE RANGE PICKER PRESETS)             */}
      {/* ========================================================================= */}
      <AnimatedCenterModal
        visible={dateModalVisible}
        onClose={() => setDateModalVisible(false)}
        contentStyle={styles.dateModalCard}
      >
        <View style={styles.modalTopHeader}>
          <Text style={styles.modalTitleText}>
            {t('selectDateRange') || 'Chọn khoảng thời gian'}
          </Text>
          <ScalePressable
            onPress={() => setDateModalVisible(false)}
            style={styles.modalCloseIconBtn}
            activeScale={0.9}
          >
            <Ionicons
              name="close"
              size={20}
              color={isDark ? '#9CA3AF' : '#6B7280'}
            />
          </ScalePressable>
        </View>

        <View style={styles.presetOptionsList}>
          {[
            {
              id: 'last30Days',
              label: t('dateRangePresetLast30Days') || '30 ngày qua',
            },
            {
              id: 'thisMonth',
              label: t('dateRangePresetThisMonth') || 'Tháng này',
            },
            {
              id: 'last3Months',
              label: t('dateRangePresetLast3Months') || '3 tháng qua',
            },
            {
              id: 'all',
              label: t('dateRangePresetAll') || 'Tất cả thời gian',
            },
          ].map((opt) => {
            const isSelected = datePreset === opt.id;
            return (
              <ScalePressable
                key={opt.id}
                style={[
                  styles.presetItem,
                  isSelected && styles.presetItemActive,
                ]}
                activeScale={0.96}
                onPress={() => {
                  setDatePreset(opt.id as DatePreset);
                  setDateModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.presetItemLabel,
                    isSelected && styles.presetItemLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B'}
                  />
                )}
              </ScalePressable>
            );
          })}
        </View>
      </AnimatedCenterModal>

      {/* ========================================================================= */}
      {/* MODAL 2: QUY TẮC TÍCH VÀ ĐỔI ĐIỂM (INFO RULES MODAL)                       */}
      {/* ========================================================================= */}
      <AnimatedBottomSheetModal
        visible={rulesModalVisible}
        onClose={() => setRulesModalVisible(false)}
        contentStyle={styles.rulesSheetModal}
      >
        <View style={styles.modalTopHeader}>
          <View style={styles.rulesTitleRow}>
            <Ionicons name="flame" size={20} color="#E5B869" style={{ marginRight: 6 }} />
            <Text style={styles.modalTitleText}>
              {t('potteryPointsModalTitle') || 'Điểm Thưởng Gốm'}
            </Text>
          </View>
          <ScalePressable
            onPress={() => setRulesModalVisible(false)}
            style={styles.modalCloseIconBtn}
            activeScale={0.9}
          >
            <Ionicons
              name="close"
              size={20}
              color={isDark ? '#9CA3AF' : '#6B7280'}
            />
          </ScalePressable>
        </View>

        <View style={styles.rulesSheetBody}>
          <View style={styles.pointsHighlightBox}>
            <Text style={styles.pointsBigNumber}>{availablePoints}</Text>
            <Text style={styles.pointsUnitLabel}>
              {t('availablePointsLabel') || 'Điểm hiện có'}
            </Text>
            <Text style={styles.pointsEquivText}>
              {t('pointsDiscountEquivText')} {formatCurrency(availablePoints * 1000)} {t('pointsDiscountEquivSuffix')}
            </Text>
          </View>

          <View style={styles.pointsRulesList}>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={18} color="#9C7156" />
              <Text style={styles.ruleText}>
                {t('pointRuleText1') ||
                  'Mỗi 10.000đ thanh toán hoàn tất tích ngay 1 Điểm Gốm.'}
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={18} color="#9C7156" />
              <Text style={styles.ruleText}>
                {t('pointRuleText2') ||
                  'Điểm có thể dùng để khấu trừ trực tiếp khi thanh toán đơn hàng tiếp theo.'}
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={18} color="#9C7156" />
              <Text style={styles.ruleText}>
                {t('pointRuleText3') ||
                  'Điểm không hết hạn theo năm và được bảo lưu trọn đời tài khoản.'}
              </Text>
            </View>
          </View>
        </View>
      </AnimatedBottomSheetModal>
    </Animated.View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? (Colors.background || '#121212') : '#FAF8F5',
    },
    headerSafeArea: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      backgroundColor: 'transparent',
      elevation: 0,
      shadowOpacity: 0,
    },
    navHeaderTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: Colors.textPrimary,
      letterSpacing: 0.3,
    },
    headerRightBtn: {
      padding: 6,
      marginRight: Platform.OS === 'ios' ? 0 : 4,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827'),
      letterSpacing: 0.2,
      flex: 1,
    },
    roundHeaderBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Filters Bar
    filtersBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 10,
    },
    filterPill: {
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 22,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#D1D5DB',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFFFF',
    },
    filterPillActive: {
      borderWidth: 1.2,
      borderColor: '#9C7156',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : 'rgba(156, 113, 86, 0.1)',
    },
    filterPillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? Colors.textMuted : '#4B5563',
    },
    filterPillTextActive: {
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    datePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 22,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#D1D5DB',
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FFFFFF',
      marginLeft: 'auto',
    },
    datePillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '500',
      color: isDark ? Colors.textPrimary : '#374151',
    },

    // Content ScrollView
    contentScrollView: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    },

    // Pending Points Card
    pendingPointsCard: {
      backgroundColor: isDark ? (Colors.surface || '#1E1E1E') : '#FAF8F5',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8CCB2',
    },
    pendingPointsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    pendingIconBox: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? '#2A2521' : 'rgba(156, 113, 86, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    pendingPointsTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#2B2928'),
      flex: 1,
    },
    pendingPointsBadge: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    pendingPointsDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      lineHeight: 19,
      color: isDark ? Colors.textMuted : '#6E665D',
    },

    // Claim Gift Points Card (Nhận Điểm Gốm từ bạn bè)
    claimGiftCard: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
      borderWidth: isDark ? 0 : 1.2,
      borderColor: isDark ? 'transparent' : '#F0ECE6',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.035,
      shadowRadius: 6,
      elevation: isDark ? 0 : 1,
    },
    claimGiftHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    claimGiftIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
    },
    claimGiftTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#2B2928'),
    },
    claimGiftSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: isDark ? Colors.textMuted : '#8C7A70',
      marginTop: 2,
    },
    claimInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    claimTextInput: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#141414' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8E1D8',
      paddingHorizontal: 14,
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
      letterSpacing: 0.5,
    },
    pasteIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(232, 204, 178, 0.12)' : 'rgba(156, 113, 86, 0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    claimSubmitBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 22,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
    },
    claimSubmitBtnDisabled: {
      opacity: 0.45,
    },
    claimSubmitBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Transaction Card
    transactionCard: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 16,
      marginBottom: 14,
      borderWidth: isDark ? 0 : 1.2,
      borderColor: isDark ? 'transparent' : '#F0ECE6',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.035,
      shadowRadius: 6,
      elevation: isDark ? 0 : 1,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    cardTypeTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '800',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827'),
    },
    cardPointsValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    pointsEarnText: {
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    pointsRedeemText: {
      color: '#EF5350',
    },
    cardInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 4,
    },
    cardInfoLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: isDark ? Colors.textMuted : '#6B7280',
      width: 124,
      lineHeight: 20,
    },
    cardInfoValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textPrimary || (isDark ? '#E5E7EB' : '#1F2937'),
      flex: 1,
      lineHeight: 20,
      fontWeight: '500',
    },
    cardOrderValueHighlight: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
      flex: 1,
      lineHeight: 20,
    },

    // Empty state & loading
    loadingBox: {
      paddingVertical: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 30,
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#1F2937'),
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? Colors.textMuted : '#6B7280',
      textAlign: 'center',
      lineHeight: 20,
    },

    // Modal 1: Date Range Picker
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    dateModalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderRadius: 22,
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E5E7EB',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0 : 0.25,
      shadowRadius: 16,
      elevation: isDark ? 0 : 6,
    },
    modalTopHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? (Colors.divider || '#2A2A2A') : '#E5E7EB',
    },
    modalTitleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827'),
    },
    modalCloseIconBtn: {
      padding: 4,
    },
    presetOptionsList: {
      marginTop: 10,
      gap: 6,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    presetItemActive: {
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : 'rgba(156, 113, 86, 0.1)',
    },
    presetItemLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      color: Colors.textPrimary || (isDark ? '#E5E7EB' : '#1F2937'),
      fontWeight: '500',
    },
    presetItemLabelActive: {
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },

    // Modal 2: Rules Sheet
    modalOverlayBottom: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'flex-end',
    },
    rulesSheetModal: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: Platform.OS === 'ios' ? 44 : 28,
      borderTopWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#F0ECE6',
    },
    rulesTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rulesSheetBody: {
      paddingTop: 16,
    },
    pointsHighlightBox: {
      alignItems: 'center',
      paddingVertical: 18,
      borderRadius: 18,
      backgroundColor: isDark ? (Colors.surface || '#2C2C2C') : '#FAF8F5',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#F0ECE6',
      marginBottom: 16,
    },
    pointsBigNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 42,
      fontWeight: '800',
      color: isDark ? '#E8CCB2' : '#9C7156',
      lineHeight: 48,
    },
    pointsUnitLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? Colors.textMuted : '#6B7280',
      marginTop: 2,
    },
    pointsEquivText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#D4D4D8' : '#4B5563',
      marginTop: 8,
      fontWeight: '500',
    },
    pointsRulesList: {
      gap: 10,
    },
    ruleItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    ruleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? Colors.textSecondary : '#4B5563',
      lineHeight: 19,
      flex: 1,
    },
  });
