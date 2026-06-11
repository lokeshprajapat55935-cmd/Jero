import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const admin = createAdminClient();
    
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    // Fetch the old booking to replicate
    const { data: oldBooking, error: fetchErr } = await supabase
      .from('bookings')
      .select('client_id, category, description, location_address, latitude, longitude, area_id, payment_method')
      .eq('id', id)
      .single();

    if (fetchErr || !oldBooking) return createErrorResponse('Original booking not found', 404);
    if (oldBooking.client_id !== userId) return createErrorResponse('Forbidden', 403);

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Call atomic create_booking_dispatch RPC
    const { data: result, error: rpcError } = await admin.rpc('create_booking_dispatch', {
      p_client_id: userId,
      p_category: oldBooking.category,
      p_description: oldBooking.description || 'Rebooked service',
      p_location_address: oldBooking.location_address,
      p_latitude: oldBooking.latitude ?? null,
      p_longitude: oldBooking.longitude ?? null,
      p_area_id: oldBooking.area_id ?? null,
      p_payment_method: oldBooking.payment_method || 'cash',
      p_ip_address: ip,
      p_user_agent: userAgent,
    });

    if (rpcError) throw rpcError;
    if (!result.success) return createErrorResponse(result.error, result.code || 400);

    return createResponse({ success: true, booking_id: result.booking_id, message: 'Service rebooked successfully' }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
