import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Linking,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

import { db } from '../src/config/firebase';
import { useThemeColor } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { useDialog } from '../src/context/DialogContext';
import { Header } from '../src/components/Header';
import { formatVND } from '../src/services/orderNotificationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2;

interface FlowerSample {
  id: string;
  name: string;
  category: string;
  price: number;
  priceText?: string;
  imageUrl: string;
  images?: string[];
  flowersUsed?: string;
  description?: string;
  vasePairing?: string;
  order?: number;
}

const FALLBACK_FLOWERS: FlowerSample[] = [
  {
    id: 'f1',
    name: 'Giỏ Hoa Nắng Mai',
    category: 'Giỏ hoa',
    price: 650000,
    imageUrl: 'https://tiemnhagom.vn/Asset/images/hoa-nha-gom.webp',
    flowersUsed: 'Hồng kem, Cát tường, Cúc mẫu đơn & Giỏ mây đan',
    description: 'Sắc kem dịu nhẹ phối cùng giỏ mây thủ công, thích hợp tặng sinh nhật và chúc mừng.',
  },
  {
    id: 'f2',
    name: 'Bó Hoa Hồng Ohara',
    category: 'Bó hoa',
    price: 550000,
    imageUrl: 'https://tiemnhagom.vn/Asset/images/hoa-nha-gom.webp',
    flowersUsed: 'Hồng Ohara, Cát tường kép, Thảo mộc theo mùa',
    description: 'Bó hoa phong cách mộc mạc bọc giấy kraft Hàn Quốc kèm thiệp viết tay.',
  },
  {
    id: 'f3',
    name: 'Bình Gốm Hoa Theo Mùa',
    category: 'Bình gốm & Hoa',
    price: 890000,
    imageUrl: 'https://tiemnhagom.vn/Asset/images/hoa-nha-gom.webp',
    flowersUsed: 'Hoa tươi tuyển theo mùa cắm trực tiếp trên bình gốm Tiệm',
    description: 'Tặng kèm bình gốm thủ công nung 1200°C, chưng bàn trà hoặc phòng khách sang trọng.',
  },
  {
    id: 'f4',
    name: 'Hoa Cưới Rum Trắng',
    category: 'Hoa cưới',
    price: 1200000,
    imageUrl: 'https://tiemnhagom.vn/Asset/images/hoa-nha-gom.webp',
    flowersUsed: 'Rum trắng, Hồng trắng nhập, Lan hồ điệp (kèm hoa cài áo)',
    description: 'Thiết kế tối giản thanh lịch cho cô dâu hiện đại, giữ tươi suốt ngày lễ.',
  },
];

