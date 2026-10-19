import { Page, PageTitle } from "@/components/layout/Page";
import { Card, SectionHeading } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { setActiveAction } from "./actions";
import { CreateUserForm, ResetCodeButton } from "./UserForms";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", staff: "Staff" } as const;

export default async function UsersPage() {
  const me = await getCurrentUser();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, mobile, role, active, created_at")
    .order("created_at");

  return (
    <Page wide>
      <PageTitle title="Users · பயனர்கள்" subtitle="Logins for your business. Codes are shown once — share them in person." />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="flex flex-col gap-2">
          <SectionHeading title={`All users (${users?.length ?? 0})`} />
          <Card className="overflow-hidden">
            {(users ?? []).map((u, i) => {
              const manageable = u.id !== me.id && (me.role === "owner" || u.role === "staff");
              return (
                <div key={u.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i ? "border-t border-divider" : ""}`}>
                  <div className="flex min-w-0 grow flex-col">
                    <span className="text-[15px] font-semibold">
                      {u.full_name}
                      {u.id === me.id && <span className="font-normal text-ink-muted"> · you</span>}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {u.mobile} · {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}
                    </span>
                  </div>
                  {!u.active && (
                    <span className="rounded-full bg-warning-container px-2.5 py-1 text-xs font-semibold text-warning-text">Inactive</span>
                  )}
                  {manageable && (
                    <div className="flex gap-2">
                      {u.active && <ResetCodeButton userId={u.id} />}
                      <form action={setActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.active)} />
                        <button className="min-h-11 rounded-full border border-chip-border px-4 text-sm font-semibold">
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <SectionHeading title="Add user · புது பயனர்" />
          <CreateUserForm canAddAdmins={me.role === "owner"} />
        </section>
      </div>
    </Page>
  );
}
