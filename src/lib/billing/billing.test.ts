import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmount } from "../money";
import { financialYear, isValidGstin } from "./gst";
import { computeTotals } from "./totals";
import { emptyDraft, type BillDraft, type BillLine } from "./types";
import { rupeesInWords } from "./words";

const line = (key: string, qty: string, rate: string, gstRate: number): BillLine => ({
  key, productId: key, name: key, nameTa: null, unit: "nos", hsn: null, gstRate, qty, rate, usualRate: null,
});

const draft = (patch: Partial<BillDraft>): BillDraft => ({ ...emptyDraft("2026-10-19"), ...patch });

test("canvas example: cement 10×450 @28% + rod 5×680 @18%, intra-state", () => {
  const t = computeTotals(draft({ lines: [line("a", "10", "450", 28), line("b", "5", "680", 18)] }), "33");
  assert.equal(t.taxable, 7900);
  assert.equal(t.cgst, 630 + 306);
  assert.equal(t.sgst, t.cgst);
  assert.equal(t.igst, 0);
  assert.equal(t.total, 9772);
  assert.equal(t.roundOff, 0);
});

test("inter-state customer gets IGST", () => {
  const customer = { id: null, name: "X", gstin: "27AAPFU0939F1ZV", stateCode: null, balance: 0, creditLimit: null };
  const t = computeTotals(draft({ customer, lines: [line("a", "1", "1000", 18)] }), "33");
  assert.equal(t.interState, true);
  assert.equal(t.igst, 180);
  assert.equal(t.cgst, 0);
  assert.equal(t.total, 1180);
});

test("rate includes GST backs tax out and rounds to the rupee", () => {
  const t = computeTotals(draft({ rateIncludesGst: true, lines: [line("a", "1", "118", 18)] }), "33");
  assert.equal(t.taxable, 100);
  assert.equal(t.cgst + t.sgst, 18);
  assert.equal(t.total, 118);
});

test("discount is spread across lines before tax", () => {
  const t = computeTotals(
    draft({ discount: "10", discountMode: "percent", lines: [line("a", "1", "1000", 18), line("b", "1", "1000", 5)] }),
    "33",
  );
  assert.equal(t.discount, 200);
  assert.equal(t.taxable, 1800);
  assert.equal(t.cgst + t.sgst, 162 + 45);
  assert.equal(t.total, 2007);
});

test("round off to nearest rupee", () => {
  const t = computeTotals(draft({ lines: [line("a", "3", "33.33", 5)] }), "33");
  assert.equal(t.taxable, 99.99);
  assert.equal(t.total, 105);
  assert.equal(Math.round((t.taxable + t.cgst + t.sgst + t.roundOff) * 100), 10500);
});

test("parseAmount", () => {
  assert.equal(parseAmount("4,500"), 4500);
  assert.equal(parseAmount("4.5k"), 4500);
  assert.equal(parseAmount("₹ 450"), 450);
  assert.equal(parseAmount("2 lakh"), 200000);
  assert.equal(parseAmount("2l"), 200000);
  assert.equal(parseAmount("abc"), null);
});

test("GSTIN checksum", () => {
  assert.equal(isValidGstin("27AAPFU0939F1ZV"), true);
  assert.equal(isValidGstin("27AAPFU0939F1ZW"), false);
  assert.equal(isValidGstin("33AAAAA0000A1Z5"), false);
});

test("financial year", () => {
  assert.equal(financialYear("2026-10-19"), "26-27");
  assert.equal(financialYear("2027-03-31"), "26-27");
  assert.equal(financialYear("2027-04-01"), "27-28");
});

test("amount in words, Indian numbering", () => {
  assert.equal(rupeesInWords(9772), "Rupees Nine Thousand Seven Hundred Seventy Two Only");
  assert.equal(rupeesInWords(118400), "Rupees One Lakh Eighteen Thousand Four Hundred Only");
  assert.equal(rupeesInWords(12345678.5), "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only");
});