export default function HoaNhaGomScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile } = useAuth();
  const dialog = useDialog();

  const [scrollY, setScrollY] = useState(0);
  const [flowers, setFlowers] = useState<FlowerSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');

  // Detail & Order Modal
  const [activeFlower, setActiveFlower] = useState<FlowerSample | null>(null);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCustName(userProfile?.displayName || userProfile?.name || user?.displayName || '');
    setCustPhone(userProfile?.phone || user?.phoneNumber || '');
  }, [userProfile, user]);

  useEffect(() => {
    const loadFlowers = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'flowers'));
        const data = snap.exists() ? snap.data() : null;
        const rawItems: any[] = Array.isArray(data?.items) ? data.items : [];
        if (rawItems.length > 0) {
          const normalized: FlowerSample[] = rawItems
            .filter((it) => it && (it.name || it.title) && it.hidden !== true)
            .map((it, idx) => ({
              id: String(it.id || it.slug || `flower-${idx}`),
              name: String(it.name || it.title || '').trim(),
              category: String(it.category || 'Bó hoa').trim(),
              price: Number(it.price) || 0,
              priceText: it.priceText ? String(it.priceText) : undefined,
              imageUrl: String(
                it.imageUrl || it.coverImage || (Array.isArray(it.images) ? it.images[0] : '') || ''
              ),
              images: Array.isArray(it.images) ? it.images.filter(Boolean) : [],
              flowersUsed: it.flowersUsed ? String(it.flowersUsed) : '',
              description: it.description ? String(it.description) : '',
              vasePairing: it.vasePairing ? String(it.vasePairing) : '',
              order: typeof it.order === 'number' ? it.order : idx,
            }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          setFlowers(normalized.length > 0 ? normalized : FALLBACK_FLOWERS);
        } else {
          setFlowers(FALLBACK_FLOWERS);
        }
      } catch {
        setFlowers(FALLBACK_FLOWERS);
      } finally {
        setLoading(false);
      }
    };
    loadFlowers();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>(['Tất cả']);
    flowers.forEach((f) => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set);
  }, [flowers]);

  const filteredFlowers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return flowers.filter((f) => {
      if (selectedCategory !== 'Tất cả' && f.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.flowersUsed || '').toLowerCase().includes(q) ||
        (f.category || '').toLowerCase().includes(q)
      );
    });
  }, [flowers, selectedCategory, searchQuery]);

  const handleSubmitOrder = async () => {
    if (!custName.trim() || !custPhone.trim()) {
      dialog.alert('Thiếu thông tin', 'Vui lòng nhập họ tên và số điện thoại để Tiệm liên hệ xác nhận mẫu hoa.');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'flower_inquiries'), {
        flowerId: activeFlower?.id || '',
        flowerName: activeFlower?.name || 'Đặt hoa theo yêu cầu',
        flowerPrice: activeFlower?.price || 0,
        customerName: custName.trim(),
        phone: custPhone.trim(),
        deliveryDate: deliveryDate.trim(),
        note: note.trim(),
        userId: user?.uid || userProfile?.uid || null,
        source: 'mobile-app',
        status: 'new',
        createdAt: serverTimestamp(),
      });
      setOrderFormOpen(false);
      setActiveFlower(null);
      setNote('');
      setDeliveryDate('');
      dialog.alert(
        'Đã gửi yêu cầu đặt hoa',
        'Tiệm Nhà Gốm đã nhận thông tin và sẽ liên hệ xác nhận mẫu hoa trong ít phút.'
      );
    } catch {
      dialog.alert('Lỗi kết nối', 'Không thể gửi yêu cầu lúc này. Bạn có thể gọi Hotline 0777 709 662 để đặt nhanh.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title="Hoa Nhà Gốm"
        showBack={true}
        showSearch={false}
        showCart={true}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56 + 8, paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* HERO BANNER */}
        <View style={styles.heroCard}>
          <Image
            source={require('../assets/images/hoa-nha-gom.webp')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.1)', 'rgba(20,14,10,0.78)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroKicker}>HOA TƯƠI & GỐM THỦ CÔNG</Text>
            <Text style={styles.heroTitle}>Hoa Nhà Gốm</Text>
            <Text style={styles.heroDesc}>
              Hoa tươi tuyển chọn mỗi ngày, phối cùng bình gốm thủ công và thiệp viết tay mộc mạc.
            </Text>
          </View>
        </View>

        {/* SEARCH BAR */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted || '#9E968D'} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm mẫu hoa, loại hoa..."
            placeholderTextColor={Colors.textMuted || '#9E968D'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted || '#9E968D'} />
            </TouchableOpacity>
          )}
        </View>

        {/* CATEGORY PILLS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.catPill, active && styles.catPillActive]}
                activeOpacity={0.8}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catPillText, active && styles.catPillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* SAMPLE GRID (4:5 PORTRAIT) */}
        {loading ? (
          <ActivityIndicator size="large" color="#9C7156" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.grid}>
            {filteredFlowers.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.flowerCard}
                activeOpacity={0.85}
                onPress={() => {
                  setActiveFlower(item);
                  setOrderFormOpen(false);
                }}
              >
                <View style={styles.flowerImgWrap}>
                  <Image
                    source={
                      item.imageUrl
                        ? { uri: item.imageUrl }
                        : require('../assets/images/hoa-nha-gom.webp')
                    }
                    style={styles.flowerImg}
                    contentFit="cover"
                  />
                  <View style={styles.catTag}>
                    <Text style={styles.catTagText} numberOfLines={1}>{item.category}</Text>
                  </View>
                </View>

                <View style={styles.flowerBody}>
                  <Text style={styles.flowerName} numberOfLines={2}>{item.name}</Text>
                  {!!item.flowersUsed && (
                    <Text style={styles.flowerSub} numberOfLines={1}>{item.flowersUsed}</Text>
                  )}
                  <Text style={styles.flowerPrice}>
                    {item.priceText || (item.price > 0 ? formatVND(item.price) : 'Liên hệ báo giá')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* DETAIL & ORDER MODAL */}
      <Modal
        visible={Boolean(activeFlower)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveFlower(null)}
      >
        {activeFlower && (
          <View style={[styles.modalContainer, { paddingTop: insets.top || 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                {orderFormOpen ? 'Đặt mẫu hoa' : activeFlower.name}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  if (orderFormOpen) setOrderFormOpen(false);
                  else setActiveFlower(null);
                }}
              >
                <Ionicons name={orderFormOpen ? 'arrow-back' : 'close'} size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 20 }}
            >
              {!orderFormOpen ? (
                <>
                  <Image
                    source={
                      activeFlower.imageUrl
                        ? { uri: activeFlower.imageUrl }
                        : require('../assets/images/hoa-nha-gom.webp')
                    }
                    style={styles.detailHeroImg}
                    contentFit="cover"
                  />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailCat}>{activeFlower.category}</Text>
                    <Text style={styles.detailTitle}>{activeFlower.name}</Text>
                    <Text style={styles.detailPrice}>
                      {activeFlower.priceText || (activeFlower.price > 0 ? formatVND(activeFlower.price) : 'Liên hệ báo giá')}
                    </Text>

                    {!!activeFlower.flowersUsed && (
                      <View style={styles.detailInfoBox}>
                        <Text style={styles.detailInfoLabel}>Thành phần hoa</Text>
                        <Text style={styles.detailInfoText}>{activeFlower.flowersUsed}</Text>
                      </View>
                    )}

                    {!!activeFlower.description && (
                      <Text style={styles.detailDesc}>{activeFlower.description}</Text>
                    )}

                    <TouchableOpacity
                      style={styles.primaryCtaBtn}
                      activeOpacity={0.86}
                      onPress={() => setOrderFormOpen(true)}
                    >
                      <Text style={styles.primaryCtaText}>Đặt mẫu hoa này</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryCtaBtn}
                      activeOpacity={0.8}
                      onPress={() => Linking.openURL('tel:0777709662')}
                    >
                      <Ionicons name="call-outline" size={18} color={Colors.textPrimary} />
                      <Text style={styles.secondaryCtaText}>Gọi tư vấn nhanh · 0777 709 662</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.detailContent}>
                  <Text style={styles.formSummary}>Mẫu đã chọn: {activeFlower.name}</Text>

                  <Text style={styles.inputLabel}>Họ và tên *</Text>
                  <TextInput
                    style={styles.inputField}
                    value={custName}
                    onChangeText={setCustName}
                    placeholder="Nhập họ tên của bạn"
                    placeholderTextColor={Colors.textMuted || '#9E968D'}
                  />

                  <Text style={styles.inputLabel}>Số điện thoại *</Text>
                  <TextInput
                    style={styles.inputField}
                    value={custPhone}
                    onChangeText={setCustPhone}
                    keyboardType="phone-pad"
                    placeholder="Nhập số điện thoại liên hệ"
                    placeholderTextColor={Colors.textMuted || '#9E968D'}
                  />

                  <Text style={styles.inputLabel}>Ngày giao dự kiến</Text>
                  <TextInput
                    style={styles.inputField}
                    value={deliveryDate}
                    onChangeText={setDeliveryDate}
                    placeholder="VD: 28/11 - Buổi sáng"
                    placeholderTextColor={Colors.textMuted || '#9E968D'}
                  />

                  <Text style={styles.inputLabel}>Ghi chú / Nội dung thiệp</Text>
                  <TextInput
                    style={[styles.inputField, { height: 92, textAlignVertical: 'top', paddingTop: 12 }]}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    placeholder="Tone màu mong muốn hoặc lời chúc viết thiệp..."
                    placeholderTextColor={Colors.textMuted || '#9E968D'}
                  />

                  <TouchableOpacity
                    style={[styles.primaryCtaBtn, submitting && { opacity: 0.6 }]}
                    disabled={submitting}
                    onPress={handleSubmitOrder}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryCtaText}>Gửi yêu cầu đặt hoa</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#000000' : '#FAF8F5'),
    },
    scrollContent: {
      paddingHorizontal: 16,
    },
    heroCard: {
      height: 185,
      borderRadius: 24,
      overflow: 'hidden',
      justifyContent: 'flex-end',
      marginBottom: 16,
    },
    heroContent: {
      padding: 18,
    },
    heroKicker: {
      fontSize: 11,
      fontWeight: '700',
      color: '#E8CCB2',
      letterSpacing: 1,
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    heroDesc: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
      lineHeight: 18,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 16,
      paddingHorizontal: 14,
      height: 46,
      gap: 10,
      marginBottom: 12,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    searchInput: {
      flex: 1,
      fontSize: 14.5,
      color: Colors.textPrimary,
    },
    catRow: {
      gap: 8,
      paddingBottom: 14,
    },
    catPill: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    catPillActive: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    catPillText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: Colors.textPrimary,
    },
    catPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: CARD_GAP,
    },
    flowerCard: {
      width: CARD_WIDTH,
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    flowerImgWrap: {
      width: '100%',
      aspectRatio: 4 / 5,
      position: 'relative',
    },
    flowerImg: {
      width: '100%',
      height: '100%',
    },
    catTag: {
      position: 'absolute',
      top: 10,
      left: 10,
      backgroundColor: 'rgba(24,22,21,0.68)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    catTagText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    flowerBody: {
      padding: 12,
    },
    flowerName: {
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 19,
    },
    flowerSub: {
      fontSize: 12,
      color: Colors.textMuted || '#7D756C',
      marginTop: 3,
    },
    flowerPrice: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? '#E8CCB2' : '#9C7156',
      marginTop: 6,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#000000' : '#FAF8F5'),
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    modalHeaderTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginRight: 12,
    },
    modalCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#EFEAE2'),
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailHeroImg: {
      width: '100%',
      aspectRatio: 4 / 5,
    },
    detailContent: {
      padding: 20,
    },
    detailCat: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#9C7156',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    detailTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginTop: 4,
    },
    detailPrice: {
      fontSize: 18,
      fontWeight: '800',
      color: isDark ? '#E8CCB2' : '#9C7156',
      marginTop: 6,
      marginBottom: 14,
    },
    detailInfoBox: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
    },
    detailInfoLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: Colors.textMuted || '#7D756C',
      marginBottom: 4,
    },
    detailInfoText: {
      fontSize: 14,
      color: Colors.textPrimary,
      lineHeight: 20,
    },
    detailDesc: {
      fontSize: 14.5,
      color: Colors.textMuted || '#6E665D',
      lineHeight: 22,
      marginBottom: 20,
    },
    primaryCtaBtn: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#9C7156' : '#181615',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    primaryCtaText: {
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    secondaryCtaBtn: {
      height: 48,
      borderRadius: 24,
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#EFEAE2'),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 10,
    },
    secondaryCtaText: {
      fontSize: 14.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    formSummary: {
      fontSize: 15,
      fontWeight: '700',
      color: '#9C7156',
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 6,
      marginTop: 10,
    },
    inputField: {
      height: 48,
      borderRadius: 14,
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      paddingHorizontal: 14,
      fontSize: 15,
      color: Colors.textPrimary,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
  });
