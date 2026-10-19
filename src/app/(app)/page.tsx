import { BillIcon, CameraIcon, CollectionIcon, PlusCircleIcon } from "@/components/icons";
import { Page } from "@/components/layout/Page";
import { Card, SectionHeading } from "@/components/ui/Card";
import { QuickActionButton } from "@/components/ui/QuickActionButton";
import { SummaryCard } from "@/components/ui/SummaryCard";

// Figures are placeholders until the forms and the reports endpoints exist.
const SUMMARY = [
  { href: "/reports", label: "Sales · விற்பனை", caption: "0 bills" },
  { href: "/reports", label: "Purchase · கொள்முதல்", caption: "0 bills" },
  { href: "/reports", label: "Expense · செலவு", caption: "0 entries" },
  { href: "/reports", label: "Collection · வரவு", caption: "0 payments" },
];

export default function HomePage() {
  return (
    <Page>
      <SectionHeading title="Today · இன்று" hint="Tap a card for its report" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {SUMMARY.map((s) => (
          <SummaryCard key={s.label} href={s.href} label={s.label} value="₹0" caption={s.caption} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <QuickActionButton href="/billing" primary icon={<BillIcon />} label="New bill" />
        <QuickActionButton href="/purchase" icon={<CameraIcon />} label="Scan purchase" />
        <QuickActionButton href="/expense" icon={<PlusCircleIcon />} label="Add expense" />
        <QuickActionButton href="/collection" icon={<CollectionIcon />} label="Record payment" />
      </div>

      <div className="pt-0.5">
        <SectionHeading title="Needs attention · கவனிக்க" hint="0" />
      </div>
      <Card className="flex min-h-14 items-center gap-3 px-4">
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <span className="flex flex-col py-2.5">
          <span className="text-sm font-semibold">All clear · எல்லாம் சரி</span>
          <span className="text-xs text-ink-muted">Drafts, cheques due and admin replies will show here.</span>
        </span>
      </Card>
    </Page>
  );
}
