import { NextRequest } from 'next/server';
import { createErrorResponse, createResponse, handleApiError } from '@/lib/api-utils';
import { toE164IndianMobile } from '@/lib/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { config } from '@/config';
import logger from '@/lib/logger';

const DEV_AUTH_PASSWORD = config.env.otp.devAuthPassword || 'zolvo-local-dev-auth-only';

const TEST_MOBILE = '7014868682';
const TEST_MOBILE_2 = '9928340308';

function getAuthEmail(phone: string) {
  return `phone-${phone.replace(/\D/g, '')}@phone.zolvo.local`;
}

async function ensureUserByPhone(phone: string) {
  const supabase = createAdminClient();
  const email = getAuthEmail(phone);
  
  logger.info(`[ensureUserByPhone] Checking for user with phone: ${phone} or email: ${email}`);

  // 1. Check profiles table first - it's our source of truth for phone-to-UID mapping
  // Search by both E.164 and digits-only format
  const digitsOnly = phone.replace(/\D/g, '');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, phone, email, firebase_uid')
    .or(`phone.eq.${phone},phone.eq.${digitsOnly}`)
    .maybeSingle();

  if (profile) {
    logger.info(`[ensureUserByPhone] Found existing profile ${profile.id} for phone ${phone}`);
    
    // Check if auth user exists for this profile ID
    const { data: { user: existingAuthUser } } = await supabase.auth.admin.getUserById(profile.id);
    
    if (existingAuthUser) {
      // User exists, just update metadata if needed
      const { error: updateError } = await supabase.auth.admin.updateUserById(profile.id, {
        user_metadata: {
          ...(existingAuthUser.user_metadata || {}),
          phone,
          phone_verified: true,
          auth_provider: 'otp_login',
        },
      });
      if (updateError) logger.warn(`[ensureUserByPhone] Failed to update user metadata: ${updateError.message}`);
      return { email: existingAuthUser.email || email, password: DEV_AUTH_PASSWORD };
    } else {
      // ORPHANED PROFILE: Profile exists but Auth User is missing. 
      logger.warn(`[ensureUserByPhone] Orphaned profile found (ID: ${profile.id}). Checking for conflicts.`);
      
      // Check for ANY user with this phone or email that might prevent recreation
      const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const conflictUser = allUsers.find(u => 
        u.phone === phone || 
        u.phone === phone.replace('+', '') || 
        u.email === email
      );

      if (conflictUser) {
        logger.warn(`[ensureUserByPhone] Found conflicting auth user ${conflictUser.id}. Checking if it has a profile.`);
        const { data: conflictProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', conflictUser.id)
          .maybeSingle();
        
        if (!conflictProfile) {
          logger.info(`[ensureUserByPhone] Conflicting user ${conflictUser.id} has no profile. Deleting it to resolve orphan conflict.`);
          await supabase.auth.admin.deleteUser(conflictUser.id);
        } else {
          logger.error(`[ensureUserByPhone] CRITICAL: Both orphan ${profile.id} and conflict ${conflictUser.id} have phone ${phone}.`);
        }
      }

      logger.info(`[ensureUserByPhone] Recreating auth user with ID: ${profile.id}`);
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        id: profile.id,
        email,
        password: DEV_AUTH_PASSWORD,
        email_confirm: true,
        phone,
        phone_confirm: true,
        user_metadata: {
          phone,
          phone_verified: true,
          auth_provider: 'otp_login',
        },
      });

      if (createError) {
        logger.error(`[ensureUserByPhone] Failed to recreate auth user for orphan: ${createError.message}`);
        throw createError;
      }
      
      return { email, password: DEV_AUTH_PASSWORD };
    }
  }

  // 2. Profile not found, check auth users by email/phone as backup
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) throw listError;

  const existingUser = users.users.find(u => 
    u.phone === phone || 
    u.phone === phone.replace('+', '') || 
    u.email === email
  );

  if (existingUser) {
    logger.info(`[ensureUserByPhone] Found existing auth user ${existingUser.id} without profile.`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        phone,
        phone_verified: true,
        auth_provider: 'otp_login',
      },
    });
    if (updateError) logger.warn(`[ensureUserByPhone] Failed to update user metadata: ${updateError.message}`);
    return { email: existingUser.email || email, password: DEV_AUTH_PASSWORD };
  }

  // 3. Brand new user
  logger.info(`[ensureUserByPhone] Creating brand new user for ${phone}`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEV_AUTH_PASSWORD,
    email_confirm: true,
    phone,
    phone_confirm: true,
    user_metadata: {
      phone,
      phone_verified: true,
      auth_provider: 'otp_login',
    },
  });

  if (error) {
    logger.error(`[ensureUserByPhone] Final creation attempt failed: ${error.message}`);
    throw error;
  }
  
  if (!data.user) throw new Error('Could not create user.');

  return { email, password: DEV_AUTH_PASSWORD };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as 'start' | 'verify';
    const rawPhone = body.phone || '';
    const phone = toE164IndianMobile(rawPhone);

    if (!phone) {
      return createErrorResponse('Valid Indian phone number is required.', 400);
    }

    const admin = createAdminClient();
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    if (action === 'start') {
      // Resend Cooldown (1 request per 30 seconds)
      const { data: resendAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:start:cooldown:${phone}`,
        p_max_hits: 1,
        p_window_seconds: 30,
      });

      if (!resendAllowed) {
        return createErrorResponse('Please wait 30 seconds before requesting another OTP.', 429);
      }

      // Rate Limiting (Server side check before client sends SMS, optional but good for security)
      const { data: ipAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:start:ip:${ip}`,
        p_max_hits: 10,
        p_window_seconds: 600,
      });

      if (!ipAllowed) {
        return createErrorResponse('Too many requests. Please try again later.', 429);
      }

      logger.info(`[otp] Client requesting Firebase OTP start for ${phone}`);
      return createResponse({
        provider: 'firebase',
        phone,
      });
    }

    if (action === 'verify') {
      const token = String(body.token || '').trim();
      if (!token) return createErrorResponse('Firebase ID token is required.', 400);

      // Verify Attempt Rate Limit (max 5 hits per 5 minutes)
      const { data: verifyAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:verify:ip:${ip}`,
        p_max_hits: 5,
        p_window_seconds: 300,
      });

      if (!verifyAllowed) {
        return createErrorResponse('Too many verify attempts. Please try again later.', 429);
      }

      // Replay Protection: Check if this token has already been used
      const { data: existingEvent } = await admin
        .from('auth_audit_events')
        .select('id')
        .eq('metadata->>token', token)
        .eq('event_type', 'login_success')
        .maybeSingle();

      if (existingEvent) {
        logger.warn(`OTP Replay Attempt: token already used for phone ${phone}`);
        return createErrorResponse('OTP has already been used.', 401);
      }

      const devOtpCode = config.env.otp.devCode || '123456';
      const isMockToken = token.startsWith(`${devOtpCode}_mock_`) && (phone === `+91${TEST_MOBILE}` || phone === TEST_MOBILE || phone === `+91${TEST_MOBILE_2}` || phone === TEST_MOBILE_2 || config.env.isDev);

      if (!isMockToken) {
        // Verify Firebase ID Token via Google Identity Toolkit
        const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAkR_OfIWsN8mtJQiIee9ZO7MuSJ98zhes";
        try {
          const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`;
          const res = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: token })
          });
          
          const json = await res.json();
          if (json.error) {
            logger.warn('Firebase token verification failed:', json.error);
            return createErrorResponse(json.error.message || 'Invalid Firebase Token.', 400);
          }

          const firebaseUser = json.users?.[0];
          if (!firebaseUser || !firebaseUser.phoneNumber) {
            return createErrorResponse('No phone number associated with this Firebase token.', 400);
          }

          const verifiedPhone = firebaseUser.phoneNumber;
          
          // Ensure the verified phone matches the requested phone
          if (verifiedPhone !== phone && verifiedPhone !== `+${phone.replace(/\D/g, '')}`) {
              logger.warn(`Phone mismatch. Requested: ${phone}, Verified: ${verifiedPhone}`);
              return createErrorResponse('Phone number mismatch during verification.', 400);
          }

          // OTP Expiry: Check if auth_time is older than 5 minutes
          // Note: Identity Toolkit doesn't always return auth_time at the top level for lookup.
          // However, we can decode the JWT directly to read auth_time.
          try {
            const { decodeJwt } = await import('jose');
            const decodedToken = decodeJwt(token);
            if (decodedToken.auth_time) {
              const ageInSeconds = (Date.now() / 1000) - Number(decodedToken.auth_time);
              if (ageInSeconds > 300) { // 5 minutes
                return createErrorResponse('OTP expired. Please request a new one.', 401);
              }
            }
          } catch (jwtErr) {
            logger.warn('Failed to parse JWT for expiry check:', jwtErr);
          }
        } catch (err) {
          logger.error('Error calling Firebase Identity Toolkit:', err);
          return createErrorResponse('Authentication service unavailable.', 500);
        }
      } else {
        logger.info(`[otp] Bypassing Firebase verification for test mobile ${phone} using mock code`);
      }

      // Success - Provision user in Supabase using the verified phone number
      const credentials = await ensureUserByPhone(phone);
      
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      await admin.from('auth_audit_events').insert({
        user_id: profile?.id || null,
        event_type: 'login_success',
        ip_address: ip,
        user_agent: userAgent,
        metadata: { phone, provider: 'firebase', token },
      });

      return createResponse({
        provider: 'firebase',
        phone,
        credentials,
      });
    }

    return createErrorResponse('Unsupported OTP action.', 400);
  } catch (error) {
    return handleApiError(error);
  }
}
