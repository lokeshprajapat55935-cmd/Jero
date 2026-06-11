import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorResponse, createResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from "zod";

const completeSchema = z.object({
  booking_id: z.string().uuid(),
  payment_method: z.enum(["cash", "online"]).optional(),
  material_charge: z.number().min(0).optional(), // optional client-approved material cost
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
  )
`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse("Unauthorized", 401);

    const body = completeSchema.parse(await request.json());
    const admin = createAdminClient();

    // Fetch booking
    const { data: booking, error: fetchError } = await admin
      .from("bookings")
      .select("*")
      .eq("id", body.booking_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!booking) return createErrorResponse("Booking not found", 404);

    // Only the assigned worker can trigger completion
    if (booking.worker_id !== userId) {
      return createErrorResponse("Only the assigned worker can complete this booking", 403);
    }

    // Must be awaiting_payment or otp_verified to proceed
    if (booking.status !== "awaiting_payment" && booking.status !== "otp_verified") {
      return createErrorResponse(
        `Cannot complete booking with status: ${booking.status}. OTP must be verified first.`,
        400
      );
    }

    // Protect: Prevent workers from completing online bookings to self-credit wallet
    if (booking.payment_method !== "cash") {
      return createErrorResponse(
        "Online payment bookings must be verified and completed by the client using the secure payment verification flow.",
        400
      );
    }

    // Must not have already processed payment
    if (booking.commission_deducted) {
      return createErrorResponse("Payment for this booking has already been processed", 409);
    }

    const paymentMethod = "cash";

    // Update material_charge if provided (client-approved extras — commission-free)
    if (body.material_charge !== undefined && body.material_charge > 0) {
      await admin
        .from("bookings")
        .update({
          material_charge: body.material_charge,
          total_price: Number(booking.service_charge) + body.material_charge - Number(booking.discount_amount || 0),
        })
        .eq("id", body.booking_id);
    }

    let commissionAmount = 0;
    let creditAmount = 0;

    // CASH FLOW: Deduct commission from worker wallet via atomic DB function
    const { data: commissionResult, error: commissionError } = await admin
      .rpc("process_booking_commission", { p_booking_id: body.booking_id });

    if (commissionError) throw commissionError;

    const result = commissionResult as { success: boolean; commission?: number; new_balance?: number; reason?: string };

    if (!result?.success) {
      return createErrorResponse(
        `Commission processing failed: ${result?.reason || "Unknown error"}`,
        500
      );
    }

    commissionAmount = result.commission || 0;

    // Mark booking as completed (cash)
    const { error: completeError } = await admin
      .from("bookings")
      .update({
        status: "completed",
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.booking_id);

    if (completeError) throw completeError;

    // Log successful verification
    await admin.from("payment_verifications").insert({
      booking_id: booking.id,
      transaction_id: null,
      payment_method: paymentMethod,
      reference_id: null,
      status: "verified",
      verification_notes: "Cash payment received and processed by worker.",
      verified_by: userId,
      verified_at: new Date().toISOString(),
    });

    // Fetch updated booking to return
    const { data: updatedBooking } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", body.booking_id)
      .single();

    // Add timeline entry
    await admin.from("booking_timeline").insert({
      booking_id: body.booking_id,
      status: "completed",
      reason: `Cash payment confirmed. Platform commission of ₹${commissionAmount} deducted from worker wallet.`,
      created_by: userId,
    });

    // Notify client
    await admin.from("notifications").insert({
      user_id: booking.client_id,
      type: "booking_update",
      title: "Booking Completed ✓",
      content: `Your ${booking.category} booking is complete. Cash payment confirmed.`,
      link_url: "/activity",
      metadata: {
        booking_id: body.booking_id,
        status: "completed",
      },
    });

    return createResponse({
      booking: updatedBooking,
      payment_method: paymentMethod,
      commission_deducted: commissionAmount,
      credit_received: creditAmount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid payload", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
