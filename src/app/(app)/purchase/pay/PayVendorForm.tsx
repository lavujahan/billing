"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { VendorHit } from "@/app/api/search/vendors/route";
import { BackIcon } from "@/components/icons";
import { ChoicePills } from "@/components/form/ChoicePills";
import { inputClass } from "@/components/form/Field";
import { fetchJson, SearchPicker } from "@/components/form/SearchPicker";
import { formatDate, formatINR, parseAmount } from "@/lib/money";
import type { PaymentMode } from "@/lib/purchase/types";
import { payVendorAction } from "../actions";

type Bill = { id: string; billNumber: string | null; billDate: string; total: number; balance: number };

const toPaise = (n: number) => Math.round(n * 100);

// Oldest bills first; whatever is left is an advance.
function autoAllocate(amount: number, bills: Bill[]) {
  let left = toPaise(amount);
  return Object.fromEntries(
    bills.map((b) => {
      const take = Math.max(0, Math.min(left, toPaise(b.balance)));
      left -= take;
      return [b.id, take ? String(take / 100) : ""];
    }),
  );
}

export function PayVendorForm({ vendor, bills, today }: { vendor: { id: string; name: string; balance: number } | null; bills: Bill[]; today: string }) {
  const router = useRouter();
  const due = bills.reduce((s, b) => s + b.balance, 0);
  const [amount, setAmount] = useState(due > 0 ? String(Math.round(due * 100) / 100) : "");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const amt = parseAmount(amount) ?? 0;
  const alloc = useMemo(() => manual ?? autoAllocate(amt, bills), [manual, amt, bills]);
  const applied = Object.values(alloc).reduce((s, v) => s + toPaise(parseAmount(v) ?? 0), 0) / 100;
  const advance = Math.round((amt - applied) * 100) / 100;
  const overBill = bills.find((b) => (parseAmount(alloc[b.id] ?? "") ?? 0) > b.balance + 0.005);

  function save() {
    setError(null);
    if (!vendor) return setError("Choose a vendor.");
    if (amt <= 0) return setError("Enter the amount paid.");
    if (advance < 0) return setError("More is applied to bills than the amount paid.");
    if (overBill) return setError(`More than what's due on ${overBill.billNumber ?? "a bill"}.`);
    const allocations = [
      ...bills.map((b) => ({ purchaseId: b.id as string | null, amount: parseAmount(alloc[b.id] ?? "") ?? 0 })).filter((a) => a.amount > 0),
      ...(advance > 0 ? [{ purchaseId: null, amount: advance }] : []),
    ];
    startTransition(async () => {
      const res = await payVendorAction({ vendorId: vendor.id, amount: amt, mode, reference, paymentDate: date, notes, allocations });
      if (!res.ok) return setError(res.message);
      setDone(true);
    });
  }

  if (done && vendor) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 py-6">
        <div className="flex flex-col items-center gap-1 rounded-card bg-primary-container px-4 py-6 text-center text-primary-strong">
          <span className="text-sm">Paid {vendor.name}</span>
          <span className="text-[28px] font-bold">{formatINR(amt)}</span>
          <span className="text-sm">
            {mode.toUpperCase()} · {formatDate(date)}
            {advance > 0 ? ` · ${formatINR(advance)} as advance` : ""}
          </span>
        </div>
        <Link href="/purchase?filter=unpaid" className="flex min-h-[52px] items-center justify-center rounded-card bg-primary font-bold text-white no-underline">
          Back to purchases
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col sm:min-h-0">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-outline bg-surface py-3 pr-3 pl-2 sm:static">
        <Link href="/purchase" aria-label="Back" className="flex h-11 w-11 items-center justify-center text-ink">
          <BackIcon />
        </Link>
        <h1 className="text-lg font-bold">Pay vendor · பணம் கொடு</h1>
      </header>

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 py-3.5 pb-32">
        <section className="rounded-card border border-outline bg-surface py-3 pr-3 pl-4">
          {vendor ? (
            <div className="flex items-center gap-3">
              <div className="flex grow flex-col">
                <span className="text-xs text-ink-muted">Vendor</span>
                <span className="text-[17px] font-semibold">{vendor.name}</span>
                <span className={`text-xs ${vendor.balance > 0 ? "text-warning-text" : "text-ink-muted"}`}>You owe {formatINR(Math.max(vendor.balance, 0))}</span>
              </div>
              <Link href="/purchase/pay" className="min-h-11 rounded-full border border-primary-outline px-3 py-2.5 text-sm font-semibold text-primary">
                Change
              </Link>
            </div>
          ) : (
            <SearchPicker<VendorHit>
              label="Vendor · விற்பனையாளர்"
              placeholder="Search vendor"
              autoFocus
              search={(q, signal) => fetchJson<VendorHit[]>(`/api/search/vendors?q=${encodeURIComponent(q)}`, signal)}
              render={(v) => ({
                key: v.id,
                value: v,
                label: (
                  <span className="flex w-full justify-between gap-2">
                    <span className="font-semibold">{v.name}</span>
                    {v.balance > 0 && <span className="text-xs text-warning-text">owe {formatINR(v.balance)}</span>}
                  </span>
                ),
              })}
              onPick={(v) => router.replace(`/purchase/pay?vendor=${v.id}`)}
            />
          )}
        </section>

        {vendor && (
          <>
            <section className="flex flex-col gap-3 rounded-card border border-outline bg-surface px-4 py-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Amount paid · தொகை *</span>
                <input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setManual(null); }} className={`${inputClass} text-lg font-bold`} />
              </label>
              <ChoicePills<PaymentMode>
                label="Paid by"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "upi", label: "UPI" },
                  { value: "bank", label: "Bank" },
                  { value: "cheque", label: "Cheque" },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-muted">{mode === "cheque" ? "Cheque no" : "Reference / UTR"}</span>
                  <input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-muted">Date</span>
                  <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={`${inputClass} px-2`} />
                </label>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold">Apply to bills · பில்களுக்கு</h2>
                {manual && (
                  <button type="button" onClick={() => setManual(null)} className="text-xs font-semibold text-primary">
                    Oldest first again
                  </button>
                )}
              </div>
              {bills.length === 0 ? (
                <p className="rounded-card border border-outline bg-surface px-4 py-3 text-sm text-ink-muted">No unpaid bills — the whole amount is saved as an advance.</p>
              ) : (
                <div className="overflow-hidden rounded-card border border-outline bg-surface">
                  {bills.map((b, i) => (
                    <div key={b.id} className={`flex items-center gap-3 px-4 py-2.5 ${i ? "border-t border-divider" : ""}`}>
                      <span className="flex grow flex-col">
                        <span className="text-sm font-semibold">{b.billNumber ? `Bill ${b.billNumber}` : "No bill no."}</span>
                        <span className="text-xs text-ink-muted">
                          {formatDate(b.billDate)} · due {formatINR(b.balance)}
                        </span>
                      </span>
                      <input
                        aria-label={`Amount for ${b.billNumber ?? formatDate(b.billDate)}`}
                        inputMode="decimal"
                        value={alloc[b.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => setManual({ ...alloc, [b.id]: e.target.value })}
                        className={`${inputClass} w-28 text-right ${overBill?.id === b.id ? "border-voice bg-warning-container" : ""}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between px-1 text-sm text-ink-muted">
                <span>Applied {formatINR(applied)}</span>
                <span className={advance < 0 ? "text-danger" : ""}>{advance >= 0 ? `Advance ${formatINR(advance)}` : `Over by ${formatINR(-advance)}`}</span>
              </div>
            </section>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Notes</span>
              <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </label>
            {error && (
              <p role="alert" className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {vendor && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-outline bg-surface px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:sticky sm:pb-3">
          <button type="button" onClick={save} disabled={pending} className="mx-auto flex min-h-[52px] w-full max-w-[720px] items-center justify-center rounded-card bg-primary text-base font-bold text-white disabled:opacity-50">
            {pending ? "Saving…" : `Save payment ${amt ? formatINR(amt) : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
