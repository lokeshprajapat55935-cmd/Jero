import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const defaultSettings = {
      push_notifications: true,
      email_notifications: true,
      whatsapp_updates: true,
      language: 'en',
    };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data?.metadata) {
        return createResponse({ settings: { ...defaultSettings, ...(data.metadata as any) } });
      }
    } catch (e) {
      // ignore missing column error
    }

    return createResponse({ settings: defaultSettings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const defaultSettings = {
      push_notifications: true,
      email_notifications: true,
      whatsapp_updates: true,
      language: 'en',
      ...body
    };

    try {
      // Optimistically try to update metadata column if it exists
      await supabase
        .from('profiles')
        .update({ metadata: defaultSettings })
        .eq('id', userId);
    } catch (e) {
      // ignore if metadata column doesn't exist in DB schema yet
    }

    return createResponse({ settings: defaultSettings });
  } catch (error) {
    return handleApiError(error);
  }
}
