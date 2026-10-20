import "server-only";
import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import { z } from "zod";
import type { ResolvedKey } from "@/lib/ai/keys";
import { logAiUsage } from "@/lib/ai/usage";
import { billingInstructions, type MasterLists } from "./prompt";

export const BILLING_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-5.4-mini";
const REASONING = (process.env.OPENAI_AGENT_REASONING || "none") as "none" | "minimal" | "low" | "medium";

// Extraction only. Every field is required-but-nullable so the schema works in strict structured-output mode.
// The shop's items and customers are in the instructions as short refs ("i12", "c3"), so the model maps
// spoken words to the master in one call — no tool round trips.
export const BillExtraction = z.object({
  bills: z
    .array(
      z.object({
        customer_name: z.string().nullable(),
        customer_ref: z.string().nullable(),
        customer_confidence: z.number(),
        items: z.array(
          z.object({
            spoken_name: z.string(),
            item_ref: z.string().nullable(),
            qty: z.number().nullable(),
            unit: z.string().nullable(),
            rate: z.number().nullable(),
            confidence: z.number(),
          }),
        ),
        line_updates: z.array(z.object({ line_key: z.string(), qty: z.number().nullable(), rate: z.number().nullable() })),
        payment: z.enum(["paid", "credit", "partial"]).nullable(),
        amount_paid: z.number().nullable(),
        discount_amount: z.number().nullable(),
        discount_percent: z.number().nullable(),
        rate_includes_gst: z.boolean().nullable(),
        date: z.string().nullable(),
        notes: z.string().nullable(),
      }),
    )
    .max(5),
});
export type BillExtraction = z.infer<typeof BillExtraction>;

export async function runBillingAgent(opts: {
  key: ResolvedKey;
  masters: MasterLists;
  transcript: string;
  currentForm: unknown;
  today: string;
  businessId: string;
  userId: string;
  logUsage?: boolean;
}): Promise<BillExtraction> {
  const agent = new Agent({
    name: "billing",
    model: BILLING_MODEL,
    instructions: billingInstructions(opts.today, opts.masters),
    outputType: BillExtraction,
    modelSettings: { reasoning: { effort: REASONING } },
  });
  const runner = new Runner({
    modelProvider: new OpenAIProvider({ apiKey: opts.key.apiKey }),
    tracingDisabled: true,
    workflowName: "billing-free-voice",
  });

  let ok = false;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await runner.run(agent, `Current form (JSON):\n${JSON.stringify(opts.currentForm)}\n\nUser said:\n${opts.transcript}`, {
      maxTurns: 2,
    });
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
        moduleId: "billing",
        kind: "agent_run",
        model: BILLING_MODEL,
        keyScope: opts.key.scope,
        ok,
        inputTokens,
        outputTokens,
      });
  }
}
