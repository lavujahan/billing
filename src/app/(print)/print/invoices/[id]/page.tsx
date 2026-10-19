import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { STATES } from "@/lib/billing/gst";
import { getInvoice } from "@/lib/billing/server";
import { rupeesInWords } from "@/lib/billing/words";
import { formatDate, formatINR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { PrintToolbar } from "./PrintToolbar";

export const metadata: Metadata = { title: "Invoice" };

const UUID = /^[0-9a-f-]{36}$/i;
const money = (n: number) => formatINR(Number(n), { fixed: true }).replace("₹", "");

export default async function PrintInvoicePage({ params, searchParams }: PageProps<"/print/invoices/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [bill, { data: biz }] = await Promise.all([
    getInvoice(supabase, id),
    supabase.from("businesses").select("name, gstin, state_code, address, phone").eq("id", user.businessId).single(),
  ]);
  if (!bill || !biz) notFound();

  const size = sp.size === "thermal" ? "thermal" : "a4";
  const inter = Number(bill.igst) > 0;
  const title = biz.gstin ? "Tax Invoice · வரி விலைப்பட்டியல்" : "Bill of Supply · பில்";
  const stamp = bill.status === "cancelled" ? "CANCELLED" : bill.revision > 0 ? `REVISED (${bill.revision})` : null;
  const pos = bill.place_of_supply ? `${STATES[bill.place_of_supply] ?? ""} (${bill.place_of_supply})` : null;

  if (size === "thermal") {
    return (
      <>
        <style>{`@page { size: 80mm auto; margin: 3mm; }`}</style>
        <PrintToolbar id={bill.id} size={size} autoPrint={sp.print === "1"} />
        <article className="mx-auto w-[74mm] py-3 text-[11px] leading-snug">
          <header className="text-center">
            <p className="text-[14px] font-bold">{biz.name}</p>
            {biz.address && <p>{biz.address}</p>}
            {biz.gstin && <p>GSTIN {biz.gstin}</p>}
            <p className="mt-1 font-bold">{title}</p>
            {stamp && <p className="font-bold">{stamp}</p>}
          </header>
          <p className="mt-2 flex justify-between">
            <span>{bill.invoice_no}</span>
            <span>{formatDate(bill.invoice_date)}</span>
          </p>
          <p>To: {bill.customers.name}</p>
          {bill.customer_gstin && <p>GSTIN {bill.customer_gstin}</p>}
          <div className="my-2 border-y border-dashed border-black py-1">
            {bill.invoice_items.map((l) => (
              <div key={l.id} className="py-0.5">
                <p>{l.item_name}{l.item_name_ta ? ` · ${l.item_name_ta}` : ""}</p>
                <p className="flex justify-between">
                  <span>
                    {Number(l.qty)} {l.unit ?? ""} × {money(l.rate)} · {Number(l.gst_rate)}%
                  </span>
                  <span>{money(Number(l.qty) * Number(l.rate))}</span>
                </p>
              </div>
            ))}
          </div>
          <TotalsBlock bill={bill} inter={inter} />
          <p className="mt-3 text-center">நன்றி · Thank you</p>
        </article>
      </>
    );
  }

  return (
    <>
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <PrintToolbar id={bill.id} size={size} autoPrint={sp.print === "1"} />
      <article className="relative mx-auto max-w-[190mm] px-4 py-6 text-[12px] leading-snug print:p-0">
        {stamp && (
          <p className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 text-6xl font-bold text-black/10">{stamp}</p>
        )}
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          <div>
            <p className="text-[20px] font-bold">{biz.name}</p>
            {biz.address && <p className="whitespace-pre-line">{biz.address}</p>}
            {biz.phone && <p>Phone: {biz.phone}</p>}
            {biz.gstin && <p className="font-semibold">GSTIN: {biz.gstin}</p>}
            {biz.state_code && <p>State: {STATES[biz.state_code]} ({biz.state_code})</p>}
          </div>
          <div className="text-right">
            <p className="text-[16px] font-bold">{title}</p>
            <p>
              Invoice no: <b>{bill.invoice_no}</b>
            </p>
            <p>Date: {formatDate(bill.invoice_date)}</p>
            {pos && <p>Place of supply: {pos}</p>}
          </div>
        </header>

        <section className="border-b border-black py-3">
          <p className="text-[11px] uppercase">Bill to · பெறுநர்</p>
          <p className="text-[14px] font-bold">
            {bill.customers.name}
            {bill.customers.name_ta ? ` · ${bill.customers.name_ta}` : ""}
          </p>
          {bill.customers.address && <p className="whitespace-pre-line">{bill.customers.address}</p>}
          {bill.customer_gstin && <p>GSTIN: {bill.customer_gstin}</p>}
        </section>

        <table className="mt-3 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-1.5 pr-1">#</th>
              <th className="py-1.5">Item</th>
              <th className="py-1.5">HSN</th>
              <th className="py-1.5 text-right">Qty</th>
              <th className="py-1.5 text-right">Rate</th>
              <th className="py-1.5 text-right">Taxable</th>
              <th className="py-1.5 text-right">GST</th>
              <th className="py-1.5 text-right">Tax</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.invoice_items.map((l) => (
              <tr key={l.id} className="border-b border-black/30 align-top">
                <td className="py-1.5 pr-1">{l.line_no}</td>
                <td className="py-1.5">
                  {l.item_name}
                  {l.item_name_ta && <span className="block text-[10.5px]">{l.item_name_ta}</span>}
                </td>
                <td className="py-1.5">{l.hsn_code ?? ""}</td>
                <td className="py-1.5 text-right">
                  {Number(l.qty)} {l.unit ?? ""}
                </td>
                <td className="py-1.5 text-right">{money(l.rate)}</td>
                <td className="py-1.5 text-right">{money(l.taxable_value)}</td>
                <td className="py-1.5 text-right">{Number(l.gst_rate)}%</td>
                <td className="py-1.5 text-right">{money(l.tax_amount)}</td>
                <td className="py-1.5 text-right">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-between gap-8">
          <div className="max-w-[55%]">
            <p className="font-semibold">{rupeesInWords(Number(bill.total_amount))}</p>
            {bill.rate_includes_gst && <p className="mt-1 text-[11px]">Rates are inclusive of GST.</p>}
            {bill.notes && <p className="mt-2 whitespace-pre-line">Note: {bill.notes}</p>}
          </div>
          <div className="w-[70mm]">
            <TotalsBlock bill={bill} inter={inter} />
          </div>
        </div>

        <footer className="mt-12 flex justify-end">
          <div className="text-center">
            <p>For {biz.name}</p>
            <p className="mt-10 border-t border-black px-6 pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </>
  );
}

function TotalsBlock({ bill, inter }: { bill: NonNullable<Awaited<ReturnType<typeof getInvoice>>>; inter: boolean }) {
  const row = (label: string, value: string, strong = false) => (
    <p className={`flex justify-between ${strong ? "border-t border-black pt-1 text-[14px] font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
  return (
    <div className="flex flex-col gap-0.5">
      {Number(bill.discount) > 0 && row("Discount", `−${money(bill.discount)}`)}
      {row("Taxable value", money(bill.taxable_value))}
      {inter ? row("IGST", money(bill.igst)) : <>{row("CGST", money(bill.cgst))}{row("SGST", money(bill.sgst))}</>}
      {Number(bill.round_off) !== 0 && row("Round off", money(bill.round_off))}
      {row("Total · மொத்தம்", `₹${money(bill.total_amount)}`, true)}
      {bill.payment_status !== "credit" && row("Received", money(bill.amount_received))}
    </div>
  );
}
