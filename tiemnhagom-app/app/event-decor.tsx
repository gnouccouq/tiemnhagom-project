import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../src/config/firebase';
import { useThemeColor, Spacing, Typography } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useAuth } from '../src/context/AuthContext';
import { Header } from '../src/components/Header';
import { ScalePressable } from '../src/components/ScalePressable';
import { LiquidGlass } from '../src/components/LiquidGlass';
import { formatVND, createOrderPlacedNotification } from '../src/services/orderNotificationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Interface cho Dự án thực tế (đọc từ Firestore settings/events)
interface EventProject {
  id?: string;
  name: string;
  imageUrl: string;
  category?: string;
  description?: string;
  tags?: string[];
  dateStr?: string;
}

// Interface cho Sản phẩm gốm cho thuê (đọc từ Firestore products)
interface RentalProduct {
  id: string;
  name: string;
  price: number;
  rentalPrice: number;
  imageUrl: string;
  hoverImageUrl?: string;
  category?: string;
  stock?: number;
  dimensions?: string;
  description?: string;
}

// Interface cho Giỏ đồ thuê trong session
interface RentalCartItem {
  product: RentalProduct;
  quantity: number;
}

export default function EventDecorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const { t } = useSettings();
  const { user, userProfile } = useAuth();

  // Tab điều hướng: 'projects' | 'catalog' | 'consult'
  const [activeTab, setActiveTab] = useState<'projects' | 'catalog' | 'consult'>('projects');

  // Dữ liệu dự án thực tế
  const [projects, setProjects] = useState<EventProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(true);

  // Dữ liệu đồ gốm cho thuê
  const [rentalProducts, setRentalProducts] = useState<RentalProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Giỏ đồ thuê: { [productId]: RentalCartItem }
  const [rentalCart, setRentalCart] = useState<{ [productId: string]: RentalCartItem }>({});

  // Form đăng ký thuê đồ & tư vấn
  const [companyName, setCompanyName] = useState<string>('');
  const [contactName, setContactName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [taxCode, setTaxCode] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [setupOption, setSetupOption] = useState<'full' | 'self'>('full');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Ngày thuê (Mặc định: ngày mai và 3 ngày sau)
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [endDateStr, setEndDateStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });

  // Tự động điền thông tin nếu user đã đăng nhập
  useEffect(() => {
    if (userProfile) {
      if (userProfile.fullName) setContactName(userProfile.fullName);
      if (userProfile.phone) setPhone(userProfile.phone);
      if (userProfile.email) setEmail(userProfile.email);
      if (userProfile.address) setAddress(userProfile.address);
    }
  }, [userProfile]);

  // 1. Tải danh sách Dự án thực tế từ Firestore `settings/events`
  useEffect(() => {
    let isMounted = true;
    async function loadEventsData() {
      try {
        setLoadingProjects(true);
        const docSnap = await getDoc(doc(db, 'settings', 'events'));
        if (docSnap.exists() && isMounted) {
          const data = docSnap.data();
          const items = Array.isArray(data.items) ? data.items : [];
          setProjects(items);
        } else if (isMounted) {
          // Fallback dự án nổi bật nếu chưa cấu hình trên Firestore
          setProjects([
            {
              name: 'Đám Cưới Mộc Miên — Rustic Garden Wedding',
              imageUrl: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80',
              category: 'Tiệc cưới',
              description: 'Decor bàn tiệc gốm mộc, bình gốm vân xoay kết hợp hoa sen khô và nến thơm ấm cúng.',
            },
            {
              name: 'Workshop Nghệ Thuật Trà Đạo & Gốm',
              imageUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1200&q=80',
              category: 'Workshop',
              description: 'Không gian tĩnh lặng với bộ ấm chén men lam cổ điển và khay gốm tạo tác thủ công.',
            },
            {
              name: 'Tiệc Khai Trương Showroom Kiến Trúc Zen',
              imageUrl: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1200&q=80',
              category: 'Khai trương',
              description: 'Bộ sưu tập độc bản bình gốm cỡ lớn tạo điểm nhấn sang trọng, tối giản cho sự kiện.',
            },
          ]);
        }
      } catch (err) {
        console.warn('Lỗi tải sự kiện:', err);
      } finally {
        if (isMounted) setLoadingProjects(false);
      }
    }
    loadEventsData();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Tải danh sách đồ gốm cho thuê từ Firestore `products`
  useEffect(() => {
    let isMounted = true;
    async function loadRentalProductsData() {
      try {
        setLoadingProducts(true);
        const q = query(collection(db, 'products'), where('isHidden', '==', false));
        const snapshot = await getDocs(q);
        const list: RentalProduct[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.rentalPrice && Number(data.rentalPrice) > 0) {
            list.push({
              id: d.id,
              name: data.name || '',
              price: Number(data.price) || 0,
              rentalPrice: Number(data.rentalPrice) || 0,
              imageUrl: data.imageUrl || data.image || '',
              hoverImageUrl: data.hoverImageUrl || null,
              category: data.category || 'Khác',
              stock: data.stock || 10,
              dimensions: data.dimensions || '',
              description: data.description || '',
            });
          }
        });
        if (isMounted) {
          setRentalProducts(list);
        }
      } catch (err) {
        console.warn('Lỗi tải sản phẩm cho thuê:', err);
      } finally {
        if (isMounted) setLoadingProducts(false);
      }
    }
    loadRentalProductsData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Phân loại danh mục cho thuê
  const categories = useMemo(() => {
    const set = new Set<string>();
    rentalProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [rentalProducts]);

  // Lọc sản phẩm cho thuê theo search & category
  const filteredRentalProducts = useMemo(() => {
    let list = rentalProducts;
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rentalProducts, selectedCategory, searchQuery]);

  // Thao tác giỏ đồ thuê
  const handleAddToCart = (product: RentalProduct) => {
    setRentalCart((prev) => {
      const existing = prev[product.id];
      if (existing) {
        return {
          ...prev,
          [product.id]: {
            ...existing,
            quantity: existing.quantity + 1,
          },
        };
      }
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: 1,
        },
      };
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setRentalCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return {
        ...prev,
        [productId]: {
          ...existing,
          quantity: nextQty,
        },
      };
    });
  };

  // Tính số ngày thuê
  const rentalDays = useMemo(() => {
    try {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        const diffMs = end.getTime() - start.getTime();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 1;
      }
    } catch {}
    return 1;
  }, [startDateStr, endDateStr]);

  // Tính tổng tiền thuê
  const { totalItems, subtotalPerDay, estimatedTotal, depositAmount } = useMemo(() => {
    let itemsCount = 0;
    let dailySum = 0;
    Object.values(rentalCart).forEach((item) => {
      itemsCount += item.quantity;
      dailySum += (item.product.rentalPrice || item.product.price || 0) * item.quantity;
    });
    const total = dailySum * rentalDays;
    const deposit = Math.round(total * 0.5);
    return {
      totalItems: itemsCount,
      subtotalPerDay: dailySum,
      estimatedTotal: total,
      depositAmount: deposit,
    };
  }, [rentalCart, rentalDays]);

  // Áp dụng Concept từ Dự án thực tế vào ghi chú
  const handleApplyConcept = (projectName: string) => {
    setNotes((prev) => {
      const prefix = `[Concept: ${projectName}]\n`;
      return prev.includes(projectName) ? prev : prefix + prev;
    });
    setActiveTab('consult');
    Alert.alert(t('eventDecorTitle'), t('appliedConceptToast', { name: projectName }));
  };

  // Gửi Form yêu cầu thuê đồ gốm vào Firestore `orders`
  const handleSubmitRentalOrder = async () => {
    if (!contactName.trim()) {
      Alert.alert(t('eventDecorTitle'), t('rentalValidationName'));
      return;
    }
    if (!phone.trim()) {
      Alert.alert(t('eventDecorTitle'), t('rentalValidationPhone'));
      return;
    }

    const cartKeys = Object.keys(rentalCart);
    if (cartKeys.length === 0) {
      Alert.alert(t('eventDecorTitle'), t('rentalValidationItems'));
      return;
    }

    try {
      setSubmitting(true);

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const datePart = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}`;
      const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}`;
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const orderId = `RENT-${datePart}${timePart}-${randomSuffix}`;

      // Chuyển danh sách giỏ thuê sang format items chuẩn của orders
      const orderItems = cartKeys.map((key) => {
        const { product, quantity } = rentalCart[key];
        return {
          id: product.id,
          productId: product.id,
          name: product.name,
          image: product.imageUrl,
          price: product.price || 0,
          rentalPrice: product.rentalPrice || 0,
          quantity: quantity,
        };
      });

      const setupOptionText =
        setupOption === 'full'
          ? t('rentalSetupOptionFull')
          : t('rentalSetupOptionSelf');

      const rentalPayload = {
        id: orderId,
        orderId: orderId,
        orderCode: orderId,
        orderType: 'rental',
        status: 'Yêu cầu mới',
        orderDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: user?.uid || 'guest',
        customerName: contactName.trim(),
        customerPhone: phone.trim(),
        totalAmount: estimatedTotal,
        total: estimatedTotal,
        subtotal: subtotalPerDay,
        shippingFee: 0,
        items: orderItems,
        rentalInfo: {
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          taxCode: taxCode.trim(),
          phone: phone.trim(),
          email: email.trim(),
          rentalDate: startDateStr,
          returnDate: endDateStr,
          rentalDays: rentalDays,
          address: address.trim(),
          notes: notes.trim(),
          setupOption: setupOptionText,
          depositAmount: depositAmount,
          totalPrice: estimatedTotal,
        },
      };

      // 1. Lưu vào Firestore `orders`
      await setDoc(doc(db, 'orders', orderId), rentalPayload);

      // 2. Kích hoạt thông báo trên App
      if (user?.uid) {
        await createOrderPlacedNotification(
          user.uid,
          orderId,
          orderId,
          estimatedTotal,
          orderItems[0]?.image,
          true
        );
      }

      // 3. Thông báo thành công và reset form
      setRentalCart({});
      setNotes('');

      Alert.alert(
        t('rentalSubmitSuccessTitle'),
        t('rentalSubmitSuccessDesc'),
        [
          {
            text: t('orders'),
            onPress: () => router.push('/orders'),
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
    } catch (err: any) {
      console.error('Lỗi gửi đơn thuê:', err);
      Alert.alert(t('eventDecorTitle'), err.message || 'Lỗi gửi yêu cầu thuê, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = getStyles(Colors, isDark, insets);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header chuẩn quy chuẩn GEMINI.md: borderBottomWidth: 0, Fading Backdrop */}
      <Header
        showBack={true}
        title={t('eventDecorTitle')}
        showCart={true}
        showSearch={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ================= HERO PARALLAX BANNER ================= */}
        <View style={styles.heroWrap}>
          <Image
            source={require('../assets/images/decor-su-kien.jpg')}
            style={styles.heroImage}
            contentFit="cover"
          />
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.1)',
              'rgba(0,0,0,0.55)',
              'rgba(0,0,0,0.85)',
            ]}
            style={styles.heroGradient}
          >
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles" size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.heroBadgeText}>{t('eventDecorHeroBadge')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('eventDecorTitle')}</Text>
            <Text style={styles.heroSubtitle}>{t('eventDecorSubtitle')}</Text>
          </LinearGradient>
        </View>

        {/* ================= SEGMENTED PILL TABS ================= */}
        <View style={styles.tabsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
          >
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'projects' && styles.tabBtnActive,
              ]}
              activeOpacity={0.85}
              onPress={() => setActiveTab('projects')}
            >
              <Ionicons
                name="images-outline"
                size={16}
                color={activeTab === 'projects' ? '#FFFFFF' : isDark ? '#E8CCB2' : '#2B2928'}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'projects' && styles.tabBtnTextActive,
                ]}
              >
                {t('tabProjects')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'catalog' && styles.tabBtnActive,
              ]}
              activeOpacity={0.85}
              onPress={() => setActiveTab('catalog')}
            >
              <Ionicons
                name="cube-outline"
                size={16}
                color={activeTab === 'catalog' ? '#FFFFFF' : isDark ? '#E8CCB2' : '#2B2928'}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'catalog' && styles.tabBtnTextActive,
                ]}
              >
                {t('tabRentalCatalog')}
              </Text>
              {totalItems > 0 && (
                <View style={styles.tabBadgeCounter}>
                  <Text style={styles.tabBadgeCounterText}>{totalItems}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'consult' && styles.tabBtnActive,
              ]}
              activeOpacity={0.85}
              onPress={() => setActiveTab('consult')}
            >
              <Ionicons
                name="document-text-outline"
                size={16}
                color={activeTab === 'consult' ? '#FFFFFF' : isDark ? '#E8CCB2' : '#2B2928'}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'consult' && styles.tabBtnTextActive,
                ]}
              >
                {t('tabConsultForm')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ================= TAB 1: DỰ ÁN THỰC TẾ & QUY TRÌNH ================= */}
        {activeTab === 'projects' && (
          <View style={styles.sectionWrap}>
            {/* Quy trình 3 bước chuyên nghiệp */}
            <View style={styles.cardBox}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.accentBar} />
                <Text style={styles.cardHeaderTitle}>{t('decorProcessTitle')}</Text>
              </View>

              <View style={styles.processStepsWrap}>
                {/* Bước 1 */}
                <View style={styles.processStepItem}>
                  <View style={styles.processStepNumber}>
                    <Text style={styles.processStepNumberText}>1</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.processStepTitle}>{t('decorStep1Title')}</Text>
                    <Text style={styles.processStepDesc}>{t('decorStep1Desc')}</Text>
                  </View>
                </View>

                {/* Bước 2 */}
                <View style={styles.processStepItem}>
                  <View style={styles.processStepNumber}>
                    <Text style={styles.processStepNumberText}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.processStepTitle}>{t('decorStep2Title')}</Text>
                    <Text style={styles.processStepDesc}>{t('decorStep2Desc')}</Text>
                  </View>
                </View>

                {/* Bước 3 */}
                <View style={styles.processStepItem}>
                  <View style={styles.processStepNumber}>
                    <Text style={styles.processStepNumberText}>3</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.processStepTitle}>{t('decorStep3Title')}</Text>
                    <Text style={styles.processStepDesc}>{t('decorStep3Desc')}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Danh sách dự án thực tế */}
            <View style={[styles.cardBox, { marginTop: 16 }]}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.accentBar} />
                <Text style={styles.cardHeaderTitle}>{t('rentalEventGallery')}</Text>
              </View>

              {loadingProjects ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color="#9C7156" />
                </View>
              ) : projects.length === 0 ? (
                <Text style={styles.emptyText}>{t('rentalEmptyEvents')}</Text>
              ) : (
                <View style={styles.projectsList}>
                  {projects.map((proj, idx) => (
                    <View key={proj.id || idx} style={styles.projectCard}>
                      <Image
                        source={{ uri: proj.imageUrl }}
                        style={styles.projectImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View style={styles.projectBody}>
                        {proj.category ? (
                          <View style={styles.projectCategoryBadge}>
                            <Text style={styles.projectCategoryText}>{proj.category}</Text>
                          </View>
                        ) : null}
                        <Text style={styles.projectName} numberOfLines={2}>
                          {proj.name}
                        </Text>
                        {proj.description ? (
                          <Text style={styles.projectDesc} numberOfLines={3}>
                            {proj.description}
                          </Text>
                        ) : null}

                        <TouchableOpacity
                          style={styles.btnApplyConcept}
                          activeOpacity={0.88}
                          onPress={() => handleApplyConcept(proj.name)}
                        >
                          <Ionicons name="sparkles" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.btnApplyConceptText}>{t('btnApplyConcept')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ================= TAB 2: DANH MỤC ĐỒ GỐM CHO THUÊ ================= */}
        {activeTab === 'catalog' && (
          <View style={styles.sectionWrap}>
            {/* Thanh tìm kiếm đồ thuê */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#9E968D" style={{ marginLeft: 16 }} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('rentalSearchPlaceholder')}
                placeholderTextColor={isDark ? 'rgba(245,245,245,0.45)' : 'rgba(43,41,40,0.45)'}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 12 }}>
                  <Ionicons name="close-circle" size={18} color="#9E968D" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Bộ lọc danh mục ngang */}
            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryPillsScroll}
              >
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryPill,
                      selectedCategory === cat && styles.categoryPillActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        selectedCategory === cat && styles.categoryPillTextActive,
                      ]}
                    >
                      {cat === 'all' ? t('rentalFilterAll') : cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Lưới sản phẩm đồ gốm cho thuê */}
            {loadingProducts ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#9C7156" />
              </View>
            ) : filteredRentalProducts.length === 0 ? (
              <View style={styles.cardBox}>
                <Text style={styles.emptyText}>{t('rentalEmptyProducts')}</Text>
              </View>
            ) : (
              <View style={styles.productsGrid}>
                {filteredRentalProducts.map((prod) => {
                  const inCart = rentalCart[prod.id];
                  return (
                    <View key={prod.id} style={styles.productCard}>
                      <Image
                        source={{ uri: prod.imageUrl }}
                        style={styles.productImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View style={styles.productInfo}>
                        <Text style={styles.productSku} numberOfLines={1}>
                          Mã: {prod.id}
                        </Text>
                        <Text style={styles.productName} numberOfLines={2}>
                          {prod.name}
                        </Text>
                        <Text style={styles.productRentalPrice}>
                          {formatVND(prod.rentalPrice)}
                          <Text style={styles.productPerDay}> / {t('daysUnit')}</Text>
                        </Text>

                        {/* Nút chọn thuê hoặc Bộ tăng giảm */}
                        {inCart ? (
                          <View style={styles.qtyControlRow}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleUpdateQuantity(prod.id, -1)}
                            >
                              <Text style={styles.qtyBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyValue}>{inCart.quantity}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => handleUpdateQuantity(prod.id, 1)}
                            >
                              <Text style={styles.qtyBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.btnAddToCart}
                            activeOpacity={0.88}
                            onPress={() => handleAddToCart(prod)}
                          >
                            <Ionicons name="add" size={16} color="#FFFFFF" />
                            <Text style={styles.btnAddToCartText}>{t('addToRentalCart')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 3: ĐĂNG KÝ THUÊ & DỰ TOÁN CHI PHÍ ================= */}
        {activeTab === 'consult' && (
          <View style={styles.sectionWrap}>
            {/* Card Giỏ đồ thuê & Dự toán */}
            <View style={styles.cardBox}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.accentBar} />
                <Text style={styles.cardHeaderTitle}>{t('rentalCartTitle')}</Text>
              </View>

              {totalItems === 0 ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <Ionicons name="cart-outline" size={40} color="#9E968D" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyText}>{t('rentalCartEmpty')}</Text>
                  <TouchableOpacity
                    style={[styles.btnApplyConcept, { marginTop: 12 }]}
                    onPress={() => setActiveTab('catalog')}
                  >
                    <Text style={styles.btnApplyConceptText}>{t('tabRentalCatalog')} →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  {Object.values(rentalCart).map((item) => (
                    <View key={item.product.id} style={styles.cartRow}>
                      <Image
                        source={{ uri: item.product.imageUrl }}
                        style={styles.cartThumb}
                        contentFit="cover"
                      />
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.cartItemName} numberOfLines={1}>
                          {item.product.name}
                        </Text>
                        <Text style={styles.cartItemPrice}>
                          {formatVND(item.product.rentalPrice)} / {t('daysUnit')}
                        </Text>
                      </View>
                      <View style={styles.qtyControlRowSmall}>
                        <TouchableOpacity
                          style={styles.qtyBtnSmall}
                          onPress={() => handleUpdateQuantity(item.product.id, -1)}
                        >
                          <Text style={styles.qtyBtnTextSmall}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyValueSmall}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={styles.qtyBtnSmall}
                          onPress={() => handleUpdateQuantity(item.product.id, 1)}
                        >
                          <Text style={styles.qtyBtnTextSmall}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  {/* Lịch ngày nhận & ngày trả */}
                  <View style={styles.datePickerRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.inputLabel}>{t('rentalStartDate')}</Text>
                      <TextInput
                        style={styles.pillInput}
                        value={startDateStr}
                        onChangeText={setStartDateStr}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9E968D"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>{t('rentalEndDate')}</Text>
                      <TextInput
                        style={styles.pillInput}
                        value={endDateStr}
                        onChangeText={setEndDateStr}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9E968D"
                      />
                    </View>
                  </View>

                  {/* Bảng tính tổng tiền */}
                  <View style={styles.estimateSummaryBox}>
                    <View style={styles.estimateSummaryRow}>
                      <Text style={styles.estimateLabel}>{t('rentalDaysLabel')}:</Text>
                      <Text style={styles.estimateValue}>{rentalDays} {t('daysUnit')}</Text>
                    </View>
                    <View style={styles.estimateSummaryRow}>
                      <Text style={styles.estimateLabel}>Tổng giá thuê / {t('daysUnit')}:</Text>
                      <Text style={styles.estimateValue}>{formatVND(subtotalPerDay)}</Text>
                    </View>
                    <View style={[styles.estimateSummaryRow, styles.estimateGrandTotalRow]}>
                      <Text style={styles.estimateGrandTotalLabel}>{t('rentalEstimatedTotal')}:</Text>
                      <Text style={styles.estimateGrandTotalValue} adjustsFontSizeToFit numberOfLines={1}>
                        {formatVND(estimatedTotal)}
                      </Text>
                    </View>
                    <View style={styles.estimateSummaryRow}>
                      <Text style={styles.estimateDepositLabel}>{t('rentalDepositEstimate')}:</Text>
                      <Text style={styles.estimateDepositValue}>{formatVND(depositAmount)}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Card Form Thông tin liên hệ */}
            <View style={[styles.cardBox, { marginTop: 16 }]}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.accentBar} />
                <Text style={styles.cardHeaderTitle}>{t('tabConsultForm')}</Text>
              </View>

              <Text style={styles.inputLabel}>{t('rentalContactName')} *</Text>
              <TextInput
                style={styles.pillInput}
                value={contactName}
                onChangeText={setContactName}
                placeholder="Nguyễn Văn A"
                placeholderTextColor="#9E968D"
              />

              <Text style={styles.inputLabel}>{t('rentalPhone')} *</Text>
              <TextInput
                style={styles.pillInput}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="0901234567"
                placeholderTextColor="#9E968D"
              />

              <Text style={styles.inputLabel}>{t('rentalCompanyName')}</Text>
              <TextInput
                style={styles.pillInput}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Công ty TNHH Sự kiện Mộc"
                placeholderTextColor="#9E968D"
              />

              <Text style={styles.inputLabel}>{t('rentalEmail')}</Text>
              <TextInput
                style={styles.pillInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholder="sukien@example.com"
                placeholderTextColor="#9E968D"
              />

              <Text style={styles.inputLabel}>{t('rentalTaxCode')}</Text>
              <TextInput
                style={styles.pillInput}
                value={taxCode}
                onChangeText={setTaxCode}
                placeholder="Mã số thuế doanh nghiệp (nếu có)"
                placeholderTextColor="#9E968D"
              />

              <Text style={styles.inputLabel}>{t('rentalAddress')}</Text>
              <TextInput
                style={styles.pillInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Địa chỉ sảnh tiệc / không gian sự kiện"
                placeholderTextColor="#9E968D"
              />

              {/* Lựa chọn hình thức dịch vụ */}
              <Text style={styles.inputLabel}>{t('rentalSetupOption')}</Text>
              <TouchableOpacity
                style={[
                  styles.radioRow,
                  setupOption === 'full' && styles.radioRowSelected,
                ]}
                activeOpacity={0.88}
                onPress={() => setSetupOption('full')}
              >
                <Ionicons
                  name={setupOption === 'full' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color="#9C7156"
                />
                <Text style={styles.radioText}>{t('rentalSetupOptionFull')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.radioRow,
                  setupOption === 'self' && styles.radioRowSelected,
                ]}
                activeOpacity={0.88}
                onPress={() => setSetupOption('self')}
              >
                <Ionicons
                  name={setupOption === 'self' ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color="#9C7156"
                />
                <Text style={styles.radioText}>{t('rentalSetupOptionSelf')}</Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>{t('rentalNotes')}</Text>
              <TextInput
                style={[styles.pillInput, styles.textAreaInput]}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                placeholder="Mô tả ý tưởng không gian, số lượng bàn tiệc hoặc tone màu..."
                placeholderTextColor="#9E968D"
              />

              {/* Nút gửi yêu cầu */}
              <TouchableOpacity
                style={[styles.btnSubmitOrder, submitting && { opacity: 0.7 }]}
                activeOpacity={0.88}
                disabled={submitting}
                onPress={handleSubmitRentalOrder}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.btnSubmitOrderText}>{t('btnSubmitRental')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Cart Bar khi đang ở tab Catalog và có đồ trong giỏ */}
      {activeTab === 'catalog' && totalItems > 0 && (
        <View style={[styles.floatingCartBarWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <LinearGradient
            colors={['rgba(250,248,245,0)', 'rgba(250,248,245,0.95)', '#FAF8F5']}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            style={styles.floatingCartBar}
            activeOpacity={0.9}
            onPress={() => setActiveTab('consult')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.floatingCartBadge}>
                <Text style={styles.floatingCartBadgeText}>{totalItems}</Text>
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.floatingCartTitle}>{t('rentalEstimatedTotal')}</Text>
                <Text style={styles.floatingCartPrice}>{formatVND(estimatedTotal)}</Text>
              </View>
            </View>

            <View style={styles.floatingCartAction}>
              <Text style={styles.floatingCartActionText}>{t('tabConsultForm')}</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean, insets: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    scrollContent: {
      paddingBottom: Math.max(insets.bottom, 16) + 90,
    },
    heroWrap: {
      position: 'relative',
      width: SCREEN_WIDTH,
      height: 240,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroGradient: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(156, 113, 86, 0.9)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      marginBottom: 6,
    },
    heroBadgeText: {
      color: '#FFFFFF',
      fontSize: 10.5,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    heroSubtitle: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 12.5,
      lineHeight: 17,
    },
    tabsWrap: {
      paddingVertical: 12,
      backgroundColor: Colors.background,
    },
    tabsScroll: {
      paddingHorizontal: 16,
      gap: 10,
    },
    tabBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      paddingHorizontal: 16,
      borderRadius: 21,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? '#2E2E2E' : '#E8E1D8',
      gap: 6,
    },
    tabBtnActive: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    tabBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#E8CCB2' : '#2B2928',
    },
    tabBtnTextActive: {
      color: '#FFFFFF',
    },
    tabBadgeCounter: {
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
      marginLeft: 2,
    },
    tabBadgeCounterText: {
      color: '#9C7156',
      fontSize: 11,
      fontWeight: '700',
    },
    sectionWrap: {
      paddingHorizontal: 16,
      marginTop: 4,
    },
    cardBox: {
      backgroundColor: Colors.cardBackground,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    accentBar: {
      width: 4,
      height: 16,
      backgroundColor: '#9C7156',
      borderRadius: 2,
      marginRight: 8,
    },
    cardHeaderTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    processStepsWrap: {
      gap: 14,
    },
    processStepItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    processStepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    processStepNumberText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    processStepTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
      marginBottom: 2,
    },
    processStepDesc: {
      fontSize: 12.5,
      color: isDark ? '#A0A0A0' : '#6E665D',
      lineHeight: 17,
    },
    projectsList: {
      gap: 16,
    },
    projectCard: {
      backgroundColor: isDark ? '#1A1816' : '#FAF7F2',
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
    },
    projectImage: {
      width: '100%',
      height: 180,
    },
    projectBody: {
      padding: 14,
    },
    projectCategoryBadge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(156, 113, 86, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginBottom: 6,
    },
    projectCategoryText: {
      color: '#9C7156',
      fontSize: 11,
      fontWeight: '700',
    },
    projectName: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
      marginBottom: 4,
    },
    projectDesc: {
      fontSize: 12.5,
      color: isDark ? '#A0A0A0' : '#6E665D',
      lineHeight: 17,
      marginBottom: 12,
    },
    btnApplyConcept: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 42,
      borderRadius: 21,
      backgroundColor: '#9C7156',
    },
    btnApplyConceptText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8E1D8',
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      height: '100%',
      paddingHorizontal: 12,
      fontSize: 13.5,
      fontWeight: '600',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    categoryPillsScroll: {
      gap: 8,
      paddingBottom: 14,
    },
    categoryPill: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8E1D8',
      justifyContent: 'center',
      alignItems: 'center',
    },
    categoryPillActive: {
      backgroundColor: '#9C7156',
      borderColor: '#9C7156',
    },
    categoryPillText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? '#B0B0B0' : '#6E665D',
    },
    categoryPillTextActive: {
      color: '#FFFFFF',
    },
    productsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'space-between',
    },
    productCard: {
      width: (SCREEN_WIDTH - 44) / 2,
      backgroundColor: Colors.cardBackground,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
    },
    productImage: {
      width: '100%',
      height: 140,
    },
    productInfo: {
      padding: 10,
    },
    productSku: {
      fontSize: 10,
      color: '#9E968D',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    productName: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#F5F5F5' : '#2B2928',
      height: 36,
      marginBottom: 4,
    },
    productRentalPrice: {
      fontSize: 14,
      fontWeight: '700',
      color: '#9C7156',
      marginBottom: 8,
    },
    productPerDay: {
      fontSize: 11,
      fontWeight: '400',
      color: '#9E968D',
    },
    btnAddToCart: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 36,
      borderRadius: 18,
      backgroundColor: '#9C7156',
      gap: 4,
    },
    btnAddToCartText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },
    qtyControlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: '#9C7156',
      paddingHorizontal: 6,
    },
    qtyBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    qtyValue: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    cartRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#2E2E2E' : '#E8E1D8',
    },
    cartThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
      marginRight: 10,
    },
    cartItemName: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#F5F5F5' : '#2B2928',
      marginBottom: 2,
    },
    cartItemPrice: {
      fontSize: 12,
      fontWeight: '700',
      color: '#9C7156',
    },
    qtyControlRowSmall: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    qtyBtnSmall: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: isDark ? '#2E2E2E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#444' : '#CCC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyBtnTextSmall: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    qtyValueSmall: {
      fontSize: 13,
      fontWeight: '700',
      minWidth: 16,
      textAlign: 'center',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    datePickerRow: {
      flexDirection: 'row',
      marginTop: 14,
    },
    inputLabel: {
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? '#E8CCB2' : '#6E665D',
      marginBottom: 6,
      marginTop: 10,
    },
    pillInput: {
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E8E1D8',
      paddingHorizontal: 18,
      fontSize: 14,
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    textAreaInput: {
      height: 90,
      borderRadius: 20,
      paddingTop: 14,
      paddingBottom: 14,
      textAlignVertical: 'top',
    },
    estimateSummaryBox: {
      backgroundColor: isDark ? '#1A1816' : '#FAF7F2',
      borderRadius: 14,
      padding: 14,
      marginTop: 14,
      borderWidth: isDark ? 0 : 1,
      borderColor: '#E8E1D8',
      gap: 8,
    },
    estimateSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    estimateLabel: {
      fontSize: 13,
      color: isDark ? '#B0B0B0' : '#6E665D',
    },
    estimateValue: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    estimateGrandTotalRow: {
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333333' : '#E0D8CE',
      paddingTop: 8,
      marginTop: 2,
    },
    estimateGrandTotalLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    estimateGrandTotalValue: {
      fontSize: 17,
      fontWeight: '700',
      color: '#9C7156',
    },
    estimateDepositLabel: {
      fontSize: 12,
      color: isDark ? '#A0A0A0' : '#6E665D',
    },
    estimateDepositValue: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#9C7156',
    },
    radioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#E8E1D8',
      marginBottom: 8,
      gap: 10,
    },
    radioRowSelected: {
      borderColor: '#9C7156',
      backgroundColor: isDark ? '#261F1A' : '#F7F3EE',
    },
    radioText: {
      flex: 1,
      fontSize: 13,
      color: isDark ? '#F5F5F5' : '#2B2928',
    },
    btnSubmitOrder: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: 26,
      backgroundColor: '#9C7156',
      marginTop: 18,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    btnSubmitOrderText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    floatingCartBarWrap: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    floatingCartBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 56,
      borderRadius: 28,
      backgroundColor: '#2B2928',
      paddingHorizontal: 16,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
    },
    floatingCartBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#9C7156',
      alignItems: 'center',
      justifyContent: 'center',
    },
    floatingCartBadgeText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    floatingCartTitle: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 11,
    },
    floatingCartPrice: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    floatingCartAction: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#9C7156',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      gap: 4,
    },
    floatingCartActionText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '600',
    },
    loadingWrap: {
      paddingVertical: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      textAlign: 'center',
      color: '#9E968D',
      fontSize: 13,
      marginVertical: 14,
    },
  });
