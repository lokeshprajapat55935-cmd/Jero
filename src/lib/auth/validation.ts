import { z } from 'zod';
import { isValidIndianMobile, normalizeIndianMobile } from '@/lib/phone';

export const phoneLoginSchema = z.object({
  phone: z
    .string()
    .min(1, 'Mobile number is required')
    .refine((value) => isValidIndianMobile(value), 'Enter a valid 10-digit Indian mobile number'),
});

export const otpVerifySchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  token: z
    .string()
    .length(6, 'Enter the 6-digit OTP')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
});

export const adminLoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const roleSelectionSchema = z.object({
  role: z.enum(['client', 'worker'], { message: 'Select client or worker' }),
});

export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export function parsePhoneField(phone: string) {
  return phoneLoginSchema.parse({ phone: normalizeIndianMobile(phone) });
}