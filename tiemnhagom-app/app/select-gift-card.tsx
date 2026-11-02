// app/select-gift-card.tsx
import React, { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { BlurButton } from '../src/components/BlurButton';
import { SymbolView } from 'expo-symbols';
import { GiftTheme } from '../src/services/giftPointsService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 44) / 2;

export interface GreetingCardData {
  id: GiftTheme;
  title: string;
  tagline: string;
  category: 'trending' | 'forYou' | 'seasonal' | 'ceramic';
  gradient: [string, string, ...string[]];
  textColor: string;
  defaultMessage: string;
  stripes?: boolean;
  accentElement: 'chill' | 'radiant' | 'congrats' | 'thanks' | 'house' | 'tea';
}

export const ALL_GREETING_CARDS: GreetingCardData[] = [
  // Nhóm 1: Xu hướng
  {
    id: 'trending',
    title: 'Let’s\nChill',
    tagline: 'Thảnh thơi bên tách trà',
    category: 'trending',
    gradient: ['#FEF08A', '#FDE047'],
    textColor: '#DC2626',
    defaultMessage: 'Dành chút thời gian thảnh thơi bên tách trà gốm mộc, gạt bỏ âu lo và tận hưởng an yên bạn nhé!',
    stripes: true,
    accentElement: 'chill',
  },
  {
    id: 'birthday',
    title: 'Rạng\nRỡ',
    tagline: 'Tươi vui tuổi mới',
    category: 'trending',
    gradient: ['#FACC15', '#EAB308'],
    textColor: '#FFFFFF',
    defaultMessage: 'Chúc mừng sinh nhật! Thân chúc bạn tuổi mới luôn rạng rỡ, an yên và tìm thấy nhiều niềm vui mộc mạc.',
    accentElement: 'radiant',
  },

  // Nhóm 2: Dành cho bạn
  {
    id: 'housewarming',
    title: 'Chúc\nMừng',
    tagline: 'Vạn sự hanh thông',
    category: 'forYou',
    gradient: ['#EF4444', '#DC2626'],
    textColor: '#FFFFFF',
    defaultMessage: 'Mừng tân gia an khang thịnh vượng! Gửi tặng bạn chút điểm gốm mộc để điểm tô tổ ấm mới thật bình yên.',
    accentElement: 'congrats',
  },
  {
    id: 'gratitude',
    title: 'Cảm\nƠn',
    tagline: 'Trân quý tấm lòng',
    category: 'forYou',
    gradient: ['#84CC16', '#65A30D'],
    textColor: '#FFFFFF',
    defaultMessage: 'Mến tặng bạn món quà gốm mộc nhỏ bé, thay lời cảm ơn chân thành vì sự đồng hành quý báu.',
    accentElement: 'thanks',
  },

  // Nhóm 3: Gốm Mộc & Theo Mùa
  {
    id: 'peace',
    title: 'An\nYên',
    tagline: 'Mộc mạc & Ấm êm',
    category: 'ceramic',
    gradient: ['#9C7156', '#78350F'],
    textColor: '#FEF3C7',
    defaultMessage: 'Gửi tặng bạn chút men gốm dịu dàng, chúc mỗi ngày trôi qua đều là một ngày an lành, tràn ngập tiếng cười.',
    accentElement: 'house',
  },
  {
    id: 'friendship',
    title: 'Tri\nKỷ',
    tagline: 'Tình bạn bền bỉ',
    category: 'ceramic',
    gradient: ['#E8CCB2', '#D4A373'],
    textColor: '#2B2928',
    defaultMessage: 'Gửi tặng người bạn tri kỷ chút men gốm ấm áp thay lời cảm ơn vì luôn đồng hành và thấu hiểu.',
    accentElement: 'tea',
  },
];

export default function SelectGiftCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();

  const [activeCategory, setActiveCategory] = useState<'trending' | 'forYou' | 'seasonal' | 'ceramic'>('trending');

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
  };

  const handleSelectCard = (card: GreetingCardData) => {
    triggerHaptic();
    router.replace({
      pathname: '/gift-points',
      params: {
        cardId: card.id,
        cardTitle: card.title.replace('\n', ' '),
        cardMessage: card.defaultMessage,
      },
    });
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ========================================================================= */}
      {/* 1. TOP HEADER (Chuẩn xác như Ảnh 3: "<- Gửi thiệp")                      */}
      {/* ========================================================================= */}
      <View style={[styles.headerRow, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
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
        <Text style={styles.headerTitle}>{t('sendGiftCard') || 'Gửi thiệp'}</Text>
      </View>

      {/* ========================================================================= */}
      {/* 2. CATEGORY PILLS (Xu hướng, Dành cho bạn, Theo mùa, Gốm Mộc)             */}
      {/* ========================================================================= */}
      <View style={styles.categoryRowWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryPillsScroll}
        >
          {[
            { key: 'trending', label: 'Xu hướng' },
            { key: 'forYou', label: 'Dành cho bạn' },
            { key: 'seasonal', label: 'Theo mùa' },
            { key: 'ceramic', label: 'Gốm Mộc' },
          ].map((cat) => {
            const isSelected = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                activeOpacity={0.8}
                onPress={() => {
                  triggerHaptic();
                  setActiveCategory(cat.key as any);
                }}
              >
                <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ========================================================================= */}
      {/* 3. DANH SÁCH THIỆP CHIA THEO TỪNG SECTION (Chuẩn Ảnh 3)                    */}
      {/* ========================================================================= */}
      <ScrollView
        contentContainerStyle={[
          styles.cardsScrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 30 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Xu hướng */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Xu hướng</Text>
          <View style={styles.cardsRow}>
            {ALL_GREETING_CARDS.filter((c) => c.category === 'trending').map((card) => (
              <TouchableOpacity
                key={card.id}
                style={styles.cardItemTouch}
                activeOpacity={0.88}
                onPress={() => handleSelectCard(card)}
              >
                <LinearGradient
                  colors={card.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradient}
                >
                  {/* Họa tiết sọc nếu có (như thẻ Let's Chill) */}
                  {card.stripes && (
                    <View style={styles.stripesOverlay}>
                      <View style={styles.whiteStripe} />
                      <View style={styles.whiteStripe} />
                      <View style={styles.whiteStripe} />
                    </View>
                  )}

                  {/* Tiêu đề in lớn trên thiệp */}
                  <Text style={[styles.cardTitleBig, { color: card.textColor }]}>
                    {card.title}
                  </Text>

                  {/* Minh họa đồ họa tương ứng */}
                  <View style={styles.illustrationWrap}>
                    {card.accentElement === 'chill' && (
                      <View style={styles.chillGraphic}>
                        <Ionicons name="cafe" size={38} color="#DC2626" />
                        <View style={styles.sunGlasses}>
                          <Ionicons name="glasses-outline" size={26} color="#1E1E1E" />
                        </View>
                      </View>
                    )}
                    {card.accentElement === 'radiant' && (
                      <View style={styles.radiantGraphic}>
                        <Ionicons name="sunny" size={44} color="#FFFFFF" />
                        <Ionicons name="sparkles" size={24} color="#FEF08A" style={styles.radiantSparkle} />
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 2: Dành cho bạn */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Dành cho bạn</Text>
          <View style={styles.cardsRow}>
            {ALL_GREETING_CARDS.filter((c) => c.category === 'forYou').map((card) => (
              <TouchableOpacity
                key={card.id}
                style={styles.cardItemTouch}
                activeOpacity={0.88}
                onPress={() => handleSelectCard(card)}
              >
                <LinearGradient
                  colors={card.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradient}
                >
                  <Text style={[styles.cardTitleBig, { color: card.textColor }]}>
                    {card.title}
                  </Text>

                  <View style={styles.illustrationWrap}>
                    {card.accentElement === 'congrats' && (
                      <View style={styles.congratsGraphic}>
                        <Ionicons name="ribbon" size={42} color="#FFFFFF" />
                        <Ionicons name="heart" size={20} color="#FDE047" style={styles.congratsHeart} />
                      </View>
                    )}
                    {card.accentElement === 'thanks' && (
                      <View style={styles.thanksGraphic}>
                        <Ionicons name="leaf" size={42} color="#FFFFFF" />
                        <Ionicons name="gift" size={22} color="#FEF08A" style={styles.thanksGift} />
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 3: Gốm Mộc & Theo Mùa */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Gốm Mộc & Theo Mùa</Text>
          <View style={styles.cardsRow}>
            {ALL_GREETING_CARDS.filter((c) => c.category === 'ceramic').map((card) => (
              <TouchableOpacity
                key={card.id}
                style={styles.cardItemTouch}
                activeOpacity={0.88}
                onPress={() => handleSelectCard(card)}
              >
                <LinearGradient
                  colors={card.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGradient}
                >
                  <Text style={[styles.cardTitleBig, { color: card.textColor }]}>
                    {card.title}
                  </Text>

                  <View style={styles.illustrationWrap}>
                    {card.accentElement === 'house' && (
                      <View style={styles.ceramicGraphic}>
                        <Ionicons name="home" size={40} color="#FEF3C7" />
                        <Ionicons name="flower" size={20} color="#FDE047" style={styles.flowerAcc} />
                      </View>
                    )}
                    {card.accentElement === 'tea' && (
                      <View style={styles.ceramicGraphic}>
                        <Ionicons name="wine" size={38} color="#2B2928" />
                        <Ionicons name="sparkles" size={22} color="#9C7156" style={styles.sparkleAcc} />
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
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

    // 1. Header (Ảnh 3: mũi tên + "Gửi thiệp")
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 12,
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '800',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
    },

    // 2. Category Pills
    categoryRowWrapper: {
      paddingBottom: 12,
    },
    categoryPillsScroll: {
      paddingHorizontal: 16,
      gap: 10,
    },
    categoryPill: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: isDark ? '#161616' : '#F2ECE4',
      borderWidth: 1,
      borderColor: isDark ? '#2C2C2C' : '#E8E1D8',
    },
    categoryPillActive: {
      backgroundColor: isDark ? '#261E1A' : '#FAF2EA',
      borderColor: '#9C7156',
      borderWidth: 1.5,
    },
    categoryPillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#B0B0B0' : '#6E665D',
    },
    categoryPillTextActive: {
      color: isDark ? '#E8CCB2' : '#9C7156',
      fontWeight: '700',
    },

    // 3. Cards Scroll & Grid
    cardsScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      gap: 22,
    },
    sectionWrap: {
      gap: 12,
    },
    sectionHeading: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
      letterSpacing: -0.2,
    },
    cardsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardItemTouch: {
      width: CARD_WIDTH,
      height: 220,
      borderRadius: 24,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    cardGradient: {
      flex: 1,
      padding: 18,
      justifyContent: 'space-between',
      position: 'relative',
    },
    stripesOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'space-evenly',
      opacity: 0.28,
    },
    whiteStripe: {
      width: '100%',
      height: 18,
      backgroundColor: '#FFFFFF',
    },
    cardTitleBig: {
      fontFamily: 'ElleGaborStd',
      fontSize: 26,
      fontWeight: '900',
      lineHeight: 30,
      letterSpacing: -0.5,
      zIndex: 2,
    },
    illustrationWrap: {
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      zIndex: 2,
    },
    chillGraphic: {
      position: 'relative',
      alignItems: 'center',
    },
    sunGlasses: {
      position: 'absolute',
      top: -12,
      right: 14,
    },
    radiantGraphic: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radiantSparkle: {
      position: 'absolute',
      top: -6,
      right: -6,
    },
    congratsGraphic: {
      position: 'relative',
    },
    congratsHeart: {
      position: 'absolute',
      top: -4,
      right: -4,
    },
    thanksGraphic: {
      position: 'relative',
    },
    thanksGift: {
      position: 'absolute',
      bottom: -4,
      right: -4,
    },
    ceramicGraphic: {
      position: 'relative',
    },
    flowerAcc: {
      position: 'absolute',
      top: -6,
      right: -6,
    },
    sparkleAcc: {
      position: 'absolute',
      top: -4,
      right: -4,
    },
  });

