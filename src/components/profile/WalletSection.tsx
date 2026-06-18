import React from 'react';
import { CustomerWallet } from '@/services/profile.api';
import { ChevronRight, CreditCard, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

interface WalletSectionProps {
  wallet: CustomerWallet | null;
  isLoading: boolean;
}

export function WalletSection({ wallet, isLoading }: WalletSectionProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="bg-white p-4 my-2 border-y border-gray-100">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency === 'INR' ? '₹' : (wallet?.currency || '₹');

  return (
    <div className="bg-white py-2 my-2 border-y border-gray-100">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Payments & Wallet
      </div>

      <div className="px-4 py-2">
        <div 
          onClick={() => router.push('/wallet')}
          className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-center justify-between active:bg-gray-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg text-green-700">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium mb-0.5">Jero Cash</p>
              <p className="text-lg font-bold text-gray-900 leading-none">
                {currency}{balance.toFixed(2)}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      <div 
        onClick={() => {}} // Add payment methods route
        className="flex items-center justify-between px-4 py-4 mt-2 active:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="text-sm text-gray-900 font-medium">Payment Methods</span>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-300" />
      </div>
    </div>
  );
}
