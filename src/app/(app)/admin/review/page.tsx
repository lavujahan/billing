import Link from "next/link";
import { Page, PageTitle } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { markReviewedAction, mergeCustomerAction } from "./actions";

type Similar = { id: string; name: string; phone: string | null; balance: number; score: number };

export default async function CustomerReviewPage() {
  await getCurrentUser();
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("customers")
    .select("id, name, created_at, users:created_by(full_name)")
    .eq("needs_review", true)
    .eq("active", true)
    .order("created_at")
    .limit(50);

  const rows = await Promise.all(
    (pending ?? []).map(async (c) => {
      const { data } = await supabase.rpc("search_customers", { q: c.name.replace(/[%_\\]/g, ""), lim: 5 });
      const similar = ((data ?? []) as Similar[]).filter((s) => s.id !== c.id && Number(s.score) >= 0.35).slice(0, 3);
      return { ...c, similar };
    }),
  );

  return (
    <Page wide>
      <PageTitle title="Customer review · சரிபார்ப்பு" subtitle="Customers created from bills. Merge duplicates, or open one to add GSTIN and address." />
      {rows.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-ink-muted">Nothing to review · எல்லாம் சரி</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[17px] font-semibold">{c.name}</span>
                <span className="text-xs text-ink-muted">
                  added by {(c.users as unknown as { full_name: string } | null)?.full_name ?? "someone"} ·{" "}
                  {new Date(c.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}
                </span>
              </div>
              {c.similar.length > 0 && (
                <div className="flex flex-col gap-2 rounded-field bg-warning-container px-3 py-2">
                  <span className="text-xs font-semibold text-warning-text">Possible duplicate of:</span>
                  {c.similar.map((s) => (
                    <form key={s.id} action={mergeCustomerAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="from" value={c.id} />
                      <input type="hidden" name="into" value={s.id} />
                      <span className="grow text-sm">
                        <b>{s.name}</b>
                        {s.phone ? ` · ${s.phone}` : ""}
                        {Number(s.balance) > 0 ? ` · ${formatINR(Number(s.balance))} due` : ""}
                      </span>
                      <button className="min-h-11 rounded-full border border-primary bg-surface px-4 text-sm font-semibold text-primary-strong">
                        Merge into {s.name}
                      </button>
                    </form>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/parties?edit=${c.id}`} className="flex min-h-11 items-center rounded-full border border-primary-outline px-4 text-sm font-semibold text-primary">
                  Add GSTIN / address
                </Link>
                <form action={markReviewedAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-white">Looks fine ✓</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
