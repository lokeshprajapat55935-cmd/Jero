import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import logger from '@/lib/logger';

interface SubscriptionConfig {
  channelName: string;
  event: string;
  schema: string;
  table: string;
  filter?: string;
  callback: (payload: any) => void;
}

/**
 * Enterprise Realtime Socket Connection Manager.
 * Pools duplicate subscriptions and handles connection cleanups.
 */
class RealtimeSubscriptionPoolManager {
  private activePools = new Map<string, { channel: RealtimeChannel; listeners: Set<(payload: any) => void> }>();

  subscribe(config: SubscriptionConfig): () => void {
    const poolKey = `${config.channelName}:${config.event}:${config.schema}:${config.table}:${config.filter || '*'}`;
    
    // Check if channel is already active in pool
    let activePool = this.activePools.get(poolKey);
    
    if (!activePool) {
      const supabase = createClient();
      
      const channel = supabase.channel(config.channelName);
      const listeners = new Set<(payload: any) => void>();
      
      channel
        .on(
          'postgres_changes' as any,
          {
            event: config.event,
            schema: config.schema,
            table: config.table,
            filter: config.filter,
          },
          (payload: any) => {
            listeners.forEach((listener) => {
              try {
                listener(payload);
              } catch (err) {
                logger.error('Error executing realtime pool listener callback:', err);
              }
            });
          }
        )
        .subscribe();
        
      activePool = { channel, listeners };
      this.activePools.set(poolKey, activePool);
    }
    
    // Add current listener
    activePool.listeners.add(config.callback);
    
    // Return cleanup unsubscribe function
    return () => {
      const currentPool = this.activePools.get(poolKey);
      if (!currentPool) return;
      
      currentPool.listeners.delete(config.callback);
      
      // If no listeners remaining, safely clean up socket channel
      if (currentPool.listeners.size === 0) {
        const supabase = createClient();
        supabase.removeChannel(currentPool.channel);
        this.activePools.delete(poolKey);
        logger.info(`Safely closed pooled channel: ${config.channelName}`);
      }
    };
  }
}

let poolManager: RealtimeSubscriptionPoolManager;

export function getRealtimePoolManager() {
  if (!poolManager) {
    poolManager = new RealtimeSubscriptionPoolManager();
  }
  return poolManager;
}
