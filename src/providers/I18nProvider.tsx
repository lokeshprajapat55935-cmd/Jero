"use client";

import React, { useCallback, useEffect } from "react";
import { DEFAULT_LOCALE, isLocale, Locale } from "@/lib/i18n/config";
import { getMessages, messages } from "@/lib/i18n/messages";
import { useUser } from "@/providers/UserProvider";
import { languageApi } from "@/services/language.api";

const STORAGE_KEY = "zolvo-locale";

type TranslationValues = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: TranslationValues) => string;
  categoryName: (category: string) => string;
  dayName: (day: string) => string;
};

const I18nContext = React.createContext<I18nContextValue | undefined>(undefined);

function getNestedValue(source: any, key: string): string | undefined {
  return key.split(".").reduce((acc, part) => acc?.[part], source);
}

function interpolate(value: string, params?: TranslationValues) {
  if (!params) return value;
  return Object.entries(params).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
    value
  );
}

function persistLocaleLocally(locale: Locale) {
  if (typeof window === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.cookie = `zolvo-locale=${locale};path=/;max-age=31536000;SameSite=Lax`;
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);
  const { user } = useUser();

  // Try to load from local storage initially to prevent flicker
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored) && stored !== locale) {
        setLocaleState(stored);
        persistLocaleLocally(stored);
      }
    }
  }, []);

  // Fetch from DB if user is logged in
  useEffect(() => {
    if (user && user.id && user.id !== 'undefined') {
      languageApi.getSavedLanguage().then((res) => {
        if (res.data && isLocale(res.data) && res.data !== locale) {
          setLocaleState(res.data);
          persistLocaleLocally(res.data);
        }
      });
    }
  }, [user]);

  const value = React.useMemo<I18nContextValue>(() => {
    const currentMessages = getMessages(locale);

    return {
      locale,
      setLocale(localeValue) {
        // Optimistic instant UI update
        setLocaleState(localeValue);
        persistLocaleLocally(localeValue);
        
        // Persist to DB asynchronously if logged in
        if (user && user.id && user.id !== 'undefined') {
          languageApi.updateLanguage(localeValue).catch(console.error);
        }
      },
      t(key, values) {
        const translated = getNestedValue(currentMessages, key) ?? getNestedValue(messages.en, key) ?? key;
        return interpolate(String(translated), values);
      },
      categoryName(category) {
        return getNestedValue(currentMessages, `categories.${category}`) ?? category;
      },
      dayName(day) {
        return getNestedValue(currentMessages, `days.${day}`) ?? day;
      },
    };
  }, [locale, user]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
