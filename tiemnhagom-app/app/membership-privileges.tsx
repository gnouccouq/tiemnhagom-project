import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Animated,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { openWebLink } from '../src/utils/openWebLink';
import { getUserOrders } from '../src/services/orderService';
import { BlurButton } from '../src/components/BlurButton';
import { useThemeColor } from '../src/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Bật LayoutAnimation cho Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BenefitItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  defaultTitle: string;
  bulletKeys: string[];
  defaultBullets: string[];
}

interface TierConfig {
  id: string;
  name: string;
  nameKey: string;
  spendRange: string;
  spendRangeKey: string;
  min: number;
  gradientColors: [string, string, ...string[]];
  bottomColor: string;
  logoTint: string;
  accentColor: string;
  cardAccentColor: string;
  badge: string;
  benefits: BenefitItem[];
}

// Cấu hình 4 hạng thành viên đồng bộ chuẩn xác 100% từ hệ thống Web Tiệm Nhà Gốm
export const MEMBERSHIP_TIER_CONFIGS: TierConfig[] = [
  {
    id: 'null',
    name: 'Gốm Mộc',
    nameKey: 'tierGomMoc',
    spendRange: 'Từ 0đ',
    spendRangeKey: 'spendRangeMoc',
    min: 0,
    gradientColors: ['#543824', '#3E2718', '#28170D'],
    bottomColor: '#28170D',
    logoTint: '#E8D5C4',
    accentColor: '#D97706',
    cardAccentColor: '#8A5A2B',
    badge: '🪵',
    benefits: [
      {
        id: 'starting_tier',
        icon: 'person-outline',
        titleKey: 'privilegeStartingTierTitle',
        defaultTitle: 'Hạng khởi đầu',
        bulletKeys: ['privilegeStartingTierDesc'],
        defaultBullets: ['Hạng khởi đầu dành cho mọi khách hàng tạo tài khoản.'],
      },
      {
        id: 'accumulate_spend',
        icon: 'wallet-outline',
        titleKey: 'privilegeAccumulateSpendTitle',
        defaultTitle: 'Tích lũy chi tiêu',
        bulletKeys: ['privilegeAccumulateSpendDesc'],
        defaultBullets: ['Tích lũy chi tiêu trên từng đơn hàng để thăng hạng tự động.'],
      },
    ],
  },
  {
    id: 'new',
    name: 'Gốm Nung',
    nameKey: 'tierGomNung',
    spendRange: '1 - 5 triệu',
    spendRangeKey: 'spendRangeNung',
    min: 1000000,
    gradientColors: ['#A31D1D', '#821414', '#520B0B'],
    bottomColor: '#520B0B',
    logoTint: '#FFFFFF',
    accentColor: '#EF4444',
    cardAccentColor: '#DC2626',
    badge: '🔥',
    benefits: [
      {
        id: 'discount_order',
        icon: 'pricetag-outline',
        titleKey: 'privilegeMemberPerksTitle',
        defaultTitle: 'Quyền lợi thành viên',
        bulletKeys: ['privilegeNungOrderDiscount', 'privilegeNungCategoryDiscount'],
        defaultBullets: [
          'Giảm giá trực tiếp 1% trên toàn bộ đơn hàng.',
          'Giảm thêm 0.5% - 1% các nhóm hàng KitchenWare & HomeDecor.',
        ],
      },
      {
        id: 'upgrade_voucher',
        icon: 'star-outline',
        titleKey: 'privilegeUpgradeGiftTitle',
        defaultTitle: 'Quà thăng hạng',
        bulletKeys: ['privilegeUpgradeVoucher50k'],
        defaultBullets: ['Tặng voucher 50.000đ khi lên hạng.'],
      },
      {
        id: 'birthday_voucher',
        icon: 'gift-outline',
        titleKey: 'privilegeBirthdayGiftTitle',
        defaultTitle: 'Quà sinh nhật',
        bulletKeys: ['privilegeBirthdayVoucher50k'],
        defaultBullets: ['Tặng voucher sinh nhật 50.000đ.'],
      },
    ],
  },
  {
    id: 'mem',
    name: 'Gốm Men',
    nameKey: 'tierGomMen',
    spendRange: '5 - 10 triệu',
    spendRangeKey: 'spendRangeMen',
    min: 5000000,
    gradientColors: ['#B45309', '#92400E', '#5C2D07'],
    bottomColor: '#5C2D07',
    logoTint: '#FEF08A',
    accentColor: '#FACC15',
    cardAccentColor: '#CA8A04',
    badge: '✨',
    benefits: [
      {
        id: 'discount_order',
        icon: 'pricetag-outline',
        titleKey: 'privilegeMemberPerksTitle',
        defaultTitle: 'Quyền lợi thành viên',
        bulletKeys: ['privilegeMenOrderDiscount'],
        defaultBullets: ['Giảm giá trực tiếp 3% trên toàn bộ đơn hàng.'],
      },
      {
        id: 'free_shipping',
        icon: 'car-outline',
        titleKey: 'privilegeFreeShippingTitle',
        defaultTitle: 'Miễn phí vận chuyển',
        bulletKeys: ['privilegeMenFreeShipping'],
        defaultBullets: ['Miễn phí vận chuyển toàn quốc cho mọi đơn hàng.'],
      },
      {
        id: 'upgrade_voucher',
        icon: 'star-outline',
        titleKey: 'privilegeUpgradeGiftTitle',
        defaultTitle: 'Quà thăng hạng',
        bulletKeys: ['privilegeUpgradeVoucher100k'],
        defaultBullets: ['Tặng voucher 100.000đ khi lên hạng.'],
      },
      {
        id: 'birthday_voucher',
        icon: 'gift-outline',
        titleKey: 'privilegeBirthdayGiftTitle',
        defaultTitle: 'Quà sinh nhật',
        bulletKeys: ['privilegeBirthdayVoucher200k'],
        defaultBullets: ['Tặng phiếu sinh nhật trị giá 200.000đ.'],
      },
      {
        id: 'friend_voucher',
        icon: 'people-outline',
        titleKey: 'privilegeFriendVoucherTitle',
        defaultTitle: 'Voucher tặng bạn bè',
        bulletKeys: ['privilegeFriendVoucherDesc'],
        defaultBullets: ['Tặng voucher 10% (tối đa 150k) cho người thân, bạn bè.'],
      },
    ],
  },
  {
    id: 'vip',
    name: 'Gốm Độc Bản',
    nameKey: 'tierGomDocBan',
    spendRange: 'Trên 10 triệu',
    spendRangeKey: 'spendRangeDocBan',
    min: 10000000,
    gradientColors: ['#27272A', '#18181B', '#09090B'],
    bottomColor: '#09090B',
    logoTint: '#EF4444',
    accentColor: '#EF4444',
    cardAccentColor: '#991B1B',
    badge: '👑',
    benefits: [
      {
        id: 'discount_order',
        icon: 'pricetag-outline',
        titleKey: 'privilegeMemberPerksTitle',
        defaultTitle: 'Quyền lợi thành viên',
        bulletKeys: ['privilegeDocBanOrderDiscount'],
        defaultBullets: ['Giảm giá trực tiếp 5% vĩnh viễn trên mọi đơn hàng.'],
      },
      {
        id: 'free_shipping',
        icon: 'car-outline',
        titleKey: 'privilegeFreeDeliveryTitle',
        defaultTitle: 'Miễn phí giao hàng',
        bulletKeys: ['privilegeDocBanFreeDelivery'],
        defaultBullets: ['Miễn phí giao hàng toàn quốc.'],
      },
      {
        id: 'upgrade_voucher',
        icon: 'star-outline',
        titleKey: 'privilegeUpgradeGiftTitle',
        defaultTitle: 'Quà thăng hạng',
        bulletKeys: ['privilegeUpgradeVoucher300k'],
        defaultBullets: ['Tặng voucher 300.000đ khi lên hạng.'],
      },
      {
        id: 'birthday_voucher',
        icon: 'gift-outline',
        titleKey: 'privilegeBirthdayGiftTitle',
        defaultTitle: 'Quà sinh nhật',
        bulletKeys: ['privilegeBirthdayVoucher500k'],
        defaultBullets: ['Ưu đãi sinh nhật: Tặng phiếu quà tặng 500.000đ.'],
      },
      {
        id: 'priority_preorder',
        icon: 'ribbon-outline',
        titleKey: 'privilegePriorityPreorderTitle',
        defaultTitle: 'Ưu tiên đặt trước độc bản',
        bulletKeys: ['privilegePriorityPreorderDesc'],
        defaultBullets: [
          'Ưu tiên đặt trước các tác phẩm gốm mộc độc bản số lượng giới hạn.',
        ],
      },
    ],
  },
];

