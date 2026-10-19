import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in · உள்நுழை" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-card bg-primary text-2xl font-bold text-white">
          வ
        </span>
        <h1 className="text-[22px] font-bold">Business Assistant · வணிக உதவி</h1>
        <p className="text-sm text-ink-muted">Log in with the mobile number and 5-digit code your admin gave you.</p>
      </div>
      <LoginForm />
    </main>
  );
}
