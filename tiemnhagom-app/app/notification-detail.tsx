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
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../src/components/Header';
import { useThemeColor, Typography, Spacing } from '../src/constants/theme';
import { db } from '../src/config/firebase';
import { doc, getDoc } from 'firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function NotificationDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    title: string;
    message: string;
    imageUrl?: string;
    type: string;
    time: string;
    link?: string;
  }>({
    title: (params.title as string) || '',
    message: (params.message as string) || '',
    imageUrl: (params.imageUrl as string) || '',
    type: (params.type as string) || 'promo',
    time: (params.time as string) || 'Mới đây',
    link: (params.link as string) || '',
  });

  const notifId = params.id as string | undefined;

  // Tự động tải từ Firestore nếu thiếu tiêu đề hoặc nội dung (khi mở từ Deep Link / Push)
  useEffect(() => {
    if (notifId && (!detailData.title || !detailData.message)) {
      const fetchFromFirestore = async () => {
        try {
          setLoading(true);
          const docRef = doc(db, 'global_notifications', notifId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
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
            setDetailData({
              title: data.title || 'Thông báo từ Tiệm Nhà Gốm',
              message: data.body || '',
              imageUrl: data.imageUrl || '',
              type: data.type || 'promo',
              time: timeStr,
              link: data.link || '',
            });
          }
        } catch (err) {
          console.log('Lỗi tải chi tiết thông báo:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchFromFirestore();
    }
  }, [notifId]);

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

  // Xác định cấu hình theme theo loại thông báo
  const getTypeBadgeConfig = () => {
    switch (detailData.type) {
      case 'order':
        return {
          label: 'Đơn hàng',
          icon: 'cube-outline' as const,
          bgColor: '#F6F4EC',
          textColor: '#9C7156',
          borderColor: '#E8CCB2',
          actionText: 'Xem đơn hàng',
          actionIcon: 'receipt-outline' as const,
        };
      case 'system':
        return {
          label: 'Hệ thống',
          icon: 'shield-checkmark-outline' as const,
          bgColor: '#F1F5F9',
          textColor: '#475569',
          borderColor: '#E2E8F0',
          actionText: 'Xem tài khoản',
          actionIcon: 'person-outline' as const,
        };
      default:
        return {
          label: 'Ưu đãi & Khuyến mãi',
          icon: 'sparkles-outline' as const,
          bgColor: '#FDF4ED',
          textColor: '#C86432',
          borderColor: '#F8D8C3',
          actionText: 'Khám phá ưu đãi ngay',
          actionIcon: 'bag-handle-outline' as const,
        };
    }
  };

  const badgeConfig = getTypeBadgeConfig();

  const [scrollY, setScrollY] = useState(0);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: Colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header chuẩn trang trong app với nút quay lại */}
      <Header
        title="Chi tiết thông báo"
        showBack={true}
        showSearch={false}
        showCart={false}
        scrollY={scrollY}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C86432" />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>
            Đang tải thông báo...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {/* Card nội dung chính */}
          <View style={[styles.mainCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
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
                  style={[styles.shareBtn, { borderColor: Colors.border }]}
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
            <View style={[styles.divider, { backgroundColor: Colors.border }]} />

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

            {/* Nội dung chi tiết thông báo */}
            <View style={styles.bodyWrap}>
              <Text style={[styles.message, { color: Colors.textSecondary }]}>
                {detailData.message || 'Không có nội dung chi tiết.'}
              </Text>
            </View>
          </View>

          {/* Hộp gợi ý dịch vụ & hỗ trợ */}
          <View style={[styles.supportBox, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
            <View style={styles.supportHeader}>
              <Ionicons name="chatbubbles-outline" size={18} color="#C86432" />
              <Text style={[styles.supportTitle, { color: Colors.textPrimary }]}>
                Cần hỗ trợ về thông báo này?
              </Text>
            </View>
            <Text style={[styles.supportDesc, { color: Colors.textSecondary }]}>
              Nếu bạn có câu hỏi về ưu đãi hoặc đơn hàng, vui lòng liên hệ hotline hoặc nhắn tin trực tiếp để được tư vấn nhanh nhất.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Thanh Action Bar cố định dưới đáy */}
      {!loading && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: Colors.cardBackground,
              borderTopColor: Colors.border,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleAction}
            activeOpacity={0.85}
          >
            <Ionicons name={badgeConfig.actionIcon} size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{badgeConfig.actionText}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: Colors.border }]}
            onPress={handleGoBack}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: Colors.textSecondary }]}>
              Quay lại
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
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
    borderWidth: 1,
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 21,
    lineHeight: 28,
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
    backgroundColor: '#F3E5DC',
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
  supportBox: {
    borderRadius: 20,
    borderWidth: 1,
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
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111111',
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
    borderWidth: 1,
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