interface AccordionBenefitCardProps {
  benefit: BenefitItem;
  isExpanded: boolean;
  onToggle: () => void;
  accentColor: string;
  t: (key: string) => string;
  isDark: boolean;
  styles: any;
}

/**
 * AccordionBenefitCard - Card đặc quyền thành viên có hiệu ứng sổ mượt mà:
 * - Xoay mũi tên 180 độ bằng hiệu ứng lò xo (Spring Physics)
 * - Mờ dần và trượt nhẹ nội dung chi tiết (Fade & Slide In/Out)
 * - Hỗ trợ chuẩn xác Dark Mode & Light Mode với độ tương phản cao cấp
 */
function AccordionBenefitCard({
  benefit,
  isExpanded,
  onToggle,
  accentColor,
  t,
  isDark,
  styles,
}: AccordionBenefitCardProps) {
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const contentAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: isExpanded ? 1 : 0,
        speed: 18,
        bounciness: 4,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: isExpanded ? 240 : 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isExpanded]);

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const contentTranslateY = contentAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });

  return (
    <View
      style={[
        styles.benefitCard,
        isExpanded && [
          styles.benefitCardActive,
          { borderColor: isDark ? `${accentColor}60` : `${accentColor}35` },
        ],
      ]}
    >
      {/* TIÊU ĐỀ CARD & NÚT SỔ RA */}
      <TouchableOpacity
        style={styles.cardHeaderRow}
        activeOpacity={0.7}
        onPress={onToggle}
      >
        <View
          style={[
            styles.benefitIconWrap,
            isExpanded && {
              backgroundColor: isDark ? `${accentColor}25` : `${accentColor}14`,
            },
          ]}
        >
          <Ionicons
            name={benefit.icon}
            size={19}
            color={isExpanded ? accentColor : (isDark ? '#A1A1AA' : '#374151')}
          />
        </View>

        <Text
          style={[
            styles.benefitTitle,
            isExpanded && {
              color: isDark ? '#FFFFFF' : '#111827',
              fontWeight: '800',
            },
          ]}
          numberOfLines={1}
        >
          {t(benefit.titleKey) || benefit.defaultTitle}
        </Text>

        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons
            name="chevron-down"
            size={20}
            color={isExpanded ? accentColor : (isDark ? '#71717A' : '#9CA3AF')}
          />
        </Animated.View>
      </TouchableOpacity>

      {/* NỘI DUNG SỔ RA KHI NGƯỜI DÙNG BẤM VÀO */}
      {isExpanded && (
        <Animated.View
          style={[
            styles.expandedContent,
            {
              opacity: contentAnim,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          <View style={styles.bulletsWrap}>
            {benefit.bulletKeys.map((bKey, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Text style={[styles.bulletDot, { color: accentColor }]}>•</Text>
                <Text style={styles.bulletText}>
                  {t(bKey) || benefit.defaultBullets[idx]}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function MembershipPrivilegesScreen() {
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile } = useAuth();
  const { t } = useSettings();

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [userTotalSpent, setUserTotalSpent] = useState<number>(() => {
    return Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
  });

  // Không sổ sẵn thông tin: mặc định rỗng để người dùng chủ động chạm mở
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Tính chi tiêu người dùng để xác định hạng hiện tại
  useEffect(() => {
    const profileSpent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
    if (user) {
      getUserOrders(user.uid)
        .then((orders) => {
          let orderSpent = 0;
          orders.forEach((o) => {
            const status = (o.status || '').toLowerCase();
            // Chỉ tích lũy các đơn hàng đã hoàn thành thành công giống hệ thống Web
            if (
              status.includes('hoàn thành') ||
              status.includes('thành công') ||
              status.includes('completed')
            ) {
              orderSpent += Number(o.totalAmount || 0);
            }
          });
          const total = Math.max(orderSpent, profileSpent);
          setUserTotalSpent(total);

          // Tự động cuộn đến hạng hiện tại của người dùng
          for (let i = MEMBERSHIP_TIER_CONFIGS.length - 1; i >= 0; i--) {
            if (total >= MEMBERSHIP_TIER_CONFIGS[i].min) {
              setActiveIndex(i);
              setTimeout(() => {
                scrollViewRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: false });
              }, 100);
              break;
            }
          }
        })
        .catch(() => {
          setUserTotalSpent(profileSpent);
        });
    } else {
      setUserTotalSpent(profileSpent);
    }
  }, [user, userProfile]);

  // Khi đổi hạng, giữ trạng thái thu gọn mặc định (không sổ sẵn)
  useEffect(() => {
    setExpandedMap({});
  }, [activeIndex]);

  const activeTier = MEMBERSHIP_TIER_CONFIGS[activeIndex];

  // Chuyển card khi cuộn hero
  const onMomentumScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx >= 0 && idx < MEMBERSHIP_TIER_CONFIGS.length && idx !== activeIndex) {
      setActiveIndex(idx);
    }
  };

  const handleDotPress = (index: number) => {
    setActiveIndex(index);
    scrollViewRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  // Toggle mở/đóng từng card accordion với LayoutAnimation mượt mà
  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.82,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const openMembershipPolicy = () => {
    openWebLink(
      'https://tiemnhagom.vn/chinh-sach/terms-of-service.html',
      t('memberPolicyLink') || 'Chính sách thành viên'
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? (Colors.background || '#121212') : activeTier.bottomColor }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* TOP HERO BACKGROUND VỚI ANIMATION CHUYỂN MÀU MƯỢT MÀ KHI LƯỚT */}
      <View style={styles.heroBackground}>
        {/* LỚP GRADIENT ĐỘNG: CHUYỂN MÀU MƯỢT GIỮA CÁC HẠNG THEO VỊ TRÍ CUỘN SCROLLX */}
        {MEMBERSHIP_TIER_CONFIGS.map((tier, idx) => {
          let inputRange: number[];
          let outputRange: number[];

          if (idx === 0) {
            inputRange = [0, SCREEN_WIDTH];
            outputRange = [1, 0];
          } else if (idx === MEMBERSHIP_TIER_CONFIGS.length - 1) {
            inputRange = [(idx - 1) * SCREEN_WIDTH, idx * SCREEN_WIDTH];
            outputRange = [0, 1];
          } else {
            inputRange = [
              (idx - 1) * SCREEN_WIDTH,
              idx * SCREEN_WIDTH,
              (idx + 1) * SCREEN_WIDTH,
            ];
            outputRange = [0, 1, 0];
          }

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange,
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={tier.id}
              style={[
                StyleSheet.absoluteFill,
                { opacity },
              ]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={tier.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          );
        })}

        <SafeAreaView edges={['top']} style={styles.safeAreaHeader}>
          {/* HEADER ROW: NÚT BACK BO TRÒN KÍNH MỜ + TIÊU ĐỀ */}
          <View style={styles.headerRow}>
            <BlurButton
              style={styles.roundBackBtn}
              onPress={() => router.back()}
              accessibilityLabel={t('back') || 'Quay lại'}
            >
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </BlurButton>

            <Text style={styles.headerTitle}>
              {t('memberBenefitsTitle') || 'Quyền lợi thành viên'}
            </Text>

            <View style={styles.headerRightSpacer} />
          </View>
        </SafeAreaView>

        {/* HERO CAROUSEL VỚI ANIMATED SCROLLX CHO DOTS VÀ TRANSITION MÀU */}
        <View style={styles.carouselWrapper}>
          <Animated.ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: false }
            )}
            onMomentumScrollEnd={onMomentumScrollEnd}
          >
            {MEMBERSHIP_TIER_CONFIGS.map((item, idx) => {
              const isUserCurrentTier =
                user &&
                userTotalSpent >= item.min &&
                (item.id === 'vip' ||
                  userTotalSpent <
                    (MEMBERSHIP_TIER_CONFIGS.find((_, i) => i === idx + 1)?.min || Infinity));

              // Hiệu ứng mờ & co dãn nhẹ khi lướt giữa các slide
              const slideOpacity = scrollX.interpolate({
                inputRange: [
                  (idx - 0.75) * SCREEN_WIDTH,
                  idx * SCREEN_WIDTH,
                  (idx + 0.75) * SCREEN_WIDTH,
                ],
                outputRange: [0.45, 1, 0.45],
                extrapolate: 'clamp',
              });

              const slideScale = scrollX.interpolate({
                inputRange: [
                  (idx - 1) * SCREEN_WIDTH,
                  idx * SCREEN_WIDTH,
                  (idx + 1) * SCREEN_WIDTH,
                ],
                outputRange: [0.93, 1, 0.93],
                extrapolate: 'clamp',
              });

              return (
                <View key={item.id} style={styles.heroSlide}>
                  <Animated.View
                    style={[
                      styles.heroSlideInner,
                      {
                        opacity: slideOpacity,
                        transform: [{ scale: slideScale }],
                      },
                    ]}
                  >
                    {/* CỘT TRÁI: HẠNG + TÊN + PILL MỨC TIỀN */}
                    <View style={styles.heroLeftCol}>
                      <View style={styles.tierPrefixRow}>
                        <Text style={styles.tierPrefixText}>
                          {t('tierPrefix') || 'Hạng'}
                        </Text>
                        {isUserCurrentTier && (
                          <View style={styles.userTierBadge}>
                            <Text style={styles.userTierBadgeText}>
                              {t('yourTierBadge') || t('currentTierBadge') || 'Hạng của bạn'}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.tierNameText} numberOfLines={1}>
                        {t(item.nameKey) || item.name}
                      </Text>

                      <View style={styles.spendPill}>
                        <Text style={styles.spendPillText}>
                          {t(item.spendRangeKey) || item.spendRange}
                        </Text>
                      </View>
                    </View>

                    {/* CỘT PHẢI: LOGO TIỆM NHÀ GỐM KIM LOẠI */}
                    <View style={styles.heroRightCol}>
                      <Image
                        source={require('../assets/images/textlogo.webp')}
                        style={styles.heroLogoImg}
                        contentFit="contain"
                        tintColor={item.logoTint}
                      />
                    </View>
                  </Animated.View>
                </View>
              );
            })}
          </Animated.ScrollView>
        </View>

        {/* MORPHING PILL DOTS (GIỐNG BANNER SLIDE Ở TRANG CHỦ) */}
        <View style={styles.dotsWrap}>
          {MEMBERSHIP_TIER_CONFIGS.map((item, i) => {
            // Animation co dãn từ chấm tròn sang thanh pill bo tròn theo vị trí cuộn x
            const width = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: [6, 24, 6],
              extrapolate: 'clamp',
            });

            const opacity = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });

            const dotBg = scrollX.interpolate({
              inputRange: [
                (i - 1) * SCREEN_WIDTH,
                i * SCREEN_WIDTH,
                (i + 1) * SCREEN_WIDTH,
              ],
              outputRange: [
                'rgba(255, 255, 255, 0.35)',
                item.accentColor,
                'rgba(255, 255, 255, 0.35)',
              ],
              extrapolate: 'clamp',
            });

            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleDotPress(i)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              >
                <Animated.View
                  style={[
                    styles.dotBase,
                    {
                      width,
                      opacity,
                      backgroundColor: dotBg,
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* WHITE CONTAINER: NỀN TRẮNG BO GÓC KHÔNG BỊ HỞ MÀU PHÍA SAU */}
      <View style={styles.bottomCardContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.benefitsScrollContent}
        >
          {/* DANH SÁCH CARD ĐẶC QUYỀN SỔ RA THEO HẠNG */}
          <View style={styles.benefitsList}>
            {activeTier.benefits.map((benefit) => {
              const isExpanded = !!expandedMap[benefit.id];

              return (
                <AccordionBenefitCard
                  key={benefit.id}
                  benefit={benefit}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpand(benefit.id)}
                  accentColor={activeTier.cardAccentColor || '#8A1515'}
                  t={t}
                  isDark={isDark}
                  styles={styles}
                />
              );
            })}
          </View>

          {/* FOOTER LINK: CHÍNH SÁCH THÀNH VIÊN */}
          <View style={styles.footerArea}>
            <Text style={styles.footerNoteText}>
              {t('referMemberPolicy') ||
                'Để tìm hiểu thêm về chính sách thành viên, vui lòng tham khảo'}
            </Text>
            <TouchableOpacity
              onPress={openMembershipPolicy}
              activeOpacity={0.7}
              style={styles.policyLinkWrap}
            >
              <Text
                style={[
                  styles.policyLinkText,
                  isDark && { color: activeTier.accentColor || Colors.accentGold || '#EFC050' },
                ]}
              >
                {t('memberPolicyLink') || 'Chính sách thành viên'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    heroBackground: {
      paddingBottom: 22,
      position: 'relative',
      overflow: 'hidden',
    },
    safeAreaHeader: {
      paddingHorizontal: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Platform.OS === 'android' ? 12 : 8,
    },
    roundBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    headerRightSpacer: {
      width: 40,
    },

    // Carousel Hero
    carouselWrapper: {
      marginTop: 6,
      marginBottom: 4,
    },
    heroSlide: {
      width: SCREEN_WIDTH,
      paddingHorizontal: 22,
      paddingVertical: 10,
      justifyContent: 'center',
    },
    heroSlideInner: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroLeftCol: {
      flex: 1.1,
      justifyContent: 'center',
    },
    tierPrefixRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    tierPrefixText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '500',
      color: 'rgba(255, 255, 255, 0.88)',
    },
    userTierBadge: {
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    userTierBadgeText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    tierNameText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 27,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.2,
      marginBottom: 10,
    },
    spendPill: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(0, 0, 0, 0.28)',
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    spendPillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.95)',
    },
    heroRightCol: {
      flex: 1.2,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 4,
    },
    heroLogoImg: {
      width: 145,
      height: 75,
    },

    // Morphing Pill Dots (giống banner slide trang chủ)
    dotsWrap: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 7,
      marginTop: 6,
      marginBottom: 10,
      alignSelf: 'center',
    },
    dotBase: {
      height: 6,
      borderRadius: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.35,
      shadowRadius: 2,
      elevation: 2,
    },

    // Bottom Container
    bottomCardContainer: {
      flex: 1,
      backgroundColor: isDark ? (Colors.background || '#121212') : '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      marginTop: -16,
    },
    benefitsScrollContent: {
      paddingHorizontal: 18,
      paddingTop: 22,
      paddingBottom: Platform.OS === 'ios' ? 44 : 30,
    },
    benefitsList: {
      gap: 12,
    },

    // Accordion Benefit Card
    benefitCard: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1.2,
      borderColor: isDark ? (Colors.borderLight || '#2A2A2A') : '#F0ECE6',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 6,
      elevation: isDark ? 2 : 1,
      overflow: 'hidden',
    },
    benefitCardActive: {
      backgroundColor: isDark ? '#252528' : '#FAFAF9',
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 8,
      elevation: isDark ? 3 : 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    benefitIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: isDark ? '#2C2C2E' : '#F5F5F4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    benefitTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#1F2937'),
      flex: 1,
      marginLeft: 10,
    },

    // Sổ ra (Expanded Content)
    expandedContent: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? (Colors.divider || '#333338') : '#E7E5E4',
    },
    bulletsWrap: {
      gap: 8,
      paddingLeft: 4,
      paddingRight: 4,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    bulletDot: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
    },
    bulletText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textSecondary || (isDark ? '#B0B0B0' : '#4B5563'),
      lineHeight: 20,
      flex: 1,
    },

    // Footer Link
    footerArea: {
      alignItems: 'center',
      marginTop: 34,
      marginBottom: 10,
      paddingHorizontal: 20,
    },
    footerNoteText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12,
      color: Colors.textMuted || (isDark ? '#888888' : '#6B7280'),
      textAlign: 'center',
      lineHeight: 18,
    },
    policyLinkWrap: {
      marginTop: 3,
    },
    policyLinkText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B',
      textDecorationLine: 'underline',
    },
  });
