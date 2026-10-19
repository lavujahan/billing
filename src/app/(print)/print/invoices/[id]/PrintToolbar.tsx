"use client";

import Link from "next/link";
import { useEffect } from "react";

export function PrintToolbar({ id, size, autoPrint }: { id: string; size: "a4" | "thermal"; autoPrint: boolean }) {
  useEffect(() => {
    if (autoPrint) setTimeout(() => window.print(), 300);
  }, [autoPrint]);

  const pill = (active: boolean) =>
    `flex min-h-11 items-center rounded-full px-4 text-sm font-semibold no-underline ${
      active ? "border-[1.5px] border-primary bg-primary-container text-primary-strong" : "border border-chip-border text-ink"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-outline bg-background px-4 py-3 print:hidden">
      <Link href={`/billing/${id}`} className="min-h-11 px-2 py-3 text-sm font-semibold text-primary">
        ← Back
      </Link>
      <span className="grow" />
      <Link href={`/print/invoices/${id}`} className={pill(size === "a4")}>
        A4
      </Link>
      <Link href={`/print/invoices/${id}?size=thermal`} className={pill(size === "thermal")}>
        Thermal 80mm
      </Link>
      <button type="button" onClick={() => window.print()} className="min-h-11 rounded-card bg-primary px-4 text-sm font-bold text-white">
        Print / Save PDF
      </button>
    </div>
  );
}
