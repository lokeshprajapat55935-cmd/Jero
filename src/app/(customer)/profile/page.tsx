'use client';

import React, { useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { AccountSection } from '@/components/profile/AccountSection';
import { WalletSection } from '@/components/profile/WalletSection';
import { ActivitySection } from '@/components/profile/ActivitySection';
import { SettingsSection } from '@/components/profile/SettingsSection';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CustomerProfilePage() {
  const { profile, wallet, settings, activitySummary, isLoading, error, refetch, updateProfile } = useProfile();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleEditProfile = () => {
    if (profile) {
      setEditName(profile.full_name || '');
      setEditAddress(profile.address || '');
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setIsSaving(true);
    const success = await updateProfile({
      full_name: editName,
      address: editAddress
    });
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
      refetch();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100/60 pb-20 md:pb-0">
      
      {/* Fallback Banner for API Failures */}
      {error && !isLoading && (
        <div className="bg-red-50 border-b border-red-100 text-red-600 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">Failed to sync profile data</p>
            <p className="text-xs text-red-500 mt-0.5">Showing offline or fallback data.</p>
          </div>
          <button 
            onClick={refetch}
            className="text-red-700 p-1 hover:bg-red-100 rounded-md transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto flex flex-col">
        <ProfileHeader 
          profile={profile} 
          isLoading={isLoading} 
          onEdit={handleEditProfile} 
          isEditing={isEditing}
          editName={editName}
          setEditName={setEditName}
        />
        
        {isEditing && (
          <div className="flex justify-end gap-3 px-4 py-3 bg-white border-b border-gray-100">
            <button 
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || !editName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
        
        <AccountSection 
          profile={profile} 
          isLoading={isLoading} 
          isEditing={isEditing}
          editAddress={editAddress}
          setEditAddress={setEditAddress}
        />

        <WalletSection 
          wallet={wallet} 
          isLoading={isLoading} 
        />

        <ActivitySection 
          activity={activitySummary} 
          isLoading={isLoading} 
        />

        <SettingsSection 
          settings={settings} 
          isLoading={isLoading} 
        />
      </div>
    </div>
  );
}
