// app/gift-points.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Platform,
  Share,
  Clipboard,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { AnimatedCenterModal } from '../src/components/AnimatedCenterModal';
import {
  createGiftPoints,
  GiftTheme,
  GiftPointsTransaction,
} from '../src/services/giftPointsService';

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

  // Tính số điểm khả dụng của người dùng
  const userTotalSpent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
  const baseEarned = Math.floor(userTotalSpent / 10000);
  const rawPts = userProfile?.points !== undefined && userProfile?.points !== null ? Number(userProfile.points) : 0;
  const cleanPts = (rawPts === 50 && userTotalSpent < 500000) ? 0 : rawPts;
  const giftBonus = Number((userProfile as any)?.giftPointsBonus || 0);
  const giftDeduction = Number((userProfile as any)?.giftPointsDeduction || 0);
  const availablePoints = Math.max(0, Math.max(baseEarned, cleanPts) + giftBonus - giftDeduction);

  const currentTierName = userProfile?.membershipTier || userProfile?.tier || 'Gốm Mộc';
  const displayName = userProfile?.displayName || userProfile?.name || user?.displayName || 'Thành viên Tiệm Nhà Gốm';

  // State nhập liệu theo chuẩn Ảnh 2
  const [giftPoints, setGiftPoints] = useState<number>(availablePoints >= 20 ? 20 : Math.max(5, availablePoints));
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

  // Modal chọn số điểm khi bấm vào con số lớn
  const [pointsPickerVisible, setPointsPickerVisible] = useState<boolean>(false);
  const [customPointsInput, setCustomPointsInput] = useState<string>('');

  // Modal thành công
  const [createdGift, setCreatedGift] = useState<GiftPointsTransaction | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
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

      setCreatedGift(gift);
      setSuccessModalVisible(true);
      setIsCopied(false);
      triggerHaptic();
    } catch (err) {
      console.warn('Lỗi tạo quà tặng điểm:', err);
      dialog.alert('Thông báo', 'Có lỗi xảy ra khi tạo mã quà tặng. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Chia sẻ quà tặng
  const handleShareGift = async (gift: GiftPointsTransaction) => {
    const body = `🎁 Bạn vừa nhận được món quà ${gift.points} Điểm Gốm từ ${gift.senderName} tại Tiệm Nhà Gốm!\n\n"${gift.message}"\n\n👉 Mã nhận điểm của bạn: ${gift.code}\n(Mã có hiệu lực trong 24 giờ. Mở ứng dụng Tiệm Nhà Gốm > Bạn bè > Nhận điểm để nạp điểm ngay nhé!)`;

    try {
      await Share.share({
        message: body,
        title: '🎁 Tặng Điểm Gốm - Tiệm Nhà Gốm',
      });
    } catch (err) {
      console.warn('Lỗi chia sẻ:', err);
    }
  };

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    setIsCopied(true);
    triggerHaptic();
    setTimeout(() => setIsCopied(false), 2000);
  };

  const isFormValid = recipientPhone.trim().length >= 9 && giftPoints >= 5 && giftPoints <= availablePoints;

  return (
    <View style={styles.safeArea}>
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

        <LiquidGlass interactive={false} effect="regular" style={styles.headerRightTier}>
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
        {/* 3. CON SỐ ĐIỂM LỚN Ở GIỮA CÓ GẠCH CHÂN                                   */}
        {/* ========================================================================= */}
        <TouchableOpacity
          style={styles.bigPointsWrap}
          activeOpacity={0.85}
          onPress={() => setPointsPickerVisible(true)}
        >
          <View style={styles.bigPointsRow}>
            <Text style={styles.bigPointsNumber}>{giftPoints}</Text>
            <Ionicons name="water" size={32} color="#9C7156" style={{ marginLeft: 6 }} />
          </View>
          <View style={styles.bigPointsUnderline} />
          <Text style={styles.tapToChangePointsHint}>
            Chạm để đổi số điểm (Khả dụng: {availablePoints} điểm)
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
              Sau 24h nếu người nhận chưa nhập mã, hệ thống sẽ tự động hoàn lại điểm cho bạn.
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
            {isSubmitting ? 'Đang tạo quà tặng...' : 'Xác nhận'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ========================================================================= */}
      {/* 6. MODAL CHỌN SỐ ĐIỂM TẶNG                                                */}
      {/* ========================================================================= */}
      <Modal
        visible={pointsPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPointsPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerModalBackdrop}
          activeOpacity={1}
          onPress={() => setPointsPickerVisible(false)}
        >
          <View style={styles.pickerModalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerModalTitle}>Chọn số điểm muốn tặng</Text>
            <Text style={styles.pickerModalSubtitle}>
              Số dư khả dụng: {availablePoints} Điểm Gốm
            </Text>

            <View style={styles.quickPointsGrid}>
              {[10, 20, 50, 100].map((pt) => {
                const isSelected = giftPoints === pt && !customPointsInput.trim();
                return (
                  <TouchableOpacity
                    key={pt}
                    style={[styles.pointChoiceChip, isSelected && styles.pointChoiceChipActive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      triggerHaptic();
                      setGiftPoints(pt);
                      setCustomPointsInput('');
                      setPointsPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.pointChoiceText, isSelected && styles.pointChoiceTextActive]}>
                      {pt} Điểm
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.customPointModalInput}
              placeholder="Hoặc nhập số điểm khác..."
              placeholderTextColor="#888"
              keyboardType="numeric"
              value={customPointsInput}
              onChangeText={(txt) => {
                const digits = txt.replace(/\D/g, '');
                setCustomPointsInput(digits);
                if (digits) {
                  setGiftPoints(parseInt(digits, 10));
                }
              }}
            />

            <TouchableOpacity
              style={styles.confirmChoiceBtn}
              activeOpacity={0.85}
              onPress={() => setPointsPickerVisible(false)}
            >
              <Text style={styles.confirmChoiceBtnText}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. MODAL TẶNG QUÀ THÀNH CÔNG (HIỆU LỰC 24H)                               */}
      {/* ========================================================================= */}
      <AnimatedCenterModal
        visible={successModalVisible}
        onClose={() => setSuccessModalVisible(false)}
        contentStyle={styles.successModalBody}
      >
        <View style={styles.successContentInner}>
          <View style={styles.successIconBubble}>
            <Ionicons name="checkmark-circle" size={54} color="#8B1E1E" />
          </View>

          <Text style={styles.successDialogTitle}>Tạo Quà Tặng Thành Công!</Text>
          <Text style={styles.successDialogDesc}>
            Mã quà tặng {createdGift?.points} Điểm Gốm đã được gửi tới số {createdGift?.recipientPhone}.
          </Text>

          {createdGift && (
            <View style={styles.giftCodeCardWrap}>
              <Text style={styles.giftCodeLabelText}>Mã nhận điểm của bạn:</Text>
              <Text style={styles.giftCodeValueText}>{createdGift.code}</Text>

              <View style={styles.validityCountdownBadge}>
                <Ionicons name="time" size={13} color="#8B1E1E" />
                <Text style={styles.validityCountdownText}>
                  Hiệu lực 24 giờ • Tự động hoàn lại điểm nếu chưa nạp
                </Text>
              </View>

              <TouchableOpacity
                style={styles.copyCodeActionBtn}
                activeOpacity={0.8}
                onPress={() => handleCopyCode(createdGift.code)}
              >
                <Ionicons
                  name={isCopied ? 'checkmark' : 'copy-outline'}
                  size={16}
                  color="#8B1E1E"
                />
                <Text style={styles.copyCodeActionText}>
                  {isCopied ? 'Đã sao chép mã quà' : 'Sao chép mã'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.shareViaAppsBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (createdGift) handleShareGift(createdGift);
            }}
          >
            <Ionicons name="share-social-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.shareViaAppsText}>Gửi qua Zalo / Tin nhắn</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeSuccessModalBtn}
            activeOpacity={0.7}
            onPress={() => {
              setSuccessModalVisible(false);
              router.back();
            }}
          >
            <Text style={styles.closeSuccessModalText}>Hoàn tất</Text>
          </TouchableOpacity>
        </View>
      </AnimatedCenterModal>
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
  },
  bigPointsNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#9C7156',
    letterSpacing: 1,
  },
  bigPointsUnderline: {
    width: 90,
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

  // 6. Modal Chọn Điểm
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerModalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  pickerModalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '800',
    color: '#2B2928',
    textAlign: 'center',
  },
  pickerModalSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#8A5A2B',
    textAlign: 'center',
  },
  quickPointsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  pointChoiceChip: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#FAF5EE',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  pointChoiceChipActive: {
    backgroundColor: '#8B1E1E',
    borderColor: '#8B1E1E',
  },
  pointChoiceText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#2B2928',
  },
  pointChoiceTextActive: {
    color: '#FFFFFF',
  },
  customPointModalInput: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FAF5EE',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    paddingHorizontal: 16,
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    color: '#2B2928',
  },
  confirmChoiceBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  confirmChoiceBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 7. Modal Thành Công
  successModalBody: {
    width: '90%',
    maxWidth: 380,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  successContentInner: {
    alignItems: 'center',
    gap: 12,
  },
  successIconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF1EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successDialogTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 19,
    fontWeight: '800',
    color: '#2B2928',
    textAlign: 'center',
  },
  successDialogDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#6E665D',
    textAlign: 'center',
    lineHeight: 18,
  },
  giftCodeCardWrap: {
    width: '100%',
    backgroundColor: '#FFF9F5',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#8B1E1E',
    padding: 16,
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  giftCodeLabelText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#8A5A2B',
  },
  giftCodeValueText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#8B1E1E',
    letterSpacing: 1.5,
  },
  validityCountdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF1EE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  validityCountdownText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8B1E1E',
  },
  copyCodeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    marginTop: 2,
  },
  copyCodeActionText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '700',
    color: '#8B1E1E',
  },
  shareViaAppsBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#8B1E1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  shareViaAppsText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeSuccessModalBtn: {
    paddingVertical: 8,
  },
  closeSuccessModalText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
});
