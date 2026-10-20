import { Page, PageTitle } from "@/components/layout/Page";
import { Card, SectionHeading } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasMasterKey } from "@/lib/ai/crypto";
import { getKeyStatus } from "@/lib/ai/keys";
import { daysAgoISO } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { RemoveKeyButton, SaveKeyForm, TestKeyButton } from "./KeyForms";

export default async function AiSettingsPage() {
  const user = await getCurrentUser();
  const status = await getKeyStatus(user.businessId);
  const supabase = await createClient();
  const since = daysAgoISO(30);
  const { data: usage } = await supabase.from("ai_usage").select("kind, input_tokens, output_tokens, audio_seconds").gte("created_at", since);

  const runs = (usage ?? []).filter((u) => u.kind === "agent_run");
  const audioMinutes = (usage ?? []).reduce((s, u) => s + Number(u.audio_seconds ?? 0), 0) / 60;
  const tokens = runs.reduce((s, u) => s + (u.input_tokens ?? 0) + (u.output_tokens ?? 0), 0);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <Page>
      <PageTitle title="AI · voice settings" subtitle="Voice entry uses OpenAI. The key is stored encrypted and is never shown or sent to any phone." />

      {!hasMasterKey() && (
        <p className="rounded-field bg-warning-container px-3 py-2 text-sm text-warning-text">
          The server needs AI_KEY_ENCRYPTION_KEY in its environment before a key can be saved. See README → AI keys.
        </p>
      )}

      <Card className="flex flex-col gap-2 p-4">
        <span className="text-xs text-ink-muted">Status</span>
        {status.hasBusinessKey ? (
          <>
            <span className="text-[17px] font-semibold">OpenAI key ending …{status.last4}</span>
            <span className="text-[13px] text-ink-muted">
              Set {status.setAt ? fmt(status.setAt) : ""}
              {status.setBy ? ` by ${status.setBy}` : ""}
              {status.lastTestedAt ? ` · last test ${status.lastTestOk ? "passed" : "FAILED"} ${fmt(status.lastTestedAt)}` : ""}
            </span>
          </>
        ) : status.platformAvailable ? (
          <span className="text-[15px] font-semibold">Using the platform key (provided by your software vendor)</span>
        ) : (
          <span className="text-[15px] font-semibold text-warning-text">No key — voice is off. Typing works as usual.</span>
        )}
      </Card>

      {(status.hasBusinessKey || status.platformAvailable) && (
        <div className="grid grid-cols-2 gap-2">
          <TestKeyButton />
          {status.hasBusinessKey && <RemoveKeyButton />}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeading title={status.hasBusinessKey ? "Replace key" : "Add your OpenAI key"} />
        <Card className="p-4">
          <SaveKeyForm replacing={status.hasBusinessKey} />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading title="Last 30 days" />
        <Card className="grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <p className="text-[22px] font-bold">{runs.length}</p>
            <p className="text-xs text-ink-muted">whole-bill voice</p>
          </div>
          <div>
            <p className="text-[22px] font-bold">{audioMinutes.toFixed(1)}</p>
            <p className="text-xs text-ink-muted">audio minutes</p>
          </div>
          <div>
            <p className="text-[22px] font-bold">{(tokens / 1000).toFixed(1)}k</p>
            <p className="text-xs text-ink-muted">AI tokens</p>
          </div>
        </Card>
      </section>
    </Page>
  );
}
