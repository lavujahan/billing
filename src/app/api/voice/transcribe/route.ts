import { NextResponse } from "next/server";
import { transcribe, type FieldKind } from "@/lib/ai/transcribe";
import { readVoiceRequest, vocabulary } from "@/lib/voice/server";

const KINDS: FieldKind[] = ["customer", "vendor", "product", "alias", "qty", "amount", "date", "payment"];

// Field voice: one short recording → text. Parsing into a value happens in the browser, in code.
export async function POST(request: Request) {
  const req = await readVoiceRequest(request);
  if (req instanceof NextResponse) return req;

  const kind = String(req.form.get("kind") ?? "") as FieldKind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const moduleId = String(req.form.get("module") ?? "billing").slice(0, 20);

  const vocab = kind === "customer" || kind === "product" || kind === "vendor" ? await vocabulary(req.supabase, [kind]) : [];
  try {
    const text = await transcribe({
      key: req.key,
      audio: req.audio,
      kind,
      vocabulary: vocab,
      businessId: req.user.businessId,
      userId: req.user.id,
      moduleId,
      durationMs: req.durationMs,
    });
    return NextResponse.json({ text });
  } catch (e) {
    console.error("transcription failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "stt_failed", message: "Couldn't hear that — try again." }, { status: 502 });
  }
}
