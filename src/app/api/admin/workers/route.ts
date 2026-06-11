import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth/admin';
import { z } from 'zod';

const moderateSchema = z.object({
  worker_id: z.string().uuid(),
  status: z.enum(['pending', 'under_review', 'approved', 'rejected', 'suspended']),
  moderation_note: z.string().max(500).optional(),
  verified: z.boolean().optional(),
  availability_status: z.enum(['offline', 'online', 'busy', 'unavailable']).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    if (gate.adminRole && !['super_admin', 'operations_admin'].includes(gate.adminRole)) {
      return createErrorResponse('Forbidden: Worker operations require Super Admin or Operations Admin privileges', 403);
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const admin = createAdminClient();
    
    // Fetch workers with profiles, documents, wallet, location, and service categories
    const { data, error } = await admin
      .from('workers')
      .select(`
        *,
        profile:profiles(full_name, phone, email),
        documents:worker_documents(*),
        wallet:worker_wallets(*),
        location:worker_locations(*),
        categories:worker_service_categories(category),
        availability_db:worker_availability(status, last_active_at)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return createResponse({ workers: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    if (gate.adminRole && !['super_admin', 'operations_admin'].includes(gate.adminRole)) {
      return createErrorResponse('Forbidden: Worker operations require Super Admin or Operations Admin privileges', 403);
    }

    const body = await request.json();
    const validated = moderateSchema.parse(body);

    const admin = createAdminClient();

    // 1. Fetch current worker status for log
    const { data: currentWorker, error: fetchError } = await admin
      .from('workers')
      .select('status')
      .eq('id', validated.worker_id)
      .single();

    if (fetchError) throw fetchError;

    // 1.5. Perform admin availability override if provided
    if (validated.availability_status) {
      const { error: availErr } = await admin
        .from('worker_availability')
        .upsert({
          worker_id: validated.worker_id,
          status: validated.availability_status,
          last_active_at: new Date().toISOString(),
        });
      if (availErr) throw availErr;
    }

    // 2. Perform status and verification updates
    const { data, error } = await admin
      .from('workers')
      .update({
        status: validated.status,
        moderation_note: validated.moderation_note ?? null,
        ...(validated.verified !== undefined ? { verified: validated.verified } : {}),
      })
      .eq('id', validated.worker_id)
      .select(`
        *,
        profile:profiles(full_name, phone),
        documents:worker_documents(*),
        wallet:worker_wallets(*),
        location:worker_locations(*),
        categories:worker_service_categories(category),
        availability_db:worker_availability(status, last_active_at)
      `)
      .single();

    if (error) throw error;

    // 3. Log status change in worker_status_logs
    await admin
      .from('worker_status_logs')
      .insert({
        worker_id: validated.worker_id,
        old_status: currentWorker.status,
        new_status: validated.status,
        reason: validated.moderation_note || 'Status updated by administrator',
        changed_by: gate.user.id,
      });

    return createResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}