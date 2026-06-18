import { createAdminClient } from '@/lib/supabase/admin';
import { getSMSProvider } from './sms/providers';
import { fcmService } from './fcm';
import { queueNotificationDelivery } from './queue';
import logger from '@/lib/logger';

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: 'booking' | 'dispatch' | 'otp' | 'payment' | 'review' | 'system' | 'admin';
  role?: 'client' | 'worker' | 'admin' | 'system';
  linkUrl?: string;
  metadata?: Record<string, any>;
  channels?: ('in_app' | 'push' | 'sms' | 'email')[];
}

export class NotificationManager {
  /**
   * Dispatch a unified multi-channel notification.
   * By default, it sends in_app, and attempts push/sms if configured.
   */
  static async sendNotification(payload: NotificationPayload): Promise<{ success: boolean; notificationId?: string }> {
    const admin = createAdminClient();
    const userId = payload.userId;
    const channels = payload.channels || ['in_app', 'push'];

    try {
      // 1. Fetch recipient's profile details (phone, email, current role)
      const { data: profile, error: profErr } = await admin
        .from('profiles')
        .select('phone, email, role')
        .eq('id', userId)
        .maybeSingle();

      if (profErr) {
        logger.error(`[NotificationManager] Profile query failed for user ${userId}:`, profErr.message);
      }

      const recipientPhone = profile?.phone || '';
      const recipientRole = payload.role || (profile?.role as any) || 'system';

      let notificationId: string | undefined;

      // 2. Channel: In-App Notification (Always processed first, creates database record)
      if (channels.includes('in_app')) {
        const { data: notifData, error: notifErr } = await admin
          .from('notifications')
          .insert({
            user_id: userId,
            type: payload.type,
            title: payload.title,
            content: payload.message, // compat field maps to message via db trigger
            link_url: payload.linkUrl || null,
            metadata: payload.metadata || {},
            role: recipientRole,
          })
          .select('id')
          .single();

        if (notifErr) {
          logger.error('[NotificationManager] Failed to create in-app notification:', notifErr.message);
          return { success: false };
        }

        notificationId = notifData.id;
        
        // Log in_app delivery log
        await admin.from('notification_delivery_logs').insert({
          notification_id: notificationId,
          channel: 'in_app',
          provider: 'supabase',
          status: 'delivered',
          retry_count: 0
        });
      }

      // If we don't have a database notification ID (e.g. in_app bypassed), we can generate a temporary uuid
      const targetNotifId = notificationId || crypto.randomUUID();

      // 3. Channel: Push Notification (FCM)
      if (channels.includes('push')) {
        await queueNotificationDelivery(targetNotifId, 'push', 'fcm', async () => {
          const res = await fcmService.sendPushNotification(userId, {
            title: payload.title,
            body: payload.message,
            linkUrl: payload.linkUrl,
            metadata: payload.metadata,
          });
          return { success: res.success, messageId: `fcm-count-${res.count}` };
        });
      }

      // 4. Channel: SMS Notification
      if (channels.includes('sms') && recipientPhone) {
        const smsProvider = getSMSProvider();
        const providerName = process.env.SMS_PROVIDER || 'mock';

        await queueNotificationDelivery(targetNotifId, 'sms', providerName, async () => {
          return await smsProvider.sendSMS(recipientPhone, payload.message);
        });
      }

      // 5. Channel: Email Notification (Future-ready logging integration)
      if (channels.includes('email') && profile?.email) {
        await queueNotificationDelivery(targetNotifId, 'email', 'mock_email', async () => {
          logger.info(`[FUTURE EMAIL DISPATCH] To: ${profile.email} | Subject: ${payload.title} | Body: ${payload.message}`);
          return { success: true, messageId: `mock-email-id-${Date.now()}` };
        });
      }

      return { success: true, notificationId };
    } catch (err: any) {
      logger.error('[NotificationManager] Fatal crash in sender pipeline:', err.message);
      return { success: false };
    }
  }

  // --- Convenience Notification Trigger Mappings ---

  // A. Customer Updates
  static async notifyCustomerBookingCreated(userId: string, bookingId: string, category: string) {
    return this.sendNotification({
      userId,
      title: 'Booking Created',
      message: `Your booking for ${category} has been created successfully. We are finding the best professional for you.`,
      type: 'booking',
      role: 'client',
      linkUrl: `/booking/${bookingId}`,
      metadata: { bookingId },
    });
  }

  static async notifyCustomerWorkerAssigned(userId: string, bookingId: string, workerName: string, category: string) {
    return this.sendNotification({
      userId,
      title: 'Professional Assigned',
      message: `${workerName} has been assigned to your ${category} service request.`,
      type: 'booking',
      role: 'client',
      linkUrl: `/booking/${bookingId}`,
      metadata: { bookingId },
    });
  }

  static async notifyCustomerWorkerArriving(userId: string, bookingId: string, workerName: string) {
    return this.sendNotification({
      userId,
      title: 'Professional En Route',
      message: `${workerName} is en route to your service location.`,
      type: 'booking',
      role: 'client',
      linkUrl: `/booking/${bookingId}`,
      metadata: { bookingId },
    });
  }

