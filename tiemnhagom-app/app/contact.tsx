import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { useDialog } from '../src/context/DialogContext';

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const dialog = useDialog();
  const [scrollY, setScrollY] = useState(0);

  const openHotline = () => {
    Linking.openURL('tel:0777709662').catch(() => {
      dialog.alert(t('notification') || 'Thông báo', 'Hotline: 0777 709 662');
    });
  };

  const openExternal = (url: string) => {
    Linking.openURL(url).catch(() => {
      dialog.alert(t('notification') || 'Thông báo', 'Không thể mở liên kết lúc này.');
    });
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('contactAndSocialTitle') || 'Liên hệ & Mạng xã hội'}
        showBack={true}
        showSearch={false}
        showCart={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56 + 12, paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* 1. LIÊN HỆ TRỰC TIẾP */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionKicker}>{t('contactDirectTitle') || 'Liên hệ trực tiếp'}</Text>
          <View style={styles.groupCard}>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={openHotline}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#352B1E' : '#F5E4C4' }]}>
                <Ionicons name="call" size={20} color={isDark ? '#F0D095' : '#96681B'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>{t('hotlineSupport') || 'Hotline hỗ trợ'}</Text>
                <Text style={styles.rowSubtitle}>0777 709 662</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.7}
              onPress={() => openExternal('mailto:tiemnhagom.contact@gmail.com')}
            >
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#382522' : '#F6DDD7' }]}>
                <Ionicons name="mail" size={20} color={isDark ? '#EEA898' : '#B5482B'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>Email</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>tiemnhagom.contact@gmail.com</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. MẠNG XÃ HỘI */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionKicker}>{t('contactSocialTitle') || 'Mạng xã hội'}</Text>
          <View style={styles.groupCard}>
            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.7}
              onPress={() => openExternal('https://www.facebook.com/tiemnhagom.vn')}
            >
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F4E4CE' }]}>
                <Ionicons name="logo-facebook" size={20} color={isDark ? '#E8CCB2' : '#7C5332'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>Fanpage Facebook</Text>
                <Text style={styles.rowSubtitle}>facebook.com/tiemnhagom.vn</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.7}
              onPress={() => openExternal('https://www.instagram.com/tiemnhagom.vn')}
            >
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#362722' : '#F3DFD6' }]}>
                <Ionicons name="logo-instagram" size={20} color={isDark ? '#E8B8A2' : '#8F4D32'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>Instagram</Text>
                <Text style={styles.rowSubtitle}>@tiemnhagom.vn</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            <TouchableOpacity
              style={styles.settingRow}
              activeOpacity={0.7}
              onPress={() => openExternal('https://www.tiktok.com/@tiemnhagom.vn')}
            >
              <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2D2A27' : '#EAE4DC' }]}>
                <Ionicons name="logo-tiktok" size={20} color={isDark ? '#D5CBC0' : '#4E463F'} />
              </View>
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle}>TikTok</Text>
                <Text style={styles.rowSubtitle}>@tiemnhagom.vn</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
            </TouchableOpacity>
          </View>
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
    },
    sectionBlock: {
      marginBottom: 22,
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
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 16,
    },
  });
