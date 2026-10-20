"use client";

import type { ReactNode } from "react";

// "Did you mean…" list shown under a field when voice found more than one close match.
export function VoiceChooser<T extends { id: string | null; name: string }>({
  title,
  options,
  detail,
  onPick,
  extra,
  onDismiss,
}: {
  title: string;
  options: T[];
  detail?: (o: T) => ReactNode;
  onPick: (o: T) => void;
  extra?: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-1.5 rounded-card border-2 border-primary bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <button type="button" onClick={onDismiss} aria-label="Close" className="flex h-9 w-9 items-center justify-center text-lg text-ink-muted">
          ×
        </button>
      </div>
      {options.map((o, i) => (
        <button
          key={o.id ?? `opt-${i}`}
          type="button"
          onClick={() => onPick(o)}
          className={`flex min-h-12 items-center justify-between gap-2 rounded-field px-3 text-left ${
            i === 0 ? "border-[1.5px] border-primary bg-primary-container" : "border border-outline"
          }`}
        >
          <span className="font-semibold">{o.name}</span>
          {detail && <span className="text-xs text-ink-muted">{detail(o)}</span>}
        </button>
      ))}
      {extra}
    </div>
  );
}
