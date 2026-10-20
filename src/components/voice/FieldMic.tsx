"use client";

import { useState } from "react";
import type { FieldKind } from "@/lib/ai/transcribe";
import { postAudio, useRecorder } from "./useRecorder";

export function MicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
    </svg>
  );
}

// Field voice: tap, say one value, it stops on silence. The transcript goes to `onText`,
// where the form parses it with code (numbers, units, dates, name search). No AI model call.
export function FieldMic({
  kind,
  label,
  onText,
  onListening,
  module = "billing",
}: {
  kind: Exclude<FieldKind, "bill">;
  label: string;
  module?: string;
  onText: (text: string) => void | string | Promise<void | string>;
  onListening?: (listening: boolean) => void;
}) {
  const { state, level, start, stop } = useRecorder();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const listening = state === "recording";

  async function toggle() {
    if (listening) return stop();
    setMessage(null);
    onListening?.(true);
    const rec = await start({ silenceStopMs: 1500, maxMs: 10_000 });
    onListening?.(false);
    if (rec === "unsupported") return;
    if (rec === "denied") return setMessage("Microphone blocked — allow it in browser settings.");
    if (!rec) return setMessage("புரியல, மறுபடியும் சொல்லுங்க");
    setBusy(true);
    const res = await postAudio<{ text?: string }>("/api/voice/transcribe", rec, { kind, module });
    setBusy(false);
    if (!res.text) return setMessage(res.message ?? "புரியல, மறுபடியும் சொல்லுங்க");
    const problem = await onText(res.text);
    if (problem) setMessage(problem);
  }

  if (state === "unsupported") return null;

  return (
    <span className="relative inline-flex shrink-0 flex-col items-center">
      <button
        type="button"
        aria-label={listening ? `Stop listening (${label})` : `Speak ${label}`}
        aria-pressed={listening}
        onClick={toggle}
        disabled={busy}
        className={`flex h-11 w-11 items-center justify-center rounded-full border text-primary transition ${
          listening ? "border-2 border-primary bg-primary text-white" : "border-primary-outline bg-primary-container"
        } disabled:opacity-60`}
        style={listening ? { boxShadow: `0 0 0 ${4 + level * 10}px color-mix(in srgb, var(--color-primary) 18%, transparent)` } : undefined}
      >
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" /> : <MicIcon />}
      </button>
      {message && (
        <span role="status" className="absolute top-full right-0 z-20 mt-1 w-52 rounded-field bg-warning-container px-2 py-1 text-xs text-warning-text shadow">
          {message}
        </span>
      )}
    </span>
  );
}
