import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const patchSchema = z.object({
  review_id: z.string().uuid(),
  action: z.enum(['hide', 'unhide', 'flag', 'unflag']),
  reason: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const flaggedFilter = searchParams.get('is_flagged');
    const hiddenFilter = searchParams.get('is_hidden');

    let query = admin.from('reviews').select(`
      *,
      client:profiles!customer_id(id, full_name, email, phone, avatar_url),
      worker:workers!worker_id(
        id,
        category,
        profile:profiles!id(id, full_name, email, phone, avatar_url)
      )
    `).order('created_at', { ascending: false });

    if (flaggedFilter !== null && flaggedFilter !== '') {
      query = query.eq('is_flagged', flaggedFilter === 'true');
    }
    if (hiddenFilter !== null && hiddenFilter !== '') {
      query = query.eq('is_hidden', hiddenFilter === 'true');
    }

    const { data: reviews, error } = await query;
    if (error) throw error;

    let filtered = reviews || [];

    if (search.trim() !== '') {
      const q = search.toLowerCase();
      filtered = filtered.filter((r: any) => {
        const textMatch = r.review_text?.toLowerCase().includes(q);
        const clientMatch = r.client?.full_name?.toLowerCase().includes(q) || r.client?.email?.toLowerCase().includes(q);
        const workerMatch = r.worker?.profile?.full_name?.toLowerCase().includes(q) || r.worker?.profile?.email?.toLowerCase().includes(q);
        return textMatch || clientMatch || workerMatch;
      });
    }

    return createResponse({ reviews: filtered, count: filtered.length });
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

    // Verify review exists
    const { data: review, error: getErr } = await admin
      .from('reviews')
      .select('id, reviewer_role, rating, review_text, worker_id, customer_id')
      .eq('id', body.review_id)
      .maybeSingle();

    if (getErr || !review) {
      return createErrorResponse('Review not found', 404);
    }

    // Determine field updates
    const updates: any = {};
    if (body.action === 'hide') updates.is_hidden = true;
    if (body.action === 'unhide') updates.is_hidden = false;
    if (body.action === 'flag') updates.is_flagged = true;
    if (body.action === 'unflag') updates.is_flagged = false;

    const { data: updatedReview, error: updateErr } = await admin
      .from('reviews')
      .update(updates)
      .eq('id', body.review_id)
      .select('*')
      .single();

    if (updateErr) throw updateErr;

    // Log admin action in the audit logs
    await admin.rpc('log_admin_action', {
      p_admin_id: gate.user.id,
      p_action_type: `review_${body.action}d`,
      p_target_type: 'review',
      p_target_id: body.review_id,
      p_target_name: `Review by ${review.reviewer_role} (Rating: ${review.rating})`,
      p_old_value: null,
      p_new_value: { action: body.action, updates },
      p_reason: body.reason || `Admin review moderation: ${body.action}`,
      p_ip_address: ip,
    });

    return createResponse({ success: true, review: updatedReview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Invalid payload', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
