import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getDirSizeBytes = async (dirUri: string | null | undefined, depth = 0): Promise<number> => {
  if (!dirUri || depth > 3) return 0;
  try {
    const entries = await FileSystem.readDirectoryAsync(dirUri);
    let sum = 0;
    for (const name of entries) {
      const uri = dirUri.endsWith('/') ? `${dirUri}${name}` : `${dirUri}/${name}`;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) continue;
        if (info.isDirectory) {
          sum += await getDirSizeBytes(uri, depth + 1);
        } else if (typeof (info as any).size === 'number') {
          sum += (info as any).size;
        }
      } catch {}
    }
    return sum;
  } catch {
    return 0;
  }
};

export default function SettingsStorageScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const dialog = useDialog();

  const [scrollY, setScrollY] = useState(0);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [dataBytes, setDataBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const calculateStorage = useCallback(async () => {
    setLoading(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      let asyncData = 0;
      let asyncTemp = 0;
      if (keys.length > 0) {
        const stores = await AsyncStorage.multiGet(keys);
        stores.forEach(([k, val]) => {
          if (val) {
            const b = k.length + val.length * 2;
            if (k.includes('recent_searches') || k.includes('temp') || k.includes('cache')) {
              asyncTemp += b;
            } else {
              asyncData += b;
            }
          }
        });
      }

      const [cacheDirBytes, docDirBytes] = await Promise.all([
        getDirSizeBytes((FileSystem as any).cacheDirectory),
        getDirSizeBytes((FileSystem as any).documentDirectory),
      ]);

      setCacheBytes(cacheDirBytes + asyncTemp);
      setDataBytes(docDirBytes + asyncData);
    } catch {
      setCacheBytes(0);
      setDataBytes(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    calculateStorage();
  }, [calculateStorage]);

  const totalBytes = cacheBytes + dataBytes;
  const cacheRatio = totalBytes > 0 ? Math.max(8, Math.round((cacheBytes / totalBytes) * 100)) : 50;

  const handleClearCache = () => {
    dialog.confirm(
      t('clearCacheTitle') || 'Xóa bộ nhớ đệm',
      `Bạn có chắc muốn giải phóng ${formatBytes(cacheBytes)} bộ nhớ đệm hình ảnh và tệp tạm không?`,
      async () => {
        try {
          setIsClearing(true);
          if (Image.clearMemoryCache) await Image.clearMemoryCache();
          if (Image.clearDiskCache) await Image.clearDiskCache();

          const cacheDir = (FileSystem as any).cacheDirectory;
          if (cacheDir) {
            try {
              const entries = await FileSystem.readDirectoryAsync(cacheDir);
              await Promise.all(
                entries.map((name) =>
                  FileSystem.deleteAsync(
                    cacheDir.endsWith('/') ? `${cacheDir}${name}` : `${cacheDir}/${name}`,
                    { idempotent: true }
                  ).catch(() => {})
                )
              );
            } catch {}
          }

          const allKeys = await AsyncStorage.getAllKeys();
          const tempKeys = allKeys.filter(
            (k) => k.includes('recent_searches') || k.includes('temp') || k.includes('cache')
          );
          if (tempKeys.length > 0) {
            await AsyncStorage.multiRemove(tempKeys);
          }

          await calculateStorage();
          dialog.alert(
            t('clearCacheTitle') || 'Xóa bộ nhớ đệm',
            t('cacheCleared') || 'Đã giải phóng bộ nhớ đệm thành công!'
          );
        } finally {
          setIsClearing(false);
        }
      },
      t('clearAll') || 'Xóa ngay',
      t('cancel') || 'Hủy',
      true
    );
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('appCache') || 'Bộ nhớ & Dữ liệu'}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 + 12 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{t('storageTotalTitle') || 'Tổng dung lượng ứng dụng'}</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#9C7156" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={styles.summaryBigValue}>{formatBytes(totalBytes)}</Text>
          )}

          <View style={styles.barTrack}>
            <View style={[styles.barSegmentCache, { flex: cacheRatio }]} />
            <View style={[styles.barSegmentData, { flex: Math.max(8, 100 - cacheRatio) }]} />
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9C7156' }]} />
              <Text style={styles.legendText}>{t('storageCacheTitle') || 'Bộ nhớ đệm'}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#E8CCB2' }]} />
              <Text style={styles.legendText}>{t('storageDataTitle') || 'Dữ liệu tải xuống'}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionKicker}>{t('storageDetailsTitle') || 'Chi tiết bộ nhớ'}</Text>
        <View style={styles.groupCard}>
          <View style={styles.settingRow}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#382522' : '#F6DDD7' }]}>
              <Ionicons name="images-outline" size={20} color={isDark ? '#EEA898' : '#B5482B'} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>{t('storageCacheTitle') || 'Bộ nhớ đệm'}</Text>
              <Text style={styles.rowSubtitle}>{t('storageCacheSub') || 'Hình ảnh sản phẩm & tệp tải tạm'}</Text>
            </View>
            <Text style={styles.rowValue}>{formatBytes(cacheBytes)}</Text>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.settingRow}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F4E4CE' }]}>
              <Ionicons name="cloud-download-outline" size={20} color={isDark ? '#E8CCB2' : '#7C5332'} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>{t('storageDataTitle') || 'Dữ liệu tải xuống'}</Text>
              <Text style={styles.rowSubtitle}>{t('storageDataSub') || 'Tài khoản, giỏ hàng & dữ liệu đã lưu'}</Text>
            </View>
            <Text style={styles.rowValue}>{formatBytes(dataBytes)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.clearBtn, isClearing && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={isClearing}
          onPress={handleClearCache}
        >
          {isClearing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.clearBtnText}>{t('clearAppCache') || 'Xóa bộ nhớ đệm'}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#121212' : '#FAF8F5'),
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    summaryCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 22,
      padding: 20,
      marginBottom: 22,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    summaryLabel: {
      fontSize: 13.5,
      fontWeight: '600',
      color: Colors.textMuted || '#7D756C',
    },
    summaryBigValue: {
      fontSize: 30,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginTop: 4,
      marginBottom: 14,
      letterSpacing: -0.5,
    },
    barTrack: {
      height: 10,
      borderRadius: 5,
      flexDirection: 'row',
      overflow: 'hidden',
      gap: 3,
      marginBottom: 12,
    },
    barSegmentCache: {
      backgroundColor: '#9C7156',
      borderRadius: 5,
    },
    barSegmentData: {
      backgroundColor: '#E8CCB2',
      borderRadius: 5,
    },
    legendRow: {
      flexDirection: 'row',
      gap: 18,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    legendText: {
      fontSize: 12.5,
      color: Colors.textMuted || '#7D756C',
      fontWeight: '600',
    },
    sectionKicker: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#7C5332',
      marginBottom: 10,
      marginLeft: 6,
    },
    groupCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
      marginBottom: 20,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 14,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTextCol: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    rowSubtitle: {
      fontSize: 12.5,
      color: Colors.textMuted || '#7D756C',
      marginTop: 2,
    },
    rowValue: {
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 16,
    },
    clearBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#9C7156' : '#1E1B18',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    clearBtnText: {
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
