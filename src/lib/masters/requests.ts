import "server-only";
import { createClient } from "@/lib/supabase/server";

// Callers must have checked the admin role. Runs as the user, so RLS also limits it to admins.
export async function resolveRequest(
  id: string,
  status: "approved" | "merged" | "rejected",
  resolvedId: string | null,
  userId: string,
  note?: string,
) {
  const supabase = await createClient();
  await supabase
    .from("master_requests")
    .update({ status, resolved_id: resolvedId, resolved_by: userId, resolved_at: new Date().toISOString(), note: note ?? null })
    .eq("id", id)
    .eq("status", "open");
}
