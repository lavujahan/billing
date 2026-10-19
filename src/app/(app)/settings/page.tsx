import Link from "next/link";
import { LogoutIcon, ShieldIcon } from "@/components/icons";
import { Page, PageTitle } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";

const ROLE_LABEL = { owner: "Owner · உரிமையாளர்", admin: "Admin · நிர்வாகி", staff: "Staff · பணியாளர்" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return (
    <Page>
      <PageTitle title="Settings · அமைப்புகள்" />
      <Card className="flex flex-col gap-1 p-4">
        <span className="text-xs text-ink-muted">Signed in as</span>
        <span className="text-[17px] font-semibold">{user.fullName}</span>
        <span className="text-[13px] text-ink-muted">
          {ROLE_LABEL[user.role]} · {user.businessName}
        </span>
      </Card>

      {isAdminRole(user.role) && (
        <Link
          href="/admin"
          className="flex min-h-14 items-center gap-3 rounded-card border border-primary-outline bg-surface px-4 font-bold text-primary-strong no-underline"
        >
          <ShieldIcon /> Admin area · நிர்வாகம்
        </Link>
      )}

      <Card className="p-4 text-[13px] text-ink-muted">
        Language, notifications, daily summary time and printer settings come in a later phase.
      </Card>

      <form action="/logout" method="post">
        <button className="flex min-h-14 w-full items-center gap-3 rounded-card border border-chip-border bg-surface px-4 font-bold text-danger">
          <LogoutIcon /> Log out · வெளியேறு
        </button>
      </form>
    </Page>
  );
}
