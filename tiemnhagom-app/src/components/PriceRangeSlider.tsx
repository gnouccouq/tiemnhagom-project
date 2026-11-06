// src/components/PriceRangeSlider.tsx
import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatCurrency } from '../utils/format';
import { useSettings } from '../context/SettingsContext';

export const SLIDER_MAX_LIMIT = 1500000;
export const SLIDER_STEP = 25000;

interface PriceRangeSliderProps {
  minPrice: number;
  maxPrice: number;
  maxLimit?: number;
  step?: number;
  onChange: (min: number, max: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  isDark: boolean;
}

export const PriceRangeSlider: React.FC<PriceRangeSliderProps> = ({
  minPrice,
  maxPrice,
  maxLimit = SLIDER_MAX_LIMIT,
  step = SLIDER_STEP,
  onChange,
  onDragStateChange,
  isDark,
}) => {
  const { t } = useSettings();
  const [localMin, setLocalMin] = useState<number>(minPrice);
  const [localMax, setLocalMax] = useState<number>(maxPrice);
  const [trackWidth, setTrackWidth] = useState<number>(0);

  const localMinRef = useRef<number>(minPrice);
  const localMaxRef = useRef<number>(maxPrice);
  const trackWidthRef = useRef<number>(0);
  const startThumbPosRef = useRef<number>(0);
  const activeThumbRef = useRef<'min' | 'max' | null>(null);
  const onChangeRef = useRef(onChange);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const maxLimitRef = useRef(maxLimit);
  const stepRef = useRef(step);
  const lastHapticTimeRef = useRef<number>(0);

  const THUMB_SIZE = 26;

  // Đồng bộ giá trị từ ngoài truyền vào khi người dùng không đang chủ động vuốt
  useEffect(() => {
    if (!activeThumbRef.current) {
      setLocalMin(minPrice);
      localMinRef.current = minPrice;
    }
  }, [minPrice]);

  useEffect(() => {
    if (!activeThumbRef.current) {
      setLocalMax(maxPrice);
      localMaxRef.current = maxPrice;
    }
  }, [maxPrice]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onDragStateChangeRef.current = onDragStateChange;
  }, [onDragStateChange]);

