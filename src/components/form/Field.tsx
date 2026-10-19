import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "min-h-11 w-full rounded-field border border-outline bg-surface px-3 text-[15px] outline-none focus:border-2 focus:border-primary";

export function Field({ label, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-muted">{label}</span>
      <input className={inputClass} {...input} />
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-field px-3 py-2 text-sm ${state.ok ? "bg-primary-container text-primary-strong" : "bg-warning-container text-warning-text"}`}
    >
      {state.message}
    </p>
  );
}
