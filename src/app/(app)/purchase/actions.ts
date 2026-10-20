"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import { isValidGstin, normalizeGstin, STATES } from "@/lib/billing/gst";
import type { Issue } from "@/lib/billing/validate";
import { formatDate, formatINR, parseAmount, parseQty } from "@/lib/money";
import { findDuplicateByHash, ownsPath } from "@/lib/purchase/files";
import { getPurchaseContext, getVendor } from "@/lib/purchase/server";
import { amountPaidNow, computePurchaseTotals } from "@/lib/purchase/totals";
import type { PurchaseDraft } from "@/lib/purchase/types";
import { validatePurchase } from "@/lib/purchase/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { tamilToLatin } from "@/lib/voice/translit";

const uuid = z.string().uuid();
const str = (max: number) => z.string().max(max);

const Draft = z.object({
  vendor: z.object({ id: uuid.nullable(), name: str(120), gstin: str(20).nullable(), stateCode: str(2).nullable(), balance: z.number() }).nullable(),
  billGstin: str(20).nullable(),
  billNumber: str(40),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  itemsMode: z.enum(["items", "total"]),
  lines: z
    .array(
      z.object({
        key: str(40),
        productId: uuid.nullable(),
        name: str(200),
        hsn: str(10).nullable(),
        qty: str(20),
        unit: str(20).nullable(),
        rate: str(20),
        gstRate: str(6),
        printedAmount: z.number().nullable(),
        confidence: z.number().nullable().optional(),
      }),
    )
    .max(300),
  ratesIncludeGst: z.boolean(),
  discount: str(20),
  manual: z.object({ taxable: str(20), cgst: str(20), sgst: str(20), igst: str(20), roundOff: str(20), total: str(20) }),
  printedTotal: z.number().nullable(),
  payment: z.enum(["credit", "paid", "partial"]),
  amountPaid: str(20),
  paymentMode: z.enum(["cash", "upi", "bank", "cheque"]).nullable(),
  notes: str(1000),
  pages: z.array(z.object({ path: str(200), hash: str(64), mime: str(40), name: str(120) })).max(10),
  source: z.enum(["text", "voice", "image", "pdf"]),
  fieldConfidence: z.record(z.string(), z.number()),
  handwritten: z.boolean(),
});

// ── Drafts ────────────────────────────────────────────────────────────────────

export async function savePurchaseDraftAction(input: { id: string | null; draft: PurchaseDraft; title: string; amount: number }) {
  const user = await getCurrentUser();
  const parsed = Draft.safeParse(input.draft);
  if (!parsed.success) return { ok: false as const };
  const supabase = await createClient();
  const row = { data: parsed.data, title: input.title.slice(0, 120) || null, amount: Number.isFinite(input.amount) ? input.amount : null, updated_at: new Date().toISOString() };
  if (input.id && uuid.safeParse(input.id).success) {
    const { data } = await supabase.from("form_drafts").update(row).eq("id", input.id).eq("status", "open").select("id").maybeSingle();
    if (data) return { ok: true as const, id: data.id as string };
  }
  const { data, error } = await supabase
    .from("form_drafts")
    .insert({ ...row, module: "purchase", business_id: user.businessId, created_by: user.id })
    .select("id")
    .single();
  return error ? { ok: false as const } : { ok: true as const, id: data.id as string };
}

