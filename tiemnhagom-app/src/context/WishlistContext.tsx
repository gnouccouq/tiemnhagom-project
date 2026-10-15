// src/context/WishlistContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

interface WishlistContextType {
  favorites: string[]; // List of product IDs
  toggleFavorite: (productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
}

const STORAGE_KEY_GUEST = '@tiemnhagom_wishlist_guest';
const getWishlistStorageKey = (uid: string) => `@tiemnhagom_wishlist_${uid}`;
const WishlistContext = createContext<WishlistContextType>({} as WishlistContextType);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const currentUid = user?.uid || null;
  const [favorites, setFavorites] = useState<string[]>([]);
  const isSyncingWithFirestore = useRef(false);

  // 1. Phục hồi và đồng bộ danh sách yêu thích khi User thay đổi (Login / Logout / Khởi động)
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | undefined;
    let isCancelled = false;

    const initWishlist = async () => {
      if (currentUid) {
        // --- NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP ---
        const cacheKey = getWishlistStorageKey(currentUid);
        try {
          // A. Tải nhanh từ AsyncStorage cache để hiển thị tức thì
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && !isCancelled) {
            setFavorites(JSON.parse(cached));
          }

          // B. Kiểm tra xem có danh sách yêu thích từ phiên khách trước đó không để tự động gộp (merge)
          let guestFavs: string[] = [];
          const guestCached = await AsyncStorage.getItem(STORAGE_KEY_GUEST);
          if (guestCached) {
            try {
              guestFavs = JSON.parse(guestCached) || [];
            } catch {}
          }

          // C. Lắng nghe Realtime từ Firestore collection `favorites/{uid}` (Đồng bộ trực tiếp 2 chiều với Web)
          const favRef = doc(db, 'favorites', currentUid);
          unsubscribeFirestore = onSnapshot(favRef, async (snap) => {
            if (isCancelled) return;
            let firestoreFavs: string[] = [];
            if (snap.exists()) {
              firestoreFavs = snap.data()?.productIds || [];
            }

            // Nếu có guestFavs chưa lưu, tiến hành gộp vào Firestore
            if (guestFavs.length > 0) {
              const merged = Array.from(new Set([...firestoreFavs, ...guestFavs]));
              guestFavs = [];
              await AsyncStorage.removeItem(STORAGE_KEY_GUEST).catch(() => {});
              isSyncingWithFirestore.current = true;
              await setDoc(favRef, { productIds: merged, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
              isSyncingWithFirestore.current = false;
              firestoreFavs = merged;
            }

            setFavorites(firestoreFavs);
            await AsyncStorage.setItem(cacheKey, JSON.stringify(firestoreFavs)).catch(() => {});
          });
        } catch (e) {
          console.warn('Lỗi khởi tạo wishlist Firestore:', e);
        }
      } else {
        // --- KHÁCH CHƯA ĐĂNG NHẬP ---
        try {
          const guestCached = await AsyncStorage.getItem(STORAGE_KEY_GUEST);
          if (!isCancelled) {
            setFavorites(guestCached ? JSON.parse(guestCached) : []);
          }
        } catch (e) {
          console.warn('Lỗi đọc wishlist khách:', e);
          if (!isCancelled) setFavorites([]);
        }
      }
    };

    initWishlist();

    return () => {
      isCancelled = true;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [currentUid]);

  // 2. Hàm Toggle yêu thích: Cập nhật state, AsyncStorage và đẩy trực tiếp lên Firestore `favorites/{uid}`
  const toggleFavorite = async (productId: string) => {
    if (!productId) return;

    const nextFavorites = favorites.includes(productId)
      ? favorites.filter((id) => id !== productId)
      : [...favorites, productId];

    // Cập nhật State tức thì để giao diện phản hồi mượt mà
    setFavorites(nextFavorites);

    try {
      if (currentUid) {
        // Lưu cache local theo tài khoản
        const cacheKey = getWishlistStorageKey(currentUid);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(nextFavorites));

        // Lưu lên Firestore `favorites/{uid}` (Đồng bộ đồng nhất với Web)
        const favRef = doc(db, 'favorites', currentUid);
        await setDoc(
          favRef,
          {
            productIds: nextFavorites,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        // Lưu cache khách
        await AsyncStorage.setItem(STORAGE_KEY_GUEST, JSON.stringify(nextFavorites));
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ yêu thích lên Firestore:', err);
    }
  };

  const isFavorite = (productId: string) => favorites.includes(productId);

  return (
    <WishlistContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => useContext(WishlistContext);

