import type { BillCustomer, PaymentStatus } from "./types";

// What free-form voice sends back to the bill form. The form decides how to merge it.
export type CustomerCandidate = BillCustomer & { score: number };

export type VoicePatchLine = {
  productId: string;
  name: string;
  nameTa: string | null;
  unit: string | null;
  hsn: string | null;
  gstRate: number;
  qty: number | null;
  rate: number | null;
  usualRate: number | null;
  confidence: number;
};

export type BillVoicePatch = {
  customer: { pick: BillCustomer | null; candidates: CustomerCandidate[]; spokenName: string; confidence: number } | null;
  lines: VoicePatchLine[];
  lineUpdates: { key: string; qty: number | null; rate: number | null }[];
  unmatched: { spoken: string; qty: number | null; rate: number | null }[];
  payment: PaymentStatus | null;
  amountReceived: number | null;
  discount: { mode: "amount" | "percent"; value: number } | null;
  rateIncludesGst: boolean | null;
  invoiceDate: string | null;
  notes: string | null;
};

export type FreeVoiceResponse =
  | { ok: true; transcript: string; patch: BillVoicePatch; extraDrafts: { id: string; title: string }[] }
  | { ok: false; error: string; message: string; transcript?: string };

export const LOW_CONFIDENCE = 0.8;
