import { createResponse } from '@/lib/api-utils';
import { withApiErrorHandler } from '@/lib/api-error';
import { requireWorker } from '@/lib/auth/server-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateAvailabilitySchema = z.object({
  status: z.enum(['offline', 'online', 'busy', 'unavailable']).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  city_id: z.string().uuid().nullable().optional(),
  area_id: z.string().uuid().nullable().optional(),
});

export const POST = withApiErrorHandler(async (request: Request) => {
  const { user, supabase } = await requireWorker();
  
  const body = await request.json();
  const validated = updateAvailabilitySchema.parse(body);
  const now = new Date().toISOString();

  // Mapped exactly to the requested status
  let statusMapped = validated.status;

  // Update worker_availability if status is provided
  if (statusMapped) {
    const { error: availError } = await supabase
      .from('worker_availability')
      .upsert({
        worker_id: user.id,
        status: statusMapped,
        last_active_at: now,
      });

    if (availError) throw availError;
  } else {
    // Update availability last_active_at timestamp anyway
    await supabase
      .from('worker_availability')
      .update({ last_active_at: now })
      .eq('worker_id', user.id);
  }

  // Update worker_locations if coordinates are provided
  if (validated.latitude !== undefined && validated.longitude !== undefined) {
    // Query worker's current details if city_id/area_id are not provided
    let cityId = validated.city_id;
    let areaId = validated.area_id;

    if (!cityId || !areaId) {
      const { data: workerLoc } = await supabase
        .from('worker_locations')
        .select('city_id, area_id')
        .eq('worker_id', user.id)
        .maybeSingle();

      if (workerLoc) {
        cityId = cityId || workerLoc.city_id;
        areaId = areaId || workerLoc.area_id;
      }
    }

    const { error: locError } = await supabase
      .from('worker_locations')
      .upsert({
        worker_id: user.id,
        latitude: validated.latitude,
        longitude: validated.longitude,
        city_id: cityId || null,
        area_id: areaId || null,
        last_active_at: now,
      });

    if (locError) throw locError;
  }

  // Retrieve updated info
  const [availData, locData] = await Promise.all([
    supabase.from('worker_availability').select('*').eq('worker_id', user.id).maybeSingle(),
    supabase.from('worker_locations').select('*').eq('worker_id', user.id).maybeSingle(),
  ]);

  return createResponse({
    availability: availData.data || null,
    location: locData.data || null,
  });
});

export const GET = withApiErrorHandler(async (request: Request) => {
  const { user, supabase } = await requireWorker();

  const [availData, locData] = await Promise.all([
    supabase.from('worker_availability').select('*').eq('worker_id', user.id).maybeSingle(),
    supabase.from('worker_locations').select('*').eq('worker_id', user.id).maybeSingle(),
  ]);

  return createResponse({
    availability: availData.data || null,
    location: locData.data || null,
  });
});
