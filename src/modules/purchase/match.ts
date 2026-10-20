import "server-only";
import { isValidGstin, normalizeGstin } from "@/lib/billing/gst";
import type { PurchasePatch, VendorCandidate } from "@/lib/purchase/patch";
import type { PurchaseLine } from "@/lib/purchase/types";
import { nameSearchTerms } from "@/lib/voice/parse";
import { mergeByBestScore } from "@/lib/voice/pick";
import type { createClient } from "@/lib/supabase/server";
import type { PurchaseExtraction } from "./agent";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type VendorRow = { id: string; name: string; gstin: string | null; state_code: string | null; balance: number | null; score: number };

const VENDOR_AUTO = 0.9;
const PRODUCT_MIN = 0.5;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const sanitize = (q: string) => q.replace(/[%_\\]/g, "").trim().slice(0, 60);

const toCandidate = (v: VendorRow): VendorCandidate => ({
  id: v.id,
  name: v.name,
  gstin: v.gstin,
  stateCode: v.state_code,
  balance: Number(v.balance ?? 0),
  score: Number(v.score),
});

export async function searchVendors(supabase: Supabase, text: string): Promise<VendorCandidate[]> {
  const lists = await Promise.all(
    nameSearchTerms(text).map(async (term) => {
      const { data } = await supabase.rpc("search_vendors", { q: sanitize(term), lim: 5 });
      return ((data ?? []) as VendorRow[]).map(toCandidate);
    }),
  );
  return mergeByBestScore(lists);
}

// GSTIN match wins; then a name match ≥ 0.9 links automatically; 0.7–0.9 asks the user.
async function matchVendor(supabase: Supabase, name: string | null, gstinRaw: string | null): Promise<PurchasePatch["vendor"]> {
  const gstin = gstinRaw ? normalizeGstin(gstinRaw) : null;
  if (!name && !gstin) return null;
  if (gstin && isValidGstin(gstin)) {
    const { data } = await supabase.rpc("search_vendors", { q: gstin, lim: 1 });
    const hit = ((data ?? []) as VendorRow[]).find((v) => v.gstin === gstin);
    if (hit) return { pick: toCandidate(hit), candidates: [toCandidate({ ...hit, score: 1 })], readName: name ?? hit.name, gstin };
  }
  const candidates = name ? await searchVendors(supabase, name) : [];
  const [top, second] = candidates;
  const pick = top && top.score >= VENDOR_AUTO && (!second || top.score - second.score >= 0.1) ? top : null;
  return { pick, candidates, readName: name ?? "", gstin };
}

async function matchProduct(supabase: Supabase, name: string): Promise<string | null> {
  const { data } = await supabase.rpc("search_products", { q: sanitize(name), lim: 1 });
  const top = ((data ?? []) as Array<{ id: string; score: number }>)[0];
  return top && Number(top.score) >= PRODUCT_MIN ? top.id : null;
}

export async function toPurchasePatch(supabase: Supabase, x: PurchaseExtraction): Promise<PurchasePatch> {
  const [vendor, productIds] = await Promise.all([
    matchVendor(supabase, x.vendor_name, x.vendor_gstin),
    Promise.all(x.items.map((i) => (i.name.trim() ? matchProduct(supabase, i.name) : Promise.resolve(null)))),
  ]);

  const lines: PurchaseLine[] = x.items.map((i, n) => {
    const qty = i.qty ?? (i.amount !== null && i.rate ? Math.round((i.amount / i.rate) * 1000) / 1000 : null);
    const rate = i.rate ?? (i.amount !== null && i.qty ? Math.round((i.amount / i.qty) * 100) / 100 : null);
    return {
      key: crypto.randomUUID(),
      productId: productIds[n] ?? null,
      name: i.name.trim(),
      hsn: i.hsn,
      qty: qty === null ? (i.amount !== null ? "1" : "") : String(qty),
      unit: i.unit,
      rate: rate === null ? (i.amount !== null ? String(i.amount) : "") : String(rate),
      gstRate: i.gst_rate === null ? "" : String(i.gst_rate),
      printedAmount: i.amount,
      confidence: clamp(Math.min(i.confidence, qty === null || rate === null ? 0.6 : 1)),
    };
  });

  const date = x.bill_date && /^\d{4}-\d{2}-\d{2}$/.test(x.bill_date) ? x.bill_date : null;
  return {
    documentKind: x.is_bill ? x.document_kind : "not_a_bill",
    billCount: Math.max(1, Math.round(x.bill_count)),
    vendor,
    billNumber: x.bill_number?.trim() || null,
    billDate: date,
    lines,
    ratesIncludeGst: x.rates_include_gst,
    discount: x.discount,
    totals: { taxable: x.subtotal, cgst: x.cgst, sgst: x.sgst, igst: x.igst, roundOff: x.round_off, total: x.total_amount },
    payment: x.payment_status,
    amountPaid: x.amount_paid,
    paymentMode: x.payment_mode,
    confidence: {
      vendor: clamp(x.confidence.vendor),
      billNumber: clamp(x.confidence.bill_number),
      billDate: clamp(x.confidence.bill_date),
      total: clamp(x.confidence.total),
    },
    handwritten: x.handwritten,
  };
}
