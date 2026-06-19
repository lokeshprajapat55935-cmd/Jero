import { createClient } from '@/lib/supabase/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResponse, createErrorResponse, handleApiError, getAuthUserId } from '@/lib/api-utils';
import logger from '@/lib/logger';
import { applyRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET = 'booking-images';

// Magic numbers for true MIME validation
const MAGIC_NUMBERS: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46] // "RIFF"
};

function validateMagicNumbers(buffer: Buffer, expectedType: string): boolean {
  const expectedMagic = MAGIC_NUMBERS[expectedType];
  if (!expectedMagic) return false;

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
    const rateLimitError = applyRateLimit(`booking_upload_${userId}`, 5, 60 * 1000);
    if (rateLimitError) {
      logger.warn(`[Security] Rate limit exceeded for booking upload by ${userId}`);
      return rateLimitError;
    }

    const admin = createAdminClient();

    // Verify user is a client
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'client') {
      logger.warn(`[Security] Unauthorized booking upload attempt by non-client ${userId}`);
      return createErrorResponse('Only clients can upload booking images.', 403);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return createErrorResponse('No file uploaded', 400);
    
    // 1. File Size Validation
    if (file.size > MAX_FILE_SIZE) {
      logger.warn(`[Security] Booking upload rejected: File too large (${file.size} bytes) by ${userId}`);
      return createErrorResponse('File exceeds 5MB limit.', 400);
    }
    
    // 2. Client-provided Mime Type Validation
    const expectedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!expectedTypes.includes(file.type)) {
      logger.warn(`[Security] Booking upload rejected: Unsupported mime type ${file.type} by ${userId}`);
      return createErrorResponse('Only JPEG, PNG, and WEBP images are allowed.', 400);
    }

    // Read file buffer for true MIME validation
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 3. True MIME Type Validation (Magic Numbers)
    if (!validateMagicNumbers(fileBuffer, file.type)) {
      logger.error(`[Security] Booking upload rejected: Magic number mismatch for claimed type ${file.type} by ${userId}`);
      return createErrorResponse('Invalid file content. The file appears to be corrupted or tampered with.', 400);
    }

    // Generate safe filename structure using UUIDs
    let extension = 'jpg';
    if (file.type === 'image/png') extension = 'png';
    else if (file.type === 'image/webp') extension = 'webp';

    const fileName = `booking_${crypto.randomUUID()}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    // 4. Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(filePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logger.error('Booking image upload error:', uploadError);
      return createErrorResponse('Failed to upload image: ' + uploadError.message, 500);
    }

    // 5. Return secure proxy URL instead of public URL
    const proxyUrl = `/api/files/booking-images/${filePath}`;

    return createResponse({ url: proxyUrl, filePath });
  } catch (error) {
    return handleApiError(error);
  }
}
