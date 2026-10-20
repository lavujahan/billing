import { parseSpokenNumber } from "./numbers";
import { tamilToLatin } from "./translit";

// Field-voice parsers: one transcript → one field value. No AI; runs in the browser too.

const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^(moottai|moota|mootai|saakku|bags?|mutta)$/, "bag"],
  [/^(kilo|kiloo|kg|kgs|kilogram)$/, "kg"],
  [/^(kiraam|gram|grams|g)$/, "g"],
  [/^(littar|littar|liter|litre|lit|ltr)$/, "litre"],
  [/^(meettar|meter|metre|mtr|m)$/, "metre"],
  [/^(adi|feet|foot|ft)$/, "ft"],
  [/^(petti|box|boxes)$/, "box"],
  [/^(paakkett|paakket|packet|packets|pkt)$/, "packet"],
  [/^(dan|tan|ton|tons|tonne)$/, "ton"],
  [/^(kattu|bundle|bundles)$/, "bundle"],
  [/^(ennam|nos|no|piece|pieces|pcs|ennikkai|thundu)$/, "nos"],
];

function unitOf(word: string): string | null {
  const w = tamilToLatin(word).replace(/[^a-z]/g, "");
  return UNIT_WORDS.find(([re]) => re.test(w))?.[1] ?? null;
}

export function parseQtyUtterance(transcript: string): { qty: number; unit: string | null } | null {
  const words = transcript.trim().split(/\s+/);
  let unit: string | null = null;
  const numberWords = words.filter((w) => {
    const u = unitOf(w);
    if (u) unit = u;
    return !u;
  });
  const qty = parseSpokenNumber(numberWords.join(" "));
  return qty && qty > 0 ? { qty, unit } : null;
}

// Add-item utterance → item words + quantity: "பத்து மூட்டை சிமெண்ட்", "cement 10 bag", "10 bag cement 450".
// Quantity is the run of number/unit words at the start (or else the end); numbers inside
// the name stay part of it ("PVC pipe 1 inch", "TMT rod 12mm"). Any spoken rate is ignored —
// the rate comes from the master.
export function splitItemUtterance(transcript: string): { itemText: string; qty: number | null; unit: string | null } {
  const words = transcript.replace(/[,.]/g, " ").trim().split(/\s+/).filter(Boolean);
  const kind = (w: string) => (unitOf(w) ? "unit" : /^a$/i.test(w) || parseSpokenNumber(w) === null ? "word" : "num");
  const kinds = words.map(kind);

  let lead = 0;
  while (lead < words.length && kinds[lead] !== "word") lead++;
  let trail = words.length;
  while (trail > lead && kinds[trail - 1] !== "word") trail--;

  const leadRun = words.slice(0, lead);
  const trailRun = words.slice(trail);
  const qtyRun = kinds.slice(0, lead).includes("num") ? leadRun : trailRun;
  const numberWords = qtyRun.filter((w) => kind(w) === "num");
  const qty = numberWords.length ? parseSpokenNumber(numberWords.join(" ")) : null;
  const unit = qtyRun.map(unitOf).find(Boolean) ?? null;

  return { itemText: words.slice(lead, trail).join(" "), qty: qty && qty > 0 ? qty : null, unit };
}

const RATE_WORD = /\b(rate|reet|vilai|velai|price)\b|ரேட்|விலை/i;

// One item-card utterance → qty and/or rate. A unit word or "rate" separates the two:
// "10 bag 450", "பத்து மூட்டை rate நானூத்தி அம்பது", "rate 460", "12".
export function parseLineUtterance(transcript: string): { qty: number | null; unit: string | null; rate: number | null } | null {
  const text = transcript.replace(/[,]/g, " ").trim();
  const rateAt = text.search(RATE_WORD);
  if (rateAt >= 0) {
    const before = text.slice(0, rateAt).trim();
    const after = text.slice(rateAt).replace(RATE_WORD, " ").trim();
    const qty = before ? parseQtyUtterance(before) : null;
    const rate = parseSpokenNumber(after);
    return qty || rate !== null ? { qty: qty?.qty ?? null, unit: qty?.unit ?? null, rate } : null;
  }

  const words = text.split(/\s+/);
  const unitAt = words.findIndex((w) => unitOf(w));
  if (unitAt >= 0) {
    const qty = parseSpokenNumber(words.slice(0, unitAt).join(" "));
    const rest = words.slice(unitAt + 1).join(" ");
    const rate = rest ? parseSpokenNumber(rest) : null;
    return qty || rate !== null ? { qty: qty ?? null, unit: unitOf(words[unitAt]!), rate } : null;
  }

  const digits = text.match(/\d+(?:\.\d+)?/g);
  if (digits && digits.length === 2 && /^[\d.\s]+$/.test(text)) return { qty: Number(digits[0]), unit: null, rate: Number(digits[1]) };
  const n = parseSpokenNumber(text);
  return n !== null && n > 0 ? { qty: n, unit: null, rate: null } : null;
}

