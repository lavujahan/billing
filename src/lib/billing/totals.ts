import { calcGst, type GstTotals } from "@/lib/gst-calc";
import { parseAmount, parseQty } from "@/lib/money";
import { stateOf } from "./gst";
import type { BillDraft } from "./types";

export type { LineTotals } from "@/lib/gst-calc";

export type BillTotals = GstTotals & { interState: boolean; placeOfSupply: string | null };

export function computeTotals(draft: BillDraft, businessStateCode: string | null): BillTotals {
  const placeOfSupply = stateOf(draft.customer?.gstin, draft.customer?.stateCode) ?? businessStateCode;
  const interState = Boolean(businessStateCode && placeOfSupply && placeOfSupply !== businessStateCode);
  const totals = calcGst(
    draft.lines.map((l) => ({ key: l.key, qty: parseQty(l.qty) ?? 0, rate: parseAmount(l.rate) ?? 0, gstRate: l.gstRate })),
    { inclusive: draft.rateIncludesGst, discount: { mode: draft.discountMode, value: parseAmount(draft.discount) ?? 0 }, interState },
  );
  return { ...totals, interState, placeOfSupply };
}

export function amountReceived(draft: BillDraft, total: number): number {
  if (draft.payment === "paid") return total;
  if (draft.payment === "credit") return 0;
  return parseAmount(draft.amountReceived) ?? 0;
}
