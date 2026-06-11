import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all'; // all, ongoing, completed, cancelled
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('bookings')
      .select(`
        id,
        category,
        status,
        total_price,
        scheduled_at,
        created_at,
        payment_method,
        payment_status,
        location_address,
        worker:workers (
          id,
          rating_avg,
          profile:profiles (
            full_name,
            avatar_url,
            phone
          )
        )
      `)
      .eq('client_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (filter === 'ongoing') {
      query = query.in('status', [
        'pending', 'broadcasting', 'accepted', 'worker_arriving',
        'arrived', 'work_started', 'in_progress', 'awaiting_item_approval',
        'item_approved', 'otp_generated', 'awaiting_otp', 'otp_verified',
        'awaiting_payment', 'payment_processing'
      ]);
    } else if (filter === 'completed') {
      query = query.in('status', ['completed', 'payment_verified', 'paid_completed']);
    } else if (filter === 'cancelled') {
      query = query.in('status', ['cancelled']);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Format for frontend consumption
    const activities = (data || []).map((booking: any) => ({
      id: booking.id,
      service_name: booking.category,
      status: booking.status,
      price: booking.total_price,
      created_at: booking.created_at,
      scheduled_at: booking.scheduled_at,
      location: booking.location_address,
      payment_method: booking.payment_method,
      payment_status: booking.payment_status,
      worker: booking.worker ? {
        id: booking.worker.id,
        name: booking.worker.profile?.full_name || 'Professional',
        rating: booking.worker.rating_avg,
        avatar_url: booking.worker.profile?.avatar_url,
        phone: booking.worker.profile?.phone
      } : null
    }));

    return createResponse({ activities });
  } catch (error) {
    return handleApiError(error);
  }
}