export function parseAmountUtterance(transcript: string): number | null {
  const n = parseSpokenNumber(transcript.replace(/(rate|ரேட்|vilai|விலை|discount|டிஸ்கவுண்ட்)/gi, " "));
  return n !== null && n >= 0 ? n : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TAMIL_MONTHS = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function parseDateUtterance(transcript: string, todayIso: string): string | null {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const t = transcript.toLowerCase();
  const lat = tamilToLatin(t);
  const shift = (days: number) => iso(new Date(today.getTime() + days * 86_400_000));

  if (/munthaa?neeth|day before yesterday|munthanaal/.test(lat)) return shift(-2);
  if (/neeth|neerr|yesterday/.test(lat)) return shift(-1);
  if (/innaik|inraik|inru\b|today|indru/.test(lat)) return shift(0);

  let month: number | null = null;
  TAMIL_MONTHS.forEach((m, i) => {
    if (t.includes(m)) month = i;
  });
  MONTHS.forEach((m, i) => {
    if (new RegExp(`\\b${m}`).test(t)) month = i;
  });
  const dayMatch = t.match(/\b(\d{1,2})(?:st|nd|rd|th|ம்)?\b/);
  const day = dayMatch ? Number(dayMatch[1]) : parseSpokenNumber(t.replace(/[^\s஀-௿a-z0-9]/g, " ").split(/\s+/)[0] ?? "");
  if (!day || day < 1 || day > 31) return null;

  let y = today.getUTCFullYear();
  let m = month ?? today.getUTCMonth();
  if (month === null && day > today.getUTCDate()) m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  let candidate = new Date(Date.UTC(y, m, day));
  if (candidate > today) candidate = new Date(Date.UTC(y - 1, m, day));
  if (candidate.getUTCDate() !== day) return null;
  return iso(candidate);
}

export type PaymentSpoken = { payment: "paid" | "credit" | "partial"; amount: number | null };

export function parsePaymentUtterance(transcript: string): PaymentSpoken | null {
  const lat = tamilToLatin(transcript.toLowerCase());
  const amount = parseSpokenNumber(lat.replace(/[a-z]*(partial|paathi|konjam|advance|kuduththaa?r?)[a-z]*/g, " ").replace(/[a-z]+/g, (w) => (parseSpokenNumber(w) === null ? " " : w)));
  if (/partial|paathi|konjam|advance|paarsh/.test(lat)) return { payment: "partial", amount };
  if (/credit|kiredit|ka(?:d|t)an|account|akkavu(?:n|nt)|udhaar|later/.test(lat)) return { payment: "credit", amount: null };
  if (/cash|kesh|kaash|rokkam|kaasu|paid|gpay|ji ?pe|upi|phonepe|paytm/.test(lat)) return { payment: "paid", amount: null };
  return null;
}

export type VoiceCommand = "next" | "add_item" | "delete_last" | "save" | "cancel";

export function detectCommand(transcript: string): VoiceCommand | null {
  const lat = tamilToLatin(transcript.toLowerCase()).trim();
  if (/^(a(?:d|t)uththu|a(?:d|t)utha|next)\b/.test(lat)) return "next";
  if (/(innoru|innonnu|add|another) ?(item|aitam|aiyttam)/.test(lat)) return "add_item";
  if (/(ka(?:d|t)aisi|last).*(e(?:d|t)u|delete|remove|neekku)|delete last/.test(lat)) return "delete_last";
  if (/^(save|seemi|cheemi|seevi|chemi|seemiyungal)\b/.test(lat)) return "save";
  if (/^(cancel|veendaam|vendaam|venam)\b/.test(lat)) return "cancel";
  return null;
}

// Search terms for a spoken name: the transcript as heard plus a Latin form, so
// "குமார் ஸ்டோர்ஸ்" can find "Kumar Stores".
export function nameSearchTerms(transcript: string): string[] {
  const clean = transcript.replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  const latin = tamilToLatin(clean).replace(/aa/g, "a").replace(/oo/g, "o").replace(/ee/g, "i");
  return [...new Set([clean, latin].filter(Boolean))];
}
