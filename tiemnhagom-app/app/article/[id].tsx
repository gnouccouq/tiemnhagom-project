// app/article/[id].tsx
import React, { useEffect, useMemo, useState } from 'react';
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
  Modal,
  Linking,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc,
  onSnapshot,
  updateDoc,
  increment,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { getProducts } from '../../src/services/productService';
import { BlurButton } from '../../src/components/BlurButton';
import { Header } from '../../src/components/Header';
import { RichDescription } from '../../src/components/RichDescription';
import { ProductCard } from '../../src/components/ProductCard';
import { SymbolView } from 'expo-symbols';
import { useThemeColor, checkIsDark } from '../../src/constants/theme';
import { useSettings } from '../../src/context/SettingsContext';
import { useNotificationBadge } from '../../src/context/NotificationBadgeContext';
import { Product } from '../../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 40 - 12) / 2;
const PHONE = '0777709662';
const VIEW_TTL_MS = 30 * 60 * 1000;
const viewedThisSession = new Set<string>();

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = new Date(v).getTime();
  return isNaN(n) ? 0 : n;
};

const parseTags = (d: any): string[] => {
  const out: string[] = [];
  const add = (v: any) => {
    if (!v) return;
    const arr = Array.isArray(v) ? v : String(v).split(',');
    arr.forEach((s: any) => {
      const x = String(s || '').trim();
      if (x && !out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
    });
  };
  add(d?.seoFocusKeyword);
  add(d?.seoKeywords);
  return out.slice(0, 10);
};

const isProductVisible = (p: any) =>
  !p.isHidden && !p.hidden && !p.isOnlyEvent && p.status !== 'inactive' && p.isActive !== false;

interface NavArticle { id: string; title: string }

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = checkIsDark(Colors);
  const styles = useMemo(() => getStyles(Colors, isDark), [Colors, isDark]);
  const { t } = useSettings();
  const { markAsRead } = useNotificationBadge();

  const [article, setArticle] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [prevNext, setPrevNext] = useState<{ prev: NavArticle | null; next: NavArticle | null }>({ prev: null, next: null });
  const [products, setProducts] = useState<Product[]>([]);

  // Realtime article
  useEffect(() => {
    if (!id) return;
    markAsRead(id);
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'news', id),
      (snap) => {
        if (!snap.exists()) setArticle(null);
        else {
          const d: any = snap.data();
          setArticle(d.status && d.status !== 'published' ? null : { id: snap.id, ...d });
        }
        setLoading(false);
      },
      () => { setArticle(null); setLoading(false); }
    );
    return unsub;
  }, [id, markAsRead]);

  // Views +1 once per session per article
  useEffect(() => {
    if (!id || !article || viewedThisSession.has(id)) return;
    viewedThisSession.add(id);
    const key = `article_viewed_${id}`;
    AsyncStorage.getItem(key)
      .then(async (ts) => {
        if (ts && Date.now() - Number(ts) < VIEW_TTL_MS) return;
        await AsyncStorage.setItem(key, String(Date.now()));
        await updateDoc(doc(db, 'news', id), { views: increment(1) });
      })
      .catch(() => {});
  }, [id, article]);

  // Voted state
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`article_voted_${id}`)
      .then((v) => setVoted(v === 'yes' || v === 'no' ? v : null))
      .catch(() => {});
  }, [id]);

  // Prev/Next
  const createdMs = toMillis(article?.createdAt);
  useEffect(() => {
    if (!id || !article) return;
    getDocs(collection(db, 'news'))
      .then((snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((a) => !a.status || a.status === 'published')
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        const idx = list.findIndex((a) => a.id === id);
        if (idx < 0) return;
        const map = (a: any): NavArticle | null => (a ? { id: a.id, title: a.title || '' } : null);
        setPrevNext({ prev: map(list[idx + 1]), next: map(list[idx - 1]) });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!article, createdMs]);

  // Suggested products
  const relatedKey = JSON.stringify(article?.relatedProductIds || []);
  useEffect(() => {
    if (!article) return;
    const relatedIds: string[] = Array.isArray(article.relatedProductIds) ? article.relatedProductIds : [];
    getProducts({ sortBy: 'popular', maxItems: 60, expandVariants: false })
      .then((all) => {
        const visible = all.filter(isProductVisible);
        const picked: Product[] = [];
        relatedIds.forEach((rid) => {
          const p = visible.find((x) => x.id === rid);
          if (p && picked.length < 4) picked.push(p);
        });
        for (const p of visible) {
          if (picked.length >= 4) break;
          if (!picked.some((x) => x.id === p.id)) picked.push(p);
        }
        setProducts(picked);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!article, relatedKey]);

  const shareUrl = `https://tiemnhagom.vn/blog/${article?.slug || id}`;
  const handleShare = async () => {
    if (!article) return;
    try {
      await Share.share({ title: article.title, message: `${article.title}\n\n${shareUrl}`, url: shareUrl });
    } catch {}
  };

  const handleVote = async (type: 'yes' | 'no') => {
    if (!id || voted) return;
    setVoted(type);
    try {
      await AsyncStorage.setItem(`article_voted_${id}`, type);
      await updateDoc(doc(db, 'news', id), {
        [type === 'yes' ? 'helpfulYes' : 'helpfulNo']: increment(1),
      });
    } catch {}
  };

  const headerRight = (
    <BlurButton onPress={handleShare} accessibilityLabel={t('share')}>
      <SymbolView
        name="square.and.arrow.up"
        size={19}
        tintColor={Colors.textPrimary}
        fallback={<Ionicons name="share-outline" size={20} color={Colors.textPrimary} />}
      />
    </BlurButton>
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.brandTerracotta} />
        <Text style={styles.mutedText}>{t('loadingArticle')}</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="document-text-outline" size={54} color={Colors.textMuted} />
        <Text style={styles.notFoundTitle}>{t('articleNotFound')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const content: string = article.content || '';
  const plain = content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  const words = plain.split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(words / 200));
  const author = article.author || article.authorName || article.createdByName || 'Tiệm Nhà Gốm';
  const dateStr = createdMs ? new Date(createdMs).toLocaleDateString('vi-VN') : '';
  const views = Number(article.views || 0);
  const yes = Number(article.helpfulYes || 0);
  const no = Number(article.helpfulNo || 0);
  const tags = parseTags(article);

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <Header title={t('newsAndArticles')} showBack showCart={false} showSearch={false} rightComponent={headerRight} />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const max = contentSize.height - layoutMeasurement.height;
          setProgress(max > 0 ? Math.min(1, Math.max(0, contentOffset.y / max)) : 0);
        }}
      >
        {article.imageUrl ? (
          <Pressable onPress={() => setLightbox(true)} style={styles.imageWrap} accessibilityRole="imagebutton">
            <Image source={{ uri: article.imageUrl }} style={styles.fill} contentFit="cover" transition={200} />
          </Pressable>
        ) : null}

        <View style={styles.contentBox}>
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{t('articleTag')}</Text>
          </View>
          <Text style={styles.title}>{article.title}</Text>

          <View style={styles.metaRow}>
            {dateStr ? <Text style={styles.metaText}>{dateStr}  |  </Text> : null}
            <Text style={styles.metaText}>{author}</Text>
            <Text style={styles.metaText}>  ·  {t('articleReadMinutes', { n: readMin })}</Text>
            <View style={styles.viewsWrap}>
              <Ionicons name="eye-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.metaText}> {t('articleViews', { n: views.toLocaleString('vi-VN') })}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {content ? (
            <RichDescription
              htmlContent={content}
              isDark={isDark}
              textColor={Colors.textPrimary}
              cardBackground={Colors.background}
              maxCollapsedHeight={1000000}
            />
          ) : (
            <Text style={styles.bodyText}>{t('updatingArticleContent')}</Text>
          )}

          {tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('articleTags')}</Text>
              <View style={styles.chipRow}>
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.chip}
                    onPress={() => router.push({ pathname: '/search', params: { q: tag } } as any)}
                  >
                    <Text style={styles.chipText}>#{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Helpful voting */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{voted ? t('articleThanksVote') : t('articleHelpfulQuestion')}</Text>
            <View style={styles.voteRow}>
              {(['yes', 'no'] as const).map((type) => {
                const active = voted === type;
                return (
                  <TouchableOpacity
                    key={type}
                    disabled={!!voted}
                    onPress={() => handleVote(type)}
                    style={[styles.voteBtn, active && styles.voteBtnActive, !!voted && !active && { opacity: 0.5 }]}
                  >
                    <Ionicons
                      name={type === 'yes' ? 'thumbs-up-outline' : 'thumbs-down-outline'}
                      size={16}
                      color={active ? '#FFFFFF' : Colors.brandTerracotta}
                    />
                    <Text style={[styles.voteText, active && { color: '#FFFFFF' }]}>
                      {type === 'yes' ? t('articleVoteYes') : t('articleVoteNo')} ({type === 'yes' ? yes : no})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Contact CTA */}
          <View style={styles.card}>
            <Ionicons name="storefront-outline" size={20} color={Colors.brandTerracotta} />
            <Text style={styles.cardTitle}>{t('articleContactTitle')}</Text>
            <Text style={styles.mutedCenter}>{t('articleContactDesc')}</Text>
            <View style={styles.voteRow}>
              <TouchableOpacity style={styles.ctaPrimary} onPress={() => Linking.openURL(`https://zalo.me/${PHONE}`)}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#FFFFFF" />
                <Text style={styles.ctaPrimaryText}>{t('articleZalo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.voteBtn} onPress={() => Linking.openURL(`tel:${PHONE}`)}>
                <Ionicons name="call-outline" size={16} color={Colors.brandTerracotta} />
                <Text style={styles.voteText}>{t('articleHotline')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Prev / Next */}
          {(prevNext.prev || prevNext.next) && (
            <View style={styles.navRow}>
              {[prevNext.prev, prevNext.next].map((a, i) => (
                <TouchableOpacity
                  key={i}
                  disabled={!a}
                  style={[styles.navCard, !a && { opacity: 0 }, i === 1 && { alignItems: 'flex-end' }]}
                  onPress={() => a && router.replace(`/article/${a.id}` as any)}
                >
                  <Text style={styles.navLabel}>{i === 0 ? `‹ ${t('articlePrev')}` : `${t('articleNext')} ›`}</Text>
                  <Text style={[styles.navTitle, i === 1 && { textAlign: 'right' }]} numberOfLines={2}>
                    {a?.title || ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Suggested products */}
          {products.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('articleSuggestedProducts')}</Text>
              <View style={styles.grid}>
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} cardWidth={CARD_WIDTH} />
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(false)}>
        <Pressable style={styles.lightbox} onPress={() => setLightbox(false)}>
          <Image source={{ uri: article.imageUrl }} style={styles.lightboxImg} contentFit="contain" />
          <TouchableOpacity
            style={[styles.lightboxClose, { top: insets.top + 12 }]}
            onPress={() => setLightbox(false)}
            accessibilityLabel={t('close')}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background, padding: 20, gap: 14 },
    mutedText: { color: C.textMuted, fontSize: 13 },
    notFoundTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
    primaryBtn: { paddingHorizontal: 26, height: 52, borderRadius: 26, backgroundColor: C.brandTerracotta, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
    progressTrack: { height: 3, backgroundColor: 'transparent', width: '100%' },
    progressFill: { height: 3, backgroundColor: C.brandTerracotta, borderRadius: 2 },
    imageWrap: { width: SCREEN_WIDTH, height: 240, backgroundColor: C.surface },
    fill: { width: '100%', height: '100%' },
    contentBox: { paddingHorizontal: 20, paddingTop: 20 },
    tagPill: {
      alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, borderWidth: 1,
      backgroundColor: isDark ? 'rgba(156,113,86,0.18)' : C.brandCream, borderColor: isDark ? 'rgba(232,204,178,0.25)' : C.brandSand,
      marginBottom: 12,
    },
    tagText: { fontSize: 11, fontWeight: '700', color: isDark ? C.brandSand : C.brandTerracotta, letterSpacing: 0.5 },
    title: { fontSize: 22, fontWeight: '700', color: C.textPrimary, lineHeight: 30, marginBottom: 10 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    metaText: { fontSize: 12, color: C.textMuted },
    viewsWrap: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 16 },
    bodyText: { fontSize: 15, lineHeight: 25, color: C.textPrimary },
    section: { marginTop: 28 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.cardBackground, borderWidth: 1, borderColor: C.border },
    chipText: { fontSize: 12.5, color: isDark ? C.brandSand : C.brandTerracotta, fontWeight: '600' },
    card: {
      marginTop: 24, padding: 18, borderRadius: 20, backgroundColor: C.cardBackground, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', gap: 8,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, textAlign: 'center' },
    mutedCenter: { fontSize: 12.5, color: C.textSecondary, textAlign: 'center', lineHeight: 18 },
    voteRow: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' },
    voteBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: 21,
      borderWidth: 1, borderColor: C.brandTerracotta, backgroundColor: 'transparent',
    },
    voteBtnActive: { backgroundColor: C.brandTerracotta },
    voteText: { fontSize: 13.5, fontWeight: '600', color: isDark ? C.brandSand : C.brandTerracotta },
    ctaPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 42, borderRadius: 21, backgroundColor: C.brandTerracotta },
    ctaPrimaryText: { fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
    navRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    navCard: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: C.cardBackground, borderWidth: 1, borderColor: C.border, gap: 4 },
    navLabel: { fontSize: 11.5, color: C.textMuted, fontWeight: '600' },
    navTitle: { fontSize: 13.5, color: C.textPrimary, fontWeight: '600', lineHeight: 19 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
    lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
    lightboxImg: { width: '100%', height: '80%' },
    lightboxClose: {
      position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    },
  });
