// app/categories.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { subscribeCategories, saveProductCategories } from '../src/services/adminProductService';
import { Category } from '../src/types';
import { ScalePressable } from '../src/components/ScalePressable';
import { AnimatedCenterModal } from '../src/components/AnimatedCenterModal';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { t } = useSettings();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modal Add Category
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSubs, setNewCatSubs] = useState('');

  // Subcategory Quick Addition state
  const [selectedCatForSub, setSelectedCatForSub] = useState<Category | null>(null);
  const [newSingleSub, setNewSingleSub] = useState('');

  useEffect(() => {
    const unsub = subscribeCategories((cats) => {
      setCategories(cats);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      Alert.alert('Thiếu tên danh mục', 'Vui lòng nhập tên nhóm danh mục mới.');
      return;
    }
    const subs = newCatSubs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newCat: Category = {
      id: newCatName.trim(),
      name: newCatName.trim(),
      code: newCatName.trim(),
      order: categories.length + 1,
      subcategories: subs,
    };

    const updated = [...categories, newCat];
    setIsSaving(true);
    const ok = await saveProductCategories(updated);
    setIsSaving(false);
    if (ok) {
      setShowAddCatModal(false);
      setNewCatName('');
      setNewCatSubs('');
    } else {
      Alert.alert('Lỗi', 'Không thể lưu danh mục mới.');
    }
  };

  const handleDeleteCategory = (catName: string) => {
    Alert.alert(
      'Xóa danh mục',
      `Bạn có chắc chắn muốn xóa nhóm danh mục "${catName}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            const updated = categories.filter((c) => c.name !== catName);
            await saveProductCategories(updated);
          },
        },
      ]
    );
  };

  const handleAddSubcategory = async () => {
    if (!selectedCatForSub || !newSingleSub.trim()) return;
    const subName = newSingleSub.trim();
    const updated = categories.map((c) => {
      if (c.name === selectedCatForSub.name) {
        const subs = c.subcategories || [];
        if (!subs.includes(subName)) {
          return { ...c, subcategories: [...subs, subName] };
        }
      }
      return c;
    });
    await saveProductCategories(updated);
    setSelectedCatForSub(null);
    setNewSingleSub('');
  };

  const handleRemoveSubcategory = async (catName: string, subName: string) => {
    const updated = categories.map((c) => {
      if (c.name === catName) {
        return {
          ...c,
          subcategories: (c.subcategories || []).filter((s) => s !== subName),
        };
      }
      return c;
    });
    await saveProductCategories(updated);
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.backCircleBtn,
              {
                backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? 'transparent' : '#E8E1D8',
              },
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: Colors.textPrimary }]} numberOfLines={1}>Danh mục sản phẩm</Text>
            <Text style={[styles.headerSub, { color: Colors.textSecondary }]} numberOfLines={1}>
              {categories.length} nhóm hàng gốm
            </Text>
          </View>
        </View>

        <ScalePressable
          style={styles.btnAddCat}
          onPress={() => setShowAddCatModal(true)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.btnAddCatText}>Tạo mới</Text>
        </ScalePressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#9C7156" />
          </View>
        ) : (
          categories.map((cat) => (
            <View
              key={cat.id || cat.name}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? 'transparent' : '#E8E1D8',
                },
              ]}
            >
              <View style={styles.catHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                  <View style={styles.catIconCircle}>
                    <Ionicons name="folder-outline" size={18} color="#9C7156" />
                  </View>
                  <Text style={[styles.catName, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1}>{cat.name}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                  <TouchableOpacity
                    style={styles.btnActionIcon}
                    onPress={() => {
                      setSelectedCatForSub(cat);
                      setNewSingleSub('');
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#9C7156" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnActionIcon}
                    onPress={() => handleDeleteCategory(cat.name)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Subcategories chips */}
              <View style={styles.subsWrapper}>
                {(cat.subcategories && cat.subcategories.length > 0) ? (
                  cat.subcategories.map((sub, idx) => (
                    <View key={idx} style={[styles.subChip, { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5', borderColor: Colors.border }]}>
                      <Text style={[styles.subChipText, { color: Colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveSubcategory(cat.name, sub)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close" size={13} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.noSubsText, { color: Colors.textMuted }]}>
                    Chưa có danh mục con. Nhấn (+) để thêm phân loại.
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* MODAL THÊM DANH MỤC MỚI */}
      <AnimatedCenterModal
        visible={showAddCatModal}
        onClose={() => setShowAddCatModal(false)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Thêm nhóm danh mục mới</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, marginBottom: 16 }]}>
          Tạo nhóm hàng gốm hiển thị trên Web và App
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>Tên nhóm danh mục (*)</Text>
          <TextInput
            style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
            placeholder="Ví dụ: Bình gốm phong thủy"
            placeholderTextColor={Colors.textMuted}
            value={newCatName}
            onChangeText={setNewCatName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: Colors.textSecondary }]}>Danh mục con (phân cách bằng dấu phẩy)</Text>
          <TextInput
            style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
            placeholder="Bình hút tài lộc, Lọ cắm sen..."
            placeholderTextColor={Colors.textMuted}
            value={newCatSubs}
            onChangeText={setNewCatSubs}
          />
        </View>

        <ScalePressable
          style={[styles.btnSubmitModal, isSaving && { opacity: 0.6 }]}
          onPress={handleAddCategory}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.btnSubmitModalText}>Lưu danh mục</Text>
          )}
        </ScalePressable>
      </AnimatedCenterModal>

      {/* MODAL THÊM 1 DANH MỤC CON */}
      <AnimatedCenterModal
        visible={!!selectedCatForSub}
        onClose={() => setSelectedCatForSub(null)}
        contentStyle={[styles.modalCard, { backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF' }]}
      >
        <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Thêm danh mục con</Text>
        <Text style={[styles.modalSubtitle, { color: Colors.textSecondary, marginBottom: 16 }]}>
          Thuộc nhóm: {selectedCatForSub?.name}
        </Text>

        <TextInput
          style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border, marginBottom: 16 }]}
          placeholder="Tên phân loại con (VD: Ấm tử sa)..."
          placeholderTextColor={Colors.textMuted}
          value={newSingleSub}
          onChangeText={setNewSingleSub}
        />

        <ScalePressable style={styles.btnSubmitModal} onPress={handleAddSubcategory}>
          <Text style={styles.btnSubmitModalText}>Thêm phân loại</Text>
        </ScalePressable>
      </AnimatedCenterModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 1,
  },
  btnAddCat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9C7156',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexShrink: 0,
  },
  btnAddCatText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  loadingWrap: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  categoryCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  catHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
  },
  btnActionIcon: {
    padding: 4,
  },
  subsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  subChipText: {
    fontSize: 12.5,
  },
  noSubsText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalCard: {
    width: '90%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputPill: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13.5,
  },
  btnSubmitModal: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnSubmitModalText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
