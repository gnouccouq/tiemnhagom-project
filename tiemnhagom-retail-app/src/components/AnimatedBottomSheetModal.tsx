// src/components/AnimatedBottomSheetModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StyleProp,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '../constants/theme';

export interface AnimatedBottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  contentStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  showHandle?: boolean;
  dismissOnBackdropPress?: boolean;
  avoidKeyboard?: boolean;
}

export const AnimatedBottomSheetModal: React.FC<AnimatedBottomSheetModalProps> = ({
  visible,
  onClose,
  children,
  title,
  contentStyle,
  backdropStyle,
  showHandle = true,
  dismissOnBackdropPress = true,
  avoidKeyboard = false,
}) => {
  const insets = useSafeAreaInsets();
  const Colors = useThemeColor();
  const isDark = Colors.cardBackground !== '#FFFFFF';
  const styles = getStyles(Colors, isDark);
  const [isRendered, setIsRendered] = useState(visible);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(360)).current;
  const sheetScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      backdropAnim.setValue(0);
      sheetTranslateY.setValue(360);
      sheetScale.setValue(0.96);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          mass: 0.85,
          useNativeDriver: true,
        }),
        Animated.spring(sheetScale, {
          toValue: 1,
          damping: 22,
          stiffness: 260,
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
        Animated.timing(sheetTranslateY, {
          toValue: 360,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(sheetScale, {
          toValue: 0.96,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsRendered(false);
      });
    }
  }, [visible]);

  if (!isRendered) return null;

  return (
    <Modal
      visible={isRendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
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
        {avoidKeyboard ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            style={{ width: '100%', justifyContent: 'flex-end' }}
          >
            <Animated.View
              style={[
                styles.sheet,
                {
                  paddingBottom: Math.max(insets.bottom, 16) + 8,
                  transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
                },
                contentStyle,
              ]}
            >
              {showHandle && <View style={styles.handle} />}
              {!!title && <Text style={styles.sheetTitle}>{title}</Text>}
              {children}
            </Animated.View>
          </KeyboardAvoidingView>
        ) : (
          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 8,
                transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
              },
              contentStyle,
            ]}
          >
            {showHandle && <View style={styles.handle} />}
            {!!title && <Text style={styles.sheetTitle}>{title}</Text>}
            {children}
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
};

const getStyles = (Colors: any, isDark: boolean) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    flex: 1,
  },
  sheet: {
    width: '100%',
    backgroundColor: isDark ? '#121212' : '#FAF8F5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? '#333333' : '#D8CFBF',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: 'ElleGaborStd',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
});
