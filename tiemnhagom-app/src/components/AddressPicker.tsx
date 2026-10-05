import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScalePressable } from './ScalePressable';
import provincesData from '../../assets/data/provinces.json';
import { useThemeColor } from '../constants/theme';

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
  const Colors = useThemeColor();
  const themeStyles = getStyles(Colors);
  const [step, setStep] = useState<'PROVINCE' | 'WARD'>('PROVINCE');
  const [selectedProv, setSelectedProv] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      if (initialProvinceCode) {
        const p = provincesData.find((prov) => prov.province_code === initialProvinceCode);
        if (p) {
          setSelectedProv(p);
          setStep('WARD');
        } else {
          setStep('PROVINCE');
        }
      } else {
        setStep('PROVINCE');
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
        {isSelected && <Ionicons name="checkmark" size={20} color="#18181B" />}
      </TouchableOpacity>
    );
  };

  const data = step === 'PROVINCE' ? provincesData : selectedProv?.wards || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={themeStyles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={themeStyles.backdrop} />
        </TouchableWithoutFeedback>
        
        <View style={themeStyles.modalContent}>
          <View style={themeStyles.header}>
            {step === 'WARD' ? (
              <ScalePressable onPress={() => setStep('PROVINCE')} style={themeStyles.iconBtn}>
                <Ionicons name="chevron-back" size={24} color="#18181B" />
              </ScalePressable>
            ) : (
              <View style={themeStyles.iconBtn} />
            )}
            <Text style={themeStyles.title}>{step === 'PROVINCE' ? 'Chọn Tỉnh / Thành phố' : 'Chọn Phường / Xã'}</Text>
            <ScalePressable onPress={onClose} style={themeStyles.iconBtn}>
              <Ionicons name="close" size={24} color="#18181B" />
            </ScalePressable>
          </View>
          
          <FlatList
            data={data}
            keyExtractor={(item) => (step === 'PROVINCE' ? item.province_code : item.ward_code)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={themeStyles.listContainer}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (Colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '70%',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE6',
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderBottomColor: '#F0ECE6',
  },
  itemText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    color: '#2D3B34',
  },
  itemTextActive: {
    fontWeight: '700',
    color: '#18181B',
  },
});
