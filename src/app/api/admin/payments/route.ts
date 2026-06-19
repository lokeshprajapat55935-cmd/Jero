import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorResponse, createResponse, handleApiError } from "@/lib/api-utils";
import { requireAdmin } from "@/lib/auth/admin";
import { z } from "zod";

const adminActionSchema = z.object({
  booking_id: z.string().uuid(),
  action: z.enum(["manual_verify", "refund", "resolve_dispute"]),
  reference_id: z.string().optional(),
  reason: z.string().min(5),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 100;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const { data, error } = await admin
      .from("payment_transactions")
      .select(`
        *,
        client:profiles!payment_transactions_client_id_fkey(full_name, email, phone),
        worker:profiles!payment_transactions_worker_id_fkey(full_name, email, phone)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return createResponse({ transactions: data || [] });

  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = adminActionSchema.parse(await request.json());
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: booking, error: fetchError } = await admin
      .from("bookings")
      .select("id, status, client_id, worker_id, payment_method, total_price, commission_deducted, payment_status, service_charge, commission_amount")
      .eq("id", body.booking_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!booking) return createErrorResponse("Booking not found", 404);

    if (body.action === "manual_verify") {
      // Force finalize as paid
      const finalStatus = "completed";
      const ref = body.reference_id || `ADMIN-FORCE-${Date.now()}`;

      // Update booking
      await admin
        .from("bookings")
        .update({
          status: finalStatus,
          payment_status: "paid",
          payment_reference: ref,
          payment_completed_at: now,
          updated_at: now,
        })
        .eq("id", body.booking_id);

      // Record transaction
      await admin.from("payment_transactions").insert({
        booking_id: booking.id,
        client_id: booking.client_id,
        worker_id: booking.worker_id,
        payment_method: booking.payment_method,
        payment_status: "paid",
        amount: booking.total_price,
        reference_id: ref,
        metadata: { admin_id: gate.user?.id, reason: body.reason, force_verified: true },
      });

      // Credit worker wallet if online payment
      const isOnline = booking.payment_method === "upi" || booking.payment_method === "card";
      if (isOnline && !booking.commission_deducted) {
        await admin.rpc("process_online_payment_credit", { p_booking_id: booking.id });
      } else if (!isOnline && !booking.commission_deducted) {
        await admin.rpc("process_booking_commission", { p_booking_id: booking.id });
      }

      await admin.from("booking_timeline").insert({
        booking_id: booking.id,
        status: finalStatus,
        reason: `Manually verified by administrator: ${body.reason}. Reference: ${ref}`,
        created_by: gate.user?.id,
      });

      const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      await admin.rpc('log_admin_action', {
        p_admin_id: gate.user?.id,
        p_action_type: 'payment_manual_verify',
        p_target_type: 'booking',
        p_target_id: booking.id,
        p_target_name: `Booking Payment ${booking.id.substring(0, 8)}`,
        p_old_value: { payment_status: booking.payment_status },
        p_new_value: { payment_status: 'paid', reference: ref },
        p_reason: body.reason,
        p_ip_address: ipAddress
      });

      return createResponse({ success: true, message: "Transaction manually verified" });
    }

    if (body.action === "refund") {
      if (booking.payment_status !== "paid") {
        return createErrorResponse("Can only refund a paid booking", 400);
      }

      // Record transaction
      await admin.from("payment_transactions").insert({
        booking_id: booking.id,
        client_id: booking.client_id,
        worker_id: booking.worker_id,
        payment_method: booking.payment_method,
        payment_status: "pending",
        amount: -booking.total_price, // negative signifies refund
        reference_id: `REFUND-${Date.now()}`,
        metadata: { admin_id: gate.user?.id, reason: body.reason },
      });

      // Update booking status to cancelled/refunded
      await admin
        .from("bookings")
        .update({
          status: "cancelled",
          payment_status: "pending",
          updated_at: now,
        })
        .eq("id", body.booking_id);

      // If online payment credit was given, deduct it back from worker's wallet
      const isOnline = booking.payment_method === "upi" || booking.payment_method === "card";
      if (isOnline) {
        const refundAmount = Number(booking.service_charge || booking.total_price);
        await admin.rpc("admin_wallet_adjustment", {
          p_worker_id: booking.worker_id,
          p_amount: refundAmount,
          p_type: 'debit',
          p_description: `Debit adjustment due to refund on booking #${booking.id.substring(0, 8)}`,
          p_admin_id: gate.user?.id,
        });
      } else {
        // If cash payment commission was deducted, credit it back to worker's wallet
        const commissionAmount = Number(booking.commission_amount || 0);
        if (commissionAmount > 0) {
          await admin.rpc("admin_wallet_adjustment", {
            p_worker_id: booking.worker_id,
            p_amount: commissionAmount,
            p_type: 'credit',
            p_description: `Credit adjustment: refunded commission for booking #${booking.id.substring(0, 8)}`,
            p_admin_id: gate.user?.id,
          });
        }
      }

      await admin.from("booking_timeline").insert({
        booking_id: booking.id,
        status: "cancelled",
        reason: `Refund issued by administrator: ${body.reason}`,
        created_by: gate.user?.id,
      });

      const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      await admin.rpc('log_admin_action', {
        p_admin_id: gate.user?.id,
        p_action_type: 'payment_refund',
        p_target_type: 'booking',
        p_target_id: booking.id,
        p_target_name: `Booking Refund ${booking.id.substring(0, 8)}`,
        p_old_value: { status: booking.status, payment_status: booking.payment_status },
        p_new_value: { status: 'cancelled', payment_status: 'pending' },
        p_reason: body.reason,
        p_ip_address: ipAddress
      });

      return createResponse({ success: true, message: "Refund issued successfully" });
    }

    if (body.action === "resolve_dispute") {
      // Transition from disputed to completed or cancelled
      const finalStatus = body.reference_id === "complete" ? "completed" : "cancelled";

      await admin
        .from("bookings")
        .update({
          status: finalStatus,
          updated_at: now,
        })
        .eq("id", body.booking_id);

      await admin.from("booking_timeline").insert({
        booking_id: booking.id,
        status: finalStatus,
        reason: `Dispute resolved by administrator: ${body.reason}. Status marked as ${finalStatus}.`,
        created_by: gate.user?.id,
      });

      const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      await admin.rpc('log_admin_action', {
        p_admin_id: gate.user?.id,
        p_action_type: 'dispute_resolve',
        p_target_type: 'booking',
        p_target_id: booking.id,
        p_target_name: `Booking Dispute ${booking.id.substring(0, 8)}`,
        p_old_value: { status: booking.status },
        p_new_value: { status: finalStatus },
        p_reason: body.reason,
        p_ip_address: ipAddress
      });

      return createResponse({ success: true, message: "Dispute resolved successfully" });
    }

    return createErrorResponse("Unsupported action", 400);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid payload", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
