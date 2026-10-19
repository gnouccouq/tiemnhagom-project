// app/push-notification.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { sendPushNotification } from '../src/services/adminNotificationService';
import { ScalePressable } from '../src/components/ScalePressable';
import { FadingHeaderBackdrop } from '../src/components/FadingHeaderBackdrop';

export default function PushNotificationScreen() {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const router = useRouter();
  const { adminProfile } = useAuth();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'deal' | 'news' | 'system' | 'order'>('deal');
  const [imageUrl, setImageUrl] = useState('');
  const [link, setLink] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề và nội dung thông báo.');
      return;
    }

    setIsSending(true);
    const res = await sendPushNotification({
      title: title.trim(),
      body: body.trim(),
      type,
      imageUrl: imageUrl.trim() || undefined,
      link: link.trim() || undefined,
      senderName: adminProfile?.displayName || 'Admin Tiệm',
    });
    setIsSending(false);

    if (res.success) {
      Alert.alert('Thành công', 'Thông báo đã được phát thành công tới toàn bộ khách hàng dùng App.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert('Lỗi', res.error || 'Không thể gửi thông báo.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FadingHeaderBackdrop isDark={isDark} />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backCircleBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>Gửi thông báo đẩy App</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollBody, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? Colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? 'transparent' : '#E8E1D8',
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: Colors.textPrimary }]}>Soạn thông báo khách hàng</Text>
          <Text style={[styles.cardSubtitle, { color: Colors.textSecondary }]}>
            Thông báo sẽ hiện ngay trên thanh trạng thái và chuông thông báo của App Tiệm Nhà Gốm
          </Text>

          {/* Type Selector */}
          <View style={styles.typeRow}>
            {[
              { id: 'deal', label: '🔥 Ưu đãi & Sale' },
              { id: 'news', label: '🏺 Tin gốm & Cẩm nang' },
              { id: 'system', label: '🔔 Hệ thống' },
            ].map((t) => {
              const active = type === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.typeBtn,
                    active && styles.typeBtnActive,
                    { borderColor: active ? '#9C7156' : Colors.border },
                  ]}
                  onPress={() => setType(t.id as any)}
                >
                  <Text style={[styles.typeBtnText, active && { color: '#FFFFFF', fontWeight: '700' }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>Tiêu đề thông báo (*)</Text>
            <TextInput
              style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
              placeholder="VD: Flash Sale giờ vàng giảm đến 40% hôm nay"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Body Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>Nội dung chi tiết (*)</Text>
            <TextInput
              style={[styles.inputArea, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
              multiline
              numberOfLines={4}
              placeholder="Nhập nội dung thông điệp gửi tới khách hàng..."
              placeholderTextColor={Colors.textMuted}
              value={body}
              onChangeText={setBody}
            />
          </View>

          {/* Image URL Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>Hình ảnh đính kèm (URL tùy chọn)</Text>
            <TextInput
              style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
              placeholder="https://tiemnhagom.vn/Asset/images/..."
              placeholderTextColor={Colors.textMuted}
              value={imageUrl}
              onChangeText={setImageUrl}
            />
          </View>

          {/* Deep link Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.textSecondary }]}>Liên kết điều hướng (Deep link tùy chọn)</Text>
            <TextInput
              style={[styles.inputPill, { color: Colors.textPrimary, backgroundColor: Colors.surface, borderColor: Colors.border }]}
              placeholder="/flash-sale hoặc /product/TNGCB01"
              placeholderTextColor={Colors.textMuted}
              value={link}
              onChangeText={setLink}
            />
          </View>

          {/* Preview Box */}
          <View style={[styles.previewBox, { backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5', borderColor: Colors.border }]}>
            <View style={styles.previewHeader}>
              <Ionicons name="notifications" size={16} color="#9C7156" />
              <Text style={styles.previewHeaderTitle}>Xem trước hiển thị</Text>
            </View>
            <Text style={[styles.previewTitle, { color: Colors.textPrimary }]}>
              {title || 'Tiêu đề thông báo của bạn'}
            </Text>
            <Text style={[styles.previewBody, { color: Colors.textSecondary }]}>
              {body || 'Nội dung thông báo sẽ hiển thị ở đây như trên điện thoại người dùng...'}
            </Text>
          </View>

          {/* Submit CTA */}
          <ScalePressable
            style={[styles.btnSend, isSending && { opacity: 0.6 }]}
            onPress={handleSend}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.btnSendText}>Phát thông báo ngay</Text>
              </View>
            )}
          </ScalePressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollBody: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  cardTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12.5,
    marginBottom: 16,
    lineHeight: 17,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  typeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  typeBtnActive: {
    backgroundColor: '#9C7156',
  },
  typeBtnText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#6E665D',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputPill: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 13.5,
  },
  inputArea: {
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    fontSize: 13.5,
    textAlignVertical: 'top',
  },
  previewBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginVertical: 14,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewHeaderTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#9C7156',
    textTransform: 'uppercase',
  },
  previewTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewBody: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  btnSend: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#9C7156',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnSendText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
