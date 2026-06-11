import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const bankDetailsSchema = z.object({
  bank_holder_name: z.string().min(2, 'Account holder name is required'),
  bank_name: z.string().min(2, 'Bank name is required'),
  bank_account_number: z
    .string()
    .min(9, 'Account number must be at least 9 digits')
    .max(18, 'Account number cannot exceed 18 digits')
    .regex(/^\d+$/, 'Account number must contain only digits'),
  ifsc_code: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format (e.g. HDFC0001234)'),
  upi_id: z.string().optional().or(z.literal('')),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('partners')
      .select('bank_holder_name, bank_name, bank_account_number, ifsc_code, upi_id')
      .eq('profile_id', userId)
      .maybeSingle();

    if (error) throw error;

    return createResponse({
      bank_holder_name: data?.bank_holder_name || '',
      bank_name: data?.bank_name || '',
      bank_account_number: data?.bank_account_number || '',
      ifsc_code: data?.ifsc_code || '',
      upi_id: data?.upi_id || '',
    });
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
    const validated = bankDetailsSchema.parse(body);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('partners')
      .update({
        bank_holder_name: validated.bank_holder_name,
        bank_name: validated.bank_name,
        bank_account_number: validated.bank_account_number,
        ifsc_code: validated.ifsc_code.toUpperCase(),
        upi_id: validated.upi_id || null,
      })
      .eq('profile_id', userId)
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
