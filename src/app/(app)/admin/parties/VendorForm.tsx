"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClass } from "@/components/form/Field";
import { Button } from "@/components/ui/Button";
import { STATES } from "@/lib/billing/gst";
import { saveVendorAction } from "./vendor-actions";

export type VendorValues = { id: string; name: string; name_ta: string | null; phone: string | null; gstin: string | null; state_code: string | null };

export function VendorForm({
  vendor,
  defaultState,
  request,
}: {
  vendor: VendorValues | null;
  defaultState: string | null;
  request?: { id: string; name: string; gstin: string; phone: string } | null;
}) {
  const [state, action, pending] = useActionState(saveVendorAction, null);
  const prefill = vendor ?? (request ? { name: request.name, gstin: request.gstin, phone: request.phone } : null);
  return (
    <form key={vendor?.id ?? request?.id ?? "new"} action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <input type="hidden" name="id" value={vendor?.id ?? ""} />
      <input type="hidden" name="request_id" value={vendor ? "" : (request?.id ?? "")} />
      {request && !vendor && <p className="rounded-field bg-primary-container px-3 py-2 text-sm text-primary-strong">Requested from a purchase as “{request.name}”.</p>}
      <Field label="Name · பெயர்" name="name" required maxLength={120} defaultValue={prefill?.name} />
      <Field label="Tamil name · தமிழ் பெயர்" name="name_ta" maxLength={120} defaultValue={vendor?.name_ta ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" type="tel" maxLength={20} defaultValue={prefill?.phone ?? ""} />
        <Field label="GSTIN" name="gstin" maxLength={15} autoCapitalize="characters" defaultValue={prefill?.gstin ?? ""} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">State (if no GSTIN)</span>
        <select name="state_code" defaultValue={vendor?.state_code ?? defaultState ?? ""} className={inputClass}>
          <option value="">—</option>
          {Object.entries(STATES).map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
        </select>
      </label>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : vendor ? "Save changes" : "Add vendor"}
      </Button>
      {(vendor || request) && (
        <Link href="/admin/parties?tab=vendors" className="text-center text-sm font-semibold text-primary">
          + Add a new vendor instead
        </Link>
      )}
    </form>
  );
}
