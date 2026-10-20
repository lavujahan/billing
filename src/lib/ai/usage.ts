import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logAiUsage(row: {
  businessId: string;
  userId: string;
  moduleId: string;
  kind: "agent_run" | "transcription" | "vision" | "key_test";
  model: string;
  keyScope: "business" | "platform";
  ok: boolean;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
}) {
  const { error } = await createAdminClient().from("ai_usage").insert({
    business_id: row.businessId,
    created_by: row.userId,
    module_id: row.moduleId,
    kind: row.kind,
    model: row.model,
    key_scope: row.keyScope,
    ok: row.ok,
    input_tokens: row.inputTokens ?? null,
    output_tokens: row.outputTokens ?? null,
    audio_seconds: row.audioSeconds ?? null,
  });
  if (error) console.error("ai_usage insert failed", error.message);
}
