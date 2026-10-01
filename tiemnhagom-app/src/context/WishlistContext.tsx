// src/context/WishlistContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WishlistContextType {
  favorites: string[]; // List of product IDs
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
}

const WISHLIST_STORAGE_KEY = '@tiemnhagom_wishlist_v1';
const WishlistContext = createContext<WishlistContextType>({} as WishlistContextType);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(WISHLIST_STORAGE_KEY);
        if (stored) {
          setFavorites(JSON.parse(stored));
        }
      } catch (e) {
        console.warn('Lỗi đọc wishlist:', e);
      }
    })();
  }, []);

  const toggleFavorite = async (productId: string) => {
    setFavorites((prev) => {
      let updated: string[];
      if (prev.includes(productId)) {
        updated = prev.filter((id) => id !== productId);
      } else {
        updated = [...prev, productId];
      }
      AsyncStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(updated)).catch(console.warn);
      return updated;
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
