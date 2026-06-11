import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const reviewSchema = z.object({
  flag_id: z.string().uuid(),
  action: z.enum(['dismiss', 'escalate', 'action']),
  review_note: z.string().min(5),
});

const createFlagSchema = z.object({
  user_id: z.string().uuid(),
  flag_type: z.enum(['suspicious_cancellation', 'fake_booking', 'wallet_abuse', 'otp_failure_pattern', 'repeated_disputes', 'account_sharing', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  description: z.string().min(10),
  booking_id: z.string().uuid().optional(),
  evidence: z.record(z.string(), z.any()).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'open';
    const severity = searchParams.get('severity') || 'all';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = admin
      .from('fraud_flags')
      .select(`
        *,
        user:profiles!fraud_flags_user_id_fkey(full_name, email, phone, role),
        reviewer:profiles!fraud_flags_reviewed_by_fkey(full_name),
        booking:bookings(id, status, category, total_price, created_at)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') query = query.eq('status', status);
    if (severity !== 'all') query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw error;

    return createResponse({ flags: data || [], count: count ?? 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = createFlagSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: flag, error } = await admin
      .from('fraud_flags')
      .insert({
        user_id: body.user_id,
        flag_type: body.flag_type,
        severity: body.severity,
        description: body.description,
        booking_id: body.booking_id || null,
        evidence: body.evidence || {},
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'fraud_flag_created',
      p_target_type: 'user',
      p_target_id: body.user_id,
      p_target_name: body.flag_type,
      p_old_value: null,
      p_new_value: { flag_id: flag.id, severity: body.severity, type: body.flag_type },
      p_reason: body.description,
      p_ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return createResponse({ flag }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = reviewSchema.parse(await request.json());
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: flag, error: fetchError } = await admin
      .from('fraud_flags')
      .select('id, status, flag_type, user_id')
      .eq('id', body.flag_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!flag) return createErrorResponse('Fraud flag not found', 404);

    const statusMap: Record<string, string> = {
      dismiss: 'dismissed',
      escalate: 'escalated',
      action: 'actioned',
    };

    const { data: updated, error: updateError } = await admin
      .from('fraud_flags')
      .update({
        status: statusMap[body.action],
        reviewed_by: gate.user.id,
        reviewed_at: now,
        review_note: body.review_note,
        updated_at: now,
      })
      .eq('id', body.flag_id)
      .select()
      .single();

    if (updateError) throw updateError;

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: `fraud_flag_${body.action}d`,
      p_target_type: 'fraud_flag',
      p_target_id: body.flag_id,
      p_target_name: flag.flag_type,
      p_old_value: { status: flag.status },
      p_new_value: { status: statusMap[body.action], review_note: body.review_note },
      p_reason: body.review_note,
      p_ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return createResponse({ flag: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
