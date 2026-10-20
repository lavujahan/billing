"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/form/Sheet";
import type { Issue } from "@/lib/billing/validate";
import { formatDate, formatINR } from "@/lib/money";
import { amountPaidNow, type PurchaseTotals } from "@/lib/purchase/totals";
import type { PurchaseDraft } from "@/lib/purchase/types";
import { savePurchaseAction, type SavePurchaseResult } from "../actions";

const PAYMENT = { paid: "Paid", credit: "Credit", partial: "Partial" } as const;
const primary = "flex min-h-[52px] items-center justify-center rounded-card bg-primary px-3 text-[15px] font-bold text-white no-underline disabled:opacity-50";
const secondary = "flex min-h-[52px] items-center justify-center rounded-card border border-primary-outline bg-surface px-3 text-[15px] font-bold text-primary-strong no-underline";

export function PurchaseSummary({
  open,
  onClose,
  draft,
  totals,
  warnings,
  draftId,
  edit,
  thumbnail,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draft: PurchaseDraft;
  totals: PurchaseTotals;
  warnings: Issue[];
  draftId: string | null;
  edit?: { purchaseId: string; label: string; updatedAt: string };
  thumbnail: string | null;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SavePurchaseResult | null>(null);
  const paid = amountPaidNow(draft, totals.total);

  function save(allowDuplicate = false) {
    startTransition(async () => {
      const res = await savePurchaseAction({ draftId, purchaseId: edit?.purchaseId, expectedUpdatedAt: edit?.updatedAt, draft, allowDuplicate });
      setResult(res);
      if (res.ok) onSaved();
    });
  }

  if (result?.ok) {
    return (
      <Sheet open={open} onClose={() => router.push(`/purchase/${result.id}`)} title={edit ? "Purchase updated" : "Purchase saved · சேமிக்கப்பட்டது"}>
        <div className="flex flex-col items-center gap-1 rounded-card bg-primary-container px-4 py-4 text-center text-primary-strong">
          <span className="text-sm">{draft.vendor?.name}</span>
          <span className="text-[28px] font-bold">{formatINR(result.total)}</span>
          <span className="text-sm">{draft.billNumber ? `Bill ${draft.billNumber} · ` : ""}{formatDate(draft.billDate)}</span>
        </div>
        {edit ? (
          <Link href={`/purchase/${result.id}`} className={primary}>
            View purchase
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={primary} onClick={() => router.replace(`/purchase/new?n=${Date.now()}`)}>
              Scan next bill
            </button>
            <Link href={`/purchase/${result.id}`} className={secondary}>
              View purchase
            </Link>
          </div>
        )}
      </Sheet>
    );
  }

  const duplicate = result && !result.ok ? result.duplicate : undefined;

  return (
    <Sheet open={open} onClose={onClose} title="Check and save · சரிபார்த்து சேமி">
      <div className="flex gap-3">
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img src={thumbnail} alt="Bill" className="h-24 w-20 shrink-0 rounded-field border border-outline object-cover" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-semibold">{draft.vendor?.name}</span>
          <span className="text-[13px] text-ink-muted">
            {draft.billNumber ? `Bill ${draft.billNumber} · ` : "No bill number · "}
            {formatDate(draft.billDate)}
          </span>
          <span className="text-[13px] text-ink-muted">
            {PAYMENT[draft.payment]}
            {draft.payment === "partial" ? ` ${formatINR(paid)}` : ""}
            {draft.payment !== "credit" && draft.paymentMode ? ` · ${draft.paymentMode.toUpperCase()}` : ""}
            {draft.itemsMode === "items" ? ` · ${draft.lines.length} items` : " · total only"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-[13px] text-ink-muted">
        <Row label="Taxable" value={formatINR(totals.taxable, { fixed: true })} />
        {totals.igst > 0 && <Row label="IGST" value={formatINR(totals.igst, { fixed: true })} />}
        {totals.cgst + totals.sgst > 0 && <Row label="CGST + SGST" value={formatINR(totals.cgst + totals.sgst, { fixed: true })} />}
        {totals.roundOff !== 0 && <Row label="Round off" value={formatINR(totals.roundOff, { fixed: true })} />}
        <div className="flex items-baseline justify-between border-t border-outline pt-1.5 text-ink">
          <span className="text-[15px] font-bold">Total · மொத்தம்</span>
          <span className="text-[22px] font-bold">{formatINR(totals.total)}</span>
        </div>
        {draft.vendor && !edit && (
          <Row label="You owe this vendor" value={`${formatINR(draft.vendor.balance)} → ${formatINR(draft.vendor.balance + totals.total - paid)}`} />
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">
          {warnings.map((w) => (
            <li key={w.field + w.message}>⚠ {w.message}</li>
          ))}
        </ul>
      )}

      {result && !result.ok && (
        <div role="alert" className="flex flex-col gap-2 rounded-field border border-voice bg-warning-container px-3 py-2 text-sm text-warning-text">
          {result.errors.map((e) => (
            <span key={e.field + e.message}>{e.message}</span>
          ))}
          {duplicate && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/purchase/${duplicate.id}`} className="font-semibold underline">
                Open the saved one
              </Link>
              <button type="button" onClick={() => save(true)} disabled={pending} className="font-semibold text-danger underline">
                It&apos;s a different bill — save anyway
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" onClick={onClose} className={secondary}>
          Back
        </button>
        <button type="button" onClick={() => save(false)} disabled={pending} className={primary}>
          {pending ? "Saving…" : edit ? "Confirm changes" : "Confirm & save"}
        </button>
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
