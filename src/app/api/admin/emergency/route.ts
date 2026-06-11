import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/supabase-server";
import { requireAdmin } from "@/lib/auth/admin";
import { createResponse, createErrorResponse, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const userSupabase = await createClient();
    const gate = await requireAdmin(userSupabase);
    if (!gate.ok) {
      return createErrorResponse(gate.message, gate.status);
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const admin = createAdminClient();

    const [
      requestsRes,
      activeRes,
      acceptedRes,
      expiredRes,
      totalRes
    ] = await Promise.all([
      admin
        .from("emergency_requests")
        .select(`
          *,
          client:clients(profile:profiles(full_name, phone)),
          worker:workers(profile:profiles(full_name, phone))
        `)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      admin.from("emergency_requests").select("*", { count: "exact", head: true }).eq("status", "dispatching"),
      admin.from("emergency_requests").select("*", { count: "exact", head: true }).eq("status", "accepted"),
      admin.from("emergency_requests").select("*", { count: "exact", head: true }).eq("status", "expired"),
      admin.from("emergency_requests").select("*", { count: "exact", head: true })
    ]);

    if (requestsRes.error) throw requestsRes.error;

    return createResponse({
      requests: requestsRes.data || [],
      metrics: {
        active: activeRes.count || 0,
        accepted: acceptedRes.count || 0,
        expired: expiredRes.count || 0,
        total: totalRes.count || 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
