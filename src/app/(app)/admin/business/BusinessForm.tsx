"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClass } from "@/components/form/Field";
import { Button } from "@/components/ui/Button";
import { STATES } from "@/lib/billing/gst";
import { saveBusinessAction } from "./actions";

export type BusinessValues = {
  name: string;
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  invoice_prefix: string;
  gst_slabs: number[];
};

export function BusinessForm({ business, readOnly }: { business: BusinessValues; readOnly: boolean }) {
  const [state, action, pending] = useActionState(saveBusinessAction, null);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <fieldset disabled={readOnly} className="flex flex-col gap-3">
        <Field label="Business name · நிறுவனப் பெயர்" name="name" required maxLength={120} defaultValue={business.name} />
        <Field label="GSTIN" name="gstin" maxLength={15} autoCapitalize="characters" defaultValue={business.gstin ?? ""} hint="Printed on every bill; sets your state" />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">State (decides CGST + SGST vs IGST)</span>
          <select name="state_code" defaultValue={business.state_code ?? "33"} className={inputClass}>
            {Object.entries(STATES).map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Address · முகவரி</span>
          <textarea name="address" rows={3} maxLength={500} defaultValue={business.address ?? ""} className={`${inputClass} py-2`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="phone" type="tel" maxLength={20} defaultValue={business.phone ?? ""} />
          <Field label="Bill number prefix" name="invoice_prefix" maxLength={10} defaultValue={business.invoice_prefix} hint="e.g. INV → INV/26-27/0001" />
        </div>
        <Field label="GST rates in use (%)" name="gst_slabs" defaultValue={business.gst_slabs.join(", ")} hint="Comma separated, e.g. 0, 5, 12, 18, 28" />
      </fieldset>
      <FormMessage state={state} />
      {readOnly ? (
        <p className="text-sm text-ink-muted">Only the owner can change these details.</p>
      ) : (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      )}
    </form>
  );
}
