"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { isValidGstin, normalizeGstin, STATES } from "@/lib/billing/gst";
import { resolveRequest } from "@/lib/masters/requests";
import { createClient } from "@/lib/supabase/server";
import { tamilToLatin } from "@/lib/voice/translit";

export type FormState = { ok: boolean; message: string } | null;
const blankToNull = (s: string) => s.trim() || null;

const Vendor = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  request_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(1, "Enter the vendor name").max(120),
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
});

export async function saveVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const parsed = Vendor.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const { id, request_id, ...values } = parsed.data;
  const row = {
    ...values,
    state_code: values.gstin ? values.gstin.slice(0, 2) : values.state_code,
    name_latin: tamilToLatin(values.name_ta ?? values.name),
    needs_review: false,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("vendors").update(row).eq("id", id).select("id").single()
    : await supabase.from("vendors").insert({ ...row, business_id: user.businessId, created_by: user.id }).select("id").single();
  if (error || !data) {
    return { ok: false, message: error?.code === "23505" ? "A vendor with this GSTIN already exists." : "Couldn't save the vendor." };
  }
  if (request_id) await resolveRequest(request_id, "approved", data.id, user.id);
  revalidatePath("/admin/parties");
  revalidatePath("/admin/requests");
  return { ok: true, message: id ? `Updated ${values.name}` : `Added ${values.name}${request_id ? " — the waiting purchase can continue" : ""}` };
}

export async function setVendorActiveAction(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("vendors").update({ active: formData.get("active") === "true" }).eq("id", id);
  revalidatePath("/admin/parties");
}
