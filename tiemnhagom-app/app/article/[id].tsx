// app/article/[id].tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Share,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { getArticleById, NewsArticle } from '../../src/services/productService';
import { ScalePressable } from '../../src/components/ScalePressable';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    if (id) {
      getArticleById(id)
        .then((res) => setArticle(res))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleShare = async () => {
    if (!article) return;
    try {
      await Share.share({
        title: article.title,
        message: `${article.title}\n\nĐọc tại Tiệm Nhà Gốm: https://tiemnhagom.vn/blog/article.html?id=${id}`,
      });
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B4D45" />
        <Text style={styles.loadingText}>Đang tải bài viết...</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={[styles.notFoundContainer, { paddingTop: insets.top }]}>
        <Ionicons name="document-text-outline" size={54} color="#7A827E" />
        <Text style={styles.notFoundTitle}>Bài viết không tồn tại</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Parse paragraphs from content or plain text
  const cleanContent = article.content
    ? article.content
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<[^>]*>?/gm, '')
        .trim()
    : '';

  const blurProgress = Math.min(1, Math.max(0, scrollY / 30));

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />

      {/* Header bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}>
        {blurProgress > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: blurProgress }]} pointerEvents="none">
            <BlurView
              intensity={Platform.OS === 'ios' ? 85 : 75}
              tint="light"
              experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Platform.OS === 'ios' ? 'rgba(255,255,255,0.12)' : 'rgba(250,248,245,0.45)',
                },
              ]}
            />
          </View>
        )}
        <ScalePressable
          style={styles.navBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#18181B" />
        </ScalePressable>

        <Text style={styles.navTitle} numberOfLines={1}>
          Tin Tức & Bài Viết
        </Text>

        <ScalePressable
          style={styles.navBtn}
          onPress={handleShare}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="share-outline" size={20} color="#18181B" />
        </ScalePressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 54 }]}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Featured Image */}
        {article.imageUrl ? (
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: article.imageUrl }}
              style={styles.featuredImage}
              contentFit="cover"
            />
          </View>
        ) : null}

        {/* Content Box */}
        <View style={styles.contentBox}>
          <View style={styles.tagRow}>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>BLOG TIỆM GỐM</Text>
            </View>
            {article.dateStr ? (
              <Text style={styles.dateText}>{article.dateStr}</Text>
            ) : null}
          </View>

          <Text style={styles.articleTitle}>{article.title}</Text>

          <View style={styles.divider} />

          <Text style={styles.bodyText}>
            {cleanContent || article.excerpt || 'Đang cập nhật nội dung bài viết...'}
          </Text>

          <View style={styles.brandBox}>
            <Ionicons name="leaf" size={20} color="#3B4D45" />
            <Text style={styles.brandBoxTitle}>Tiệm Nhà Gốm • Ceramics & Decor</Text>
            <Text style={styles.brandBoxDesc}>
              37 Nguyễn Duy, Phường Gia Định, TP. Hồ Chí Minh • Hotline: 0777709662
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  navBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  navTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: '#231B15',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  imageWrap: {
    width: SCREEN_WIDTH,
    height: 240,
    backgroundColor: '#F5F2EB',
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  contentBox: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  tagPill: {
    backgroundColor: '#EEF3EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E8DF',
  },
  tagText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '700',
    color: '#3B4D45',
    letterSpacing: 0.5,
  },
  dateText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#7A827E',
  },
  articleTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 22,
    fontWeight: '700',
    color: '#231B15',
    lineHeight: 30,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8E1D8',
    marginVertical: 14,
  },
  bodyText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    lineHeight: 25,
    color: '#231B15',
  },
  brandBox: {
    marginTop: 36,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E1D8',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  brandBoxTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14.5,
    fontWeight: '700',
    color: '#3B4D45',
  },
  brandBoxDesc: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
    color: '#7A827E',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F5',
  },
  loadingText: {
    fontFamily: 'ElleGaborStd',
    marginTop: 10,
    color: '#7A827E',
    fontSize: 13,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F5',
    padding: 20,
    gap: 14,
  },
  notFoundTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    color: '#231B15',
    fontWeight: '700',
  },
  backButton: {
    paddingHorizontal: 26,
    height: 52,
    backgroundColor: '#111111',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  backButtonText: {
    fontFamily: 'ElleGaborStd',
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
});
