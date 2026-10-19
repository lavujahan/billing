import Link from "next/link";
import { Page, PageTitle } from "@/components/layout/Page";
import { Card, SectionHeading } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { setCustomerActiveAction } from "./actions";
import { CustomerForm, type CustomerValues } from "./CustomerForm";

export default async function CustomersPage({ searchParams }: PageProps<"/admin/parties">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[%_\\,()]/g, "").trim() : "";
  const review = sp.review === "1";
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, name, name_ta, phone, gstin, state_code, address, credit_limit, needs_review, active")
    .order("needs_review", { ascending: false })
    .order("name");
  if (q) query = query.or(`name.ilike.%${q}%,name_ta.ilike.%${q}%,phone.ilike.%${q}%`);
  if (review) query = query.eq("needs_review", true);
  const [{ data: customers }, { data: balances }, { data: biz }] = await Promise.all([
    query.limit(500),
    supabase.from("v_customer_balance").select("customer_id, balance"),
    supabase.from("businesses").select("state_code").eq("id", user.businessId).single(),
  ]);
  const balanceOf = new Map((balances ?? []).map((b) => [b.customer_id, Number(b.balance)]));
  const editing = typeof sp.edit === "string" ? (customers ?? []).find((c) => c.id === sp.edit) ?? null : null;
  const toReview = (customers ?? []).filter((c) => c.needs_review).length;

  return (
    <Page wide>
      <PageTitle title="Customers · வாடிக்கையாளர்கள்" subtitle="New customers added from bills are marked for review — add GSTIN and address here." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-2">
          <form role="search" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name or phone"
              aria-label="Search customers"
              className="min-h-11 grow rounded-field border border-outline bg-surface px-3 outline-none focus:border-2 focus:border-primary"
            />
            <Link
              href={review ? "/admin/parties" : "/admin/parties?review=1"}
              className={`flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${review ? "border-[1.5px] border-primary bg-primary-container text-primary-strong" : "border border-chip-border"}`}
            >
              To review{toReview && !review ? ` (${toReview})` : ""}
            </Link>
          </form>
          <SectionHeading title={`${customers?.length ?? 0} customers`} hint="Vendors arrive with the Purchase form" />
          <Card className="overflow-hidden">
            {(customers ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No customers here.</p>}
            {(customers ?? []).map((c, i) => (
              <div key={c.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i ? "border-t border-divider" : ""} ${c.active ? "" : "opacity-60"}`}>
                <div className="flex min-w-0 grow flex-col">
                  <span className="text-[15px] font-semibold">
                    {c.name}
                    {c.needs_review && <span className="ml-2 rounded-full bg-warning-container px-2 py-0.5 text-xs font-semibold text-warning-text">Review</span>}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {[c.phone, c.gstin, (balanceOf.get(c.id) ?? 0) > 0 ? `${formatINR(balanceOf.get(c.id)!)} due` : null, c.active ? null : "inactive"]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </div>
                <Link href={`/admin/parties?edit=${c.id}`} className="min-h-11 rounded-full border border-primary-outline px-4 py-2.5 text-sm font-semibold text-primary">
                  Edit
                </Link>
                <form action={setCustomerActiveAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(!c.active)} />
                  <button className="min-h-11 rounded-full border border-chip-border px-4 text-sm font-semibold">{c.active ? "Hide" : "Show"}</button>
                </form>
              </div>
            ))}
          </Card>
        </section>
        <section className="flex flex-col gap-2">
          <SectionHeading title={editing ? `Edit · ${editing.name}` : "Add customer · புது வாடிக்கையாளர்"} />
          <CustomerForm customer={editing as CustomerValues | null} defaultState={biz?.state_code ?? null} />
        </section>
      </div>
    </Page>
  );
}
