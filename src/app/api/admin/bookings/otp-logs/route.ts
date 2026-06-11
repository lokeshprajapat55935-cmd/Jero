import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth/admin';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');

    if (!bookingId) {
      return createErrorResponse('Booking ID is required', 400);
    }

    const admin = createAdminClient();
    const { data: logs, error } = await admin
      .from('booking_completion_otps')
      .select('id, expires_at, attempts, verified_at, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return createResponse({ logs: logs ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
