import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { z } from 'zod';

const serviceSchema = z.object({
  title: z.string().min(3, 'Title is too short'),
  description: z.string().nullable().optional(),
  price: z.number().min(0),
  category: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const body = await request.json();
    const validatedData = serviceSchema.parse(body);

    const { data, error } = await supabase
      .from('services')
      .insert({ ...validatedData, worker_id: userId })
      .select()
      .single();

    if (error) throw error;
    return createResponse(data, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse('Validation failed', 400, error.flatten().fieldErrors);
    }
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return createErrorResponse('Service ID is required', 400);

    const body = await request.json();
    const validatedData = serviceSchema.partial().parse(body);

    const { data, error } = await supabase
      .from('services')
      .update(validatedData)
      .eq('id', id)
      .eq('worker_id', userId) // Ensure worker owns the service
      .select()
      .single();

    if (error) throw error;
    return createResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) return createErrorResponse('Unauthorized', 401);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return createErrorResponse('Service ID is required', 400);

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id)
      .eq('worker_id', userId);

    if (error) throw error;
    return createResponse({ message: 'Service deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
