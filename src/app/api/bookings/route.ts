import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { locationService } from '@/services/location';
import { workerMatchesCity } from '@/lib/data/cities';
import {
  assertCashPaymentOnly,
  canTransition,
  type BookingStatus,
} from '@/lib/booking/constants';
import { z } from 'zod';
import { encryptOtp, decryptOtp, hashOtp } from '@/lib/booking/otp-crypto';

const createBookingSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  location_address: z.string().min(1),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  area_id: z.string().uuid().nullable().optional(),
  payment_method: z.enum(['cash', 'upi', 'card']).default('cash'),
  booking_type: z.enum(['asap', 'scheduled']).default('asap'),
  scheduled_for: z.string().datetime().nullable().optional(), // ISO datetime string
  scheduled_date: z.string().nullable().optional(),
  scheduled_time_slot: z.enum(['asap', 'morning', 'afternoon', 'evening', 'custom']).optional(),
  image_urls: z.array(z.string().url()).max(3).optional(),
  job_notes: z.string().max(500).optional(),
});

const updateBookingSchema = z.object({
  status: z.enum([
    'scheduled',
    'pending',
    'broadcasting',
    'accepted',
    'worker_arriving',
    'en_route',
    'work_started',
    'started',
    'work_completed',
    'work_completed_pending_otp',
    'awaiting_item_approval',
    'item_approved',
    'otp_generated',
    'otp_verified',
    'awaiting_payment',
    'payment_processing',
    'payment_verified',
    'completed',
    'cancelled',
    'disputed',
    'no_worker_available',
  ]),
  reason: z.string().max(500).optional(),
  payment_status: z.enum(['pending', 'processing', 'paid', 'failed']).optional(),
});

const FIXED_PRICES: Record<string, Record<string, number>> = {
  Electrician: {
    'Fan Repair': 250,
    'Switchboard Installation': 350,
    'Short Circuit Inspection': 400,
    'Inverter Repair/Service': 600,
  },
  Plumber: {
    'Tap/Fitted Leakage': 200,
    'Toilet Flush Repair': 300,
    'Washbasin Installation': 450,
    'Water Tank Cleaning': 800,
  },
};

const BOOKING_SELECT = `
  *,
  worker:workers(
    id,
    category,
    base_service_charge,
    visit_charge,
    rating_avg,
    profile:profiles(full_name, avatar_url, phone),
    location:worker_locations(latitude, longitude)
  ),
  client:clients(
    id,
    profile:profiles(full_name, avatar_url, phone)
  ),
  timeline:booking_timeline(*)
`;

