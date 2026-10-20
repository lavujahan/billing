import { formatINR } from "@/lib/money";
import type { BillCustomer, BillDraft, BillLine } from "./types";
import type { BillVoicePatch, CustomerCandidate, VoicePatchLine } from "./voice-patch";
import { emptyDraft } from "./types";

export type TypedField = "payment" | "discount" | "rateIncludesGst" | "invoiceDate" | "notes" | "amountReceived";

export type ApplyResult = {
  draft: BillDraft;
  chips: string[];
  // Ask the user: no confident customer match, or the spoken customer differs from the form's.
  customerChoice: { spokenName: string; candidates: CustomerCandidate[]; conflictWith: BillCustomer | null } | null;
  unmatched: BillVoicePatch["unmatched"];
};

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function toLine(l: VoicePatchLine): BillLine {
  return {
    key: newKey(),
    productId: l.productId,
    name: l.name,
    nameTa: l.nameTa,
    unit: l.unit,
    hsn: l.hsn,
    gstRate: l.gstRate,
    qty: l.qty === null ? "1" : String(l.qty),
    rate: l.rate === null ? "" : String(l.rate),
    usualRate: l.usualRate,
    confidence: l.qty === null ? Math.min(l.confidence, 0.6) : l.confidence,
  };
}

const sameCustomer = (a: BillCustomer, b: BillCustomer) => (a.id && b.id ? a.id === b.id : a.name.toLowerCase() === b.name.toLowerCase());

// Voice fills empty fields and adds rows. It never overwrites a typed value, except a line the
// user explicitly named ("cement rate 460"), and never switches the customer without asking.
export function applyVoicePatch(draft: BillDraft, patch: BillVoicePatch, typed: ReadonlySet<TypedField>): ApplyResult {
  const next: BillDraft = { ...draft, lines: [...draft.lines] };
  const chips: string[] = [];
  let customerChoice: ApplyResult["customerChoice"] = null;

  if (patch.customer) {
    const { pick, candidates, spokenName } = patch.customer;
    if (pick && !next.customer) {
      next.customer = pick;
      chips.push(pick.name);
    } else if (pick && next.customer && !sameCustomer(pick, next.customer)) {
      customerChoice = { spokenName, candidates: candidates.length ? candidates : [{ ...pick, score: 1 }], conflictWith: next.customer };
    } else if (!pick && (!next.customer || next.customer.name.toLowerCase() !== spokenName.toLowerCase())) {
      customerChoice = { spokenName, candidates, conflictWith: next.customer };
    }
  }

  for (const u of patch.lineUpdates) {
    const i = next.lines.findIndex((l) => l.key === u.key);
    if (i < 0) continue;
    const line = next.lines[i]!;
    next.lines[i] = {
      ...line,
      qty: u.qty === null ? line.qty : String(u.qty),
      rate: u.rate === null ? line.rate : String(u.rate),
      confidence: null,
    };
    chips.push(`${line.name}${u.qty !== null ? ` · ${u.qty}` : ""}${u.rate !== null ? ` · ${formatINR(u.rate)}` : ""}`);
  }

  for (const l of patch.lines) {
    next.lines.push(toLine(l));
    chips.push(`${l.qty ?? "?"} ${l.unit ?? ""} ${l.name}${l.rate !== null ? ` ${formatINR(l.rate)}` : ""}`.replace(/\s+/g, " ").trim());
  }

  if (patch.payment && !typed.has("payment")) {
    next.payment = patch.payment;
    chips.push(patch.payment === "paid" ? "Cash" : patch.payment === "credit" ? "Credit" : "Partial");
    if (patch.payment === "partial" && patch.amountReceived !== null && !typed.has("amountReceived")) {
      next.amountReceived = String(patch.amountReceived);
      chips[chips.length - 1] += ` ${formatINR(patch.amountReceived)}`;
    }
  }
  if (patch.discount && !typed.has("discount")) {
    next.discountMode = patch.discount.mode;
    next.discount = String(patch.discount.value);
    chips.push(`Discount ${patch.discount.mode === "percent" ? `${patch.discount.value}%` : formatINR(patch.discount.value)}`);
  }
  if (patch.rateIncludesGst !== null && !typed.has("rateIncludesGst")) {
    next.rateIncludesGst = patch.rateIncludesGst;
    chips.push(patch.rateIncludesGst ? "GST included" : "GST extra");
  }
  if (patch.invoiceDate && !typed.has("invoiceDate")) next.invoiceDate = patch.invoiceDate;
  if (patch.notes) next.notes = typed.has("notes") && next.notes ? `${next.notes}\n${patch.notes}` : patch.notes;

  return { draft: next, chips, customerChoice, unmatched: patch.unmatched };
}

// A whole new draft from a patch (extra customers named in the same sentence).
export function toDraftFromPatch(patch: BillVoicePatch, today: string): BillDraft {
  const pick = patch.customer?.pick ?? null;
  const customer: BillCustomer | null =
    pick ?? (patch.customer ? { id: null, name: patch.customer.spokenName, gstin: null, stateCode: null, balance: 0, creditLimit: null } : null);
  return applyVoicePatch(emptyDraft(today, customer), { ...patch, customer: null }, new Set()).draft;
}
