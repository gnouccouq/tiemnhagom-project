// app/friends.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { useThemeColor } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { BlurButton } from '../src/components/BlurButton';
import { SymbolView } from 'expo-symbols';
import { openWebLink } from '../src/utils/openWebLink';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function FriendsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
  };

  const handleNavigateToGiftPoints = () => {
    triggerHaptic();
    if (!user) {
      dialog.confirm(
        t('giftPointsTitle') || 'Tặng Điểm Gốm',
        t('requireLoginToGiftOrClaim') || 'Vui lòng đăng nhập để tặng hoặc nhận điểm thưởng.',
        () => router.push('/auth/login'),
        t('loginAction') || 'Đăng nhập',
        t('close') || 'Đóng'
      );
      return;
    }
    router.push('/gift-points');
  };

  const handleNavigateToReferral = () => {
    triggerHaptic();
    router.push('/vouchers');
  };

  const handleNavigateToHistory = () => {
    triggerHaptic();
    router.push('/points-history');
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ========================================================================= */}
      {/* 1. TOP HEADER (Tiêu chuẩn Ảnh 1: Chữ "Bạn bè" lớn và nút Back)            */}
      {/* ========================================================================= */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        <BlurButton
          onPress={() => router.back()}
          accessibilityLabel={t('back') || 'Quay lại'}
        >
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor={isDark ? '#F5F5F5' : '#2B2928'}
            fallback={<Ionicons name="chevron-back" size={22} color={isDark ? '#F5F5F5' : '#2B2928'} style={{ marginLeft: -1 }} />}
          />
        </BlurButton>
        <Text style={styles.headerTitle}>Bạn bè</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ========================================================================= */}
        {/* 2. HERO BANNER CARD (gift_point_banner.png)                                */}
        {/* ========================================================================= */}
        <View style={styles.heroBannerCard}>
          <Image
            source={require('../assets/images/gift_point_banner.png')}
            style={styles.heroBannerImage}
            contentFit="cover"
            transition={250}
          />
        </View>

        {/* ========================================================================= */}
        {/* 3. MENU ACTION CARDS (3 nút bấm như Ảnh 1)                               */}
        {/* ========================================================================= */}
        <View style={styles.actionMenuContainer}>
          {/* Card 1: Giới thiệu bạn bè */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={handleNavigateToReferral}
          >
            <View style={styles.actionCardLeft}>
              <View style={styles.iconCircleWrap}>
                <Ionicons name="sparkles" size={20} color="#9C7156" />
              </View>
              <Text style={styles.actionCardTitle}>Giới thiệu bạn bè</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          {/* Card 2: Tặng Điểm Gốm (Tặng Drips theo ảnh mẫu) */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={handleNavigateToGiftPoints}
          >
            <View style={styles.actionCardLeft}>
              <View style={styles.iconCircleWrap}>
                <Ionicons name="gift" size={20} color="#9C7156" />
              </View>
              <Text style={styles.actionCardTitle}>Tặng Điểm Gốm</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>

          {/* Card 3: Lịch sử điểm (Dùng chung với trang Lịch sử điểm) */}
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={handleNavigateToHistory}
          >
            <View style={styles.actionCardLeft}>
              <View style={styles.iconCircleWrap}>
                <Ionicons name="receipt-outline" size={20} color="#9C7156" />
              </View>
              <Text style={styles.actionCardTitle}>{t('pointsHistoryTitle') || 'Lịch sử Điểm'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E968D" />
          </TouchableOpacity>
        </View>

        {/* ========================================================================= */}
        {/* 4. FOOTER NOTE (Chi tiết điều kiện điều khoản của chương trình)            */}
        {/* ========================================================================= */}
        <View style={styles.footerNoteContainer}>
          <Text style={styles.footerNoteText}>
            Chi tiết điều kiện điều khoản của chương trình.{' '}
            <Text
              style={styles.footerNoteLink}
              onPress={() => openWebLink('https://tiemnhagom.vn/chinh-sach/terms-of-service.html', 'Điều khoản chương trình')}
            >
              Xem tại đây
            </Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#000000' : '#FAF8F5'),
    },

    // 1. Header
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 22,
      fontWeight: '800',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
      letterSpacing: -0.3,
    },
    headerRightSpacer: {
      width: 40,
    },

    // Scroll Content
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 20,
    },

    // 2. Hero Banner Card (Hình ảnh gift_point_banner.png)
    heroBannerCard: {
      width: '100%',
      borderRadius: 28,
      overflow: 'hidden',
      shadowColor: '#8B1E1E',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0 : 0.22,
      shadowRadius: 12,
      elevation: isDark ? 0 : 5,
      backgroundColor: '#8B1E1E',
    },
    heroBannerImage: {
      width: '100%',
      aspectRatio: 1234 / 1274,
    },

    // 3. Action Menu Cards
    actionMenuContainer: {
      gap: 12,
    },
    actionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#121212' : '#FFFFFF',
      borderRadius: 20,
      paddingVertical: 18,
      paddingHorizontal: 20,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 0 : 2,
    },
    actionCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    iconCircleWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#1E1E1E' : '#FFF5EE',
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionCardTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
    },

    // 4. Footer Note
    footerNoteContainer: {
      paddingHorizontal: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    footerNoteText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textSecondary || (isDark ? '#888' : '#777'),
      textAlign: 'center',
      lineHeight: 18,
    },
    footerNoteLink: {
      fontFamily: 'ElleGaborStd',
      color: isDark ? '#E8CCB2' : '#9C7156',
      fontWeight: '700',
    },
  });

