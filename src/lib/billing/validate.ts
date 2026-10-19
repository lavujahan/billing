import { formatINR, parseAmount, parseQty } from "@/lib/money";
import { isValidGstin } from "./gst";
import { amountReceived, type BillTotals } from "./totals";
import type { BillDraft, BillingContext } from "./types";

export type Issue = { field: string; message: string };
export type BillValidation = { blocking: Issue[]; warnings: Issue[] };

const UNUSUAL_RATE = 0.2;

export function validateBill(draft: BillDraft, totals: BillTotals, ctx: BillingContext): BillValidation {
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];

  if (!draft.customer?.name.trim()) blocking.push({ field: "customer", message: "யாருக்கு bill? Choose a customer." });
  if (draft.lines.length === 0) blocking.push({ field: "lines", message: "என்ன item, எத்தனை? Add at least one item." });

  draft.lines.forEach((l) => {
    const qty = parseQty(l.qty);
    const rate = parseAmount(l.rate);
    if (!qty || qty <= 0) blocking.push({ field: `line.${l.key}.qty`, message: `${l.name}: enter a quantity.` });
    if (rate === null || rate <= 0) blocking.push({ field: `line.${l.key}.rate`, message: `${l.name} rate என்ன? Enter a rate.` });
    if (rate && l.usualRate && Math.abs(rate - l.usualRate) / l.usualRate > UNUSUAL_RATE) {
      warnings.push({ field: `line.${l.key}.rate`, message: `வழக்கமா ${formatINR(l.usualRate)} — usual rate is ${formatINR(l.usualRate)}` });
    }
    if (!ctx.gstSlabs.includes(l.gstRate)) {
      warnings.push({ field: `line.${l.key}.gst`, message: `${l.name}: GST ${l.gstRate}% is not one of your GST slabs.` });
    }
  });

  const discount = parseAmount(draft.discount);
  if (draft.discount && discount === null) blocking.push({ field: "discount", message: "Discount is not a number." });
  if (discount && totals.subtotal && (draft.discountMode === "percent" ? discount > 100 : discount > totals.subtotal)) {
    blocking.push({ field: "discount", message: "Discount is more than the bill." });
  }

  if (draft.payment === "partial") {
    const received = amountReceived(draft, totals.total);
    if (received <= 0) blocking.push({ field: "amountReceived", message: "Partial: how much was paid?" });
    else if (received >= totals.total) blocking.push({ field: "amountReceived", message: "Paid amount covers the bill — choose Cash instead." });
  }

  if (draft.invoiceDate > ctx.today) blocking.push({ field: "invoiceDate", message: "Bill date can't be in the future." });
  else if (ctx.lastInvoiceDate && draft.invoiceDate < ctx.lastInvoiceDate) {
    warnings.push({ field: "invoiceDate", message: "Date is before the last saved bill." });
  }

  const gstin = draft.customer?.gstin;
  if (gstin && !isValidGstin(gstin)) warnings.push({ field: "gstin", message: "GSTIN doesn't look right — check it." });

  const c = draft.customer;
  if (c?.creditLimit && draft.payment !== "paid") {
    const after = c.balance + totals.total - amountReceived(draft, totals.total);
    if (after > c.creditLimit) {
      warnings.push({ field: "customer", message: `${c.name} ஏற்கனவே ${formatINR(c.balance)} பாக்கி — over the ${formatINR(c.creditLimit)} credit limit.` });
    }
  }

  return { blocking, warnings };
}