  static async notifyCustomerWorkerArrived(userId: string, bookingId: string, workerName: string) {
    return this.sendNotification({
      userId,
      title: 'Professional Arrived',
      message: `${workerName} has arrived at your location. Please share the verification code when work starts.`,
      type: 'booking',
      role: 'client',
      linkUrl: `/booking/${bookingId}`,
      metadata: { bookingId },
    });
  }

  static async notifyCustomerOTPGenerated(userId: string, bookingId: string, otpCode: string) {
    return this.sendNotification({
      userId,
      title: 'Start Work Code',
      message: `Share this code with your professional to start/complete the work: ${otpCode}. Never share this code elsewhere.`,
      type: 'otp',
      role: 'client',
      metadata: { bookingId },
      channels: ['in_app', 'sms', 'push'], // SMS is critical for OTP
    });
  }

  static async notifyCustomerBookingCompleted(userId: string, bookingId: string) {
    return this.sendNotification({
      userId,
      title: 'Service Completed',
      message: 'Your service booking has been marked completed. Thank you for choosing Jero!',
      type: 'booking',
      role: 'client',
      linkUrl: `/booking/${bookingId}`,
      metadata: { bookingId },
    });
  }

  static async notifyCustomerReviewReminder(userId: string, bookingId: string, workerName: string) {
    return this.sendNotification({
      userId,
      title: 'Rate Your Service',
      message: `How was your service with ${workerName}? Please take a moment to rate and review your experience.`,
      type: 'review',
      role: 'client',
      linkUrl: `/booking/${bookingId}/review`,
      metadata: { bookingId },
    });
  }

  // B. Worker Updates
  static async notifyWorkerJobAvailable(userId: string, bookingId: string, category: string) {
    return this.sendNotification({
      userId,
      title: 'New Job Available Nearby!',
      message: `A new ${category} request is available. Tap to accept and lock the booking.`,
      type: 'dispatch',
      role: 'worker',
      linkUrl: `/worker/jobs/${bookingId}`,
      metadata: { bookingId },
      channels: ['in_app', 'push', 'sms'], // critical for dispatches
    });
  }

  static async notifyWorkerBookingAssigned(userId: string, bookingId: string) {
    return this.sendNotification({
      userId,
      title: 'Job Assigned to You',
      message: 'You have been assigned a job. Check dispatches to view details.',
      type: 'booking',
      role: 'worker',
      linkUrl: `/worker/jobs/${bookingId}`,
      metadata: { bookingId },
    });
  }

  static async notifyWorkerCustomerCancelled(userId: string, bookingId: string) {
    return this.sendNotification({
      userId,
      title: 'Job Cancelled',
      message: 'The client has cancelled their booking. You have been placed back online.',
      type: 'booking',
      role: 'worker',
      linkUrl: '/worker/jobs',
      metadata: { bookingId },
    });
  }

  static async notifyWorkerOTPVerified(userId: string, bookingId: string) {
    return this.sendNotification({
      userId,
      title: 'OTP Verified successfully',
      message: 'Completion OTP code accepted. You can declare work complete and collect billing payment.',
      type: 'otp',
      role: 'worker',
      metadata: { bookingId },
    });
  }

  static async notifyWorkerPaymentRecorded(userId: string, amount: number) {
    return this.sendNotification({
      userId,
      title: 'Payment Credited',
      message: `We recorded a credit of ₹${amount} in your Jero partner wallet.`,
      type: 'payment',
      role: 'worker',
      linkUrl: '/worker/earnings',
      metadata: { amount },
    });
  }

  static async notifyWorkerApproval(userId: string) {
    return this.sendNotification({
      userId,
      title: 'Account Approved!',
      message: 'Congratulations! Your partner account has been approved by Jero admin. You can now toggle online.',
      type: 'system',
      role: 'worker',
      linkUrl: '/worker/dashboard',
    });
  }

  static async notifyWorkerRejection(userId: string, note?: string) {
    return this.sendNotification({
      userId,
      title: 'Onboarding Rejected',
      message: `Your partner documents verification failed. Note: ${note || 'Please re-upload clear photos.'}`,
      type: 'system',
      role: 'worker',
      linkUrl: '/worker/onboarding',
    });
  }

  static async notifyWorkerSuspensionWarning(userId: string) {
    return this.sendNotification({
      userId,
      title: 'Suspension Risk warning',
      message: 'Warning: We detected multiple booking cancellations. Further violations will result in account suspension.',
      type: 'system',
      role: 'worker',
      channels: ['in_app', 'push', 'sms'],
    });
  }

  // C. Admin Alerts
  static async notifyAdminAlert(adminId: string, title: string, message: string, alertType: string, evidence?: any) {
    return this.sendNotification({
      userId: adminId,
      title: `[ALARM] ${title}`,
      message,
      type: 'admin',
      role: 'admin',
      metadata: { alertType, evidence },
    });
  }
}
