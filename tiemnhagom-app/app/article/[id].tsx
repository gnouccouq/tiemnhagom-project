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
  Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getArticleById, NewsArticle } from '../../src/services/productService';
import { ScalePressable } from '../../src/components/ScalePressable';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B4D45" />
        <Text style={styles.loadingText}>Đang tải bài viết...</Text>
      </SafeAreaView>
    );
  }

  if (!article) {
    return (
      <SafeAreaView style={styles.notFoundContainer}>
        <Ionicons name="document-text-outline" size={54} color="#7A827E" />
        <Text style={styles.notFoundTitle}>Bài viết không tồn tại</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header bar */}
      <View style={styles.navBar}>
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
        contentContainerStyle={styles.scrollContent}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE4',
    backgroundColor: '#FFFFFF',
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFEAE2',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
    color: '#18181B',
    lineHeight: 30,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0ECE4',
    marginVertical: 14,
  },
  bodyText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    lineHeight: 25,
    color: '#2D3B34',
  },
  brandBox: {
    marginTop: 36,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#F8F6F0',
    borderWidth: 1,
    borderColor: '#EAE5DC',
    alignItems: 'center',
    gap: 6,
  },
  brandBoxTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 12,
  },
  notFoundTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    color: '#18181B',
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: '#3B4D45',
    borderRadius: 24,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
