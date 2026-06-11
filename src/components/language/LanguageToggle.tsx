'use client';

import React from 'react';
import { useI18n } from '@/providers/I18nProvider';
import { localeLabels, Locale } from '@/lib/i18n/config';

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  const toggleLanguage = () => {
    // Simple toggle between EN and HI
    const nextLocale: Locale = locale === 'en' ? 'hi' : 'en';
    setLocale(nextLocale);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center text-sm font-bold bg-white/50 backdrop-blur-md border border-gray-200 rounded-full overflow-hidden transition-all hover:bg-gray-50 active:scale-95 shadow-sm"
    >
      <div className={`px-2.5 py-1.5 transition-colors ${locale === 'en' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
        {localeLabels['en'].short}
      </div>
      <div className={`px-2.5 py-1.5 transition-colors ${locale === 'hi' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
        {localeLabels['hi'].short}
      </div>
    </button>
  );
}
