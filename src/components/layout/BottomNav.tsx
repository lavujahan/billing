"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV, isActive, isFormRoute } from "@/lib/nav";
import { NavIcon } from "./NavIcon";

export function BottomNav() {
  const pathname = usePathname();
  if (isFormRoute(pathname)) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-outline bg-surface px-1 pt-1.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:hidden"
    >
      {MAIN_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-[3px] text-[11px] no-underline ${
              active ? "font-bold text-primary" : "font-medium text-ink-muted"
            }`}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
