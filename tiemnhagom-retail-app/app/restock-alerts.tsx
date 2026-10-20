// app/restock-alerts.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { subscribeRestockAlerts, resolveRestockAlert } from '../src/services/adminProductService';
import { RestockAlert } from '../src/types';
import { formatDate } from '../src/utils/format';
import { ScalePressable } from '../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';

export default function RestockAlertsScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { t } = useSettings();

  const [alerts, setAlerts] = useState<RestockAlert[]>([]);
  const [filterTab, setFilterTab] = useState<'pending' | 'notified'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = subscribeRestockAlerts((data) => {
      setAlerts(data);
      setIsLoading(false);
      setRefreshing(false);
    });
    return () => unsub();
  }, []);

  const filteredAlerts = alerts.filter((a) => a.status === filterTab);

  const handleResolve = (alertItem: RestockAlert) => {
    Alert.alert(
      'Xác nhận thông báo',
      `Đánh dấu đã liên hệ hoặc gửi thông báo cho khách hàng ${alertItem.customerName || alertItem.customerPhone}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đã thông báo',
          onPress: async () => {
            await resolveRestockAlert(alertItem.id, 'notified');
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.backCircleBtn,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>Yêu cầu báo có hàng</Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
              {alerts.filter((a) => a.status === 'pending').length} khách đang đợi sản phẩm
            </Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, filterTab === 'pending' && styles.tabBtnActive]}
          onPress={() => setFilterTab('pending')}
        >
          <Text style={[styles.tabText, filterTab === 'pending' && styles.tabTextActive]}>
            Đang chờ ({alerts.filter((a) => a.status === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, filterTab === 'notified' && styles.tabBtnActive]}
          onPress={() => setFilterTab('notified')}
        >
          <Text style={[styles.tabText, filterTab === 'notified' && styles.tabTextActive]}>
            Đã xử lý ({alerts.filter((a) => a.status === 'notified').length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor="#9C7156"
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#9C7156" />
          </View>
        ) : filteredAlerts.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <Ionicons name="notifications-off-outline" size={44} color={Colors.textMuted} />
            <Text style={[styles.emptyText, { color: Colors.textPrimary }]}>Không có yêu cầu nào</Text>
            <Text style={[styles.emptySub, { color: Colors.textSecondary }]}>
              Khi khách hàng nhấn "Báo tôi khi có hàng" ngoài Web hoặc App, yêu cầu sẽ hiện tại đây.
            </Text>
          </View>
        ) : (
          filteredAlerts.map((a) => (
            <View
              key={a.id}
              style={[
                styles.alertCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.alertCardTop}>
                {a.productImage ? (
                  <Image source={{ uri: a.productImage }} style={styles.productThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.productThumb, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="cube-outline" size={24} color={Colors.textMuted} />
                  </View>
                )}

                <View style={{ flex: 1, paddingLeft: 12 }}>
                  <Text style={[styles.productName, { color: Colors.textPrimary }]} numberOfLines={2}>
                    {a.productName}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Ionicons name="person-outline" size={13} color={Colors.textMuted} style={{ flexShrink: 0 }} />
                    <Text style={[styles.customerText, { color: Colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                      {a.customerName || 'Khách hàng'} • {a.customerPhone || a.customerEmail || 'Chưa để SĐT'}
                    </Text>
                  </View>
                  <Text style={[styles.timeText, { color: Colors.textMuted, marginTop: 3 }]} numberOfLines={1}>
                    Yêu cầu lúc: {a.createdAt ? formatDate(a.createdAt) : 'Gần đây'}
                  </Text>
                </View>
              </View>

              {a.status === 'pending' && (
                <>
                  <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />
                  <ScalePressable style={styles.btnResolve} onPress={() => handleResolve(a)}>
                    <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                    <Text style={styles.btnResolveText}>Đã gọi / Báo khách có hàng</Text>
                  </ScalePressable>
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(156, 113, 86, 0.08)',
  },
  tabBtnActive: {
    backgroundColor: '#9C7156',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9C7156',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  loadingWrap: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
    overflow: 'hidden',
  },
  emptyText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  alertCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  alertCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productThumb: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#FAF8F5',
  },
  productName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
  },
  customerText: {
    fontSize: 12,
  },
  timeText: {
    fontSize: 11,
  },
  cardDivider: {
    height: 1,
    marginVertical: 10,
  },
  btnResolve: {
    height: 40,
    borderRadius: 20,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  btnResolveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
