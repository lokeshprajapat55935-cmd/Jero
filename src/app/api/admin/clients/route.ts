import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const patchSchema = z.object({
  client_id: z.string().uuid(),
  action: z.enum(['suspend', 'unsuspend', 'add_note']),
  note: z.string().optional(),
  reason: z.string().min(5),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || 'all';

    let query = admin
      .from('clients')
      .select(`
        id,
        profile:profiles!inner(id, full_name, email, phone, role, created_at),
        bookings:bookings(id, status, total_price, payment_method, created_at)
      `)
      .range(offset, offset + limit - 1)
      .order('id', { ascending: false });

    if (search) {
      query = query.or(`profiles.full_name.ilike.%${search}%,profiles.email.ilike.%${search}%,profiles.phone.ilike.%${search}%`);
    }

    const { data: clients, error } = await query;
    if (error) throw error;

    // Compute stats per client
    const enriched = (clients || []).map((c: any) => {
      const bookings = c.bookings || [];
      const totalBookings = bookings.length;
      const completedBookings = bookings.filter((b: any) =>
        b.status === 'completed'
      ).length;
      const cancelledBookings = bookings.filter((b: any) => b.status === 'cancelled').length;
      const disputedBookings = bookings.filter((b: any) => b.status === 'disputed').length;
      const totalSpend = bookings
        .filter((b: any) => b.status === 'completed')
        .reduce((sum: number, b: any) => sum + Number(b.total_price || 0), 0);
      const cancellationRate =
        totalBookings > 0 ? Math.round((cancelledBookings / totalBookings) * 100) : 0;

      return {
        id: c.id,
        profile: c.profile,
        stats: {
          total_bookings: totalBookings,
          completed_bookings: completedBookings,
          cancelled_bookings: cancelledBookings,
          disputed_bookings: disputedBookings,
          total_spend: totalSpend,
          cancellation_rate: cancellationRate,
        },
      };
    });

    return createResponse({ clients: enriched, count: enriched.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = patchSchema.parse(await request.json());
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const ip = request.headers.get('x-forwarded-for') || 'unknown';

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', body.client_id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return createErrorResponse('Client not found', 404);
    if (profile.role !== 'client') return createErrorResponse('Target user is not a client', 400);

    if (body.action === 'suspend') {
      // Add fraud flag
      await admin.from('fraud_flags').insert({
        user_id: body.client_id,
        flag_type: 'other',
        severity: 'high',
        status: 'actioned',
        description: `Client suspended by admin. Reason: ${body.reason}`,
        reviewed_by: gate.user.id,
        reviewed_at: now,
        review_note: body.reason,
      });
    }

    // Log admin action
    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: body.action === 'suspend' ? 'client_suspended' : body.action === 'unsuspend' ? 'client_unsuspended' : 'client_note_added',
      p_target_type: 'client',
      p_target_id: body.client_id,
      p_target_name: profile.full_name || body.client_id,
      p_old_value: null,
      p_new_value: { action: body.action, reason: body.reason },
      p_reason: body.reason,
      p_ip_address: ip,
    });

    return createResponse({ success: true, action: body.action });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
