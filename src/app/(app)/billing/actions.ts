"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import { normalizeGstin } from "@/lib/billing/gst";
import { getBillCustomer, getBillingContext } from "@/lib/billing/server";
import { amountReceived, computeTotals } from "@/lib/billing/totals";
import type { BillDraft, BillLine } from "@/lib/billing/types";
import { validateBill, type Issue } from "@/lib/billing/validate";
import { parseAmount, parseQty } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

const Draft = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customer: z
    .object({
      id: uuid.nullable(),
      name: z.string().max(120),
      gstin: z.string().max(20).nullable(),
      stateCode: z.string().max(2).nullable(),
      balance: z.number(),
      creditLimit: z.number().nullable(),
    })
    .nullable(),
  lines: z
    .array(
      z.object({
        key: z.string().max(40),
        productId: uuid,
        name: z.string(),
        nameTa: z.string().nullable(),
        unit: z.string().nullable(),
        hsn: z.string().nullable(),
        gstRate: z.number(),
        qty: z.string().max(20),
        rate: z.string().max(20),
        usualRate: z.number().nullable(),
      }),
    )
    .max(200),
  rateIncludesGst: z.boolean(),
  discountMode: z.enum(["amount", "percent"]),
  discount: z.string().max(20),
  payment: z.enum(["credit", "paid", "partial"]),
  amountReceived: z.string().max(20),
  notes: z.string().max(1000),
});

// ── Drafts ────────────────────────────────────────────────────────────────────

export async function saveDraftAction(input: { id: string | null; draft: BillDraft; title: string; amount: number }) {
  const user = await getCurrentUser();
  const parsed = Draft.safeParse(input.draft);
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const row = {
    data: parsed.data,
    title: input.title.slice(0, 120) || null,
    amount: Number.isFinite(input.amount) ? input.amount : null,
    updated_at: new Date().toISOString(),
  };

  if (input.id && uuid.safeParse(input.id).success) {
    const { data } = await supabase
      .from("form_drafts")
      .update(row)
      .eq("id", input.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (data) return { ok: true as const, id: data.id as string };
  }
  const { data, error } = await supabase
    .from("form_drafts")
    .insert({ ...row, module: "billing", business_id: user.businessId, created_by: user.id })
    .select("id")
    .single();
  if (error) return { ok: false as const };
  return { ok: true as const, id: data.id as string };
}

export async function discardDraftAction(id: string) {
  await getCurrentUser();
  if (!uuid.safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("form_drafts").update({ status: "discarded" }).eq("id", id);
  revalidatePath("/billing");
}

// ── Save ──────────────────────────────────────────────────────────────────────

export type SaveBillResult =
  | { ok: true; id: string; invoiceNo: string; customerId: string; total: number }
  | { ok: false; errors: Issue[] };

const RPC_ERRORS: Record<string, string> = {
  stale: "This bill was changed just now on another device. Reload it and try again.",
  invoice_cancelled: "This bill is cancelled and can't be edited.",
  financial_year_change: "A bill can't be moved into a different financial year.",
  customer_not_found: "That customer no longer exists.",
};

export async function saveBillAction(input: {
  draftId: string | null;
  invoiceId?: string;
  expectedUpdatedAt?: string;
  draft: BillDraft;
}): Promise<SaveBillResult> {
  const user = await getCurrentUser();
  const fail = (message: string): SaveBillResult => ({ ok: false, errors: [{ field: "form", message }] });

  if (input.invoiceId && !isAdminRole(user.role)) return fail("Only the owner or an admin can edit a saved bill.");
  const parsed = Draft.safeParse(input.draft);
  if (!parsed.success) return fail("The form has invalid values.");

  const supabase = await createClient();
  const ctx = await getBillingContext(supabase, user.businessId);
  const draft = await withMasterValues(supabase, parsed.data);
  if (typeof draft === "string") return fail(draft);

  const totals = computeTotals(draft, ctx.businessStateCode);
  const { blocking } = validateBill(draft, totals, { ...ctx, lastInvoiceDate: null });
  if (blocking.length) return { ok: false, errors: blocking };

  const customer = draft.customer!;
  const payload = {
    customer: { id: customer.id, name: customer.name.trim(), gstin: customer.gstin, state_code: customer.stateCode },
    customer_gstin: customer.gstin,
    place_of_supply: totals.placeOfSupply,
    invoice_date: draft.invoiceDate,
    rate_includes_gst: draft.rateIncludesGst,
    taxable_value: totals.taxable,
    discount: totals.discount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    round_off: totals.roundOff,
    total_amount: totals.total,
    payment_status: draft.payment,
    amount_received: amountReceived(draft, totals.total),
    notes: draft.notes.trim(),
    source: "web",
    entry_mode: "type",
    lines: draft.lines.map((l, i) => {
      const t = totals.lines[i]!;
      return {
        product_id: l.productId,
        item_name: l.name,
        item_name_ta: l.nameTa,
        hsn_code: l.hsn,
        qty: t.qty,
        unit: l.unit,
        rate: t.rate,
        gst_rate: l.gstRate,
        taxable_value: t.taxable,
        tax_amount: t.tax,
        amount: t.amount,
      };
    }),
  };

  const service = createAdminClient();
  const { data, error } = input.invoiceId
    ? await service.rpc("update_invoice", {
        p_business: user.businessId,
        p_user: user.id,
        p_id: input.invoiceId,
        p_expected: input.expectedUpdatedAt,
        p: payload,
      })
    : await service.rpc("create_invoice", { p_business: user.businessId, p_user: user.id, p: payload });

  if (error) {
    const known = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k));
    if (!known) console.error("save bill failed", error);
    return fail(known ? RPC_ERRORS[known]! : "Couldn't save the bill. Please try again.");
  }

  const saved = data as { id: string; invoice_no: string; customer_id: string };
  if (input.draftId && uuid.safeParse(input.draftId).success) {
    await supabase.from("form_drafts").update({ status: "saved", record_id: saved.id }).eq("id", input.draftId);
  }
  revalidatePath("/billing");
  revalidatePath("/");
  return { ok: true, id: saved.id, invoiceNo: saved.invoice_no, customerId: saved.customer_id, total: totals.total };
}

