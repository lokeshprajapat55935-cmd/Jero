import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { getPaymentProvider } from '@/lib/payments/factory';
import { z } from "zod";

const verifyPaymentSchema = z.object({
  booking_id: z.string().uuid(),
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpay_signature: z.string().optional(),
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

    const body = verifyPaymentSchema.parse(await request.json());
    const admin = createAdminClient();
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // 1. Rate Limiting: 5 attempts per 10 minutes per client
    const { data: limitAllowed } = await admin.rpc("check_rate_limit", {
      p_key: `rate:payment:verify:${userId}`,
      p_max_hits: 5,
      p_window_seconds: 600,
    });

    if (!limitAllowed) {
      await admin.from("security_logs").insert({
        user_id: userId,
        event_type: "rate_limit_exceeded",
        severity: "medium",
        description: `Payment verification rate limit exceeded for client: ${userId}`,
        ip_address: ip,
        user_agent: userAgent,
      });
      return createErrorResponse("Too many payment verification attempts. Please wait 10 minutes.", 429);
    }

    // Fetch the booking details
    const { data: booking, error: fetchError } = await admin
      .from("bookings")
      .select("*")
      .eq("id", body.booking_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!booking) return createErrorResponse("Booking not found", 404);

    // 3. Enforce Strict State Verification
    const allowedStatuses = ["item_approved", "awaiting_payment", "payment_processing", "payment_pending", "otp_verified"];
    if (!allowedStatuses.includes(booking.status)) {
      return createErrorResponse(
        `Cannot process payment for booking in status: ${booking.status}. Bill must be approved first.`,
        400
      );
    }

    if (booking.payment_method === 'cash') {
      return createErrorResponse("Cash payments are verified implicitly via OTP in the new flow.", 400);
    }

    // 5. Update material charge if provided by client (approved material costs)
    let finalTotalPrice = Number(booking.total_price);
    if (body.material_charge !== undefined && body.material_charge > 0) {
      finalTotalPrice = Number(booking.service_charge) + body.material_charge - Number(booking.discount_amount || 0);
      await admin
        .from("bookings")
        .update({
          material_charge: body.material_charge,
          total_price: finalTotalPrice,
        })
        .eq("id", body.booking_id);
    }

    const now = new Date().toISOString();

    // 6. Transition state to payment_processing and record start time
    await admin
      .from("bookings")
      .update({
        status: "payment_processing",
        payment_started_at: now,
        updated_at: now,
      })
      .eq("id", body.booking_id);

    // 7. Insert Audit Record in payment_transactions
    const { data: transactionRecord, error: txError } = await admin
      .from("payment_transactions")
      .insert({
        booking_id: booking.id,
        client_id: booking.client_id,
        worker_id: booking.worker_id,
        payment_method: body.payment_method,
        payment_status: "processing",
        amount: finalTotalPrice,
        reference_id: body.payment_reference || null,
        metadata: {
          client_ip: request.headers.get("x-forwarded-for") || "local",
          material_charge_applied: body.material_charge || 0,
        },
      })
      .select()
      .single();

    if (txError) throw txError;

    // Log to timeline
    await admin.from("booking_timeline").insert({
      booking_id: booking.id,
      status: "payment_processing",
      reason: `Initiated ${body.payment_method.toUpperCase()} payment verification flow for ₹${finalTotalPrice}.`,
      created_by: userId,
    });

    let commissionAmount = 0;
    let creditAmount = 0;

    // 8. Handle Payment Method Specific Logic
    // ONLINE FLOW (UPI/CARD): Enforce Razorpay Signature Validation
    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return createErrorResponse("Missing required payment verification details", 400);
    }

    const provider = getPaymentProvider();
    const verification = await provider.verifyPayment({
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
    });

    if (!verification.success) {
      await handlePaymentFailure(
        admin, 
        booking.id, 
        transactionRecord.id, 
        "Razorpay signature verification failed", 
        userId, 
        booking.payment_method
      );
      return createErrorResponse("Payment signature verification failed", 400);
    }

    await admin.from("payment_transactions").update({ payment_status: "paid" }).eq("id", transactionRecord.id);

    // Generate OTP
    const { hashOtp } = await import('@/lib/booking/otp-crypto');
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashOtp(otpCode);

    const { data: genResult, error: genError } = await admin.rpc('generate_completion_otp', {
      p_booking_id: booking.id,
      p_otp_hash: otpHash,
      p_worker_id: booking.worker_id,
    });

    if (genError) {
      console.error('[Payment Verify] RPC generate_completion_otp Error:', genError);
      // We still update the booking status to otp_generated even if RPC fails due to existing OTP
    }

    await admin
      .from("bookings")
      .update({
        status: "otp_generated",
        payment_status: "paid",
        payment_completed_at: now,
        updated_at: now,
        payment_reference: body.razorpay_payment_id,
      })
      .eq("id", booking.id);

    // Log successful verification
    await admin.from("payment_verifications").insert({
      booking_id: booking.id,
      transaction_id: transactionRecord.id,
      payment_method: booking.payment_method,
      reference_id: body.razorpay_payment_id || null,
      status: "verified",
      verification_notes: `${booking.payment_method.toUpperCase()} payment verified.`,
      verified_by: userId,
      verified_at: now,
    });
    
    await admin.from("booking_timeline").insert({
      booking_id: booking.id,
      status: "otp_generated",
      reason: `Online payment confirmed. Generated OTP for completion.`,
      created_by: userId,
    });

    // 9. Fetch final updated booking and notify both parties
    const { data: finalBooking } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", booking.id)
      .single();

    // Notify Client
    await admin.from("notifications").insert({
      user_id: booking.client_id,
      type: "booking_otp_completion",
      title: "Payment Confirmed & OTP Generated ✓",
      content: `Your completion OTP is ${otpCode}. Provide this to the professional ONLY if you are satisfied with the completed work.`,
      link_url: `/booking/${booking.id}`,
      metadata: {
        booking_id: booking.id,
        otp_code: otpCode,
        status: finalBooking?.status || booking.status || 'otp_generated',
      },
    });

    // Notify Worker
      await admin.from("notifications").insert({
        user_id: booking.worker_id,
        type: "booking_update",
        title: "Payment Confirmed 🪙",
        content: `Online payment confirmed. Please ask the customer for the OTP to complete the booking.`,
        link_url: "/worker/dashboard",
        metadata: {
          booking_id: booking.id,
          status: finalBooking?.status || booking.status || 'otp_generated',
        },
      });

    return createResponse({
      success: true,
      booking: finalBooking || booking,
      amount: finalTotalPrice,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid verify payment payload", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

// Helper to log failures cleanly
async function handlePaymentFailure(
  admin: any,
  bookingId: string,
  transactionId: string,
  errorMsg: string,
  actorId: string,
  paymentMethod: string
) {
  const now = new Date().toISOString();

  // Reset booking to awaiting_payment
  await admin
    .from("bookings")
    .update({
      status: "awaiting_payment",
      payment_status: "failed",
      updated_at: now,
    })
    .eq("id", bookingId);

  // Update audit log
  await admin
    .from("payment_transactions")
    .update({
      payment_status: "failed",
      error_message: errorMsg,
      updated_at: now,
    })
    .eq("id", transactionId);

  // Log in timeline
  await admin.from("booking_timeline").insert({
    booking_id: bookingId,
    status: "awaiting_payment",
    reason: `Payment verification failed: ${errorMsg}. Reset to awaiting payment.`,
    created_by: actorId,
  });

  // Log failure in payment_verifications
  await admin.from("payment_verifications").insert({
    booking_id: bookingId,
    transaction_id: transactionId,
    payment_method: paymentMethod,
    status: "failed",
    verification_notes: errorMsg,
    verified_by: actorId,
    verified_at: now,
  });

  // Check client repeated failures: >= 3 failed in 24 hours triggers fraud flag
  const { count: failedCount } = await admin
    .from("payment_transactions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", actorId)
    .eq("payment_status", "failed")
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (failedCount && failedCount >= 3) {
    await admin.from("fraud_flags").insert({
      user_id: actorId,
      flag_type: "wallet_abuse",
      severity: "high",
      status: "open",
      description: `Client has ${failedCount} failed payment attempts in the last 24 hours.`,
      booking_id: bookingId,
      evidence: { failed_attempts_24h: failedCount },
    });

    // Also log a high severity security log
    await admin.from("security_logs").insert({
      user_id: actorId,
      event_type: "unauthorized_access",
      severity: "high",
      description: `Client ${actorId} triggered a fraud warning for payment abuse: ${failedCount} failed attempts in 24h.`,
      metadata: { failed_attempts_24h: failedCount, last_booking_id: bookingId },
    });
  }
}
