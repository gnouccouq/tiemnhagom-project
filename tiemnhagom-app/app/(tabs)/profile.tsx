// app/(tabs)/profile.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Header } from '../../src/components/Header';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useWishlist } from '../../src/context/WishlistContext';
import { getUserOrders } from '../../src/services/orderService';
import { formatCurrency } from '../../src/utils/format';
import { openWebLink } from '../../src/utils/openWebLink';
import { useSettings, Language, FontSize } from '../../src/context/SettingsContext';

// Cấu hình hạng thành viên đồng bộ chuẩn xác từ Website Tiệm Nhà Gốm
const MEMBERSHIP_TIERS = [
  { id: 'null', name: 'Gốm Mộc', min: 0, discount: 0, color: '#95A5A6' },
  { id: 'new', name: 'Gốm Nung', min: 1000000, discount: 1, color: '#3498DB' },
  { id: 'mem', name: 'Gốm Men', min: 5000000, discount: 3, color: '#F1C40F' },
  { id: 'vip', name: 'Gốm Độc Bản', min: 10000000, discount: 5, color: '#E74C3C' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, userProfile, signOut, updateUserProfileData } = useAuth();
  const { favorites } = useWishlist();
  const { t } = useSettings();

  // Loyalty calculations
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  // Modal Chỉnh Sửa Thông Tin đã được tách thành edit-profile.tsx
  // Modal QR Thẻ Thành Viên
  const [qrModalVisible, setQrModalVisible] = useState(false);



  // Tính toán chi tiêu thực tế từ các đơn hàng để đồng bộ với web
  useEffect(() => {
    if (user) {
      setLoadingOrders(true);
      getUserOrders(user.uid)
        .then((orders) => {
          let spent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
          orders.forEach((o) => {
            const status = (o.status || '').toLowerCase();
            if (
              status.includes('hoàn thành') ||
              status.includes('thành công') ||
              status.includes('đang giao') ||
              status.includes('completed')
            ) {
              spent += Number(o.totalAmount || 0);
            }
          });
          setTotalSpent(spent);
        })
        .catch(() => {
          setTotalSpent(Number(userProfile?.totalSpent || userProfile?.spentTotal || 0));
        })
        .finally(() => setLoadingOrders(false));
    }
  }, [user, userProfile]);

  // Xác định hạng hội viên theo chi tiêu
  let currentTier = MEMBERSHIP_TIERS[0];
  let nextTier: (typeof MEMBERSHIP_TIERS)[0] | null = MEMBERSHIP_TIERS[1];

  for (let i = MEMBERSHIP_TIERS.length - 1; i >= 0; i--) {
    if (totalSpent >= MEMBERSHIP_TIERS[i].min) {
      currentTier = MEMBERSHIP_TIERS[i];
      nextTier = MEMBERSHIP_TIERS[i + 1] || null;
      break;
    }
  }

  // % thanh tiến độ thăng hạng
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.max(
          5,
          Math.round(((totalSpent - currentTier.min) / (nextTier.min - currentTier.min)) * 100)
        )
      )
    : 100;

  const points = userProfile?.points !== undefined ? userProfile.points : Math.floor(totalSpent / 100000);
  const memberCode = `TNG-${(user?.uid || userProfile?.uid || '1612').substring(0, 8).toUpperCase()}`;




  const openHotline = () => {
    Linking.openURL('tel:0909123456').catch(() => {
      Alert.alert(t('notification'), t('supportHotline'));
    });
  };

  const openWebsite = () => {
    openWebLink('https://tiemnhagom.vn', 'Tiệm Nhà Gốm');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <Header 
        title={t('account')} 
        showSearch={false} 
        showSettings={true}
        onSettingsPress={() => router.push('/settings')}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* 1. TOP USER GLASS PILL (Web Membership Style) */}
        {user || userProfile ? (
          <View style={styles.userGlassPill}>
            <View style={styles.userGlassLeft}>
              <View style={styles.userAvatarWrap}>
                {userProfile?.photoURL || user?.photoURL ? (
                  <Image
                    source={{ uri: userProfile?.photoURL || user?.photoURL || '' }}
                    style={styles.userAvatarImg}
                  />
                ) : (
                  <View style={styles.userAvatarPlaceholder}>
                    <Text style={styles.userAvatarInitial}>
                      {(userProfile?.displayName || user?.displayName || 'G')[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.userGlassInfo}>
                <Text style={styles.userGlassName} numberOfLines={1}>
                  {userProfile?.displayName || userProfile?.name || user?.displayName || t('guestCustomer')}
                </Text>
                <Text style={styles.userGlassEmail} numberOfLines={1}>
                  {userProfile?.email || user?.email || userProfile?.phone || t('guestMember')}
                </Text>
              </View>
            </View>

            {/* QR Shortcut */}
            <TouchableOpacity
              style={styles.qrShortcutBtn}
              activeOpacity={0.8}
              onPress={() => setQrModalVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.loginBannerCard}>
            <View style={styles.loginBannerIcon}>
              <Ionicons name="person-outline" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.loginBannerTitle}>{t('welcomeTitle')}</Text>
            <Text style={styles.loginBannerSubtitle}>
              {t('welcomeSubtitle')}
            </Text>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.88}
            >
              <Text style={styles.loginBtnText}>{t('loginRegister')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2. THÔNG TIN TÀI KHOẢN (Đồng bộ với Web) */}
        {(user || userProfile) && (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <Text style={styles.menuGroupHeader}>{t('accountInfo')}</Text>
              <TouchableOpacity style={styles.editPillBtn} onPress={() => router.push('/edit-profile')} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={14} color="#18181B" />
                <Text style={styles.editPillText}>{t('editInfo')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoRowsWrap}>
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{t('fullName')}</Text>
                <Text style={styles.infoRowVal}>
                  {userProfile?.displayName || userProfile?.name || user?.displayName || t('notUpdated')}
                </Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{t('email')}</Text>
                <Text style={styles.infoRowVal}>{userProfile?.email || user?.email || t('notUpdated')}</Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{t('phone')}</Text>
                <Text style={styles.infoRowVal}>{userProfile?.phone || t('notUpdated')}</Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{t('gender')}</Text>
                <Text style={styles.infoRowVal}>{userProfile?.gender || t('notUpdated')}</Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{t('dob')}</Text>
                <Text style={styles.infoRowVal}>
                  {userProfile?.dob || userProfile?.birthday || t('notUpdated')}
                </Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>{t('shippingAddress')}</Text>
                <Text style={styles.infoRowVal} numberOfLines={2}>
                  {userProfile?.address || userProfile?.fullAddress || t('notUpdated')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 3. ĐIỀU HƯỚNG NHANH (Orders, Favorites, Cart) */}
        <View style={styles.menuCard}>
          <Text style={styles.menuGroupHeader}>{t('myOrders')}</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/orders')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="receipt-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('orderHistory')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7A827E" />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/favorites')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="heart-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('favoriteProducts')}</Text>
            </View>
            <View style={styles.menuRight}>
              <Text style={styles.counterBadgeText}>{favorites.length}</Text>
              <Ionicons name="chevron-forward" size={18} color="#7A827E" />
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/cart')}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="bag-handle-outline" size={20} color="#18181B" />
              <Text style={styles.menuTitle}>{t('myCart')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7A827E" />
          </TouchableOpacity>
        </View>



        {/* 5. ĐIỀU KHOẢN & CHÍNH SÁCH */}
        <View style={styles.menuCard}>
          <Text style={styles.menuGroupHeader}>{t('termsPolicy')}</Text>

          <TouchableOpacity style={styles.menuItem} onPress={() => openWebLink('https://tiemnhagom.vn/chinh-sach/privacy-policy.html', 'Chính sách Bảo mật')} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('privacyPolicy')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7A827E" />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => openWebLink('https://tiemnhagom.vn/chinh-sach/terms-of-service.html', 'Điều khoản Dịch vụ')} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <Ionicons name="document-text-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('termOfService')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7A827E" />
          </TouchableOpacity>
        </View>

        {/* 6. HỖ TRỢ & LIÊN HỆ */}
        <View style={styles.menuCard}>
          <Text style={styles.menuGroupHeader}>{t('supportContact')}</Text>

          <TouchableOpacity style={styles.menuItem} onPress={openHotline} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <Ionicons name="call-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('hotlineAdvisory')}</Text>
            </View>
            <Text style={styles.menuValue}>0777709662</Text>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={openWebsite} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <Ionicons name="mail-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('contactEmail')}</Text>
            </View>
            <Text style={styles.menuValue}>tiemnhagom.contact@gmail.com</Text>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={openWebsite} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <Ionicons name="globe-outline" size={20} color="#2D3B34" />
              <Text style={styles.menuTitle}>{t('officialWebsite')}</Text>
            </View>
            <Text style={styles.menuValue}>tiemnhagom.vn</Text>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => openWebLink('https://maps.app.goo.gl/7Jxw7yJyaQG8wkHeA', 'Địa chỉ cửa hàng')} activeOpacity={0.7}>
            <View style={styles.menuLeft}>
              <Ionicons name="location-outline" size={20} color="#2D3B34" />
              <View>
                <Text style={styles.menuTitle}>{t('storeAddress')}</Text>
                <Text style={styles.menuSubtitle}>{t('openingHours')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7A827E" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 2: MÃ THÀNH VIÊN & MÃ VẠCH QUÉT TẠI QUẦY (QR CODE MODAL)           */}
      {/* ========================================================================= */}
      <Modal
        visible={qrModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.qrCardModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('memberCodeTitle')}</Text>
              <TouchableOpacity
                onPress={() => setQrModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color="#5D6160" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrModalBody}>
              <View style={styles.qrBox}>
                <Ionicons name="qr-code" size={130} color="#2D3B34" />
              </View>

              <Text style={styles.qrCodeLabel}>{memberCode}</Text>
              <Text style={styles.qrTierName}>{currentTier.name} • {points} Dots</Text>

              <View style={styles.barcodePlaceholder}>
                <View style={styles.barcodeLinesRow}>
                  {Array.from({ length: 28 }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.barcodeBar,
                        { width: (i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1), height: 36 },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <Text style={styles.qrHelpText}>
                {t('scanAtCounter')}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },

  // 1. User Glass Pill (Đồng bộ với tab Ưu đãi - deals.tsx)
  userGlassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181B',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 16,
  },
  userGlassLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  userAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  userAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userGlassInfo: {
    flex: 1,
  },
  userGlassName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userGlassEmail: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 2,
  },
  qrShortcutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },

  // Login Banner Card (khi chưa đăng nhập)
  loginBannerCard: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  loginBannerIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loginBannerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  loginBannerSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 18,
    marginVertical: 8,
    maxWidth: 290,
  },
  loginBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  loginBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },

  // 2. Loyalty Tier Card (Phong cách thẻ hội viên website)
  tierCard: {
    backgroundColor: '#26342E',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  tierCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tierCardType: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#A2B4AB',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierCardName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  discountBadge: {
    backgroundColor: '#E5B869',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#1C2420',
  },
  tierHintText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#D8E2DC',
    marginTop: 14,
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 4,
    position: 'relative',
    marginVertical: 4,
    justifyContent: 'center',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#E5B869',
    borderRadius: 4,
  },
  progressThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5B869',
    top: -3,
  },
  tierMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  tierMetaCol: {
    flex: 1,
  },
  tierMetaDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 12,
  },
  tierMetaLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#A2B4AB',
  },
  tierMetaVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  tierMetaValHighlight: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '800',
    color: '#E5B869',
    marginTop: 2,
  },

  // 3. Info Card
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#2D3B34',
  },
  editPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    gap: 4,
  },
  editPillText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#18181B',
  },
  infoRowsWrap: {
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    alignItems: 'center',
  },
  infoRowLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#7A827E',
    flex: 1,
  },
  infoRowVal: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3B34',
    textAlign: 'right',
    flex: 1.5,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E1E8DF',
  },

  // 4. Menu Card
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  menuGroupHeader: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#7A827E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingTop: 10,
    paddingBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  menuItemStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  counterBadgeText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#C86432',
  },
  menuTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#2D3B34',
    fontWeight: '500',
  },
  menuSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#7A827E',
    marginTop: 2,
  },
  menuValue: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#18181B',
    fontWeight: '600',
  },

  // Logout Button
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFECEC',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  logoutBtnText: {
    fontFamily: 'ElleGaborStd',
    color: '#D32F2F',
    fontWeight: '700',
    fontSize: 13,
  },

  footerWrap: {
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  footerBrand: {
    fontFamily: 'ElleGaborStd',
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },
  footerVersion: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  footerSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // =========================================================================
  // MODAL STYLES
  // =========================================================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FAF8F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8DF',
  },
  modalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3B34',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF3EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  avatarPickerSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarPickerWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E1E8DF',
  },
  avatarPickerImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPickerPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF3EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: 'rgba(59, 77, 69, 0.85)',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeAvatarText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#3B4D45',
    fontWeight: '600',
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    fontWeight: '600',
    color: '#3B4D45',
    marginBottom: 6,
  },
  inputField: {
    fontFamily: 'ElleGaborStd',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 13,
    color: '#2D3B34',
  },
  inputFieldMultiline: {
    borderRadius: 18,
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    alignItems: 'center',
  },
  genderChipActive: {
    backgroundColor: '#3B4D45',
    borderColor: '#3B4D45',
  },
  genderChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#5D6160',
    fontWeight: '600',
  },
  genderChipTextActive: {
    color: '#FFFFFF',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: '#EEF3EB',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
  },
  cancelBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#5D6160',
  },
  saveBtn: {
    flex: 1.6,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: '#3B4D45',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  saveBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // QR Modal
  qrCardModal: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  qrModalBody: {
    padding: 24,
    alignItems: 'center',
  },
  qrBox: {
    padding: 14,
    backgroundColor: '#FAF8F5',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    marginBottom: 12,
  },
  qrCodeLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '800',
    color: '#2D3B34',
    letterSpacing: 1.5,
  },
  qrTierName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    color: '#7A827E',
    marginTop: 4,
    marginBottom: 14,
  },
  barcodePlaceholder: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#FAF8F5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    marginBottom: 14,
  },
  barcodeLinesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  barcodeBar: {
    backgroundColor: '#2D3B34',
  },
  qrHelpText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#7A827E',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 240,
  },

  // =========================================================================
  // SETTINGS MODAL STYLES
  // =========================================================================
  settingsModalCard: {
    backgroundColor: '#FAF8F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsModalContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  settingsGroup: {
    marginBottom: 20,
  },
  settingsGroupTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#2D3B34',
    marginBottom: 3,
  },
  settingsGroupSubtitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    color: '#7A827E',
    marginBottom: 10,
  },
  optionsList: {
    gap: 8,
  },
  settingOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  settingOptionCardActive: {
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
  },
  settingOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langFlagEmoji: {
    fontSize: 24,
  },
  settingOptionName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    color: '#333333',
  },
  settingOptionNameActive: {
    color: '#000000',
    fontWeight: '700',
  },
  settingOptionDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    color: '#888888',
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#000000',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000000',
  },
  fontSizeGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  fontSizeChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  fontSizeChipActive: {
    borderColor: '#000000',
    backgroundColor: '#000000',
  },
  fontSizeChipLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
  },
  fontSizeChipLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  fontSizeChipSub: {
    fontFamily: 'ElleGaborStd',
    fontSize: 10,
    color: '#888888',
    marginTop: 2,
  },
  fontSizeChipSubActive: {
    color: '#D4D4D8',
  },
  previewBox: {
    backgroundColor: '#EEF3EB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1E8DF',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  previewHeaderLabel: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '600',
    color: '#5D6160',
  },
  previewSampleText: {
    fontFamily: 'ElleGaborStd',
    color: '#2D3B34',
  },
  cacheActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8DF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cacheLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cacheBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    color: '#333333',
    fontWeight: '500',
  },
  settingsModalActions: {
    gap: 10,
    marginTop: 10,
  },
  saveSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingVertical: 13,
    borderRadius: 16,
  },
  saveSettingsBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelSettingsBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  cancelSettingsBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#7A827E',
  },
});
