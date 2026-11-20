import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';

interface BiometricIconProps {
  type: 'faceid' | 'touchid' | 'fingerprint';
  size?: number;
  color?: string;
}

export const BiometricIcon: React.FC<BiometricIconProps> = ({
  type,
  size = 24,
  color = '#FFFFFF',
}) => {
  if (type === 'faceid') {
    if (Platform.OS === 'ios') {
      return (
        <SymbolView
          name="faceid"
          size={size}
          tintColor={color}
          fallback={
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
              {/* 4 Góc Face ID chuẩn Apple iOS */}
              <Path
                d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* 2 Mắt Face ID */}
              <Path
                d="M9 9h.01M15 9h.01"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
              />
              {/* Mũi Face ID */}
              <Path
                d="M10 13c.6.6 1.4.8 2 .8s1.4-.2 2-.8"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
              {/* Miệng cười Face ID */}
              <Path
                d="M8.5 17c1.8 1.4 5.2 1.4 7 0"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          }
        />
      );
    }

    // Android hoặc fallback không có SF Symbol
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M9 9h.01M15 9h.01"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <Path
          d="M10 13c.6.6 1.4.8 2 .8s1.4-.2 2-.8"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <Path
          d="M8.5 17c1.8 1.4 5.2 1.4 7 0"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  // Touch ID (iOS) hoặc Vân tay (Android)
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name="touchid"
        size={size}
        tintColor={color}
        fallback={<Ionicons name="finger-print" size={size} color={color} />}
      />
    );
  }

  return <Ionicons name="finger-print" size={size} color={color} />;
};
