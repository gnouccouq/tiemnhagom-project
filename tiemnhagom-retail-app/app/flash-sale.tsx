// app/flash-sale.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { ScalePressable } from '../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';
import { subscribeProducts } from '../src/services/adminProductService';
import { subscribeFlashSale, saveFlashSaleSettings } from '../src/services/adminFlashSaleService';
import { Product, FlashSaleSettings, FlashSaleProductConfig } from '../src/types';

export default function FlashSaleScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { t } = useSettings();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Flash sale settings states
  const [isActive, setIsActive] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [priceGroupsStr, setPriceGroupsStr] = useState('');
  const [itemsMap, setItemsMap] = useState<Record<string, FlashSaleProductConfig>>({});

  // Filter & Search inside flash sale list
  const [searchQuery, setSearchQuery] = useState('');

  // Product picker modal
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Gift picker modal for bogo_custom
  const [giftModalTargetPid, setGiftModalTargetPid] = useState<string | null>(null);
  const [giftSearchQuery, setGiftSearchQuery] = useState('');

  useEffect(() => {
    const unsubProducts = subscribeProducts(
      (prods) => setAllProducts(prods),
      (err) => console.error('Lỗi tải sản phẩm:', err)
    );

    const unsubFlashSale = subscribeFlashSale(
      (settings) => {
        setIsActive(settings.isActive);
        setTitle(settings.title || '');
        setSubtitle(settings.subtitle || '');
        setPriceGroupsStr((settings.priceGroups || []).join(', '));

        const startStr = settings.startTime?.toDate
          ? settings.startTime.toDate().toISOString().slice(0, 16)
          : typeof settings.startTime === 'string'
          ? settings.startTime
          : '';
        const endStr = settings.endTime?.toDate
          ? settings.endTime.toDate().toISOString().slice(0, 16)
          : typeof settings.endTime === 'string'
          ? settings.endTime
          : '';

        setStartTime(startStr);
        setEndTime(endStr);
        setItemsMap(settings.items || {});
        setIsLoading(false);
      },
      (err) => {
        console.error('Lỗi tải cấu hình flash sale:', err);
        setIsLoading(false);
      }
    );

    return () => {
      unsubProducts();
      unsubFlashSale();
    };
  }, []);

  // Map of products for fast lookup
  const productLookup = useMemo(() => {
    const map = new Map<string, Product>();
    allProducts.forEach((p) => map.set(p.id, p));
    return map;
  }, [allProducts]);

  // List of active flash sale items
  const flashSaleProductList = useMemo(() => {
    const pids = Object.keys(itemsMap);
    const list = pids.map((pid) => {
      const prod = productLookup.get(pid);
      return {
        pid,
        prod: prod || {
          id: pid,
          name: `Sản phẩm (${pid})`,
          price: itemsMap[pid]?.salePrice || 0,
          stock: 0,
          category: 'khac',
        },
        config: itemsMap[pid],
      };
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.prod.name.toLowerCase().includes(q) ||
        (item.prod.code && item.prod.code.toLowerCase().includes(q))
    );
  }, [itemsMap, productLookup, searchQuery]);

  // Filtered products for picker modal
  const filteredPickerProducts = useMemo(() => {
    const q = pickerSearchQuery.toLowerCase().trim();
    return allProducts.filter((p) => {
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));
      return matchQuery;
    });
  }, [allProducts, pickerSearchQuery]);

  // Filtered products for gift picker
  const filteredGiftProducts = useMemo(() => {
    const q = giftSearchQuery.toLowerCase().trim();
    return allProducts.filter((p) => {
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q));
      return matchQuery;
    });
  }, [allProducts, giftSearchQuery]);

  // Handle open picker
  const handleOpenPicker = () => {
    setSelectedProductIds(Object.keys(itemsMap));
    setPickerSearchQuery('');
    setShowPickerModal(true);
  };

  // Toggle selection in picker
  const togglePickerSelection = (pid: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  // Apply picker selection
  const handleApplyPicker = () => {
    const newItemsMap: Record<string, FlashSaleProductConfig> = {};
    selectedProductIds.forEach((pid) => {
      if (itemsMap[pid]) {
        newItemsMap[pid] = itemsMap[pid];
      } else {
        const prod = productLookup.get(pid);
        const originalPrice = prod?.price || 0;
        newItemsMap[pid] = {
          dealType: 'sale',
          salePrice: Math.round(originalPrice * 0.8),
          giftProductId: '',
          limit: 20,
          sold: 0,
        };
      }
    });
    setItemsMap(newItemsMap);
    setShowPickerModal(false);
  };

  // Update item field
  const updateItemConfig = (pid: string, updates: Partial<FlashSaleProductConfig>) => {
    setItemsMap((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        ...updates,
      },
    }));
  };

  // Remove item from flash sale
  const handleRemoveItem = (pid: string) => {
    setItemsMap((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  };

  // Handle save
  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(t('error'), 'Vui lòng nhập tên chiến dịch Flash Sale');
      return;
    }

    setIsSaving(true);
    try {
      const priceGroups = priceGroupsStr
        .split(',')
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p));

      const payload: FlashSaleSettings = {
        isActive,
        title: title.trim(),
        subtitle: subtitle.trim(),
        startTime: startTime ? new Date(startTime).toISOString() : '',
        endTime: endTime ? new Date(endTime).toISOString() : '',
        priceGroups,
        items: itemsMap,
        products: Object.keys(itemsMap).map((pid) => {
          const cfg = itemsMap[pid];
          const prod = productLookup.get(pid);
          return {
            id: pid,
            name: prod?.name || '',
            price: prod?.price || 0,
            salePrice: cfg.salePrice || 0,
            quantity: cfg.limit || 0,
            sold: cfg.sold || 0,
            imageUrl: prod?.imageUrl || '',
          };
        }),
      };

      const ok = await saveFlashSaleSettings(payload);
      if (ok) {
        Alert.alert(t('success'), 'Đã cập nhật chiến dịch Flash Sale thành công!');
      } else {
        Alert.alert(t('error'), 'Không thể lưu cài đặt Flash Sale. Vui lòng thử lại.');
      }
    } catch (err: any) {
      Alert.alert(t('error'), err.message || 'Lỗi khi lưu chiến dịch');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity
            style={[
              styles.btnBack,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
                borderWidth: isDark ? 0 : 1,
              },
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>
              {t('flashSaleSettings')}
            </Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
              {Object.keys(itemsMap).length} tác phẩm tham gia
            </Text>
          </View>
        </View>

        <ScalePressable style={styles.btnPickerHeader} onPress={handleOpenPicker}>
          <Ionicons name="add" size={17} color="#FFFFFF" />
          <Text style={styles.btnPickerHeaderText}>+ Chọn SP</Text>
        </ScalePressable>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#9C7156" />
          <Text style={[styles.loadingText, { color: Colors.textSecondary }]}>
            {t('loading')}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 90 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Status Activation Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusLeft}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isActive ? '#9C7156' : '#9E968D' },
                    ]}
                  />
                  <View>
                    <Text style={[styles.statusTitle, { color: Colors.textPrimary }]}>
                      {isActive ? 'Chiến dịch đang BẬT' : 'Chiến dịch đang TẮT'}
                    </Text>
                    <Text style={[styles.statusSubtitle, { color: Colors.textSecondary }]}>
                      {isActive
                        ? 'Khách hàng trên Web & App sẽ thấy giá khuyến mãi'
                        : 'Không áp dụng giá ưu đãi flash sale trên hệ thống'}
                    </Text>
                  </View>
                </View>

                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#E8E1D8', true: '#9C7156' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Campaign Details Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>
                Thông tin chiến dịch
              </Text>

              {/* Tên chiến dịch */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                  Tên chiến dịch *
                </Text>
                <TextInput
                  style={[
                    styles.pillInput,
                    {
                      backgroundColor: Colors.surface,
                      borderColor: Colors.border,
                      color: Colors.textPrimary,
                    },
                  ]}
                  placeholder="VD: Flash Sale 20/10 - Mừng Ngày Phụ Nữ"
                  placeholderTextColor={Colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              {/* Phụ đề */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                  Thông điệp / Phụ đề
                </Text>
                <TextInput
                  style={[
                    styles.pillInput,
                    {
                      backgroundColor: Colors.surface,
                      borderColor: Colors.border,
                      color: Colors.textPrimary,
                    },
                  ]}
                  placeholder="VD: Mua 1 Tặng 1 gốm thủ công cao cấp"
                  placeholderTextColor={Colors.textMuted}
                  value={subtitle}
                  onChangeText={setSubtitle}
                />
              </View>

              {/* Thời gian Bắt đầu & Kết thúc */}
              <View style={styles.rowTwoCols}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                    Bắt đầu (YYYY-MM-DD)
                  </Text>
                  <TextInput
                    style={[
                      styles.pillInputSmall,
                      {
                        backgroundColor: Colors.surface,
                        borderColor: Colors.border,
                        color: Colors.textPrimary,
                      },
                    ]}
                    placeholder="2026-10-20T00:00"
                    placeholderTextColor={Colors.textMuted}
                    value={startTime}
                    onChangeText={setStartTime}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                    Kết thúc (YYYY-MM-DD)
                  </Text>
                  <TextInput
                    style={[
                      styles.pillInputSmall,
                      {
                        backgroundColor: Colors.surface,
                        borderColor: Colors.border,
                        color: Colors.textPrimary,
                      },
                    ]}
                    placeholder="2026-10-20T23:59"
                    placeholderTextColor={Colors.textMuted}
                    value={endTime}
                    onChangeText={setEndTime}
                  />
                </View>
              </View>

              {/* Mức đồng giá */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>
                  Mức đồng giá Tab (tách bằng dấu phẩy)
                </Text>
                <TextInput
                  style={[
                    styles.pillInput,
                    {
                      backgroundColor: Colors.surface,
                      borderColor: Colors.border,
                      color: Colors.textPrimary,
                    },
                  ]}
                  placeholder="VD: 39000, 99000, 199000"
                  placeholderTextColor={Colors.textMuted}
                  value={priceGroupsStr}
                  onChangeText={setPriceGroupsStr}
                />
              </View>
            </View>

            {/* Product List Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: Colors.textPrimary }]}>
                Sản phẩm trong đợt Sale ({Object.keys(itemsMap).length})
              </Text>
              <TouchableOpacity onPress={handleOpenPicker}>
                <Text style={styles.btnAddMoreText}>+ Thêm tác phẩm</Text>
              </TouchableOpacity>
            </View>

            {/* Local Search Pill */}
            {Object.keys(itemsMap).length > 3 ? (
              <View
                style={[
                  styles.localSearchPill,
                  { backgroundColor: Colors.surface, borderColor: Colors.border },
                ]}
              >
                <Ionicons name="search-outline" size={17} color={Colors.textSecondary} />
                <TextInput
                  style={[styles.localSearchInput, { color: Colors.textPrimary }]}
                  placeholder="Tìm sản phẩm trong đợt sale..."
                  placeholderTextColor={Colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* List or Empty State */}
            {flashSaleProductList.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                    borderColor: isDark ? 'transparent' : '#E8E1D8',
                  },
                ]}
              >
                <Ionicons name="pricetags-outline" size={44} color="#9C7156" />
                <Text style={[styles.emptyTitle, { color: Colors.textPrimary }]}>
                  Chưa có sản phẩm nào
                </Text>
                <Text style={[styles.emptyDesc, { color: Colors.textSecondary }]}>
                  Bấm nút "+ Chọn sản phẩm" để thêm các tác phẩm gốm vào đợt Flash Sale này.
                </Text>
                <ScalePressable style={styles.btnEmptyAdd} onPress={handleOpenPicker}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.btnEmptyAddText}>Chọn sản phẩm ngay</Text>
                </ScalePressable>
              </View>
            ) : (
              <View style={styles.itemsContainer}>
                {flashSaleProductList.map(({ pid, prod, config }) => {
                  const dealType = config.dealType || 'sale';
                  const salePrice = config.salePrice ?? Math.round((prod.price || 0) * 0.8);
                  const limit = config.limit ?? 20;
                  const sold = config.sold ?? 0;
                  const giftProd = config.giftProductId
                    ? productLookup.get(config.giftProductId)
                    : null;
                  const percentSold = limit > 0 ? Math.min(100, Math.round((sold / limit) * 100)) : 0;

                  return (
                    <View
                      key={pid}
                      style={[
                        styles.itemCard,
                        {
                          backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                          borderColor: isDark ? 'transparent' : '#E8E1D8',
                        },
                      ]}
                    >
                      {/* Item Top Info */}
                      <View style={styles.itemTopRow}>
                        <Image
                          source={{ uri: prod.imageUrl || 'https://placehold.co/100x100?text=SP' }}
                          style={styles.itemThumb}
                          contentFit="cover"
                        />
                        <View style={styles.itemInfo}>
                          <Text
                            style={[styles.itemName, { color: Colors.textPrimary }]}
                            numberOfLines={2}
                          >
                            {prod.name}
                          </Text>
                          <Text style={[styles.itemOriginalPrice, { color: Colors.textSecondary }]}>
                            Giá gốc: {(prod.price || 0).toLocaleString('vi-VN')} đ
                          </Text>
                          <Text style={[styles.itemStockText, { color: Colors.textMuted }]}>
                            Kho hiện có: {prod.stock || 0} món
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.btnRemoveItem}
                          onPress={() => handleRemoveItem(pid)}
                        >
                          <Ionicons name="trash-outline" size={19} color="#DC2626" />
                        </TouchableOpacity>
                      </View>

                      {/* Deal Type Switcher Chips */}
                      <View style={styles.dealTypeRow}>
                        <TouchableOpacity
                          style={[
                            styles.dealTypeChip,
                            dealType === 'sale' && styles.dealTypeChipActive,
                            {
                              backgroundColor:
                                dealType === 'sale' ? '#9C7156' : isDark ? '#1E1E1E' : '#F6F4EC',
                              borderColor: dealType === 'sale' ? '#9C7156' : Colors.border,
                            },
                          ]}
                          onPress={() => updateItemConfig(pid, { dealType: 'sale' })}
                        >
                          <Text
                            style={[
                              styles.dealTypeChipText,
                              { color: dealType === 'sale' ? '#FFFFFF' : Colors.textPrimary },
                            ]}
                          >
                            Giảm giá sốc
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.dealTypeChip,
                            dealType === 'bogo_same' && styles.dealTypeChipActive,
                            {
                              backgroundColor:
                                dealType === 'bogo_same' ? '#9C7156' : isDark ? '#1E1E1E' : '#F6F4EC',
                              borderColor: dealType === 'bogo_same' ? '#9C7156' : Colors.border,
                            },
                          ]}
                          onPress={() => updateItemConfig(pid, { dealType: 'bogo_same' })}
                        >
                          <Text
                            style={[
                              styles.dealTypeChipText,
                              { color: dealType === 'bogo_same' ? '#FFFFFF' : Colors.textPrimary },
                            ]}
                          >
                            1 Tặng 1 (Cùng loại)
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.dealTypeChip,
                            dealType === 'bogo_custom' && styles.dealTypeChipActive,
                            {
                              backgroundColor:
                                dealType === 'bogo_custom' ? '#9C7156' : isDark ? '#1E1E1E' : '#F6F4EC',
                              borderColor: dealType === 'bogo_custom' ? '#9C7156' : Colors.border,
                            },
                          ]}
                          onPress={() => {
                            updateItemConfig(pid, { dealType: 'bogo_custom' });
                            setGiftModalTargetPid(pid);
                            setGiftSearchQuery('');
                          }}
                        >
                          <Text
                            style={[
                              styles.dealTypeChipText,
                              { color: dealType === 'bogo_custom' ? '#FFFFFF' : Colors.textPrimary },
                            ]}
                          >
                            1 Tặng 1 (Tùy chọn quà)
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Deal Type Specific Settings */}
                      {dealType === 'sale' ? (
                        <View style={styles.dealSettingRow}>
                          <Text style={[styles.settingLabel, { color: Colors.textSecondary }]}>
                            Giá Flash Sale (VNĐ):
                          </Text>
                          <TextInput
                            style={[
                              styles.settingInput,
                              {
                                backgroundColor: Colors.surface,
                                borderColor: Colors.border,
                                color: '#9C7156',
                              },
                            ]}
                            keyboardType="numeric"
                            value={String(salePrice)}
                            onChangeText={(val) => {
                              const num = parseInt(val.replace(/\D/g, ''), 10) || 0;
                              updateItemConfig(pid, { salePrice: num });
                            }}
                          />
                        </View>
                      ) : null}

                      {dealType === 'bogo_custom' ? (
                        <View style={styles.dealSettingRow}>
                          <Text style={[styles.settingLabel, { color: Colors.textSecondary }]}>
                            Tác phẩm tặng kèm:
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.giftSelectBtn,
                              {
                                backgroundColor: Colors.surface,
                                borderColor: Colors.border,
                              },
                            ]}
                            onPress={() => {
                              setGiftModalTargetPid(pid);
                              setGiftSearchQuery('');
                            }}
                          >
                            <Text
                              style={[
                                styles.giftSelectBtnText,
                                { color: giftProd ? Colors.textPrimary : Colors.textMuted },
                              ]}
                              numberOfLines={1}
                            >
                              {giftProd ? giftProd.name : 'Chạm để chọn quà tặng...'}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {/* Limit & Sold counters */}
                      <View style={styles.limitSoldRow}>
                        <View style={styles.limitCol}>
                          <Text style={[styles.counterLabel, { color: Colors.textSecondary }]}>
                            Số suất bán:
                          </Text>
                          <TextInput
                            style={[
                              styles.counterInput,
                              {
                                backgroundColor: Colors.surface,
                                borderColor: Colors.border,
                                color: Colors.textPrimary,
                              },
                            ]}
                            keyboardType="numeric"
                            value={String(limit)}
                            onChangeText={(val) => {
                              const num = parseInt(val.replace(/\D/g, ''), 10) || 0;
                              updateItemConfig(pid, { limit: num });
                            }}
                          />
                        </View>

                        <View style={styles.limitCol}>
                          <Text style={[styles.counterLabel, { color: Colors.textSecondary }]}>
                            Đã bán:
                          </Text>
                          <TextInput
                            style={[
                              styles.counterInput,
                              {
                                backgroundColor: Colors.surface,
                                borderColor: Colors.border,
                                color: Colors.textPrimary,
                              },
                            ]}
                            keyboardType="numeric"
                            value={String(sold)}
                            onChangeText={(val) => {
                              const num = parseInt(val.replace(/\D/g, ''), 10) || 0;
                              updateItemConfig(pid, { sold: num });
                            }}
                          />
                        </View>

                        <View style={styles.progressCol}>
                          <Text style={[styles.counterLabel, { color: Colors.textSecondary }]}>
                            Tiến độ: {percentSold}%
                          </Text>
                          <View
                            style={[
                              styles.progressBarTrack,
                              { backgroundColor: isDark ? '#222' : '#F0ECE6' },
                            ]}
                          >
                            <View
                              style={[styles.progressBarFill, { width: `${percentSold}%` }]}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Sticky Bottom Action Container */}
          <View style={styles.bottomFixedContainer}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.88)', 'rgba(0,0,0,0.98)']
                  : [
                      'rgba(246,244,236,0)',
                      'rgba(246,244,236,0.88)',
                      'rgba(246,244,236,0.98)',
                    ]
              }
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <ScalePressable
              style={[styles.btnSaveFixed, isSaving && { opacity: 0.8 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.btnSaveFixedText}>Lưu cấu hình Flash Sale</Text>
                </>
              )}
            </ScalePressable>
          </View>
        </>
      )}

      {/* MODAL 1: Product Picker for Flash Sale */}
      <Modal
        visible={showPickerModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPickerModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => setShowPickerModal(false)}>
              <Text style={[styles.modalCancelText, { color: Colors.textSecondary }]}>Hủy</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>
              Chọn tác phẩm Flash Sale
            </Text>
            <TouchableOpacity onPress={handleApplyPicker}>
              <Text style={styles.modalDoneText}>Áp dụng ({selectedProductIds.length})</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar inside modal */}
          <View style={styles.modalSearchWrapper}>
            <View
              style={[
                styles.modalSearchPill,
                { backgroundColor: Colors.surface, borderColor: Colors.border },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
              <TextInput
                style={[styles.modalSearchInput, { color: Colors.textPrimary }]}
                placeholder="Tìm tác phẩm theo tên, mã SKU..."
                placeholderTextColor={Colors.textMuted}
                value={pickerSearchQuery}
                onChangeText={setPickerSearchQuery}
              />
              {pickerSearchQuery ? (
                <TouchableOpacity onPress={() => setPickerSearchQuery('')}>
                  <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Product List */}
          <ScrollView contentContainerStyle={styles.modalListContent}>
            {filteredPickerProducts.map((p) => {
              const isSelected = selectedProductIds.includes(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerRow,
                    {
                      backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: isSelected ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                      borderWidth: isSelected ? 1.5 : isDark ? 0 : 1,
                    },
                  ]}
                  onPress={() => togglePickerSelection(p.id)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: p.imageUrl || 'https://placehold.co/80x80?text=SP' }}
                    style={styles.pickerThumb}
                    contentFit="cover"
                  />
                  <View style={styles.pickerInfo}>
                    <Text
                      style={[styles.pickerName, { color: Colors.textPrimary }]}
                      numberOfLines={2}
                    >
                      {p.name}
                    </Text>
                    <Text style={[styles.pickerPrice, { color: '#9C7156' }]}>
                      {(p.price || 0).toLocaleString('vi-VN')} đ
                    </Text>
                    <Text style={[styles.pickerStock, { color: Colors.textSecondary }]}>
                      Tồn kho: {p.stock || 0}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.pickerCheckbox,
                      isSelected && { backgroundColor: '#9C7156', borderColor: '#9C7156' },
                    ]}
                  >
                    {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* MODAL 2: Gift Product Picker */}
      <Modal
        visible={!!giftModalTargetPid}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setGiftModalTargetPid(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => setGiftModalTargetPid(null)}>
              <Text style={[styles.modalCancelText, { color: Colors.textSecondary }]}>Đóng</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>
              Chọn quà tặng kèm
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.modalSearchWrapper}>
            <View
              style={[
                styles.modalSearchPill,
                { backgroundColor: Colors.surface, borderColor: Colors.border },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
              <TextInput
                style={[styles.modalSearchInput, { color: Colors.textPrimary }]}
                placeholder="Tìm tác phẩm tặng kèm..."
                placeholderTextColor={Colors.textMuted}
                value={giftSearchQuery}
                onChangeText={setGiftSearchQuery}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.modalListContent}>
            {filteredGiftProducts.map((p) => {
              const isGiftSelected =
                giftModalTargetPid && itemsMap[giftModalTargetPid]?.giftProductId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.pickerRow,
                    {
                      backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                      borderColor: isGiftSelected ? '#9C7156' : isDark ? 'transparent' : '#E8E1D8',
                      borderWidth: isGiftSelected ? 1.5 : isDark ? 0 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (giftModalTargetPid) {
                      updateItemConfig(giftModalTargetPid, { giftProductId: p.id });
                      setGiftModalTargetPid(null);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: p.imageUrl || 'https://placehold.co/80x80?text=SP' }}
                    style={styles.pickerThumb}
                    contentFit="cover"
                  />
                  <View style={styles.pickerInfo}>
                    <Text
                      style={[styles.pickerName, { color: Colors.textPrimary }]}
                      numberOfLines={2}
                    >
                      {p.name}
                    </Text>
                    <Text style={[styles.pickerPrice, { color: Colors.textSecondary }]}>
                      Giá gốc: {(p.price || 0).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  {isGiftSelected ? (
                    <Ionicons name="checkmark-circle" size={24} color="#9C7156" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  btnBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  btnPickerHeader: {
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9C7156',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  btnPickerHeaderText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
  },
  pillInput: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    fontSize: 14.5,
    fontFamily: 'ElleGaborStd',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  pillInputSmall: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  btnAddMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9C7156',
    flexShrink: 0,
  },
  localSearchPill: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 8,
  },
  localSearchInput: {
    flex: 1,
    fontSize: 13.5,
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 30,
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 20,
    gap: 8,
    overflow: 'hidden',
  },
  emptyTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  btnEmptyAdd: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnEmptyAddText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemsContainer: {
    gap: 14,
  },
  itemCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemThumb: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#E8E1D8',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemOriginalPrice: {
    fontSize: 12,
    marginTop: 2,
  },
  itemStockText: {
    fontSize: 11.5,
    marginTop: 2,
  },
  btnRemoveItem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dealTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E1D8',
  },
  dealTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  dealTypeChipActive: {},
  dealTypeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dealSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  settingLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  settingInput: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    width: 140,
    textAlign: 'right',
  },
  giftSelectBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  giftSelectBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
    marginRight: 6,
  },
  limitSoldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E1D8',
  },
  limitCol: {
    flex: 1,
  },
  progressCol: {
    flex: 1.5,
  },
  counterLabel: {
    fontSize: 11.5,
    marginBottom: 4,
  },
  counterInput: {
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#9C7156',
    borderRadius: 4,
  },
  bottomFixedContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    zIndex: 99,
  },
  btnSaveFixed: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  btnSaveFixedText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E1D8',
  },
  modalCancelText: {
    fontSize: 14.5,
  },
  modalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16.5,
    fontWeight: '700',
  },
  modalDoneText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#9C7156',
  },
  modalSearchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalSearchPill: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13.5,
  },
  modalListContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 10,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    gap: 12,
  },
  pickerThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#E8E1D8',
  },
  pickerInfo: {
    flex: 1,
  },
  pickerName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  pickerPrice: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
  },
  pickerStock: {
    fontSize: 11,
    marginTop: 1,
  },
  pickerCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8E1D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