export async function discardPurchaseDraftAction(id: string) {
  await getCurrentUser();
  if (!uuid.safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("form_drafts").update({ status: "discarded" }).eq("id", id);
  revalidatePath("/purchase");
}

// ── Save ──────────────────────────────────────────────────────────────────────

export type Duplicate = { id: string; label: string };
export type SavePurchaseResult =
  | { ok: true; id: string; total: number }
  | { ok: false; errors: Issue[]; duplicate?: Duplicate };

const RPC_ERRORS: Record<string, string> = {
  stale: "This purchase was changed just now on another device. Reload it and try again.",
  purchase_cancelled: "This purchase is cancelled and can't be edited.",
  vendor_not_found: "That vendor no longer exists.",
};

export async function savePurchaseAction(input: {
  draftId: string | null;
  purchaseId?: string;
  expectedUpdatedAt?: string;
  draft: PurchaseDraft;
  allowDuplicate?: boolean;
}): Promise<SavePurchaseResult> {
  const user = await getCurrentUser();
  const fail = (message: string): SavePurchaseResult => ({ ok: false, errors: [{ field: "form", message }] });
  if (input.purchaseId && !isAdminRole(user.role)) return fail("Only the owner or an admin can edit a saved purchase.");

  const parsed = Draft.safeParse(input.draft);
  if (!parsed.success) return fail("The form has invalid values.");
  const draft = parsed.data as PurchaseDraft;
  if (draft.pages.some((p) => !ownsPath(user.businessId, p.path))) return fail("A bill page couldn't be found.");

  const supabase = await createClient();
  const vendor = draft.vendor?.id ? await getVendor(supabase, draft.vendor.id) : null;
  if (!vendor) return fail("Choose a vendor from the vendor list.");
  const checked: PurchaseDraft = { ...draft, vendor, billGstin: draft.billGstin ? normalizeGstin(draft.billGstin) : null };

  const ctx = await getPurchaseContext(supabase, user.businessId);
  const totals = computePurchaseTotals(checked, ctx.businessStateCode);
  const { blocking } = validatePurchase(checked, totals, ctx);
  if (blocking.length) return { ok: false, errors: blocking };

  if (!input.allowDuplicate) {
    const duplicate = await findDuplicate(supabase, vendor.id!, checked.billNumber, checked.pages.map((p) => p.hash), input.purchaseId);
    if (duplicate) return { ok: false, errors: [{ field: "duplicate", message: `This bill may already be saved: ${duplicate.label}` }], duplicate };
  }

  const lines =
    checked.itemsMode === "items"
      ? checked.lines.map((l, i) => {
          const t = totals.lines[i]!;
          return {
            product_id: l.productId,
            item_name: l.name.trim(),
            hsn_code: l.hsn,
            quantity: parseQty(l.qty),
            unit: l.unit,
            unit_price: parseAmount(l.rate),
            gst_rate: Number(l.gstRate) || 0,
            taxable_value: t.taxable,
            tax_amount: t.tax,
            total_price: t.amount,
          };
        })
      : [];

  const payload = {
    vendor_id: vendor.id,
    vendor_gstin: vendor.gstin ?? checked.billGstin,
    bill_number: checked.billNumber.trim(),
    bill_date: checked.billDate,
    items_mode: checked.itemsMode,
    rates_include_gst: checked.itemsMode === "items" && checked.ratesIncludeGst,
    subtotal: totals.subtotal,
    discount: totals.discount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    round_off: totals.roundOff,
    total_amount: totals.total,
    payment_status: checked.payment,
    amount_paid: amountPaidNow(checked, totals.total),
    payment_mode: checked.payment === "credit" ? null : (checked.paymentMode ?? "cash"),
    notes: checked.notes.trim(),
    source: checked.source,
    file_paths: checked.pages.map((p) => p.path),
    file_hashes: checked.pages.map((p) => p.hash),
    extraction: { printedTotal: checked.printedTotal, fieldConfidence: checked.fieldConfidence, handwritten: checked.handwritten },
    lines,
  };

  const service = createAdminClient();
  const { data, error } = input.purchaseId
    ? await service.rpc("update_purchase", {
        p_business: user.businessId,
        p_user: user.id,
        p_id: input.purchaseId,
        p_expected: input.expectedUpdatedAt,
        p: payload,
      })
    : await service.rpc("create_purchase", { p_business: user.businessId, p_user: user.id, p: payload });
  if (error) {
    const known = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k));
    if (!known) console.error("save purchase failed", error);
    return fail(known ? RPC_ERRORS[known]! : "Couldn't save the purchase. Please try again.");
  }

  const saved = data as { id: string };
  if (input.draftId && uuid.safeParse(input.draftId).success) {
    await supabase.from("form_drafts").update({ status: "saved", record_id: saved.id }).eq("id", input.draftId);
  }
  revalidatePath("/purchase");
  revalidatePath("/");
  return { ok: true, id: saved.id, total: totals.total };
}

async function findDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendorId: string,
  billNumber: string,
  hashes: string[],
  excludeId?: string,
): Promise<Duplicate | null> {
  const byFile = await findDuplicateByHash(supabase, hashes, excludeId);
  if (byFile) return { id: byFile.id, label: `same file as ${byFile.vendorName} ${byFile.billNumber ?? ""} (${formatDate(byFile.billDate)}, ${formatINR(byFile.total)})` };
  const no = billNumber.trim();
  if (!no) return null;
  let q = supabase
    .from("purchases")
    .select("id, bill_number, bill_date, total_amount")
    .eq("vendor_id", vendorId)
    .eq("status", "confirmed")
    .ilike("bill_number", no.replace(/[%_\\]/g, ""))
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.maybeSingle();
  return data ? { id: data.id, label: `bill ${data.bill_number} from this vendor (${formatDate(data.bill_date)}, ${formatINR(Number(data.total_amount))})` } : null;
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelPurchaseAction(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!isAdminRole(user.role)) return { ok: false, error: "Only the owner or an admin can cancel a purchase." };
  if (!uuid.safeParse(id).success) return { ok: false, error: "Purchase not found." };
  const { error } = await createAdminClient().rpc("cancel_purchase", { p_business: user.businessId, p_user: user.id, p_id: id, p_reason: reason.slice(0, 300) });
  if (error) return { ok: false, error: "Couldn't cancel the purchase." };
  revalidatePath("/purchase");
  revalidatePath(`/purchase/${id}`);
  return { ok: true };
}

