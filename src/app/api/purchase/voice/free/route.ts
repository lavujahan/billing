import { NextResponse } from "next/server";
import { transcribe } from "@/lib/ai/transcribe";
import { todayISO } from "@/lib/money";
import type { ReadResponse } from "@/lib/purchase/patch";
import { readVoiceRequest } from "@/lib/voice/server";
import { runPurchaseAgent } from "@/modules/purchase/agent";
import { toPurchasePatch } from "@/modules/purchase/match";

// Spoken purchase with no bill in hand: "ABC Traders 12500 cement, GST 18, credit".
export async function POST(request: Request) {
  const req = await readVoiceRequest(request);
  if (req instanceof NextResponse) return req;
  const reply = (body: ReadResponse, status = 200) => NextResponse.json(body, { status });

  const { data: vendors } = await req.supabase.from("vendors").select("name, name_ta").eq("active", true).order("name").limit(300);
  const vendorNames = (vendors ?? []).map((v) => v.name);

  let transcript = "";
  try {
    transcript = await transcribe({
      key: req.key,
      audio: req.audio,
      kind: "bill",
      vocabulary: [...vendorNames, ...(vendors ?? []).flatMap((v) => (v.name_ta ? [v.name_ta] : []))],
      businessId: req.user.businessId,
      userId: req.user.id,
      moduleId: "purchase",
      durationMs: req.durationMs,
    });
  } catch {
    return reply({ ok: false, error: "stt_failed", message: "Couldn't hear that — try again." }, 502);
  }
  if (!transcript) return reply({ ok: false, error: "empty", message: "புரியல, மறுபடியும் சொல்லுங்க · Didn't catch that." });

  try {
    const extraction = await runPurchaseAgent({
      key: req.key,
      today: todayISO(),
      vendorNames,
      transcript,
      businessId: req.user.businessId,
      userId: req.user.id,
    });
    return reply({ ok: true, transcript, patch: await toPurchasePatch(req.supabase, extraction) });
  } catch (e) {
    console.error("purchase voice failed", e instanceof Error ? e.message : e);
    return reply({ ok: false, error: "agent_failed", message: "Couldn't understand that — try again or type it.", transcript }, 502);
  }
}
