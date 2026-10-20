"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/form/Sheet";

// Cancel keeps the record (and its number) but stops it counting anywhere. Never a hard delete.
export function CancelRecordButton({
  id,
  title,
  explanation,
  buttonLabel,
  action,
}: {
  id: string;
  title: string;
  explanation: string;
  buttonLabel: string;
  action: (id: string, reason: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const res = await action(id, reason);
      if (!res.ok) return setError(res.error ?? "Couldn't cancel.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] items-center justify-center rounded-card border border-chip-border bg-surface px-3 text-[15px] font-bold text-danger"
      >
        {buttonLabel}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <p className="text-sm text-ink-muted">{explanation}</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Reason · காரணம்</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-11 rounded-field border border-outline px-3 outline-none focus:border-2 focus:border-primary" />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setOpen(false)} className="min-h-[52px] rounded-card border border-primary-outline font-bold text-primary-strong">
            Keep it
          </button>
          <button type="button" onClick={cancel} disabled={pending} className="min-h-[52px] rounded-card bg-danger font-bold text-white disabled:opacity-50">
            {pending ? "Cancelling…" : buttonLabel}
          </button>
        </div>
      </Sheet>
    </>
  );
}
