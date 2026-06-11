import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, handleApiError, getAuthUserId, createErrorResponse } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify authentication
    const userId = await getAuthUserId(request, supabase);
    if (!userId) {
      return createErrorResponse('Unauthorized: Please log in', 401);
    }

    const admin = createAdminClient();

    // Verify role is client (customer)
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !profile || profile.role !== 'client') {
      return createResponse({ booking: null });
    }

    // Find the most recent active booking for this client
    // Statuses must be active and exclude completed or cancelled
    const { data, error } = await admin
      .from('bookings')
      .select(`
        id,
        status,
        category,
        total_price,
        scheduled_at,
        created_at,
        workers:workers!worker_id (
          id,
          profiles:profiles!id (
            full_name,
            avatar_url
          )
        ),
        booking_timeline (
          id,
          status,
          reason,
          created_at
        )
      `)
      .eq('client_id', userId)
      .in('status', [
        'created',
        'searching_worker',
        'assigned',
        'accepted',
        'en_route',
        'arrived',
        'started',
        'work_completed_pending_otp'
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // PGRST116 means zero rows found, which is normal if no active booking
      if (error.code === 'PGRST116') {
        return createResponse({ booking: null });
      }
      throw error;
    }

    const formattedBooking = {
      id: data.id,
      status: data.status,
      category: data.category,
      price: data.total_price,
      scheduled_at: data.scheduled_at,
      created_at: data.created_at,
      worker: data.workers ? {
        id: (data.workers as any).id,
        name: (data.workers as any).profiles?.full_name || 'Professional',
        avatar_url: (data.workers as any).profiles?.avatar_url || null,
      } : null,
      timeline: data.booking_timeline || [],
    };

    return createResponse({ booking: formattedBooking });
  } catch (error) {
    return handleApiError(error);
  }
}
