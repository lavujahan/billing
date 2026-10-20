import "server-only";
import OpenAI from "openai";
import { logAiUsage } from "./usage";
import type { ResolvedKey } from "./keys";

export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export type FieldKind = "customer" | "vendor" | "product" | "qty" | "amount" | "date" | "payment" | "bill";

const HINTS: Record<FieldKind, string> = {
  customer: "Shop or person name, Tamil or English. ",
  vendor: "Supplier or company name, Tamil or English. ",
  product: "Item name in a shop with an optional quantity, Tamil or English, e.g. பத்து மூட்டை சிமெண்ட், 5 கம்பி, cement 10 bag. ",
  qty: "A quantity with unit, e.g. பத்து மூட்டை, 10 bag, ரெண்டரை கிலோ. ",
  amount: "A rupee amount in Tamil or English words or digits, e.g. நானூத்தி அம்பது, 450, 3.5k. ",
  date: "A date, e.g. இன்னைக்கு, நேத்து, 15th October. ",
  payment: "Payment: cash, credit, கடன், partial 2000, GPay. ",
  bill: "A shop owner dictating a bill in Tamil, English or both: customer, items with quantity and rate, payment. ",
};

// The prompt carries this business's own customer and item names so they are spelled the way the master has them.
export async function transcribe(opts: {
  key: ResolvedKey;
  audio: File;
  kind: FieldKind;
  vocabulary: string[];
  businessId: string;
  userId: string;
  moduleId: string;
  durationMs: number;
}): Promise<string> {
  const client = new OpenAI({ apiKey: opts.key.apiKey, timeout: 30_000, maxRetries: 1 });
  const prompt = `${HINTS[opts.kind]}${opts.vocabulary.length ? `Names: ${opts.vocabulary.slice(0, 60).join(", ")}.` : ""}`;
  let ok = false;
  try {
    const res = await client.audio.transcriptions.create({ file: opts.audio, model: TRANSCRIBE_MODEL, prompt, response_format: "json" });
    ok = true;
    return res.text.trim();
  } finally {
    await logAiUsage({
      businessId: opts.businessId,
      userId: opts.userId,
      moduleId: opts.moduleId,
      kind: "transcription",
      model: TRANSCRIBE_MODEL,
      keyScope: opts.key.scope,
      ok,
      audioSeconds: Math.round(opts.durationMs / 100) / 10,
    });
  }
}
