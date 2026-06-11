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

    let body;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse('Invalid request body', 400);
    }

    const { problemType, description } = body;

    if (!problemType || !description) {
      return createErrorResponse('Problem type and description are required', 400);
    }

    if (description.trim().length < 10) {
      return createErrorResponse('Description must be at least 10 characters long', 400);
    }

    const admin = createAdminClient();

    // Fetch user profile for metadata logging
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('email, phone, full_name')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw profileError;
    }

    // Get client IP and User Agent
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    // Insert security log
    const { error: logError } = await admin
      .from('security_logs')
      .insert({
        user_id: userId,
        event_type: 'problem_report',
        severity: 'low',
        description: `Problem report submitted by user (${profile.phone || profile.email || 'unknown'}): Type: ${problemType}. Description: ${description}`,
        ip_address: ip,
        user_agent: userAgent,
        metadata: {
          email: profile.email,
          phone: profile.phone,
          full_name: profile.full_name,
          problemType,
          description,
          reported_at: new Date().toISOString()
        }
      });

    if (logError) {
      throw logError;
    }

    return createResponse({
      success: true,
      message: 'Your problem report has been successfully recorded. Our technical support team will address it shortly.'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
