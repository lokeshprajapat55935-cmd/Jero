'use client';

import React from 'react';
import { Notification } from '@/services/notifications.api';
import { Bell, CalendarCheck, CreditCard, LifeBuoy, Settings, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface NotificationCardProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

export function NotificationCard({ notification, onMarkRead }: NotificationCardProps) {
  const router = useRouter();

  const getIconAndColor = (type: string) => {
    switch (type) {
      case 'booking':
      case 'booking_update':
        return { icon: CalendarCheck, bg: 'bg-blue-100', text: 'text-blue-600' };
      case 'payment':
        return { icon: CreditCard, bg: 'bg-green-100', text: 'text-green-600' };
      case 'support':
      case 'message':
        return { icon: LifeBuoy, bg: 'bg-amber-100', text: 'text-amber-600' };
      default:
        return { icon: Settings, bg: 'bg-gray-100', text: 'text-gray-600' };
    }
  };

  const { icon: Icon, bg, text } = getIconAndColor(notification.type);

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkRead(notification.id);
    }
    if (notification.link_url) {
      router.push(notification.link_url);
    }
  };

  const formattedDate = new Date(notification.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "group relative p-4 flex gap-4 cursor-pointer transition-colors active:bg-gray-50 border-b border-gray-50 last:border-0",
        !notification.is_read ? "bg-blue-50/30" : "bg-white"
      )}
    >
      {!notification.is_read && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-md" />
      )}
      
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1", bg, text)}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <h4 className={cn(
            "text-sm tracking-tight truncate",
            !notification.is_read ? "font-bold text-gray-900" : "font-semibold text-gray-700"
          )}>
            {notification.title}
          </h4>
          <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap pt-0.5">
            {formattedDate}
          </span>
        </div>
        
        <p className={cn(
          "text-sm leading-snug line-clamp-2",
          !notification.is_read ? "text-gray-700" : "text-gray-500"
        )}>
          {notification.content}
        </p>

        {notification.link_url && (
          <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
            View details <ArrowRight className="w-3 h-3" />
          </div>
        )}
      </div>
    </div>
  );
}
