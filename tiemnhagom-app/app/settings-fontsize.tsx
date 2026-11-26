import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';

export default function SettingsFontSizeScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { fontSize, setFontSize, t } = useSettings();
  const [scrollY, setScrollY] = useState(0);

  const sizes = [
    { id: 'small' as const, label: t('small') || 'Nhỏ', sample: 12 },
    { id: 'normal' as const, label: t('medium') || 'Vừa', sample: 15 },
    { id: 'large' as const, label: t('large') || 'Lớn', sample: 18 },
  ];

  const previewSize = fontSize === 'small' ? 12.5 : fontSize === 'large' ? 16.5 : 14.5;

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('fontSizeTitle') || 'Kích thước chữ'}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 + 12 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <Text style={styles.sectionKicker}>{t('previewText') || 'Xem trước'}</Text>
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="sparkles-outline" size={16} color="#9C7156" />
            <Text style={styles.previewBadge}>Tiệm Nhà Gốm</Text>
          </View>
          <Text style={[styles.previewText, { fontSize: previewSize, lineHeight: previewSize * 1.5 }]}>
            {t('sampleText') || 'Gốm thủ công tinh tế mang hơi ấm thiên nhiên vào không gian sống của bạn.'}
          </Text>
        </View>

        <Text style={[styles.sectionKicker, { marginTop: 22 }]}>{t('adjustTextSize') || 'Chọn cỡ chữ'}</Text>
        <View style={styles.groupCard}>
          {sizes.map((item, idx) => {
            const active = fontSize === item.id;
            return (
              <React.Fragment key={item.id}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <TouchableOpacity
                  style={styles.settingRow}
                  activeOpacity={0.7}
                  onPress={() => setFontSize(item.id)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2F2A26' : '#EDE5DC' }]}>
                    <Text style={[styles.aaText, { fontSize: item.sample }]}>Aa</Text>
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>{item.label}</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color="#9C7156" />
                  ) : (
                    <View style={styles.radioEmpty} />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#121212' : '#FAF8F5'),
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    sectionKicker: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#7C5332',
      marginBottom: 10,
      marginLeft: 6,
    },
    previewCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 22,
      padding: 18,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    previewBadge: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#9C7156',
    },
    previewText: {
      color: Colors.textPrimary,
    },
    groupCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 14,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aaText: {
      fontWeight: '800',
      color: isDark ? '#E8CCB2' : '#7C5332',
    },
    rowTextCol: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 16,
    },
    radioEmpty: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.8,
      borderColor: isDark ? '#4A4642' : '#D5CFC7',
    },
  });