// ── Vendors from the form ─────────────────────────────────────────────────────

const NewVendor = z.object({
  name: z.string().trim().min(1, "Enter the vendor name").max(120),
  gstin: z
    .string()
    .max(20)
    .nullable()
    .transform((s) => (s?.trim() ? normalizeGstin(s) : null))
    .refine((g) => g === null || isValidGstin(g), "GSTIN doesn't look right — check the 15 characters"),
  phone: z.string().max(20).nullable(),
});

// Owners and admins add the vendor on the spot; staff send a request to the admin.
export async function addVendorFromFormAction(input: { name: string; gstin: string | null; phone: string | null; draftId: string | null }) {
  const user = await getCurrentUser();
  const parsed = NewVendor.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]!.message };
  const supabase = await createClient();

  if (!isAdminRole(user.role)) {
    const { error } = await supabase.from("master_requests").insert({
      business_id: user.businessId,
      created_by: user.id,
      kind: "vendor",
      requested_name: parsed.data.name,
      details: { gstin: parsed.data.gstin, phone: parsed.data.phone },
      draft_id: input.draftId && uuid.safeParse(input.draftId).success ? input.draftId : null,
    });
    revalidatePath("/admin/requests");
    return error ? { ok: false as const, message: "Couldn't send the request." } : { ok: true as const, requested: true as const };
  }

  if (parsed.data.gstin) {
    const { data: existing } = await supabase.from("vendors").select("id, name, gstin, state_code").eq("gstin", parsed.data.gstin).eq("active", true).maybeSingle();
    if (existing) return { ok: true as const, vendor: { id: existing.id, name: existing.name, gstin: existing.gstin, stateCode: existing.state_code, balance: 0 } };
  }
  const stateCode = parsed.data.gstin && parsed.data.gstin.slice(0, 2) in STATES ? parsed.data.gstin.slice(0, 2) : null;
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      business_id: user.businessId,
      created_by: user.id,
      name: parsed.data.name,
      gstin: parsed.data.gstin,
      phone: parsed.data.phone?.trim() || null,
      state_code: stateCode,
      name_latin: tamilToLatin(parsed.data.name),
    })
    .select("id, name, gstin, state_code")
    .single();
  if (error) return { ok: false as const, message: "Couldn't add the vendor." };
  revalidatePath("/admin/parties");
  return { ok: true as const, vendor: { id: data.id, name: data.name, gstin: data.gstin, stateCode: data.state_code, balance: 0 } };
}

// ── Pay vendor ────────────────────────────────────────────────────────────────

const Payment = z.object({
  vendorId: uuid,
  amount: z.number().positive(),
  mode: z.enum(["cash", "upi", "bank", "cheque"]),
  reference: z.string().max(60),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500),
  allocations: z.array(z.object({ purchaseId: uuid.nullable(), amount: z.number().positive() })).max(200),
});

export async function payVendorAction(input: z.input<typeof Payment>): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  const parsed = Payment.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the amount and the bills." };
  const p = parsed.data;
  if (p.paymentDate > new Date().toISOString().slice(0, 10)) return { ok: false, message: "Payment date can't be in the future." };
  const allocated = p.allocations.reduce((s, a) => s + Math.round(a.amount * 100), 0);
  if (allocated !== Math.round(p.amount * 100)) return { ok: false, message: "The amounts applied to bills must add up to the payment." };

  const { data, error } = await createAdminClient().rpc("create_vendor_payment", {
    p_business: user.businessId,
    p_user: user.id,
    p: {
      vendor_id: p.vendorId,
      amount: p.amount,
      mode: p.mode,
      reference: p.reference,
      payment_date: p.paymentDate,
      notes: p.notes,
      allocations: p.allocations.map((a) => ({ purchase_id: a.purchaseId, amount: a.amount })),
    },
  });
  if (error) {
    if (!error.message.includes("allocation")) console.error("vendor payment failed", error);
    return { ok: false, message: error.message.includes("allocation") ? "A bill's applied amount is more than what's due on it." : "Couldn't save the payment." };
  }
  revalidatePath("/purchase");
  return { ok: true, id: (data as { id: string }).id };
}
