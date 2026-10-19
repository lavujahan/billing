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

export function ItemForm({ item, slabs }: { item: ItemValues | null; slabs: number[] }) {
  const [state, action, pending] = useActionState(saveItemAction, null);
  return (
    <form key={item?.id ?? "new"} action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <Field label="Item name · பெயர் (English)" name="name" required maxLength={120} defaultValue={item?.name} />
      <Field label="Tamil name · தமிழ் பெயர்" name="name_ta" maxLength={120} defaultValue={item?.name_ta ?? ""} />
      <Field
        label="Spoken names (comma separated)"
        name="aliases"
        defaultValue={item?.aliases.join(", ")}
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
        <Field label="Default rate (₹)" name="default_rate" inputMode="decimal" defaultValue={item?.default_rate ?? ""} />
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
