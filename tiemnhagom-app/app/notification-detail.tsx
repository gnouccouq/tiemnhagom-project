import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function NotificationDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const { title, message, imageUrl, type } = params as {
    title?: string;
    message?: string;
    imageUrl?: string;
    type?: string;
  };

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/notifications');
    }
  };

  const isOrderSuccess = type === 'order';
  const hasImage = !!imageUrl;

  return (
    <View style={styles.container}>
      {hasImage ? (
        <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
          <Image source={{ uri: imageUrl }} style={styles.headerImage} resizeMode="cover" />
          <View style={styles.contentContainer}>
            <Text style={styles.promoTitle}>{title || '✨ TO LY, NHẸ VÍ - QUÁ ĐỈNH!'}</Text>
            <Text style={styles.promoMessage}>
              {message || '😉 Cỡ Lớn đã hơn, giá vẫn như Cỡ Vừa.\n🤪 Free upsize, uống cho "đã" mà ví vẫn "êm" nhaaa người đẹp!'}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.scrollView, { paddingTop: insets.top + 60 }]}>
          <View style={styles.contentContainer}>
            <View style={styles.orderSuccessHeader}>
              <View style={styles.checkIconContainer}>
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.orderSuccessTitle}>{title || 'Đơn hàng được xác nhận'}</Text>
            </View>
            <Text style={styles.orderMessage}>{message || '7 điểm đã được tích\n+1 Tem tích vào thẻ thành viên'}</Text>
          </View>
        </View>
      )}

      {/* Nút đóng (X) */}
      <TouchableOpacity 
        style={[styles.closeButton, { top: Math.max(insets.top, 20) }]} 
        onPress={handleClose}
      >
        <Ionicons name="close" size={20} color="#666" />
      </TouchableOpacity>

      {/* Nút Action ở dưới cùng */}
      <View style={[styles.bottomActionContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => {
            if (params.link && typeof params.link === 'string') {
              router.push(params.link as any);
            } else {
              handleClose();
            }
          }}
        >
          <Text style={styles.actionButtonText}>
            {isOrderSuccess ? 'Xem chi tiết' : 'Kho Quà'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  headerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.45,
    backgroundColor: '#EFEFEF',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 100, // Để chừa chỗ cho nút action
  },
  promoTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
    lineHeight: 32,
  },
  promoMessage: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
  },
  orderSuccessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#22C55E', // Green
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  orderSuccessTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    flex: 1,
  },
  orderMessage: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  bottomActionContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },
  actionButton: {
    backgroundColor: '#BC9A6C', // Màu nâu nhạt
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionButtonText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
