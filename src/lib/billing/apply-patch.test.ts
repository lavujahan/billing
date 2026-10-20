import assert from "node:assert/strict";
import { test } from "node:test";
import { applyVoicePatch, toDraftFromPatch } from "./apply-patch";
import { emptyDraft, type BillCustomer, type BillDraft } from "./types";
import type { BillVoicePatch, VoicePatchLine } from "./voice-patch";

const kumar: BillCustomer = { id: "c-kumar", name: "Kumar Stores", gstin: null, stateCode: null, balance: 0, creditLimit: null };
const murugan: BillCustomer = { id: "c-murugan", name: "Murugan Agencies", gstin: null, stateCode: null, balance: 0, creditLimit: null };
const cement: VoicePatchLine = {
  productId: "p-cement", name: "Cement 50kg", nameTa: "சிமெண்ட்", unit: "bag", hsn: "2523", gstRate: 28, qty: 10, rate: 450, usualRate: null, confidence: 0.95,
};

const patch = (p: Partial<BillVoicePatch>): BillVoicePatch => ({
  customer: null, lines: [], lineUpdates: [], unmatched: [], payment: null, amountReceived: null,
  discount: null, rateIncludesGst: null, invoiceDate: null, notes: null, ...p,
});
const draft = (p: Partial<BillDraft> = {}): BillDraft => ({ ...emptyDraft("2026-10-20"), ...p });

test("empty form: voice fills customer, lines and payment", () => {
  const r = applyVoicePatch(
    draft(),
    patch({ customer: { pick: kumar, candidates: [], spokenName: "Kumar Stores", confidence: 0.96 }, lines: [cement], payment: "credit" }),
    new Set(),
  );
  assert.equal(r.draft.customer?.id, "c-kumar");
  assert.equal(r.draft.lines.length, 1);
  assert.equal(r.draft.lines[0]!.qty, "10");
  assert.equal(r.draft.lines[0]!.rate, "450");
  assert.equal(r.draft.payment, "credit");
  assert.equal(r.customerChoice, null);
});

test("existing rows are kept and new items are appended", () => {
  const start = applyVoicePatch(draft(), patch({ lines: [cement] }), new Set()).draft;
  const r = applyVoicePatch(start, patch({ lines: [{ ...cement, productId: "p-rod", name: "TMT rod", qty: 5, rate: 680 }] }), new Set());
  assert.equal(r.draft.lines.length, 2);
  assert.equal(r.draft.lines[0]!.name, "Cement 50kg");
  assert.equal(r.draft.lines[0]!.qty, "10");
});

test("typed fields are never overwritten", () => {
  const typed = new Set(["payment", "discount", "rateIncludesGst", "invoiceDate", "amountReceived"] as const);
  const start = draft({ payment: "paid", discount: "100", discountMode: "amount", rateIncludesGst: false, invoiceDate: "2026-10-18" });
  const r = applyVoicePatch(
    start,
    patch({ payment: "credit", discount: { mode: "percent", value: 5 }, rateIncludesGst: true, invoiceDate: "2026-10-19", amountReceived: 2000 }),
    typed,
  );
  assert.equal(r.draft.payment, "paid");
  assert.equal(r.draft.discount, "100");
  assert.equal(r.draft.discountMode, "amount");
  assert.equal(r.draft.rateIncludesGst, false);
  assert.equal(r.draft.invoiceDate, "2026-10-18");
});

test("typed notes get the spoken note appended, not replaced", () => {
  const r = applyVoicePatch(draft({ notes: "Deliver Monday" }), patch({ notes: "Call before" }), new Set(["notes"]));
  assert.equal(r.draft.notes, "Deliver Monday\nCall before");
});

test("a different spoken customer asks instead of switching", () => {
  const r = applyVoicePatch(draft({ customer: kumar }), patch({ customer: { pick: murugan, candidates: [], spokenName: "Murugan", confidence: 0.9 } }), new Set());
  assert.equal(r.draft.customer?.id, "c-kumar");
  assert.equal(r.customerChoice?.conflictWith?.id, "c-kumar");
});

test("the same customer spoken again changes nothing", () => {
  const r = applyVoicePatch(draft({ customer: kumar }), patch({ customer: { pick: kumar, candidates: [], spokenName: "Kumar", confidence: 0.9 } }), new Set());
  assert.equal(r.customerChoice, null);
});

test("no confident match asks with candidates", () => {
  const r = applyVoicePatch(
    draft(),
    patch({ customer: { pick: null, candidates: [{ ...kumar, score: 0.6 }, { ...murugan, score: 0.55 }], spokenName: "Kumaran", confidence: 0.6 } }),
    new Set(),
  );
  assert.equal(r.draft.customer, null);
  assert.equal(r.customerChoice?.candidates.length, 2);
});

test("explicitly named line updates overwrite that line only", () => {
  const start = applyVoicePatch(draft(), patch({ lines: [cement] }), new Set()).draft;
  const key = start.lines[0]!.key;
  const r = applyVoicePatch(start, patch({ lineUpdates: [{ key, qty: null, rate: 460 }] }), new Set());
  assert.equal(r.draft.lines[0]!.rate, "460");
  assert.equal(r.draft.lines[0]!.qty, "10");
});

test("missing qty defaults to 1 and is flagged for checking", () => {
  const r = applyVoicePatch(draft(), patch({ lines: [{ ...cement, qty: null }] }), new Set());
  assert.equal(r.draft.lines[0]!.qty, "1");
  assert.ok((r.draft.lines[0]!.confidence ?? 1) < 0.8);
});

test("extra customer becomes its own draft", () => {
  const d = toDraftFromPatch(patch({ customer: { pick: null, candidates: [], spokenName: "Ravi", confidence: 0.9 }, lines: [cement] }), "2026-10-20");
  assert.equal(d.customer?.name, "Ravi");
  assert.equal(d.customer?.id, null);
  assert.equal(d.lines.length, 1);
});
