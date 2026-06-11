import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorResponse, createResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from "zod";

const acceptSchema = z.object({
  emergency_request_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse("Unauthorized", 401);

    const { emergency_request_id } = acceptSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: worker } = await admin
      .from("workers")
      .select("id, category, availability, base_service_charge, visit_charge, profile:profiles(full_name, phone)")
      .eq("id", userId)
      .eq("status", "approved")
      .maybeSingle();

    if (!worker) return createErrorResponse("Only active workers can accept emergency requests.", 403);
    if (worker.availability?.status !== "available" || worker.availability?.emergency_enabled === false) {
      return createErrorResponse("Turn on emergency availability before accepting.", 403);
    }
    const workerProfile = Array.isArray(worker.profile) ? worker.profile[0] : worker.profile;

    const now = new Date().toISOString();
    const { data: lockedRequest, error: lockError } = await admin
      .from("emergency_requests")
      .update({
        status: "accepted",
        accepted_worker_id: userId,
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", emergency_request_id)
      .eq("status", "dispatching")
      .gt("expires_at", now)
      .select("*")
      .maybeSingle();

    if (lockError) throw lockError;

    if (!lockedRequest) {
      await admin.from("emergency_acceptances").upsert({
        emergency_request_id,
        worker_id: userId,
        accepted: false,
        result: "lost",
      }, { onConflict: "emergency_request_id,worker_id" });

      return createErrorResponse("Someone else accepted this request first.", 409);
    }

    await admin.from("emergency_acceptances").upsert({
      emergency_request_id,
      worker_id: userId,
      accepted: true,
      result: "won",
    }, { onConflict: "emergency_request_id,worker_id" });

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .insert({
        client_id: lockedRequest.client_id,
        worker_id: userId,
        status: "accepted",
        total_price: 0,
        scheduled_at: now,
        city_id: lockedRequest.city_id,
        emergency_request_id,
      })
      .select("*")
      .single();

    if (bookingError) throw bookingError;

    await admin.from("booking_timeline").insert({
      booking_id: booking.id,
      status: "accepted",
      reason: "Emergency request accepted by worker",
      created_by: userId,
    });

    await admin.from("notifications").insert([
      {
        user_id: lockedRequest.client_id,
        type: "booking_update",
        title: "Worker accepted",
        content: `${workerProfile?.full_name || "A worker"} is on the way.`,
        link_url: "/activity",
        metadata: {
          emergency_request_id,
          booking_id: booking.id,
          worker_id: userId,
          status: "accepted",
        },
      },
    ]);

    // Notify other workers to remove it from their UI
    const { data: notifiedWorkers } = await admin
      .from("notifications")
      .select("user_id")
      .eq("type", "emergency_request")
      .contains("metadata", { emergency_request_id })
      .neq("user_id", userId);

    if (notifiedWorkers && notifiedWorkers.length > 0) {
      const cancellationNotifs = notifiedWorkers.map((w: any) => ({
        user_id: w.user_id,
        type: "emergency_request_cancelled",
        title: "Request filled",
        content: "Another worker accepted this request.",
        link_url: "",
        metadata: { emergency_request_id },
      }));
      await admin.from("notifications").insert(cancellationNotifs);
    }

    return createResponse({ request: lockedRequest, booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid accept request", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
