// Rough Tamil-script → Latin transliteration, tuned for matching rather than display:
// "குமார் ஸ்டோர்ஸ்" → "kumaar stoors", "நானூத்தி" → "naanooththi", "அம்பது" → "ambathu".
const VOWELS: Record<string, string> = {
  அ: "a", ஆ: "aa", இ: "i", ஈ: "ee", உ: "u", ஊ: "oo", எ: "e", ஏ: "ee", ஐ: "ai", ஒ: "o", ஓ: "oo", ஔ: "au",
};
const CONSONANTS: Record<string, string> = {
  க: "k", ங: "ng", ச: "ch", ஞ: "n", ட: "t", ண: "n", த: "th", ந: "n", ப: "p", ம: "m", ய: "y", ர: "r",
  ல: "l", வ: "v", ழ: "zh", ள: "l", ற: "r", ன: "n", ஜ: "j", ஷ: "sh", ஸ: "s", ஹ: "h",
};
// Spoken Tamil voices a stop after a nasal: அம்பது "ambathu", ரெண்டு "rendu", ஐந்து "aindhu", அஞ்சு "anju", ஒன்று "ondru".
const NASALS = new Set(["ங", "ஞ", "ண", "ந", "ம", "ன"]);
const VOICED: Record<string, string> = { க: "g", ச: "j", ட: "d", த: "dh", ப: "b", ற: "dr" };
const SIGNS: Record<string, string> = {
  "ா": "aa", "ி": "i", "ீ": "ee", "ு": "u", "ூ": "oo", "ெ": "e", "ே": "ee", "ை": "ai", "ொ": "o", "ோ": "oo", "ௌ": "au",
};
const VIRAMA = "்";

export function hasTamil(s: string) {
  return /[஀-௿]/.test(s);
}

export function tamilToLatin(input: string): string {
  let out = "";
  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const next = chars[i + 1];
    if (c in CONSONANTS) {
      const afterNasal = i >= 2 && chars[i - 1] === VIRAMA && NASALS.has(chars[i - 2]!);
      out += afterNasal && c in VOICED ? VOICED[c] : CONSONANTS[c];
      if (next === VIRAMA) i++;
      else if (next && next in SIGNS) {
        out += SIGNS[next];
        i++;
      } else out += "a";
    } else if (c in VOWELS) out += VOWELS[c];
    else if (c in SIGNS || c === VIRAMA) continue;
    else out += c;
  }
  return out.toLowerCase();
}
