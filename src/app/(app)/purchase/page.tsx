import Link from "next/link";
import { CameraIcon } from "@/components/icons";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { listOpenDrafts } from "@/lib/billing/server";
import { formatDate, formatINR, formatTime, todayISO } from "@/lib/money";
import { listPurchases } from "@/lib/purchase/server";
import { createClient } from "@/lib/supabase/server";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid · பாக்கி" },
  { value: "nophoto", label: "No photo" },
] as const;

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default async function PurchaseListPage({ searchParams }: PageProps<"/purchase">) {
  await getCurrentUser();
  const sp = await searchParams;
  const today = todayISO();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const filter = FILTERS.find((f) => f.value === sp.filter)?.value ?? "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const { from, to } = monthRange(month);

  const supabase = await createClient();
  const [rows, drafts] = await Promise.all([listPurchases(supabase, { from, to, filter, q }), listOpenDrafts(supabase, "purchase")]);
  const live = rows.filter((r) => r.status === "confirmed");
  const monthTotal = live.reduce((s, r) => s + r.total, 0);
  const unpaid = live.reduce((s, r) => s + r.balance, 0);
  const monthLabel = formatDate(`${month}-01`, { month: "long", year: "numeric" });
  const href = (patch: Record<string, string>) => `/purchase?${new URLSearchParams({ month, filter, ...(q ? { q } : {}), ...patch })}`;

  return (
    <Page>
      <div className="flex flex-col">
        <h1 className="text-xl font-bold">Purchase · கொள்முதல்</h1>
        <p className="text-[13px] text-ink-muted">
          {monthLabel} · {live.length} bills · {formatINR(monthTotal)}
          {unpaid > 0 && <span className="text-warning-text"> · {formatINR(unpaid)} unpaid</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/purchase/new?scan=1" className="flex min-h-14 items-center justify-center gap-2 rounded-card bg-primary px-3 text-[15px] font-bold text-white no-underline">
          <CameraIcon /> Scan bill
        </Link>
        <Link href="/purchase/new" className="flex min-h-14 items-center justify-center rounded-card border border-primary-outline bg-surface px-3 text-[15px] font-bold text-primary-strong no-underline">
          + Type or speak
        </Link>
      </div>
      <Link href="/purchase/pay" className="flex min-h-11 items-center justify-center rounded-full border border-primary-outline bg-surface text-sm font-semibold text-primary no-underline">
        Pay a vendor · பணம் கொடு
      </Link>

      <form className="grid grid-cols-[1fr_auto] gap-2" role="search">
        <input type="hidden" name="filter" value={filter} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search vendor or bill no."
          aria-label="Search purchases"
          className="min-h-11 rounded-field border border-outline bg-surface px-3 outline-none focus:border-2 focus:border-primary"
        />
        <input
          type="month"
          name="month"
          defaultValue={month}
          max={today.slice(0, 7)}
          aria-label="Month"
          className="min-h-11 rounded-field border border-outline bg-surface px-2 outline-none focus:border-2 focus:border-primary"
        />
        <button className="col-span-2 min-h-11 rounded-full border border-primary-outline bg-surface text-sm font-semibold text-primary">Show</button>
      </form>

      <div className="flex gap-2" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ filter: f.value })}
            aria-current={f.value === filter ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full px-4 text-sm no-underline ${
              f.value === filter ? "border-[1.5px] border-primary bg-primary-container font-bold text-primary-strong" : "border border-chip-border text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {drafts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-bold text-ink-muted">Drafts · சேமிக்காதவை ({drafts.length})</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {drafts.map((d) => (
              <Link key={d.id} href={`/purchase/new?draft=${d.id}`} className="flex min-w-40 shrink-0 flex-col items-start gap-0.5 rounded-xl border border-outline bg-surface px-3.5 py-2.5 text-ink no-underline">
                <span className="max-w-48 truncate text-sm font-semibold">{d.title || "No vendor yet"}</span>
                <span className="text-xs text-ink-muted">
                  {d.amount ? formatINR(d.amount) : "₹0"} · not saved · {formatTime(d.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-ink-muted">இந்த மாதத்தில் entry இல்லை · No purchases here</Card>
      ) : (
        <Card className="overflow-hidden">
          {rows.map((r, i) => {
            const cancelled = r.status === "cancelled";
            return (
              <Link key={r.id} href={`/purchase/${r.id}`} className={`flex min-h-16 items-center gap-3 px-4 text-ink no-underline ${i ? "border-t border-divider" : ""}`}>
                <span
                  className={`flex h-10 w-8 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${r.hasFile ? "border-primary-outline bg-primary-container text-primary-strong" : "border-dashed border-chip-border text-ink-muted"}`}
                  aria-label={r.hasFile ? "Bill photo attached" : "No bill photo"}
                >
                  {r.hasFile ? "BILL" : "—"}
                </span>
                <span className="flex min-w-0 grow flex-col">
                  <span className={`truncate text-[15px] font-semibold ${cancelled ? "line-through opacity-60" : ""}`}>{r.vendorName}</span>
                  <span className="text-xs text-ink-muted">
                    {r.billNumber ? `${r.billNumber} · ` : ""}
                    {formatDate(r.billDate, { day: "numeric", month: "short" })}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className={`text-[15px] font-bold ${cancelled ? "line-through opacity-60" : ""}`}>{formatINR(r.total)}</span>
                  {cancelled ? (
                    <span className="text-xs text-danger">Cancelled</span>
                  ) : r.balance > 0.005 ? (
                    <span className="text-xs text-warning-text">Due {formatINR(r.balance)}</span>
                  ) : (
                    <span className="text-xs text-primary-strong">Paid</span>
                  )}
                </span>
              </Link>
            );
          })}
        </Card>
      )}
    </Page>
  );
}
