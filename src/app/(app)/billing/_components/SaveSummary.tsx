"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/form/Sheet";
import { amountReceived, type BillTotals } from "@/lib/billing/totals";
import { billShareText } from "@/lib/billing/share";
import type { BillDraft } from "@/lib/billing/types";
import type { Issue } from "@/lib/billing/validate";
import { formatDate, formatINR, parseAmount, parseQty } from "@/lib/money";
import { saveBillAction, type SaveBillResult } from "../actions";
import { ShareBillButton } from "./ShareBillButton";

const PAYMENT_LABEL = { paid: "Cash · paid", credit: "Credit", partial: "Partial" } as const;

export function SaveSummary({
  open,
  onClose,
  draft,
  totals,
  warnings,
  draftId,
  edit,
  onSaved,
  businessName,
}: {
  businessName: string;
  open: boolean;
  onClose: () => void;
  draft: BillDraft;
  totals: BillTotals;
  warnings: Issue[];
  draftId: string | null;
  edit?: { invoiceId: string; invoiceNo: string; updatedAt: string };
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SaveBillResult | null>(null);
  const received = amountReceived(draft, totals.total);
  const balanceBefore = draft.customer?.balance ?? 0;
  const done = result?.ok ? result : null;

  function confirm() {
    startTransition(async () => {
      const res = await saveBillAction({ draftId, invoiceId: edit?.invoiceId, expectedUpdatedAt: edit?.updatedAt, draft });
      setResult(res);
      if (res.ok) onSaved();
    });
  }

  if (done) {
    return (
      <Sheet open={open} onClose={() => router.push(`/billing/${done.id}`)} title={edit ? "Bill updated · திருத்தப்பட்டது" : "Bill saved · சேமிக்கப்பட்டது"}>
        <div className="flex flex-col items-center gap-1 rounded-card bg-primary-container px-4 py-4 text-center">
          <span className="text-sm text-primary-strong">{done.invoiceNo}</span>
          <span className="text-[28px] font-bold text-primary-strong">{formatINR(done.total)}</span>
          <span className="text-sm text-primary-strong">{draft.customer?.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link href={`/print/invoices/${done.id}`} target="_blank" className={secondary}>
            PDF
          </Link>
          <ShareBillButton
            title={`Bill ${done.invoiceNo}`}
            text={billShareText({
              businessName,
              invoiceNo: done.invoiceNo,
              invoiceDate: draft.invoiceDate,
              customerName: draft.customer?.name ?? "",
              lines: draft.lines.map((l, i) => ({ name: l.name, qty: totals.lines[i]?.qty ?? 0, unit: l.unit, rate: totals.lines[i]?.rate ?? 0 })),
              total: done.total,
              received,
            })}
            className={secondary}
          />
          <Link href={`/print/invoices/${done.id}?print=1`} target="_blank" className={secondary}>
            Print
          </Link>
        </div>
        {edit ? (
          <Link href={`/billing/${done.id}`} className={primary}>
            View bill
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={primary} onClick={() => router.replace(`/billing/new?n=${Date.now()}`)}>
              New bill · புது பில்
            </button>
            <button type="button" className={secondary} onClick={() => router.replace(`/billing/new?customer=${done.customerId}&n=${Date.now()}`)}>
              Same customer
            </button>
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Check and save · சரிபார்த்து சேமி">
      <div className="flex flex-col gap-0.5">
        <span className="text-[17px] font-semibold">
          {draft.customer?.name}
          {draft.customer && !draft.customer.id && <span className="ml-2 text-xs font-semibold text-primary">New customer</span>}
        </span>
        <span className="text-[13px] text-ink-muted">
          {formatDate(draft.invoiceDate)} · {PAYMENT_LABEL[draft.payment]}
          {draft.payment === "partial" ? ` ${formatINR(received)}` : ""}
        </span>
      </div>

      <ul className="flex max-h-48 flex-col overflow-y-auto rounded-field border border-outline">
        {draft.lines.map((l, i) => (
          <li key={l.key} className="flex justify-between gap-3 border-t border-divider px-3 py-2 text-sm first:border-t-0">
            <span>
              {l.name}
              <span className="text-ink-muted">
                {" "}
                · {parseQty(l.qty)} {l.unit ?? ""} × {formatINR(parseAmount(l.rate) ?? 0)}
              </span>
            </span>
            <span className="font-semibold">{formatINR(totals.lines[i]?.gross ?? 0)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 text-[13px] text-ink-muted">
        {totals.discount > 0 && <Row label="Discount" value={`−${formatINR(totals.discount)}`} />}
        <Row label="Taxable" value={formatINR(totals.taxable, { fixed: true })} />
        {totals.interState ? (
          <Row label="IGST" value={formatINR(totals.igst, { fixed: true })} />
        ) : (
          <Row label="CGST + SGST" value={formatINR(totals.cgst + totals.sgst, { fixed: true })} />
        )}
        {totals.roundOff !== 0 && <Row label="Round off" value={formatINR(totals.roundOff, { fixed: true })} />}
        <div className="flex items-baseline justify-between border-t border-outline pt-1.5 text-ink">
          <span className="text-[15px] font-bold">Total · மொத்தம்</span>
          <span className="text-[22px] font-bold">{formatINR(totals.total)}</span>
        </div>
        {draft.customer?.id && !edit && (
          <Row label="Customer balance" value={`${formatINR(balanceBefore)} → ${formatINR(balanceBefore + totals.total - received)}`} />
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">
          {warnings.map((w) => (
            <li key={w.field + w.message}>⚠ {w.message}</li>
          ))}
        </ul>
      )}

      {result && !result.ok && (
        <ul role="alert" className="flex flex-col gap-1 rounded-field border border-voice bg-warning-container px-3 py-2 text-sm text-warning-text">
          {result.errors.map((e) => (
            <li key={e.field + e.message}>{e.message}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" onClick={onClose} className={secondary}>
          Back
        </button>
        <button type="button" onClick={confirm} disabled={pending} className={primary}>
          {pending ? "Saving…" : edit ? "Confirm changes" : "Confirm & save"}
        </button>
      </div>
    </Sheet>
  );
}

const primary = "flex min-h-[52px] items-center justify-center rounded-card bg-primary px-3 text-[15px] font-bold text-white no-underline disabled:opacity-50";
const secondary =
  "flex min-h-[52px] items-center justify-center rounded-card border border-primary-outline bg-surface px-3 text-[15px] font-bold text-primary-strong no-underline";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
