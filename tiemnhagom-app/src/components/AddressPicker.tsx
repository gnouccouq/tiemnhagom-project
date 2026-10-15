import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  TextInput,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScalePressable } from './ScalePressable';
import { AnimatedBottomSheetModal } from './AnimatedBottomSheetModal';
import provincesData from '../../assets/data/provinces.json';
import { useThemeColor } from '../constants/theme';
import { useSettings } from '../context/SettingsContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AddressPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (province: any, ward: any) => void;
  initialProvinceCode?: string;
  initialWardCode?: string;
}

export const AddressPicker: React.FC<AddressPickerProps> = ({
  visible,
  onClose,
  onSelect,
  initialProvinceCode,
  initialWardCode,
}) => {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const themeStyles = getStyles(Colors, insets, isDark);
  const [step, setStep] = useState<'PROVINCE' | 'WARD'>('PROVINCE');
  const [selectedProv, setSelectedProv] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      setStep('PROVINCE');
      if (initialProvinceCode) {
        const p = provincesData.find((prov) => prov.province_code === initialProvinceCode);
        setSelectedProv(p || null);
      } else {
        setSelectedProv(null);
      }
    }
  }, [visible, initialProvinceCode]);

  const handleSelectProvince = (prov: any) => {
    setSelectedProv(prov);
    setStep('WARD');
  };

  const handleSelectWard = (ward: any) => {
    onSelect(selectedProv, ward);
    onClose();
  };

  const renderItem = ({ item }: { item: any }) => {
    const isProvStep = step === 'PROVINCE';
    const name = item.name;
    const isSelected = isProvStep
      ? selectedProv?.province_code === item.province_code
      : initialWardCode === item.ward_code;

    return (
      <TouchableOpacity
        style={themeStyles.itemRow}
        onPress={() => (isProvStep ? handleSelectProvince(item) : handleSelectWard(item))}
      >
        <Text style={[themeStyles.itemText, isSelected && themeStyles.itemTextActive]}>{name}</Text>
        {isSelected && <Ionicons name="checkmark" size={20} color={isDark ? '#F5F5F5' : '#18181B'} />}
      </TouchableOpacity>
    );
  };

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSearchQuery('');
  }, [step, visible]);

  const rawData = step === 'PROVINCE' ? provincesData : selectedProv?.wards || [];
  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim()) return rawData;
    const q = searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rawData.filter((item: any) => {
      const n = (item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return n.includes(q);
    });
  }, [rawData, searchQuery]);

  return (
    <AnimatedBottomSheetModal
      visible={visible}
      onClose={onClose}
      contentStyle={themeStyles.modalContent}
      avoidKeyboard={false}
      showHandle={true}
    >
      <View style={themeStyles.header}>
        {step === 'WARD' ? (
          <ScalePressable onPress={() => { setStep('PROVINCE'); setSearchQuery(''); }} style={themeStyles.iconBtn} activeScale={0.88}>
            <Ionicons name="chevron-back" size={22} color={isDark ? '#F5F5F5' : '#18181B'} style={{ marginLeft: -1 }} />
          </ScalePressable>
        ) : (
          <View style={themeStyles.iconBtn} />
        )}
        <Text style={themeStyles.title}>
          {step === 'PROVINCE'
            ? (t('selectProvinceCity') || 'Chọn Tỉnh / Thành phố')
            : (t('selectWard') || 'Chọn Phường / Xã')}
        </Text>
        <ScalePressable onPress={onClose} style={themeStyles.iconBtn} activeScale={0.88}>
          <Ionicons name="close" size={22} color={isDark ? '#F5F5F5' : '#18181B'} />
        </ScalePressable>
      </View>

      {/* Thanh tìm kiếm nhanh */}
      <View style={themeStyles.searchBoxWrapper}>
        <Ionicons name="search-outline" size={18} color={isDark ? '#F5F5F5' : '#2B2928'} style={{ marginRight: 8 }} />
        <TextInput
          style={themeStyles.searchInput}
          placeholder={
            step === 'PROVINCE'
              ? (t('searchProvinceCity') || 'Gõ tìm Tỉnh / Thành phố...')
              : (t('searchWard') || 'Gõ tìm Phường / Xã...')
          }
          placeholderTextColor={isDark ? 'rgba(245, 245, 245, 0.72)' : 'rgba(43, 41, 40, 0.68)'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color={isDark ? '#F5F5F5' : '#2B2928'} />
          </TouchableOpacity>
        )}
      </View>
      
      <FlatList
        data={filteredData}
        keyExtractor={(item) => (step === 'PROVINCE' ? item.province_code : item.ward_code)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={themeStyles.listContainer}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <Ionicons name="search" size={32} color={isDark ? '#333333' : '#D1C7BD'} style={{ marginBottom: 8 }} />
            <Text style={{ fontFamily: 'ElleGaborStd', fontSize: 14, color: isDark ? '#888888' : '#9E968D' }}>
              {t('noResultsFound') || 'Không tìm thấy kết quả phù hợp'}
            </Text>
          </View>
        }
      />
    </AnimatedBottomSheetModal>
  );
};

const getStyles = (Colors: any, insets: any, isDark: boolean) => {
  return StyleSheet.create({
    modalContent: {
      backgroundColor: isDark ? '#121212' : Colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: Math.min(SCREEN_HEIGHT * 0.78, 650),
      paddingHorizontal: 0,
      paddingBottom: Math.max(insets.bottom, 16),
      borderWidth: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#222222' : '#F0ECE6',
    },
    title: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F5F5F5' : '#18181B',
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBoxWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
      marginHorizontal: 16,
      marginVertical: 12,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 22,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    searchInput: {
      flex: 1,
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      color: isDark ? '#F5F5F5' : '#2B2928',
      paddingVertical: 0,
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#222222' : '#F0ECE6',
    },
    itemText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 15,
      color: isDark ? '#CCCCCC' : '#2D3B34',
    },
    itemTextActive: {
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#18181B',
    },
  });
};
