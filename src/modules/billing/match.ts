import "server-only";
import type { BillCustomer } from "@/lib/billing/types";
import type { BillVoicePatch, CustomerCandidate, VoicePatchLine } from "@/lib/billing/voice-patch";
import { nameSearchTerms } from "@/lib/voice/parse";
import { confidentPick, mergeByBestScore } from "@/lib/voice/pick";
import type { createClient } from "@/lib/supabase/server";
import type { BillExtraction } from "./agent";
import type { MasterLists } from "./prompt";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ExtractedBill = BillExtraction["bills"][number];

type ProductRow = {
  id: string;
  name: string;
  name_ta: string | null;
  aliases: string[] | null;
  unit: string | null;
  hsn_code: string | null;
  gst_rate: number | null;
  default_rate: number | null;
};
type CustomerRow = { id: string; name: string; name_ta: string | null; gstin: string | null; state_code: string | null; credit_limit: number | null };

export type Masters = {
  lists: MasterLists;
  productByRef: Map<string, ProductRow>;
  customerByRef: Map<string, BillCustomer>;
};

const MAX_ITEMS = 400;
const MAX_CUSTOMERS = 300;
const PRODUCT_MIN = 0.45;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const sanitize = (q: string) => q.replace(/[%_\\]/g, "").trim().slice(0, 60);

// The shop's item and customer lists, loaded once per request: they go into the agent's
// instructions and back the ref lookups afterwards, so matching needs no extra queries.
export async function loadMasters(supabase: Supabase): Promise<Masters> {
  const [{ data: products }, { data: customers }, { data: balances }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, name_ta, aliases, unit, hsn_code, gst_rate, default_rate")
      .eq("active", true)
      .order("name")
      .limit(MAX_ITEMS),
    supabase
      .from("customers")
      .select("id, name, name_ta, gstin, state_code, credit_limit")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(MAX_CUSTOMERS),
    supabase.from("v_customer_balance").select("customer_id, balance"),
  ]);
  const balanceOf = new Map((balances ?? []).map((b) => [b.customer_id as string, Number(b.balance)]));

  const productByRef = new Map<string, ProductRow>();
  const customerByRef = new Map<string, BillCustomer>();
  const lists: MasterLists = { items: [], customers: [] };

  ((products ?? []) as ProductRow[]).forEach((p, i) => {
    const ref = `i${i + 1}`;
    productByRef.set(ref, p);
    lists.items.push({ ref, id: p.id, name: p.name, nameTa: p.name_ta, aliases: p.aliases ?? [], unit: p.unit });
  });
  ((customers ?? []) as CustomerRow[]).forEach((c, i) => {
    const ref = `c${i + 1}`;
    customerByRef.set(ref, {
      id: c.id,
      name: c.name,
      gstin: c.gstin,
      stateCode: c.state_code,
      balance: balanceOf.get(c.id) ?? 0,
      creditLimit: c.credit_limit === null ? null : Number(c.credit_limit),
    });
    lists.customers.push({ ref, id: c.id, name: c.name, nameTa: c.name_ta });
  });
  return { lists, productByRef, customerByRef };
}

async function searchCustomers(supabase: Supabase, spoken: string): Promise<CustomerCandidate[]> {
  const lists = await Promise.all(
    nameSearchTerms(spoken).map(async (term) => {
      const { data } = await supabase.rpc("search_customers", { q: sanitize(term), lim: 5 });
      return ((data ?? []) as Array<CustomerRow & { balance: number | null; score: number }>).map((c) => ({
        id: c.id,
        name: c.name,
        gstin: c.gstin,
        stateCode: c.state_code,
        balance: Number(c.balance ?? 0),
        creditLimit: c.credit_limit === null ? null : Number(c.credit_limit),
        score: Number(c.score),
      }));
    }),
  );
  return mergeByBestScore(lists);
}

async function searchProduct(supabase: Supabase, spoken: string): Promise<(ProductRow & { score: number }) | null> {
  const hits = await Promise.all(
    nameSearchTerms(spoken).map(async (term) => {
      const { data } = await supabase.rpc("search_products", { q: sanitize(term), lim: 1 });
      const top = ((data ?? []) as Array<ProductRow & { score: number }>)[0];
      return top ? { ...top, score: Number(top.score) } : null;
    }),
  );
  const best = hits.filter(Boolean).sort((a, b) => b!.score - a!.score)[0] ?? null;
  return best && best.score >= PRODUCT_MIN ? best : null;
}

async function lastRate(supabase: Supabase, customerId: string | null, productId: string): Promise<number | null> {
  if (!customerId) return null;
  const { data } = await supabase.rpc("customer_last_rate", { p_customer: customerId, p_product: productId });
  return data === null ? null : Number(data);
}

export async function toVoicePatch(
  supabase: Supabase,
  masters: Masters,
  bill: ExtractedBill,
  formCustomer: BillCustomer | null,
): Promise<BillVoicePatch> {
  let customer: BillVoicePatch["customer"] = null;
  const spokenName = bill.customer_name?.trim() ?? "";
  if (spokenName) {
    const byRef = bill.customer_ref ? masters.customerByRef.get(bill.customer_ref) : undefined;
    if (/^(cash|ரொக்கம்|walk[- ]?in)$/i.test(spokenName)) {
      customer = { pick: { id: null, name: "Cash", gstin: null, stateCode: null, balance: 0, creditLimit: null }, candidates: [], spokenName, confidence: 1 };
    } else if (byRef && bill.customer_confidence >= 0.8) {
      customer = { pick: byRef, candidates: [{ ...byRef, score: 1 }], spokenName, confidence: bill.customer_confidence };
    } else {
      const candidates = await searchCustomers(supabase, spokenName);
      if (byRef && !candidates.some((c) => c.id === byRef.id)) candidates.unshift({ ...byRef, score: bill.customer_confidence });
      customer = { pick: confidentPick(candidates), candidates, spokenName, confidence: clamp(bill.customer_confidence) };
    }
  }

  const customerId = customer?.pick?.id ?? formCustomer?.id ?? null;
  const resolved = await Promise.all(
    bill.items.map(async (item) => {
      const fromRef = item.item_ref ? masters.productByRef.get(item.item_ref) : undefined;
      const product = fromRef ? { ...fromRef, score: 1 } : await searchProduct(supabase, item.spoken_name);
      if (!product) return { item, product: null, usual: null };
      return { item, product, usual: await lastRate(supabase, customerId, product.id) };
    }),
  );

  const lines: VoicePatchLine[] = [];
  const unmatched: BillVoicePatch["unmatched"] = [];
  for (const { item, product, usual } of resolved) {
    if (!product) {
      unmatched.push({ spoken: item.spoken_name, qty: item.qty, rate: item.rate });
      continue;
    }
    const masterRate = product.default_rate === null ? null : Number(product.default_rate);
    lines.push({
      productId: product.id,
      name: product.name,
      nameTa: product.name_ta,
      unit: product.unit,
      hsn: product.hsn_code,
      gstRate: Number(product.gst_rate ?? 0),
      qty: item.qty,
      rate: item.rate ?? usual ?? masterRate,
      usualRate: usual,
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
