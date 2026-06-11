const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export function digitsOnly(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

export function normalizeIndianMobile(value?: string | null): string {
  if (!value) return "";
  const digits = digitsOnly(value);
  const withoutCountryCode = digits.startsWith("91") && digits.length > 10
    ? digits.slice(2)
    : digits;

  return withoutCountryCode.slice(0, 10);
}

export function isValidIndianMobile(value?: string | null): boolean {
  if (!value) return false;
  return INDIAN_MOBILE_REGEX.test(normalizeIndianMobile(value));
}

export function toE164IndianMobile(value?: string | null): string | null {
  if (!value) return null;
  const mobile = normalizeIndianMobile(value);
  if (!INDIAN_MOBILE_REGEX.test(mobile)) {
    return null; // Return null instead of throwing an error
  }

  return `+91${mobile}`;
}

export function formatIndianMobile(value?: string | null): string {
  if (!value) return "";
  const mobile = normalizeIndianMobile(value);
  if (mobile.length <= 5) return mobile;
  return `${mobile.slice(0, 5)} ${mobile.slice(5)}`;
}

export function maskIndianMobile(value?: string | null): string {
  if (!value) return "+91";
  const mobile = normalizeIndianMobile(value);
  if (mobile.length !== 10) return "+91";
  return `+91 ${mobile.slice(0, 2)}xx xxx ${mobile.slice(-3)}`;
}
