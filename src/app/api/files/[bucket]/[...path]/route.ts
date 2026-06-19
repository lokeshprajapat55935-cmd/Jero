import { createClient } from '@/lib/supabase/supabase-server';
import { getAuthUserId } from '@/lib/api-utils';
import logger from '@/lib/logger';

const ALLOWED_BUCKETS = ['worker-documents', 'booking-images'];

export async function GET(
  request: Request,
  { params }: { params: { bucket: string; path: string[] } }
) {
  try {
    const bucket = params.bucket;
    const pathArray = params.path;

    if (!ALLOWED_BUCKETS.includes(bucket)) {
      logger.warn(`[Security] Attempt to access unauthorized bucket: ${bucket}`);
      return new Response('Not Found', { status: 404 });
    }

    if (!pathArray || pathArray.length === 0) {
      return new Response('Not Found', { status: 404 });
    }

    const filePath = pathArray.join('/');

    // 1. Authenticate user
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);

    if (!userId) {
      logger.warn(`[Security] Unauthorized file access attempt: ${bucket}/${filePath}`);
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Fetch file using authenticated Supabase client
    // Supabase Storage RLS policies will automatically apply.
    // If the user lacks permission, it returns an error or empty data.
    const { data, error } = await supabase.storage.from(bucket).download(filePath);

    if (error || !data) {
      logger.warn(`[Security] File access denied or file not found by Supabase RLS: ${bucket}/${filePath} for user ${userId}. Error: ${error?.message}`);
      return new Response('Not Found', { status: 404 }); // Do not leak 403 vs 404 for security
    }

    // 3. Serve the file with proper headers
    const headers = new Headers();
    headers.set('Content-Type', data.type || 'application/octet-stream');
    headers.set('Cache-Control', 'private, max-age=3600');
    // Prevent XSS from SVGs or HTMLs if accidentally uploaded
    headers.set('Content-Disposition', 'inline');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(data, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    logger.error('[API Files] Error proxying file:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
