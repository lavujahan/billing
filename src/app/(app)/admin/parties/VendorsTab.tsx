import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui/Card";
import { formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { setVendorActiveAction } from "./vendor-actions";
import { VendorForm, type VendorValues } from "./VendorForm";

type Search = Record<string, string | string[] | undefined>;

export async function VendorsTab({ sp, businessStateCode }: { sp: Search; businessStateCode: string | null }) {
  const q = typeof sp.q === "string" ? sp.q.replace(/[%_\\,()]/g, "").trim() : "";
  const supabase = await createClient();
  let query = supabase.from("vendors").select("id, name, name_ta, phone, gstin, state_code, active").order("name");
  if (q) query = query.or(`name.ilike.%${q}%,name_ta.ilike.%${q}%,phone.ilike.%${q}%,gstin.ilike.%${q}%`);
  const [{ data: vendors }, { data: balances }] = await Promise.all([query.limit(500), supabase.from("v_vendor_balance").select("vendor_id, balance")]);
  const balanceOf = new Map((balances ?? []).map((b) => [b.vendor_id as string, Number(b.balance)]));
  const editing = typeof sp.edit === "string" ? (vendors ?? []).find((v) => v.id === sp.edit) ?? null : null;
  const request =
    typeof sp.request === "string" && /^[0-9a-f-]{36}$/i.test(sp.request)
      ? {
          id: sp.request,
          name: typeof sp.name === "string" ? sp.name.slice(0, 120) : "",
          gstin: typeof sp.gstin === "string" ? sp.gstin.slice(0, 15) : "",
          phone: typeof sp.phone === "string" ? sp.phone.slice(0, 20) : "",
        }
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="flex flex-col gap-2">
        <form role="search">
          <input type="hidden" name="tab" value="vendors" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, phone or GSTIN"
            aria-label="Search vendors"
            className="min-h-11 w-full rounded-field border border-outline bg-surface px-3 outline-none focus:border-2 focus:border-primary"
          />
        </form>
        <SectionHeading title={`${vendors?.length ?? 0} vendors`} />
        <Card className="overflow-hidden">
          {(vendors ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No vendors yet — add your suppliers.</p>}
          {(vendors ?? []).map((v, i) => {
            const owe = balanceOf.get(v.id) ?? 0;
            return (
              <div key={v.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i ? "border-t border-divider" : ""} ${v.active ? "" : "opacity-60"}`}>
                <div className="flex min-w-0 grow flex-col">
                  <span className="text-[15px] font-semibold">
                    {v.name}
                    {v.name_ta && <span className="font-normal text-ink-muted"> · {v.name_ta}</span>}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {[v.phone, v.gstin, owe > 0 ? `you owe ${formatINR(owe)}` : null, v.active ? null : "inactive"].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
                <Link href={`/admin/parties?tab=vendors&edit=${v.id}`} className="min-h-11 rounded-full border border-primary-outline px-4 py-2.5 text-sm font-semibold text-primary">
                  Edit
                </Link>
                <form action={setVendorActiveAction}>
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="active" value={String(!v.active)} />
                  <button className="min-h-11 rounded-full border border-chip-border px-4 text-sm font-semibold">{v.active ? "Hide" : "Show"}</button>
                </form>
              </div>
            );
          })}
        </Card>
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeading title={editing ? `Edit · ${editing.name}` : "Add vendor · புது விற்பனையாளர்"} />
        <VendorForm vendor={editing as VendorValues | null} defaultState={businessStateCode} request={request} />
      </section>
    </div>
  );
}
