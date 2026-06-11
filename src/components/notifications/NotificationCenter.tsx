'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, CheckCheck, CalendarCheck, CreditCard, 
  LifeBuoy, Settings, ArrowRight, Loader2
} from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function NotificationCenter() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();
  const router = useRouter();
  const { t } = useI18n();

  const getIconAndColor = (type: string) => {
    switch (type) {
      case 'booking':
      case 'booking_update':
      case 'booking_request':
      case 'booking_request_cancelled':
      case 'emergency_request':
      case 'emergency_request_cancelled':
        return { icon: CalendarCheck, bg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'payment':
        return { icon: CreditCard, bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' };
      case 'support':
      case 'message':
        return { icon: LifeBuoy, bg: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' };
      default:
        return { icon: Settings, bg: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
    }
  };

  const handleNotificationClick = async (id: string, linkUrl?: string) => {
    await markAsRead(id);
    if (linkUrl) {
      router.push(linkUrl);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 active:scale-95 text-gray-700 dark:text-gray-300 focus:outline-none"
          aria-label="Open notifications"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        align="end" 
        className="w-[calc(100vw-2rem)] sm:w-96 p-0 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-2xl bg-white dark:bg-gray-900 overflow-hidden z-50 animate-in fade-in-50 zoom-in-95 duration-150"
      >
        {/* Dropdown Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-lg text-gray-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 py-0.5 px-2.5 rounded-full text-xs font-black">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button 
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
              className="text-xs font-extrabold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 transition-colors focus:outline-none"
            >
              <CheckCheck className="w-4 h-4" />
              {t("notification.markAllRead") || 'Mark all read'}
            </button>
          )}
        </div>

        {/* Dropdown Body - Notifications List */}
        <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
              <p className="text-sm text-gray-500 font-medium">Loading notifications...</p>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map((n) => {
              const { icon: Icon, bg } = getIconAndColor(n.type);
              return (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id, n.link_url)}
                  className={cn(
                    "w-full cursor-pointer p-4 flex gap-3 text-left focus:bg-gray-50/70 dark:focus:bg-gray-800/40 outline-none transition-colors border-0 select-none relative group",
                    !n.is_read ? "bg-blue-50/20 dark:bg-blue-900/10" : ""
                  )}
                >
                  {/* Unread indicator bar */}
                  {!n.is_read && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-md" />
                  )}

                  {/* Icon */}
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-105", bg)}>
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Text Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-0.5">
                      <h4 className={cn(
                        "text-sm tracking-tight truncate leading-tight pr-2",
                        !n.is_read ? "font-black text-gray-900 dark:text-white" : "font-bold text-gray-700 dark:text-gray-300"
                      )}>
                        {n.title}
                      </h4>
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 whitespace-nowrap pt-0.5">
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs leading-normal line-clamp-2",
                      !n.is_read ? "font-semibold text-gray-800 dark:text-gray-200" : "font-medium text-gray-500 dark:text-gray-400"
                    )}>
                      {n.content}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-gray-300 dark:text-gray-600" />
              </div>
              <h4 className="text-sm font-black text-gray-900 dark:text-white mb-0.5">No notifications</h4>
              <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[200px]">
                {t("notification.emptyHint") || 'Booking updates will appear here.'}
              </p>
            </div>
          )}
        </div>

        {/* Dropdown Footer */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 text-center">
          <button
            onClick={() => router.push('/profile/settings')}
            className="text-xs font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 inline-flex items-center gap-1 hover:translate-x-0.5 transition-all focus:outline-none"
          >
            View settings
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
