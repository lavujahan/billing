export const MAIN_NAV = [
  { href: "/", label: "Home", ta: "முகப்பு", icon: "home" },
  { href: "/billing", label: "Billing", ta: "பில்", icon: "bill" },
  { href: "/purchase", label: "Purchase", ta: "கொள்முதல்", icon: "purchase" },
  { href: "/expense", label: "Expense", ta: "செலவு", icon: "expense" },
  { href: "/collection", label: "Collection", ta: "வரவு", icon: "collection" },
] as const;

export type NavIcon = (typeof MAIN_NAV)[number]["icon"];

// Admin area screens A-02 … A-10 from docs/PLAN.md.
export const ADMIN_NAV = [
  { href: "/admin/users", id: "A-02", label: "Users", ta: "பயனர்கள்", ready: true },
  { href: "/admin/parties", id: "A-03", label: "Customers and vendors", ta: "வாடிக்கையாளர் · விற்பனையாளர்" },
  { href: "/admin/items", id: "A-04", label: "Items and categories", ta: "பொருட்கள் · வகைகள்" },
  { href: "/admin/review", id: "A-05", label: "Customer review", ta: "வாடிக்கையாளர் சரிபார்ப்பு" },
  { href: "/admin/requests", id: "A-06", label: "Master requests", ta: "கோரிக்கைகள்" },
  { href: "/admin/business", id: "A-07", label: "Business profile", ta: "நிறுவன விவரம்" },
  { href: "/admin/agents", id: "A-08", label: "Agent settings", ta: "உதவியாளர் அமைப்பு" },
  { href: "/admin/exports", id: "A-09", label: "Exports", ta: "ஏற்றுமதி" },
  { href: "/admin/audit", id: "A-10", label: "Audit log", ta: "மாற்றப் பதிவு" },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
