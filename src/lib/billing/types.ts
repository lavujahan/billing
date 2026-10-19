// Shape of the bill form. Typed inputs stay strings so half-typed values survive autosave.
export type BillCustomer = {
  id: string | null;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  balance: number;
  creditLimit: number | null;
};

export type BillLine = {
  key: string;
  productId: string;
  name: string;
  nameTa: string | null;
  unit: string | null;
  hsn: string | null;
  gstRate: number;
  qty: string;
  rate: string;
  usualRate: number | null;
};

export type PaymentStatus = "credit" | "paid" | "partial";

export type BillDraft = {
  invoiceDate: string;
  customer: BillCustomer | null;
  lines: BillLine[];
  rateIncludesGst: boolean;
  discountMode: "amount" | "percent";
  discount: string;
  payment: PaymentStatus;
  amountReceived: string;
  notes: string;
};

export type BillingContext = {
  businessStateCode: string | null;
  gstSlabs: number[];
  fyStartMonth: number;
  invoicePrefix: string;
  lastInvoiceDate: string | null;
  today: string;
};

export function emptyDraft(today: string, customer: BillCustomer | null = null): BillDraft {
  return {
    invoiceDate: today,
    customer,
    lines: [],
    rateIncludesGst: false,
    discountMode: "amount",
    discount: "",
    payment: "credit",
    amountReceived: "",
    notes: "",
  };
}
