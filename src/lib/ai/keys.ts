import "server-only";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "./crypto";

export type ResolvedKey = { apiKey: string; scope: "business" | "platform" };

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { value: ResolvedKey | null; at: number }>();

// Business key → platform key (vendor, OPENAI_API_KEY env) → null, which means AI features are off
// and the forms work by typing only.
export async function resolveOpenAIKey(businessId: string): Promise<ResolvedKey | null> {
  const hit = cache.get(businessId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const { data } = await createAdminClient()
    .from("ai_credentials")
    .select("key_encrypted")
    .eq("scope", "business")
    .eq("business_id", businessId)
    .eq("provider", "openai")
    .eq("is_active", true)
    .maybeSingle();

  let value: ResolvedKey | null = null;
  if (data) {
    try {
      value = { apiKey: decryptSecret(data.key_encrypted), scope: "business" };
    } catch (e) {
      console.error("AI key could not be decrypted (wrong AI_KEY_ENCRYPTION_KEY?)", e instanceof Error ? e.message : e);
    }
  }
  if (!value && process.env.OPENAI_API_KEY) value = { apiKey: process.env.OPENAI_API_KEY, scope: "platform" };

  cache.set(businessId, { value, at: Date.now() });
  return value;
}

export function clearKeyCache(businessId: string) {
  cache.delete(businessId);
}

export type KeyStatus = {
  hasBusinessKey: boolean;
  last4: string | null;
  setAt: string | null;
  setBy: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  platformAvailable: boolean;
};

export async function getKeyStatus(businessId: string): Promise<KeyStatus> {
  const { data } = await createAdminClient()
    .from("ai_credentials")
    .select("key_last4, created_at, last_tested_at, last_test_ok, users:set_by(full_name)")
    .eq("scope", "business")
    .eq("business_id", businessId)
    .eq("provider", "openai")
    .maybeSingle();
  return {
    hasBusinessKey: Boolean(data),
    last4: data?.key_last4 ?? null,
    setAt: data?.created_at ?? null,
    setBy: (data?.users as unknown as { full_name: string } | null)?.full_name ?? null,
    lastTestedAt: data?.last_tested_at ?? null,
    lastTestOk: data?.last_test_ok ?? null,
    platformAvailable: Boolean(process.env.OPENAI_API_KEY),
  };
}

export async function saveBusinessKey(businessId: string, userId: string, apiKey: string) {
  const service = createAdminClient();
  const { error } = await service.from("ai_credentials").upsert(
    {
      scope: "business",
      business_id: businessId,
      provider: "openai",
      key_encrypted: encryptSecret(apiKey),
      key_last4: apiKey.slice(-4),
      is_active: true,
      last_tested_at: null,
      last_test_ok: null,
      set_by: userId,
      created_at: new Date().toISOString(),
    },
    { onConflict: "scope,business_id,provider" },
  );
  if (error) throw new Error(`Could not save key: ${error.message}`);
  clearKeyCache(businessId);
}

export async function removeBusinessKey(businessId: string) {
  await createAdminClient().from("ai_credentials").delete().eq("scope", "business").eq("business_id", businessId).eq("provider", "openai");
  clearKeyCache(businessId);
}

// One cheap call: listing models needs a valid key but no tokens.
export async function testKey(apiKey: string): Promise<boolean> {
  try {
    await new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 }).models.list();
    return true;
  } catch {
    return false;
  }
}

export async function recordKeyTest(businessId: string, ok: boolean) {
  await createAdminClient()
    .from("ai_credentials")
    .update({ last_tested_at: new Date().toISOString(), last_test_ok: ok })
    .eq("scope", "business")
    .eq("business_id", businessId)
    .eq("provider", "openai");
}
