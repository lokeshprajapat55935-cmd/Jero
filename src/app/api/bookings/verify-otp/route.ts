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
      .select("status, client_id, worker_id, service_charge, visit_charge, material_charge, total_price, payment_method, commission_deducted")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingFetchError || !existingBooking) {
      return createErrorResponse(bookingFetchError?.message || "Booking not found", 404);
    }

    if (existingBooking.worker_id !== userId) {
      return createErrorResponse('Only the assigned professional can verify completion.', 403);
    }

    const inputHash = hashOtp(otp);

    // Fetch OTP record
    const { data: otpRecord } = await admin
      .from('booking_otps')
      .select('*')
      .eq('booking_id', booking_id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRecord) {
      return createErrorResponse('Verification code has expired or is invalid. Request a new one.', 400);
    }

    if (otpRecord.attempts >= otpRecord.max_attempts) {
      await admin.from('bookings').update({ status: 'disputed', updated_at: new Date().toISOString() }).eq('id', booking_id);
      return createErrorResponse('Too many verification attempts. Booking marked as disputed.', 400);
    }

    if (otpRecord.otp_hash !== inputHash) {
      await admin.from('booking_otps').update({ attempts: otpRecord.attempts + 1 }).eq('id', otpRecord.id);
      return createErrorResponse('Invalid OTP verification code.', 400);
    }

    // OTP Match!
    await admin.from('booking_otps').update({ used: true }).eq('id', otpRecord.id);

    // Calculate commission (10% of Service + Visit Charge only)
    const commissionRate = 0.10;
    const baseAmount = Number(existingBooking.service_charge || 0) + Number(existingBooking.visit_charge || 0);
    const commissionAmount = Math.round(baseAmount * commissionRate * 100) / 100;

    const isCash = existingBooking.payment_method === 'cash';

    if (isCash && !existingBooking.commission_deducted) {
      // Deduct commission from worker's wallet
      const { data: wallet } = await admin.from('worker_wallets').select('balance').eq('worker_id', existingBooking.worker_id).single();
      const currentBalance = wallet ? Number(wallet.balance) : 0;
      const newBalance = currentBalance - commissionAmount;

      await admin.from('worker_wallets').upsert({ worker_id: existingBooking.worker_id, balance: newBalance, updated_at: new Date().toISOString() });
      await admin.from('wallet_transactions').insert({
        worker_id: existingBooking.worker_id,
        type: 'commission',
        amount: commissionAmount,
        balance_after: newBalance,
        booking_id: booking_id,
        description: `Platform commission (10%) on service charge for booking #${booking_id.substring(0, 8)}`,
      });
    }

    if (!isCash && !existingBooking.commission_deducted) {
      // Online payment. The worker gets (Service + Visit + Materials) - Commission
      // Wait, is it 0 commission for online? The prompt says "Ensure commission applies only to Service + Travel, deducting only after OTP."
      // This implies commission applies REGARDLESS of payment method.
      const workerCredit = Number(existingBooking.total_price) - commissionAmount;
      
      const { data: wallet } = await admin.from('worker_wallets').select('balance').eq('worker_id', existingBooking.worker_id).single();
      const currentBalance = wallet ? Number(wallet.balance) : 0;
      const newBalance = currentBalance + workerCredit;

      await admin.from('worker_wallets').upsert({ worker_id: existingBooking.worker_id, balance: newBalance, updated_at: new Date().toISOString() });
      await admin.from('wallet_transactions').insert({
        worker_id: existingBooking.worker_id,
        type: 'online_credit',
        amount: workerCredit,
        balance_after: newBalance,
        booking_id: booking_id,
        description: `Online payment received minus commission for booking #${booking_id.substring(0, 8)}`,
      });
    }

    const now = new Date().toISOString();
    // Complete the booking
    await admin.from('bookings').update({
      status: 'completed',
      payment_status: 'paid',
      commission_deducted: true,
      commission_amount: commissionAmount,
      updated_at: now,
      otp_used: true,
    }).eq('id', booking_id);

    await admin.from('active_bookings').delete().eq('booking_id', booking_id);
    await admin.from('worker_availability').upsert({ worker_id: existingBooking.worker_id, status: 'available', last_active_at: now, current_booking_id: null });

    await admin.from("booking_timeline").insert({
      booking_id: booking_id,
      status: "completed",
      reason: `OTP verified and booking completed. Commission of ₹${commissionAmount} deducted.`,
      created_by: userId,
    });

    const { data: updatedBooking } = await admin.from('bookings').select(BOOKING_SELECT).eq('id', booking_id).single();

    // Notify client
    await admin.from("notifications").insert({
      user_id: updatedBooking.client_id,
      type: "booking_update",
      title: "Booking Completed ✓",
      content: `Your booking for ${updatedBooking.category} is completed. OTP verified successfully.`,
      link_url: "/activity",
      metadata: { booking_id: updatedBooking.id, status: "completed" },
    });

    return createResponse({
      ...updatedBooking,
      commission_preview: commissionAmount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid verify payload", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
