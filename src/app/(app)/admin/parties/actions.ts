"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { isValidGstin, normalizeGstin, STATES } from "@/lib/billing/gst";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

const blankToNull = (s: string) => s.trim() || null;

const Customer = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Enter the customer name").max(120),
  name_ta: z.string().max(120).transform(blankToNull),
  phone: z.string().max(20).transform(blankToNull),
  gstin: z
    .string()
    .max(20)
    .transform((s) => (s.trim() ? normalizeGstin(s) : null))
    .refine((g) => g === null || isValidGstin(g), "GSTIN doesn't look right — check the 15 characters"),
  state_code: z
    .string()
    .transform(blankToNull)
    .refine((s) => s === null || s in STATES, "Choose a state"),
  address: z.string().max(500).transform(blankToNull),
  credit_limit: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s.replace(/,/g, ""))))
    .refine((n) => n === null || (Number.isFinite(n) && n >= 0), "Credit limit must be a number"),
});

export async function saveCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = Customer.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const { id, ...values } = parsed.data;
  const row = { ...values, state_code: values.gstin ? values.gstin.slice(0, 2) : values.state_code, needs_review: false };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("customers").update(row).eq("id", id)
    : await supabase.from("customers").insert({ ...row, business_id: user.businessId, created_by: user.id });
  if (error) return { ok: false, message: "Couldn't save the customer." };

  revalidatePath("/admin/parties");
  return { ok: true, message: id ? `Updated ${values.name}` : `Added ${values.name}` };
}

export async function setCustomerActiveAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("customers").update({ active: formData.get("active") === "true" }).eq("id", id);
  revalidatePath("/admin/parties");
}
