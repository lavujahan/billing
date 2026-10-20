import { isValidGstin } from "@/lib/billing/gst";
import type { Issue } from "@/lib/billing/validate";
import { formatINR, parseAmount, parseQty } from "@/lib/money";
import { amountPaidNow, type PurchaseTotals } from "./totals";
import type { PurchaseContext, PurchaseDraft } from "./types";

export type PurchaseValidation = { blocking: Issue[]; warnings: Issue[] };

const LOW = 0.8;

export function validatePurchase(
  draft: PurchaseDraft,
  totals: PurchaseTotals,
  ctx: PurchaseContext & { vendorAverage?: number | null },
): PurchaseValidation {
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];

  if (!draft.vendor?.name.trim()) blocking.push({ field: "vendor", message: "யாரிடம் வாங்கினீங்க? Choose the vendor." });
  else if (!draft.vendor.id) blocking.push({ field: "vendor", message: "This vendor isn't in the vendor list yet — add it or ask the admin." });

  if (totals.total <= 0) blocking.push({ field: "total", message: "Enter the bill total." });

  if (draft.itemsMode === "items") {
    if (draft.lines.length === 0) blocking.push({ field: "lines", message: "Add the items, or switch to Total only." });
    for (const l of draft.lines) {
      if (!l.name.trim()) blocking.push({ field: `line.${l.key}.name`, message: "An item row has no name." });
      if (!(parseQty(l.qty) ?? 0)) blocking.push({ field: `line.${l.key}.qty`, message: `${l.name || "Item"}: enter a quantity.` });
      if (parseAmount(l.rate) === null) blocking.push({ field: `line.${l.key}.rate`, message: `${l.name || "Item"}: enter a rate.` });
      if (!l.productId && l.name.trim()) warnings.push({ field: `line.${l.key}.name`, message: `“${l.name}” isn't in your item list — saved as printed.` });
      if (l.confidence !== null && l.confidence !== undefined && l.confidence < LOW) {
        warnings.push({ field: `line.${l.key}.name`, message: `Check ${l.name || "this row"} against the bill.` });
      }
    }
    if (draft.printedTotal !== null && Math.abs(draft.printedTotal - totals.total) > 1) {
      warnings.push({
        field: "total",
        message: `Items add up to ${formatINR(totals.total)} but the bill says ${formatINR(draft.printedTotal)} — check rates, quantities and GST.`,
      });
    }
  } else if (!totals.manualAddsUp) {
    warnings.push({ field: "total", message: "Taxable + GST + round-off doesn't equal the total (±₹1)." });
  }

  if (draft.itemsMode === "total" && totals.cgst !== totals.sgst) warnings.push({ field: "total", message: "CGST and SGST should be equal." });
  if (totals.interState && totals.cgst + totals.sgst > 0) warnings.push({ field: "total", message: "Vendor is in another state — expected IGST, not CGST + SGST." });
  if (!totals.interState && totals.igst > 0) warnings.push({ field: "total", message: "Vendor is in your state — expected CGST + SGST, not IGST." });

  const gstin = draft.vendor?.gstin ?? draft.billGstin;
  if (gstin && !isValidGstin(gstin)) warnings.push({ field: "vendor", message: "GSTIN doesn't look right — check it against the bill." });
  if (draft.vendor?.gstin && draft.billGstin && draft.vendor.gstin !== draft.billGstin) {
    warnings.push({ field: "vendor", message: `The bill shows GSTIN ${draft.billGstin}, the vendor list has ${draft.vendor.gstin}.` });
  }

  if (draft.billDate > ctx.today) blocking.push({ field: "billDate", message: "Bill date can't be in the future." });
  else {
    const yearAgo = new Date(Date.parse(`${ctx.today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
    if (draft.billDate < yearAgo) warnings.push({ field: "billDate", message: "Bill is more than 12 months old." });
  }

  for (const [field, c] of Object.entries(draft.fieldConfidence)) {
    if (c !== undefined && c < LOW) warnings.push({ field, message: "Check this against the bill · சரிபார்க்கவும்" });
  }

  if (draft.payment === "partial") {
    const paid = amountPaidNow(draft, totals.total);
    if (paid <= 0) blocking.push({ field: "amountPaid", message: "Partial: how much was paid?" });
    else if (paid >= totals.total) blocking.push({ field: "amountPaid", message: "Paid amount covers the bill — choose Paid instead." });
  }

  if (ctx.vendorAverage && totals.total > ctx.vendorAverage * 5) {
    warnings.push({ field: "total", message: `Much larger than usual from this vendor (average ${formatINR(ctx.vendorAverage)}).` });
  }

  return { blocking, warnings };
}
