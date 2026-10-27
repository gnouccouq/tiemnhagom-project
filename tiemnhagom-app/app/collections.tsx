// app/collections.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { BlurButton } from '../src/components/BlurButton';
import { SymbolView } from 'expo-symbols';
import { getAllCollections, CollectionItem } from '../src/services/productService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_HEIGHT = 200;

export default function CollectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { t } = useSettings();
  const styles = getStyles(Colors, isDark);

  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getAllCollections();
      setCollections(data);
    } catch (err) {
      console.warn('Lỗi tải danh sách tất cả bộ sưu tập:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCollectionPress = (colName: string) => {
    router.push({
      pathname: '/collection-detail' as any,
      params: { name: colName },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* ================= NÚT QUAY LẠI CỐ ĐỊNH TRÊN CÙNG ================= */}
      <View style={[styles.floatingHeader, { top: insets.top + 6 }]} pointerEvents="box-none">
        <BlurButton onPress={() => router.back()} accessibilityLabel={t('back') || 'Quay lại'}>
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor="#FFFFFF"
            fallback={<Ionicons name="chevron-back" size={22} color="#FFFFFF" style={{ marginLeft: -1 }} />}
          />
        </BlurButton>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#9C7156"
            progressViewOffset={BANNER_HEIGHT}
          />
        }
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* ================= HERO HEADER BANNER (GIỐNG collections/index.html TRÊN WEB) ================= */}
        <View style={styles.heroBanner}>
          <Image
            source={{
              uri: 'https://firebasestorage.googleapis.com/v0/b/tiemnhagom-project.firebasestorage.app/o/banners%2Fpc_1787036956318__MG_2524.webp?alt=media&token=a5fe7e87-ac93-4183-b7a4-88040ccb686d',
            }}
            style={styles.heroBannerImage}
            contentFit="cover"
            priority="high"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBannerContent}>
            <View style={styles.badgeCapsule}>
              <Ionicons name="albums-outline" size={13} color="#E8CCB2" style={{ marginRight: 5 }} />
              <Text style={styles.badgeText}>{t('featuredThemes') || 'Chủ đề tuyển chọn'}</Text>
            </View>
            <Text style={styles.heroBannerTitle}>{t('allCollectionsTitle')}</Text>
            <Text style={styles.heroBannerSub}>
              {t('allCollectionsCount', { count: collections.length })}
            </Text>
          </View>
        </View>

        {/* ================= NỘI DUNG DANH SÁCH TOÀN BỘ BỘ SƯU TẬP ================= */}
        <View style={styles.contentWrap}>
          <Text style={styles.pageSubtitle}>{t('allCollectionsSubtitle')}</Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#9C7156" />
              <Text style={styles.loadingText}>{t('loading') || 'Đang tải bộ sưu tập...'}</Text>
            </View>
          ) : collections.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="folder-open-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>{t('collectionNotFound')}</Text>
            </View>
          ) : (
            <View style={styles.collectionsGrid}>
              {collections.map((col, idx) => (
                <TouchableOpacity
                  key={col.id || col.name || idx}
                  style={styles.collectionItemCard}
                  activeOpacity={0.92}
                  onPress={() => handleCollectionPress(col.name)}
                >
                  <Image
                    source={{ uri: col.imageUrl }}
                    style={styles.collectionCardImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.85)']}
                    locations={[0, 0.4, 1]}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Overlay thông tin bộ sưu tập (giống collection-overlay trên web) */}
                  <View style={styles.collectionCardOverlay}>
                    <Text style={styles.collectionCardTitle} numberOfLines={2}>
                      {col.name}
                    </Text>
                    {Boolean(col.description) && (
                      <Text style={styles.collectionCardDesc} numberOfLines={2}>
                        {col.description}
                      </Text>
                    )}
                    <View style={styles.explorePillBtn}>
                      <Text style={styles.explorePillText}>{t('exploreNow') || 'Khám phá bộ sưu tập'}</Text>
                      <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    floatingHeader: {
      position: 'absolute',
      left: 16,
      zIndex: 10,
    },

    // ================= HERO BANNER =================
    heroBanner: {
      width: SCREEN_WIDTH,
      height: BANNER_HEIGHT,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    heroBannerImage: {
      ...StyleSheet.absoluteFill,
      width: '100%',
      height: '100%',
    },
    heroBannerContent: {
      paddingHorizontal: 20,
      paddingBottom: 22,
    },
    badgeCapsule: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(43, 41, 40, 0.65)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(232, 204, 178, 0.35)',
      marginBottom: 6,
    },
    badgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 11,
      fontWeight: '700',
      color: '#E8CCB2',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    heroBannerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 24,
      fontWeight: '800',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0, 0, 0, 0.6)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 6,
    },
    heroBannerSub: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: '#E8CCB2',
      marginTop: 2,
      fontWeight: '600',
    },

    // ================= CONTENT =================
    contentWrap: {
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    pageSubtitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      lineHeight: 20,
      color: isDark ? '#A09890' : '#6E665D',
      marginBottom: 16,
    },
    loadingWrap: {
      paddingVertical: 60,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textSecondary,
    },
    emptyCard: {
      backgroundColor: isDark ? '#141414' : '#FFFFFF',
      borderRadius: 20,
      padding: 36,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
      marginTop: 20,
    },
    emptyText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: Colors.textSecondary,
    },

    // ================= COLLECTIONS GRID =================
    collectionsGrid: {
      gap: 16,
    },
    collectionItemCard: {
      height: 220,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: isDark ? '#1C1C1C' : '#F6F4EC',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    collectionCardImage: {
      ...StyleSheet.absoluteFill,
      width: '100%',
      height: '100%',
    },
    collectionCardOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 18,
    },
    collectionCardTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '800',
      color: '#FFFFFF',
      marginBottom: 4,
      textShadowColor: 'rgba(0, 0, 0, 0.7)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    collectionCardDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      lineHeight: 18,
      color: '#F0ECE6',
      marginBottom: 10,
    },
    explorePillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.5)',
      gap: 6,
    },
    explorePillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
