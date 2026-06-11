import { config } from '@/config';

export type OtpProvider = 'mock' | 'supabase';

export const DEV_OTP_CODE = config.env.otp.devCode;

export function getOtpProvider(): OtpProvider {
  const configuredProvider = config.env.otp.provider;

  if (configuredProvider === 'supabase' || configuredProvider === 'mock') {
    return configuredProvider;
  }

  return config.env.isProd ? 'supabase' : 'mock';
}

export function isMockOtpEnabled() {
  return getOtpProvider() === 'mock';
}
