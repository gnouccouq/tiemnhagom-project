// src/components/AnimatedCenterModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StyleProp,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { useThemeColor } from '../constants/theme';

export interface AnimatedCenterModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  dismissOnBackdropPress?: boolean;
  avoidKeyboard?: boolean;
}

export const AnimatedCenterModal: React.FC<AnimatedCenterModalProps> = ({
  visible,
  onClose,
  children,
  contentStyle,
  backdropStyle,
  dismissOnBackdropPress = true,
  avoidKeyboard = false,
}) => {
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const [isRendered, setIsRendered] = useState(visible);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      backdropAnim.setValue(0);
      scaleAnim.setValue(0.85);
      translateYAnim.setValue(20);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 20,
          stiffness: 280,
          mass: 0.85,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 280,
          mass: 0.85,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isRendered) {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.88,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 16,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsRendered(false);
      });
    }
  }, [visible]);

  if (!isRendered) return null;

  const content = (
    <Animated.View
      style={[
        styles.backdrop,
        backdropStyle,
        { opacity: backdropAnim },
      ]}
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={dismissOnBackdropPress ? onClose : undefined}
      />
      <Animated.View
        style={[
          styles.dialogCard,
          {
            transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
          },
          contentStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );

  return (
    <Modal
      visible={isRendered}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </Modal>
  );
};

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  keyboardWrap: {
    flex: 1,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: isDark ? '#121212' : '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.4 : 0.18,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 0,
  },
});
