import "server-only";
import { Agent, OpenAIProvider, Runner, type AgentInputItem } from "@openai/agents";
import { z } from "zod";
import type { ResolvedKey } from "@/lib/ai/keys";
import { logAiUsage } from "@/lib/ai/usage";
import { purchaseInstructions } from "./prompt";

export const PURCHASE_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_AGENT_MODEL || "gpt-5.4-mini";
const REASONING = (process.env.OPENAI_AGENT_REASONING || "none") as "none" | "minimal" | "low" | "medium";

const conf = z.number();

// One schema for bill photos, PDFs and spoken purchases. Required-but-nullable for strict structured output.
export const PurchaseExtraction = z.object({
  is_bill: z.boolean(),
  document_kind: z.enum(["tax_invoice", "bill", "credit_note", "estimate", "not_a_bill"]),
  bill_count: z.number(),
  handwritten: z.boolean(),
  vendor_name: z.string().nullable(),
  vendor_gstin: z.string().nullable(),
  bill_number: z.string().nullable(),
  bill_date: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      hsn: z.string().nullable(),
      qty: z.number().nullable(),
      unit: z.string().nullable(),
      rate: z.number().nullable(),
      gst_rate: z.number().nullable(),
      amount: z.number().nullable(),
      confidence: conf,
    }),
  ),
  rates_include_gst: z.boolean().nullable(),
  subtotal: z.number().nullable(),
  discount: z.number().nullable(),
  cgst: z.number().nullable(),
  sgst: z.number().nullable(),
  igst: z.number().nullable(),
  round_off: z.number().nullable(),
  total_amount: z.number().nullable(),
  payment_status: z.enum(["paid", "credit", "partial"]).nullable(),
  amount_paid: z.number().nullable(),
  payment_mode: z.enum(["cash", "upi", "bank", "cheque"]).nullable(),
  confidence: z.object({ vendor: conf, bill_number: conf, bill_date: conf, total: conf }),
});
export type PurchaseExtraction = z.infer<typeof PurchaseExtraction>;

export type DocumentInput = { mime: string; base64: string; name: string };

export async function runPurchaseAgent(opts: {
  key: ResolvedKey;
  today: string;
  vendorNames: string[];
  documents?: DocumentInput[];
  transcript?: string;
  businessId: string;
  userId: string;
  logUsage?: boolean;
}): Promise<PurchaseExtraction> {
  const agent = new Agent({
    name: "purchase",
    model: PURCHASE_MODEL,
    instructions: purchaseInstructions(opts.today, opts.vendorNames),
    outputType: PurchaseExtraction,
    modelSettings: { reasoning: { effort: REASONING } },
  });
  const runner = new Runner({ modelProvider: new OpenAIProvider({ apiKey: opts.key.apiKey }), tracingDisabled: true, workflowName: "purchase-read" });

  const content: Extract<AgentInputItem, { role: "user" }>["content"] = [];
  if (opts.documents?.length) {
    content.push({ type: "input_text", text: `Read this supplier bill (${opts.documents.length} page${opts.documents.length > 1 ? "s" : ""}).` });
    for (const d of opts.documents) {
      if (d.mime === "application/pdf") content.push({ type: "input_file", file: `data:application/pdf;base64,${d.base64}`, filename: d.name });
      else content.push({ type: "input_image", image: `data:${d.mime};base64,${d.base64}`, detail: "high" });
    }
  }
  if (opts.transcript) content.push({ type: "input_text", text: `The owner said (no bill photo):\n${opts.transcript}` });

  const kind = opts.documents?.length ? "vision" : "agent_run";
  let ok = false;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await runner.run(agent, [{ role: "user", content }], { maxTurns: 2 });
    inputTokens = result.runContext.usage.inputTokens;
    outputTokens = result.runContext.usage.outputTokens;
    if (!result.finalOutput) throw new Error("agent returned no output");
    ok = true;
    return result.finalOutput;
  } finally {
    if (opts.logUsage !== false)
      await logAiUsage({
        businessId: opts.businessId,
        userId: opts.userId,
        moduleId: "purchase",
        kind,
        model: PURCHASE_MODEL,
        keyScope: opts.key.scope,
        ok,
        inputTokens,
        outputTokens,
      });
  }
}
