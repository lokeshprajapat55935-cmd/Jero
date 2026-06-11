'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function NotificationBell({ className }: { className?: string }) {
  const { unreadCount } = useNotifications();
  const router = useRouter();

  return (
    <button 
      onClick={() => router.push('/profile/settings')}
      className={cn("relative p-2 rounded-full hover:bg-gray-100 transition-colors active:scale-95", className)}
    >
      <Bell className="w-6 h-6 text-gray-700" />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
