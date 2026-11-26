// app/version.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';
import { usePageAnimation } from '../src/hooks/usePageAnimation';
import { CHANGELOG_HISTORY } from '../src/constants/changelog';

const CERAMIC_BADGE_THEMES = (isDark: boolean) => [
  { icon: 'sparkles' as const, bg: isDark ? '#352B1E' : '#F5E4C4', color: isDark ? '#F0D095' : '#96681B' },
  { icon: 'gift' as const, bg: isDark ? '#382522' : '#F6DDD7', color: isDark ? '#EEA898' : '#B5482B' },
  { icon: 'layers' as const, bg: isDark ? '#33281D' : '#F4E4CE', color: isDark ? '#E8CCB2' : '#7C5332' },
  { icon: 'notifications' as const, bg: isDark ? '#2D2A27' : '#EAE4DC', color: isDark ? '#D5CBC0' : '#5E554C' },
  { icon: 'shield-checkmark' as const, bg: isDark ? '#362722' : '#F3DFD6', color: isDark ? '#E8B8A2' : '#8F4D32' },
];

export default function VersionScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const { pageStyle } = usePageAnimation();
  const [scrollY, setScrollY] = useState(0);

  const badgeThemes = CERAMIC_BADGE_THEMES(isDark);

  return (
    <Animated.View style={[styles.safeArea, pageStyle]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <Header
        title={t('whatsNewTitle') || 'Có gì mới'}
        showBack={true}
        showCart={false}
        showSearch={false}
        transparent
        scrollY={scrollY}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 56 + 10,
            paddingBottom: Math.max(insets.bottom, 24) + 32,
          },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {CHANGELOG_HISTORY.map((release, rIdx) => (
          <View key={`${release.version}-${release.otaVersion}-${rIdx}`} style={styles.releaseBlock}>
            <Text style={styles.releaseHeading}>
              {t('releasePrefix') || 'Bản'} {release.version} · {release.releaseDate}
            </Text>

            <View style={styles.groupCard}>
              {release.changes.map((change, cIdx) => {
                const theme = badgeThemes[(rIdx * 3 + cIdx) % badgeThemes.length];
                return (
                  <React.Fragment key={`${rIdx}-${cIdx}`}>
                    {cIdx > 0 && <View style={styles.rowDivider} />}
                    <View style={styles.changeRow}>
                      <View style={[styles.iconSquare, { backgroundColor: theme.bg }]}>
                        <Ionicons name={theme.icon} size={19} color={theme.color} />
                      </View>
                      <View style={styles.changeTextCol}>
                        <Text style={styles.changeTitle}>{change.title}</Text>
                        <Text style={styles.changeDesc}>{change.description}</Text>
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
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
    releaseBlock: {
      marginBottom: 22,
    },
    releaseHeading: {
      fontSize: 14,
      fontWeight: '700',
      color: Colors.textMuted || '#7D756C',
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
    changeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 14,
    },
    iconSquare: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    changeTextCol: {
      flex: 1,
    },
    changeTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
      lineHeight: 21,
    },
    changeDesc: {
      fontSize: 13.5,
      color: Colors.textMuted || '#7D756C',
      marginTop: 3,
      lineHeight: 19,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 16,
    },
  });
