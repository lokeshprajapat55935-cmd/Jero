import { z } from 'zod';

/**
 * Client-safe Environment variables schema
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid NEXT_PUBLIC_SUPABASE_URL format'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional().default('http://localhost:3000'),
  NEXT_PUBLIC_OTP_PROVIDER: z.enum(['firebase', 'mock']).optional().default('firebase'),
  NEXT_PUBLIC_DEV_OTP_CODE: z.string().optional().default('123456'),
  NEXT_PUBLIC_MOCK_OTP_MODE: z.string().optional().transform(v => v === 'true').default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

/**
 * Server-only Environment variables schema (adds sensitive credentials)
 */
const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required').optional(),
  DEV_AUTH_PASSWORD: z.string().optional().default('zolvo-local-dev-auth-only'),
});

const isServer = typeof window === 'undefined';

const envData = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_OTP_PROVIDER: process.env.NEXT_PUBLIC_OTP_PROVIDER,
  NEXT_PUBLIC_DEV_OTP_CODE: process.env.NEXT_PUBLIC_DEV_OTP_CODE,
  NEXT_PUBLIC_MOCK_OTP_MODE: process.env.NEXT_PUBLIC_MOCK_OTP_MODE,
  NODE_ENV: process.env.NODE_ENV,
  ...(isServer ? {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DEV_AUTH_PASSWORD: process.env.DEV_AUTH_PASSWORD,
  } : {}),
};

const parsed = isServer 
  ? serverEnvSchema.safeParse(envData) 
  : clientEnvSchema.safeParse(envData);

if (!parsed.success && process.env.NODE_ENV === 'development') {
  console.warn('⚠️ Environment validation failed:', parsed.error.format());
}

// Fallback to raw data to ensure compilation doesn't crash during build time
const env = parsed.success ? parsed.data : (envData as any);

/**
 * Centralized App Configuration
 */
export const config = {
  env: {
    supabase: {
      url: env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: isServer ? ((env as any).SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) : undefined,
    },
    otp: {
      provider: env.NEXT_PUBLIC_OTP_PROVIDER || process.env.NEXT_PUBLIC_OTP_PROVIDER || 'firebase',
      devCode: env.NEXT_PUBLIC_DEV_OTP_CODE || process.env.NEXT_PUBLIC_DEV_OTP_CODE || '123456',
      mockMode: env.NEXT_PUBLIC_MOCK_OTP_MODE,
      devAuthPassword: isServer ? ((env as any).DEV_AUTH_PASSWORD || process.env.DEV_AUTH_PASSWORD || 'zolvo-local-dev-auth-only') : undefined,
    },
    isDev: (env.NODE_ENV || process.env.NODE_ENV || 'development') === 'development',
    isProd: (env.NODE_ENV || process.env.NODE_ENV) === 'production',
  },
  site: {
    name: 'Zolvo',
    description: 'Local Worker Marketplace',
    url: env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  },
};
