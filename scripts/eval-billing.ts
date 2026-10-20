// Runs the Billing agent over the eval set and scores it. Uses a fixed item/customer list,
// so results don't depend on any real business. Needs OPENAI_API_KEY in the environment.
//   npm run eval:billing            (all cases)
//   npm run eval:billing -- --only 3
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runBillingAgent, type BillExtraction } from "../src/modules/billing/agent";

type Item = { id: string; name: string; name_ta: string | null; aliases?: string[]; unit?: string; default_rate?: number };
type Expected = {
  customer: string | null;
  items: { product: string | null; qty: number | null; rate: number | null }[];
  payment?: string;
  amount_paid?: number;
  discount_amount?: number;
  discount_percent?: number;
  rate_includes_gst?: boolean;
  date?: "yesterday";
  line_updates?: { line_key: string; qty?: number; rate?: number }[];
};
type Case = { said: string; form?: unknown; expect: Expected[] };

const set = JSON.parse(readFileSync(new URL("../src/modules/billing/evals/billing.json", import.meta.url), "utf8")) as {
  products: Item[];
  customers: Item[];
  cases: Case[];
};
const { values } = parseArgs({ options: { only: { type: "string" } } });

function score(row: Item, q: string) {
  const query = q.toLowerCase().trim();
  const names = [row.name, row.name_ta ?? "", ...(row.aliases ?? [])].map((n) => n.toLowerCase());
  if (names.some((n) => n === query)) return 1;
  if (names.some((n) => n && (n.includes(query) || query.includes(n)))) return 0.8;
  const words = query.split(/\s+/);
  return names.some((n) => words.some((w) => w.length > 2 && n.includes(w))) ? 0.5 : 0;
}

// Minimal stand-in for the Supabase client: only the read RPCs the agent's tools call.
const fakeSupabase = {
  rpc: async (fn: string, args: { q: string }) => {
    const rows = fn === "search_products" ? set.products : set.customers;
    const data = rows
      .map((r) => ({ ...r, score: score(r, args.q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { data, error: null };
  },
};

const productName = (id: string | null) => set.products.find((p) => p.id === id)?.name ?? null;
const customerName = (spoken: string | null) => {
  if (!spoken) return null;
  if (/^cash$/i.test(spoken)) return "Cash";
  const best = set.customers.map((c) => ({ c, s: score(c, spoken) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s > 0 ? best.c.name : spoken;
};

function check(got: BillExtraction, expect: Expected[], today: string): string[] {
  const errors: string[] = [];
  if (got.bills.length !== expect.length) errors.push(`bills: expected ${expect.length}, got ${got.bills.length}`);
  expect.forEach((e, i) => {
    const b = got.bills[i];
    if (!b) return;
    if ((e.customer ?? null) !== customerName(b.customer_name)) errors.push(`customer: expected ${e.customer}, got ${b.customer_name}`);
    const items = b.items.map((it) => ({ product: productName(it.product_id), qty: it.qty, rate: it.rate }));
    if (items.length !== e.items.length) errors.push(`items: expected ${e.items.length}, got ${items.length} ${JSON.stringify(items)}`);
    e.items.forEach((ei, j) => {
      const g = items[j];
      if (!g) return;
      if (g.product !== ei.product) errors.push(`item ${j + 1}: expected ${ei.product}, got ${g.product}`);
      if (g.qty !== ei.qty) errors.push(`item ${j + 1} qty: expected ${ei.qty}, got ${g.qty}`);
      if (g.rate !== ei.rate) errors.push(`item ${j + 1} rate: expected ${ei.rate}, got ${g.rate}`);
    });
    if (e.payment !== undefined && b.payment !== e.payment) errors.push(`payment: expected ${e.payment}, got ${b.payment}`);
    if (e.amount_paid !== undefined && b.amount_paid !== e.amount_paid) errors.push(`amount_paid: expected ${e.amount_paid}, got ${b.amount_paid}`);
    if (e.discount_amount !== undefined && b.discount_amount !== e.discount_amount) errors.push(`discount: expected ${e.discount_amount}, got ${b.discount_amount}`);
    if (e.discount_percent !== undefined && b.discount_percent !== e.discount_percent) errors.push(`discount %: expected ${e.discount_percent}, got ${b.discount_percent}`);
    if (e.rate_includes_gst !== undefined && b.rate_includes_gst !== e.rate_includes_gst) errors.push(`gst included: expected ${e.rate_includes_gst}, got ${b.rate_includes_gst}`);
    if (e.date === "yesterday") {
      const y = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      if (b.date !== y) errors.push(`date: expected ${y}, got ${b.date}`);
    }
    for (const u of e.line_updates ?? []) {
      const g = b.line_updates.find((x) => x.line_key === u.line_key);
      if (!g || (u.rate !== undefined && g.rate !== u.rate) || (u.qty !== undefined && g.qty !== u.qty)) {
        errors.push(`line update ${u.line_key}: expected ${JSON.stringify(u)}, got ${JSON.stringify(g ?? null)}`);
      }
    }
  });
  return errors;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Set OPENAI_API_KEY to run the eval");
  const today = new Date().toISOString().slice(0, 10);
  const cases = values.only ? [set.cases[Number(values.only) - 1]!] : set.cases;
  let passed = 0;

  for (const [i, c] of cases.entries()) {
    const started = Date.now();
    try {
      const got = await runBillingAgent({
        key: { apiKey, scope: "platform" },
        supabase: fakeSupabase as never,
        transcript: c.said,
        currentForm: c.form ?? null,
        today,
        businessId: "eval",
        userId: "eval",
        logUsage: false,
      });
      const errors = check(got, c.expect, today);
      const ms = Date.now() - started;
      if (errors.length === 0) passed++;
      console.log(`${errors.length ? "✗" : "✓"} ${i + 1}. ${c.said}  (${ms} ms)`);
      for (const e of errors) console.log(`     ${e}`);
    } catch (e) {
      console.log(`✗ ${i + 1}. ${c.said}\n     error: ${e instanceof Error ? e.message : e}`);
    }
  }
  const pct = Math.round((passed / cases.length) * 100);
  console.log(`\n${passed}/${cases.length} passed (${pct}%). Target from the plan: ≥ 95% on real utterances.`);
  process.exit(pct >= 95 ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
