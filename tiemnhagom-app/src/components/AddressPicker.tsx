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
import provincesData from '../../assets/data/provinces.json';

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
        style={styles.itemRow}
        onPress={() => (isProvStep ? handleSelectProvince(item) : handleSelectWard(item))}
      >
        <Text style={[styles.itemText, isSelected && styles.itemTextActive]}>{name}</Text>
        {isSelected && <Ionicons name="checkmark" size={20} color="#18181B" />}
      </TouchableOpacity>
    );
  };

  const data = step === 'PROVINCE' ? provincesData : selectedProv?.wards || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        
        <View style={styles.modalContent}>
          <View style={styles.header}>
            {step === 'WARD' ? (
              <TouchableOpacity onPress={() => setStep('PROVINCE')} style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={24} color="#18181B" />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconBtn} />
            )}
            <Text style={styles.title}>{step === 'PROVINCE' ? 'Chọn Tỉnh / Thành phố' : 'Chọn Phường / Xã'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color="#18181B" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={data}
            keyExtractor={(item) => (step === 'PROVINCE' ? item.province_code : item.ward_code)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
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
