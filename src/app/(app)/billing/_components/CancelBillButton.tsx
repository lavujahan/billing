"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/form/Sheet";
import { cancelBillAction } from "../actions";

export function CancelBillButton({ invoiceId, invoiceNo }: { invoiceId: string; invoiceNo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const res = await cancelBillAction(invoiceId, reason);
      if (!res.ok) {
        setError(res.error ?? "Couldn't cancel.");
        return;
      }
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
        Cancel bill
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Cancel ${invoiceNo}?`}>
        <p className="text-sm text-ink-muted">
          The bill keeps its number and stays in the list as Cancelled. It no longer counts in sales or the customer&apos;s balance.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Reason · காரணம்</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className="min-h-11 rounded-field border border-outline px-3 outline-none focus:border-2 focus:border-primary"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setOpen(false)} className="min-h-[52px] rounded-card border border-primary-outline font-bold text-primary-strong">
            Keep bill
          </button>
          <button type="button" onClick={cancel} disabled={pending} className="min-h-[52px] rounded-card bg-danger font-bold text-white disabled:opacity-50">
            {pending ? "Cancelling…" : "Cancel bill"}
          </button>
        </div>
      </Sheet>
    </>
  );
}