  useEffect(() => {
    maxLimitRef.current = maxLimit;
    stepRef.current = step;
  }, [maxLimit, step]);

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && width !== trackWidth) {
      setTrackWidth(width);
      trackWidthRef.current = width;
    }
  };

  const triggerHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastHapticTimeRef.current > 70) {
      lastHapticTimeRef.current = now;
      Haptics.selectionAsync().catch(() => {});
    }
  }, []);

  // Tạo duy nhất 1 lần để không bị hủy / reset cử chỉ vuốt giữa chừng khi re-render
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (evt) => {
          const width = trackWidthRef.current;
          if (width <= 0) return;

          onDragStateChangeRef.current?.(true);

          const touchX = evt.nativeEvent.locationX;
          const curMinRatio = Math.max(0, Math.min(1, localMinRef.current / maxLimitRef.current));
          const curMaxRatio = Math.max(0, Math.min(1, localMaxRef.current / maxLimitRef.current));
          const curMinPos = curMinRatio * width;
          const curMaxPos = curMaxRatio * width;

          const distToMin = Math.abs(touchX - curMinPos);
          const distToMax = Math.abs(touchX - curMaxPos);
          const chosen = distToMin <= distToMax ? 'min' : 'max';
          activeThumbRef.current = chosen;

          // Nếu chạm gần thumb (<= 30px), bắt đầu kéo mượt theo delta từ vị trí hiện tại
          if (Math.min(distToMin, distToMax) <= 30) {
            startThumbPosRef.current = chosen === 'min' ? curMinPos : curMaxPos;
          } else {
            // Nếu chạm trên thanh track để jump, snap ngay thumb đến vị trí chạm
            const ratio = Math.max(0, Math.min(1, touchX / width));
            const raw = Math.round((ratio * maxLimitRef.current) / stepRef.current) * stepRef.current;

            if (chosen === 'min') {
              const nextMin = Math.max(0, Math.min(raw, localMaxRef.current - stepRef.current));
              localMinRef.current = nextMin;
              setLocalMin(nextMin);
              startThumbPosRef.current = (nextMin / maxLimitRef.current) * width;
              onChangeRef.current(nextMin, localMaxRef.current);
            } else {
              const nextMax = Math.min(maxLimitRef.current, Math.max(raw, localMinRef.current + stepRef.current));
              localMaxRef.current = nextMax;
              setLocalMax(nextMax);
              startThumbPosRef.current = (nextMax / maxLimitRef.current) * width;
              onChangeRef.current(localMinRef.current, nextMax);
            }
            triggerHaptic();
          }
        },

        onPanResponderMove: (_evt, gestureState) => {
          const thumb = activeThumbRef.current;
          const width = trackWidthRef.current;
          if (!thumb || width <= 0) return;

          const nextPos = startThumbPosRef.current + gestureState.dx;
          const clampedPos = Math.max(0, Math.min(width, nextPos));
          const ratio = clampedPos / width;
          const raw = Math.round((ratio * maxLimitRef.current) / stepRef.current) * stepRef.current;

          if (thumb === 'min') {
            const nextMin = Math.max(0, Math.min(raw, localMaxRef.current - stepRef.current));
            if (nextMin !== localMinRef.current) {
              localMinRef.current = nextMin;
              setLocalMin(nextMin);
              triggerHaptic();
              onChangeRef.current(nextMin, localMaxRef.current);
            }
          } else {
            const nextMax = Math.min(maxLimitRef.current, Math.max(raw, localMinRef.current + stepRef.current));
            if (nextMax !== localMaxRef.current) {
              localMaxRef.current = nextMax;
              setLocalMax(nextMax);
              triggerHaptic();
              onChangeRef.current(localMinRef.current, nextMax);
            }
          }
        },

        onPanResponderRelease: () => {
          activeThumbRef.current = null;
          onDragStateChangeRef.current?.(false);
          onChangeRef.current(localMinRef.current, localMaxRef.current);
        },

        onPanResponderTerminate: () => {
          activeThumbRef.current = null;
          onDragStateChangeRef.current?.(false);
          onChangeRef.current(localMinRef.current, localMaxRef.current);
        },
      }),
    [triggerHaptic]
  );

  // Tọa độ tính toán vị trí hiển thị 2 đầu kéo
  const minRatio = Math.max(0, Math.min(1, localMin / maxLimit));
  const maxRatio = Math.max(0, Math.min(1, localMax / maxLimit));
  const minPos = trackWidth > 0 ? minRatio * trackWidth : 0;
  const maxPos = trackWidth > 0 ? maxRatio * trackWidth : 0;

  // Hiển thị nhãn giá theo trạng thái hiện tại
  const priceLabel = useMemo(() => {
    if (localMin === 0 && localMax >= maxLimit) {
      return `${t('priceAll')} (0₫ – ${formatCurrency(maxLimit)}+)`;
    }
    if (localMin === 0) {
      return `${t('underLabel') || 'Dưới'} ${formatCurrency(localMax)}`;
    }
    if (localMax >= maxLimit) {
      return `${t('aboveLabel') || 'Từ'} ${formatCurrency(localMin)} ${t('andAbove') || 'trở lên'}`;
    }
    return `${formatCurrency(localMin)} — ${formatCurrency(localMax)}`;
  }, [localMin, localMax, maxLimit, t]);

  // Bộ chọn preset nhanh
  const presets = useMemo(
    () => [
      { id: 'all', label: t('priceAll'), min: 0, max: maxLimit },
      { id: 'under-150k', label: t('priceUnder150'), min: 0, max: 150000 },
      { id: '150k-350k', label: t('price150To350'), min: 150000, max: 350000 },
      { id: '350k-700k', label: t('price350To700'), min: 350000, max: 700000 },
      { id: 'above-700k', label: t('priceAbove700'), min: 700000, max: maxLimit },
    ],
    [maxLimit, t]
  );

  return (
    <View style={styles.container}>
      {/* 1. Nhãn hiển thị số tiền động thời gian thực */}
      <View
        style={[
          styles.readoutBadge,
          {
            backgroundColor: isDark ? '#1E1E1E' : '#FAF4EF',
            borderColor: isDark ? 'rgba(156, 113, 86, 0.3)' : '#E8CCB2',
          },
        ]}
      >
        <Text style={[styles.readoutText, { color: '#9C7156' }]}>{priceLabel}</Text>
      </View>

      {/* 2. Thanh Progress Bar cảm ứng & 2 nút Thumb kéo */}
      <View
        style={styles.sliderArea}
        {...panResponder.panHandlers}
        hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
      >
        <View
          onLayout={handleTrackLayout}
          pointerEvents="none"
          style={[
            styles.trackBg,
            { backgroundColor: isDark ? '#262626' : '#E8E1D8' },
          ]}
        >
          {/* Thanh fill tiến trình màu Nâu Đất Nung */}
          <View
            style={[
              styles.trackFill,
              {
                left: minPos,
                width: Math.max(0, maxPos - minPos),
                backgroundColor: '#9C7156',
              },
            ]}
          />
        </View>

        {/* Nút kéo Min Thumb */}
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: minPos - THUMB_SIZE / 2,
              backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF',
              borderColor: '#9C7156',
            },
          ]}
        >
          <View style={styles.thumbDot} />
        </View>

        {/* Nút kéo Max Thumb */}
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: maxPos - THUMB_SIZE / 2,
              backgroundColor: isDark ? '#2C2C2C' : '#FFFFFF',
              borderColor: '#9C7156',
            },
          ]}
        >
          <View style={styles.thumbDot} />
        </View>
      </View>

      {/* 3. Dải mốc giá 0đ và Max */}
      <View style={styles.rangeLimitRow}>
        <Text style={[styles.limitText, { color: isDark ? '#7E7E7E' : '#9E968D' }]}>0₫</Text>
        <Text style={[styles.limitText, { color: isDark ? '#7E7E7E' : '#9E968D' }]}>
          {formatCurrency(maxLimit)}+
        </Text>
      </View>

      {/* 4. Các chip chọn nhanh (Presets) */}
      <View style={styles.presetChipsRow}>
        {presets.map((p) => {
          const isSelected = localMin === p.min && localMax === p.max;
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setLocalMin(p.min);
                setLocalMax(p.max);
                localMinRef.current = p.min;
                localMaxRef.current = p.max;
                onChange(p.min, p.max);
              }}
              style={[
                styles.presetChip,
                {
                  backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
                  borderColor: isDark ? 'rgba(232, 204, 178, 0.22)' : '#E8E1D8',
                },
                isSelected && styles.presetChipActive,
              ]}
            >
              {isSelected && <View style={styles.activeDot} />}
              <Text
                style={[
                  styles.presetChipText,
                  { color: isDark ? '#B0B0B0' : '#6E665D' },
                  isSelected && styles.presetChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default PriceRangeSlider;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  readoutBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  readoutText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '700',
  },
  sliderArea: {
    height: 46,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 13,
  },
  trackBg: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    position: 'absolute',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9C7156',
  },
  rangeLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  limitText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 11,
    fontWeight: '500',
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  presetChip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  presetChipActive: {
    borderColor: '#9C7156',
    borderWidth: 1.5,
    backgroundColor: 'rgba(156, 113, 86, 0.12)',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#9C7156',
    marginRight: 5,
  },
  presetChipText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 12,
  },
  presetChipTextActive: {
    fontWeight: '700',
    color: '#9C7156',
  },
});
