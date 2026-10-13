import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useThemeColor, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

import { AnimatedCenterModal } from './AnimatedCenterModal';
import { ScalePressable } from './ScalePressable';

function compareVersions(v1: string, v2: string) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export default function ForceUpdateChecker() {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const [isUpdateRequired, setIsUpdateRequired] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const configDocRef = doc(db, 'app_config', 'settings');
        const configSnap = await getDoc(configDocRef);

        if (configSnap.exists()) {
          const data = configSnap.data();
          const minAppVersion = data.min_app_version;
          const iosUrl = data.store_url_ios || 'itms-apps://itunes.apple.com/app/idYOUR_APP_ID';
          const androidUrl = data.store_url_android || 'market://details?id=com.tiemnhagom.app';

          const currentVersion = Constants.expoConfig?.version || '1.0.0';

          if (minAppVersion && compareVersions(currentVersion, minAppVersion) < 0) {
            setStoreUrl(Platform.OS === 'ios' ? iosUrl : androidUrl);
            setIsUpdateRequired(true);
          }
        }
      } catch (error) {
        console.error('Error checking app version:', error);
      }
    };

    checkVersion();
  }, []);

  if (!isUpdateRequired) return null;

  return (
    <AnimatedCenterModal
      visible={isUpdateRequired}
      onClose={() => {}}
      dismissOnBackdropPress={false}
      contentStyle={styles.modalContainer}
    >
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-download-outline" size={48} color={isDark ? '#E8CCB2' : '#9C7156'} />
      </View>
      <Text style={styles.title}>Cập nhật bản mới</Text>
      <Text style={styles.message}>
        Tiệm Nhà Gốm vừa ra mắt phiên bản mới với nhiều tính năng và trải nghiệm tốt hơn. Vui lòng cập nhật để tiếp tục sử dụng nhé!
      </Text>
      <ScalePressable 
        style={styles.button}
        onPress={() => Linking.openURL(storeUrl)}
        activeScale={0.96}
      >
        <Text style={styles.buttonText}>Cập nhật ngay</Text>
      </ScalePressable>
    </AnimatedCenterModal>
  );
}

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  modalContainer: {
    backgroundColor: isDark ? '#121212' : Colors.cardBackground,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxxl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 0,
    ...Shadows.lg,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: isDark ? '#1E1E1E' : Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xxl,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#9C7156',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.pill,
    width: '100%',
    alignItems: 'center',
    ...Shadows.sm,
  },
  buttonText: {
    fontFamily: Typography.fontFamily.bold,
    color: '#FFFFFF',
    fontSize: Typography.fontSize.md,
  },
});
