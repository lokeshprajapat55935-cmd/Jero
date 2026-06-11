'use client';

import React from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationCard } from './NotificationCard';
import { Bell, CheckCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/providers/I18nProvider';

export function NotificationPanel() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="divide-y divide-gray-50">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 flex gap-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col max-h-[80vh]">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white z-10">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">{t('common.notifications')}</h2>
          {unreadCount > 0 && (
            <span className="bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs font-bold">
              {unreadCount} {t('notification.unread')}
            </span>
          )}
        </div>
        
        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            {t('notification.markAllRead')}
          </button>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length > 0 ? (
          <div className="flex flex-col">
            {notifications.map((notification) => (
              <NotificationCard 
                key={notification.id} 
                notification={notification} 
                onMarkRead={markAsRead}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">{t('notification.emptyTitle')}</h3>
            <p className="text-sm max-w-[250px]">{t('notification.emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
