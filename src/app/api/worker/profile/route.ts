import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const workerProfileSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  bio: z.string().max(500, 'Bio too long').nullable(),
  base_service_charge: z.number().min(0),
  visit_charge: z.number().min(0),
  experience_years: z.number().min(0),
  skills: z.array(z.string()),
  languages: z.array(z.string()).optional(),
  service_area: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  onboarding_completed: z.boolean().optional(),
  onboarding_step: z.number().optional(),
  status: z.enum(['pending', 'under_review', 'approved', 'rejected', 'suspended']).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { data, error } = await supabase
      .from('workers')
      .select(`
        *,
        profile:profiles(*),
        services(*)
      `)
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Fetch category average rating
    const { data: categoryAvg } = await supabase
      .rpc('get_category_average_rating', { p_category: data.category });

    // Fetch ranking
    const { data: ranking } = await supabase
      .rpc('get_worker_ranking', { p_worker_id: userId });

    const enriched = {
      ...data,
      category_average_rating: categoryAvg ?? 0.0,
      ranking: ranking && ranking.length > 0 ? ranking[0] : { category_rank: null, overall_rank: null }
    };

    return createResponse(enriched);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const body = await request.json();
    const validatedData = workerProfileSchema.partial().parse(body);

    const { data, error } = await supabase
      .from('workers')
      .update(validatedData)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return createResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation failed', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}
