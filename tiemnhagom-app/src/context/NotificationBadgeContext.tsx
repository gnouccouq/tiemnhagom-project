// src/context/NotificationBadgeContext.tsx
import React, { createContext, useContext, useState } from 'react';

interface NotificationBadgeContextType {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

const NotificationBadgeContext = createContext<NotificationBadgeContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
});

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  return (
    <NotificationBadgeContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </NotificationBadgeContext.Provider>
  );
}

export function useNotificationBadge() {
  return useContext(NotificationBadgeContext);
}
