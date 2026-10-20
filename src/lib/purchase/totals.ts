import { stateOf } from "@/lib/billing/gst";
import { calcGst, type LineTotals } from "@/lib/gst-calc";
import { parseAmount, parseQty } from "@/lib/money";
import type { PurchaseDraft } from "./types";

export type PurchaseTotals = {
  lines: LineTotals[];
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  interState: boolean;
  // Total-only mode: does taxable + tax + round-off equal the total typed? (±₹1)
  manualAddsUp: boolean;
};

const num = (s: string) => parseAmount(s) ?? 0;

export function vendorState(draft: PurchaseDraft) {
  return stateOf(draft.vendor?.gstin ?? draft.billGstin, draft.vendor?.stateCode);
}

export function computePurchaseTotals(draft: PurchaseDraft, businessStateCode: string | null): PurchaseTotals {
  const vs = vendorState(draft);
  const interState = Boolean(businessStateCode && vs && vs !== businessStateCode);

  if (draft.itemsMode === "total") {
    const m = draft.manual;
    const taxable = num(m.taxable);
    const cgst = num(m.cgst);
    const sgst = num(m.sgst);
    const igst = num(m.igst);
    const roundOff = Number(m.roundOff.replace(/[^\d.-]/g, "")) || 0;
    const total = num(m.total);
    const sum = taxable + cgst + sgst + igst + roundOff;
    return {
      lines: [],
      subtotal: taxable,
      discount: 0,
      taxable,
      cgst,
      sgst,
      igst,
      roundOff,
      total,
      interState,
      manualAddsUp: taxable === 0 || Math.abs(sum - total) <= 1,
    };
  }

  const t = calcGst(
    draft.lines.map((l) => ({ key: l.key, qty: parseQty(l.qty) ?? 0, rate: parseAmount(l.rate) ?? 0, gstRate: Number(l.gstRate) || 0 })),
    { inclusive: draft.ratesIncludeGst, discount: { mode: "amount", value: num(draft.discount) }, interState },
  );
  return { ...t, interState, manualAddsUp: true };
}

export function amountPaidNow(draft: PurchaseDraft, total: number): number {
  if (draft.payment === "paid") return total;
  if (draft.payment === "credit") return 0;
  return parseAmount(draft.amountPaid) ?? 0;
}
