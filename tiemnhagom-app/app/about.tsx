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
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Header } from '../src/components/Header';
import { useThemeColor } from '../src/constants/theme';
import { useSettings } from '../src/context/SettingsContext';

const TIMELINE_MILESTONES = [
  {
    date: '09/2023',
    tag: 'Khởi đầu',
    title: 'Khai trương tại con hẻm nhỏ Phan Xích Long',
    desc: 'Tiệm Nhà Gốm chính thức khai trương tại một con hẻm nhỏ ở khu vực Phan Xích Long. Bên cạnh những món gốm thủ công mộc mạc, Tiệm nhận cắm hoa nghệ thuật, decor bàn tiệc, backdrop và trang trí mùa lễ hội Giáng Sinh, Tết.',
  },
  {
    date: '2024',
    tag: 'Mở rộng',
    title: 'Triển khai dịch vụ cho thuê đồ setup tiệc',
    desc: 'Tiệm bắt đầu triển khai dịch vụ cho thuê đồ setup bàn tiệc & sự kiện, mang đến các bộ chén dĩa gốm thủ công, chân nến và phụ kiện decor tinh tế giúp khách hàng tự tay tạo nên những buổi tiệc ấm cúng, đậm dấu ấn riêng.',
  },
  {
    date: '12/03/2025',
    tag: 'Hợp tác',
    title: 'Hợp tác cùng Joy Cooking Class & Homestore',
    desc: 'Tiệm Nhà Gốm hân hạnh chào đón sự hợp tác chiến lược cùng Joy Cooking Class & Homestore tại 74/10A Đường Hai Bà Trưng, Phường Sài Gòn, TP.HCM — kết nối tinh hoa gốm thủ công Việt cùng không gian trải nghiệm ẩm thực và nghệ thuật sống.',
  },
  {
    date: '11/06/2025',
    tag: 'Diện mạo mới',
    title: 'Setup cửa hàng mới tại 37 Nguyễn Duy',
    desc: 'Tiệm bắt đầu hành trình chuyển từ cửa hàng cũ và setup cửa hàng mới tại 37 Nguyễn Duy, chuẩn bị một không gian trưng bày rộng rãi, ấm áp và chỉn chu hơn để đón tiếp những tâm hồn yêu gốm.',
  },
  {
    date: '10/2025',
    tag: 'Dấu ấn riêng',
    title: 'Ra mắt những sản phẩm riêng của Tiệm Nhà Gốm',
    desc: 'Đánh dấu bước ngoặt quan trọng khi Tiệm bắt đầu có những dòng sản phẩm thiết kế riêng của Tiệm Nhà Gốm — mang đậm gu thẩm mỹ mộc mạc, tinh tế và được chăm chút từ phom dáng đến từng lớp men.',
  },
  {
    date: '01/07/2026',
    tag: 'Cột mốc mới',
    title: 'Tiệm Nhà Gốm chính thức khai trương',
    desc: 'Tiệm Nhà Gốm chính thức khai trương, mở ra chặng đường mới đầy tâm huyết — tiếp tục lan tỏa vẻ đẹp của gốm thủ công Việt, nghệ thuật hoa và những trải nghiệm bàn tiệc trọn vẹn đến mọi mái nhà.',
    highlight: true,
  },
];

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { t } = useSettings();
  const [scrollY, setScrollY] = useState(0);

  const PILLARS = [
    {
      index: '01 · GỐM THỦ CÔNG',
      title: 'Gốm Việt & Thiết kế riêng',
      desc: 'Tuyển chọn gốm sứ thủ công Bát Tràng, Lái Thiêu cùng các mẫu thiết kế độc quyền của Tiệm Nhà Gốm, nung ở nhiệt độ cao 1.250°C an toàn cho sức khỏe.',
      icon: 'cafe' as const,
      bg: isDark ? '#33281D' : '#F4E4CE',
      color: isDark ? '#E8CCB2' : '#7C5332',
      route: '/(tabs)/products',
    },
    {
      index: '02 · HOA & DECOR',
      title: 'Cắm hoa & Trang trí sự kiện',
      desc: 'Thiết kế hoa nghệ thuật kết hợp bình gốm mộc, decor bàn tiệc ấm cúng, backdrop sự kiện cũng như không gian lễ hội Giáng Sinh và Tết.',
      icon: 'flower' as const,
      bg: isDark ? '#382522' : '#F6DDD7',
      color: isDark ? '#EEA898' : '#B5482B',
      route: '/hoa-nha-gom',
    },
    {
      index: '03 · SETUP TIỆC',
      title: 'Cho thuê đồ setup bàn tiệc',
      desc: 'Cung cấp trọn gói chén dĩa gốm, ly tách, chân nến và phụ kiện bàn tiệc cho thuê — giải pháp tinh tế, tiết kiệm cho tiệc gia đình, workshop và chụp ảnh.',
      icon: 'sparkles' as const,
      bg: isDark ? '#352B1E' : '#F5E4C4',
      color: isDark ? '#F0D095' : '#96681B',
      route: '/event-decor',
    },
  ];

  const PROMISES = [
    {
      icon: 'sparkles' as const,
      bg: isDark ? '#352B1E' : '#F5E4C4',
      color: isDark ? '#F0D095' : '#96681B',
      title: '100% Thủ công',
      desc: 'Từng đường nét vuốt tay và lớp men tự nhiên mang vẻ đẹp độc bản, không trùng lặp.',
    },
    {
      icon: 'shield-checkmark' as const,
      bg: isDark ? '#33281D' : '#F4E4CE',
      color: isDark ? '#E8CCB2' : '#7C5332',
      title: 'An toàn 1.250°C',
      desc: 'Khử hoàn toàn chì và tạp chất kim loại nặng, an tâm sử dụng hằng ngày cho gia đình.',
    },
    {
      icon: 'cube' as const,
      bg: isDark ? '#2D2A27' : '#EAE4DC',
      color: isDark ? '#D5CBC0' : '#5E554C',
      title: 'Bảo hành bể vỡ',
      desc: 'Cam kết đổi mới 100% miễn phí nếu sản phẩm không may gặp sự cố khi vận chuyển.',
    },
    {
      icon: 'gift' as const,
      bg: isDark ? '#382522' : '#F6DDD7',
      color: isDark ? '#EEA898' : '#B5482B',
      title: 'Đóng gói chống sốc & Gói quà',
      desc: 'Bọc xốp nổ nhiều lớp chắc chắn khi giao đi xa, đồng thời hỗ trợ gói quà và viết thiệp tay miễn phí.',
    },
  ];

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header
        title={t('aboutTiemNhaGom') || 'Về Tiệm Nhà Gốm'}
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
          { paddingTop: insets.top + 56 + 10, paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* 1. HERO */}
        <View style={styles.heroCard}>
          <Image
            source={require('../assets/images/about-story.jpg')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.08)', 'rgba(20,14,10,0.84)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroKicker}>09/2023 → 01/07/2026 · 6 DẤU MỐC ĐÁNG NHỚ</Text>
            <Text style={styles.heroTitle}>Hành trình trưởng thành của Tiệm Nhà Gốm</Text>
            <Text style={styles.heroSub}>
              Từng cột mốc là một bước đi chậm rãi nhưng vững chắc — viết nên từ sự tin yêu của khách hàng và tâm huyết dành trọn cho từng mẻ gốm.
            </Text>
          </View>
        </View>

        {/* 2. DÒNG THỜI GIAN (6 MỐC GIỐNG WEB) */}
        <Text style={styles.sectionKicker}>Dòng thời gian</Text>
        <View style={styles.groupCard}>
          {TIMELINE_MILESTONES.map((m, idx) => (
            <React.Fragment key={m.date}>
              {idx > 0 && <View style={styles.rowDivider} />}
              <View style={[styles.timelineRow, m.highlight && styles.timelineRowHighlight]}>
                <View style={styles.timelineHead}>
                  <View style={styles.timelineDatePill}>
                    <Text style={styles.timelineDateText}>{m.date}</Text>
                  </View>
                  <Text style={styles.timelineTag}>{m.tag}</Text>
                </View>
                <Text style={styles.timelineTitle}>{m.title}</Text>
                <Text style={styles.timelineDesc}>{m.desc}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* 3. HỆ SINH THÁI TIỆM NHÀ GỐM (3 MẢNH GHÉP) */}
        <Text style={styles.sectionKicker}>Ba mảnh ghép tạo nên không gian sống an yên</Text>
        <View style={styles.groupCard}>
          {PILLARS.map((item, idx) => (
            <React.Fragment key={item.title}>
              {idx > 0 && <View style={styles.rowDivider} />}
              <TouchableOpacity
                style={styles.listRow}
                activeOpacity={0.7}
                onPress={() => router.push(item.route as any)}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.pillarIndex}>{item.index}</Text>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSub}>{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* 4. TRIẾT LÝ THƯƠNG HIỆU */}
        <View style={styles.quoteCard}>
          <Text style={styles.quoteBadge}>TRIẾT LÝ CỦA CHÚNG TÔI</Text>
          <Text style={styles.quoteText}>
            "Sự tử tế trong từng sản phẩm thủ công sẽ lan tỏa niềm an yên và sự trọn vẹn đến mỗi góc ấm gia đình."
          </Text>
          <Text style={styles.quoteAuthor}>— Đội ngũ Tiệm Nhà Gốm —</Text>
        </View>

        {/* 5. 4 CAM KẾT */}
        <Text style={styles.sectionKicker}>Cam kết của Tiệm</Text>
        <View style={styles.groupCard}>
          {PROMISES.map((p, idx) => (
            <React.Fragment key={p.title}>
              {idx > 0 && <View style={styles.rowDivider} />}
              <View style={styles.listRow}>
                <View style={[styles.iconCircle, { backgroundColor: p.bg }]}>
                  <Ionicons name={p.icon} size={20} color={p.color} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle}>{p.title}</Text>
                  <Text style={styles.rowSub}>{p.desc}</Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* 6. GHÉ THĂM TIỆM */}
        <Text style={styles.sectionKicker}>Ghé thăm Tiệm</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.listRow}
            activeOpacity={0.7}
            onPress={() => router.push('/stores' as any)}
          >
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#33281D' : '#F4E4CE' }]}>
              <Ionicons name="storefront" size={20} color={isDark ? '#E8CCB2' : '#7C5332'} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Cửa hàng chính — Tiệm Nhà Gốm</Text>
              <Text style={styles.rowSub}>Số 37 Nguyễn Duy, Phường Gia Định, TP.HCM · 10:30 — 21:00</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.listRow}
            activeOpacity={0.7}
            onPress={() => router.push('/stores' as any)}
          >
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2D2A27' : '#EAE4DC' }]}>
              <Ionicons name="location" size={20} color={isDark ? '#D5CBC0' : '#5E554C'} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Cửa hàng ký gửi — Joy Cooking Class & Homestore</Text>
              <Text style={styles.rowSub}>74/10A Đường Hai Bà Trưng, Phường Sài Gòn, TP.HCM · 08:00 — 22:00</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.listRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('tel:0777709662')}
          >
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#352B1E' : '#F5E4C4' }]}>
              <Ionicons name="call" size={20} color={isDark ? '#F0D095' : '#96681B'} />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowTitle}>Hotline tư vấn</Text>
              <Text style={styles.rowSub}>0777 709 662</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={Colors.textMuted || '#9E968D'} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: Colors.background || (isDark ? '#000000' : '#FAF8F5'),
    },
    scrollContent: {
      paddingHorizontal: 16,
    },
    heroCard: {
      height: 235,
      borderRadius: 24,
      overflow: 'hidden',
      justifyContent: 'flex-end',
      marginBottom: 22,
    },
    heroContent: {
      padding: 20,
    },
    heroKicker: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#E8CCB2',
      letterSpacing: 0.9,
      marginBottom: 5,
    },
    heroTitle: {
      fontSize: 23,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 30,
    },
    heroSub: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 6,
      lineHeight: 19,
    },
    sectionKicker: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#7C5332',
      marginBottom: 10,
      marginLeft: 6,
    },
    groupCard: {
      backgroundColor: Colors.cardBackground || (isDark ? '#1A1A1A' : '#FFFFFF'),
      borderRadius: 22,
      overflow: 'hidden',
      marginBottom: 22,
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#EFEAE2',
    },
    timelineRow: {
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    timelineRowHighlight: {
      backgroundColor: isDark ? 'rgba(156, 113, 86, 0.14)' : '#FAF3EB',
    },
    timelineHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    timelineDatePill: {
      backgroundColor: '#9C7156',
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
    },
    timelineDateText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    timelineTag: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#E8CCB2' : '#8A5A2B',
    },
    timelineTitle: {
      fontSize: 15.5,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginBottom: 4,
    },
    timelineDesc: {
      fontSize: 13.5,
      color: Colors.textMuted || '#6E665D',
      lineHeight: 20,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
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
      marginTop: 2,
    },
    rowTextCol: {
      flex: 1,
    },
    pillarIndex: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#9C7156',
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    rowTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: Colors.textPrimary,
    },
    rowSub: {
      fontSize: 13,
      color: Colors.textMuted || '#7D756C',
      marginTop: 3,
      lineHeight: 19,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EFEAE2',
      marginLeft: 16,
    },
    quoteCard: {
      backgroundColor: isDark ? '#231B16' : '#2B241F',
      borderRadius: 22,
      padding: 20,
      marginBottom: 22,
    },
    quoteBadge: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#E8CCB2',
      letterSpacing: 1,
      marginBottom: 8,
    },
    quoteText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      lineHeight: 24,
    },
    quoteAuthor: {
      fontSize: 12.5,
      color: 'rgba(255,255,255,0.72)',
      marginTop: 10,
      fontWeight: '600',
    },
  });
