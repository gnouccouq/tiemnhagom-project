import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ScalePressable } from '../components/ScalePressable';
import { useThemeColor } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  onPress?: () => void;
}

export interface DialogOptions {
  title?: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  icon?: keyof typeof Ionicons.glyphMap;
  buttons?: DialogButton[];
  cancelable?: boolean;
}

interface DialogContextValue {
  showDialog: (options: DialogOptions) => void;
  hideDialog: () => void;
  alert: (title: string, message?: string, buttons?: DialogButton[]) => void;
  confirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText?: string,
    cancelText?: string,
    isDestructive?: boolean
  ) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const Colors = useThemeColor();
  const styles = getStyles(Colors);
  const [visible, setVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [config, setConfig] = useState<DialogOptions>({});

  // Animation values
  const scaleAnim = useRef(new Animated.Value(0.82)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Trigger animation when visible changes
  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      scaleAnim.setValue(0.82);
      opacityAnim.setValue(0);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 260,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out then hide modal
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0.88,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => setModalVisible(false));
    }
  }, [visible]);

  const showDialog = useCallback((options: DialogOptions) => {
    setConfig(options);
    setVisible(true);
  }, []);

  const hideDialog = useCallback(() => {
    setVisible(false);
  }, []);

  const alert = useCallback(
    (title: string, message?: string, buttons?: DialogButton[]) => {
      const defaultButtons: DialogButton[] = buttons && buttons.length > 0
        ? buttons
        : [{ text: 'Đã hiểu', style: 'primary' }];

      // Tự động nhận diện type dựa trên tiêu đề
      let dialogType: DialogOptions['type'] = 'info';
      const lower = (title || '').toLowerCase();
      if (lower.includes('thành công') || lower.includes('success') || lower.includes('✓')) {
        dialogType = 'success';
      } else if (lower.includes('lỗi') || lower.includes('error') || lower.includes('thất bại')) {
        dialogType = 'error';
      } else if (lower.includes('cảnh báo') || lower.includes('warning')) {
        dialogType = 'warning';
      }

      showDialog({
        title,
        message,
        type: dialogType,
        buttons: defaultButtons,
        cancelable: true,
      });
    },
    [showDialog]
  );

  const confirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      confirmText = 'Xác nhận',
      cancelText = 'Hủy',
      isDestructive = false
    ) => {
      showDialog({
        title,
        message,
        type: isDestructive ? 'warning' : 'confirm',
        cancelable: true,
        buttons: [
          {
            text: cancelText,
            style: 'cancel',
          },
          {
            text: confirmText,
            style: isDestructive ? 'destructive' : 'primary',
            onPress: onConfirm,
          },
        ],
      });
    },
    [showDialog]
  );

  const handleButtonPress = (btn: DialogButton) => {
    hideDialog();
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress?.();
      }, 100);
    }
  };

  // Xác định icon & màu đại diện dựa trên type đồng bộ thương hiệu Tiệm Nhà Gốm
  const isDark = Colors.cardBackground === '#1E1E1E';

  const getIconConfig = () => {
    if (config.icon) {
      return {
        name: config.icon,
        color: isDark ? '#D89E3A' : '#9C7156',
        bg: isDark ? '#2E2218' : '#F6F4EC',
      };
    }
    switch (config.type) {
      case 'success':
        return {
          name: 'checkmark-circle' as const,
          color: isDark ? '#D89E3A' : '#9C7156',
          bg: isDark ? '#2E2218' : '#F6F4EC',
        };
      case 'error':
        return {
          name: 'close-circle' as const,
          color: isDark ? '#EF5350' : '#C86432',
          bg: isDark ? '#3E1C1A' : '#FFF0E8',
        };
      case 'warning':
        return {
          name: 'alert-circle' as const,
          color: isDark ? '#E57373' : '#C86432',
          bg: isDark ? '#3E1C1A' : '#FFF0E8',
        };
      case 'confirm':
        return {
          name: 'help-circle' as const,
          color: isDark ? '#D89E3A' : '#9C7156',
          bg: isDark ? '#2E2218' : '#F6F4EC',
        };
      default:
        return {
          name: 'information-circle' as const,
          color: isDark ? '#D89E3A' : '#9C7156',
          bg: isDark ? '#2E2218' : '#F6F4EC',
        };
    }
  };

  const iconInfo = getIconConfig();
  const buttons = config.buttons && config.buttons.length > 0
    ? config.buttons
    : [{ text: 'Đóng', style: 'cancel' as const }];

  return (
    <DialogContext.Provider value={{ showDialog, hideDialog, alert, confirm }}>
      {children}

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          if (config.cancelable !== false) {
            hideDialog();
          }
        }}
      >
        {/* fullScreen: flex:1 + căn giữa card */}
        <Animated.View style={[styles.fullScreen, { opacity: backdropAnim }]}>
          {/* Lớp blur phía sau */}
          <BlurView
            intensity={Platform.OS === 'ios' ? 45 : 35}
            tint="dark"
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
            style={StyleSheet.absoluteFill}
          />

          {/* Vùng tap ra ngoài để đóng */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              if (config.cancelable !== false) hideDialog();
            }}
          />

          {/* Card hộp thoại - spring animation */}
          <Animated.View
            style={[
              styles.cardContainer,
              {
                opacity: opacityAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: iconInfo.bg }]}>
              <Ionicons name={iconInfo.name} size={30} color={iconInfo.color} />
            </View>

            {config.title ? <Text style={styles.titleText}>{config.title}</Text> : null}
            {config.message ? <Text style={styles.messageText}>{config.message}</Text> : null}

            <View
              style={[
                styles.buttonGroup,
                buttons.length > 2 && { flexDirection: 'column' },
              ]}
            >
              {buttons.map((btn, index) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const isPrimary =
                  btn.style === 'primary' ||
                  (!btn.style && index === buttons.length - 1);

                return (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.82}
                    style={[
                      styles.actionBtn,
                      isCancel && styles.cancelBtn,
                      isDestructive && styles.destructiveBtn,
                      isPrimary && !isDestructive && styles.primaryBtn,
                      buttons.length <= 2 && { flex: 1 },
                    ]}
                    onPress={() => handleButtonPress(btn)}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.actionBtnText,
                        isCancel && styles.cancelBtnText,
                        isDestructive && styles.destructiveBtnText,
                        isPrimary && !isDestructive && styles.primaryBtnText,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

const getStyles = (Colors: any) => {
  const isDark = Colors.cardBackground === '#1E1E1E';

  return StyleSheet.create({
    fullScreen: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    cardContainer: {
      width: Math.min(SCREEN_WIDTH - 44, 350),
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 20,
      alignItems: 'center',
      borderWidth: 0,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.4 : 0.16,
      shadowRadius: 18,
      elevation: isDark ? 12 : 8,
    },
    iconWrap: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    titleText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 17.5,
      fontWeight: '700',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
      textAlign: 'center',
      marginBottom: 8,
      lineHeight: 24,
    },
    messageText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 13.5,
      lineHeight: 20,
      color: Colors.textSecondary || (isDark ? '#B0B0B0' : '#6E665D'),
      textAlign: 'center',
      marginBottom: 22,
    },
    buttonGroup: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    actionBtn: {
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    actionBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '600',
      color: Colors.textPrimary || (isDark ? '#F5F5F5' : '#231B15'),
    },
    primaryBtn: {
      backgroundColor: '#9C7156', // Nâu Đất Nung chuẩn brand
      shadowColor: '#9C7156',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.22,
      shadowRadius: 6,
      elevation: isDark ? 0 : 3,
    },
    primaryBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    destructiveBtn: {
      backgroundColor: isDark ? '#C86432' : '#C86432', // Men đất nung đồng bộ
      shadowColor: '#C86432',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0 : 0.25,
      shadowRadius: 6,
      elevation: isDark ? 0 : 3,
    },
    destructiveBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    cancelBtn: {
      backgroundColor: isDark ? '#2C2C2C' : '#FAF8F5',
      borderWidth: isDark ? 0 : 1,
      borderColor: isDark ? 'transparent' : '#E8E1D8',
    },
    cancelBtnText: {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#E0E0E0' : (Colors.textSecondary || '#6E665D'),
    },
  });
};
