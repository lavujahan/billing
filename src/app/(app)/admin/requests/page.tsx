import Link from "next/link";
import { inputClass } from "@/components/form/Field";
import { Page, PageTitle } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { mergeRequestAction, rejectRequestAction } from "./actions";

export default async function MasterRequestsPage() {
  await getCurrentUser();
  const supabase = await createClient();
  const [{ data: requests }, { data: products }] = await Promise.all([
    supabase
      .from("master_requests")
      .select("id, kind, requested_name, details, draft_id, created_at, users:created_by(full_name)")
      .eq("status", "open")
      .order("created_at"),
    supabase.from("products").select("id, name, name_ta").eq("active", true).order("name").limit(1000),
  ]);

  return (
    <Page wide>
      <PageTitle title="Master requests · கோரிக்கைகள்" subtitle="Items staff asked for while billing. Once handled, their waiting bill can continue." />
      {(requests ?? []).length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-ink-muted">No requests waiting · எதுவும் இல்லை</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {(requests ?? []).map((r) => {
            const d = (r.details ?? {}) as { qty?: number | null; rate?: number | null };
            return (
              <Card key={r.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[17px] font-semibold">“{r.requested_name}”</span>
                  <span className="text-xs text-ink-muted">
                    {(r.users as unknown as { full_name: string } | null)?.full_name ?? "Someone"} ·{" "}
                    {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                    {d.qty ? ` · qty ${d.qty}` : ""}
                    {d.rate ? ` · ${formatINR(d.rate)}` : ""}
                    {r.draft_id ? " · a bill is waiting" : ""}
                  </span>
                </div>
                <div className="grid gap-2 lg:grid-cols-[auto_1fr_auto]">
                  <Link
                    href={`/admin/items?request=${r.id}&name=${encodeURIComponent(r.requested_name)}${d.rate ? `&rate=${d.rate}` : ""}`}
                    className="flex min-h-11 items-center justify-center rounded-card bg-primary px-4 text-sm font-bold text-white no-underline"
                  >
                    Add as new item
                  </Link>
                  <form action={mergeRequestAction} className="flex gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="productId" required aria-label="Existing item" className={inputClass} defaultValue="">
                      <option value="" disabled>
                        Same as an existing item…
                      </option>
                      {(products ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.name_ta ? ` · ${p.name_ta}` : ""}
                        </option>
                      ))}
                    </select>
                    <button className="min-h-11 shrink-0 rounded-card border border-primary-outline px-4 text-sm font-bold text-primary-strong">Merge</button>
                  </form>
                  <form action={rejectRequestAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="min-h-11 w-full rounded-card border border-chip-border px-4 text-sm font-bold text-danger">Reject</button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
