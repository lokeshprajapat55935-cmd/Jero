import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);

    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const admin = createAdminClient();

    // 1. Fetch user profile for metadata logging
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('email, phone, full_name')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    // Get client IP and User Agent
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    // 2. Log formal data deletion request in public.security_logs with 'high' severity
    // This will automatically trigger trigger_alert_admins_of_critical_log and notify the administrators
    const { error: logError } = await admin
      .from('security_logs')
      .insert({
        user_id: userId,
        event_type: 'data_deletion_request',
        severity: 'high',
        description: `User ${profile.full_name || 'unknown'} (${profile.phone || profile.email}) submitted a formal request for data deletion under Play Store Compliance.`,
        ip_address: ip,
        user_agent: userAgent,
        metadata: {
          email: profile.email,
          phone: profile.phone,
          full_name: profile.full_name,
          requested_at: new Date().toISOString()
        }
      });

    if (logError) throw logError;

    return createResponse({
      success: true,
      message: 'Your data deletion request has been formally recorded and administrators have been alerted. We will process it within 48 hours.'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
