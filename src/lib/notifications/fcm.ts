import { createAdminClient } from '@/lib/supabase/admin';
import logger from '@/lib/logger';

export interface PushPayload {
  title: string;
  body: string;
  linkUrl?: string;
  metadata?: Record<string, any>;
}

export class FCMService {
  private projectId: string;
  private serverKey: string; // Legacy API key or Google Auth config

  constructor() {
    this.projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'apnora-fc153';
    this.serverKey = process.env.FCM_SERVER_KEY || ''; // Optional Server API key for legacy API dispatches
  }

  /**
   * Send push notification to a user's registered device tokens
   */
  async sendPushNotification(userId: string, payload: PushPayload): Promise<{ success: boolean; count: number }> {
    const admin = createAdminClient();

    // 1. Fetch user device tokens
    const { data: devices, error } = await admin
      .from('user_device_tokens')
      .select('id, token, platform')
      .eq('user_id', userId);

    if (error) {
      logger.error(`Error reading device tokens for user ${userId}:`, error.message);
      return { success: false, count: 0 };
    }

    if (!devices || devices.length === 0) {
      logger.info(`No registered device tokens for user ${userId}. Skipping push.`);
      return { success: true, count: 0 };
    }

    let successCount = 0;
    const tokensToRemove: string[] = [];

    // 2. Loop through devices and dispatch push message
    for (const device of devices) {
      try {
        const result = await this.dispatchToToken(device.token, payload);
        if (result.success) {
          successCount++;
        } else if (result.shouldCleanup) {
          tokensToRemove.push(device.token);
        }
      } catch (err: any) {
        logger.error(`Failed to dispatch push to device ${device.id}:`, err.message);
      }
    }

    // 3. Cleanup expired tokens
    if (tokensToRemove.length > 0) {
      logger.info(`Cleaning up ${tokensToRemove.length} expired or invalid tokens for user ${userId}`);
      await admin
        .from('user_device_tokens')
        .delete()
        .eq('user_id', userId)
        .in('token', tokensToRemove);
    }

    return { success: true, count: successCount };
  }

  /**
   * Raw FCM dispatcher using REST API
   */
  private async dispatchToToken(
    token: string,
    payload: PushPayload
  ): Promise<{ success: boolean; shouldCleanup: boolean }> {
    // If FCM credentials are mock or unset, log and simulate success
    if (!this.serverKey) {
      logger.info(`[FCM PUSH SIMULATION] Token: ${token.substring(0, 15)}... | Title: ${payload.title} | Body: ${payload.body}`);
      return { success: true, shouldCleanup: false };
    }

    try {
      // Legacy API key HTTP endpoint for easy, gRPC-free Firebase dispatches
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${this.serverKey}`,
        },
        body: JSON.stringify({
          to: token,
          notification: {
            title: payload.title,
            body: payload.body,
            click_action: payload.linkUrl,
          },
          data: payload.metadata || {},
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || (data && data.failure > 0)) {
        const errorResult = data?.results?.[0]?.error;
        logger.warn(`FCM send failed: ${errorResult}`);
        
        // Cleanup token if unregistered or invalid
        const cleanupErrors = ['NotRegistered', 'InvalidRegistration', 'UnregisteredDevice'];
        const shouldCleanup = cleanupErrors.includes(errorResult);
        return { success: false, shouldCleanup };
      }

      return { success: true, shouldCleanup: false };
    } catch (err: any) {
      logger.error('FCM HTTP dispatch exception:', err.message);
      return { success: false, shouldCleanup: false };
    }
  }
}

export const fcmService = new FCMService();
