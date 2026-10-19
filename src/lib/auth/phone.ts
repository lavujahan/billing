// Indian mobile numbers only for now: 10 digits starting 6–9, stored as +91XXXXXXXXXX.
export function normalizeMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

// Supabase Auth needs an email; this one is never shown and no mail is ever sent to it.
export function syntheticEmail(mobile: string): string {
  const domain = process.env.AUTH_EMAIL_DOMAIN || "users.business-assistant.invalid";
  return `u${mobile.replace(/\D/g, "")}@${domain}`;
}
