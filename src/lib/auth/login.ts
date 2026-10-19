import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashCode, isValidCodeFormat, verifyCode } from "./code";
import { normalizeMobile, syntheticEmail } from "./phone";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// Compared against when the mobile is unknown, so response time doesn't reveal which numbers exist.
let dummyHash: Promise<string> | undefined;

export type LoginResult = { ok: true } | { ok: false; error: "invalid" | "locked" | "format" | "server" };

export async function loginWithMobileCode(rawMobile: string, code: string): Promise<LoginResult> {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile || !isValidCodeFormat(code)) return { ok: false, error: "format" };

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("users")
    .select("id, code_hash, active, failed_attempts, locked_until")
    .eq("mobile", mobile)
    .maybeSingle();

  if (!user || !user.active) {
    dummyHash ??= hashCode("00000");
    await verifyCode(code, await dummyHash);
    return { ok: false, error: "invalid" };
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) return { ok: false, error: "locked" };

  if (!(await verifyCode(code, user.code_hash))) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await admin
      .from("users")
      .update({
        failed_attempts: lock ? 0 : attempts,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", user.id);
    return { ok: false, error: lock ? "locked" : "invalid" };
  }

  await admin.from("users").update({ failed_attempts: 0, locked_until: null }).eq("id", user.id);

  // Mint a one-time magic-link token (no email is sent) and exchange it for a cookie session.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: syntheticEmail(mobile),
  });
  if (linkError || !link.properties?.hashed_token) return { ok: false, error: "server" };

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (otpError) return { ok: false, error: "server" };

  return { ok: true };
}
