"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loginAction, type LoginState } from "./actions";

const LABELS = {
  en: {
    mobile: "Mobile number",
    code: "5-digit code",
    submit: "Log in",
    busy: "Checking…",
    errors: {
      format: "Enter a 10-digit mobile number and all 5 digits of the code.",
      invalid: "Mobile number or code is wrong.",
      locked: "Too many wrong tries. Try again in 15 minutes.",
      server: "Couldn't log in right now. Please try again.",
    },
  },
  ta: {
    mobile: "மொபைல் எண்",
    code: "5 இலக்க குறியீடு",
    submit: "உள்நுழை",
    busy: "சரிபார்க்கிறது…",
    errors: {
      format: "10 இலக்க மொபைல் எண்ணும் 5 இலக்க குறியீடும் தேவை.",
      invalid: "மொபைல் எண் அல்லது குறியீடு தவறு.",
      locked: "பல முறை தவறு. 15 நிமிடம் கழித்து முயற்சிக்கவும்.",
      server: "இப்போது உள்நுழைய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    },
  },
} as const;

export function LoginForm() {
  const [lang, setLang] = useState<"ta" | "en">("ta");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [digits, setDigits] = useState(["", "", "", "", ""]);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const t = LABELS[lang];

  function setDigit(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 5).split("");
      setDigits([0, 1, 2, 3, 4].map((i) => next[i] ?? ""));
      boxes.current[Math.min(next.length, 4)]?.focus();
      return;
    }
    setDigits((d) => d.map((v, i) => (i === index ? clean : v)));
    if (clean && index < 4) boxes.current[index + 1]?.focus();
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-card border border-outline bg-surface p-4">
      <div className="flex justify-end gap-1" role="group" aria-label="Language">
        {(["ta", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
              lang === l ? "border-[1.5px] border-primary bg-primary-container text-primary-strong" : "border border-chip-border"
            }`}
          >
            {l === "ta" ? "தமிழ்" : "English"}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-ink-muted">{t.mobile}</span>
        <div className="flex min-h-12 items-center rounded-field border border-outline focus-within:border-2 focus-within:border-primary">
          <span className="pl-3 text-ink-muted">+91</span>
          <input
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            defaultValue={state.mobile}
            placeholder="98765 43210"
            className="w-full bg-transparent px-2 py-3 text-[17px] font-semibold outline-none"
          />
        </div>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs text-ink-muted">{t.code}</legend>
        <div className="grid grid-cols-5 gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
              }}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`${t.code} ${i + 1}`}
              className="h-14 rounded-field border border-outline text-center text-[22px] font-bold outline-none focus:border-2 focus:border-primary"
            />
          ))}
        </div>
        <input type="hidden" name="code" value={digits.join("")} />
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">
          {t.errors[state.error]}
        </p>
      )}

      <Button type="submit" disabled={pending || digits.join("").length !== 5} className="min-h-[52px] text-base">
        {pending ? t.busy : t.submit}
      </Button>
    </form>
  );
}
