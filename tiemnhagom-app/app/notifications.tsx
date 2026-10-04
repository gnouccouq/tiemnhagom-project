// app/(tabs)/notifications.tsx
import React, { useState, useRef, useCallback } from 'react';
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
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;
if (!(isExpoGo && Platform.OS === 'android')) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.log('Failed to load expo-notifications', e);
  }
}

import { Ionicons } from '@expo/vector-icons';
import { db } from '../src/config/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { Header } from '../src/components/Header';
import { Colors, Typography } from '../src/constants/theme';
import { useNotificationBadge } from '../src/context/NotificationBadgeContext';

interface NotificationItem {
  id: string;
  type: 'promo' | 'order' | 'system';
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  link?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    type: 'promo',
    title: 'Ưu đãi độc quyền: Giảm 15% Bộ Trà Gốm',
    message: 'Duy nhất tuần này! Nhập mã TIEMGOM10 để nhận thêm ưu đãi khi thanh toán.',
    time: '10 phút trước',
    isRead: false,
    link: '/(tabs)/deals',
    icon: 'pricetag',
    iconBg: '#F3E5DC',
    iconColor: '#C86432',
  },
  {
    id: '2',
    type: 'order',
    title: 'Đơn hàng #TNG9201 đang được giao',
    message: 'Kiện hàng đồ gốm của bạn đã được đóng gói bọc xốp cẩn thận và đang trên đường vận chuyển.',
    time: '2 giờ trước',
    isRead: false,
    link: '/orders',
    icon: 'cube',
    iconBg: '#EEF3EB',
    iconColor: '#3B4D45',
  },
  {
    id: '3',
    type: 'system',
    title: 'Đặc quyền thành viên Gốm Men',
    message: 'Chúc mừng bạn đã đạt tích lũy thành viên! Nhận ngay chiết khấu 3% cho mọi đơn hàng tiếp theo.',
    time: '1 ngày trước',
    isRead: true,
    link: '/(tabs)/profile',
    icon: 'ribbon',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
  },
  {
    id: '4',
    type: 'promo',
    title: 'Bộ sưu tập mới: Gốm Men Hỏa Biến',
    message: 'Hàng trăm sản phẩm chén dĩa men hỏa biến độc bản vừa được cập nhật tại cửa hàng.',
    time: '2 ngày trước',
    isRead: true,
    link: '/(tabs)/products',
    icon: 'sparkles',
    iconBg: '#F3E5DC',
    iconColor: '#C86432',
  },
  {
    id: '5',
    type: 'order',
    title: 'Đơn hàng #TNG8840 hoàn tất',
    message: 'Cảm ơn bạn đã tin tưởng Tiệm Nhà Gốm. Hãy để lại đánh giá trải nghiệm của bạn nhé.',
    time: '4 ngày trước',
    isRead: true,
    link: '/orders',
    icon: 'checkmark-circle',
    iconBg: '#E8F5E9',
    iconColor: '#2E7D32',
  },
  {
    id: '6',
    type: 'system',
    title: 'Cập nhật hệ thống & Thẻ thành viên',
    message: 'Hệ thống vừa nâng cấp tính năng hiển thị mã QR thành viên giúp tích điểm nhanh chóng tại quầy.',
    time: '1 tuần trước',
    isRead: true,
    link: '/(tabs)/profile',
    icon: 'shield-checkmark',
    iconBg: '#F1F5F9',
    iconColor: '#475569',
  },
];

type FilterType = 'all' | 'promo' | 'order' | 'system';

// Key lưu trạng thái đã đọc riêng (không bị ghi đè khi load từ Firebase)
const READ_IDS_KEY = '@tiemnhagom_read_ids';

