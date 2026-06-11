export const LOCALES = ['en', 'hi'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const localeLabels: Record<Locale, { native: string; english: string; short: string }> = {
  en: { native: 'English', english: 'English', short: 'EN' },
  hi: { native: 'हिन्दी', english: 'Hindi', short: 'हि' },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}
