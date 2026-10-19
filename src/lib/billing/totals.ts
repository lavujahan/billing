import { parseAmount, parseQty } from "@/lib/money";
import { stateOf } from "./gst";
import type { BillDraft } from "./types";

export type LineTotals = {
  key: string;
  qty: number;
  rate: number;
  gross: number; // qty × rate as typed (what the form shows as Amount)
  taxable: number; // after removing included GST and the bill discount share
  tax: number;
  amount: number; // taxable + tax
};

export type BillTotals = {
  lines: LineTotals[];
  subtotal: number; // taxable before discount
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  interState: boolean;
  placeOfSupply: string | null;
};

// All arithmetic in paise; rupees only at the edges. GST is split per line so CGST always equals SGST.
export function computeTotals(draft: BillDraft, businessStateCode: string | null): BillTotals {
  const placeOfSupply = stateOf(draft.customer?.gstin, draft.customer?.stateCode) ?? businessStateCode;
  const interState = Boolean(businessStateCode && placeOfSupply && placeOfSupply !== businessStateCode);

  const base = draft.lines.map((l) => {
    const qty = parseQty(l.qty) ?? 0;
    const rate = parseAmount(l.rate) ?? 0;
    const gross = Math.round(qty * rate * 100);
    const taxable = draft.rateIncludesGst ? Math.round((gross * 100) / (100 + l.gstRate)) : gross;
    return { key: l.key, qty, rate, gross, taxable, gstRate: l.gstRate };
  });

  const subtotal = base.reduce((s, l) => s + l.taxable, 0);
  const discountInput = parseAmount(draft.discount) ?? 0;
  const discountWanted =
    draft.discountMode === "percent" ? Math.round((subtotal * Math.min(discountInput, 100)) / 100) : Math.round(discountInput * 100);
  const discount = Math.min(Math.max(discountWanted, 0), subtotal);

  let allocated = 0;
  let cgst = 0;
  let igst = 0;
  const lines: LineTotals[] = base.map((l, i) => {
    const share =
      i === base.length - 1 ? discount - allocated : subtotal ? Math.round((discount * l.taxable) / subtotal) : 0;
    allocated += share;
    const net = l.taxable - share;
    let tax: number;
    if (interState) {
      tax = Math.round((net * l.gstRate) / 100);
      igst += tax;
    } else {
      const half = Math.round((net * l.gstRate) / 200);
      tax = half * 2;
      cgst += half;
    }
    return { key: l.key, qty: l.qty, rate: l.rate, gross: l.gross / 100, taxable: net / 100, tax: tax / 100, amount: (net + tax) / 100 };
  });

  const taxable = subtotal - discount;
  const preRound = taxable + cgst * 2 + igst;
  const total = Math.round(preRound / 100) * 100;

  return {
    lines,
    subtotal: subtotal / 100,
    discount: discount / 100,
    taxable: taxable / 100,
    cgst: cgst / 100,
    sgst: cgst / 100,
    igst: igst / 100,
    roundOff: (total - preRound) / 100,
    total: total / 100,
    interState,
    placeOfSupply,
  };
}

export function amountReceived(draft: BillDraft, total: number): number {
  if (draft.payment === "paid") return total;
  if (draft.payment === "credit") return 0;
  return parseAmount(draft.amountReceived) ?? 0;
}