// ─── SwipeableNotifItem: vuốt trái để xóa ──────────────────────────────────
function SwipeableNotifItem({
  item,
  onPress,
  onDelete,
  setScrollEnabled,
}: {
  item: NotificationItem;
  onPress: () => void;
  onDelete: () => void;
  setScrollEnabled: (v: boolean) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const deleteOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 15 && g.dx < 0,
      onPanResponderGrant: () => {
        setScrollEnabled(false); // khóa scroll dọc khi bắt đầu vuốt ngang
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
          }).start(() => { setScrollEnabled(true); onDelete(); });
        } else {
          setScrollEnabled(true); // mở lại scroll khi bounce về
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
            Animated.timing(deleteOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: (_) => {
        setScrollEnabled(true); // mở lại scroll nếu gesture bị hủy
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        Animated.timing(deleteOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <View style={{ marginBottom: 10, overflow: 'visible' }}>
      {/* Nền đỏ xóa — phía sau card */}
      <Animated.View style={[swipeStyles.deleteBg, { opacity: deleteOpacity }]}>
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={swipeStyles.deleteText}>Xóa</Text>
      </Animated.View>

      {/* Card chính trượt sang trái */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.itemCard, !item.isRead && styles.itemCardUnread]}
          activeOpacity={0.85}
          onPress={onPress}
        >
          <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
            <Ionicons name={item.icon} size={20} color={item.iconColor} />
          </View>
          <View style={styles.itemBody}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]} numberOfLines={1}>
                {item.title}
              </Text>
              {!item.isRead && <View style={styles.dotUnread} />}
            </View>
            <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
            <View style={styles.itemFooter}>
              <Text style={styles.itemTime}>{item.time}</Text>
              {item.link && (
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>Xem chi tiết</Text>
                  <Ionicons name="chevron-forward" size={12} color="#111111" />
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  deleteBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#E53935',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
// ──────────────────────────────────────────────────────────────────────────────


export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const { setUnreadCount } = useNotificationBadge();

  // Lấy danh sách ID đã đọc từ AsyncStorage
  const getReadIds = async (): Promise<Set<string>> => {
    try {
      const raw = await AsyncStorage.getItem(READ_IDS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  };

  // Lưu ID đã đọc vào AsyncStorage
  const saveReadIds = async (ids: Set<string>) => {
    try {
      await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
    } catch {}
  };

  // Lấy dữ liệu thông báo thật từ bộ nhớ cục bộ VÀ từ Firebase In-App
  const loadNotifications = async () => {
    try {
      // 1. Tải danh sách ID đã đọc (lưu riêng, không bị mất khi reload)
      const readIds = await getReadIds();

      // 2. Tải thông báo đẩy (Push) đã lưu cục bộ
      const saved = await AsyncStorage.getItem('@tiemnhagom_notifications');
      let localNotis: NotificationItem[] = saved ? JSON.parse(saved) : [];

      // 3. Tải thông báo In-App từ Firebase (Dashboard gửi xuống)
      const q = query(collection(db, 'global_notifications'), orderBy('createdAt', 'desc'), limit(15));
      const snapshot = await getDocs(q);

      const firestoreNotis: NotificationItem[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || 'promo',
          title: data.title || 'Thông báo',
          message: data.body || '',
          time: 'Mới',
          isRead: readIds.has(doc.id),  // ← áp dụng trạng thái đã đọc đã lưu
          icon: 'sparkles',
          iconBg: '#F3E5DC',
          iconColor: '#C86432',
        };
      });

      // 4. Gộp cả 2 nguồn, loại trùng
      const merged = [...firestoreNotis, ...localNotis].filter(
        (value, index, self) =>
          index === self.findIndex(t => t.title === value.title && t.message === value.message)
      );

      setNotifications(merged);
      // Cập nhật badge cho tab bar
      setUnreadCount(merged.filter(n => !n.isRead).length);
    } catch (e) {
      console.log('Lỗi tải thông báo', e);
    }
  };

  const saveNotifications = async (newData: NotificationItem[]) => {
    setNotifications(newData);
    setUnreadCount(newData.filter(n => !n.isRead).length);
    try {
      // Lưu push notifications cục bộ
      const localOnly = newData.filter(n => !n.id.startsWith('-') && n.id.length < 20);
      await AsyncStorage.setItem('@tiemnhagom_notifications', JSON.stringify(localOnly));
      // Lưu riêng danh sách ID đã đọc (bao gồm cả Firestore ID)
      const readIds = new Set(newData.filter(n => n.isRead).map(n => n.id));
      await saveReadIds(readIds);
    } catch (e) {
      console.log('Lỗi lưu thông báo', e);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadNotifications();
    }, [])
  );

  // Lắng nghe thông báo tới khi đang mở tab này
  React.useEffect(() => {
    if (!Notifications) return;

    const subscription = Notifications.addNotificationReceivedListener((notification: any) => {
      const title = notification.request.content.title || 'Thông báo mới';
      const body = notification.request.content.body || '';

      const newNoti: NotificationItem = {
        id: Date.now().toString(),
        type: 'promo',
        title: title,
        message: body,
        time: 'Vừa xong',
        isRead: false,
        icon: 'notifications',
        iconBg: '#F3E5DC',
        iconColor: '#C86432',
      };

      setNotifications(prev => {
        const updated = [newNoti, ...prev];
        AsyncStorage.setItem('@tiemnhagom_notifications', JSON.stringify(updated));
        setUnreadCount(updated.filter(n => !n.isRead).length);
        return updated;
      });
    });

    return () => subscription.remove();
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;


  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const simulatePush = () => {
    const newNoti: NotificationItem = {
      id: Date.now().toString(),
      type: 'promo',
      title: 'Tiệm Nhà Gốm Sale 50%!',
      message: 'Đừng bỏ lỡ bộ sưu tập lọ lộc bình vừa cập bến. Vào app mua ngay!',
      time: 'Vừa xong',
      isRead: false,
      icon: 'sparkles',
      iconBg: '#F3E5DC',
      iconColor: '#C86432',
    };
    
    setNotifications(prev => {
      const updated = [newNoti, ...prev];
      AsyncStorage.setItem('@tiemnhagom_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const handleMarkAllRead = () => {
    const updated = notifications.map((n) => ({ ...n, isRead: true }));
    saveNotifications(updated);
  };

  const handlePressItem = (item: NotificationItem) => {
    const updated = notifications.map((n) => (n.id === item.id ? { ...n, isRead: true } : n));
    saveNotifications(updated);
    if (item.link) {
      router.push(item.link as any);
    }
  };

  const handleDeleteItem = (id: string) => {
    const updated = notifications.filter((n) => n.id !== id);
    saveNotifications(updated);
  };

  const filteredItems = notifications.filter((n) => {
    if (filter === 'all') return true;
    return n.type === filter;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <Header title="Thông báo" showSearch={false} showBack={true} showCart={false} />

      {/* Top Bar Actions */}
      <View style={styles.topActionsBar}>
        <View style={styles.unreadInfo}>
          {/* Bỏ chữ Hộp thư thông báo */}
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} mới</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done" size={15} color="#111111" />
              <Text style={styles.markAllText}>Đã đọc</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'promo', label: 'Khuyến mãi' },
            { id: 'order', label: 'Đơn hàng' },
            { id: 'system', label: 'Hệ thống' },
          ].map((f) => {
            const isActive = filter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(f.id as FilterType)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Notification List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        scrollEnabled={scrollEnabled}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#000000"
            colors={['#000000']}
          />
        }
      >
        {filteredItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="notifications-off-outline" size={32} color="#8E8E93" />
            </View>
            <Text style={styles.emptyTitle}>Không có thông báo nào</Text>
            <Text style={styles.emptyDesc}>Các thông báo về đơn hàng và ưu đãi sẽ xuất hiện tại đây.</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <SwipeableNotifItem
              key={item.id}
              item={item}
              onPress={() => handlePressItem(item)}
              onDelete={() => handleDeleteItem(item.id)}
              setScrollEnabled={setScrollEnabled}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  topActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  unreadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  unreadBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  unreadBadgeText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  markAllText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '600',
    color: '#111111',
  },
  filterWrap: {
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  filterChipActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 80,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  itemCardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: '#000000',
    borderWidth: 1.2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemBody: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
    flex: 1,
  },
  itemTitleUnread: {
    fontWeight: '700',
    color: '#000000',
  },
  dotUnread: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E53935',
    marginLeft: 6,
  },
  itemMessage: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#666666',
    lineHeight: 18,
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTime: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#999999',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  linkText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '600',
    color: '#111111',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0ECE6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 4,
  },
  emptyDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
