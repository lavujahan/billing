"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { resolveRequest } from "@/lib/masters/requests";
import { createClient } from "@/lib/supabase/server";
import { tamilToLatin } from "@/lib/voice/translit";

export type FormState = { ok: boolean; message: string } | null;

const optionalNumber = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : Number(s.replace(/,/g, ""))))
  .refine((n) => n === null || (Number.isFinite(n) && n >= 0), "Enter a valid number");

const Item = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  request_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Enter the item name").max(120),
  name_ta: z.string().trim().max(120).transform((s) => s || null),
  aliases: z
    .string()
    .max(500)
    .transform((s) => [...new Set(s.split(",").map((a) => a.trim()).filter(Boolean))]),
  unit: z.string().trim().max(20).transform((s) => s || null),
  default_rate: optionalNumber,
  gst_rate: z.coerce.number(),
  hsn_code: z
    .string()
    .trim()
    .max(8)
    .refine((s) => s === "" || /^\d{4,8}$/.test(s), "HSN is 4–8 digits")
    .transform((s) => s || null),
});

export async function saveItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = Item.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("gst_slabs").eq("id", user.businessId).single();
  const slabs = (biz?.gst_slabs ?? []).map(Number);
  if (!slabs.includes(parsed.data.gst_rate)) return { ok: false, message: `GST must be one of: ${slabs.join(", ")}%` };

  const { id, request_id, ...fields } = parsed.data;
  const values = { ...fields, name_latin: fields.name_ta ? tamilToLatin(fields.name_ta) : null };
  const { data: saved, error } = id
    ? await supabase.from("products").update(values).eq("id", id).select("id").single()
    : await supabase.from("products").insert({ ...values, business_id: user.businessId, created_by: user.id }).select("id").single();
  if (error || !saved) return { ok: false, message: "Couldn't save the item." };

  if (request_id) await resolveRequest(request_id, "approved", saved.id, user.id);
  revalidatePath("/admin/items");
  revalidatePath("/admin/requests");
  return { ok: true, message: id ? `Updated ${values.name}` : `Added ${values.name}${request_id ? " — request done, the bill can continue" : ""}` };
}

export async function setItemActiveAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("products").update({ active: formData.get("active") === "true" }).eq("id", id);
  revalidatePath("/admin/items");
}
