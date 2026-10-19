"use server";

import { redirect } from "next/navigation";
import { loginWithMobileCode } from "@/lib/auth/login";

export type LoginState = { error?: "invalid" | "locked" | "format" | "server"; mobile?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const mobile = String(formData.get("mobile") ?? "");
  const code = String(formData.get("code") ?? "");
  const result = await loginWithMobileCode(mobile, code);
  if (!result.ok) return { error: result.error, mobile };
  redirect("/");
}
