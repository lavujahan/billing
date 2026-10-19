import Link from "next/link";
import type { ReactNode } from "react";

export function QuickActionButton({
  href,
  icon,
  label,
  primary = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-14 items-center gap-2.5 rounded-card px-3.5 text-[15px] font-bold no-underline ${
        primary ? "bg-primary text-white" : "border border-primary-outline bg-surface text-primary-strong"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
