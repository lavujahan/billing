"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormMessage, inputClass } from "@/components/form/Field";
import { Button } from "@/components/ui/Button";
import { FieldMic } from "@/components/voice/FieldMic";
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

// A spoken word is added to the comma list as heard (Tamil script or English), skipping repeats.
function addAlias(list: string, heard: string): string {
  const words = list.split(",").map((s) => s.trim()).filter(Boolean);
  const said = heard.replace(/[.।!?]+$/u, "").trim();
  if (!said || words.some((w) => w.toLowerCase() === said.toLowerCase())) return words.join(", ");
  return [...words, said].join(", ");
}

export function ItemForm({
  item,
  slabs,
  request,
  voiceEnabled,
}: {
  item: ItemValues | null;
  slabs: number[];
  request?: { id: string; name: string; rate: string } | null;
  voiceEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(saveItemAction, null);
  const prefill = item ?? (request ? { name: request.name, default_rate: request.rate ? Number(request.rate) : null } : null);
  const [aliases, setAliases] = useState(item ? item.aliases.join(", ") : (request?.name ?? ""));
  // The other inputs reset themselves after a successful add; this one is controlled, so clear it here.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok && !item) setAliases("");
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-card border border-outline bg-surface p-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="request_id" value={item ? "" : (request?.id ?? "")} />
      {request && !item && (
        <p className="rounded-field bg-primary-container px-3 py-2 text-sm text-primary-strong">
          Requested from a bill as “{request.name}”. Fix the name if needed — the spoken word is kept as an alias.
        </p>
      )}
      <Field label="Item name · பெயர் (English)" name="name" required maxLength={120} defaultValue={prefill?.name} />
      <Field label="Tamil name · தமிழ் பெயர்" name="name_ta" maxLength={120} defaultValue={item?.name_ta ?? ""} />
      <div className="flex flex-col gap-1">
        <label htmlFor="item-aliases" className="text-xs text-ink-muted">
          Spoken names (comma separated) · பேச்சு பெயர்கள்
        </label>
        <div className="flex items-center gap-2">
          <input id="item-aliases" name="aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} className={inputClass} />
          {voiceEnabled && <FieldMic kind="alias" module="items" label="a spoken name" onText={(t) => setAliases((a) => addAlias(a, t))} />}
        </div>
        <span className="text-xs text-ink-muted">
          e.g. கம்பி, kambi, rod — used by search and voice{voiceEnabled ? ". Tap the mic and say one name." : ""}
        </span>
      </div>
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
