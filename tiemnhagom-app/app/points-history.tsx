import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useSettings } from '../src/context/SettingsContext';
import { useThemeColor } from '../src/constants/theme';
import { getUserOrders } from '../src/services/orderService';
import { BlurButton } from '../src/components/BlurButton';
import { Order } from '../src/types';

interface PointTransaction {
  id: string;
  type: 'earn' | 'redeem'; // 'earn' = Tích, 'redeem' = Đổi
  points: number;
  date: string;
  dateTimestamp: number;
  orderCode: string;
  store: string;
  orderValue: string;
}

type FilterType = 'all' | 'earn' | 'redeem';
type DatePreset = 'last30Days' | 'thisMonth' | 'last3Months' | 'all';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper định dạng ngày ngắn DD/MM/YYYY
const formatDisplayDate = (d: Date): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Helper định dạng ngày trên nút bộ lọc DD/MM/YY
const formatFilterPillDate = (d: Date): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const yearShort = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${yearShort}`;
};

const formatVND = (num: number) => {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(num))}đ`;
};

export default function PointsHistoryScreen() {
  const router = useRouter();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const { user, userProfile } = useAuth();
  const { t } = useSettings();

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('last30Days');
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [rulesModalVisible, setRulesModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);

  // Tính số điểm hiện tại của người dùng (10.000đ = 1 điểm, trừ điểm đã đổi, bỏ thưởng 50 điểm chào mừng cũ)
  const totalSpent = Number(userProfile?.totalSpent || userProfile?.spentTotal || 0);
  const earnedPoints = Math.floor(totalSpent / 10000);
  const rawProfilePoints = userProfile?.points !== undefined && userProfile?.points !== null ? Number(userProfile.points) : 0;
  const cleanProfilePoints = (rawProfilePoints === 50 && totalSpent < 500000) ? 0 : rawProfilePoints;

  // Tải danh sách đơn hàng thực tế của người dùng để sinh lịch sử điểm
  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) {
        // Dữ liệu mẫu chuẩn bố cục Tiệm Nhà Gốm giống ảnh Highlands
        setTransactions(getDefaultDemoTransactions());
        return;
      }

      setLoading(true);
      try {
        const orders = await getUserOrders(user.uid);
        const list: PointTransaction[] = [];

        orders.forEach((o: Order, idx: number) => {
          const status = (o.status || '').toLowerCase();
          const isDone =
            status.includes('hoàn thành') ||
            status.includes('thành công') ||
            status.includes('completed');

          let dateObj = new Date();
          if (o.orderDate) {
            if (typeof (o.orderDate as any).toDate === 'function') {
              dateObj = (o.orderDate as any).toDate();
            } else if (o.orderDate instanceof Date) {
              dateObj = o.orderDate;
            } else {
              dateObj = new Date(o.orderDate);
            }
          }

          const orderAmount = Number(o.totalAmount || 0);
          const pointsEarned = Math.floor(orderAmount / 10000);
          const orderCodeStr = o.orderCode || o.id || `2107012647664951${idx}`;
          const storeName = 'Tiệm Nhà Gốm - 37 Nguyễn Duy, Bình Thạnh';

          // Giao dịch tích điểm (cứ 10.000đ = 1 điểm, chỉ tích khi đơn >= 10.000đ)
          if ((isDone || orderAmount >= 10000) && pointsEarned > 0) {
            list.push({
              id: `earn_${o.id || idx}`,
              type: 'earn',
              points: pointsEarned,
              date: formatDisplayDate(dateObj),
              dateTimestamp: dateObj.getTime(),
              orderCode: orderCodeStr,
              store: storeName,
              orderValue: formatVND(orderAmount),
            });
          }

          // Giao dịch đổi điểm (nếu đơn có dùng điểm / mã giảm)
          let pointsRedeemed = 0;
          if ((o as any).pointsUsed && Number((o as any).pointsUsed) > 0) {
            pointsRedeemed = Number((o as any).pointsUsed);
          } else if (Number(o.discountAmount || 0) >= 10000 && !o.couponCode) {
            // Đổi điểm giảm giá: 1 điểm = 1.000đ
            pointsRedeemed = Math.floor(Number(o.discountAmount) / 1000);
          }
          if (pointsRedeemed > 0) {
            list.push({
              id: `redeem_${o.id || idx}`,
              type: 'redeem',
              points: pointsRedeemed,
              date: formatDisplayDate(dateObj),
              dateTimestamp: dateObj.getTime(),
              orderCode: orderCodeStr,
              store: storeName,
              orderValue: formatVND(Number(o.discountAmount || pointsRedeemed * 1000)),
            });
          }
        });

        if (list.length > 0) {
          // Sắp xếp giảm dần theo thời gian
          list.sort((a, b) => b.dateTimestamp - a.dateTimestamp);
          setTransactions(list);
        } else {
          // Chưa có đơn hàng -> hiển thị mẫu trực quan chuẩn bố cục
          setTransactions(getDefaultDemoTransactions());
        }
      } catch (err) {
        setTransactions(getDefaultDemoTransactions());
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user]);

  // Tính tổng điểm tích & điểm đã đổi từ danh sách giao dịch
  const totalEarnedInHistory = useMemo(() => {
    return transactions.filter((t) => t.type === 'earn').reduce((sum, t) => sum + t.points, 0);
  }, [transactions]);

  const totalRedeemedInHistory = useMemo(() => {
    return transactions.filter((t) => t.type === 'redeem').reduce((sum, t) => sum + t.points, 0);
  }, [transactions]);

  const availablePoints = useMemo(() => {
    if (!user) {
      // Chế độ demo: điểm hiện có cân đối chính xác (+7 +7 -14 = 0 điểm)
      return Math.max(0, totalEarnedInHistory - totalRedeemedInHistory);
    }
    const base = Math.max(earnedPoints, cleanProfilePoints, totalEarnedInHistory);
    return Math.max(0, base - totalRedeemedInHistory);
  }, [user, earnedPoints, cleanProfilePoints, totalEarnedInHistory, totalRedeemedInHistory]);

  // Bộ dữ liệu mẫu chuẩn theo bố cục ảnh Highlands mẫu
  function getDefaultDemoTransactions(): PointTransaction[] {
    const now = new Date();
    const d1 = new Date(now);
    d1.setDate(now.getDate()); // Hôm nay

    const d2 = new Date(now);
    d2.setDate(now.getDate() - 3); // 3 ngày trước

    const d3 = new Date(now);
    d3.setDate(now.getDate() - 8); // 8 ngày trước

    return [
      {
        id: 'demo_1',
        type: 'earn',
        points: 7,
        date: formatDisplayDate(d1),
        dateTimestamp: d1.getTime(),
        orderCode: '2107012647664951296',
        store: 'Tiệm Nhà Gốm - 37 Nguyễn Duy, Bình Thạnh',
        orderValue: '70.000đ',
      },
      {
        id: 'demo_2',
        type: 'earn',
        points: 7,
        date: formatDisplayDate(d2),
        dateTimestamp: d2.getTime(),
        orderCode: '2105897459670786048',
        store: 'Tiệm Nhà Gốm - Chi nhánh Thủ Đức',
        orderValue: '79.000đ',
      },
      {
        id: 'demo_3',
        type: 'redeem',
        points: 14,
        date: formatDisplayDate(d3),
        dateTimestamp: d3.getTime(),
        orderCode: '2104598123490123512',
        store: 'Tiệm Nhà Gốm - Online Store',
        orderValue: '14.000đ',
      },
    ];
  }

  // Tính toán khoảng ngày hiển thị trên nút Pill theo DatePreset
  const dateRangeDisplay = useMemo(() => {
    const now = new Date();
    const endDateStr = formatFilterPillDate(now);

    let startDate = new Date(now);
    if (datePreset === 'last30Days') {
      startDate.setDate(now.getDate() - 30);
    } else if (datePreset === 'thisMonth') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (datePreset === 'last3Months') {
      startDate.setMonth(now.getMonth() - 3);
    } else {
      // all
      return t('dateRangePresetAll') || 'Tất cả';
    }

    const startDateStr = formatFilterPillDate(startDate);
    return `${startDateStr} - ${endDateStr}`;
  }, [datePreset, t]);

  // Lọc danh sách giao dịch theo loại (Tích/Đổi) và theo thời gian
  const filteredList = useMemo(() => {
    const now = new Date();
    let minTimestamp = 0;

    if (datePreset === 'last30Days') {
      const d = new Date(now);
      d.setDate(now.getDate() - 30);
      minTimestamp = d.getTime();
    } else if (datePreset === 'thisMonth') {
      minTimestamp = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (datePreset === 'last3Months') {
      const d = new Date(now);
      d.setMonth(now.getMonth() - 3);
      minTimestamp = d.getTime();
    }

    return transactions.filter((item) => {
      // Lọc theo loại
      if (filterType !== 'all' && item.type !== filterType) {
        return false;
      }
      // Lọc theo ngày
      if (minTimestamp > 0 && item.dateTimestamp < minTimestamp) {
        return false;
      }
      return true;
    });
  }, [transactions, filterType, datePreset]);

  const toggleFilter = (type: 'earn' | 'redeem') => {
    if (filterType === type) {
      setFilterType('all'); // Bỏ chọn để xem tất cả
    } else {
      setFilterType(type);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* TOP HEADER: NÚT BACK BO TRÒN VÀ TIÊU ĐỀ LỊCH SỬ ĐIỂM */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.headerRow}>
          <BlurButton
            style={styles.roundBackBtn}
            onPress={() => router.back()}
            accessibilityLabel={t('back') || 'Quay lại'}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827')}
            />
          </BlurButton>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('pointsHistoryTitle') || 'Lịch sử Điểm'}
          </Text>

          <BlurButton
            style={styles.roundHeaderBtn}
            onPress={() => setRulesModalVisible(true)}
            accessibilityLabel={t('pointsRulesInfo') || 'Quy tắc tích điểm'}
          >
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B'}
            />
          </BlurButton>
        </View>

        {/* BỘ LỌC PILLS (TÍCH / ĐỔI / KHOẢNG NGÀY) */}
        <View style={styles.filtersBar}>
          {/* NÚT LỌC "TÍCH" */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              filterType === 'earn' && styles.filterPillActive,
            ]}
            activeOpacity={0.75}
            onPress={() => toggleFilter('earn')}
          >
            <Text
              style={[
                styles.filterPillText,
                filterType === 'earn' && styles.filterPillTextActive,
              ]}
            >
              {t('filterEarn') || 'Tích'}
            </Text>
          </TouchableOpacity>

          {/* NÚT LỌC "ĐỔI" */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              filterType === 'redeem' && styles.filterPillActive,
            ]}
            activeOpacity={0.75}
            onPress={() => toggleFilter('redeem')}
          >
            <Text
              style={[
                styles.filterPillText,
                filterType === 'redeem' && styles.filterPillTextActive,
              ]}
            >
              {t('filterRedeem') || 'Đổi'}
            </Text>
          </TouchableOpacity>

          {/* NÚT LỌC KHOẢNG NGÀY + ICON LỊCH */}
          <TouchableOpacity
            style={styles.datePill}
            activeOpacity={0.75}
            onPress={() => setDateModalVisible(true)}
          >
            <Text style={styles.datePillText}>{dateRangeDisplay}</Text>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={isDark ? '#9CA3AF' : '#6B7280'}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* DANH SÁCH CÁC THẺ GIAO DỊCH ĐIỂM (CARD LAYOUT CHUẨN XÁC THEO ẢNH) */}
      <ScrollView
        style={styles.contentScrollView}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator
              size="small"
              color={isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B'}
            />
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="receipt-outline"
              size={56}
              color={isDark ? '#4B5563' : '#D1D5DB'}
              style={{ marginBottom: 14 }}
            />
            <Text style={styles.emptyTitle}>
              {t('emptyPointsHistory') || 'Chưa có lịch sử giao dịch điểm'}
            </Text>
            <Text style={styles.emptyDesc}>
              {t('emptyPointsHistoryDesc') ||
                'Mỗi đơn hàng thanh toán thành công từ 10.000đ sẽ tích ngay 1 Điểm Gốm.'}
            </Text>
          </View>
        ) : (
          filteredList.map((item) => {
            const isEarn = item.type === 'earn';

            return (
              <View key={item.id} style={styles.transactionCard}>
                {/* DÒNG TIÊU ĐỀ: LOẠI (TÍCH / ĐỔI) & SỐ ĐIỂM (+/- X ĐIỂM) */}
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTypeTitle}>
                    {isEarn ? (t('filterEarn') || 'Tích') : (t('filterRedeem') || 'Đổi')}
                  </Text>
                  <Text
                    style={[
                      styles.cardPointsValue,
                      isEarn ? styles.pointsEarnText : styles.pointsRedeemText,
                    ]}
                  >
                    {isEarn ? `+${item.points} Điểm` : `-${item.points} Điểm`}
                  </Text>
                </View>

                {/* DÒNG 1: NGÀY GIAO DỊCH */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('transactionDate') || 'Ngày giao dịch'}
                  </Text>
                  <Text style={styles.cardInfoValue}>{item.date}</Text>
                </View>

                {/* DÒNG 2: MÃ ĐƠN HÀNG */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('orderCode') || 'Mã đơn hàng'}
                  </Text>
                  <Text style={styles.cardInfoValue} numberOfLines={1}>
                    {item.orderCode}
                  </Text>
                </View>

                {/* DÒNG 3: CỬA HÀNG */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('storeLabel') || 'Cửa hàng'}
                  </Text>
                  <Text style={styles.cardInfoValue} numberOfLines={1}>
                    {item.store}
                  </Text>
                </View>

                {/* DÒNG 4: GIÁ TRỊ ĐƠN HÀNG (MÀU ĐỎ/NÂU NỔI BẬT GIỐNG ẢNH MẪU) */}
                <View style={styles.cardInfoRow}>
                  <Text style={styles.cardInfoLabel}>
                    {t('orderValue') || 'Giá trị đơn hàng'}
                  </Text>
                  <Text style={styles.cardOrderValueHighlight}>
                    {item.orderValue}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: CHỌN KHOẢNG THỜI GIAN LỌC (DATE RANGE PICKER PRESETS)             */}
      {/* ========================================================================= */}
      <Modal
        visible={dateModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setDateModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDateModalVisible(false)}
        >
          <View style={styles.dateModalCard}>
            <View style={styles.modalTopHeader}>
              <Text style={styles.modalTitleText}>
                {t('selectDateRange') || 'Chọn khoảng thời gian'}
              </Text>
              <TouchableOpacity
                onPress={() => setDateModalVisible(false)}
                style={styles.modalCloseIconBtn}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={isDark ? '#9CA3AF' : '#6B7280'}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.presetOptionsList}>
              {[
                {
                  id: 'last30Days',
                  label: t('dateRangePresetLast30Days') || '30 ngày qua',
                },
                {
                  id: 'thisMonth',
                  label: t('dateRangePresetThisMonth') || 'Tháng này',
                },
                {
                  id: 'last3Months',
                  label: t('dateRangePresetLast3Months') || '3 tháng qua',
                },
                {
                  id: 'all',
                  label: t('dateRangePresetAll') || 'Tất cả thời gian',
                },
              ].map((opt) => {
                const isSelected = datePreset === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.presetItem,
                      isSelected && styles.presetItemActive,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setDatePreset(opt.id as DatePreset);
                      setDateModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.presetItemLabel,
                        isSelected && styles.presetItemLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B'}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: QUY TẮC TÍCH VÀ ĐỔI ĐIỂM (INFO RULES MODAL)                       */}
      {/* ========================================================================= */}
      <Modal
        visible={rulesModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRulesModalVisible(false)}
      >
        <View style={styles.modalOverlayBottom}>
          <View style={styles.rulesSheetModal}>
            <View style={styles.modalTopHeader}>
              <View style={styles.rulesTitleRow}>
                <Ionicons name="flame" size={20} color="#E5B869" />
                <Text style={styles.modalTitleText}>
                  {t('potteryPointsModalTitle') || 'Điểm Thưởng Gốm'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setRulesModalVisible(false)}
                style={styles.modalCloseIconBtn}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={isDark ? '#9CA3AF' : '#6B7280'}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.rulesSheetBody}>
              <View style={styles.pointsHighlightBox}>
                <Text style={styles.pointsBigNumber}>{availablePoints}</Text>
                <Text style={styles.pointsUnitLabel}>
                  {t('availablePointsLabel') || 'Điểm hiện có'}
                </Text>
                <Text style={styles.pointsEquivText}>
                  {t('pointsDiscountEquivText') || 'Tương đương'}{' '}
                  {formatVND(availablePoints * 1000)}{' '}
                  {t('pointsDiscountEquivSuffix') || 'giảm giá khi mua hàng'}
                </Text>
              </View>

              <View style={styles.pointsRulesList}>
                <View style={styles.ruleItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.ruleText}>
                    {t('pointRuleText1') ||
                      'Mỗi 10.000đ thanh toán hoàn tất tích ngay 1 Điểm Gốm.'}
                  </Text>
                </View>
                <View style={styles.ruleItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.ruleText}>
                    {t('pointRuleText2') ||
                      'Điểm có thể dùng để khấu trừ trực tiếp khi thanh toán đơn hàng tiếp theo.'}
                  </Text>
                </View>
                <View style={styles.ruleItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.ruleText}>
                    {t('pointRuleText3') ||
                      'Điểm không hết hạn theo năm và được bảo lưu trọn đời tài khoản.'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (Colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? (Colors.background || '#121212') : '#F8F7F4',
    },
    headerSafeArea: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#2A2A2A' : '#E5E7EB',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.03,
      shadowRadius: 3,
      elevation: 2,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'android' ? 14 : 10,
      paddingBottom: 12,
      gap: 12,
    },
    roundBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 20,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827'),
      letterSpacing: 0.2,
      flex: 1,
    },
    roundHeaderBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Filters Bar
    filtersBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 10,
    },
    filterPill: {
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#D1D5DB',
      backgroundColor: isDark ? '#232326' : '#FFFFFF',
    },
    filterPillActive: {
      borderColor: isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B',
      backgroundColor: isDark ? 'rgba(239, 192, 80, 0.12)' : 'rgba(138, 90, 43, 0.08)',
    },
    filterPillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#9CA3AF' : '#4B5563',
    },
    filterPillTextActive: {
      fontWeight: '700',
      color: isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B',
    },
    datePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#D1D5DB',
      backgroundColor: isDark ? '#232326' : '#FFFFFF',
      marginLeft: 'auto',
    },
    datePillText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '500',
      color: isDark ? '#D1D5DB' : '#374151',
    },

    // Content ScrollView
    contentScrollView: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    },

    // Transaction Card
    transactionCard: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 16,
      marginBottom: 14,
      borderWidth: 1.2,
      borderColor: isDark ? (Colors.borderLight || '#2A2A2A') : '#F0ECE6',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.035,
      shadowRadius: 6,
      elevation: isDark ? 2 : 1,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    cardTypeTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '800',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827'),
    },
    cardPointsValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    pointsEarnText: {
      color: isDark ? (Colors.accentGold || '#EFC050') : '#78350F',
    },
    pointsRedeemText: {
      color: '#DC2626',
    },
    cardInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 4,
    },
    cardInfoLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: isDark ? '#9CA3AF' : '#6B7280',
      width: 124,
      lineHeight: 20,
    },
    cardInfoValue: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      color: Colors.textPrimary || (isDark ? '#E5E7EB' : '#1F2937'),
      flex: 1,
      lineHeight: 20,
      fontWeight: '500',
    },
    cardOrderValueHighlight: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      fontWeight: '700',
      color: isDark ? '#EF4444' : '#7A1A1A',
      flex: 1,
      lineHeight: 20,
    },

    // Empty state & loading
    loadingBox: {
      paddingVertical: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 30,
    },
    emptyTitle: {
      fontFamily: 'ElleGaborStd',
      fontSize: 16,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#1F2937'),
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDesc: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#9CA3AF' : '#6B7280',
      textAlign: 'center',
      lineHeight: 20,
    },

    // Modal 1: Date Range Picker
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.48)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    dateModalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderRadius: 22,
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderWidth: 1,
      borderColor: isDark ? '#333333' : '#E5E7EB',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 6,
    },
    modalTopHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#2F2F33' : '#E5E7EB',
    },
    modalTitleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#111827'),
    },
    modalCloseIconBtn: {
      padding: 4,
    },
    presetOptionsList: {
      marginTop: 10,
      gap: 6,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    presetItemActive: {
      backgroundColor: isDark ? 'rgba(239, 192, 80, 0.12)' : 'rgba(138, 90, 43, 0.08)',
    },
    presetItemLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      color: Colors.textPrimary || (isDark ? '#E5E7EB' : '#1F2937'),
      fontWeight: '500',
    },
    presetItemLabelActive: {
      fontWeight: '700',
      color: isDark ? (Colors.accentGold || '#EFC050') : '#8A5A2B',
    },

    // Modal 2: Rules Sheet
    modalOverlayBottom: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.48)',
      justifyContent: 'flex-end',
    },
    rulesSheetModal: {
      backgroundColor: isDark ? (Colors.cardBackground || '#1E1E1E') : '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: Platform.OS === 'ios' ? 44 : 28,
      borderTopWidth: 1,
      borderColor: isDark ? '#333333' : '#F0ECE6',
    },
    rulesTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rulesSheetBody: {
      paddingTop: 16,
    },
    pointsHighlightBox: {
      alignItems: 'center',
      paddingVertical: 18,
      borderRadius: 18,
      backgroundColor: isDark ? '#27272A' : '#FAF8F5',
      borderWidth: 1,
      borderColor: isDark ? '#333338' : '#F0ECE6',
      marginBottom: 16,
    },
    pointsBigNumber: {
      fontFamily: 'ElleGaborStd',
      fontSize: 42,
      fontWeight: '800',
      color: isDark ? (Colors.accentGold || '#EFC050') : '#78350F',
      lineHeight: 48,
    },
    pointsUnitLabel: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#A1A1AA' : '#6B7280',
      marginTop: 2,
    },
    pointsEquivText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 12.5,
      color: isDark ? '#D4D4D8' : '#4B5563',
      marginTop: 8,
      fontWeight: '500',
    },
    pointsRulesList: {
      gap: 10,
    },
    ruleItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    ruleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13,
      color: isDark ? '#D1D5DB' : '#4B5563',
      lineHeight: 19,
      flex: 1,
    },
  });
