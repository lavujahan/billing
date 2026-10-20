import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelRecordButton } from "@/components/CancelRecordButton";
import { BackIcon } from "@/components/icons";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import { formatDate, formatINR } from "@/lib/money";
import { signedUrls } from "@/lib/purchase/files";
import { getPurchase } from "@/lib/purchase/server";
import { createClient } from "@/lib/supabase/server";
import { cancelPurchaseAction } from "../actions";

const UUID = /^[0-9a-f-]{36}$/i;
const n = (v: number | null) => Number(v ?? 0);

export default async function PurchaseViewPage({ params }: PageProps<"/purchase/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const p = await getPurchase(supabase, id);
  if (!p) notFound();

  const [urls, { data: payments }, history] = await Promise.all([
    signedUrls(supabase, p.file_paths),
    supabase
      .from("vendor_payment_allocations")
      .select("amount, vendor_payments!inner(payment_date, mode, reference, status)")
      .eq("purchase_id", id)
      .eq("vendor_payments.status", "confirmed"),
    user.role === "owner"
      ? supabase
          .from("audit_log")
          .select("id, action, created_at, users:changed_by(full_name)")
          .eq("table_name", "purchases")
          .eq("record_id", id)
          .order("created_at", { ascending: false })
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const cancelled = p.status === "cancelled";
  const canManage = isAdminRole(user.role) && !cancelled;
  const action = "flex min-h-[52px] items-center justify-center rounded-card border border-primary-outline bg-surface px-3 text-[15px] font-bold text-primary-strong no-underline";

  return (
    <Page>
      <div className="flex items-center gap-2">
        <Link href="/purchase" aria-label="Back to purchases" className="-ml-3 flex h-11 w-11 items-center justify-center text-ink">
          <BackIcon />
        </Link>
        <div className="flex min-w-0 grow flex-col">
          <h1 className="truncate text-xl font-bold">{p.vendors.name}</h1>
          <span className="text-[13px] text-ink-muted">
            {p.bill_number ? `Bill ${p.bill_number} · ` : ""}
            {formatDate(p.bill_date)}
            {p.revision > 0 && ` · Revised ${p.revision}×`}
            {p.created_by_user && ` · by ${p.created_by_user.full_name}`}
          </span>
        </div>
        {cancelled ? (
          <span className="rounded-full bg-warning-container px-3 py-1 text-xs font-bold text-danger">Cancelled</span>
        ) : (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${p.balance > 0.005 ? "bg-warning-container text-warning-text" : "bg-primary-container text-primary-strong"}`}>
            {p.balance > 0.005 ? `Due ${formatINR(p.balance)}` : "Paid"}
          </span>
        )}
      </div>

      {cancelled && p.cancel_reason && <p className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">Cancelled: {p.cancel_reason}</p>}

      {p.file_paths.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {p.file_paths.map((path, i) => (
            <a key={path} href={urls[path]} target="_blank" rel="noreferrer" className="flex h-40 w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-outline bg-surface">
              {path.endsWith(".pdf") ? (
                <span className="text-sm font-bold text-ink-muted">PDF · page {i + 1}</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img src={urls[path]} alt={`Bill page ${i + 1}`} className="h-full w-full object-cover" />
              )}
            </a>
          ))}
        </div>
      ) : (
        <p className="rounded-field border border-dashed border-chip-border px-3 py-2 text-sm text-ink-muted">No bill photo attached{canManage ? " — open Edit to add one." : "."}</p>
      )}

      <Card className="flex flex-col gap-0.5 px-4 py-3">
        <span className="text-xs text-ink-muted">Vendor · விற்பனையாளர்</span>
        <span className="text-[17px] font-semibold">{p.vendors.name}</span>
        {(p.vendor_gstin ?? p.vendors.gstin) && <span className="text-xs text-ink-muted">GSTIN {p.vendor_gstin ?? p.vendors.gstin}</span>}
        {p.vendors.phone && <span className="text-xs text-ink-muted">{p.vendors.phone}</span>}
      </Card>

      {p.items_mode === "items" && p.purchase_items.length > 0 && (
        <Card className="overflow-hidden">
          {p.purchase_items.map((l, i) => (
            <div key={l.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-divider" : ""}`}>
              <span className="flex min-w-0 grow flex-col">
                <span className="text-[15px] font-semibold">
                  {l.item_name}
                  {!l.product_id && <span className="ml-2 text-xs font-normal text-warning-text">not in item list</span>}
                </span>
                <span className="text-xs text-ink-muted">
                  {n(l.quantity)} {l.unit ?? ""} × {formatINR(n(l.unit_price))} · GST {n(l.gst_rate)}%
                </span>
              </span>
              <span className="font-semibold">{formatINR(n(l.total_price))}</span>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-1.5 px-4 py-3 text-[13px] text-ink-muted">
        {n(p.discount) > 0 && <Row label="Discount" value={`−${formatINR(n(p.discount))}`} />}
        <Row label="Taxable" value={formatINR(n(p.subtotal) - n(p.discount), { fixed: true })} />
        {n(p.igst) > 0 && <Row label="IGST" value={formatINR(n(p.igst), { fixed: true })} />}
        {n(p.cgst) + n(p.sgst) > 0 && <Row label="CGST + SGST" value={formatINR(n(p.cgst) + n(p.sgst), { fixed: true })} />}
        {n(p.round_off) !== 0 && <Row label="Round off" value={formatINR(n(p.round_off), { fixed: true })} />}
        <div className="flex items-baseline justify-between border-t border-outline pt-1.5 text-ink">
          <span className="text-[15px] font-bold">Total · மொத்தம்</span>
          <span className="text-[22px] font-bold">{formatINR(n(p.total_amount))}</span>
        </div>
        {n(p.amount_paid) > 0 && <Row label={`Paid with bill (${p.payment_mode ?? "cash"})`} value={formatINR(n(p.amount_paid))} />}
        {(payments ?? []).map((a, i) => {
          const vp = a.vendor_payments as unknown as { payment_date: string; mode: string; reference: string | null };
          return <Row key={i} label={`Paid ${formatDate(vp.payment_date)} (${vp.mode}${vp.reference ? ` ${vp.reference}` : ""})`} value={formatINR(Number(a.amount))} />;
        })}
        {!cancelled && <Row label="Still due" value={formatINR(p.balance)} />}
        {p.notes && <p className="pt-1 text-ink">Note: {p.notes}</p>}
      </Card>

      {!cancelled && p.balance > 0.005 && (
        <Link href={`/purchase/pay?vendor=${p.vendor_id}`} className="flex min-h-[52px] items-center justify-center rounded-card bg-primary text-[15px] font-bold text-white no-underline">
          Pay {p.vendors.name}
        </Link>
      )}

      {canManage && (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/purchase/${p.id}/edit`} className={action}>
            Edit · திருத்து
          </Link>
          <CancelRecordButton
            id={p.id}
            title="Cancel this purchase?"
            explanation="It stays in the list as Cancelled and no longer counts in purchases, GST input or what you owe the vendor."
            buttonLabel="Cancel purchase"
            action={cancelPurchaseAction}
          />
        </div>
      )}

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">Edit history</h2>
          <Card className="overflow-hidden text-sm">
            {history.map((h, i) => (
              <div key={h.id} className={`flex justify-between px-4 py-2.5 ${i ? "border-t border-divider" : ""}`}>
                <span className="capitalize">{h.action}</span>
                <span className="text-ink-muted">
                  {(h.users as unknown as { full_name: string } | null)?.full_name} ·{" "}
                  {new Date(h.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
