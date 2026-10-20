// Shape of the purchase form. Typed inputs stay strings so half-typed values survive autosave.

export type PurchaseVendor = {
  id: string | null; // null = not in the vendor list yet
  name: string;
  gstin: string | null;
  stateCode: string | null;
  balance: number;
};

export type PurchaseLine = {
  key: string;
  productId: string | null; // null = printed item not in the item list
  name: string;
  hsn: string | null;
  qty: string;
  unit: string | null;
  rate: string;
  gstRate: string;
  printedAmount: number | null; // line amount as printed, for checking
  confidence?: number | null;
};

export type BillPage = { path: string; hash: string; mime: string; name: string };

export type PaymentMode = "cash" | "upi" | "bank" | "cheque";

export type PurchaseDraft = {
  vendor: PurchaseVendor | null;
  billGstin: string | null; // GSTIN as printed on the bill
  billNumber: string;
  billDate: string;
  itemsMode: "items" | "total";
  lines: PurchaseLine[];
  ratesIncludeGst: boolean;
  discount: string;
  // Total-only mode: figures typed or read from the bill.
  manual: { taxable: string; cgst: string; sgst: string; igst: string; roundOff: string; total: string };
  printedTotal: number | null; // the bill's own grand total, from the document read
  payment: "credit" | "paid" | "partial";
  amountPaid: string;
  paymentMode: PaymentMode | null;
  notes: string;
  pages: BillPage[];
  source: "text" | "voice" | "image" | "pdf";
  fieldConfidence: Partial<Record<"vendor" | "billNumber" | "billDate" | "total", number>>;
  handwritten: boolean;
};

export type PurchaseContext = {
  businessStateCode: string | null;
  gstSlabs: number[];
  today: string;
};

export function emptyPurchase(today: string): PurchaseDraft {
  return {
    vendor: null,
    billGstin: null,
    billNumber: "",
    billDate: today,
    itemsMode: "items",
    lines: [],
    ratesIncludeGst: false,
    discount: "",
    manual: { taxable: "", cgst: "", sgst: "", igst: "", roundOff: "", total: "" },
    printedTotal: null,
    payment: "credit",
    amountPaid: "",
    paymentMode: null,
    notes: "",
    pages: [],
    source: "text",
    fieldConfidence: {},
    handwritten: false,
  };
}
