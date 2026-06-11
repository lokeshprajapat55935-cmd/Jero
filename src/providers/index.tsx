'use client';

import React from 'react';
import { ThemeProvider } from './ThemeProvider';
import { UserProvider } from './UserProvider';
import { I18nProvider } from './I18nProvider';
import { CityProvider } from './CityProvider';
import { NotificationProvider } from './NotificationProvider';
import { Toaster } from "@/components/ui/toaster";
import type { Locale } from '@/lib/i18n/config';

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  return (
    <ThemeProvider>
      <UserProvider>
        <I18nProvider initialLocale={initialLocale}>
          <CityProvider>
            <NotificationProvider>
              {children}
              <Toaster />
            </NotificationProvider>
          </CityProvider>
        </I18nProvider>
      </UserProvider>
    </ThemeProvider>
  );
}
