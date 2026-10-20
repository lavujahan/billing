import Link from "next/link";
import { Page, PageTitle } from "@/components/layout/Page";
import { Card, SectionHeading } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { setItemActiveAction } from "./actions";
import { ItemForm, type ItemValues } from "./ItemForm";

export default async function ItemsPage({ searchParams }: PageProps<"/admin/items">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[%_\\,()]/g, "").trim() : "";
  const supabase = await createClient();

  let query = supabase.from("products").select("id, name, name_ta, aliases, unit, default_rate, gst_rate, hsn_code, active").order("name");
  if (q) query = query.or(`name.ilike.%${q}%,name_ta.ilike.%${q}%`);
  const [{ data: items }, { data: biz }] = await Promise.all([
    query.limit(500),
    supabase.from("businesses").select("gst_slabs").eq("id", user.businessId).single(),
  ]);
  const editing = typeof sp.edit === "string" ? (items ?? []).find((i) => i.id === sp.edit) ?? null : null;
  const slabs = (biz?.gst_slabs ?? [0, 5, 12, 18, 28]).map(Number);
  const request =
    typeof sp.request === "string" && /^[0-9a-f-]{36}$/i.test(sp.request)
      ? { id: sp.request, name: typeof sp.name === "string" ? sp.name.slice(0, 120) : "", rate: typeof sp.rate === "string" ? sp.rate : "" }
      : null;

  return (
    <Page wide>
      <PageTitle title="Items · பொருட்கள்" subtitle="The item list bills choose from. Rates and GST come from here." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-2">
          <form role="search">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search items"
              aria-label="Search items"
              className="min-h-11 w-full rounded-field border border-outline bg-surface px-3 outline-none focus:border-2 focus:border-primary"
            />
          </form>
          <SectionHeading title={`${items?.length ?? 0} items`} />
          <Card className="overflow-hidden">
            {(items ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No items yet — add your first item.</p>}
            {(items ?? []).map((it, i) => (
              <div key={it.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i ? "border-t border-divider" : ""} ${it.active ? "" : "opacity-60"}`}>
                <div className="flex min-w-0 grow flex-col">
                  <span className="text-[15px] font-semibold">
                    {it.name}
                    {it.name_ta && <span className="font-normal text-ink-muted"> · {it.name_ta}</span>}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {it.default_rate !== null ? formatINR(Number(it.default_rate)) : "no rate"} / {it.unit ?? "unit"} · GST {Number(it.gst_rate ?? 0)}%
                    {it.hsn_code ? ` · HSN ${it.hsn_code}` : ""}
                    {it.active ? "" : " · inactive"}
                  </span>
                </div>
                <Link href={`/admin/items?edit=${it.id}`} className="min-h-11 rounded-full border border-primary-outline px-4 py-2.5 text-sm font-semibold text-primary">
                  Edit
                </Link>
                <form action={setItemActiveAction}>
                  <input type="hidden" name="id" value={it.id} />
                  <input type="hidden" name="active" value={String(!it.active)} />
                  <button className="min-h-11 rounded-full border border-chip-border px-4 text-sm font-semibold">{it.active ? "Hide" : "Show"}</button>
                </form>
              </div>
            ))}
          </Card>
        </section>
        <section className="flex flex-col gap-2">
          <SectionHeading title={editing ? `Edit · ${editing.name}` : "Add item · புது பொருள்"} />
          <ItemForm item={editing as ItemValues | null} slabs={slabs} request={request} />
        </section>
      </div>
    </Page>
  );
}
