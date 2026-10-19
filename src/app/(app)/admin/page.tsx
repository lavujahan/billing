import Link from "next/link";
import { Page, PageTitle } from "@/components/layout/Page";
import { ADMIN_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { count: userCount } = await supabase.from("users").select("id", { count: "exact", head: true });

  return (
    <Page wide>
      <PageTitle title="Admin · நிர்வாகம்" subtitle="Masters, users and settings for your business" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-20 flex-col justify-center gap-1 rounded-card border border-outline bg-surface px-4 py-3 text-ink no-underline"
          >
            <span className="text-[15px] font-semibold">{item.label}</span>
            <span className="text-xs text-ink-muted">
              {item.ta} · {"ready" in item ? `${userCount ?? 0} users` : "coming soon"}
            </span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
