import "server-only";
import type { BillCustomer } from "@/lib/billing/types";
import type { BillVoicePatch, CustomerCandidate, VoicePatchLine } from "@/lib/billing/voice-patch";
import { nameSearchTerms } from "@/lib/voice/parse";
import { confidentPick, mergeByBestScore } from "@/lib/voice/pick";
import type { createClient } from "@/lib/supabase/server";
import type { BillExtraction } from "./agent";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ExtractedBill = BillExtraction["bills"][number];

type CustomerRow = {
  id: string;
  name: string;
  gstin: string | null;
  state_code: string | null;
  credit_limit: number | null;
  balance: number | null;
  score: number;
};
type ProductRow = {
  id: string;
  name: string;
  name_ta: string | null;
  unit: string | null;
  hsn_code: string | null;
  gst_rate: number | null;
  default_rate: number | null;
  score: number;
};

const PRODUCT_MIN = 0.45;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const sanitize = (q: string) => q.replace(/[%_\\]/g, "").trim().slice(0, 60);

function toCandidate(c: CustomerRow): CustomerCandidate {
  return {
    id: c.id,
    name: c.name,
    gstin: c.gstin,
    stateCode: c.state_code,
    balance: Number(c.balance ?? 0),
    creditLimit: c.credit_limit === null ? null : Number(c.credit_limit),
    score: Number(c.score),
  };
}

// Searches with the name as heard and with a Latin form, keeping each customer's best score.
export async function matchCustomer(supabase: Supabase, spoken: string): Promise<CustomerCandidate[]> {
  const lists: CustomerCandidate[][] = [];
  for (const term of nameSearchTerms(spoken)) {
    const { data } = await supabase.rpc("search_customers", { q: sanitize(term), lim: 5 });
    lists.push(((data ?? []) as CustomerRow[]).map(toCandidate));
  }
  return mergeByBestScore(lists);
}

async function matchProduct(supabase: Supabase, spoken: string, preferredId: string | null): Promise<ProductRow | null> {
  if (preferredId && /^[0-9a-f-]{36}$/i.test(preferredId)) {
    const { data } = await supabase
      .from("products")
      .select("id, name, name_ta, unit, hsn_code, gst_rate, default_rate")
      .eq("id", preferredId)
      .eq("active", true)
      .maybeSingle();
    if (data) return { ...data, score: 1 };
  }
  let best: ProductRow | null = null;
  for (const term of nameSearchTerms(spoken)) {
    const { data } = await supabase.rpc("search_products", { q: sanitize(term), lim: 3 });
    const top = ((data ?? []) as ProductRow[])[0];
    if (top && Number(top.score) > (best?.score ?? 0)) best = { ...top, score: Number(top.score) };
  }
  return best && best.score >= PRODUCT_MIN ? best : null;
}

async function priceFor(supabase: Supabase, customerId: string | null, product: ProductRow) {
  const last = customerId
    ? await supabase.rpc("customer_last_rate", { p_customer: customerId, p_product: product.id })
    : { data: null };
  const lastRate = last.data === null ? null : Number(last.data);
  return { rate: lastRate ?? (product.default_rate === null ? null : Number(product.default_rate)), usualRate: lastRate };
}

export async function toVoicePatch(
  supabase: Supabase,
  bill: ExtractedBill,
  formCustomer: BillCustomer | null,
): Promise<BillVoicePatch> {
  let customer: BillVoicePatch["customer"] = null;
  if (bill.customer_name?.trim()) {
    const spokenName = bill.customer_name.trim();
    const isCash = /^(cash|ரொக்கம்|walk[- ]?in)$/i.test(spokenName);
    const candidates = isCash ? [] : await matchCustomer(supabase, spokenName);
    const pick = isCash
      ? { id: null, name: "Cash", gstin: null, stateCode: null, balance: 0, creditLimit: null }
      : confidentPick(candidates);
    customer = { pick, candidates, spokenName, confidence: clamp(Math.min(bill.customer_confidence, pick && "score" in pick ? pick.score + 0.2 : 1)) };
  }

  const customerId = customer?.pick?.id ?? formCustomer?.id ?? null;
  const lines: VoicePatchLine[] = [];
  const unmatched: BillVoicePatch["unmatched"] = [];
  for (const item of bill.items) {
    const product = await matchProduct(supabase, item.spoken_name, item.product_id);
    if (!product) {
      unmatched.push({ spoken: item.spoken_name, qty: item.qty, rate: item.rate });
      continue;
    }
    const price = await priceFor(supabase, customerId, product);
    lines.push({
      productId: product.id,
      name: product.name,
      nameTa: product.name_ta,
      unit: product.unit,
      hsn: product.hsn_code,
      gstRate: Number(product.gst_rate ?? 0),
      qty: item.qty,
      rate: item.rate ?? price.rate,
      usualRate: price.usualRate,
      confidence: clamp(Math.min(item.confidence, product.score + 0.3, item.qty === null ? 0.6 : 1)),
    });
  }

  const discount =
    bill.discount_percent !== null
      ? { mode: "percent" as const, value: bill.discount_percent }
      : bill.discount_amount !== null
        ? { mode: "amount" as const, value: bill.discount_amount }
        : null;

  return {
    customer,
    lines,
    lineUpdates: bill.line_updates.map((u) => ({ key: u.line_key, qty: u.qty, rate: u.rate })),
    unmatched,
    payment: bill.payment,
    amountReceived: bill.amount_paid,
    discount,
    rateIncludesGst: bill.rate_includes_gst,
    invoiceDate: bill.date && /^\d{4}-\d{2}-\d{2}$/.test(bill.date) ? bill.date : null,
    notes: bill.notes,
  };
}
