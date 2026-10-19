"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeMobile } from "@/lib/auth/phone";
import { createBusinessUser, resetUserCode, setUserActive, UserError, type Role } from "@/lib/auth/users";
import { createAdminClient } from "@/lib/supabase/admin";

export type CodeResult = { ok: true; name: string; mobile: string; code: string } | { ok: false; error: string } | null;

const CreateUser = z.object({
  fullName: z.string().trim().min(1, "Enter a name").max(80),
  mobile: z.string(),
  role: z.enum(["owner", "admin", "staff"]),
});

// Only an owner may create or manage owner and admin accounts.
function canManage(callerRole: Role, targetRole: Role) {
  return callerRole === "owner" || targetRole === "staff";
}

export async function createUserAction(_prev: CodeResult, formData: FormData): Promise<CodeResult> {
  const caller = await requireAdmin();
  const parsed = CreateUser.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const mobile = normalizeMobile(parsed.data.mobile);
  if (!mobile) return { ok: false, error: "Enter a valid 10-digit mobile number" };
  if (!canManage(caller.role, parsed.data.role)) return { ok: false, error: "Only the owner can add owners or admins" };

  try {
    const { code } = await createBusinessUser(createAdminClient(), {
      businessId: caller.businessId,
      mobile,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      createdBy: caller.id,
    });
    revalidatePath("/admin/users");
    return { ok: true, name: parsed.data.fullName, mobile, code };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Could not create the user. Please try again." };
  }
}

async function loadManageableTarget(userId: string) {
  const caller = await requireAdmin();
  const service = createAdminClient();
  const { data: target } = await service
    .from("users")
    .select("id, business_id, full_name, mobile, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.business_id !== caller.businessId) throw new UserError("User not found");
  if (!canManage(caller.role, target.role)) throw new UserError("Only the owner can manage owners or admins");
  return { caller, service, target };
}

export async function resetCodeAction(_prev: CodeResult, formData: FormData): Promise<CodeResult> {
  try {
    const { service, target } = await loadManageableTarget(String(formData.get("userId")));
    const code = await resetUserCode(service, target.id);
    return { ok: true, name: target.full_name, mobile: target.mobile, code };
  } catch (e) {
    return { ok: false, error: e instanceof UserError ? e.message : "Could not reset the code" };
  }
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const { caller, service, target } = await loadManageableTarget(String(formData.get("userId")));
  if (target.id === caller.id) throw new UserError("You can't deactivate your own login");
  await setUserActive(service, target.id, formData.get("active") === "true");
  revalidatePath("/admin/users");
}
