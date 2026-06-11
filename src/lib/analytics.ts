import logger from '@/lib/logger';

export const analytics = {
  async track(eventName: string, properties: Record<string, unknown> = {}) {
    try {
      // 1. Log to console in dev mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ANALYTICS] Event: ${eventName}`, properties);
      }

      // 2. Resolve anonymous ID from localStorage (or create one)
      let anonymousId = '';
      if (typeof window !== 'undefined') {
        anonymousId = localStorage.getItem('zolvo_anon_id') || '';
        if (!anonymousId) {
          anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('zolvo_anon_id', anonymousId);
        }
      }

      // 3. Post to the centralized API route
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          properties,
          anonymousId,
        }),
      });
    } catch (error) {
      // Silent — analytics failures must never interrupt the user flow
      logger.warn('Analytics tracking error (non-fatal)', { eventName, error });
    }
  }
};
