import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import logger from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventName, properties, anonymousId } = body;

    if (!eventName) {
      return new Response('Event name required', { status: 400 });
    }

    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    const userAgent = request.headers.get('user-agent') || null;
    const ipAddress = request.headers.get('x-forwarded-for') || null;

    const admin = createAdminClient();
    const { error } = await admin
      .from('analytics_events')
      .insert({
        user_id: userId,
        anonymous_id: anonymousId || null,
        event_name: eventName,
        properties: properties || {},
        user_agent: userAgent,
        ip_address: ipAddress,
      });

    if (error) {
      logger.error('Failed to save analytics event', error);
    }

    // Production-ready console log drain output
    logger.info(`Product Event: ${eventName}`, {
      user_id: userId,
      anonymous_id: anonymousId,
      properties,
    });

    return createResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