async function processBookingForResponse(booking: any, userId: string) {
  if (!booking) return booking;
  const admin = createAdminClient();
  const { data: otpRecord } = await admin
    .from('booking_otps')
    .select('otp_encrypted')
    .eq('booking_id', booking.id)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (booking.client_id === userId && otpRecord?.otp_encrypted) {
    try {
      booking.otp_code = decryptOtp(otpRecord.otp_encrypted);
    } catch (e) {
      console.error('Failed to decrypt OTP', e);
      booking.otp_code = null;
    }
  } else {
    delete booking.otp_code;
  }
  return booking;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    
    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const role = searchParams.get('role') || 'client';
    const column = role === 'worker' ? 'worker_id' : 'client_id';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : null;

    if (id) {
      const { data, error } = await admin
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return createErrorResponse('Booking not found', 404);

      // Check access permission
      const isParticipant = data.client_id === userId || data.worker_id === userId;
      
      if (!isParticipant) {
        // Active worker of same category can view broadcasting requests
        const { data: worker } = await admin.from('workers').select('id, category').eq('id', userId).maybeSingle();
        const canViewBroadcast = worker && data.category === worker.category && data.status === 'broadcasting';
        
        if (!canViewBroadcast) {
          return createErrorResponse('Forbidden', 403);
        }
      }
      return createResponse(await processBookingForResponse(data, userId));
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    let isWorker = profile?.role === 'worker';
    
    // Fallback: Check workers table directly if role mismatch (handles sync lag or profile inconsistencies)
    if (role === 'worker' && !isWorker) {
      const { data: worker } = await admin
        .from('workers')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      
      if (worker) {
        isWorker = true;
      }
    }

    if (role === 'worker' && !isWorker) {
      return createErrorResponse('Worker access only', 403);
    }

    let dbQuery = admin
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq(column, userId)
      .order('created_at', { ascending: false });

    if (limit !== null) {
      const start = offset || 0;
      const end = start + limit - 1;
      dbQuery = dbQuery.range(start, end);
    }

    const { data, error } = await dbQuery;

    if (error) throw error;
    
    const processedBookings = await Promise.all((data ?? []).map((b: any) => processBookingForResponse(b, userId)));
    return createResponse({ bookings: processedBookings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) {
      console.error('[POST /api/bookings] Unauthorized: No userId found');
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    console.log('[POST /api/bookings] Request body:', JSON.stringify(body, null, 2));
    
    const validated = createBookingSchema.parse(body);
    const admin = createAdminClient();

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    console.log('[POST /api/bookings] Validated payload:', {
      userId,
      category: validated.category,
      booking_type: validated.booking_type,
      ip,
    });

    // Call atomic create_booking_dispatch RPC
    let result: any = null;
    let rpcError: any = null;

    const rpcParams = {
      p_client_id: userId,
      p_category: validated.category,
      p_description: validated.description,
      p_location_address: validated.location_address,
      p_latitude: validated.latitude ?? null,
      p_longitude: validated.longitude ?? null,
      p_area_id: validated.area_id ?? null,
      p_payment_method: validated.payment_method,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_booking_type: validated.booking_type ?? 'asap',
      p_scheduled_for: validated.scheduled_for ?? null,
      p_scheduled_date: validated.scheduled_date ?? null,
      p_scheduled_time_slot: validated.scheduled_time_slot ?? 'asap',
      p_image_urls: validated.image_urls ?? [],
    };

    try {
      console.log('[POST /api/bookings] Calling RPC: create_booking_dispatch with params:', JSON.stringify(rpcParams, null, 2));
      const response = await admin.rpc('create_booking_dispatch', rpcParams);
      result = response.data;
      rpcError = response.error;
      
      if (rpcError) {
        console.error('[POST /api/bookings] RPC Error:', rpcError);
      } else {
        console.log('[POST /api/bookings] RPC Result:', JSON.stringify(result, null, 2));
      }
    } catch (err: any) {
      console.error('[POST /api/bookings] RPC Exception:', err);
      rpcError = err;
    }

    // Fallback if signature mismatch (PGRST202 or similar)
    if (rpcError && (rpcError.code === 'PGRST202' || String(rpcError.message).includes('Could not find the function'))) {
      console.warn('[POST /api/bookings] RPC signature mismatch, attempting fallback...');
      const fallbackParams = {
        p_client_id: userId,
        p_category: validated.category,
        p_description: validated.description,
        p_location_address: validated.location_address,
        p_latitude: validated.latitude ?? null,
        p_longitude: validated.longitude ?? null,
        p_area_id: validated.area_id ?? null,
        p_payment_method: validated.payment_method,
        p_ip_address: ip,
        p_user_agent: userAgent,
      };
      
      console.log('[POST /api/bookings] Calling Fallback RPC with params:', JSON.stringify(fallbackParams, null, 2));
      const fallbackResponse = await admin.rpc('create_booking_dispatch', fallbackParams);

      result = fallbackResponse.data;
      rpcError = fallbackResponse.error;

      if (rpcError) {
        console.error('[POST /api/bookings] Fallback RPC Error:', rpcError);
      } else {
        console.log('[POST /api/bookings] Fallback RPC Result:', JSON.stringify(result, null, 2));
      }

      if (!rpcError && result && result.success && result.booking_id) {
        // Hydrate additional fields manually using an update
        const updateData: any = {};
        if (validated.booking_type) updateData.booking_type = validated.booking_type;
        if (validated.scheduled_for) updateData.scheduled_for = validated.scheduled_for;
        if (validated.scheduled_date) updateData.scheduled_date = validated.scheduled_date;
        if (validated.scheduled_time_slot) updateData.scheduled_time_slot = validated.scheduled_time_slot;
        if (validated.image_urls) updateData.image_urls = validated.image_urls;
        if (validated.job_notes) updateData.job_notes = validated.job_notes;

        if (Object.keys(updateData).length > 0) {
          console.log('[POST /api/bookings] Updating additional fields for booking:', result.booking_id);
          await admin
            .from('bookings')
            .update(updateData)
            .eq('id', result.booking_id);
        }
      }
    }

    if (rpcError) {
      console.error('[POST /api/bookings] Final Error before throw:', rpcError);
      throw rpcError;
    }

    if (!result.success) {
      console.warn('[POST /api/bookings] RPC returned success:false', result);
      return createErrorResponse(result.error, result.code || 400);
    }

    // Fetch the fully hydrated booking structure
    console.log('[POST /api/bookings] Fetching hydrated booking details for id:', result.booking_id);
    const { data: booking, error: fetchErr } = await admin
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('id', result.booking_id)
      .single();

    if (fetchErr || !booking) {
      console.error('[POST /api/bookings] Fetch Error:', fetchErr);
      throw fetchErr || new Error('Failed to fetch booking details');
    }

    const statusCode = result.status === 'duplicate' ? 200 : 201;
    console.log('[POST /api/bookings] Booking successfully processed. Returning 201.');
    return createResponse(await processBookingForResponse(booking, userId), statusCode);
  } catch (error) {
    console.error('[POST /api/bookings] Global Catch:', error);
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Session / Device monitoring
    const { data: profile } = await admin
      .from('profiles')
      .select('last_ip, last_user_agent')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      if (profile.last_ip && (profile.last_ip !== ip || profile.last_user_agent !== userAgent)) {
        await admin.from('auth_audit_events').insert({
          user_id: userId,
          event_type: 'device_changed',
          ip_address: ip,
          user_agent: userAgent,
          metadata: {
            old_ip: profile.last_ip,
            old_user_agent: profile.last_user_agent,
            new_ip: ip,
            new_user_agent: userAgent,
          },
        });
      }

      await admin
        .from('profiles')
        .update({
          last_ip: ip,
          last_user_agent: userAgent,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return createErrorResponse('Booking id required', 400);

    const body = await request.json();
    const validated = updateBookingSchema.parse(body);

    const { data: existing, error: fetchError } = await admin
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) return createErrorResponse('Booking not found', 404);

    const isParticipant =
      existing.client_id === userId || existing.worker_id === userId;
    if (!isParticipant) return createErrorResponse('Forbidden', 403);

    const currentStatus = existing.status as BookingStatus;
    if (!canTransition(currentStatus, validated.status)) {
      return createErrorResponse(
        `Cannot change status from ${currentStatus} to ${validated.status}`,
        400
      );
    }

    if (validated.status === 'accepted') {
      return createErrorResponse('Job acceptance must be performed through the dispatch mechanism.', 400);
    }

    // Restrict worker specific states
    const workerOnlyStates = ['worker_arriving', 'en_route', 'arrived', 'work_started', 'started', 'work_completed', 'work_completed_pending_otp', 'otp_generated'];
    if (workerOnlyStates.includes(validated.status) && existing.worker_id !== userId) {
      return createErrorResponse('Only the assigned professional can transition to this status', 403);
    }

    // Intercept: Customer Confirming Completion directly
    if (validated.status === 'completed' && existing.client_id === userId) {
      if (existing.status === 'work_completed_pending_otp') {
        const { data: confirmResult, error: confirmError } = await admin.rpc('client_confirm_completion', {
          p_booking_id: id,
          p_client_id: userId,
        });

        if (confirmError) throw confirmError;
        if (!confirmResult?.success) {
          return createErrorResponse(confirmResult?.error || 'Direct confirmation failed', 400);
        }

        // Return updated booking details
        const { data: updatedBooking, error: fetchErr } = await admin
          .from('bookings')
          .select(BOOKING_SELECT)
          .eq('id', id)
          .single();

        if (fetchErr) throw fetchErr;

        // Notify worker that booking is completed
        if (existing.worker_id) {
          await admin.from('notifications').insert({
            user_id: existing.worker_id,
            type: 'booking_update',
            title: 'Job Completed By Customer ✓',
            content: `Customer has confirmed completion for your job.`,
            link_url: '/worker/jobs',
            metadata: {
              booking_id: id,
              status: 'completed',
            },
          });
        }

        return createResponse(await processBookingForResponse(updatedBooking, userId));
      }
    }

    // Intercept: Worker Work Completed & OTP Generation
    if (validated.status === 'work_completed_pending_otp') {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = hashOtp(otpCode);

      // Force transition if it's currently in work_started and RPC might be too restrictive
      if (existing.status === 'work_started' || existing.status === 'started' || existing.status === 'item_approved') {
        const { error: statusUpdateError } = await admin
          .from('bookings')
          .update({ 
            status: 'work_completed_pending_otp',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        
        if (statusUpdateError) {
          console.error('[PATCH /api/bookings] Failed to force transition to work_completed_pending_otp:', statusUpdateError);
          // We continue to RPC anyway as it might still work or we've already updated the status
        }
      }

      const { data: genResult, error: genError } = await admin.rpc('generate_completion_otp', {
        p_booking_id: id,
        p_otp_hash: otpHash,
        p_worker_id: userId,
      });

      if (genError) {
        console.error('[PATCH /api/bookings] RPC generate_completion_otp Error:', genError);
        throw genError;
      }
      
      if (!genResult?.success) {
        // If it failed because it was already in the state, that's okay, but other errors should be returned
        if (genResult?.error !== 'Booking is already in work completed pending state' && !genResult?.error?.includes('already')) {
          return createErrorResponse(genResult?.error || 'Failed to generate OTP', 400);
        }
      }

      // Retrieve customer phone number to log mock SMS
      const { data: clientData } = await admin
        .from('clients')
        .select('profile:profiles(phone)')
        .eq('id', existing.client_id)
        .maybeSingle();

      const customerPhone = (clientData as any)?.profile?.phone;
      console.log(`[SMS OTP] Sent 6-digit OTP ${otpCode} to customer phone: ${customerPhone}`);

      // Insert in-app notification
      await admin.from('notifications').insert({
        user_id: existing.client_id,
        type: 'booking_otp_completion',
        title: 'Job Completion OTP',
        content: `Your worker has marked the job as completed. Use OTP ${otpCode} to confirm completion. Only share it if you are satisfied.`,
        link_url: `/booking/${id}`,
        metadata: {
          booking_id: id,
          otp_code: otpCode,
        },
      });

      // Return updated booking details
      const { data: updatedBooking, error: fetchErr } = await admin
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('id', id)
        .single();
      
      if (fetchErr) throw fetchErr;
      return createResponse(await processBookingForResponse(updatedBooking, userId));
    }

    let otpCode: string | null = null;
    const updates: Record<string, unknown> = {
      status: validated.status,
      updated_at: new Date().toISOString(),
    };

    if (validated.status === 'broadcasting' && existing.status === 'no_worker_available') {
      // Create a fresh dispatch broadcast: delete old dispatch requests (cascades to attempts)
      await admin.from('dispatch_requests').delete().eq('booking_id', id);

      const { data: newDispatch, error: insErr } = await admin
        .from('dispatch_requests')
        .insert({
          booking_id: id,
          status: 'searching',
          max_radius_km: 15.0,
          current_radius_km: 5.0,
        })
        .select('*')
        .single();

      if (insErr) throw insErr;

      // Reset notified worker count
      updates.notified_worker_count = 0;

      // Trigger workers broadcast
      if (existing.latitude !== null && existing.longitude !== null) {
        await admin.rpc('notify_nearby_workers', {
          p_booking_id: id,
          p_category: existing.category,
          p_city_id: existing.city_id,
          p_latitude: existing.latitude,
          p_longitude: existing.longitude,
          p_radius_km: 5.0,
          p_attempt_num: 1,
        });
      }
    }

    if (validated.status === 'otp_generated') {
      otpCode = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiry

      await admin.from('booking_otps').insert({
        booking_id: id,
        otp_hash: hashOtp(otpCode),
        otp_encrypted: encryptOtp(otpCode),
        expires_at: expiresAt,
        attempts: 0,
        used: false,
      });

      updates.otp_used = false;
    }

    if (validated.payment_status) {
      if (existing.payment_method !== 'cash') {
        return createErrorResponse('Online payment status must be updated through the secure verification channel.', 400);
      }
      updates.payment_status = validated.payment_status;
    }

    if (validated.status === 'completed') {
      updates.payment_status = 'paid';
    }

    const { data, error } = await admin
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select(BOOKING_SELECT)
      .single();

    if (error) throw error;

    await admin.from('booking_timeline').insert({
      booking_id: id,
      status: validated.status,
      reason: validated.reason || `Status updated to ${validated.status}`,
      created_by: userId,
    });

    // Notify other party
    const targetUserId = userId === existing.client_id ? existing.worker_id : existing.client_id;
    if (targetUserId) {
      const notificationTitle = `Booking Status: ${validated.status.replace('_', ' ')}`;
      let notificationContent = `Your booking for ${existing.category} is now ${validated.status.replace('_', ' ')}.`;

      if (validated.status === 'otp_generated' && otpCode) {
        notificationContent = `OTP generated! Use OTP ${otpCode} to verify completion. Only share it if you are satisfied.`;
      }

      await admin.from('notifications').insert({
        user_id: targetUserId,
        type: 'booking_update',
        title: notificationTitle,
        content: notificationContent,
        link_url: userId === existing.client_id ? '/worker/dashboard' : '/activity',
        metadata: {
          booking_id: id,
          status: validated.status,
        },
      });
    }

    return createResponse(await processBookingForResponse(data, userId));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

