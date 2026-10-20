import type { PurchaseDraft, PurchaseLine, PurchaseVendor } from "./types";

export type VendorCandidate = PurchaseVendor & { id: string; score: number };

// What a bill read (photo/PDF) or a spoken purchase sends back to the form.
export type PurchasePatch = {
  documentKind: "tax_invoice" | "bill" | "credit_note" | "estimate" | "not_a_bill";
  billCount: number;
  vendor: { pick: PurchaseVendor | null; candidates: VendorCandidate[]; readName: string; gstin: string | null } | null;
  billNumber: string | null;
  billDate: string | null;
  lines: PurchaseLine[];
  ratesIncludeGst: boolean | null;
  discount: number | null;
  totals: { taxable: number | null; cgst: number | null; sgst: number | null; igst: number | null; roundOff: number | null; total: number | null };
  payment: PurchaseDraft["payment"] | null;
  amountPaid: number | null;
  paymentMode: PurchaseDraft["paymentMode"];
  confidence: PurchaseDraft["fieldConfidence"];
  handwritten: boolean;
};

export type ReadResponse =
  | { ok: true; patch: PurchasePatch; transcript?: string }
  | { ok: false; error: string; message: string; transcript?: string };

export type PurchaseTypedField = "vendor" | "billNumber" | "billDate" | "payment" | "amountPaid" | "paymentMode" | "manual" | "discount" | "ratesIncludeGst";

const fmt = (n: number | null) => (n === null ? "" : String(n));

// A read fills empty fields and replaces earlier *read* values; it never overwrites what the
// user typed or spoke. Lines are replaced only when every current line came from a read.
export function applyPurchasePatch(
  draft: PurchaseDraft,
  patch: PurchasePatch,
  typed: ReadonlySet<PurchaseTypedField>,
): { draft: PurchaseDraft; vendorChoice: PurchasePatch["vendor"] | null; linesKept: boolean } {
  const next: PurchaseDraft = { ...draft, manual: { ...draft.manual }, fieldConfidence: { ...draft.fieldConfidence } };
  let vendorChoice: PurchasePatch["vendor"] | null = null;

  if (patch.vendor) {
    next.billGstin = patch.vendor.gstin ?? next.billGstin;
    if (!typed.has("vendor")) {
      if (patch.vendor.pick) next.vendor = patch.vendor.pick;
      else vendorChoice = patch.vendor;
      if (patch.confidence.vendor !== undefined) next.fieldConfidence.vendor = patch.confidence.vendor;
    }
  }
  if (patch.billNumber && !typed.has("billNumber")) {
    next.billNumber = patch.billNumber;
    if (patch.confidence.billNumber !== undefined) next.fieldConfidence.billNumber = patch.confidence.billNumber;
  }
  if (patch.billDate && !typed.has("billDate")) {
    next.billDate = patch.billDate;
    if (patch.confidence.billDate !== undefined) next.fieldConfidence.billDate = patch.confidence.billDate;
  }

  const onlyReadLines = draft.lines.every((l) => l.confidence !== undefined);
  let linesKept = false;
  if (patch.lines.length) {
    if (onlyReadLines) next.lines = patch.lines;
    else linesKept = true;
  }
  if (patch.ratesIncludeGst !== null && !typed.has("ratesIncludeGst")) next.ratesIncludeGst = patch.ratesIncludeGst;
  if (patch.discount !== null && !typed.has("discount")) next.discount = fmt(patch.discount);

  if (!typed.has("manual")) {
    const t = patch.totals;
    next.manual = { taxable: fmt(t.taxable), cgst: fmt(t.cgst), sgst: fmt(t.sgst), igst: fmt(t.igst), roundOff: fmt(t.roundOff), total: fmt(t.total) };
  }
  next.printedTotal = patch.totals.total ?? next.printedTotal;
  if (patch.confidence.total !== undefined) next.fieldConfidence.total = patch.confidence.total;
  // With no readable item rows, fall back to the bill's totals.
  if (!next.lines.length && patch.totals.total) next.itemsMode = "total";
  else if (patch.lines.length && !linesKept) next.itemsMode = "items";

  if (patch.payment && !typed.has("payment")) next.payment = patch.payment;
  if (patch.amountPaid !== null && !typed.has("amountPaid")) next.amountPaid = fmt(patch.amountPaid);
  if (patch.paymentMode && !typed.has("paymentMode")) next.paymentMode = patch.paymentMode;
  next.handwritten = patch.handwritten;

  return { draft: next, vendorChoice, linesKept };
}
