import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Check if we are running inside Expo Go
const isExpoGo =
  (typeof isRunningInExpoGo === 'function' ? isRunningInExpoGo() : false) ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

let Notifications: any = null;

// Only require expo-notifications if we are NOT in Expo Go on Android.
// (Expo SDK 53+ removed Android push notifications from Expo Go).
if (!(isExpoGo && Platform.OS === 'android')) {
  try {
    Notifications = require('expo-notifications');
    // Handle incoming notifications when the app is foregrounded
    if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  } catch (e) {
    console.log('Failed to load expo-notifications', e);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  try {
    // If running in Expo Go on Android, push notifications are not supported (SDK 53+)
    if (isExpoGo && Platform.OS === 'android') {
      console.log('Push notifications are not supported in Expo Go on Android (SDK 53+). Please use a development build.');
      return undefined;
    }

    // If Notifications is null (e.g. Expo Go on Android), we can't register for push notifications.
    if (!Notifications) {
      console.log('Push notifications module is not available.');
      return undefined;
    }

    let token: string | undefined;

    if (Platform.OS === 'android') {
      try {
        const importance =
          Notifications.AndroidImportance?.MAX ??
          Notifications.AndroidImportance?.DEFAULT ??
          5;

        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#9C7156',
        });
      } catch (channelErr) {
        console.warn('Notice: Failed to set notification channel (harmless in dev):', channelErr);
      }
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return undefined;
      }
      // Learn more about projectId: https://docs.expo.dev/push-notifications/push-notifications-setup/#configure-projectid
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      if (!projectId) {
        console.log('Project ID not found');
      }

      try {
        const pushTokenString = (
          await Notifications.getExpoPushTokenAsync({
            projectId,
          })
        ).data;
        token = pushTokenString;
      } catch (e: unknown) {
        console.log('Error getting push token', e);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    return token;
  } catch (error) {
    console.warn('Unhandled error in registerForPushNotificationsAsync:', error);
    return undefined;
  }
}

export async function savePushTokenToFirestore(userId: string, token: string) {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      expoPushToken: token,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}
