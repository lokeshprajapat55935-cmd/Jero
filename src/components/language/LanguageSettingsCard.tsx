'use client';

import React from 'react';
import { useI18n } from '@/providers/I18nProvider';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localeLabels, Locale } from '@/lib/i18n/config';

export function LanguageSettingsCard() {
  const { locale, setLocale, t } = useI18n();

  const handleLanguageChange = (newLocale: Locale) => {
    if (newLocale !== locale) {
      setLocale(newLocale);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
          <Globe className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{t('common.language')}</h2>
      </div>

      <div className="flex flex-col gap-3">
        {(Object.keys(localeLabels) as Locale[]).map((loc) => {
          const isSelected = locale === loc;
          const { native, english } = localeLabels[loc];

          return (
            <div
              key={loc}
              onClick={() => handleLanguageChange(loc)}
              className={cn(
                "flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.98]",
                isSelected 
                  ? "border-blue-600 bg-blue-50/30" 
                  : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
              )}
            >
              <div className="flex flex-col">
                <span className={cn(
                  "text-base font-bold",
                  isSelected ? "text-blue-900" : "text-gray-900"
                )}>
                  {native}
                </span>
                <span className={cn(
                  "text-sm",
                  isSelected ? "text-blue-600" : "text-gray-500"
                )}>
                  {english}
                </span>
              </div>

              {/* Custom Radio Button UI */}
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                isSelected ? "border-blue-600" : "border-gray-300"
              )}>
                {isSelected && <div className="w-3 h-3 bg-blue-600 rounded-full" />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
