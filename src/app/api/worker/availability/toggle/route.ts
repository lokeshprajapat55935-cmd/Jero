import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const admin = createAdminClient();

    // Must be an approved worker
    const { data: worker } = await admin
      .from('workers')
      .select('id, status')
      .eq('id', userId)
      .eq('status', 'approved')
      .maybeSingle();

    if (!worker) return createErrorResponse('Only approved workers can toggle availability.', 403);

    // Check if currently in an active booking
    const { data: activeBooking } = await admin
      .from('active_bookings')
      .select('booking_id')
      .eq('worker_id', userId)
      .maybeSingle();

    if (activeBooking) {
      return createErrorResponse('Cannot go offline during an active job.', 400);
    }

    // Fetch current availability
    const { data: current } = await admin
      .from('worker_availability')
      .select('status')
      .eq('worker_id', userId)
      .maybeSingle();

    const newStatus = current?.status === 'online' ? 'offline' : 'online';

    // Upsert availability
    const { error: upsertErr } = await admin
      .from('worker_availability')
      .upsert(
        {
          worker_id: userId,
          status: newStatus,
          last_active_at: new Date().toISOString(),
          current_booking_id: null,
        },
        { onConflict: 'worker_id' }
      );

    if (upsertErr) throw upsertErr;

    return createResponse({
      worker_id: userId,
      status: newStatus,
      is_online: newStatus === 'online',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const admin = createAdminClient();
    const { data } = await admin
      .from('worker_availability')
      .select('status, last_active_at')
      .eq('worker_id', userId)
      .maybeSingle();

    const status = data?.status ?? 'offline';
    return createResponse({ status, is_online: status === 'online' });
  } catch (error) {
    return handleApiError(error);
  }
}
