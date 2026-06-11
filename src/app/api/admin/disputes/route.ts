import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const createSchema = z.object({
  booking_id: z.string().uuid(),
  dispute_type: z.enum(['client_complaint', 'worker_complaint', 'payment_issue', 'fraud_report', 'otp_issue', 'quality_issue', 'other']),
  title: z.string().min(5).max(150),
  description: z.string().min(10),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  raised_against: z.string().uuid().optional(),
});

const resolveSchema = z.object({
  dispute_id: z.string().uuid(),
  action: z.enum(['resolve_client', 'resolve_worker', 'escalate', 'close', 'reopen']),
  resolution_note: z.string().min(5),
});

const DISPUTE_SELECT = `
  *,
  booking:bookings(
    id, status, category, total_price, payment_method, created_at,
    client:clients(profile:profiles(full_name, phone, email)),
    worker:workers(profile:profiles(full_name, phone), category),
    timeline:booking_timeline(*),
    payment_transactions(*)
  ),
  raiser:profiles!disputes_raised_by_fkey(full_name, email, phone, role),
  against:profiles!disputes_raised_against_fkey(full_name, email, phone, role),
  resolver:profiles!disputes_resolved_by_fkey(full_name)
`;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    if (gate.adminRole && !['super_admin', 'operations_admin', 'support_admin'].includes(gate.adminRole)) {
      return createErrorResponse('Forbidden: Disputes require Super Admin, Operations Admin, or Support Admin privileges', 403);
    }

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const priority = searchParams.get('priority') || 'all';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const id = searchParams.get('id');

    if (id) {
      const { data, error } = await admin
        .from('disputes')
        .select(DISPUTE_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return createErrorResponse('Dispute not found', 404);
      return createResponse({ dispute: data });
    }

    let query = admin
      .from('disputes')
      .select(DISPUTE_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') query = query.eq('status', status);
    if (priority !== 'all') query = query.eq('priority', priority);

    const { data, error, count } = await query;
    if (error) throw error;

    return createResponse({ disputes: data || [], count: count ?? 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    if (gate.adminRole && !['super_admin', 'operations_admin', 'support_admin'].includes(gate.adminRole)) {
      return createErrorResponse('Forbidden: Disputes require Super Admin, Operations Admin, or Support Admin privileges', 403);
    }

    const body = createSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: dispute, error } = await admin
      .from('disputes')
      .insert({
        booking_id: body.booking_id,
        raised_by: gate.user.id,
        raised_against: body.raised_against || null,
        dispute_type: body.dispute_type,
        title: body.title,
        description: body.description,
        priority: body.priority,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: 'dispute_created',
      p_target_type: 'dispute',
      p_target_id: dispute.id,
      p_target_name: body.title,
      p_old_value: null,
      p_new_value: { booking_id: body.booking_id, type: body.dispute_type, priority: body.priority },
      p_reason: body.description,
      p_ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return createResponse({ dispute }, 201);
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

    if (gate.adminRole && !['super_admin', 'operations_admin', 'support_admin'].includes(gate.adminRole)) {
      return createErrorResponse('Forbidden: Disputes require Super Admin, Operations Admin, or Support Admin privileges', 403);
    }

    const body = resolveSchema.parse(await request.json());
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: dispute, error: fetchError } = await admin
      .from('disputes')
      .select('id, status, booking_id, title')
      .eq('id', body.dispute_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!dispute) return createErrorResponse('Dispute not found', 404);

    const statusMap: Record<string, string> = {
      resolve_client: 'resolved_client',
      resolve_worker: 'resolved_worker',
      escalate: 'escalated',
      close: 'closed',
      reopen: 'open',
    };

    const newStatus = statusMap[body.action];
    const oldStatus = dispute.status;

    const { data: updated, error: updateError } = await admin
      .from('disputes')
      .update({
        status: newStatus,
        resolution_note: body.resolution_note,
        resolved_by: gate.user.id,
        resolved_at: body.action !== 'reopen' ? now : null,
        updated_at: now,
      })
      .eq('id', body.dispute_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // If booking is disputed, update booking status
    if (body.action === 'resolve_client') {
      await admin.from('bookings').update({ status: 'cancelled', updated_at: now }).eq('id', dispute.booking_id);
    } else if (body.action === 'resolve_worker') {
      await admin.from('bookings').update({ status: 'completed', updated_at: now }).eq('id', dispute.booking_id);
    }

    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: `dispute_${body.action}`,
      p_target_type: 'dispute',
      p_target_id: body.dispute_id,
      p_target_name: dispute.title,
      p_old_value: { status: oldStatus },
      p_new_value: { status: newStatus, resolution_note: body.resolution_note },
      p_reason: body.resolution_note,
      p_ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return createResponse({ dispute: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
