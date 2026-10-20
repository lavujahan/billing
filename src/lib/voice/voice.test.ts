import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSpokenNumber } from "./numbers";
import { detectCommand, nameSearchTerms, parseAmountUtterance, parseLineUtterance, parseDateUtterance, parsePaymentUtterance, parseQtyUtterance } from "./parse";
import { tamilToLatin } from "./translit";

test("transliteration", () => {
  assert.equal(tamilToLatin("பத்து"), "paththu");
  assert.equal(tamilToLatin("நானூத்தி"), "naanooththi");
  assert.equal(tamilToLatin("இருபத்தஞ்சாயிரம்"), "irupaththanjaayiram");
});

const NUMBERS: Array<[string, number]> = [
  ["பத்து", 10],
  ["ஐந்து", 5],
  ["அஞ்சு", 5],
  ["பதினைந்து", 15],
  ["இருபது", 20],
  ["இருபத்தஞ்சு", 25],
  ["இருபத்தி ஐந்து", 25],
  ["நாற்பது", 40],
  ["அம்பது", 50],
  ["நூறு", 100],
  ["நானூத்தி அம்பது", 450],
  ["நானூற்றி ஐம்பது", 450],
  ["ஐநூறு", 500],
  ["அறுநூத்தி எண்பது", 680],
  ["தொள்ளாயிரம்", 900],
  ["ஆயிரம்", 1000],
  ["மூவாயிரத்து ஐநூறு", 3500],
  ["இருபத்தஞ்சாயிரம்", 25000],
  ["பத்தாயிரம்", 10000],
  ["ரெண்டாயிரம்", 2000],
  ["ஒரு லட்சம்", 100000],
  ["ஒன்றரை", 1.5],
  ["ரெண்டரை", 2.5],
  ["naanooththi ambathu", 450],
  ["moovaayiraththu ainooru", 3500],
  ["four hundred fifty", 450],
  ["two thousand five hundred", 2500],
  ["3500", 3500],
  ["4.5k", 4500],
  ["2 lakh", 200000],
  ["1.5 லட்சம்", 150000],
  ["450 ரூபாய்", 450],
  ["₹3,500", 3500],
];

for (const [spoken, expected] of NUMBERS) {
  test(`number: ${spoken} = ${expected}`, () => assert.equal(parseSpokenNumber(spoken), expected));
}

test("not a number", () => {
  assert.equal(parseSpokenNumber("Kumar Stores"), null);
  assert.equal(parseSpokenNumber(""), null);
});

test("qty with unit", () => {
  assert.deepEqual(parseQtyUtterance("பத்து மூட்டை"), { qty: 10, unit: "bag" });
  assert.deepEqual(parseQtyUtterance("10 bags"), { qty: 10, unit: "bag" });
  assert.deepEqual(parseQtyUtterance("ரெண்டரை கிலோ"), { qty: 2.5, unit: "kg" });
  assert.deepEqual(parseQtyUtterance("12"), { qty: 12, unit: null });
});

test("item card utterance: qty and rate", () => {
  assert.deepEqual(parseLineUtterance("10 bag 450"), { qty: 10, unit: "bag", rate: 450 });
  assert.deepEqual(parseLineUtterance("பத்து மூட்டை நானூத்தி அம்பது"), { qty: 10, unit: "bag", rate: 450 });
  assert.deepEqual(parseLineUtterance("rate 460"), { qty: null, unit: null, rate: 460 });
  assert.deepEqual(parseLineUtterance("12 rate 460"), { qty: 12, unit: null, rate: 460 });
  assert.deepEqual(parseLineUtterance("பன்னிரண்டு ரேட் நானூறு"), { qty: 12, unit: null, rate: 400 });
  assert.deepEqual(parseLineUtterance("12"), { qty: 12, unit: null, rate: null });
  assert.deepEqual(parseLineUtterance("12 460"), { qty: 12, unit: null, rate: 460 });
  assert.equal(parseLineUtterance("hello"), null);
});

test("amounts", () => {
  assert.equal(parseAmountUtterance("rate 460"), 460);
  assert.equal(parseAmountUtterance("நானூத்தி அம்பது"), 450);
});

test("dates", () => {
  assert.equal(parseDateUtterance("இன்னைக்கு", "2026-10-20"), "2026-10-20");
  assert.equal(parseDateUtterance("நேத்து", "2026-10-20"), "2026-10-19");
  assert.equal(parseDateUtterance("yesterday", "2026-10-20"), "2026-10-19");
  assert.equal(parseDateUtterance("15th", "2026-10-20"), "2026-10-15");
  assert.equal(parseDateUtterance("25th", "2026-10-20"), "2026-09-25");
  assert.equal(parseDateUtterance("15 October", "2026-10-20"), "2026-10-15");
  assert.equal(parseDateUtterance("அக்டோபர் 3", "2026-10-20"), "2026-10-03");
});

test("payment", () => {
  assert.deepEqual(parsePaymentUtterance("cash"), { payment: "paid", amount: null });
  assert.deepEqual(parsePaymentUtterance("கடன்"), { payment: "credit", amount: null });
  assert.deepEqual(parsePaymentUtterance("credit-ல போடு"), { payment: "credit", amount: null });
  assert.deepEqual(parsePaymentUtterance("partial 2000"), { payment: "partial", amount: 2000 });
  assert.deepEqual(parsePaymentUtterance("GPay"), { payment: "paid", amount: null });
});

test("commands", () => {
  assert.equal(detectCommand("அடுத்து"), "next");
  assert.equal(detectCommand("next"), "next");
  assert.equal(detectCommand("இன்னொரு item"), "add_item");
  assert.equal(detectCommand("சேமி"), "save");
  assert.equal(detectCommand("வேண்டாம்"), "cancel");
  assert.equal(detectCommand("Kumar Stores"), null);
});

test("name search terms include a Latin form", () => {
  assert.deepEqual(nameSearchTerms("குமார் ஸ்டோர்ஸ்"), ["குமார் ஸ்டோர்ஸ்", "kumar stors"]);
});
