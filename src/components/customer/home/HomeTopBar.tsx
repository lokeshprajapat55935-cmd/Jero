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
  const [locationName, setLocationName] = useState<string>('Bhilwara, Rajasthan');

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

    // Geolocation Resolution Logic
    if (profile?.location_name) {
      setLocationName(profile.location_name);
    } else if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          if (isMounted) {
            setLocationName('Bhilwara, Rajasthan');
          }
        },
        (error) => {
          if (isMounted) {
            // GPS unavailable / Denied
            setLocationName('Select Location');
          }
        },
        { timeout: 3000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    } else {
      setLocationName('Select Location');
    }

    return () => {
      isMounted = false;
    };
  }, [profile?.location_name]);

  return (
    <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-100 shadow-sm">
      {/* Location (Left) */}
      <div 
        className="flex items-center gap-2 max-w-[60%] cursor-pointer active:scale-95 transition-transform"
        onClick={() => {/* TODO: Open location picker */}}
      >
        <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 border border-blue-100/50">
          <MapPin size={18} className="text-blue-600" />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider leading-none mb-0.5">
            Current Location
          </span>
          <span className="text-sm font-black text-gray-900 truncate leading-tight">
            {locationName}
          </span>
        </div>
      </div>

      {/* Actions (Right) */}
      <div className="flex items-center gap-3">
        {/* Wallet Preview */}
        <button 
          onClick={() => router.push('/wallet')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all"
        >
          <Wallet size={14} className="text-indigo-600" />
          <span className="text-xs font-black text-gray-800">
            ₹{balance !== null ? balance.toFixed(0) : '0'}
          </span>
        </button>

        {/* Notifications */}
        <button 
          onClick={() => router.push('/notifications')}
          className="relative w-9 h-9 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 flex items-center justify-center active:scale-95 transition-all"
        >
          <Bell size={16} className="text-gray-700" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border border-white" />
          )}
        </button>
      </div>
    </div>
  );
}

