import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Unauthorized', 401);

    const admin = createAdminClient();

    // Check if partner_display_id already exists
    const { data: partner, error: fetchError } = await admin
      .from('partners')
      .select('partner_display_id')
      .eq('profile_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!partner) return createErrorResponse('Partner record not found', 404);

    // If already generated, return it immediately
    if (partner.partner_display_id) {
      return createResponse({ partner_display_id: partner.partner_display_id });
    }

    // Generate a new ID — count existing partners with display IDs to get next sequential number
    const { count, error: countError } = await admin
      .from('partners')
      .select('*', { count: 'exact', head: true })
      .not('partner_display_id', 'is', null);

    if (countError) throw countError;

    const seqNum = (count ?? 0) + 1;
    const displayId = `ZOL-PARTNER-${String(seqNum).padStart(6, '0')}`;

    // Store it permanently
    const { error: updateError } = await admin
      .from('partners')
      .update({ partner_display_id: displayId })
      .eq('profile_id', userId);

    if (updateError) {
      // Race condition: another request may have generated one — re-fetch
      const { data: refetch } = await admin
        .from('partners')
        .select('partner_display_id')
        .eq('profile_id', userId)
        .maybeSingle();

      if (refetch?.partner_display_id) {
        return createResponse({ partner_display_id: refetch.partner_display_id });
      }
      throw updateError;
    }

    return createResponse({ partner_display_id: displayId });
  } catch (error) {
    return handleApiError(error);
  }
}
