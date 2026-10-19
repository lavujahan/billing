import { BillIcon, CollectionIcon, ExpenseIcon, HomeIcon, PurchaseIcon } from "@/components/icons";
import type { NavIcon as NavIconName } from "@/lib/nav";

const ICONS = {
  home: HomeIcon,
  bill: BillIcon,
  purchase: PurchaseIcon,
  expense: ExpenseIcon,
  collection: CollectionIcon,
} as const;

export function NavIcon({ name, size }: { name: NavIconName; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} />;
}
