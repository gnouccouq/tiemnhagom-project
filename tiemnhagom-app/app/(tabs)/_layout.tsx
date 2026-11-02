import React, { useMemo, useState, useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import * as FileSystem from 'expo-file-system/legacy';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useThemeColor } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { CircularAvatarProcessor, getAvatarHash } from '../../src/components/CircularAvatarProcessor';

export default function TabLayout() {
  const router = useRouter();
  const Colors = useThemeColor();
  const { unreadCount } = useNotificationBadge();
  const { t } = useSettings();
  const { user, userProfile } = useAuth();

  // Avatar đồng bộ từ tài khoản người dùng: khi đổi avatar sẽ tự động cập nhật
  const avatarUrl =
    (userProfile?.photoURL && userProfile.photoURL.trim()) ||
    (userProfile?.avatar && userProfile.avatar.trim()) ||
    (user?.photoURL && user.photoURL.trim()) ||
    null;

  const [circularAvatarUri, setCircularAvatarUri] = useState<string | null>(null);

  // Đọc file avatar hình tròn đã cache sẵn trong bộ nhớ đệm
  useEffect(() => {
    if (!avatarUrl) {
      setCircularAvatarUri(null);
      return;
    }
    const hash = getAvatarHash(avatarUrl);
    const target = `${FileSystem.cacheDirectory}avatar_circle_${hash}.png`;
    FileSystem.getInfoAsync(target)
      .then((info) => {
        if (info.exists) {
          setCircularAvatarUri(target);
        }
      })
      .catch(() => {});
  }, [avatarUrl]);

  // Chỉ dùng activeAvatar khi đã có ảnh tròn được xử lý (tránh lỗi hiển thị icon ảnh vuông thô ráp trên Android và iOS)
  const activeAvatar = circularAvatarUri;

  const profileIconSource = useMemo(() => {
    if (!activeAvatar) {
      return {
        default: require('../../assets/icons/tabler/tabler_user.png'),
        selected: require('../../assets/icons/tabler/tabler_user_selected.png'),
      };
    }
    return {
      default: { uri: activeAvatar, width: 28, height: 28 },
      selected: { uri: activeAvatar, width: 28, height: 28 },
    };
  }, [activeAvatar]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <NativeTabs
        tintColor="#9C7156"
        backgroundColor={Colors.background}
        minimizeBehavior="automatic"
        labelVisibilityMode="unlabeled"
      >
        {/* 1. Trang chủ: icon-smart-home */}
        <NativeTabs.Trigger name="index" accessibilityLabel={t('home')}>
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon
            src={{
              default: require('../../assets/icons/tabler/tabler_home.png'),
              selected: require('../../assets/icons/tabler/tabler_home_selected.png'),
            }}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* 2. Danh mục: icon-layout-grid */}
        <NativeTabs.Trigger name="products" accessibilityLabel={t('categories')}>
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon
            src={{
              default: require('../../assets/icons/tabler/tabler_grid.png'),
              selected: require('../../assets/icons/tabler/tabler_grid_selected.png'),
            }}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* 3. Ưu đãi: icon-tag */}
        <NativeTabs.Trigger name="deals" accessibilityLabel={t('deals')}>
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon
            src={{
              default: require('../../assets/icons/tabler/tabler_tag.png'),
              selected: require('../../assets/icons/tabler/tabler_tag_selected.png'),
            }}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* 4. Thông báo: icon-bell với badge số lượng chưa đọc */}
        <NativeTabs.Trigger name="notifications-tab" accessibilityLabel={t('notifications') || 'Thông báo'}>
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon
            src={{
              default: require('../../assets/icons/tabler/tabler_bell.png'),
              selected: require('../../assets/icons/tabler/tabler_bell_selected.png'),
            }}
            renderingMode="template"
          />
          {unreadCount > 0 && (
            <NativeTabs.Trigger.Badge>{unreadCount > 99 ? '99+' : String(unreadCount)}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        {/* 5. Tài khoản: icon avatar tròn 28px chuẩn tỉ lệ không bị vỡ khung */}
        <NativeTabs.Trigger
          name="profile"
          accessibilityLabel={t('profile')}
          unstable_nativeProps={{
            android: {
              icon: {
                type: 'imageSource',
                imageSource: profileIconSource.default,
                tinting: activeAvatar ? 'original' : 'default',
              },
              selectedIcon: {
                type: 'imageSource',
                imageSource: profileIconSource.selected,
                tinting: activeAvatar ? 'original' : 'default',
              },
            },
          }}
        >
          <NativeTabs.Trigger.Label hidden />
          <NativeTabs.Trigger.Icon
            src={profileIconSource}
            renderingMode={activeAvatar ? 'original' : 'template'}
          />
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* Headless processor cắt ảnh tròn và viền men gốm #E8CCB2 trong suốt anti-aliased */}
      <CircularAvatarProcessor avatarUrl={avatarUrl} onProcessed={setCircularAvatarUri} />
    </View>
  );
}
