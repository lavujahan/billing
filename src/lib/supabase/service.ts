import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. App code imports it via ./admin (server-only guard);
// the CLI script in scripts/ imports this file directly because `server-only` throws outside Next.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
