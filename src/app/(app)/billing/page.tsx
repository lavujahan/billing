import Link from "next/link";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { listInvoices, listOpenDrafts } from "@/lib/billing/server";
import { formatDate, formatINR, formatTime, todayISO } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const STATUS = {
  paid: { label: "Paid", className: "text-primary-strong" },
  credit: { label: "Credit", className: "text-warning-text" },
  partial: { label: "Partial", className: "text-warning-text" },
} as const;

export default async function BillingListPage({ searchParams }: PageProps<"/billing">) {
  await getCurrentUser();
  const sp = await searchParams;
  const today = todayISO();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";

  const supabase = await createClient();
  const [bills, drafts] = await Promise.all([listInvoices(supabase, { date, q }), listOpenDrafts(supabase, "billing")]);
  const live = bills.filter((b) => b.status === "confirmed");
  const dayTotal = live.reduce((s, b) => s + b.total, 0);
  const heading = q ? `Search: “${q}”` : `${date === today ? "Today, " : ""}${formatDate(date, { day: "numeric", month: "short" })}`;

  return (
    <Page>
      <div className="flex flex-col">
        <h1 className="text-xl font-bold">Billing · பில்</h1>
        <p className="text-[13px] text-ink-muted">
          {heading} · {live.length} bills · {formatINR(dayTotal)}
        </p>
      </div>

      <form className="grid grid-cols-[1fr_auto] gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search customer or bill no."
          aria-label="Search bills"
          className="min-h-11 rounded-field border border-outline bg-surface px-3 outline-none focus:border-2 focus:border-primary"
        />
        <input
          type="date"
          name="date"
          defaultValue={date}
          max={today}
          aria-label="Bill date"
          className="min-h-11 rounded-field border border-outline bg-surface px-2 outline-none focus:border-2 focus:border-primary"
        />
        <button className="col-span-2 min-h-11 rounded-full border border-primary-outline bg-surface text-sm font-semibold text-primary">
          Show bills
        </button>
      </form>

      {drafts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-bold text-ink-muted">Drafts · சேமிக்காதவை ({drafts.length})</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/billing/new?draft=${d.id}`}
                className="flex min-w-40 shrink-0 flex-col items-start gap-0.5 rounded-xl border border-outline bg-surface px-3.5 py-2.5 text-ink no-underline"
              >
                <span className="max-w-48 truncate text-sm font-semibold">{d.title || "No customer yet"}</span>
                <span className="text-xs text-ink-muted">
                  {d.amount ? formatINR(d.amount) : "₹0"} · not saved · {formatTime(d.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {bills.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-ink-muted">
          {q ? "No bills match · பொருத்தம் இல்லை" : "இந்த நாளில் bill இல்லை · No bills on this day"}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {bills.map((b, i) => (
            <Link
              key={b.id}
              href={`/billing/${b.id}`}
              className={`flex min-h-16 items-center gap-3 px-4 text-ink no-underline ${i ? "border-t border-divider" : ""}`}
            >
              <span className="flex min-w-0 grow flex-col">
                <span className={`truncate text-[15px] font-semibold ${b.status === "cancelled" ? "line-through opacity-60" : ""}`}>{b.customerName}</span>
                <span className="text-xs text-ink-muted">
                  {b.invoiceNo} · {q ? formatDate(b.invoiceDate, { day: "numeric", month: "short" }) : formatTime(b.createdAt)}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className={`text-[15px] font-bold ${b.status === "cancelled" ? "line-through opacity-60" : ""}`}>{formatINR(b.total)}</span>
                {b.status === "cancelled" ? (
                  <span className="text-xs text-danger">Cancelled</span>
                ) : (
                  <span className={`text-xs ${STATUS[b.paymentStatus].className}`}>{STATUS[b.paymentStatus].label}</span>
                )}
              </span>
            </Link>
          ))}
        </Card>
      )}

      <div className="h-16 sm:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-[74px] z-10 px-4 sm:static sm:px-0">
        <Link
          href="/billing/new"
          className="mx-auto flex min-h-[52px] max-w-[720px] items-center justify-center rounded-card bg-primary text-base font-bold text-white no-underline shadow-sm"
        >
          + New bill · புது பில்
        </Link>
      </div>
    </Page>
  );
}
