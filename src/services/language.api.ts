import { Locale } from '@/lib/i18n/config';

export const languageApi = {
  async getSavedLanguage(): Promise<{ data: Locale; error: string | null }> {
    try {
      const res = await fetch('/api/user/language');
      const json = await res.json();
      if (!res.ok || !json.success) return { data: 'en', error: json.error || 'Failed to load language' };
      return { data: json.data?.language as Locale || 'en', error: null };
    } catch (err: any) {
      return { data: 'en', error: err.message || 'Network error' };
    }
  },

  async updateLanguage(language: Locale): Promise<{ success: boolean; error: string | null }> {
    try {
      const res = await fetch('/api/user/language', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      });
      const json = await res.json();
      if (!res.ok || !json.success) return { success: false, error: json.error || 'Failed to update language' };
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }
};
