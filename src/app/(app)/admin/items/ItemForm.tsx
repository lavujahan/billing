"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClass } from "@/components/form/Field";
import { Button } from "@/components/ui/Button";
import { saveItemAction } from "./actions";

export type ItemValues = {
  id: string;
  name: string;
  name_ta: string | null;
  aliases: string[];
  unit: string | null;
  default_rate: number | null;
  gst_rate: number | null;
  hsn_code: string | null;
};

const UNITS = ["nos", "bag", "kg", "g", "litre", "ml", "metre", "ft", "sqft", "box", "packet", "bundle", "ton", "set", "pair"];

export function ItemForm({
  item,
  slabs,
  request,
}: {
  item: ItemValues | null;
  slabs: number[];
  request?: { id: string; name: string; rate: string } | null;
}) {
  const [state, action, pending] = useActionState(saveItemAction, null);
  const prefill = item ?? (request ? { name: request.name, default_rate: request.rate ? Number(request.rate) : null } : null);
  return (
    <form key={item?.id ?? request?.id ?? "new"} action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="request_id" value={item ? "" : (request?.id ?? "")} />
      {request && !item && (
        <p className="rounded-field bg-primary-container px-3 py-2 text-sm text-primary-strong">
          Requested from a bill as “{request.name}”. Fix the name if needed — the spoken word is kept as an alias.
        </p>
      )}
      <Field label="Item name · பெயர் (English)" name="name" required maxLength={120} defaultValue={prefill?.name} />
      <Field label="Tamil name · தமிழ் பெயர்" name="name_ta" maxLength={120} defaultValue={item?.name_ta ?? ""} />
      <Field
        label="Spoken names (comma separated)"
        name="aliases"
        defaultValue={item ? item.aliases.join(", ") : (request?.name ?? "")}
        hint="e.g. கம்பி, kambi, rod — used by search and voice"
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">Unit · அலகு</span>
          <input name="unit" list="units" defaultValue={item?.unit ?? "nos"} maxLength={20} className={inputClass} />
          <datalist id="units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <Field
          label="Rate (₹) · விலை *"
          name="default_rate"
          inputMode="decimal"
          required
          defaultValue={prefill?.default_rate ?? ""}
          hint="Used on bills unless the customer had a different rate last time"
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">GST %</span>
          <select name="gst_rate" defaultValue={String(item?.gst_rate ?? slabs.at(-2) ?? 18)} className={inputClass}>
            {slabs.map((s) => (
              <option key={s} value={s}>
                {s}%
              </option>
            ))}
          </select>
        </label>
        <Field label="HSN code" name="hsn_code" inputMode="numeric" maxLength={8} defaultValue={item?.hsn_code ?? ""} />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : item ? "Save changes" : "Add item"}
      </Button>
      {item && (
        <Link href="/admin/items" className="text-center text-sm font-semibold text-primary">
          + Add a new item instead
        </Link>
      )}
    </form>
  );
}
