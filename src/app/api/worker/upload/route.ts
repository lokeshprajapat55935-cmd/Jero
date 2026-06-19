import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import logger from '@/lib/logger';
import { applyRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Magic numbers for true MIME validation
const MAGIC_NUMBERS: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // "RIFF"
  'application/pdf': [0x25, 0x50, 0x44, 0x46] // "%PDF"
};

function validateMagicNumbers(buffer: Buffer, expectedType: string): boolean {
  const expectedMagic = MAGIC_NUMBERS[expectedType];
  if (!expectedMagic) return false;

  // For WebP, "RIFF" starts at byte 0, but "WEBP" starts at byte 8.
  if (expectedType === 'image/webp') {
    if (buffer.length < 12) return false;
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  if (buffer.length < expectedMagic.length) return false;
  for (let i = 0; i < expectedMagic.length; i++) {
    if (buffer[i] !== expectedMagic[i]) {
      return false;
    }
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const userId = await getAuthUserId(request as any, supabase);
    if (!userId) return createErrorResponse('Not authenticated', 401);

    // Apply Rate Limiting (5 uploads per minute)
    const rateLimitError = applyRateLimit(`worker_upload_${userId}`, 5, 60 * 1000);
    if (rateLimitError) {
      logger.warn(`[Security] Rate limit exceeded for worker upload by ${userId}`);
      return rateLimitError;
    }

    const admin = createAdminClient();

    // Verify user is registered as a worker
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || profile.role !== 'worker') {
      logger.warn(`[Security] Unauthorized upload attempt by non-worker ${userId}`);
      return createErrorResponse('Access denied. Profile is not registered as a worker.', 403);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;

    if (!file) {
      return createErrorResponse('No file uploaded', 400);
    }

    if (!type || !['selfie', 'id_proof'].includes(type)) {
      return createErrorResponse('Invalid upload type. Must be "selfie" or "id_proof".', 400);
    }

    // 1. File Size Validation
    if (file.size > MAX_FILE_SIZE) {
      logger.warn(`[Security] Upload rejected: File too large (${file.size} bytes) by ${userId}`);
      return createErrorResponse('File size exceeds the 5MB limit.', 400);
    }

    // 2. Client-provided Mime Type Validation
    const expectedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!expectedTypes.includes(file.type)) {
      logger.warn(`[Security] Upload rejected: Unsupported mime type ${file.type} by ${userId}`);
      return createErrorResponse('Unsupported file format.', 400);
    }

    // Read file buffer for true MIME validation
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 3. True MIME Type Validation (Magic Numbers)
    if (!validateMagicNumbers(fileBuffer, file.type)) {
      logger.error(`[Security] Upload rejected: Magic number mismatch for claimed type ${file.type} by ${userId}`);
      return createErrorResponse('Invalid file content. The file appears to be corrupted or tampered with.', 400);
    }

    // Generate safe filename structure using UUIDs
    let extension = 'jpg';
    if (file.type === 'image/png') extension = 'png';
    else if (file.type === 'image/webp') extension = 'webp';
    else if (file.type === 'application/pdf') extension = 'pdf';
    
    const fileName = `${type}_${crypto.randomUUID()}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    // 4. Upload to Supabase Storage worker-documents bucket
    const { data: uploadData, error: uploadError } = await admin
      .storage
      .from('worker-documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      logger.error('[API Upload] Supabase Storage Error:', uploadError);
      return createErrorResponse('Failed to upload file to storage: ' + uploadError.message, 500);
    }

    // 5. Return secure proxy URL instead of public URL
    const proxyUrl = `/api/files/worker-documents/${filePath}`;

    return createResponse({
      url: proxyUrl,
      fileName: fileName,
      filePath: filePath,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
