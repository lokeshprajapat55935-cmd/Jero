import { NextRequest } from 'next/server';
import { createErrorResponse, createResponse, handleApiError } from '@/lib/api-utils';
import { DEV_OTP_CODE, getOtpProvider } from '@/lib/auth/otp-provider';
import { toE164IndianMobile } from '@/lib/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { config } from '@/config';
import logger from '@/lib/logger';

const DEV_AUTH_PASSWORD = config.env.otp.devAuthPassword || 'zolvo-local-dev-auth-only';

function ensureMockOtpAvailable() {
  if (getOtpProvider() !== 'mock') {
    return 'Mock OTP is not enabled.';
  }

  if (config.env.isProd) {
    return 'Mock OTP cannot be used in production.';
  }

  return null;
}

function getDevEmail(phone: string) {
  return `dev-phone-${phone.replace(/\D/g, '')}@phone.zolvo.local`;
}

async function ensureDevUser(phone: string) {
  const supabase = createAdminClient();
  const email = getDevEmail(phone);

  const { data: users, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) throw listError;

  const user = users.users.find((candidate) => candidate.email === email);

  if (user) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: DEV_AUTH_PASSWORD,
      phone,
      phone_confirm: true,
      user_metadata: {
        ...(user.user_metadata || {}),
        phone,
        phone_verified: true,
        auth_provider: 'mock_otp',
      },
    });

    if (updateError) throw updateError;
    await upsertDevProfile(user.id, email, phone);
    return { email, password: DEV_AUTH_PASSWORD };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEV_AUTH_PASSWORD,
    email_confirm: true,
    phone,
    phone_confirm: true,
    user_metadata: {
      phone,
      phone_verified: true,
      auth_provider: 'mock_otp',
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error('Could not create development user.');

  await upsertDevProfile(data.user.id, email, phone);
  return { email, password: DEV_AUTH_PASSWORD };
}

async function upsertDevProfile(userId: string, email: string, phone: string) {
  const supabase = createAdminClient();
  
  let role: 'client' | 'worker' | null = null;
  let full_name: string | null = null;
  let onboarded = false;

  if (phone === '+919999999991') {
    role = 'client';
    full_name = 'Test Client';
    onboarded = true;
  } else if (phone === '+919999999992') {
    role = 'worker';
    full_name = 'Test Worker';
    onboarded = true;
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        phone,
        phone_verified: true,
        onboarded,
        ...(role ? { role } : {}),
        ...(full_name ? { full_name } : {}),
        last_login_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) throw error;

  if (role === 'client') {
    const { error: clientErr } = await supabase
      .from('clients')
      .upsert({
        id: userId,
        phone,
        address: 'Bhilwara Center, Rajasthan',
      }, { onConflict: 'id' });
    if (clientErr) logger.error('Failed to provision test client profile', clientErr);
  } else if (role === 'worker') {
    const { error: workerErr } = await supabase
      .from('workers')
      .upsert({
        id: userId,
        category: 'Electrician',
        bio: 'Automated test worker profile for development and verification.',
        base_service_charge: 150.00,
        visit_charge: 50.00,
        experience_years: 5,
        skills: ['Wiring', 'Repair', 'Installation'],
        languages: ['English', 'Hindi'],
        verified: true,
        status: 'approved',
        onboarding_completed: true,
        onboarding_step: 6,
      }, { onConflict: 'id' });
    if (workerErr) logger.error('Failed to provision test worker profile', workerErr);

    const { error: walletErr } = await supabase
      .from('worker_wallets')
      .upsert({
        worker_id: userId,
        balance: 1000.00,
        currency: 'INR',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'worker_id' });
    if (walletErr) logger.error('Failed to provision test worker wallet', walletErr);

    const { error: locErr } = await supabase
      .from('worker_locations')
      .upsert({
        worker_id: userId,
        latitude: 25.3484,
        longitude: 74.6385,
        last_active_at: new Date().toISOString(),
      }, { onConflict: 'worker_id' });
    if (locErr) logger.error('Failed to provision test worker location', locErr);

    const availabilityData = {
      status: 'available',
      instant_booking: true,
      emergency_enabled: true,
    };
    const { error: availErr } = await supabase
      .from('workers')
      .update({
        availability: availabilityData
      })
      .eq('id', userId);
    if (availErr) logger.error('Failed to update test worker availability', availErr);
  }
}

