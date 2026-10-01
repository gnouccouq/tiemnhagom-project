// app/(tabs)/notifications.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../src/components/Header';
import { Colors, Typography } from '../../src/constants/theme';

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
    link: '/(tabs)/orders',
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
    link: '/(tabs)/orders',
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

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handlePressItem = (item: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
    );
    if (item.link) {
      router.push(item.link as any);
    }
  };

  const filteredItems = notifications.filter((n) => {
    if (filter === 'all') return true;
    return n.type === filter;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <Header title="Thông báo" showSearch={false} />

      {/* Top Bar Actions */}
      <View style={styles.topActionsBar}>
        <View style={styles.unreadInfo}>
          <Text style={styles.topTitle}>Hộp thư thông báo</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} mới</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={handleMarkAllRead}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-done" size={15} color="#111111" />
            <Text style={styles.markAllText}>Đã đọc tất cả</Text>
          </TouchableOpacity>
        )}
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
            <TouchableOpacity
              key={item.id}
              style={[styles.itemCard, !item.isRead && styles.itemCardUnread]}
              activeOpacity={0.8}
              onPress={() => handlePressItem(item)}
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

                <Text style={styles.itemMessage} numberOfLines={2}>
                  {item.message}
                </Text>

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
    marginBottom: 10,
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
