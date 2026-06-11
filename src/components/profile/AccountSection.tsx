import React from 'react';
import { CustomerProfile } from '@/services/profile.api';
import { Mail, Phone, Shield, ShieldAlert, ShieldCheck, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface AccountSectionProps {
  profile: CustomerProfile | null;
  isLoading: boolean;
  isEditing?: boolean;
  editAddress?: string;
  setEditAddress?: (address: string) => void;
}

export function AccountSection({ 
  profile, 
  isLoading,
  isEditing = false,
  editAddress = '',
  setEditAddress
}: AccountSectionProps) {
  if (isLoading) {
    return (
      <div className="bg-white p-4">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-4">
          <div className="flex gap-3"><Skeleton className="h-5 w-5 rounded" /><Skeleton className="h-5 w-48" /></div>
          <div className="flex gap-3"><Skeleton className="h-5 w-5 rounded" /><Skeleton className="h-5 w-40" /></div>
        </div>
      </div>
    );
  }

  const email = profile?.email || 'No email added';
  const phone = profile?.phone || 'No phone number';
  const kycStatus = profile?.kyc_status || 'unverified';

  return (
    <div className="bg-white py-2">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Account Information
      </div>
      
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
          <Phone className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 font-medium truncate">{phone}</p>
            <p className="text-xs text-gray-500">Primary phone number</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
          <Mail className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 font-medium truncate">{email}</p>
            <p className="text-xs text-gray-500">Email address</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
          <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            {isEditing && setEditAddress ? (
              <textarea
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="w-full text-sm font-medium text-gray-900 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Service address"
                rows={2}
                maxLength={300}
              />
            ) : (
              <p className="text-sm text-gray-900 font-medium truncate">{profile?.address || 'No address added'}</p>
            )}
            <p className="text-xs text-gray-500">Service address</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
          {kycStatus === 'verified' ? (
            <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
          ) : kycStatus === 'pending' ? (
            <Shield className="w-5 h-5 text-amber-500 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          )}
          
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 font-medium capitalize">
              {kycStatus} Account
            </p>
            <p className="text-xs text-gray-500">
              {kycStatus === 'verified' 
                ? 'Your identity is fully verified.' 
                : 'Complete verification for full access.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
