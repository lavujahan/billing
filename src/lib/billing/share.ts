import { formatDate, formatINR } from "@/lib/money";

export function billShareText(bill: {
  businessName: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  lines: { name: string; qty: number; unit: string | null; rate: number }[];
  total: number;
  received: number;
}) {
  const lines = bill.lines.map((l) => `• ${l.name} ${l.qty}${l.unit ? ` ${l.unit}` : ""} × ${formatINR(l.rate)}`);
  const due = bill.total - bill.received;
  return [
    bill.businessName,
    `Bill ${bill.invoiceNo} · ${formatDate(bill.invoiceDate)}`,
    bill.customerName,
    "",
    ...lines,
    "",
    `Total · மொத்தம்: ${formatINR(bill.total)}`,
    due > 0 ? `Balance due · பாக்கி: ${formatINR(due)}` : "Paid · செலுத்தப்பட்டது",
  ].join("\n");
}
