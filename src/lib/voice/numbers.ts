import { tamilToLatin } from "./translit";

// Spoken numbers in Tamil script, Tanglish and English → a number. Everything is first
// transliterated to Latin, where Tamil sandhi ("இருபத்தஞ்சாயிரம்" → "irupaththanjaayiram")
// becomes a sequence of matchable morphemes. Longest match wins at each position.

type Kind = "unit" | "hundreds" | "hundred" | "mult" | "frac" | "skip";
type Morph = { re: RegExp; value: number; kind: Kind };

const H = "(?:ru|rru|rri|rr|ththi|ththu|thi|thu|tri|tru|r)?"; // நூறு / நூற்றி / நூத்தி …
const T = "(?:th|d)(?:th)?(?:u|i)?"; // பது / பத்து / பத்தி …

const LEXICON: Array<[string, number, Kind]> = [
  // fractions used with quantities: ஒன்றரை = 1.5, ரெண்டரை = 2.5, கால் = 0.25, முக்கால் = 0.75
  ["arai|half", 0.5, "frac"],
  ["mukkaal", 0.75, "frac"],
  ["kaal|quarter", 0.25, "frac"],
  // multipliers
  ["aayira(?:ththu|ththi|m)?|aayir|thousand|k", 1000, "mult"],
  ["l(?:a|e)(?:tch|ch|ts|ks|kk)a(?:m|ththu|ththi)?|lakhs?|lacs?", 100000, "mult"],
  ["koodi|kodi|crores?", 10000000, "mult"],
  // whole hundreds
  ["thol?laayira(?:ththu|ththi|m)?", 900, "hundreds"],
  [`irunoo${H}`, 200, "hundreds"],
  [`mun(?:n)?oo${H}|moonnoo${H}`, 300, "hundreds"],
  [`naa(?:lu)?noo${H}`, 400, "hundreds"],
  [`ain(?:n)?oo${H}|anj(?:u)?(?:n)?oo${H}`, 500, "hundreds"],
  [`a(?:a)?runoo${H}`, 600, "hundreds"],
  [`ezhunoo${H}`, 700, "hundreds"],
  [`en(?:n)?oo${H}`, 800, "hundreds"],
  [`noo${H}|hundred`, 100, "hundred"],
  // tens (combining forms included)
  [`irupa${T}|twenty`, 20, "unit"],
  [`muppa${T}|thirty`, 30, "unit"],
  [`naa(?:r|p|l)pa${T}|forty`, 40, "unit"],
  [`a(?:i)?m(?:p|b)a${T}|fifty`, 50, "unit"],
  [`arupa${T}|sixty`, 60, "unit"],
  [`ezhupa${T}|seventy`, 70, "unit"],
  [`en(?:p|b)a${T}|eighty`, 80, "unit"],
  ["thonnoo(?:ru|rri|ththi)?|ninety", 90, "unit"],
  // 11–19
  ["pathinon(?:nu|ru|dru)|eleven", 11, "unit"],
  ["panni(?:ra|re)ndu|pannendu|twelve", 12, "unit"],
  ["pathimoo(?:nu|ndru|nru)|thirteen", 13, "unit"],
  ["pathinaa(?:lu|ngu|nku)|fourteen", 14, "unit"],
  ["pathin(?:a|ai)(?:nju|nthu|ndhu)|fifteen", 15, "unit"],
  ["pathinaaru|sixteen", 16, "unit"],
  ["pathineezhu|pathinezhu|seventeen", 17, "unit"],
  ["pathinettu|eighteen", 18, "unit"],
  ["paththon(?:pa|ba)thu|nineteen", 19, "unit"],
  // 1–10, including the clipped stems used before ஆயிரம் / அரை
  ["pa(?:th|d)(?:th)?u?|ten", 10, "unit"],
  ["on(?:pa|ba)thu|om(?:pa|ba)thu|on(?:pa|ba)th|om(?:pa|ba)th|nine", 9, "unit"],
  ["ettu|ett|eight", 8, "unit"],
  ["ee?zhu|ee?zh|seven", 7, "unit"],
  ["aaru|aar|six", 6, "unit"],
  ["anju|ainthu|aindhu|anj|aiy|five", 5, "unit"],
  ["naalu|naangu|naanku|naal|four", 4, "unit"],
  ["moo(?:nu|ndru|nru)|moov|three", 3, "unit"],
  ["(?:i)?randu|rendu|irand|rend|iru|two", 2, "unit"],
  ["on(?:dr|r|n)u?|oru|oor|or|one|a", 1, "unit"],
  // filler words
  ["and|um|ru(?:p|b)aa(?:y|i)?|roo(?:p|b)aa(?:y|i)?|rupees?|rs|ruva|roova|only", 0, "skip"],
];

const MORPHS: Morph[] = LEXICON.map(([src, value, kind]) => ({ re: new RegExp(`^(?:${src})`), value, kind }));

export function parseSpokenNumber(input: string): number | null {
  const s = tamilToLatin(input)
    .replace(/[₹,]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ")
    .trim();
  if (!s) return null;

  let total = 0;
  let cur = 0;
  let pos = 0;
  let seen = false;

  while (pos < s.length) {
    const rest = s.slice(pos);
    if (/^\s/.test(rest)) {
      pos++;
      continue;
    }
    const digits = rest.match(/^\d+(?:\.\d+)?/);
    if (digits) {
      cur += Number(digits[0]);
      pos += digits[0].length;
      seen = true;
      continue;
    }
    let best: { m: Morph; len: number } | null = null;
    for (const m of MORPHS) {
      const hit = rest.match(m.re);
      if (hit && hit[0].length > (best?.len ?? 0)) best = { m, len: hit[0].length };
    }
    if (!best) return null;
    pos += best.len;
    const { value, kind } = best.m;
    if (kind === "skip") continue;
    seen = true;
    if (kind === "unit" || kind === "hundreds") cur += value;
    else if (kind === "frac") cur += value;
    else if (kind === "hundred") cur = (cur || 1) * 100;
    else if (kind === "mult") {
      total += (cur || 1) * value;
      cur = 0;
    }
  }
  if (!seen) return null;
  return Math.round((total + cur) * 1000) / 1000;
}
