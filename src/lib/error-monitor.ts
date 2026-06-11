import logger from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

type ErrorSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  userId?: string;
  eventType?: string;
  severity?: ErrorSeverity;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export class ErrorMonitor {
  private isServer: boolean;

  constructor() {
    this.isServer = typeof window === 'undefined';
  }

  /**
   * Capture and report an error or operational anomaly.
   */
  async capture(error: any, context: ErrorContext = {}) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    const severity = context.severity || 'medium';
    const eventType = context.eventType || 'system_error';

    // 1. Local logging
    logger.error(`[ErrorMonitor] Caught exception (${eventType}): ${message}`, {
      context,
      stack,
    });

    // 2. Server-side critical logging & alerts routing
    if (this.isServer && (severity === 'high' || severity === 'critical')) {
      try {
        const admin = createAdminClient();
        
        // Write to public.security_logs.
        // The alert_admins_of_critical_log DB trigger will automatically route this as an alarm notification.
        await admin
          .from('security_logs')
          .insert({
            user_id: context.userId || null,
            event_type: eventType,
            severity: severity,
            description: `[CRITICAL MONITORING EXCEPTION]: ${message}`,
            ip_address: context.ipAddress || null,
            user_agent: context.userAgent || null,
            metadata: {
              ...context.metadata,
              stack: stack,
              timestamp: new Date().toISOString()
            }
          });
      } catch (logErr: any) {
        logger.error(`[ErrorMonitor] Failed to write database log: ${logErr.message}`);
      }
    }
  }

  /**
   * Log non-error operational security events (e.g. login audit, worker status adjustments).
   */
  async logEvent(eventType: string, description: string, context: ErrorContext = {}) {
    const severity = context.severity || 'info';

    logger.info(`[ErrorMonitor] Event logged (${eventType}): ${description}`, context);

    if (this.isServer && (severity === 'high' || severity === 'critical')) {
      try {
        const admin = createAdminClient();
        await admin
          .from('security_logs')
          .insert({
            user_id: context.userId || null,
            event_type: eventType,
            severity: severity,
            description: description,
            ip_address: context.ipAddress || null,
            user_agent: context.userAgent || null,
            metadata: {
              ...context.metadata,
              timestamp: new Date().toISOString()
            }
          });
      } catch (logErr: any) {
        logger.error(`[ErrorMonitor] Failed to write database security log: ${logErr.message}`);
      }
    }
  }
}

export const errorMonitor = new ErrorMonitor();
