import React, { useState } from 'react';
import { CustomerProfile } from '@/services/profile.api';
import { Gift, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ReferralCardProps {
  profile: CustomerProfile | null;
}

export function ReferralCard({ profile }: ReferralCardProps) {
  const [copied, setCopied] = useState(false);

  if (!profile) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(profile.referral_code);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const text = `Join Zolvo using my referral code ${profile.referral_code} and get a discount on your first booking!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 mx-4 mt-6 p-5 rounded-3xl shadow-md flex flex-col gap-4 relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute -top-10 -right-10 opacity-10">
        <Gift size={120} />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1">
          <Gift size={20} className="text-blue-200" />
          <h3 className="text-white font-black text-lg">Refer & Earn</h3>
        </div>
        <p className="text-blue-100 text-xs font-medium max-w-[200px]">
          Invite your friends to Zolvo and earn ₹100 in your wallet for every successful booking.
        </p>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-1 pl-4 flex items-center justify-between border border-white/20 relative z-10 mt-2">
        <span className="font-black text-white tracking-widest">{profile.referral_code}</span>
        <div className="flex gap-1">
          <button 
            onClick={handleCopy}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            {copied ? <CheckCircle2 size={16} className="text-green-300" /> : <Copy size={16} />}
          </button>
          <button 
            onClick={handleShare}
            className="px-4 py-2 bg-white text-blue-700 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-transform"
          >
            Share
          </button>
        </div>
      </div>

    </div>
  );
}
