import { notFound, redirect } from "next/navigation";
import { resolveOpenAIKey } from "@/lib/ai/keys";
import { requireAdmin } from "@/lib/auth/session";
import { getBillCustomer, getBillingContext, getInvoice } from "@/lib/billing/server";
import type { BillDraft } from "@/lib/billing/types";
import { createClient } from "@/lib/supabase/server";
import { BillForm } from "../../_components/BillForm";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditBillPage({ params }: PageProps<"/billing/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireAdmin();
  const supabase = await createClient();
  const bill = await getInvoice(supabase, id);
  if (!bill) notFound();
  if (bill.status === "cancelled") redirect(`/billing/${id}`);

  const [ctx, customer, aiKey] = await Promise.all([
    getBillingContext(supabase, user.businessId),
    getBillCustomer(supabase, bill.customers.id),
    resolveOpenAIKey(user.businessId),
  ]);

  const initial: BillDraft = {
    invoiceDate: bill.invoice_date,
    customer: customer && { ...customer, balance: customer.balance - (Number(bill.total_amount) - Number(bill.amount_received)) },
    lines: bill.invoice_items
      .filter((l) => l.product_id)
      .map((l) => ({
        key: l.id,
        productId: l.product_id!,
        name: l.item_name,
        nameTa: l.item_name_ta,
        unit: l.unit,
        hsn: l.hsn_code,
        gstRate: Number(l.gst_rate),
        qty: String(Number(l.qty)),
        rate: String(Number(l.rate)),
        usualRate: null,
      })),
    rateIncludesGst: bill.rate_includes_gst,
    discountMode: "amount",
    discount: Number(bill.discount) ? String(Number(bill.discount)) : "",
    payment: bill.payment_status,
    amountReceived: bill.payment_status === "partial" ? String(Number(bill.amount_received)) : "",
    notes: bill.notes ?? "",
  };

  return (
    <BillForm
      businessName={user.businessName}
      ctx={{ ...ctx, lastInvoiceDate: null }}
      initial={initial}
      draftId={null}
      voiceEnabled={Boolean(aiKey)}
      edit={{ invoiceId: bill.id, invoiceNo: bill.invoice_no, updatedAt: bill.updated_at }}
    />
  );
}
