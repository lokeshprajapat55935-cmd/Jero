import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const OTP_EXPIRY_MINUTES = 5;
const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const COOLDOWN_SECONDS = 30;

export function generateSecureOtp(length: number = 6): string {
  // Generates a random crypto-safe OTP
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max).toString();
}

export function hashOtp(otp: string): string {
  // Use SHA-256 for fast but secure enough hashing since OTPs are short-lived
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function logAuthAudit(
  mobile: string,
  eventType: 'OTP_SENT' | 'OTP_VERIFIED' | 'RATE_LIMIT_TRIGGERED' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'WORKER_ACCESS_DENIED',
  metadata: Record<string, any> = {}
) {
  const admin = createAdminClient();
  await admin.from('auth_audit_logs').insert({
    event_type: eventType,
    mobile,
    metadata
  });
}

export async function checkRateLimit(mobile: string): Promise<{ allowed: boolean, reason?: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('otp_requests')
    .select('last_request_time, request_count')
    .eq('mobile', mobile)
    .maybeSingle();

  if (!data) return { allowed: true };

  const now = new Date();
  const lastRequest = new Date(data.last_request_time);
  
  // Cooldown check
  const secondsSinceLast = (now.getTime() - lastRequest.getTime()) / 1000;
  if (secondsSinceLast < COOLDOWN_SECONDS) {
    return { allowed: false, reason: `Please wait ${Math.ceil(COOLDOWN_SECONDS - secondsSinceLast)} seconds before requesting a new OTP.` };
  }

  // Window limit check
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  if (lastRequest > windowStart && data.request_count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, reason: `Too many requests. Please try again after ${RATE_LIMIT_WINDOW_MINUTES} minutes.` };
  }

  return { allowed: true };
}

export async function upsertOtpRequest(mobile: string, rawOtp: string) {
  const admin = createAdminClient();
  const otpHash = hashOtp(rawOtp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Fetch current request count to reset if outside window
  const { data: current } = await admin
    .from('otp_requests')
    .select('last_request_time, request_count')
    .eq('mobile', mobile)
    .maybeSingle();

  let newCount = 1;
  if (current) {
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    if (new Date(current.last_request_time) > windowStart) {
      newCount = current.request_count + 1;
    }
  }

  await admin.from('otp_requests').upsert({
    mobile,
    otp_hash: otpHash,
    attempts: 0, // reset attempts on new OTP
    locked_until: null,
    expires_at: expiresAt.toISOString(),
    last_request_time: now.toISOString(),
    request_count: newCount
  });
}

export async function generateRandomPassword(): Promise<string> {
  return crypto.randomBytes(32).toString('base64url') + 'A1!'; // Ensure complex password
}
