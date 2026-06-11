import logger from '@/lib/logger';

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Standard in-memory Cache Store implementation.
 * Fully swappable to Redis in enterprise deployments.
 */
class InMemoryCacheStore implements CacheStore {
  private cache = new Map<string, { data: any; expiry: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    if (item.expiry !== null && Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { data: value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

// Global cached store instance
let store: CacheStore;

export function getCacheStore(): CacheStore {
  if (!store) {
    // In production, you can check process.env.REDIS_URL to instantiate a RedisCacheStore
    if (process.env.REDIS_URL) {
      logger.info('Redis URL found, caching store can be connected to Redis client');
      // Redis instantiation goes here
    }
    store = new InMemoryCacheStore();
  }
  return store;
}
