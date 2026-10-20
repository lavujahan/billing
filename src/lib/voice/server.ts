import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { resolveOpenAIKey, type ResolvedKey } from "@/lib/ai/keys";
import { MAX_AUDIO_BYTES } from "@/lib/ai/transcribe";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type VoiceRequest = { user: CurrentUser; key: ResolvedKey; supabase: Supabase; audio: File; durationMs: number; form: FormData };

// Shared guard for voice endpoints: signed-in user, an AI key, and a sane audio upload.
export async function readVoiceRequest(request: Request): Promise<VoiceRequest | NextResponse> {
  const user = await getCurrentUser();
  const key = await resolveOpenAIKey(user.businessId);
  if (!key) return NextResponse.json({ error: "ai_off", message: "Voice is off — an admin needs to add the OpenAI key." }, { status: 409 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!form || !(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "no_audio" }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "too_long", message: "Recording is too long." }, { status: 413 });

  const durationMs = Math.min(Number(form.get("durationMs") ?? 0) || 0, 120_000);
  return { user, key, supabase: await createClient(), audio, durationMs, form };
}

// Recent customer and item names, used to steer speech-to-text spelling.
export async function vocabulary(supabase: Supabase, kinds: Array<"customer" | "product" | "vendor">): Promise<string[]> {
  const out: string[] = [];
  if (kinds.includes("vendor")) {
    const { data } = await supabase.from("vendors").select("name, name_ta").eq("active", true).order("name").limit(60);
    for (const v of data ?? []) out.push(v.name, ...(v.name_ta ? [v.name_ta] : []));
  }
  if (kinds.includes("customer")) {
    const { data } = await supabase.from("customers").select("name, name_ta").eq("active", true).order("created_at", { ascending: false }).limit(40);
    for (const c of data ?? []) out.push(c.name, ...(c.name_ta ? [c.name_ta] : []));
  }
  if (kinds.includes("product")) {
    const { data } = await supabase.from("products").select("name, name_ta").eq("active", true).order("name").limit(60);
    for (const p of data ?? []) out.push(p.name, ...(p.name_ta ? [p.name_ta] : []));
  }
  return [...new Set(out)];
}
