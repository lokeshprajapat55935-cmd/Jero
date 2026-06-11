import React from 'react';
import { CustomerProfile } from '@/services/profile.api';
import { Edit2, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

interface ProfileHeaderProps {
  profile: CustomerProfile | null;
  isLoading: boolean;
  onEdit: () => void;
  isEditing?: boolean;
  editName?: string;
  setEditName?: (name: string) => void;
}

export function ProfileHeader({ 
  profile, 
  isLoading, 
  onEdit,
  isEditing = false,
  editName = '',
  setEditName
}: ProfileHeaderProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-4 p-4 md:p-6 bg-white border-b border-gray-100">
        <Skeleton className="w-16 h-16 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  const name = profile?.full_name || 'Customer';
  const phone = profile?.phone || 'Add phone number';
  const initial = (editName || name).charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-4 p-4 md:p-6 bg-white border-b border-gray-100">
      <div className="relative">
        {profile?.avatar_url ? (
          <img 
            src={profile.avatar_url} 
            alt={name} 
            className="w-16 h-16 rounded-full object-cover border border-gray-100 shadow-sm"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-700 shadow-sm">
            <span className="text-2xl font-semibold">{initial}</span>
          </div>
        )}
        {profile?.kyc_status === 'verified' && (
          <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isEditing && setEditName ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full text-base font-semibold text-gray-900 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Full Name"
            maxLength={100}
          />
        ) : (
          <h2 className="text-xl font-semibold text-gray-900 truncate tracking-tight">{name}</h2>
        )}
        <p className="text-sm text-gray-500 truncate mt-0.5">{phone}</p>
      </div>

      <div className="flex items-center gap-1">
        <NotificationCenter />
        {!isEditing && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onEdit}
            className="shrink-0 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full h-10 w-10"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
