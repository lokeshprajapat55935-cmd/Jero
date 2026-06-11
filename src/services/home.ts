import logger from '@/lib/logger';
import type { ServiceCategory } from '@/types';

export interface RecommendedWorker {
  id: string;
  name: string;
  category: string;
  price: number;
  experience: number;
  rating: number;
  reviews: number;
  avatar_url: string | null;
  location: string;
}

export interface ActiveBookingPreview {
  id: string;
  status: string;
  category: string;
  price: number;
  scheduled_at: string;
  worker: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 2): Promise<Response> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Simple backoff
      }
    }
  }
  throw lastError;
}

export const homeService = {
  async getCategories(): Promise<ServiceCategory[]> {
    try {
      const response = await fetchWithRetry('/api/categories', {
        next: { revalidate: 300 } as any
      });
      const result = await response.json();
      return result.data?.categories || [];
    } catch (error) {
      logger.error('homeService.getCategories error', error);
      throw error;
    }
  },

  async getRecommendations(): Promise<RecommendedWorker[]> {
    try {
      const response = await fetchWithRetry('/api/recommendations', {
        next: { revalidate: 120 } as any
      });
      const result = await response.json();
      return result.data?.recommendations || [];
    } catch (error) {
      logger.error('homeService.getRecommendations error', error);
      throw error;
    }
  },

  async getActiveBooking(): Promise<ActiveBookingPreview | null> {
    try {
      // Don't cache active bookings aggressively
      const response = await fetchWithRetry('/api/client/active-booking', {
        cache: 'no-store' 
      });
      const result = await response.json();
      return result.data?.booking || null;
    } catch (error) {
      logger.error('homeService.getActiveBooking error', error);
      throw error;
    }
  }
};
