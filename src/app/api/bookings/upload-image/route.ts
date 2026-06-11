import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import logger from '@/lib/logger';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'booking-images';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const admin = createAdminClient();

    // Verify user is a client
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'client') {
      return createErrorResponse('Only clients can upload booking images.', 403);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return createErrorResponse('No file uploaded', 400);
    if (file.size > MAX_FILE_SIZE) return createErrorResponse('File exceeds 5MB limit.', 400);
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return createErrorResponse('Only JPEG, PNG, and WEBP images are allowed.', 400);
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `booking_${Date.now()}.${ext}`;
    const filePath = `${userId}/${fileName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(filePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logger.error('Booking image upload error:', uploadError);
      return createErrorResponse('Failed to upload image: ' + uploadError.message, 500);
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(filePath);

    return createResponse({ url: urlData.publicUrl, filePath });
  } catch (error) {
    return handleApiError(error);
  }
}
