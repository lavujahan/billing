import { notFound, redirect } from "next/navigation";
import { resolveOpenAIKey } from "@/lib/ai/keys";
import { requireAdmin } from "@/lib/auth/session";
import { signedUrls } from "@/lib/purchase/files";
import { getPurchase, getPurchaseContext, getVendor } from "@/lib/purchase/server";
import type { PurchaseDraft } from "@/lib/purchase/types";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "../../_components/PurchaseForm";

const UUID = /^[0-9a-f-]{36}$/i;
const s = (n: number | null | undefined) => (n === null || n === undefined || Number(n) === 0 ? "" : String(Number(n)));

export default async function EditPurchasePage({ params }: PageProps<"/purchase/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireAdmin();
  const supabase = await createClient();
  const p = await getPurchase(supabase, id);
  if (!p) notFound();
  if (p.status === "cancelled") redirect(`/purchase/${id}`);

  const [ctx, aiKey, vendor, urls] = await Promise.all([
    getPurchaseContext(supabase, user.businessId),
    resolveOpenAIKey(user.businessId),
    getVendor(supabase, p.vendor_id),
    signedUrls(supabase, p.file_paths),
  ]);
  const extraction = p.extraction;

  const initial: PurchaseDraft = {
    // The vendor's balance includes this bill; show it as it was before.
    vendor: vendor && { ...vendor, balance: vendor.balance - p.balance },
    billGstin: p.vendor_gstin,
    billNumber: p.bill_number ?? "",
    billDate: p.bill_date,
    itemsMode: p.items_mode,
    lines: p.purchase_items.map((l) => ({
      key: l.id,
      productId: l.product_id,
      name: l.item_name,
      hsn: l.hsn_code,
      qty: s(l.quantity),
      unit: l.unit,
      rate: l.unit_price === null ? "" : String(Number(l.unit_price)),
      gstRate: String(Number(l.gst_rate)),
      printedAmount: null,
    })),
    ratesIncludeGst: p.rates_include_gst,
    discount: s(p.discount),
    manual: { taxable: s(p.subtotal), cgst: s(p.cgst), sgst: s(p.sgst), igst: s(p.igst), roundOff: s(p.round_off), total: String(Number(p.total_amount)) },
    printedTotal: extraction?.printedTotal ?? null,
    payment: p.payment_status,
    amountPaid: p.payment_status === "partial" ? String(Number(p.amount_paid)) : "",
    paymentMode: p.payment_mode,
    notes: p.notes ?? "",
    pages: p.file_paths.map((path, i) => ({
      path,
      hash: p.file_hashes[i] ?? "",
      mime: path.endsWith(".pdf") ? "application/pdf" : path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg",
      name: `page-${i + 1}`,
    })),
    source: (["text", "voice", "image", "pdf"].includes(p.source) ? p.source : "text") as PurchaseDraft["source"],
    fieldConfidence: {},
    handwritten: false,
  };

  return (
    <PurchaseForm
      ctx={ctx}
      initial={initial}
      initialUrls={urls}
      draftId={null}
      aiEnabled={Boolean(aiKey)}
      isAdmin
      edit={{ purchaseId: p.id, label: p.bill_number ? `bill ${p.bill_number}` : p.vendors.name, updatedAt: p.updated_at }}
    />
  );
}
