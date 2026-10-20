import assert from "node:assert/strict";
import { test } from "node:test";
import { computePurchaseTotals } from "./totals";
import { emptyPurchase, type PurchaseDraft, type PurchaseLine } from "./types";
import { validatePurchase } from "./validate";

const ctx = { businessStateCode: "33", gstSlabs: [0, 5, 12, 18, 28], today: "2026-10-21" };
const vendor = (gstin: string | null) => ({ id: "v1", name: "ABC Traders", gstin, stateCode: null, balance: 0 });
const line = (p: Partial<PurchaseLine>): PurchaseLine => ({
  key: "l1", productId: "p1", name: "Cement bag 50kg", hsn: "2523", qty: "25", unit: "bag", rate: "400", gstRate: "18", printedAmount: null, ...p,
});
const draft = (p: Partial<PurchaseDraft>): PurchaseDraft => ({ ...emptyPurchase("2026-10-21"), ...p });

test("spec example: 25 bags × 400 at 18%, same state → CGST 900 + SGST 900 = 11,800", () => {
  const d = draft({ vendor: vendor("33AAAAA0000A1Z5"), lines: [line({})] });
  const t = computePurchaseTotals(d, "33");
  assert.equal(t.taxable, 10000);
  assert.equal(t.cgst, 900);
  assert.equal(t.sgst, 900);
  assert.equal(t.total, 11800);
});

test("other-state vendor → IGST", () => {
  const t = computePurchaseTotals(draft({ vendor: vendor("27AAPFU0939F1ZV"), lines: [line({})] }), "33");
  assert.equal(t.igst, 1800);
  assert.equal(t.cgst, 0);
});

test("total-only mode checks that the parts add up", () => {
  const ok = computePurchaseTotals(
    draft({ itemsMode: "total", manual: { taxable: "10000", cgst: "900", sgst: "900", igst: "", roundOff: "", total: "11800" } }),
    "33",
  );
  assert.equal(ok.total, 11800);
  assert.equal(ok.manualAddsUp, true);
  const bad = computePurchaseTotals(
    draft({ itemsMode: "total", manual: { taxable: "10000", cgst: "900", sgst: "900", igst: "", roundOff: "", total: "12500" } }),
    "33",
  );
  assert.equal(bad.manualAddsUp, false);
});

test("printed total mismatch is a warning, not a block", () => {
  const d = draft({ vendor: vendor(null), lines: [line({})], printedTotal: 12000 });
  const v = validatePurchase(d, computePurchaseTotals(d, "33"), ctx);
  assert.equal(v.blocking.length, 0);
  assert.ok(v.warnings.some((w) => w.field === "total"));
});

test("vendor must be in the master; total must be > 0", () => {
  const d = draft({ vendor: { ...vendor(null), id: null }, itemsMode: "total" });
  const v = validatePurchase(d, computePurchaseTotals(d, "33"), ctx);
  assert.ok(v.blocking.some((b) => b.field === "vendor"));
  assert.ok(v.blocking.some((b) => b.field === "total"));
});

test("item not in the item list saves with a warning", () => {
  const d = draft({ vendor: vendor(null), lines: [line({ productId: null, name: "Wall putty 20kg" })] });
  const v = validatePurchase(d, computePurchaseTotals(d, "33"), ctx);
  assert.equal(v.blocking.length, 0);
  assert.ok(v.warnings.some((w) => w.message.includes("Wall putty")));
});

test("future date blocks; very old date warns", () => {
  const future = draft({ vendor: vendor(null), lines: [line({})], billDate: "2026-11-01" });
  assert.ok(validatePurchase(future, computePurchaseTotals(future, "33"), ctx).blocking.some((b) => b.field === "billDate"));
  const old = draft({ vendor: vendor(null), lines: [line({})], billDate: "2025-01-01" });
  assert.ok(validatePurchase(old, computePurchaseTotals(old, "33"), ctx).warnings.some((w) => w.field === "billDate"));
});

test("large amount vs vendor average warns", () => {
  const d = draft({ vendor: vendor(null), lines: [line({})] });
  const v = validatePurchase(d, computePurchaseTotals(d, "33"), { ...ctx, vendorAverage: 2000 });
  assert.ok(v.warnings.some((w) => w.message.includes("larger than usual")));
});
