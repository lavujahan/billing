import type { ReactNode } from "react";
import { isAdminRole, type CurrentUser } from "@/lib/auth/session";
import { BottomNav } from "./BottomNav";
import { PhoneChromeGate } from "./PhoneChromeGate";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const firstName = user.fullName.split(/\s+/)[0];
  return (
    <div className="flex min-h-dvh">
      <SideNav businessName={user.businessName} showAdmin={isAdminRole(user.role)} />
      <div className="flex min-w-0 grow flex-col">
        <PhoneChromeGate>
          <TopBar
            greeting={`வணக்கம், ${firstName} · ${todayLabel()}`}
            businessName={user.businessName}
            initials={initialsOf(user.businessName) || "•"}
          />
        </PhoneChromeGate>
        <main className="grow pb-28 sm:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

export function AppShellFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted" aria-busy="true">
      Loading · ஏற்றுகிறது…
    </div>
  );
}
