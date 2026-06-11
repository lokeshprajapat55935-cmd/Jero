'use client';

import React, { useEffect, useState } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, Clock, PlusCircle, AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUser } from '@/providers/UserProvider';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { useI18n } from '@/providers/I18nProvider';

export default function WalletPage() {
  const { user } = useUser();
  const router = useRouter();
  const { t } = useI18n();
  
  const [wallet, setWallet] = useState<{ balance: number; currency: string } | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    
    async function fetchWalletData() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/customer/wallet');
        
        // Safety check for network failure
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const result = await response.json();
        
        if (!isMounted) return;

        // If the API gracefully caught a failure
        if (!result.success) {
          setError(result.error || t('errors.somethingWrong'));
          // Fallback UI data
          setWallet({ balance: 0, currency: 'INR' });
          setTransactions([]);
          return;
        }

        // Successfully fetched wallet
        const walletData = result.data || { balance: 0, currency: 'INR' };
        setWallet(walletData);
        setTransactions(walletData.transactions || []);
        
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Wallet fetch crash prevented:", err);
        setError(t('errors.somethingWrong'));
        setWallet({ balance: 0, currency: 'INR' });
        setTransactions([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchWalletData();

    return () => {
      isMounted = false;
    };
  }, [user, t]);

  const handleAddMoney = () => {
    toast({
      title: t('wallet.comingSoon'),
      description: t('wallet.addMoneyDesc'),
    });
  };

  const handleWithdraw = () => {
    toast({
      title: t('wallet.comingSoon'),
      description: t('wallet.withdrawDesc'),
    });
  };

  // Safe fallback values for rendering
  const displayBalance = wallet?.balance ?? 0;
  const displayCurrency = wallet?.currency ?? '₹';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/50 pb-20 md:pb-0">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 p-4 flex items-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{t('wallet.title')}</h1>
      </div>

      <div className="flex-1 p-4 md:p-6 lg:max-w-4xl lg:mx-auto w-full space-y-6">
        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">{error}</p>
              <p className="text-xs text-red-500 mt-1">{t('wallet.fallbackNotice')}</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="text-red-700 p-1 hover:bg-red-100 rounded-md transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-green-600 to-emerald-800 text-white shadow-xl shadow-green-900/10 border-0 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Wallet className="w-32 h-32 transform rotate-12 translate-x-8 -translate-y-8" />
          </div>
          
          <div className="p-6 md:p-8 relative z-10">
            <p className="text-green-100 text-sm font-medium tracking-wide uppercase mb-1">{t('wallet.availableBalance')}</p>
            
            {loading ? (
              <div className="h-12 w-48 bg-white/20 animate-pulse rounded-lg mt-2 mb-6" />
            ) : (
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                {displayCurrency === 'INR' ? '₹' : displayCurrency}{displayBalance.toFixed(2)}
              </h2>
            )}

            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={handleAddMoney}
                className="bg-white text-green-700 hover:bg-green-50 shadow-sm border-0 font-semibold gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {t('wallet.addMoney')}
              </Button>
              <Button 
                onClick={handleWithdraw}
                variant="outline" 
                className="border-white/30 bg-white/10 hover:bg-white/20 text-white font-medium gap-2"
              >
                <ArrowUpRight className="w-4 h-4" />
                {t('wallet.withdraw')}
              </Button>
            </div>
          </div>
        </Card>

        {/* Transactions Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            {t('wallet.recentTransactions')}
          </h3>

          <Card className="border-gray-100 shadow-sm overflow-hidden bg-white">
            {loading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-gray-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-gray-100 rounded" />
                      <div className="h-3 w-20 bg-gray-50 rounded" />
                    </div>
                    <div className="h-4 w-16 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            ) : transactions.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {transactions.map((tx, idx) => (
                  <div key={tx.id || idx} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      tx.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {tx.type === 'credit' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {tx.description || (tx.type === 'credit' ? t('wallet.moneyAdded') : t('wallet.payment'))}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(tx.created_at).toLocaleDateString(undefined, { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        })}
                      </p>
                    </div>
                    <div className={`text-sm font-bold whitespace-nowrap ${
                      tx.type === 'credit' ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {tx.type === 'credit' ? '+' : '-'}₹{Number(tx.amount || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center text-gray-500 space-y-3">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-2">
                  <Wallet className="w-8 h-8 text-gray-300" />
                </div>
                <p className="font-medium text-gray-900">{t('wallet.noTransactions')}</p>
                <p className="text-sm max-w-[200px] leading-relaxed">{t('wallet.noTransactionsDesc')}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