// Item name, unit, HSN and GST rate always come from the item master, never from the browser.
async function withMasterValues(supabase: Awaited<ReturnType<typeof createClient>>, draft: BillDraft): Promise<BillDraft | string> {
  const ids = [...new Set(draft.lines.map((l) => l.productId))];
  const { data: products } = ids.length
    ? await supabase.from("products").select("id, name, name_ta, unit, hsn_code, gst_rate").in("id", ids)
    : { data: [] };
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  const lines: BillLine[] = [];
  for (const l of draft.lines) {
    const p = byId.get(l.productId);
    if (!p) return `Item "${l.name}" is not in the item list.`;
    if (parseQty(l.qty) === null || parseAmount(l.rate) === null) return `Check qty and rate for ${p.name}.`;
    lines.push({ ...l, name: p.name, nameTa: p.name_ta, unit: p.unit, hsn: p.hsn_code, gstRate: Number(p.gst_rate ?? 0) });
  }

  let customer = draft.customer;
  if (customer?.id) {
    const fresh = await getBillCustomer(supabase, customer.id);
    if (!fresh) return "That customer no longer exists.";
    customer = fresh;
  } else if (customer) {
    const gstin = customer.gstin ? normalizeGstin(customer.gstin) : null;
    customer = { ...customer, gstin: gstin || null, stateCode: gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null };
  }
  return { ...draft, lines, customer };
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelBillAction(invoiceId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!isAdminRole(user.role)) return { ok: false, error: "Only the owner or an admin can cancel a bill." };
  if (!uuid.safeParse(invoiceId).success) return { ok: false, error: "Bill not found." };
  const { error } = await createAdminClient().rpc("cancel_invoice", {
    p_business: user.businessId,
    p_user: user.id,
    p_id: invoiceId,
    p_reason: reason.slice(0, 300),
  });
  if (error) return { ok: false, error: "Couldn't cancel the bill." };
  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  return { ok: true };
}
