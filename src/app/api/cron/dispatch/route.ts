import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';

/**
 * GET /api/cron/dispatch
 *
 * Called every minute by Vercel Cron (vercel.json) or Supabase pg_cron.
 * Processes:
 *   1. Scheduled bookings that are now due for dispatch
 *   2. Expired dispatch attempts (workers who didn't respond in time)
 *
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  // Verify this is a legitimate cron call
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return createErrorResponse('Unauthorized', 401);
  }

  try {
    const admin = createAdminClient();
    const startTime = Date.now();

    // 1. Process expired dispatch attempts (workers who timed out)
    const { data: expiredResult, error: expiredError } = await admin.rpc('process_expired_dispatch_attempts');
    if (expiredError) {
      console.error('[cron/dispatch] Error processing expired attempts:', expiredError);
    }

    // 2. Process scheduled bookings now due for dispatch
    const { data: scheduledResult, error: scheduledError } = await admin.rpc('process_scheduled_bookings');
    if (scheduledError) {
      console.error('[cron/dispatch] Error processing scheduled bookings:', scheduledError);
    }

    const elapsed = Date.now() - startTime;

    return createResponse({
      success: true,
      elapsed_ms: elapsed,
      expired_attempts: expiredResult ?? { processed: 0 },
      scheduled_dispatched: scheduledResult ?? { dispatched: 0, errors: 0 },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/dispatch] Fatal error:', error);
    return handleApiError(error);
  }
}

// Allow POST as well (for manual triggering from Supabase webhooks)
export const POST = GET;
