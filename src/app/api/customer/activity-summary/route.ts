import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('status')
      .eq('client_id', userId);

    if (error) {
      console.error("Supabase activity summary fetch error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to fetch activity summary' }, { status: 200 });
    }

    const summary = {
      total_bookings: bookings?.length || 0,
      active_bookings: bookings?.filter(b => !['completed', 'cancelled', 'rejected'].includes(b.status)).length || 0,
      completed_bookings: bookings?.filter(b => b.status === 'completed').length || 0,
    };

    return Response.json({ success: true, data: { summary }, error: null }, { status: 200 });
  } catch (err) {
    console.error("Activity Summary API crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 200 });
  }
}
