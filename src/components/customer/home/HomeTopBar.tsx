import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Bell, Wallet } from 'lucide-react';
import { useUser } from '@/providers/UserProvider';
import { useNotificationContext } from '@/providers/NotificationProvider';

export function HomeTopBar() {
  const router = useRouter();
  const { profile } = useUser();
  const { unreadCount } = useNotificationContext();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    async function fetchWallet() {
      try {
        const response = await fetch('/api/customer/wallet', {
          signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        if (isMounted && result.success && result.data) {
          setBalance(result.data.balance);
        }
      } catch (err) {
        console.error("HomeTopBar wallet fetch error:", err);
        if (isMounted && retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchWallet, 2000 * retryCount);
        }
      }
    }
    fetchWallet();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-100/50">
      {/* Location (Left) */}
      <div 
        className="flex items-center gap-1.5 max-w-[60%] cursor-pointer active:scale-95 transition-transform"
        onClick={() => {/* TODO: Open location picker */}}
      >
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
          <MapPin size={16} className="text-blue-600" />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Your Location</span>
          <span className="text-sm font-black text-gray-900 truncate">
            {profile?.location_name || 'Detecting location...'}
          </span>
        </div>
      </div>

      {/* Actions (Right) */}
      <div className="flex items-center gap-3">
        {/* Wallet Preview */}
        <button 
          onClick={() => router.push('/wallet')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm active:scale-95 transition-transform"
        >
          <Wallet size={14} className="text-indigo-600" />
          <span className="text-xs font-bold text-gray-800">
            ₹{balance !== null ? balance.toFixed(0) : '0'}
          </span>
        </button>

        {/* Notifications */}
        <button 
          onClick={() => router.push('/notifications')}
          className="relative w-10 h-10 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center active:scale-95 transition-transform"
        >
          <Bell size={18} className="text-gray-700" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border border-white" />
          )}
        </button>
      </div>
    </div>
  );
}
