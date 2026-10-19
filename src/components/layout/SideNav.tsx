"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldIcon } from "@/components/icons";
import { ADMIN_NAV, MAIN_NAV, isActive } from "@/lib/nav";
import { NavIcon } from "./NavIcon";

const itemClass = (active: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-field px-3 text-[15px] no-underline ${
    active ? "bg-primary-container font-bold text-primary-strong" : "font-medium text-ink hover:bg-background"
  }`;

export function SideNav({ businessName, showAdmin }: { businessName: string; showAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-outline bg-surface p-3 sm:flex"
    >
      <div className="px-3 pt-1 pb-4">
        <span className="block truncate text-base font-bold">{businessName}</span>
        <span className="text-xs text-ink-muted">Business Assistant · வணிக உதவி</span>
      </div>
      {MAIN_NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined} className={itemClass(isActive(pathname, item.href))}>
          <NavIcon name={item.icon} size={20} />
          <span>
            {item.label} <span className="text-ink-muted">· {item.ta}</span>
          </span>
        </Link>
      ))}

      {showAdmin && (
        <>
          <div className="mt-4 flex items-center gap-2 px-3 pb-1 text-xs font-bold tracking-wide text-ink-muted uppercase">
            <ShieldIcon size={14} /> Admin
          </div>
          <Link href="/admin" className={itemClass(pathname === "/admin")}>
            Admin home
          </Link>
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={itemClass(isActive(pathname, item.href))}>
              {item.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );
}
