// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebase';
import { UserProfile } from '../types';
import { registerForPushNotificationsAsync, savePushTokenToFirestore } from '../services/notificationService';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, name: string, phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogleCredential: (idToken: string) => Promise<void>;
  signInWithPhoneSession: (phone: string, displayName?: string) => Promise<void>;
  updateUserProfileData: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const STORAGE_KEY_PROFILE = 'tng_user_profile';
const STORAGE_KEY_SESSION = 'tng_user_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchUserProfile = async (uid: string) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = { uid, ...(snap.data() as any) };
        setUserProfile(data);
        await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(data));
      } else {
        const initialProfile: UserProfile = {
          uid,
          email: auth.currentUser?.email || '',
          displayName: auth.currentUser?.displayName || 'Khách hàng',
          points: 0,
          tier: 'standard',
        };
        await setDoc(userDocRef, { ...initialProfile, createdAt: serverTimestamp() }, { merge: true });
        setUserProfile(initialProfile);
        await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(initialProfile));
      }
    } catch (e) {
      console.warn('Lỗi đọc user profile:', e);
    }
  };

  useEffect(() => {
    // 1. Phục hồi ngay phiên đăng nhập đã lưu trong AsyncStorage
    const restoreSession = async () => {
      try {
        const savedProfileStr = await AsyncStorage.getItem(STORAGE_KEY_PROFILE);
        if (savedProfileStr) {
          const savedProfile = JSON.parse(savedProfileStr);
          setUserProfile(savedProfile);
        }
      } catch (err) {
        console.warn('Lỗi đọc bộ nhớ phiên đăng nhập:', err);
      }
    };
    restoreSession();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await AsyncStorage.setItem(
          STORAGE_KEY_SESSION,
          JSON.stringify({ uid: currentUser.uid, email: currentUser.email })
        );
        await fetchUserProfile(currentUser.uid);
        
        // Đăng ký nhận thông báo đẩy và lưu token
        setTimeout(async () => {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            await savePushTokenToFirestore(currentUser.uid, token);
          }
        }, 3000); // Đợi 3s sau khi login để app mượt mà hơn
      } else {
        // Chỉ xóa profile nếu người dùng thực sự bấm đăng xuất
        const hasSession = await AsyncStorage.getItem(STORAGE_KEY_SESSION);
        if (!hasSession) {
          setUserProfile(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await fetchUserProfile(cred.user.uid);
  };

  const signUp = async (email: string, pass: string, name: string, phone: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      await updateProfile(cred.user, { displayName: name });
      const userDocRef = doc(db, 'users', cred.user.uid);
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: name,
        phone,
        points: 50, // Tặng 50 điểm chào mừng thành viên mới
        tier: 'bronze',
      };
      await setDoc(userDocRef, { ...newProfile, createdAt: serverTimestamp() });
      setUserProfile(newProfile);
    }
  };

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_SESSION);
      await AsyncStorage.removeItem(STORAGE_KEY_PROFILE);
    } catch (e) {
      console.warn('Lỗi xóa AsyncStorage khi logout:', e);
    }
    await firebaseSignOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.uid);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const signInWithGoogleCredential = async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken);
    const cred = await signInWithCredential(auth, credential);
    await fetchUserProfile(cred.user.uid);
  };

  const signInWithPhoneSession = async (phoneNumber: string, displayName?: string) => {
    // Tìm hoặc tạo profile gắn với số điện thoại
    try {
      const q = query(collection(db, 'users'), where('phone', '==', phoneNumber));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = snap.docs[0];
        setUserProfile({ uid: found.id, ...(found.data() as any) });
      } else {
        // Nếu chưa đăng nhập auth thật, đăng nhập anonymous để có UID an toàn
        let currentUid = auth.currentUser?.uid;
        if (!currentUid) {
          const anonCred = await signInAnonymously(auth);
          currentUid = anonCred.user.uid;
        }
        const newProfile: UserProfile = {
          uid: currentUid,
          email: null,
          phone: phoneNumber,
          displayName: displayName || `Khách hàng ${phoneNumber.slice(-4)}`,
          points: 50,
          tier: 'bronze',
        };
        await setDoc(doc(db, 'users', currentUid), { ...newProfile, createdAt: serverTimestamp() }, { merge: true });
        setUserProfile(newProfile);
      }
    } catch (e) {
      console.warn('Lỗi phiên đăng nhập số điện thoại:', e);
      throw e;
    }
  };

  const updateUserProfileData = async (data: Partial<UserProfile>) => {
    try {
      const currentUid = auth.currentUser?.uid || userProfile?.uid;
      if (!currentUid) {
        throw new Error('Vui lòng đăng nhập để cập nhật thông tin');
      }

      const cleanName = (data.displayName || data.name || '').trim();
      const payload: any = {
        updatedAt: new Date().toISOString(),
      };

      if (cleanName) {
        payload.displayName = cleanName;
        payload.name = cleanName;
      }
      if (data.phone !== undefined) payload.phone = data.phone;
      if (data.photoURL !== undefined) payload.photoURL = data.photoURL;
      if (data.gender !== undefined) payload.gender = data.gender;
      if (data.dob !== undefined || data.birthday !== undefined) {
        const d = data.dob || data.birthday;
        payload.dob = d;
        payload.birthday = d;
      }
      if (data.address !== undefined || data.fullAddress !== undefined) {
        const a = data.address || data.fullAddress;
        payload.address = a;
        payload.fullAddress = a;
      }

      // 1. Cập nhật Firebase Auth nếu có tên hoặc avatar
      if (auth.currentUser) {
        const authUpdates: { displayName?: string; photoURL?: string } = {};
        if (cleanName) authUpdates.displayName = cleanName;
        if (data.photoURL) authUpdates.photoURL = data.photoURL;
        if (Object.keys(authUpdates).length > 0) {
          await updateProfile(auth.currentUser, authUpdates);
        }
      }

      // 2. Ghi trực tiếp lên Firestore `users/{uid}` (Đồng bộ trực tiếp với Web App)
      const userDocRef = doc(db, 'users', currentUid);
      await setDoc(userDocRef, payload, { merge: true });

      // 3. Cập nhật state nội bộ và AsyncStorage
      const updatedProfile: UserProfile = {
        ...(userProfile || { uid: currentUid, email: auth.currentUser?.email || null, displayName: cleanName }),
        ...data,
        displayName: cleanName || userProfile?.displayName || null,
        name: cleanName || userProfile?.name,
      };
      setUserProfile(updatedProfile);
      await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(updatedProfile));
    } catch (e) {
      console.warn('Lỗi cập nhật user profile:', e);
      throw e;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        resetPassword,
        signInWithGoogleCredential,
        signInWithPhoneSession,
        updateUserProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
