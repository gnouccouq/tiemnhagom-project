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
  OAuthProvider,
  signInWithCredential,
  signInAnonymously,
  linkWithCredential,
  unlink
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs } from 'firebase/firestore';
import { ref, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, storage } from '../config/firebase';
import { UserProfile } from '../types';
import { registerForPushNotificationsAsync, savePushTokenToFirestore } from '../services/notificationService';
import { formatPhoneNumber, getPhoneVariants } from '../utils/format';

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
  signInWithAppleCredential: (idToken: string, rawNonce: string) => Promise<void>;
  signInWithPhoneSession: (phone: string, displayName?: string) => Promise<void>;
  updateUserProfileData: (data: Partial<UserProfile>) => Promise<void>;
  linkGoogleAccount: (idToken: string) => Promise<void>;
  linkAppleAccount: (idToken: string, rawNonce: string) => Promise<void>;
  unlinkProvider: (providerId: string) => Promise<void>;
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
        const rawData = snap.data() as any;

        // Nếu tài khoản này đã được gộp/chuyển tiếp sang tài khoản chính (mergedTo)
        if (rawData.mergedTo && rawData.mergedTo !== uid) {
          const primarySnap = await getDoc(doc(db, 'users', rawData.mergedTo));
          if (primarySnap.exists()) {
            const primaryData = primarySnap.data() as any;
            let sanitizedPoints = primaryData.points !== undefined ? Number(primaryData.points) : 0;
            if (sanitizedPoints === 50 && (!primaryData.totalSpent || Number(primaryData.totalSpent) < 500000)) {
              sanitizedPoints = Math.floor(Number(primaryData.totalSpent || 0) / 10000);
            }
            const primaryAvatar = primaryData.photoURL || primaryData.avatar || auth.currentUser?.photoURL || null;
            const resolvedProfile = {
              uid: rawData.mergedTo,
              ...primaryData,
              points: sanitizedPoints,
              photoURL: primaryAvatar,
              avatar: primaryAvatar,
            };
            setUserProfile(resolvedProfile);
            await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(resolvedProfile));
            await AsyncStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ uid: rawData.mergedTo, email: primaryData.email || null }));
            return;
          }
        }

        // Nếu tài khoản hiện tại không có email nhưng có SĐT, kiểm tra xem có tài khoản Email nào đã đăng ký SĐT này trước đó không
        if (!rawData.email && rawData.phone) {
          const variants = getPhoneVariants(rawData.phone);
          let primaryDocSnap: any = null;
          for (const p of variants) {
            const qP = query(collection(db, 'users'), where('phone', '==', p));
            const sP = await getDocs(qP);
            const foundEmail = sP.docs.find(d => d.id !== uid && d.data().email);
            if (foundEmail) {
              primaryDocSnap = foundEmail;
              break;
            }
          }
          if (primaryDocSnap) {
            // Sáp nhập tài khoản phụ vào tài khoản chính có email
            await setDoc(userDocRef, { isMerged: true, mergedTo: primaryDocSnap.id, updatedAt: new Date().toISOString() }, { merge: true });
            const pData = primaryDocSnap.data() as any;
            let sanitizedPoints = pData.points !== undefined ? Number(pData.points) : 0;
            if (sanitizedPoints === 50 && (!pData.totalSpent || Number(pData.totalSpent) < 500000)) {
              sanitizedPoints = Math.floor(Number(pData.totalSpent || 0) / 10000);
            }
            const pAvatar = pData.photoURL || pData.avatar || auth.currentUser?.photoURL || null;
            const resolvedProfile = {
              uid: primaryDocSnap.id,
              ...pData,
              points: sanitizedPoints,
              photoURL: pAvatar,
              avatar: pAvatar,
            };
            setUserProfile(resolvedProfile);
            await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(resolvedProfile));
            await AsyncStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ uid: primaryDocSnap.id, email: pData.email || null }));
            return;
          }
        }

        let sanitizedPoints = rawData.points !== undefined ? Number(rawData.points) : 0;
        if (sanitizedPoints === 50 && (!rawData.totalSpent || Number(rawData.totalSpent) < 500000)) {
          sanitizedPoints = Math.floor(Number(rawData.totalSpent || 0) / 10000);
          try {
            await setDoc(userDocRef, { points: sanitizedPoints }, { merge: true });
          } catch (e) {
            // ignore
          }
        }
        // Đồng bộ 2 chiều giữa avatar (Web) và photoURL (App & Firebase Auth)
        const effectiveAvatar = rawData.photoURL || rawData.avatar || auth.currentUser?.photoURL || null;
        const data = {
          uid,
          ...rawData,
          points: sanitizedPoints,
          photoURL: effectiveAvatar,
          avatar: effectiveAvatar,
        };
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
          if (savedProfile.points === 50 && (!savedProfile.totalSpent || Number(savedProfile.totalSpent) < 500000)) {
            savedProfile.points = Math.floor(Number(savedProfile.totalSpent || 0) / 10000);
          }
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
        points: 0,
        tier: 'standard',
      };
      await setDoc(userDocRef, { ...newProfile, createdAt: serverTimestamp() });
      setUserProfile(newProfile);
    }
  };

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_SESSION);
      await AsyncStorage.removeItem(STORAGE_KEY_PROFILE);
      await AsyncStorage.removeItem('has_seen_onboarding');
      await AsyncStorage.removeItem('@tiemnhagom_cart_guest');
      await AsyncStorage.removeItem('@tiemnhagom_wishlist_guest');
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

  const signInWithAppleCredential = async (idToken: string, rawNonce: string) => {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken,
      rawNonce,
    });
    const cred = await signInWithCredential(auth, credential);
    await fetchUserProfile(cred.user.uid);
  };

  const signInWithPhoneSession = async (rawPhoneNumber: string, displayName?: string) => {
    // Chuẩn hoá và lấy các biến thể số điện thoại (+84... và 0...)
    const p0 = formatPhoneNumber(rawPhoneNumber);
    const variants = getPhoneVariants(rawPhoneNumber);
    if (!p0) {
      throw new Error('Số điện thoại không hợp lệ');
    }

    try {
      let foundDoc: any = null;

      // 1. Tìm tất cả user theo phone chuẩn hoặc biến thể
      const candidateDocs: any[] = [];
      for (const p of variants) {
        const q = query(collection(db, 'users'), where('phone', '==', p));
        const snap = await getDocs(q);
        candidateDocs.push(...snap.docs);
      }

      // 2. Nếu chưa thấy, tìm tiếp theo identifiers array
      if (candidateDocs.length === 0) {
        for (const p of variants) {
          const qId = query(collection(db, 'users'), where('identifiers', 'array-contains', p));
          const snapId = await getDocs(qId);
          candidateDocs.push(...snapId.docs);
        }
      }

      // Lọc trùng lặp doc
      const uniqueDocs = Array.from(new Map(candidateDocs.map(d => [d.id, d])).values());

      // Ưu tiên:
      // 1. Tài khoản không bị isMerged và CÓ email (tài khoản gốc tạo bằng email/google)
      // 2. Hoặc tài khoản không bị isMerged
      // 3. Nếu tài khoản có mergedTo, theo link mergedTo đến tài khoản chính
      if (uniqueDocs.length > 0) {
        let bestDoc = uniqueDocs.find(d => !d.data().isMerged && !!d.data().email);
        if (!bestDoc) {
          bestDoc = uniqueDocs.find(d => !d.data().isMerged);
        }
        if (!bestDoc) {
          bestDoc = uniqueDocs[0];
        }

        let raw = bestDoc.data() as any;
        let finalDocId = bestDoc.id;

        // Nếu doc được chọn trỏ tới mergedTo
        if (raw.mergedTo && raw.mergedTo !== bestDoc.id) {
          const pSnap = await getDoc(doc(db, 'users', raw.mergedTo));
          if (pSnap.exists()) {
            finalDocId = pSnap.id;
            raw = pSnap.data() as any;
          }
        }
        foundDoc = { id: finalDocId, data: () => raw };
      }

      if (foundDoc) {
        const raw = foundDoc.data() as any;
        let sanitizedPoints = raw.points !== undefined ? Number(raw.points) : 0;
        if (sanitizedPoints === 50 && (!raw.totalSpent || Number(raw.totalSpent) < 500000)) {
          sanitizedPoints = Math.floor(Number(raw.totalSpent || 0) / 10000);
        }
        // Đảm bảo số điện thoại được chuẩn hoá và lưu variants
        const allIdentifiers = Array.from(new Set([...(raw.identifiers || []), ...variants])).filter(Boolean);
        try {
          await setDoc(
            doc(db, 'users', foundDoc.id),
            { phone: p0, identifiers: allIdentifiers, lastLogin: new Date().toISOString() },
            { merge: true }
          );
        } catch (e) {
          // ignore
        }

        const userProfileData = {
          uid: foundDoc.id,
          ...raw,
          phone: p0,
          points: sanitizedPoints,
          identifiers: allIdentifiers,
        };
        setUserProfile(userProfileData);
        await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(userProfileData));
        await AsyncStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ uid: foundDoc.id, email: raw.email || null }));
      } else {
        // Tạo UID mới cho phiên đăng nhập SĐT
        let currentUid = auth.currentUser?.uid;
        if (!currentUid) {
          currentUid = 'phone_' + p0.replace(/\D/g, '') + '_' + Date.now().toString();
        }
        const newProfile: UserProfile = {
          uid: currentUid,
          email: null,
          phone: p0,
          displayName: displayName || `Khách hàng ${p0.slice(-4)}`,
          points: 0,
          tier: 'standard',
        };
        await setDoc(
          doc(db, 'users', currentUid),
          { ...newProfile, identifiers: variants, createdAt: serverTimestamp(), lastLogin: new Date().toISOString() },
          { merge: true }
        );
        setUserProfile({ ...newProfile, identifiers: variants } as any);
        await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(newProfile));
        await AsyncStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ uid: currentUid, email: null }));
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
      if (data.phone !== undefined) {
        const normalizedPhone = formatPhoneNumber(data.phone);
        const variants = getPhoneVariants(data.phone);
        payload.phone = normalizedPhone;
        payload.identifiers = Array.from(new Set([...(userProfile?.identifiers || []), ...variants])).filter(Boolean);
      }
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
      if (data.streetAddress !== undefined) payload.streetAddress = data.streetAddress;
      if (data.provinceCode !== undefined) payload.provinceCode = data.provinceCode;
      if (data.wardCode !== undefined) payload.wardCode = data.wardCode;
      if (data.locationName !== undefined) payload.locationName = data.locationName;

      // Đồng bộ sổ địa chỉ (addresses) để Web có thể hiển thị đồng nhất
      if (data.address || data.streetAddress || data.fullAddress) {
        const addrDetail = (data.streetAddress || data.address || data.fullAddress || '').trim();
        const locParts = (data.locationName || '').split(',').map((s: string) => s.trim());
        const wardPart = locParts[0] || '';
        const provPart = locParts[1] || '';

        const newAddrItem = {
          fullName: cleanName || userProfile?.displayName || userProfile?.name || 'Khách hàng',
          phone: data.phone || userProfile?.phone || '',
          provinceName: provPart,
          wardName: wardPart,
          address: addrDetail,
          isDefault: true,
          updatedAt: new Date().toISOString(),
        };

        const existingAddresses = Array.isArray(userProfile?.addresses) ? [...userProfile.addresses] : [];
        if (existingAddresses.length === 0) {
          existingAddresses.push(newAddrItem);
        } else {
          existingAddresses[0] = { ...existingAddresses[0], ...newAddrItem };
        }
        payload.addresses = existingAddresses;
      }

      // Xử lý upload avatar lên Firebase Storage nếu là base64 hoặc local file uri
      let finalPhotoURL = data.photoURL;
      if (data.photoURL && (data.photoURL.startsWith('data:image') || data.photoURL.startsWith('file://') || data.photoURL.startsWith('content://'))) {
        try {
          const avatarStorageRef = ref(storage, `avatars/${currentUid}/${Date.now()}_avatar.jpg`);
          let uploadSnapshot;

          if (data.photoURL.startsWith('data:image')) {
            uploadSnapshot = await uploadString(avatarStorageRef, data.photoURL, 'data_url');
          } else {
            // Đọc file thành base64 an toàn trên React Native / Expo thay vì resp.blob() gây lỗi ArrayBuffer
            let base64Data = '';
            try {
              const FileSystem = require('expo-file-system/legacy') || require('expo-file-system');
              if (FileSystem && FileSystem.readAsStringAsync) {
                base64Data = await FileSystem.readAsStringAsync(data.photoURL, {
                  encoding: FileSystem.EncodingType?.Base64 || 'base64',
                });
              }
            } catch (fsErr) {
              // fallback nếu require legacy khác
              try {
                const FileSystem = require('expo-file-system');
                if (FileSystem && FileSystem.readAsStringAsync) {
                  base64Data = await FileSystem.readAsStringAsync(data.photoURL, {
                    encoding: 'base64',
                  });
                }
              } catch (e) {
                // ignore
              }
            }

            if (base64Data) {
              uploadSnapshot = await uploadString(avatarStorageRef, `data:image/jpeg;base64,${base64Data}`, 'data_url');
            } else {
              // Fallback dùng XMLHttpRequest tạo Blob chuẩn React Native
              const blob: Blob = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.onload = () => resolve(xhr.response);
                xhr.onerror = () => reject(new TypeError('Network request failed'));
                xhr.responseType = 'blob';
                xhr.open('GET', String(data.photoURL), true);
                xhr.send(null);
              });
              uploadSnapshot = await uploadBytes(avatarStorageRef, blob);
            }
          }
          finalPhotoURL = await getDownloadURL(uploadSnapshot.ref);
        } catch (uploadErr) {
          console.warn('Lỗi upload ảnh lên Storage, bỏ qua cập nhật auth photoURL:', uploadErr);
        }
      }

      if (finalPhotoURL !== undefined) {
        payload.photoURL = finalPhotoURL;
        payload.avatar = finalPhotoURL; // đồng bộ field avatar với web
      }

      // 1. Cập nhật Firebase Auth nếu có tên hoặc avatar hợp lệ (Firebase Auth giới hạn photoURL < 2048 ký tự)
      if (auth.currentUser) {
        const authUpdates: { displayName?: string; photoURL?: string } = {};
        if (cleanName) authUpdates.displayName = cleanName;
        if (finalPhotoURL && !finalPhotoURL.startsWith('data:image') && finalPhotoURL.length < 2000) {
          authUpdates.photoURL = finalPhotoURL;
        }
        if (Object.keys(authUpdates).length > 0) {
          try {
            await updateProfile(auth.currentUser, authUpdates);
          } catch (authErr) {
            console.warn('Lỗi cập nhật Auth profile:', authErr);
          }
        }
      }

      // 2. Ghi trực tiếp lên Firestore `users/{uid}` (Đồng bộ trực tiếp với Web App)
      const userDocRef = doc(db, 'users', currentUid);
      await setDoc(userDocRef, payload, { merge: true });

      // Nếu cập nhật SĐT, tìm xem có tài khoản cũ/ghost record nào mang SĐT này không để sáp nhập điểm và thông tin
      if (data.phone) {
        const p0 = formatPhoneNumber(data.phone);
        const variants = getPhoneVariants(data.phone);
        try {
          let oldDocSnap: any = null;
          for (const p of variants) {
            const qP = query(collection(db, 'users'), where('phone', '==', p));
            const sP = await getDocs(qP);
            const foundOther = sP.docs.find(d => d.id !== currentUid);
            if (foundOther) {
              oldDocSnap = foundOther;
              break;
            }
          }
          if (oldDocSnap) {
            const oldData = oldDocSnap.data() as any;
            const curSnap = await getDoc(userDocRef);
            const curData = curSnap.data() as any || {};

            const mergedPoints = Math.max(Number(curData.points || 0), Number(oldData.points || 0));
            const mergedSpent = Math.max(Number(curData.totalSpent || 0), Number(oldData.totalSpent || 0));

            await setDoc(
              userDocRef,
              {
                points: mergedPoints,
                totalSpent: mergedSpent,
                mergedAccounts: Array.from(new Set([...(curData.mergedAccounts || []), oldDocSnap.id])),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );

            // Đánh dấu tài khoản cũ đã được sáp nhập
            await setDoc(
              oldDocSnap.ref,
              { isMerged: true, mergedTo: currentUid, updatedAt: new Date().toISOString() },
              { merge: true }
            );
          }
        } catch (mergeErr) {
          console.warn('Lỗi auto-merge tài khoản theo SĐT:', mergeErr);
        }
      }

      // 3. Cập nhật state nội bộ và AsyncStorage
      const updatedProfile: UserProfile = {
        ...(userProfile || { uid: currentUid, email: auth.currentUser?.email || null, displayName: cleanName }),
        ...data,
        photoURL: finalPhotoURL !== undefined ? finalPhotoURL : (userProfile?.photoURL ?? null),
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

  const linkGoogleAccount = async (idToken: string) => {
    if (!auth.currentUser) throw new Error('Vui lòng đăng nhập trước khi liên kết tài khoản');
    const credential = GoogleAuthProvider.credential(idToken);
    try {
      await linkWithCredential(auth.currentUser, credential);
      await fetchUserProfile(auth.currentUser.uid);
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        throw new Error('Tài khoản Google này đã được liên kết với một tài khoản khác');
      }
      throw err;
    }
  };

  const linkAppleAccount = async (idToken: string, rawNonce: string) => {
    if (!auth.currentUser) throw new Error('Vui lòng đăng nhập trước khi liên kết tài khoản');
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken,
      rawNonce,
    });
    try {
      await linkWithCredential(auth.currentUser, credential);
      await fetchUserProfile(auth.currentUser.uid);
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        throw new Error('Tài khoản Apple này đã được liên kết với một tài khoản khác');
      }
      throw err;
    }
  };

  const unlinkProvider = async (providerId: string) => {
    if (!auth.currentUser) throw new Error('Vui lòng đăng nhập');
    try {
      await unlink(auth.currentUser, providerId);
      await fetchUserProfile(auth.currentUser.uid);
    } catch (err: any) {
      throw err;
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
        signInWithAppleCredential,
        signInWithPhoneSession,
        updateUserProfileData,
        linkGoogleAccount,
        linkAppleAccount,
        unlinkProvider,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
