import Link from "next/link";
import { BillIcon, CameraIcon, CollectionIcon, PlusCircleIcon } from "@/components/icons";
import { Page } from "@/components/layout/Page";
import { Card, SectionHeading } from "@/components/ui/Card";
import { QuickActionButton } from "@/components/ui/QuickActionButton";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import { listOpenDrafts } from "@/lib/billing/server";
import { daysAgoISO, formatINR, formatTime, todayISO } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type Attention = { key: string; href: string; dot: string; title: string; detail: string; detailClass: string; action: string };

export default async function HomePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const admin = isAdminRole(user.role);
  const since = daysAgoISO(3);
  const [{ data: sales }, drafts, review, openRequests, { data: resolved }] = await Promise.all([
    supabase.from("invoices").select("total_amount").eq("status", "confirmed").eq("invoice_date", todayISO()),
    listOpenDrafts(supabase, "billing"),
    admin ? supabase.from("customers").select("id", { count: "exact", head: true }).eq("needs_review", true).eq("active", true) : Promise.resolve({ count: 0 }),
    admin ? supabase.from("master_requests").select("id", { count: "exact", head: true }).eq("status", "open") : Promise.resolve({ count: 0 }),
    supabase
      .from("master_requests")
      .select("id, requested_name, status, draft_id")
      .eq("created_by", user.id)
      .in("status", ["approved", "merged"])
      .gte("resolved_at", since)
      .not("draft_id", "is", null)
      .limit(3),
  ]);
  const openDraftIds = new Set(drafts.map((d) => d.id));
  const salesTotal = (sales ?? []).reduce((s, r) => s + Number(r.total_amount), 0);

  const attention: Attention[] = [
    ...(resolved ?? [])
      .filter((r) => r.draft_id && openDraftIds.has(r.draft_id))
      .map((r) => ({
        key: `req-${r.id}`,
        href: `/billing/new?draft=${r.draft_id}`,
        dot: "bg-primary",
        title: `Item “${r.requested_name}” added by admin`,
        detail: "Your bill can continue",
        detailClass: "text-ink-muted",
        action: "Resume",
      })),
    ...((openRequests.count ?? 0) > 0
      ? [
          {
            key: "requests",
            href: "/admin/requests",
            dot: "bg-voice",
            title: `${openRequests.count} item requests waiting`,
            detail: "Staff are waiting to finish bills",
            detailClass: "text-warning-text",
            action: "Handle",
          },
        ]
      : []),
    ...drafts.slice(0, 3).map((d) => ({
      key: d.id,
      href: `/billing/new?draft=${d.id}`,
      dot: "bg-ink-muted",
      title: `Unsaved bill · ${d.title || "no customer yet"}`,
      detail: `${formatINR(d.amount ?? 0)} · draft from ${formatTime(d.updatedAt)}`,
      detailClass: "text-ink-muted",
      action: "Open",
    })),
    ...((review.count ?? 0) > 0
      ? [
          {
            key: "review",
            href: "/admin/review",
            dot: "bg-voice",
            title: `${review.count} new customers to review`,
            detail: "Added from bills · add GSTIN and address",
            detailClass: "text-warning-text",
            action: "Review",
          },
        ]
      : []),
  ];

  const summary = [
    { href: "/billing", label: "Sales · விற்பனை", value: formatINR(salesTotal), caption: `${sales?.length ?? 0} bills` },
    { href: "/reports", label: "Purchase · கொள்முதல்", value: "₹0", caption: "Coming soon" },
    { href: "/reports", label: "Expense · செலவு", value: "₹0", caption: "Coming soon" },
    { href: "/reports", label: "Collection · வரவு", value: "₹0", caption: "Coming soon" },
  ];

  return (
    <Page>
      <SectionHeading title="Today · இன்று" hint="Tap a card for its report" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {summary.map((s) => (
          <SummaryCard key={s.label} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <QuickActionButton href="/billing/new" primary icon={<BillIcon />} label="New bill" />
        <QuickActionButton href="/purchase" icon={<CameraIcon />} label="Scan purchase" />
        <QuickActionButton href="/expense" icon={<PlusCircleIcon />} label="Add expense" />
        <QuickActionButton href="/collection" icon={<CollectionIcon />} label="Record payment" />
      </div>

      <div className="pt-0.5">
        <SectionHeading title="Needs attention · கவனிக்க" hint={String(attention.length)} />
      </div>
      <Card className="overflow-hidden">
        {attention.length === 0 ? (
          <div className="flex min-h-14 items-center gap-3 px-4">
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <span className="flex flex-col py-2.5">
              <span className="text-sm font-semibold">All clear · எல்லாம் சரி</span>
              <span className="text-xs text-ink-muted">Unsaved bills and admin to-dos will show here.</span>
            </span>
          </div>
        ) : (
          attention.map((a, i) => (
            <Link key={a.key} href={a.href} className={`flex min-h-14 items-center gap-3 px-4 text-ink no-underline ${i ? "border-t border-divider" : ""}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${a.dot}`} aria-hidden="true" />
              <span className="flex grow flex-col py-2.5">
                <span className="text-sm font-semibold">{a.title}</span>
                <span className={`text-xs ${a.detailClass}`}>{a.detail}</span>
              </span>
              <span className="text-[13px] font-semibold text-primary">{a.action}</span>
            </Link>
          ))
        )}
      </Card>
    </Page>
  );
}
