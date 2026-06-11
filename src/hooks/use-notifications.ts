import { useNotificationContext } from '@/providers/NotificationProvider';

export const useNotifications = (userId?: string) => {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refetch } = useNotificationContext();
  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refetch };
};
