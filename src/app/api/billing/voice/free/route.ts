import { NextResponse } from "next/server";
import { transcribe } from "@/lib/ai/transcribe";
import { toDraftFromPatch } from "@/lib/billing/apply-patch";
import type { BillDraft } from "@/lib/billing/types";
import type { FreeVoiceResponse } from "@/lib/billing/voice-patch";
import { todayISO } from "@/lib/money";
import { readVoiceRequest, vocabulary } from "@/lib/voice/server";
import { runBillingAgent } from "@/modules/billing/agent";
import { toVoicePatch } from "@/modules/billing/match";

// Free-form voice: whole utterance → transcript → one agent run → matched form patch.
// Bills for extra customers in the same sentence become separate drafts.
export async function POST(request: Request) {
  const req = await readVoiceRequest(request);
  if (req instanceof NextResponse) return req;
  const reply = (body: FreeVoiceResponse, status = 200) => NextResponse.json(body, { status });

  let form: BillDraft | null = null;
  try {
    form = JSON.parse(String(req.form.get("form") ?? "null"));
  } catch {}

  let transcript = "";
  try {
    transcript = await transcribe({
      key: req.key,
      audio: req.audio,
      kind: "bill",
      vocabulary: await vocabulary(req.supabase, ["customer", "product"]),
      businessId: req.user.businessId,
      userId: req.user.id,
      moduleId: "billing",
      durationMs: req.durationMs,
    });
  } catch (e) {
    console.error("free voice transcription failed", e instanceof Error ? e.message : e);
    return reply({ ok: false, error: "stt_failed", message: "Couldn't hear that — try again." }, 502);
  }
  if (!transcript) return reply({ ok: false, error: "empty", message: "புரியல, மறுபடியும் சொல்லுங்க · Didn't catch that." });

  const today = todayISO();
  const formSummary = form && {
    customer: form.customer?.name ?? null,
    lines: form.lines.map((l) => ({ key: l.key, item: l.name, qty: l.qty, rate: l.rate })),
    payment: form.payment,
  };

  try {
    const extraction = await runBillingAgent({
      key: req.key,
      supabase: req.supabase,
      transcript,
      currentForm: formSummary,
      today,
      businessId: req.user.businessId,
      userId: req.user.id,
    });
    const [first, ...rest] = extraction.bills;
    if (!first) return reply({ ok: false, error: "nothing", message: "No bill details heard.", transcript });

    const patch = await toVoicePatch(req.supabase, first, form?.customer ?? null);
    const extraDrafts: { id: string; title: string }[] = [];
    for (const bill of rest) {
      const extraPatch = await toVoicePatch(req.supabase, bill, null);
      const draft = toDraftFromPatch(extraPatch, today);
      const title = draft.customer?.name ?? extraPatch.customer?.spokenName ?? "";
      const { data } = await req.supabase
        .from("form_drafts")
        .insert({ business_id: req.user.businessId, created_by: req.user.id, module: "billing", title, amount: null, data: draft })
        .select("id")
        .single();
      if (data) extraDrafts.push({ id: data.id, title });
    }
    return reply({ ok: true, transcript, patch, extraDrafts });
  } catch (e) {
    console.error("billing agent failed", e instanceof Error ? e.message : e);
    return reply({ ok: false, error: "agent_failed", message: "Couldn't understand the bill — try again or type it.", transcript }, 502);
  }
}
