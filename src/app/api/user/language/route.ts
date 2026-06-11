import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/supabase-server';
import { getAuthUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('language')
      .eq('profile_id', userId)
      .single();

    // If no row exists, that's fine, we return default 'en'
    if (error && error.code !== 'PGRST116') {
      console.error("Supabase get language error:", error);
      return Response.json({ success: false, data: { language: 'en' }, error: 'Failed to fetch preference' }, { status: 200 });
    }

    return Response.json({ success: true, data: { language: data?.language || 'en' }, error: null }, { status: 200 });
  } catch (err) {
    console.error("Language API GET crash:", err);
    return Response.json({ success: false, data: { language: 'en' }, error: 'Internal Server Error' }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request, supabase);
    
    if (!userId) {
      return Response.json({ success: false, data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.language || !['en', 'hi'].includes(body.language)) {
      return Response.json({ success: false, data: null, error: 'Invalid language' }, { status: 400 });
    }

    // Upsert preference
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ 
        profile_id: userId, 
        language: body.language,
        updated_at: new Date().toISOString()
      }, { onConflict: 'profile_id' });

    if (error) {
      console.error("Supabase update language error:", error);
      return Response.json({ success: false, data: null, error: 'Failed to update preference' }, { status: 200 });
    }

    return Response.json({ success: true, data: { language: body.language }, error: null }, { status: 200 });
  } catch (err) {
    console.error("Language API PATCH crash:", err);
    return Response.json({ success: false, data: null, error: 'Internal Server Error' }, { status: 200 });
  }
}
