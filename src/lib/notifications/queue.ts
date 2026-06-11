import { createAdminClient } from '@/lib/supabase/admin';
import logger from '@/lib/logger';

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Queue a notification delivery across any channel.
 * Saves to delivery logs and triggers async retry processing.
 */
export async function queueNotificationDelivery(
  notificationId: string,
  channel: 'push' | 'sms' | 'in_app' | 'email',
  provider: string,
  sendFn: () => Promise<DeliveryResult>
): Promise<void> {
  const admin = createAdminClient();

  // 1. Create a delivery log in 'queued' status
  const { data: log, error: logErr } = await admin
    .from('notification_delivery_logs')
    .insert({
      notification_id: notificationId,
      channel,
      provider,
      status: 'queued',
      retry_count: 0,
      max_retries: 3,
    })
    .select('id, retry_count, max_retries')
    .single();

  if (logErr) {
    logger.error(`[Queue] Failed to create delivery log for notification ${notificationId}:`, logErr.message);
    return;
  }

  // 2. Trigger asynchronous execution
  // We do not await this, letting it process in the background
  processDeliveryWithRetry(log.id, sendFn).catch((err) => {
    logger.error(`[Queue] Error processing background delivery for log ${log.id}:`, err.message);
  });
}

/**
 * Execute delivery with exponential backoff retry logic
 */
async function processDeliveryWithRetry(
  logId: string,
  sendFn: () => Promise<DeliveryResult>
): Promise<void> {
  const admin = createAdminClient();
  let retryCount = 0;
  let maxRetries = 3;

  // Retrieve current logs parameters
  const { data: logData } = await admin
    .from('notification_delivery_logs')
    .select('retry_count, max_retries')
    .eq('id', logId)
    .single();

  if (logData) {
    retryCount = logData.retry_count || 0;
    maxRetries = logData.max_retries || 3;
  }

  while (retryCount <= maxRetries) {
    try {
      // Update log to status 'sent' (or in progress)
      await admin
        .from('notification_delivery_logs')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', logId);

      // Execute delivery
      const result = await sendFn();

      if (result.success) {
        // Success: update status to 'delivered'
        await admin
          .from('notification_delivery_logs')
          .update({
            status: 'delivered',
            metadata: { messageId: result.messageId },
            updated_at: new Date().toISOString(),
          })
          .eq('id', logId);
        
        logger.info(`[Queue] Notification delivery succeeded. Log ID: ${logId}`);
        return; // Complete!
      } else {
        // Failure: log error and check if we should retry
        const errStr = result.error || 'Unknown provider error';
        logger.warn(`[Queue] Delivery attempt ${retryCount + 1}/${maxRetries + 1} failed for Log ${logId}: ${errStr}`);

        retryCount++;
        if (retryCount > maxRetries) {
          // Out of retries: mark as 'failed'
          await admin
            .from('notification_delivery_logs')
            .update({
              status: 'failed',
              error_message: errStr,
              retry_count: maxRetries,
              updated_at: new Date().toISOString(),
            })
            .eq('id', logId);
          return;
        }

        // Wait with exponential backoff: 1.5s, 3s, 6s...
        const delayMs = 1500 * Math.pow(2, retryCount - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Update retry count in database before attempting again
        await admin
          .from('notification_delivery_logs')
          .update({
            retry_count: retryCount,
            error_message: errStr,
            updated_at: new Date().toISOString(),
          })
          .eq('id', logId);
      }
    } catch (err: any) {
      logger.error(`[Queue] Exception in delivery attempt for Log ${logId}:`, err.message);
      
      retryCount++;
      if (retryCount > maxRetries) {
        await admin
          .from('notification_delivery_logs')
          .update({
            status: 'failed',
            error_message: err.message,
            retry_count: maxRetries,
            updated_at: new Date().toISOString(),
          })
          .eq('id', logId);
        return;
      }
      
      const delayMs = 1500 * Math.pow(2, retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
