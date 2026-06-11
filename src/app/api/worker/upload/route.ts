import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import logger from '@/lib/logger';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    const admin = createAdminClient();

    // Verify user is registered as a worker
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || profile.role !== 'worker') {
      return createErrorResponse('Access denied. Profile is not registered as a worker.', 403);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null; // e.g. 'selfie' or 'id_proof'

    if (!file) {
      console.error('[API Upload] No file in formData');
      return createErrorResponse('No file uploaded', 400);
    }

    console.log('[API Upload] Received file:', { name: file.name, size: file.size, type: file.type, uploadType: type });

    if (!type || !['selfie', 'id_proof'].includes(type)) {
      console.error('[API Upload] Invalid type:', type);
      return createErrorResponse('Invalid upload type. Must be "selfie" or "id_proof".', 400);
    }

    // 1. File Size Validation
    if (file.size > MAX_FILE_SIZE) {
      console.error('[API Upload] File too large:', file.size);
      return createErrorResponse('File size exceeds the 5MB limit.', 400);
    }

    // 2. File Mime Type Validation
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      console.error('[API Upload] Invalid mime type:', file.type);
      return createErrorResponse('Unsupported file format.', 400);
    }

    // Generate safe filename structure: userId/type_timestamp.ext
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${type}_${Date.now()}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    console.log('[API Upload] Uploading to Supabase:', filePath);

    // Read file buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 3. Upload to Supabase Storage worker-documents bucket
    const { data: uploadData, error: uploadError } = await admin
      .storage
      .from('worker-documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[API Upload] Supabase Storage Error:', uploadError);
      return createErrorResponse('Failed to upload file to storage: ' + uploadError.message, 500);
    }

    console.log('[API Upload] Upload successful:', uploadData);

    // 4. Retrieve Public URL
    const { data: urlData } = admin
      .storage
      .from('worker-documents')
      .getPublicUrl(filePath);

    return createResponse({
      url: urlData.publicUrl,
      fileName: fileName,
      filePath: filePath,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
