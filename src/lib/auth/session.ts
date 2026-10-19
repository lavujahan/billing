import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "./users";

export type CurrentUser = {
  id: string;
  fullName: string;
  role: Role;
  language: "ta" | "en";
  businessId: string;
  businessName: string;
};

// Request-time read: call only inside a <Suspense> boundary, or from a Server Action.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { data } = await supabase
    .from("users")
    .select("id, full_name, role, language, business_id, active, businesses(name)")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.active) redirect("/logout");

  const business = data.businesses as unknown as { name: string } | null;
  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role,
    language: data.language,
    businessId: data.business_id,
    businessName: business?.name ?? "",
  };
});

export function isAdminRole(role: Role) {
  return role === "owner" || role === "admin";
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!isAdminRole(user.role)) redirect("/");
  return user;
}
