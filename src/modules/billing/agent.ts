import "server-only";
import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";
import type { ResolvedKey } from "@/lib/ai/keys";
import { logAiUsage } from "@/lib/ai/usage";
import type { createClient } from "@/lib/supabase/server";
import { billingInstructions } from "./prompt";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Ctx = { supabase: Supabase };

export const BILLING_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-5.4-mini";

// Extraction only. Every field is required-but-nullable so the schema works in strict structured-output mode.
export const BillExtraction = z.object({
  bills: z
    .array(
      z.object({
        customer_name: z.string().nullable(),
        customer_confidence: z.number(),
        items: z.array(
          z.object({
            spoken_name: z.string(),
            product_id: z.string().nullable(),
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

const sanitize = (q: string) => q.replace(/[%_\\]/g, "").trim().slice(0, 60);

// Read-only lookups. The agent can't write anything: saving happens only when the user taps Save.
const findProduct = tool({
  name: "find_product",
  description: "Search the shop's item master by spoken item name (English, Tamil or alias). Returns the closest items with ids.",
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }, ctx) => {
    const { supabase } = (ctx?.context ?? {}) as Ctx;
    const { data } = await supabase.rpc("search_products", { q: sanitize(query), lim: 5 });
    return JSON.stringify(
      (data ?? []).map((p: { id: string; name: string; name_ta: string | null; unit: string | null; default_rate: number | null; score: number }) => ({
        id: p.id,
        name: p.name,
        name_ta: p.name_ta,
        unit: p.unit,
        default_rate: p.default_rate,
        score: Number(p.score.toFixed(2)),
      })),
    );
  },
});

const findCustomer = tool({
  name: "find_customer",
  description: "Search the customer list by spoken name. Returns the closest customers.",
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }, ctx) => {
    const { supabase } = (ctx?.context ?? {}) as Ctx;
    const { data } = await supabase.rpc("search_customers", { q: sanitize(query), lim: 5 });
    return JSON.stringify(
      (data ?? []).map((c: { id: string; name: string; name_ta: string | null; score: number }) => ({
        id: c.id,
        name: c.name,
        name_ta: c.name_ta,
        score: Number(c.score.toFixed(2)),
      })),
    );
  },
});

export async function runBillingAgent(opts: {
  key: ResolvedKey;
  supabase: Supabase;
  transcript: string;
  currentForm: unknown;
  today: string;
  businessId: string;
  userId: string;
  logUsage?: boolean;
}): Promise<BillExtraction> {
  const agent = new Agent<Ctx, typeof BillExtraction>({
    name: "billing",
    model: BILLING_MODEL,
    instructions: billingInstructions(opts.today),
    tools: [findProduct, findCustomer],
    outputType: BillExtraction,
    modelSettings: { reasoning: { effort: "low" } },
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
    const result = await runner.run(
      agent,
      `Current form (JSON):\n${JSON.stringify(opts.currentForm)}\n\nUser said:\n${opts.transcript}`,
      { context: { supabase: opts.supabase }, maxTurns: 6 },
    );
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
