// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as LocalAuthentication from 'expo-local-authentication';
import { auth, db } from '../config/firebase';
import { AdminUser, AdminRole } from '../types';

interface AuthContextType {
  user: FirebaseUser | null;
  adminProfile: AdminUser | null;
  isLoading: boolean;
  isShiftLocked: boolean;
  hasPinConfigured: boolean;
  isBiometricAvailable: boolean;
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  setupPin: (pin: string) => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lockShift: () => void;
  checkPermission: (permissionId: string) => boolean;
}

const PIN_STORAGE_PREFIX = '@tiemnhagom_retail_pin_';

const AuthContext = createContext<AuthContextType>({
  user: null,
  adminProfile: null,
  isLoading: true,
  isShiftLocked: false,
  hasPinConfigured: false,
  isBiometricAvailable: false,
  signIn: async () => ({ success: false }),
  signOut: async () => {},
  setupPin: async () => false,
  unlockWithPin: async () => false,
  unlockWithBiometrics: async () => false,
  lockShift: () => {},
  checkPermission: () => false,
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isShiftLocked, setIsShiftLocked] = useState<boolean>(false);
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean>(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState<boolean>(false);

  // Kiểm tra khả dụng sinh trắc học Face ID / Vân tay
  useEffect(() => {
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricAvailable(compatible && enrolled);
      } catch {
        setIsBiometricAvailable(false);
      }
    })();
  }, []);

  // Lắng nghe trạng thái đăng nhập Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const adminDocRef = doc(db, 'admins', firebaseUser.uid);
          const adminDocSnap = await getDoc(adminDocRef);

          if (adminDocSnap.exists()) {
            const data = adminDocSnap.data();
            if (data.isLocked) {
              await firebaseSignOut(auth);
              setUser(null);
              setAdminProfile(null);
            } else {
              const role: AdminRole = data.role || 'staff';
              const profile: AdminUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: data.displayName || firebaseUser.displayName || 'Nhân viên Tiệm',
                role,
                permissions: data.permissions || [],
                isLocked: false,
                avatarUrl: data.avatarUrl || '',
                phone: data.phone || '',
              };
              setAdminProfile(profile);

              // Kiểm tra xem đã có mã PIN lưu trên máy chưa
              const savedPin = await AsyncStorage.getItem(`${PIN_STORAGE_PREFIX}${firebaseUser.uid}`);
              setHasPinConfigured(!!savedPin);
            }
          } else {
            // Không phải admin -> từ chối đăng nhập
            await firebaseSignOut(auth);
            setUser(null);
            setAdminProfile(null);
          }
        } catch (e) {
          console.error('Lỗi kiểm tra quyền admin:', e);
          setUser(null);
          setAdminProfile(null);
        }
      } else {
        setUser(null);
        setAdminProfile(null);
        setIsShiftLocked(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const adminDocRef = doc(db, 'admins', cred.user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (!adminDocSnap.exists()) {
        await firebaseSignOut(auth);
        setIsLoading(false);
        return { success: false, error: 'Tài khoản không thuộc danh sách quản trị viên Tiệm Nhà Gốm.' };
      }

      const data = adminDocSnap.data();
      if (data.isLocked) {
        await firebaseSignOut(auth);
        setIsLoading(false);
        return { success: false, error: 'Tài khoản của bạn hiện đang bị khóa tạm thời.' };
      }

      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      let errorMsg = 'Email hoặc mật khẩu không chính xác.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        errorMsg = 'Email hoặc mật khẩu không đúng.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Quá nhiều lần thử sai. Vui lòng đợi trong giây lát.';
      }
      return { success: false, error: errorMsg };
    }
  };

  const signOut = async () => {
    try {
      setIsShiftLocked(false);
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn(e);
    }
  };

  const setupPin = async (pin: string): Promise<boolean> => {
    if (!user || pin.length < 4) return false;
    try {
      await AsyncStorage.setItem(`${PIN_STORAGE_PREFIX}${user.uid}`, pin);
      setHasPinConfigured(true);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const unlockWithPin = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const savedPin = await AsyncStorage.getItem(`${PIN_STORAGE_PREFIX}${user.uid}`);
      if (savedPin === pin) {
        setIsShiftLocked(false);
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    if (!isBiometricAvailable) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Mở khóa ca trực Tiệm Nhà Gốm',
        cancelLabel: 'Dùng mã PIN',
        fallbackLabel: 'Dùng mã PIN',
      });
      if (result.success) {
        setIsShiftLocked(false);
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const lockShift = () => {
    setIsShiftLocked(true);
  };

  const checkPermission = (permissionId: string): boolean => {
    if (!adminProfile) return false;
    if (adminProfile.isLocked) return false;
    if (adminProfile.role === 'super_admin') return true;

    const perms = adminProfile.permissions || [];

    // Map alias đồng bộ giữa mã App Retail và mã Section của Web Dashboard
    const aliasMap: Record<string, string[]> = {
      overview: ['overview', 'overview-section'],
      pos: ['pos', 'pos-section'],
      orders: ['orders', 'order-section', 'rental-order-section'],
      inventory: ['inventory', 'product-section', 'products', 'category-section', 'inventory-log-section'],
      products: ['products', 'inventory', 'product-section'],
      customers: ['customers', 'user-section', 'users', 'customer-analytics-section'],
      coupons: ['coupons', 'coupon-section'],
      push_notifications: ['push_notifications', 'push-notification-section'],
      shift_report: ['shift_report', 'shift-report-section', 'stats-section', 'stats'],
      stats: ['stats', 'stats-section'],
      staff: ['staff', 'admin-account-section', 'admins', 'admin_accounts'],
      settings: ['settings', 'maintenance-section'],
    };

    const targetKeys = aliasMap[permissionId] || [permissionId];

    // 1. Kiểm tra trực tiếp trong mảng permissions do Admin cấp
    if (perms.length > 0) {
      return targetKeys.some((k) => perms.includes(k));
    }

    // 2. Fallback theo role nếu tài khoản chưa được gán mảng permissions
    if (adminProfile.role === 'manager') {
      return permissionId !== 'staff';
    }
    if (adminProfile.role === 'staff') {
      return ['pos', 'orders', 'inventory', 'shift_report', 'overview'].includes(permissionId);
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        adminProfile,
        isLoading,
        isShiftLocked,
        hasPinConfigured,
        isBiometricAvailable,
        signIn,
        signOut,
        setupPin,
        unlockWithPin,
        unlockWithBiometrics,
        lockShift,
        checkPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
