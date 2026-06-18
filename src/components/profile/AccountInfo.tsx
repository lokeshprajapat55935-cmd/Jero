import React from 'react';
import { CustomerProfile } from '@/services/profile.api';
import { CheckCircle2, AlertTriangle, Calendar, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

interface AccountInfoProps {
  profile: CustomerProfile | null;
}

export function AccountInfo({ profile }: AccountInfoProps) {
  if (!profile) return null;

  const memberSince = profile.created_at ? format(new Date(profile.created_at), 'MMM yyyy') : 'Unknown';
  
  return (
    <div className="bg-white mx-4 mt-4 p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4">
      
      <div className="flex items-center justify-between border-b border-gray-50 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
            <CheckCircle2 size={16} className="text-blue-600" />
          </div>
          <span className="text-sm font-bold text-gray-700">Phone Verification</span>
        </div>
        <span className="text-xs font-black text-green-600 bg-green-50 px-2 py-1 rounded-md">Verified</span>
      </div>

      <div className="flex items-center justify-between border-b border-gray-50 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
            <ShieldCheck size={16} className="text-orange-600" />
          </div>
          <span className="text-sm font-bold text-gray-700">KYC Status</span>
        </div>
        {profile.kyc_status === 'verified' ? (
          <span className="text-xs font-black text-green-600 bg-green-50 px-2 py-1 rounded-md">Verified</span>
        ) : profile.kyc_status === 'pending' ? (
          <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">Pending</span>
        ) : profile.kyc_status === 'rejected' ? (
          <span className="text-xs font-black text-red-600 bg-red-50 px-2 py-1 rounded-md flex items-center gap-1">
            <AlertTriangle size={12} /> Rejected
          </span>
        ) : (
          <span className="text-xs font-black text-orange-600 bg-orange-50 px-2 py-1 rounded-md flex items-center gap-1">
            <AlertTriangle size={12} /> Action Required
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
            <Calendar size={16} className="text-gray-500" />
          </div>
          <span className="text-sm font-bold text-gray-700">Member Since</span>
        </div>
        <span className="text-sm font-bold text-gray-900">{memberSince}</span>
      </div>

    </div>
  );
}
