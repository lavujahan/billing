import "server-only";
import { todayISO } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { BillCustomer, BillDraft, BillingContext } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getBillingContext(supabase: Supabase, businessId: string): Promise<BillingContext> {
  const [{ data: biz }, { data: last }] = await Promise.all([
    supabase.from("businesses").select("state_code, gst_slabs, fy_start_month, invoice_prefix").eq("id", businessId).single(),
    supabase
      .from("invoices")
      .select("invoice_date")
      .eq("status", "confirmed")
      .order("invoice_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    businessStateCode: biz?.state_code ?? null,
    gstSlabs: (biz?.gst_slabs ?? [0, 5, 12, 18, 28]).map(Number),
    fyStartMonth: biz?.fy_start_month ?? 4,
    invoicePrefix: biz?.invoice_prefix ?? "INV",
    lastInvoiceDate: last?.invoice_date ?? null,
    today: todayISO(),
  };
}

type CustomerRow = {
  id: string;
  name: string;
  gstin: string | null;
  state_code: string | null;
  credit_limit: number | null;
  balance: number | null;
};

export function toBillCustomer(c: CustomerRow): BillCustomer {
  return {
    id: c.id,
    name: c.name,
    gstin: c.gstin,
    stateCode: c.state_code,
    balance: Number(c.balance ?? 0),
    creditLimit: c.credit_limit === null ? null : Number(c.credit_limit),
  };
}

export async function getBillCustomer(supabase: Supabase, id: string): Promise<BillCustomer | null> {
  const [{ data: c }, { data: bal }] = await Promise.all([
    supabase.from("customers").select("id, name, gstin, state_code, credit_limit").eq("id", id).maybeSingle(),
    supabase.from("v_customer_balance").select("balance").eq("customer_id", id).maybeSingle(),
  ]);
  return c ? toBillCustomer({ ...c, balance: bal?.balance ?? 0 }) : null;
}

export type DraftSummary = { id: string; title: string | null; amount: number | null; updatedAt: string };

export async function listOpenDrafts(supabase: Supabase, module: string): Promise<DraftSummary[]> {
  const { data } = await supabase
    .from("form_drafts")
    .select("id, title, amount, updated_at")
    .eq("module", module)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((d) => ({ id: d.id, title: d.title, amount: d.amount === null ? null : Number(d.amount), updatedAt: d.updated_at }));
}

export async function loadDraft(supabase: Supabase, id: string) {
  const { data } = await supabase.from("form_drafts").select("id, data, status").eq("id", id).maybeSingle();
  return data && data.status === "open" ? { id: data.id as string, data: data.data as BillDraft } : null;
}

const INVOICE_LIST_COLUMNS =
  "id, invoice_no, invoice_date, total_amount, payment_status, status, created_at, customers!inner(name)";

export type InvoiceListRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  total: number;
  paymentStatus: "paid" | "credit" | "partial";
  status: "confirmed" | "cancelled";
  createdAt: string;
  customerName: string;
};

export async function listInvoices(supabase: Supabase, opts: { date: string; q: string }): Promise<InvoiceListRow[]> {
  let query = supabase.from("invoices").select(INVOICE_LIST_COLUMNS);
  const term = opts.q.replace(/[%_\\]/g, "").trim();
  if (term) {
    // A term with digits is a bill number ("0148", "INV/26-27/0148"); otherwise a customer name.
    query = /\d/.test(term) ? query.ilike("invoice_no", `%${term}%`) : query.ilike("customers.name", `%${term}%`);
    query = query.order("created_at", { ascending: false }).limit(50);
  } else {
    query = query.eq("invoice_date", opts.date).order("created_at", { ascending: false });
  }
  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id,
    invoiceNo: r.invoice_no,
    invoiceDate: r.invoice_date,
    total: Number(r.total_amount),
    paymentStatus: r.payment_status,
    status: r.status,
    createdAt: r.created_at,
    customerName: (r.customers as unknown as { name: string } | null)?.name ?? "",
  }));
}

export async function getInvoice(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("invoices")
    .select("*, customers(id, name, name_ta, gstin, state_code, address, phone, credit_limit), invoice_items(*), created_by_user:users!invoices_created_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const items = [...(data.invoice_items as InvoiceItemRow[])].sort((a, b) => a.line_no - b.line_no);
  return { ...data, invoice_items: items } as InvoiceDetail;
}

export type InvoiceItemRow = {
  id: string;
  line_no: number;
  product_id: string | null;
  item_name: string;
  item_name_ta: string | null;
  hsn_code: string | null;
  qty: number;
  unit: string | null;
  rate: number;
  gst_rate: number;
  taxable_value: number;
  tax_amount: number;
  amount: number;
};

export type InvoiceDetail = {
  id: string;
  business_id: string;
  invoice_no: string;
  invoice_date: string;
  customer_gstin: string | null;
  place_of_supply: string | null;
  rate_includes_gst: boolean;
  taxable_value: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total_amount: number;
  payment_status: "paid" | "credit" | "partial";
  amount_received: number;
  notes: string | null;
  status: "confirmed" | "cancelled";
  cancel_reason: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  customers: {
    id: string;
    name: string;
    name_ta: string | null;
    gstin: string | null;
    state_code: string | null;
    address: string | null;
    phone: string | null;
    credit_limit: number | null;
  };
  invoice_items: InvoiceItemRow[];
  created_by_user: { full_name: string } | null;
};
