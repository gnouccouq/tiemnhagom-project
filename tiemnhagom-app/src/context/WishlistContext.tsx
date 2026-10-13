// src/context/WishlistContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

interface WishlistContextType {
  favorites: string[]; // List of product IDs
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
}

const getWishlistStorageKey = (uid: string) => `@tiemnhagom_wishlist_${uid}`;
const WishlistContext = createContext<WishlistContextType>({} as WishlistContextType);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const currentUid = user?.uid || 'guest';
  const loadedUserRef = useRef<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>([]);

  // Load wishlist from storage whenever user changes
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      try {
        const key = getWishlistStorageKey(currentUid);
        const stored = await AsyncStorage.getItem(key);
        if (!isCancelled) {
          if (stored) {
            setFavorites(JSON.parse(stored));
          } else {
            setFavorites([]);
          }
          loadedUserRef.current = currentUid;
        }
      } catch (e) {
        console.warn('Lỗi đọc wishlist từ AsyncStorage:', e);
        if (!isCancelled) {
          setFavorites([]);
          loadedUserRef.current = currentUid;
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [currentUid]);

  // Save wishlist to storage whenever it changes, but ONLY for currently loaded user
  useEffect(() => {
    if (loadedUserRef.current !== currentUid) return;
    (async () => {
      try {
        const key = getWishlistStorageKey(currentUid);
        await AsyncStorage.setItem(key, JSON.stringify(favorites));
      } catch (e) {
        console.warn('Lỗi lưu wishlist vào AsyncStorage:', e);
      }
    })();
  }, [favorites, currentUid]);

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const isFavorite = (productId: string) => favorites.includes(productId);

  return (
    <WishlistContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => useContext(WishlistContext);

