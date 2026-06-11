import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorResponse, createResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from "zod";

const acceptSchema = z.object({
  booking_id: z.string().uuid(),
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

    const { booking_id } = acceptSchema.parse(await request.json());
    const admin = createAdminClient();

    // Verify worker is active and online
    const { data: worker } = await admin
      .from("workers")
      .select(`
        id,
        category,
        status,
        profile:profiles(full_name, phone),
        availabilityDb:worker_availability(status)
      `)
      .eq("id", userId)
      .eq("status", "approved")
      .maybeSingle();

    if (!worker) {
      return createErrorResponse("Only active professionals can accept requests.", 403);
    }

    const availabilityDb = Array.isArray(worker.availabilityDb) ? worker.availabilityDb[0] : worker.availabilityDb;
    const workerStatus = (availabilityDb as any)?.status || 'offline';

    // Accept both 'online' and 'available' — the toggle endpoint sets 'online'
    if (workerStatus !== "available" && workerStatus !== "online") {
      return createErrorResponse("Please go online before accepting requests.", 403);
    }

    const workerProfile = Array.isArray(worker.profile) ? worker.profile[0] : worker.profile;
    const now = new Date().toISOString();

    // Perform atomic accept update via RPC to guarantee lock safety and update availability
    const { data: acceptedRow, error: rpcError } = await admin.rpc("accept_dispatch_booking", {
      p_booking_id: booking_id,
      p_worker_id: userId,
    });

    if (rpcError) {
      return createErrorResponse(rpcError.message || "Someone else accepted this booking first.", 409);
    }

    // Now fetch the fully hydrated booking structure
    const { data: booking, error: fetchErr } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", booking_id)
      .single();

    if (fetchErr || !booking) {
      throw fetchErr || new Error("Failed to fetch booking details");
    }

    // Insert timeline entry
    await admin.from("booking_timeline").insert({
      booking_id: booking.id,
      status: "accepted",
      reason: "Booking accepted by worker",
      created_by: userId,
    });

    // Create chat conversation
    await admin.from("conversations").insert({
      booking_id: booking.id,
      participant_ids: [booking.client_id, userId],
      last_message_at: now,
    });

    // Notify client
    await admin.from("notifications").insert({
      user_id: booking.client_id,
      type: "booking_update",
      title: "Worker Accepted Your Booking",
      content: `${workerProfile?.full_name || "A professional"} is on the way.`,
      link_url: "/activity",
      metadata: {
        booking_id: booking.id,
        worker_id: userId,
        status: "accepted",
      },
    });

    // Notify other workers to remove request from their dashboard
    const { data: notifiedWorkers } = await admin
      .from("notifications")
      .select("user_id")
      .eq("type", "booking_request")
      .contains("metadata", { booking_id })
      .neq("user_id", userId);

    if (notifiedWorkers && notifiedWorkers.length > 0) {
      const cancellationNotifs = notifiedWorkers.map((w: any) => ({
        user_id: w.user_id,
        type: "booking_request_cancelled",
        title: "Request filled",
        content: "Another worker accepted this request.",
        link_url: "",
        metadata: { booking_id },
      }));
      await admin.from("notifications").insert(cancellationNotifs);
    }

    return createResponse(booking);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid accept payload", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
