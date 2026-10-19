import Link from "next/link";
import { BellIcon, ReportsIcon } from "@/components/icons";

export function TopBar({ greeting, businessName, initials }: { greeting: string; businessName: string; initials: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-outline bg-surface py-3 pr-2 pl-4">
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-[13px] text-ink-muted">{greeting}</span>
        <span className="truncate text-lg font-bold">{businessName}</span>
      </div>
      <Link href="/reports" aria-label="Reports" className="flex h-11 w-11 items-center justify-center text-ink">
        <ReportsIcon />
      </Link>
      <Link href="/notifications" aria-label="Notifications" className="flex h-11 w-11 items-center justify-center text-ink">
        <BellIcon />
      </Link>
      <Link href="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center no-underline">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-[13px] font-bold text-primary-strong">
          {initials}
        </span>
      </Link>
    </header>
  );
}
