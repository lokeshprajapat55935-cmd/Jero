import React from 'react';
import { CustomerSettings } from '@/services/profile.api';
import { Bell, ChevronRight, Globe, HelpCircle, LogOut, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/providers/UserProvider';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useI18n } from '@/providers/I18nProvider';

interface SettingsSectionProps {
  settings: CustomerSettings | null;
  isLoading: boolean;
}

export function SettingsSection({ settings, isLoading }: SettingsSectionProps) {
  const { logout } = useUser();
  const router = useRouter();
  const { t, locale } = useI18n();

  if (isLoading) {
    return (
      <div className="bg-white p-4">
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-10 w-full mb-2" />
        <Skeleton className="h-10 w-full mb-2" />
      </div>
    );
  }

  const handleLogout = async () => {
    toast.loading(t('settings.loggingOut'), { id: 'logout' });
    try {
      await logout();
      toast.success(t('settings.logoutSuccess'), { id: 'logout' });
    } catch (err) {
      toast.error(t('settings.logoutFailed'), { id: 'logout' });
    }
  };

  return (
    <div className="bg-white py-2 mb-20 border-y border-gray-100">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {t('settings.title')}
      </div>

      <div className="flex flex-col">
        {/* Settings Links */}
        <div 
          onClick={() => router.push('/profile/settings')}
          className="flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-900 font-medium">{t('common.notifications')}</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>

        <div 
          onClick={() => router.push('/profile/settings')}
          className="flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer border-t border-gray-50"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-900 font-medium">{t('common.language')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium uppercase">
              {locale === 'hi' ? t('common.hindi') : t('common.english')}
            </span>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </div>
        </div>

        <div 
          onClick={() => router.push('/profile/privacy-security')}
          className="flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer border-t border-gray-50"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-900 font-medium">{t('profilePage.privacy')}</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>

        {/* Support Link */}
        <div 
          onClick={() => router.push('/profile/help-support')}
          className="flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer border-t-8 border-gray-50"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-blue-500 shrink-0" />
            <span className="text-sm text-gray-900 font-medium">{t('common.help')}</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>

        {/* Logout */}
        <div 
          onClick={handleLogout}
          className="flex items-center justify-between px-4 py-4 active:bg-red-50 transition-colors cursor-pointer border-t border-gray-50"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-5 h-5 text-red-500 shrink-0" />
            <span className="text-sm text-red-600 font-medium">{t('common.logout')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
