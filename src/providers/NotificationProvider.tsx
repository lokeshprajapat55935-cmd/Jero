'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Notification, notificationsApi } from '@/services/notifications.api';
import { useUser } from '@/providers/UserProvider';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInitialData = useCallback(async () => {
    if (!user || !user.uid || user.uid === 'undefined') {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [notifRes, countRes] = await Promise.all([
      notificationsApi.getNotifications(50, 0),
      notificationsApi.getUnreadCount()
    ]);

    setNotifications(notifRes.data || []);
    setUnreadCount(countRes.data || 0);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchInitialData();

    if (!user || !user.uid || user.uid === 'undefined') return;

    const supabase = createClient();

    // Real-time subscription
    const channel = supabase
      .channel(`notifications:${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.uid}`,
        },
        (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') {
            setNotifications((prev) => [newRow as Notification, ...prev]);
            setUnreadCount((prev) => prev + 1);
          } else if (eventType === 'UPDATE') {
            setNotifications((prev) =>
              prev.map((n) => (n.id === newRow.id ? (newRow as Notification) : n))
            );
            if (oldRow.is_read === false && newRow.is_read === true) {
              setUnreadCount((prev) => Math.max(0, prev - 1));
            } else if (oldRow.is_read === true && newRow.is_read === false) {
              setUnreadCount((prev) => prev + 1);
            }
          } else if (eventType === 'DELETE') {
            setNotifications((prev) => prev.filter((n) => n.id !== oldRow.id));
            if (!oldRow.is_read) {
              setUnreadCount((prev) => Math.max(0, prev - 1));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchInitialData]);

  const markAsRead = async (id: string) => {
    // Optimistic UI update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await notificationsApi.markAsRead(id);
  };

  const markAllAsRead = async () => {
    // Optimistic UI update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await notificationsApi.markAllAsRead();
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      isLoading,
      markAsRead,
      markAllAsRead,
      refetch: fetchInitialData
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
}
