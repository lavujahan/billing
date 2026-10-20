import Link from "next/link";
import { notFound } from "next/navigation";
import { BackIcon } from "@/components/icons";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import { STATES } from "@/lib/billing/gst";
import { getInvoice } from "@/lib/billing/server";
import { billShareText } from "@/lib/billing/share";
import { formatDate, formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { CancelRecordButton } from "@/components/CancelRecordButton";
import { cancelBillAction } from "../actions";
import { ShareBillButton } from "../_components/ShareBillButton";

const PAYMENT = { paid: "Paid · Cash", credit: "Credit", partial: "Partial" } as const;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function BillViewPage({ params }: PageProps<"/billing/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const bill = await getInvoice(supabase, id);
  if (!bill) notFound();

  const cancelled = bill.status === "cancelled";
  const due = Number(bill.total_amount) - Number(bill.amount_received);
  const canManage = isAdminRole(user.role) && !cancelled;
  const history =
    user.role === "owner"
      ? (
          await supabase
            .from("audit_log")
            .select("id, action, created_at, users:changed_by(full_name)")
            .eq("table_name", "invoices")
            .eq("record_id", id)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  const action = "flex min-h-[52px] items-center justify-center rounded-card border border-primary-outline bg-surface px-3 text-[15px] font-bold text-primary-strong no-underline";

  return (
    <Page>
      <div className="flex items-center gap-2">
        <Link href="/billing" aria-label="Back to bills" className="-ml-3 flex h-11 w-11 items-center justify-center text-ink">
          <BackIcon />
        </Link>
        <div className="flex min-w-0 grow flex-col">
          <h1 className="truncate text-xl font-bold">{bill.invoice_no}</h1>
          <span className="text-[13px] text-ink-muted">
            {formatDate(bill.invoice_date)}
            {bill.revision > 0 && ` · Revised ${bill.revision}×`}
            {bill.created_by_user && ` · by ${bill.created_by_user.full_name}`}
          </span>
        </div>
        {cancelled ? (
          <span className="rounded-full bg-warning-container px-3 py-1 text-xs font-bold text-danger">Cancelled</span>
        ) : (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${due > 0 ? "bg-warning-container text-warning-text" : "bg-primary-container text-primary-strong"}`}>
            {PAYMENT[bill.payment_status]}
          </span>
        )}
      </div>

      {cancelled && bill.cancel_reason && (
        <p className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">Cancelled: {bill.cancel_reason}</p>
      )}

      <Card className="flex flex-col gap-0.5 px-4 py-3">
        <span className="text-xs text-ink-muted">Customer · வாடிக்கையாளர்</span>
        <span className="text-[17px] font-semibold">{bill.customers.name}</span>
        {bill.customer_gstin && <span className="text-xs text-ink-muted">GSTIN {bill.customer_gstin}</span>}
        {bill.place_of_supply && <span className="text-xs text-ink-muted">Place of supply: {STATES[bill.place_of_supply] ?? bill.place_of_supply}</span>}
      </Card>

      <Card className="overflow-hidden">
        {bill.invoice_items.map((l, i) => (
          <div key={l.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-divider" : ""}`}>
            <span className="flex min-w-0 grow flex-col">
              <span className="text-[15px] font-semibold">{l.item_name}</span>
              <span className="text-xs text-ink-muted">
                {Number(l.qty)} {l.unit ?? ""} × {formatINR(Number(l.rate))} · GST {Number(l.gst_rate)}%
              </span>
            </span>
            <span className="font-semibold">{formatINR(Number(l.qty) * Number(l.rate))}</span>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-1.5 px-4 py-3 text-[13px] text-ink-muted">
        {Number(bill.discount) > 0 && <Row label="Discount" value={`−${formatINR(Number(bill.discount))}`} />}
        <Row label="Taxable" value={formatINR(Number(bill.taxable_value), { fixed: true })} />
        {Number(bill.igst) > 0 ? (
          <Row label="IGST" value={formatINR(Number(bill.igst), { fixed: true })} />
        ) : (
          <Row label="CGST + SGST" value={formatINR(Number(bill.cgst) + Number(bill.sgst), { fixed: true })} />
        )}
        {Number(bill.round_off) !== 0 && <Row label="Round off" value={formatINR(Number(bill.round_off), { fixed: true })} />}
        <div className="flex items-baseline justify-between border-t border-outline pt-1.5 text-ink">
          <span className="text-[15px] font-bold">Total · மொத்தம்</span>
          <span className="text-[22px] font-bold">{formatINR(Number(bill.total_amount))}</span>
        </div>
        {due > 0 && !cancelled && <Row label="Balance due on this bill" value={formatINR(due)} />}
        {bill.notes && <p className="pt-1 text-ink">Note: {bill.notes}</p>}
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Link href={`/print/invoices/${bill.id}`} target="_blank" className={action}>
          PDF
        </Link>
        <ShareBillButton
          title={`Bill ${bill.invoice_no}`}
          text={billShareText({
            businessName: user.businessName,
            invoiceNo: bill.invoice_no,
            invoiceDate: bill.invoice_date,
            customerName: bill.customers.name,
            lines: bill.invoice_items.map((l) => ({ name: l.item_name, qty: Number(l.qty), unit: l.unit, rate: Number(l.rate) })),
            total: Number(bill.total_amount),
            received: Number(bill.amount_received),
          })}
          className={action}
        />
        <Link href={`/print/invoices/${bill.id}?print=1`} target="_blank" className={action}>
          Print
        </Link>
      </div>

      {canManage && (
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/billing/${bill.id}/edit`} className={action}>
            Edit · திருத்து
          </Link>
          <CancelRecordButton
            id={bill.id}
            title={`Cancel ${bill.invoice_no}?`}
            explanation="The bill keeps its number and stays in the list as Cancelled. It no longer counts in sales or the customer's balance."
            buttonLabel="Cancel bill"
            action={cancelBillAction}
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
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
