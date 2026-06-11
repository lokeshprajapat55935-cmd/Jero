'use client';

import React from 'react';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { LanguageSettingsCard } from '@/components/language/LanguageSettingsCard';
import { ArrowLeft, HeadphonesIcon, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/providers/I18nProvider';

export default function SettingsAndSupportPage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex flex-col min-h-screen bg-gray-100/60 pb-20 md:pb-0">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="shrink-0 -ml-2 text-gray-500 hover:text-gray-900 rounded-full h-10 w-10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">{t('settings.title')}</h1>
      </div>

      <div className="w-full max-w-2xl mx-auto p-4 flex flex-col gap-6 mt-2">
        {/* Real-time Notifications Section */}
        <section>
          <NotificationPanel />
        </section>

        {/* Language Selection Section */}
        <LanguageSettingsCard />

        {/* Support System Placeholder */}
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-amber-100 text-amber-700 p-2 rounded-lg">
              <HeadphonesIcon className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{t('settings.supportTitle')}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            {t('settings.supportDesc')}
          </p>
          <Button 
            variant="outline" 
            className="w-full justify-center"
            onClick={() => router.push('/profile/help-support')}
          >
            {t('settings.contactSupport')}
          </Button>
        </section>
      </div>
    </div>
  );
}
