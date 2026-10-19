"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isFormRoute } from "@/lib/nav";

export function PhoneChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isFormRoute(pathname) ? <div className="max-sm:hidden">{children}</div> : children;
}
