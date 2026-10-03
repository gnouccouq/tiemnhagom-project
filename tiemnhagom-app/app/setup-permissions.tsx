import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useSettings } from '../src/context/SettingsContext';

export default function SetupPermissionsScreen() {
  const router = useRouter();
  const { t, isPushNotificationEnabled, setPushNotificationEnabled } = useSettings();
  
  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(isPushNotificationEnabled);

  const requestLocationPermission = async () => {
    if (locationGranted) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setLocationGranted(true);
    }
  };

  const requestNotificationPermission = async () => {
    if (notificationGranted) return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      setNotificationGranted(true);
      setPushNotificationEnabled(true);
    }
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem('has_seen_onboarding', 'true');
    router.replace('/auth/login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <View style={styles.container}>
        <View style={{alignItems: 'center', marginBottom: 30, marginTop: 20}}>
          <Ionicons name="shield-checkmark" size={60} color="#2D3B34" />
        </View>
        <Text style={[styles.title, {textAlign: 'center'}]}>{t('allowPermissionsTitle')}</Text>
        <Text style={[styles.subtitle, {textAlign: 'center', marginBottom: 40}]}>{t('allowPermissionsSubtitle')}</Text>
        
        {/* Location Permission */}
        <View style={styles.permCard}>
          <View style={styles.permIconWrap}>
            <Ionicons name="location" size={24} color="#2D3B34" />
          </View>
          <View style={styles.permInfo}>
            <Text style={styles.permName}>{t('allowLocationTitle')}</Text>
            <Text style={styles.permDesc}>{t('allowLocationDesc')}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.permBtn, locationGranted && styles.permBtnGranted]} 
            onPress={requestLocationPermission}
            disabled={locationGranted}
          >
            <Text style={[styles.permBtnText, locationGranted && {color: '#FFFFFF'}]}>
              {locationGranted ? t('permissionGranted') : t('grantPermission')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notification Permission */}
        <View style={[styles.permCard, {marginTop: 16}]}>
          <View style={styles.permIconWrap}>
            <Ionicons name="notifications" size={24} color="#2D3B34" />
          </View>
          <View style={styles.permInfo}>
            <Text style={styles.permName}>{t('allowNotificationTitle')}</Text>
            <Text style={styles.permDesc}>{t('allowNotificationDesc')}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.permBtn, notificationGranted && styles.permBtnGranted]} 
            onPress={requestNotificationPermission}
            disabled={notificationGranted}
          >
            <Text style={[styles.permBtnText, notificationGranted && {color: '#FFFFFF'}]}>
              {notificationGranted ? t('permissionGranted') : t('grantPermission')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextButton} onPress={handleFinish} activeOpacity={0.8}>
            <Text style={styles.nextButtonText}>{t('finishSetup')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3B34',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#7A827E',
    lineHeight: 20,
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E1E8DF',
  },
  permIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF3EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  permInfo: {
    flex: 1,
  },
  permName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3B34',
    marginBottom: 4,
  },
  permDesc: {
    fontSize: 12,
    color: '#7A827E',
    lineHeight: 18,
  },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#EEF3EB',
    marginLeft: 12,
  },
  permBtnGranted: {
    backgroundColor: '#111111',
  },
  permBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3B34',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#FAF8F5',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    paddingVertical: 16,
    borderRadius: 24,
    gap: 8,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  }
});
