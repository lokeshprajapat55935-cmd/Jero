import { createClient } from "@/lib/supabase/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorResponse, createResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from "zod";

const EMERGENCY_WINDOW_SECONDS = 3600; // 1 hour for quick booking stay active

const emergencyRequestSchema = z.object({
  category: z.string().min(2).max(60),
  location_address: z.string().max(240).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  area_id: z.string().uuid().nullable().optional(),
});

function isEmergencyReady(availability: any) {
  if (!availability) return true;
  return availability.status === "available" && availability.emergency_enabled !== false;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse("Unauthorized", 401);

    const body = emergencyRequestSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: client } = await admin
      .from("clients")
      .select("id, city_id, area_id")
      .eq("id", userId)
      .maybeSingle();

    if (!client) {
      return createErrorResponse("Complete client onboarding before emergency booking.", 403);
    }

    const { data: duplicate } = await admin
      .from("emergency_requests")
      .select("id, status, expires_at")
      .eq("client_id", userId)
      .eq("status", "dispatching")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return createResponse(duplicate);
    }

    const cityId = client.city_id || null;
    const areaId = body.area_id || client.area_id || null;
    const expiresAt = new Date(Date.now() + EMERGENCY_WINDOW_SECONDS * 1000).toISOString();

    const { data: emergencyRequest, error: requestError } = await admin
      .from("emergency_requests")
      .insert({
        client_id: userId,
        category: body.category,
        location_address: body.location_address || "Current location",
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        city_id: cityId,
        area_id: areaId,
        expires_at: expiresAt,
        status: "dispatching",
      })
      .select("*")
      .single();

    if (requestError) throw requestError;

    let workerQuery = admin
      .from("workers")
      .select("id, category, availability, profile:profiles(phone, full_name), location:worker_locations!inner(city_id, area_id)")
      .eq("status", "approved")
      .eq("category", body.category);

    if (cityId) workerQuery = workerQuery.eq("location.city_id", cityId);
    if (areaId) workerQuery = workerQuery.or(`location.area_id.eq.${areaId},location.area_id.is.null`);

    const { data: workers, error: workersError } = await workerQuery.limit(25);
    if (workersError) throw workersError;

    const eligibleWorkers = (workers || []).filter((worker: any) => isEmergencyReady(worker.availability));

    if (eligibleWorkers.length > 0) {
      await admin.from("notifications").insert(
        eligibleWorkers.map((worker: any) => ({
          user_id: worker.id,
          type: "emergency_request",
          title: "Emergency booking nearby",
          content: `${body.category} request. Accept within 60 seconds.`,
          link_url: "/worker/dashboard",
          metadata: {
            emergency_request_id: emergencyRequest.id,
            category: body.category,
            expires_at: expiresAt,
            sms_pending: Boolean(worker.profile?.phone),
            push_pending: true,
            priority: "high",
          },
        }))
      );
    }

    await admin
      .from("emergency_requests")
      .update({ notified_worker_count: eligibleWorkers.length })
      .eq("id", emergencyRequest.id);

    return createResponse({ ...emergencyRequest, notified_worker_count: eligibleWorkers.length }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid emergency request", 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse("Unauthorized", 401);

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return createErrorResponse("Missing emergency request id", 400);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("emergency_requests")
      .select("*, worker:workers(id, profile:profiles(full_name, phone, avatar_url))")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (data.client_id !== userId && data.accepted_worker_id !== userId) {
      const { data: worker } = await admin.from("workers").select("id").eq("id", userId).maybeSingle();
      if (!worker || data.status !== "dispatching") return createErrorResponse("Forbidden", 403);
    }

    if (data.status === "dispatching" && new Date(data.expires_at).getTime() <= Date.now()) {
      const { data: expired } = await admin
        .from("emergency_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "dispatching")
        .select("*, worker:workers(id, profile:profiles(full_name, phone, avatar_url))")
        .single();

      return createResponse(expired || data);
    }

    return createResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}
