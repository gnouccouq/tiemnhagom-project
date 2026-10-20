// app/inventory-log.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { subscribeInventoryLogs } from '../src/services/adminProductService';
import { InventoryLog } from '../src/types';
import { formatDate } from '../src/utils/format';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';

export default function InventoryLogScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { t } = useSettings();

  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = subscribeInventoryLogs((data) => {
      setLogs(data);
      setIsLoading(false);
      setRefreshing(false);
    });
    return () => unsub();
  }, []);

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
            <Text style={[styles.headerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>Nhật ký tồn kho</Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
              Lịch sử nhập xuất & kiểm kê kho
            </Text>
          </View>
        </View>
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
        ) : logs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E8E1D8' }]}>
            <Ionicons name="document-text-outline" size={44} color={Colors.textMuted} />
            <Text style={[styles.emptyText, { color: Colors.textPrimary }]}>Chưa có ghi chép biến động kho</Text>
            <Text style={[styles.emptySub, { color: Colors.textSecondary }]}>
              Mọi thao tác điều chỉnh tồn kho tại quầy sẽ được lưu lại tự động tại đây.
            </Text>
          </View>
        ) : (
          logs.map((log) => {
            const isIncrease = log.diff > 0;
            return (
              <View
                key={log.id}
                style={[
                  styles.logCard,
                  {
                    backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
              >
                <View style={styles.logCardTop}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.productName, { color: Colors.textPrimary }]} numberOfLines={1}>
                      {log.productName}
                    </Text>
                    <Text style={[styles.logReason, { color: Colors.textSecondary }]} numberOfLines={1}>
                      {log.reason}
                    </Text>
                  </View>

                  {/* Diff Badge */}
                  <View
                    style={[
                      styles.diffBadge,
                      {
                        backgroundColor: isIncrease
                          ? 'rgba(156, 113, 86, 0.12)'
                          : 'rgba(220, 38, 38, 0.1)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={isIncrease ? 'arrow-up' : 'arrow-down'}
                      size={14}
                      color={isIncrease ? '#9C7156' : '#DC2626'}
                    />
                    <Text
                      style={[
                        styles.diffBadgeText,
                        { color: isIncrease ? '#9C7156' : '#DC2626' },
                      ]}
                      numberOfLines={1}
                    >
                      {isIncrease ? `+${log.diff}` : `${log.diff}`}
                    </Text>
                  </View>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: isDark ? '#222' : '#F0ECE6' }]} />

                <View style={styles.logCardBottom}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                    <Ionicons name="person-outline" size={13} color={Colors.textMuted} />
                    <Text style={[styles.logStaffText, { color: Colors.textSecondary }]} numberOfLines={1}>
                      {log.staffName}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <Text style={[styles.stockTransition, { color: Colors.textMuted }]}>
                      {log.previousStock} ➔ <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{log.newStock}</Text>
                    </Text>
                    <Text style={[styles.timeText, { color: Colors.textMuted }]}>
                      {log.createdAt ? formatDate(log.createdAt) : 'Vừa xong'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
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
  logCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  logCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  productName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
  },
  logReason: {
    fontSize: 12,
    marginTop: 3,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  diffBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    marginVertical: 10,
  },
  logCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logStaffText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stockTransition: {
    fontSize: 12.5,
  },
  timeText: {
    fontSize: 11.5,
  },
});
