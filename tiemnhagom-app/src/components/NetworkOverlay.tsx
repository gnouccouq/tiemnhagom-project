import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';

const { width, height } = Dimensions.get('window');

export default function NetworkOverlay() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const { t } = useSettings();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  if (isConnected !== false) return null;

  return (
    <View style={styles.container}>
      <View style={styles.overlay}>
        <Ionicons name="cloud-offline" size={60} color="#FF4D4F" />
        <Text style={styles.title}>Không có kết nối mạng</Text>
        <Text style={styles.subtitle}>
          Vui lòng kiểm tra lại kết nối Wi-Fi hoặc 3G/4G của bạn. Ứng dụng cần có kết nối mạng để hoạt động.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999,
  },
  overlay: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    width: width * 0.85,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
    color: '#333333',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  }
});