export async function POST(request: NextRequest) {
  try {
    const unavailableReason = ensureMockOtpAvailable();
    if (unavailableReason) {
      return createErrorResponse(unavailableReason, 403);
    }

    const body = await request.json();
    const action = body.action as 'start' | 'verify';
    const phone = toE164IndianMobile(body.phone || '');

    if (!phone) {
      return createErrorResponse('Valid phone number is required.', 400);
    }

    if (!config.env.supabase.serviceRoleKey) {
      logger.error('OTP API Failure: SUPABASE_SERVICE_ROLE_KEY environment variable is not defined.');
      return createErrorResponse(
        'Server environment error: SUPABASE_SERVICE_ROLE_KEY is missing. Please add it to your .env.local file.',
        500
      );
    }

    const admin = createAdminClient();
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 1. Rate Limiting Enforcements
    if (action === 'start') {
      // Check IP rate limit: 10 per 10 minutes
      const { data: ipAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:start:ip:${ip}`,
        p_max_hits: 10,
        p_window_seconds: 600,
      });

      // Check Phone rate limit: 5 per 10 minutes
      const { data: phoneAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:start:phone:${phone}`,
        p_max_hits: 5,
        p_window_seconds: 600,
      });

      if (!ipAllowed || !phoneAllowed) {
        await admin.from('security_logs').insert({
          event_type: 'rate_limit_exceeded',
          severity: 'medium',
          description: `OTP request rate limit exceeded for Phone: ${phone}, IP: ${ip}`,
          ip_address: ip,
          user_agent: userAgent,
        });
        return createErrorResponse('Too many OTP requests. Please try again in 10 minutes.', 429);
      }

      logger.info(`[dev-auth] Mock OTP for ${phone}: ${DEV_OTP_CODE}`);
      return createResponse({
        provider: 'mock',
        phone,
        code: DEV_OTP_CODE,
      });
    }

    if (action === 'verify') {
      // Check IP rate limit: 15 per 15 minutes
      const { data: ipAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:verify:ip:${ip}`,
        p_max_hits: 15,
        p_window_seconds: 900,
      });

      // Check Phone rate limit: 5 per 15 minutes
      const { data: phoneAllowed } = await admin.rpc('check_rate_limit', {
        p_key: `rate:otp:verify:phone:${phone}`,
        p_max_hits: 5,
        p_window_seconds: 900,
      });

      if (!ipAllowed || !phoneAllowed) {
        await admin.from('security_logs').insert({
          event_type: 'rate_limit_exceeded',
          severity: 'high',
          description: `Login verification rate limit exceeded for Phone: ${phone}, IP: ${ip}`,
          ip_address: ip,
          user_agent: userAgent,
        });
        return createErrorResponse('Too many verification attempts. Please try again in 15 minutes.', 429);
      }

      const token = String(body.token || '').trim();
      if (token !== DEV_OTP_CODE) {
        // Log authentication failure
        await admin.from('auth_audit_events').insert({
          event_type: 'login_failed',
          ip_address: ip,
          user_agent: userAgent,
          metadata: { phone, reason: 'Invalid OTP' },
        });

        // Insert security log for failed login attempt
        await admin.from('security_logs').insert({
          event_type: 'unauthorized_access',
          severity: 'low',
          description: `Failed login attempt for phone ${phone}`,
          ip_address: ip,
          user_agent: userAgent,
          metadata: { phone },
        });

        return createErrorResponse('Invalid development OTP.', 400);
      }

      const credentials = await ensureDevUser(phone);
      
      // Fetch user profile for proper audit linkage
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      // Log successful authentication
      await admin.from('auth_audit_events').insert({
        user_id: profile?.id || null,
        event_type: 'login_success',
        ip_address: ip,
        user_agent: userAgent,
        metadata: { phone },
      });

      return createResponse({
        provider: 'mock',
        phone,
        credentials,
      });
    }

    return createErrorResponse('Unsupported OTP action.', 400);
  } catch (error) {
    return handleApiError(error);
  }
}
