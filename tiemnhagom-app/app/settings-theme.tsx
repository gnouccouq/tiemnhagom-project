import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';

export default function SettingsThemeScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { themeMode, setThemeMode, t } = useSettings();
  const [scrollY, setScrollY] = useState(0);

  const options = [
    {
      id: 'system' as const,
      title: t('systemTheme') || 'Theo hệ thống',
      subtitle: 'Tự động thay đổi theo cài đặt sáng/tối của thiết bị',
      icon: 'phone-portrait-outline' as const,
      bg: isDark ? '#33281D' : '#F4E4CE',
      color: isDark ? '#E8CCB2' : '#7C5332',
    },
    {
      id: 'light' as const,
      title: t('lightTheme') || 'Sáng (Light)',
      subtitle: 'Nền gốm kem ấm, dễ nhìn vào ban ngày',
      icon: 'sunny-outline' as const,
      bg: isDark ? '#352B1E' : '#F5E4C4',
      color: isDark ? '#F0D095' : '#96681B',
    },
    {
      id: 'dark' as const,
      title: t('darkTheme') || 'Tối (Dark)',
      subtitle: 'Nền đen sâu dịu mắt, tiết kiệm pin màn hình OLED',
      icon: 'moon-outline' as const,
      bg: isDark ? '#2D2A27' : '#EAE4DC',
      color: isDark ? '#D5CBC0' : '#5E554C',
    },
  ];

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('appTheme') || 'Giao diện'}
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
        <Text style={styles.sectionKicker}>{t('chooseTheme') || 'Chế độ hiển thị'}</Text>
        <View style={styles.groupCard}>
          {options.map((item, idx) => {
            const active = themeMode === item.id;
            return (
              <React.Fragment key={item.id}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <TouchableOpacity
                  style={styles.settingRow}
                  activeOpacity={0.7}
                  onPress={() => setThemeMode(item.id)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={styles.rowTextCol}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
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
    rowTextCol: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    rowSubtitle: {
      fontSize: 12.5,
      color: Colors.textMuted || '#7D756C',
      marginTop: 2,
      lineHeight: 17,
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
