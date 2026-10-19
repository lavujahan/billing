"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

const optionalNumber = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : Number(s.replace(/,/g, ""))))
  .refine((n) => n === null || (Number.isFinite(n) && n >= 0), "Enter a valid number");

const Item = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
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

  const { id, ...values } = parsed.data;
  const { error } = id
    ? await supabase.from("products").update(values).eq("id", id)
    : await supabase.from("products").insert({ ...values, business_id: user.businessId, created_by: user.id });
  if (error) return { ok: false, message: "Couldn't save the item." };

  revalidatePath("/admin/items");
  return { ok: true, message: id ? `Updated ${values.name}` : `Added ${values.name}` };
}

export async function setItemActiveAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("products").update({ active: formData.get("active") === "true" }).eq("id", id);
  revalidatePath("/admin/items");
}
