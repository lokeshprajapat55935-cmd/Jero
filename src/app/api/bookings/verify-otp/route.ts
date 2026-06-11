import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorResponse, createResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { hashOtp } from "@/lib/booking/otp-crypto";
import { z } from "zod";

const verifyOtpSchema = z.object({
  booking_id: z.string().uuid(),
  otp: z.string().min(4).max(6),
});

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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse("Unauthorized", 401);

    const { booking_id, otp } = verifyOtpSchema.parse(await request.json());
    const admin = createAdminClient();
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 1. Rate Limiting check: 5 attempts per 10 minutes per booking & user
    const { data: bookingLimitAllowed } = await admin.rpc('check_rate_limit', {
      p_key: `rate:otp:verify:booking:${booking_id}`,
      p_max_hits: 5,
      p_window_seconds: 600,
    });

    const { data: userLimitAllowed } = await admin.rpc('check_rate_limit', {
      p_key: `rate:otp:verify:user:${userId}`,
      p_max_hits: 5,
      p_window_seconds: 600,
    });

    if (!bookingLimitAllowed || !userLimitAllowed) {
      await admin.from('security_logs').insert({
        user_id: userId,
        event_type: 'rate_limit_exceeded',
        severity: 'medium',
        description: `OTP verification rate limit exceeded for Booking: ${booking_id}, User: ${userId}`,
        ip_address: ip,
        user_agent: userAgent,
      });
      return createErrorResponse('Too many verification attempts. Please wait 10 minutes.', 429);
    }

    // Fetch booking status to check if it's the new OTP system
    const { data: existingBooking, error: bookingFetchError } = await admin
      .from("bookings")
      .select("status, client_id, worker_id, service_charge, total_price, payment_method")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingFetchError || !existingBooking) {
      return createErrorResponse(bookingFetchError?.message || "Booking not found", 404);
    }

    const inputHash = hashOtp(otp);

    if (existingBooking.status === "work_completed_pending_otp") {
      // Run new OTP completion verification
      const { data: rpcResult, error: rpcError } = await admin.rpc('verify_completion_otp', {
        p_booking_id: booking_id,
        p_otp_hash: inputHash,
        p_worker_id: userId,
      });

      if (rpcError) throw rpcError;

      const result = rpcResult as { success: boolean; error?: string; code?: number };
      if (!result?.success) {
        return createErrorResponse(result?.error || 'Verification failed', result?.code || 400);
      }

      // Retrieve updated booking details
      const { data: updatedBooking, error: fetchError } = await admin
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("id", booking_id)
        .single();

      if (fetchError || !updatedBooking) {
        return createErrorResponse("Failed to fetch updated booking details", 500);
      }

      // Notify client that job is completed
      await admin.from("notifications").insert({
        user_id: updatedBooking.client_id,
        type: "booking_update",
        title: "Booking Completed ✓",
        content: `Your booking for ${updatedBooking.category} is completed. OTP verified successfully.`,
        link_url: "/activity",
        metadata: {
          booking_id: updatedBooking.id,
          status: "completed",
        },
      });

      return createResponse(updatedBooking);
    }

    // LEGACY OTP SYSTEM:
    // 2. Call secure atomic database OTP verification function
    const { data: rpcResult, error: rpcError } = await admin.rpc('verify_booking_otp', {
      p_booking_id: booking_id,
      p_otp_hash: inputHash,
      p_user_id: userId,
    });

    if (rpcError) throw rpcError;

    const result = rpcResult as { success: boolean; reason?: string; code?: number };
    if (!result?.success) {
      return createErrorResponse(result?.reason || 'Verification failed', result?.code || 400);
    }

    // 3. Retrieve updated booking details
    const { data: updatedBooking, error: fetchError } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", booking_id)
      .single();

    if (fetchError || !updatedBooking) {
      return createErrorResponse("Failed to fetch updated booking details", 500);
    }

    // 4. Notify client — prompt them to pay
    await admin.from("notifications").insert({
      user_id: updatedBooking.client_id,
      type: "booking_update",
      title: "Work Verified ✓",
      content: `OTP verified. Please pay ₹${updatedBooking.total_price} via locked payment mode: ${updatedBooking.payment_method?.toUpperCase()} to complete the booking.`,
      link_url: "/activity",
      metadata: {
        booking_id: updatedBooking.id,
        status: "awaiting_payment",
        payment_method: updatedBooking.payment_method,
      },
    });

    // Determine commission preview for response
    const commissionRate = 0.10;
    const serviceCharge = Number(updatedBooking.service_charge || updatedBooking.total_price || 0);
    const commissionPreview = updatedBooking.payment_method === 'cash'
      ? Math.round(serviceCharge * commissionRate * 100) / 100
      : 0;

    return createResponse({
      ...updatedBooking,
      commission_preview: commissionPreview,
      payment_method: updatedBooking.payment_method,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid verify payload", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
