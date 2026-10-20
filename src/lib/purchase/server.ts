import "server-only";
import { todayISO } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseContext, PurchaseDraft, PurchaseVendor } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getPurchaseContext(supabase: Supabase, businessId: string): Promise<PurchaseContext> {
  const { data } = await supabase.from("businesses").select("state_code, gst_slabs").eq("id", businessId).single();
  return {
    businessStateCode: data?.state_code ?? null,
    gstSlabs: (data?.gst_slabs ?? [0, 5, 12, 18, 28]).map(Number),
    today: todayISO(),
  };
}

export async function getVendor(supabase: Supabase, id: string): Promise<PurchaseVendor | null> {
  const [{ data: v }, { data: bal }] = await Promise.all([
    supabase.from("vendors").select("id, name, gstin, state_code").eq("id", id).maybeSingle(),
    supabase.from("v_vendor_balance").select("balance").eq("vendor_id", id).maybeSingle(),
  ]);
  return v ? { id: v.id, name: v.name, gstin: v.gstin, stateCode: v.state_code, balance: Number(bal?.balance ?? 0) } : null;
}

export async function vendorAverage(supabase: Supabase, vendorId: string): Promise<number | null> {
  const { data } = await supabase
    .from("purchases")
    .select("total_amount")
    .eq("vendor_id", vendorId)
    .eq("status", "confirmed")
    .order("bill_date", { ascending: false })
    .limit(20);
  if (!data || data.length < 3) return null;
  return data.reduce((s, r) => s + Number(r.total_amount), 0) / data.length;
}

export async function loadPurchaseDraft(supabase: Supabase, id: string) {
  const { data } = await supabase.from("form_drafts").select("id, data, status, module").eq("id", id).maybeSingle();
  return data && data.status === "open" && data.module === "purchase" ? { id: data.id as string, data: data.data as PurchaseDraft } : null;
}

export type PurchaseListRow = {
  id: string;
  vendorName: string;
  billNumber: string | null;
  billDate: string;
  total: number;
  balance: number;
  paymentStatus: "paid" | "credit" | "partial";
  status: "confirmed" | "cancelled";
  hasFile: boolean;
};

export async function listPurchases(
  supabase: Supabase,
  opts: { from: string; to: string; filter: "all" | "unpaid" | "nophoto"; q: string },
): Promise<PurchaseListRow[]> {
  let query = supabase
    .from("purchases")
    .select("id, bill_number, bill_date, total_amount, payment_status, status, file_paths, vendors!inner(name)")
    .gte("bill_date", opts.from)
    .lte("bill_date", opts.to)
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  const term = opts.q.replace(/[%_\\]/g, "").trim();
  if (term) query = /\d/.test(term) ? query.ilike("bill_number", `%${term}%`) : query.ilike("vendors.name", `%${term}%`);
  if (opts.filter === "nophoto") query = query.eq("file_paths", "{}").eq("status", "confirmed");

  const [{ data }, { data: balances }] = await Promise.all([
    query,
    supabase.from("v_purchase_balance").select("purchase_id, balance").gte("bill_date", opts.from).lte("bill_date", opts.to),
  ]);
  const balanceOf = new Map((balances ?? []).map((b) => [b.purchase_id as string, Number(b.balance)]));
  const rows = (data ?? []).map((r) => ({
    id: r.id,
    vendorName: (r.vendors as unknown as { name: string }).name,
    billNumber: r.bill_number,
    billDate: r.bill_date,
    total: Number(r.total_amount),
    balance: balanceOf.get(r.id) ?? 0,
    paymentStatus: r.payment_status,
    status: r.status,
    hasFile: (r.file_paths ?? []).length > 0,
  })) as PurchaseListRow[];
  return opts.filter === "unpaid" ? rows.filter((r) => r.status === "confirmed" && r.balance > 0.005) : rows;
}

export type PurchaseDetail = Awaited<ReturnType<typeof getPurchase>>;

export async function getPurchase(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("purchases")
    .select("*, vendors(id, name, gstin, state_code, phone), purchase_items(*), created_by_user:users!purchases_created_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { data: bal } = await supabase.from("v_purchase_balance").select("balance").eq("purchase_id", id).maybeSingle();
  const items = [...(data.purchase_items as PurchaseItemRow[])].sort((a, b) => a.line_no - b.line_no);
  return { ...(data as PurchaseRow), purchase_items: items, balance: Number(bal?.balance ?? 0) };
}

export type PurchaseItemRow = {
  id: string;
  line_no: number;
  product_id: string | null;
  item_name: string;
  hsn_code: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  gst_rate: number;
  taxable_value: number;
  tax_amount: number;
  total_price: number;
};

type PurchaseRow = {
  id: string;
  vendor_id: string;
  vendor_gstin: string | null;
  bill_number: string | null;
  bill_date: string;
  items_mode: "items" | "total";
  rates_include_gst: boolean;
  extraction: { printedTotal?: number | null } | null;
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total_amount: number;
  payment_status: "paid" | "credit" | "partial";
  amount_paid: number;
  payment_mode: "cash" | "upi" | "bank" | "cheque" | null;
  notes: string | null;
  status: "confirmed" | "cancelled";
  cancel_reason: string | null;
  revision: number;
  source: string;
  file_paths: string[];
  file_hashes: string[];
  updated_at: string;
  created_at: string;
  vendors: { id: string; name: string; gstin: string | null; state_code: string | null; phone: string | null };
  created_by_user: { full_name: string } | null;
};

export async function unpaidBills(supabase: Supabase, vendorId: string) {
  const { data } = await supabase
    .from("v_purchase_balance")
    .select("purchase_id, bill_number, bill_date, total_amount, balance")
    .eq("vendor_id", vendorId)
    .gt("balance", 0.005)
    .order("bill_date");
  return (data ?? []).map((b) => ({
    id: b.purchase_id as string,
    billNumber: b.bill_number as string | null,
    billDate: b.bill_date as string,
    total: Number(b.total_amount),
    balance: Number(b.balance),
  }));
}
