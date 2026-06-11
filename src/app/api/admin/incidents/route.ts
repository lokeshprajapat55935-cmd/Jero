import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import { createResponse, createErrorResponse, handleApiError } from '@/lib/api-utils';
import { z } from 'zod';

const createIncidentSchema = z.object({
  user_id: z.string().uuid().nullable().optional(),
  event_type: z.string().min(2).default('beta_incident'),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).default('medium'),
  description: z.string().min(5),
  booking_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const gate = await requireAdmin(supabase);
    if (!gate.ok) return createErrorResponse(gate.message, gate.status);

    const body = await request.json();
    const validated = createIncidentSchema.parse(body);

    const admin = createAdminClient();
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Insert security log
    const { data, error } = await admin
      .from('security_logs')
      .insert({
        user_id: validated.user_id || null,
        event_type: validated.event_type,
        severity: validated.severity,
        description: validated.description,
        ip_address: ip,
        user_agent: userAgent,
        metadata: {
          ...validated.metadata,
          manually_reported: true,
          booking_id: validated.booking_id || undefined,
          reported_by: gate.user?.id,
        },
      })
      .select()
      .single();

    if (error) throw error;

    return createResponse({
      success: true,
      log: data,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation error', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
