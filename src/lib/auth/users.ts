import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { generateCode, hashCode } from "./code";
import { syntheticEmail } from "./phone";

export type Role = "owner" | "admin" | "staff";

// Shared by the admin Users page and scripts/create-user.ts. `service` must be a service-role client.
export async function createBusinessUser(
  service: SupabaseClient,
  input: { businessId: string; mobile: string; fullName: string; role: Role; createdBy?: string },
): Promise<{ id: string; code: string }> {
  const { data: existing } = await service.from("users").select("id").eq("mobile", input.mobile).maybeSingle();
  if (existing) throw new UserError("This mobile number already has a login");

  const { data: created, error } = await service.auth.admin.createUser({
    email: syntheticEmail(input.mobile),
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !created.user) throw new Error(`Could not create auth user: ${error?.message}`);

  const code = generateCode();
  const { error: insertError } = await service.from("users").insert({
    id: created.user.id,
    business_id: input.businessId,
    mobile: input.mobile,
    full_name: input.fullName,
    role: input.role,
    code_hash: await hashCode(code),
    created_by: input.createdBy ?? null,
  });
  if (insertError) {
    await service.auth.admin.deleteUser(created.user.id);
    throw new Error(`Could not create user profile: ${insertError.message}`);
  }
  return { id: created.user.id, code };
}

export async function resetUserCode(service: SupabaseClient, userId: string): Promise<string> {
  const code = generateCode();
  const { error } = await service
    .from("users")
    .update({ code_hash: await hashCode(code), failed_attempts: 0, locked_until: null })
    .eq("id", userId);
  if (error) throw new Error(`Could not reset code: ${error.message}`);
  return code;
}

export async function setUserActive(service: SupabaseClient, userId: string, active: boolean) {
  const { error } = await service.from("users").update({ active }).eq("id", userId);
  if (error) throw new Error(`Could not update user: ${error.message}`);
  // A ban stops existing sessions from refreshing, so a deactivated user is signed out within the token lifetime.
  await service.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
}

export class UserError extends Error {}
