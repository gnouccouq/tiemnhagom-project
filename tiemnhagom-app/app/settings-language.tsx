import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';

export default function SettingsLanguageScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { language, setLanguage, t } = useSettings();
  const [scrollY, setScrollY] = useState(0);

  const languages = [
    {
      id: 'vi' as const,
      title: t('vietnamese') || 'Tiếng Việt',
      subtitle: 'Ngôn ngữ mặc định',
      flag: 'https://flagcdn.com/w80/vn.png',
    },
    {
      id: 'en' as const,
      title: t('english') || 'English',
      subtitle: 'English (International)',
      flag: 'https://flagcdn.com/w80/gb.png',
    },
    {
      id: 'zh' as const,
      title: t('chinese') || '中文 (Chinese)',
      subtitle: '简体中文',
      flag: 'https://flagcdn.com/w80/cn.png',
    },
  ];

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('appLanguage') || 'Ngôn ngữ'}
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
        <Text style={styles.sectionKicker}>{t('chooseLanguage') || 'Chọn ngôn ngữ hiển thị'}</Text>
        <View style={styles.groupCard}>
          {languages.map((item, idx) => {
            const active = language === item.id;
            return (
              <React.Fragment key={item.id}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <TouchableOpacity
                  style={styles.settingRow}
                  activeOpacity={0.7}
                  onPress={() => setLanguage(item.id)}
                >
                  <Image source={{ uri: item.flag }} style={styles.flagCircle} contentFit="cover" />
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
    flagCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
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
