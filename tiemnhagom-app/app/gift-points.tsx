// app/gift-points.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';
import { BlurButton } from '../src/components/BlurButton';
import { LiquidGlass } from '../src/components/LiquidGlass';
import { SymbolView } from 'expo-symbols';
import {
  createGiftPoints,
  GiftTheme,
  GiftPointsTransaction,
} from '../src/services/giftPointsService';
import { syncUserLoyaltyAndVouchers, calculateCeramicPoints } from '../src/services/loyaltyService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SendGiftPointsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userProfile, updateUserProfileData } = useAuth();
  const { t } = useSettings();
  const dialog = useDialog();

  const params = useLocalSearchParams<{
    cardId?: string;
    cardTitle?: string;
    cardMessage?: string;
  }>();

  // Tính số điểm khả dụng của người dùng đồng bộ chuẩn xác với trang Ưu đãi & Web
  const [totalSpent, setTotalSpent] = useState<number>(() => Number(userProfile?.totalSpent || (userProfile as any)?.spentTotal || 0));
  const [redeemedPoints, setRedeemedPoints] = useState<number>(() => Number((userProfile as any)?.redeemedPoints || 0));

  useEffect(() => {
    if (user?.uid) {
      syncUserLoyaltyAndVouchers(userProfile?.uid || user.uid, userProfile)
        .then((res: any) => {
          setTotalSpent(res.totalSpent);
          setRedeemedPoints(res.redeemedPoints);
        })
        .catch(() => {});
    }
  }, [user, userProfile]);

  const availablePoints = calculateCeramicPoints(totalSpent, userProfile, redeemedPoints);

  const currentTierName = userProfile?.membershipTier || userProfile?.tier || 'Gốm Mộc';
  const displayName = userProfile?.displayName || userProfile?.name || user?.displayName || 'Thành viên Tiệm Nhà Gốm';

  // State nhập liệu theo chuẩn Ảnh 2: Cho phép nhập trực tiếp số điểm bất kỳ
  const [pointsInput, setPointsInput] = useState<string>(
    availablePoints >= 20 ? '20' : availablePoints > 0 ? String(availablePoints) : ''
  );
  const giftPoints = parseInt(pointsInput || '0', 10);
  const pointsInputRef = useRef<any>(null);

  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [giftMessage, setGiftMessage] = useState<string>(
    params.cardMessage || 'Gửi tặng bạn chút điểm gốm mộc, chúc bạn luôn an yên và ngập tràn niềm vui!'
  );
  const [selectedCardId, setSelectedCardId] = useState<GiftTheme>(
    (params.cardId as GiftTheme) || 'trending'
  );
  const [selectedCardTitle, setSelectedCardTitle] = useState<string>(
    params.cardTitle || 'Let’s Chill'
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Cập nhật khi nhận params từ trang Chọn thiệp (Trang 3)
  useEffect(() => {
    if (params.cardId) {
      setSelectedCardId(params.cardId as GiftTheme);
    }
    if (params.cardTitle) {
      setSelectedCardTitle(params.cardTitle);
    }
    if (params.cardMessage) {
      setGiftMessage(params.cardMessage);
    }
  }, [params.cardId, params.cardTitle, params.cardMessage]);

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
  };

  // Điều hướng sang Trang 3 (Gửi thiệp)
  const handleOpenCardSelector = () => {
    triggerHaptic();
    router.push('/select-gift-card');
  };

  // Thêm nhanh tag lời chúc
  const handleSelectQuickTag = (tagText: string) => {
    triggerHaptic();
    setGiftMessage((prev) => (prev ? `${prev} ${tagText}` : tagText));
  };

  // Xác nhận tạo quà tặng điểm
  const handleConfirmSend = async () => {
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

    const phoneClean = recipientPhone.trim();
    if (!phoneClean) {
      dialog.alert('Thông báo', 'Vui lòng nhập số điện thoại người nhận');
      return;
    }

    if (giftPoints < 5) {
      dialog.alert('Thông báo', 'Số điểm tặng tối thiểu là 5 điểm');
      return;
    }

    if (giftPoints > availablePoints) {
      dialog.alert('Thông báo', 'Số dư điểm của bạn không đủ để tặng');
      return;
    }

    try {
      setIsSubmitting(true);
      const gift = await createGiftPoints({
        senderUid: user.uid,
        senderName: displayName,
        senderPhone: userProfile?.phone || '',
        recipientPhone: phoneClean,
        points: giftPoints,
        theme: selectedCardId,
        themeTitle: selectedCardTitle,
        message: giftMessage.trim() || 'Mến tặng bạn món quà gốm mộc!',
      });

      // Trừ điểm của người gửi
      const currentDeduction = Number((userProfile as any)?.giftPointsDeduction || 0);
      await updateUserProfileData({ giftPointsDeduction: currentDeduction + giftPoints } as any);

      triggerHaptic();
      dialog.alert(
        'Tặng Điểm Thành Công! 🎉',
        `Đã gửi tặng ${giftPoints} Điểm Gốm đến ${phoneClean}.\n\nNgười nhận sẽ nhận được thông báo để xem thiệp và chấp nhận số điểm này.`,
        [
          {
            text: 'Hoàn tất',
            style: 'primary',
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (err) {
      console.warn('Lỗi tạo quà tặng điểm:', err);
      dialog.alert('Thông báo', 'Có lỗi xảy ra khi tặng điểm. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = recipientPhone.trim().length >= 9 && giftPoints >= 5 && giftPoints <= availablePoints;

  return (
    <View style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: '#FAF4ED' } }} />
      <StatusBar barStyle="dark-content" />

      {/* Ảnh nền chuẩn thương hiệu background_gift-point.png */}
      <Image
        source={require('../assets/images/background_gift-point.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        priority="high"
      />

      {/* ========================================================================= */}
      {/* 1. TOP HEADER (Nút back tròn + Hạng & Điểm bên phải)                      */}
      {/* ========================================================================= */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        <BlurButton
          isDark={false}
          onPress={() => router.back()}
          accessibilityLabel={t('back') || 'Quay lại'}
        >
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor="#2B2928"
            fallback={<Ionicons name="chevron-back" size={22} color="#2B2928" style={{ marginLeft: -1 }} />}
          />
        </BlurButton>

        <LiquidGlass isDark={false} interactive={false} effect="regular" style={styles.headerRightTier}>
          <Text style={styles.headerTierText}>Hạng {currentTierName}</Text>
          <View style={styles.headerPointsRow}>
            <Text style={styles.headerPointsNum}>{availablePoints}</Text>
            <Ionicons name="water" size={17} color="#9C7156" style={{ marginLeft: 3 }} />
          </View>
        </LiquidGlass>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 30 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Khoảng trống để lộ trọn vẹn minh họa hai bàn tay trao thiệp gốm từ ảnh nền */}
        <View style={styles.bannerArtworkSpacer} />

        {/* ========================================================================= */}
        {/* 3. Ô NHẬP ĐIỂM BẤT KỲ Ở GIỮA CÓ GẠCH CHÂN (Chuẩn Ảnh 2)                   */}
        {/* ========================================================================= */}
        <TouchableOpacity
          style={styles.bigPointsWrap}
          activeOpacity={1}
          onPress={() => pointsInputRef.current?.focus()}
        >
          <View style={styles.bigPointsRow}>
            <TextInput
              ref={pointsInputRef}
              style={styles.bigPointsInput}
              value={pointsInput}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9]/g, '');
                setPointsInput(cleaned);
              }}
              placeholder="0"
              placeholderTextColor="rgba(156, 113, 86, 0.4)"
              keyboardType="number-pad"
              keyboardAppearance="light"
              maxLength={6}
              selectTextOnFocus
              returnKeyType="done"
            />
            <Ionicons name="water" size={32} color="#9C7156" style={{ marginLeft: 4 }} />
          </View>
          <View style={styles.bigPointsUnderline} />
          <Text
            style={[
              styles.tapToChangePointsHint,
              giftPoints > availablePoints && styles.pointsHintWarning,
            ]}
          >
            {giftPoints > availablePoints
              ? `Vượt quá số dư khả dụng (${availablePoints} điểm)`
              : `Nhập số điểm muốn tặng (Khả dụng: ${availablePoints} điểm)`}
          </Text>
        </TouchableOpacity>

        {/* ========================================================================= */}
        {/* 4. FORM NHẬP LIỆU: SĐT NGƯỜI NHẬN & LỜI CHÚC + CHỌN THIỆP (Chuẩn Ảnh 2)   */}
        {/* ========================================================================= */}
        <View style={styles.formContainer}>
          {/* Ô 1: Số điện thoại người nhận * */}
          <View style={styles.phoneInputPill}>
            <TextInput
              style={styles.phoneTextInput}
              placeholder="Số điện thoại người nhận *"
              placeholderTextColor="#8C7A70"
              keyboardType="phone-pad"
              keyboardAppearance="light"
              value={recipientPhone}
              onChangeText={setRecipientPhone}
            />
          </View>

          {/* Ô 2: Lời chúc & Nút chọn thiệp */}
          <View style={styles.messageWithCardPickerRow}>
            {/* Khối nhập văn bản lời chúc */}
            <View style={styles.messageInputBox}>
              <TextInput
                style={styles.messageTextInput}
                placeholder="Nhập lời chúc và chọn thiệp để tặng Điểm nhé!"
                placeholderTextColor="#8C7A70"
                keyboardAppearance="light"
                multiline
                maxLength={150}
                value={giftMessage}
                onChangeText={setGiftMessage}
              />
              <Text style={styles.charCounterText}>{giftMessage.length}/150 ký tự</Text>
            </View>

            {/* Thẻ thumbnail Chọn thiệp bên phải */}
            <TouchableOpacity
              style={styles.selectCardThumbnailBtn}
              activeOpacity={0.85}
              onPress={handleOpenCardSelector}
            >
              <View style={styles.stampsPairIconWrap}>
                <View style={styles.stampBackLayer} />
                <View style={styles.stampFrontLayer}>
                  <Text style={styles.stampMiniBrand}>GỐM</Text>
                </View>
              </View>
              <Text style={styles.selectCardBtnText}>Chọn thiệp</Text>
            </TouchableOpacity>
          </View>

          {/* Thẻ tag gợi ý lời chúc nhanh (Như ảnh 2: "Cảm ơn bạn") */}
          <View style={styles.quickTagsContainer}>
            {['Cảm ơn bạn', 'Chúc mừng sinh nhật', 'Mừng tân gia', 'Tri kỷ gốm mộc'].map((tag) => (
              <TouchableOpacity
                key={tag}
                style={styles.quickTagPill}
                activeOpacity={0.8}
                onPress={() => handleSelectQuickTag(tag)}
              >
                <Text style={styles.quickTagPillText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Ghi chú quy tắc 24h tự động hoàn điểm */}
          <View style={styles.refundRuleNoteCard}>
            <Ionicons name="time-outline" size={16} color="#9C7156" style={{ marginRight: 6 }} />
            <Text style={styles.refundRuleNoteText}>
              Người nhận sẽ nhận được thông báo để xem thiệp và chấp nhận điểm. Nếu bị từ chối hoặc sau 24h chưa nhận, điểm sẽ tự động hoàn lại cho bạn.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 5. NÚT XÁC NHẬN ĐÁY TRANG (Chuẩn Ảnh 2: Nút viên thuốc lớn)               */}
        {/* ========================================================================= */}
        <TouchableOpacity
          style={[
            styles.confirmPillButton,
            !isFormValid && styles.confirmPillButtonDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!isFormValid || isSubmitting}
          onPress={handleConfirmSend}
        >
          <Text
            style={[
              styles.confirmButtonText,
              !isFormValid && styles.confirmButtonTextDisabled,
            ]}
          >
            {isSubmitting ? 'Đang tặng điểm...' : 'Xác nhận'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF4ED',
  },

  // 1. Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  headerRightTier: {
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8CCB2',
  },
  headerTierText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#2B2928',
    letterSpacing: 0.2,
  },
  headerPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  headerPointsNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#9C7156',
  },

  // Scroll Content
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // 2. Artwork Spacer
  bannerArtworkSpacer: {
    height: Math.min(SCREEN_WIDTH * 0.76, 310),
  },

  // 3. Con số điểm lớn ở giữa
  bigPointsWrap: {
    alignItems: 'center',
    marginVertical: 12,
  },
  bigPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPointsInput: {
    fontSize: 48,
    fontWeight: '900',
    color: '#9C7156',
    letterSpacing: 1,
    textAlign: 'center',
    minWidth: 50,
    paddingVertical: 0,
    paddingHorizontal: 6,
    includeFontPadding: false,
  },
  bigPointsUnderline: {
    width: 120,
    height: 2.5,
    backgroundColor: '#9C7156',
    marginTop: 4,
    borderRadius: 2,
  },
  tapToChangePointsHint: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#6E665D',
    marginTop: 6,
  },
  pointsHintWarning: {
    color: '#D9534F',
    fontWeight: '700',
  },

  // 4. Form nhập liệu
  formContainer: {
    gap: 12,
  },
  phoneInputPill: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8CCB2',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  phoneTextInput: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '600',
    color: '#2B2928',
  },

  // Ô Lời chúc + Thumbnail chọn thiệp
  messageWithCardPickerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  messageInputBox: {
    flex: 1,
    minHeight: 88,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8CCB2',
    borderRadius: 20,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  messageTextInput: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#2B2928',
    textAlignVertical: 'top',
    flex: 1,
    padding: 0,
  },
  charCounterText: {
    fontSize: 11,
    color: '#9E968D',
    textAlign: 'left',
    marginTop: 4,
  },
  selectCardThumbnailBtn: {
    width: 86,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8CCB2',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stampsPairIconWrap: {
    width: 44,
    height: 44,
    position: 'relative',
    marginBottom: 6,
  },
  stampBackLayer: {
    position: 'absolute',
    top: 0,
    left: 2,
    width: 32,
    height: 38,
    backgroundColor: '#E8CCB2',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '-12deg' }],
  },
  stampFrontLayer: {
    position: 'absolute',
    top: 4,
    left: 10,
    width: 32,
    height: 38,
    backgroundColor: '#9C7156',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  stampMiniBrand: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  selectCardBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
  },

  // Quick Tags
  quickTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  quickTagPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8CCB2',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  quickTagPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#9C7156',
  },

  // 24h Refund Rule Note
  refundRuleNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: '#E8CCB2',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  refundRuleNoteText: {
    flex: 1,
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#8A5A2B',
    lineHeight: 16,
  },

  // 5. Nút Xác Nhận Đáy Trang
  confirmPillButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#9C7156',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmPillButtonDisabled: {
    backgroundColor: '#D4C4B5',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmButtonTextDisabled: {
    color: '#FAF8F5',
  },
});
