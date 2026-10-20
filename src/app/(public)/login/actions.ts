"use server";

import { redirect } from "next/navigation";
import { loginWithMobileCode } from "@/lib/auth/login";

export type LoginState = { error?: "invalid" | "locked" | "format" | "server"; mobile?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const mobile = String(formData.get("mobile") ?? "");
  // Each digit box posts on its own, so login works even if the page's JavaScript never started.
  const code = [0, 1, 2, 3, 4]
    .map((i) => String(formData.get(`d${i}`) ?? ""))
    .join("")
    .replace(/\D/g, "");
  const result = await loginWithMobileCode(mobile, code);
  if (!result.ok) return { error: result.error, mobile };
  redirect("/");
}
