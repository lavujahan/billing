"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClass } from "@/components/form/Field";
import { Button } from "@/components/ui/Button";
import { STATES } from "@/lib/billing/gst";
import { saveCustomerAction } from "./actions";

export type CustomerValues = {
  id: string;
  name: string;
  name_ta: string | null;
  phone: string | null;
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  credit_limit: number | null;
};

export function CustomerForm({ customer, defaultState }: { customer: CustomerValues | null; defaultState: string | null }) {
  const [state, action, pending] = useActionState(saveCustomerAction, null);
  return (
    <form key={customer?.id ?? "new"} action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <input type="hidden" name="id" value={customer?.id ?? ""} />
      <Field label="Name · பெயர்" name="name" required maxLength={120} defaultValue={customer?.name} />
      <Field label="Tamil name · தமிழ் பெயர்" name="name_ta" maxLength={120} defaultValue={customer?.name_ta ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" type="tel" inputMode="tel" maxLength={20} defaultValue={customer?.phone ?? ""} />
        <Field label="Credit limit (₹)" name="credit_limit" inputMode="decimal" defaultValue={customer?.credit_limit ?? ""} />
      </div>
      <Field label="GSTIN" name="gstin" maxLength={15} autoCapitalize="characters" defaultValue={customer?.gstin ?? ""} hint="State is taken from the GSTIN when given" />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">State (for unregistered customers)</span>
        <select name="state_code" defaultValue={customer?.state_code ?? defaultState ?? ""} className={inputClass}>
          <option value="">—</option>
          {Object.entries(STATES).map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Address · முகவரி</span>
        <textarea name="address" rows={2} maxLength={500} defaultValue={customer?.address ?? ""} className={`${inputClass} py-2`} />
      </label>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : customer ? "Save changes" : "Add customer"}
      </Button>
      {customer && (
        <Link href="/admin/parties" className="text-center text-sm font-semibold text-primary">
          + Add a new customer instead
        </Link>
      )}
    </form>
  );
}
