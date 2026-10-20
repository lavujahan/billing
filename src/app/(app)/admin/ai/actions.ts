"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { hasMasterKey } from "@/lib/ai/crypto";
import { recordKeyTest, removeBusinessKey, resolveOpenAIKey, saveBusinessKey, testKey } from "@/lib/ai/keys";
import { createAdminClient } from "@/lib/supabase/admin";

export type KeyFormState = { ok: boolean; message: string } | null;

async function audit(businessId: string, userId: string, action: string, last4: string | null) {
  await createAdminClient()
    .from("audit_log")
    .insert({
      business_id: businessId,
      table_name: "ai_credentials",
      record_id: businessId,
      action,
      new_values: last4 ? { key_last4: last4 } : null,
      changed_by: userId,
      via: "tap",
    });
}

export async function saveKeyAction(_prev: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const user = await requireAdmin();
  if (!hasMasterKey()) return { ok: false, message: "Server is missing AI_KEY_ENCRYPTION_KEY — see README." };
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(apiKey)) return { ok: false, message: "That doesn't look like an OpenAI key (it starts with sk-)." };

  const ok = await testKey(apiKey);
  if (!ok) return { ok: false, message: "OpenAI rejected this key. Check it and try again." };

  await saveBusinessKey(user.businessId, user.id, apiKey);
  await recordKeyTest(user.businessId, true);
  await audit(user.businessId, user.id, "key_set", apiKey.slice(-4));
  revalidatePath("/admin/ai");
  return { ok: true, message: `Saved and tested · key ending ${apiKey.slice(-4)}` };
}

export async function testKeyAction(): Promise<KeyFormState> {
  const user = await requireAdmin();
  const key = await resolveOpenAIKey(user.businessId);
  if (!key) return { ok: false, message: "No key is set." };
  const ok = await testKey(key.apiKey);
  if (key.scope === "business") await recordKeyTest(user.businessId, ok);
  revalidatePath("/admin/ai");
  return ok ? { ok: true, message: "Key works ✓" } : { ok: false, message: "OpenAI rejected the key." };
}

export async function removeKeyAction(): Promise<void> {
  const user = await requireAdmin();
  await removeBusinessKey(user.businessId);
  await audit(user.businessId, user.id, "key_removed", null);
  revalidatePath("/admin/ai");
}
