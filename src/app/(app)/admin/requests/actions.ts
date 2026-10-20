"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { resolveRequest as resolve } from "@/lib/masters/requests";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();


// The requested name becomes a spoken alias of the chosen item, so voice finds it next time.
export async function mergeRequestAction(formData: FormData) {
  const user = await requireAdmin();
  const id = uuid.parse(formData.get("id"));
  const productId = uuid.parse(formData.get("productId"));
  const supabase = await createClient();
  const [{ data: req }, { data: product }] = await Promise.all([
    supabase.from("master_requests").select("requested_name").eq("id", id).single(),
    supabase.from("products").select("aliases").eq("id", productId).single(),
  ]);
  if (!req || !product) return;
  const aliases = [...new Set([...(product.aliases ?? []), req.requested_name])];
  await supabase.from("products").update({ aliases }).eq("id", productId);
  await resolve(id, "merged", productId, user.id);
  revalidatePath("/admin/requests");
}

export async function rejectRequestAction(formData: FormData) {
  const user = await requireAdmin();
  const id = uuid.parse(formData.get("id"));
  await resolve(id, "rejected", null, user.id, String(formData.get("note") ?? "").slice(0, 200));
  revalidatePath("/admin/requests");
}
