"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export async function mergeCustomerAction(formData: FormData) {
  const user = await requireAdmin();
  const from = uuid.parse(formData.get("from"));
  const into = uuid.parse(formData.get("into"));
  const { error } = await createAdminClient().rpc("merge_customers", { p_business: user.businessId, p_user: user.id, p_from: from, p_into: into });
  if (error) throw new Error("Couldn't merge customers");
  revalidatePath("/admin/review");
  revalidatePath("/admin/parties");
}

export async function markReviewedAction(formData: FormData) {
  await requireAdmin();
  const id = uuid.parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("customers").update({ needs_review: false }).eq("id", id);
  revalidatePath("/admin/review");
}
