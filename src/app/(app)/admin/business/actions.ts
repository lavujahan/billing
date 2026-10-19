"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isValidGstin, normalizeGstin, STATES } from "@/lib/billing/gst";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;
const blankToNull = (s: string) => s.trim() || null;

const Business = z.object({
  name: z.string().trim().min(1, "Enter the business name").max(120),
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
  phone: z.string().max(20).transform(blankToNull),
  invoice_prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,10}$/, "Prefix: up to 10 letters, digits or -")
    .transform((s) => s.toUpperCase()),
  gst_slabs: z
    .string()
    .transform((s) => [...new Set(s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0 && n <= 100))].sort((a, b) => a - b))
    .refine((a) => a.length > 0, "Enter at least one GST rate"),
});

export async function saveBusinessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (user.role !== "owner") return { ok: false, message: "Only the owner can change the business profile." };
  const parsed = Business.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const values = { ...parsed.data, state_code: parsed.data.gstin ? parsed.data.gstin.slice(0, 2) : parsed.data.state_code };
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update(values).eq("id", user.businessId);
  if (error) return { ok: false, message: "Couldn't save the business profile." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved · சேமிக்கப்பட்டது" };
}
