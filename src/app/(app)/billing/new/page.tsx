import { resolveOpenAIKey } from "@/lib/ai/keys";
import { getCurrentUser } from "@/lib/auth/session";
import { getBillCustomer, getBillingContext, loadDraft } from "@/lib/billing/server";
import { emptyDraft } from "@/lib/billing/types";
import { createClient } from "@/lib/supabase/server";
import { BillForm } from "../_components/BillForm";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewBillPage({ searchParams }: PageProps<"/billing/new">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const draftParam = typeof sp.draft === "string" && UUID.test(sp.draft) ? sp.draft : null;
  const customerParam = typeof sp.customer === "string" && UUID.test(sp.customer) ? sp.customer : null;

  const supabase = await createClient();
  const [ctx, aiKey] = await Promise.all([getBillingContext(supabase, user.businessId), resolveOpenAIKey(user.businessId)]);
  const draft = draftParam ? await loadDraft(supabase, draftParam) : null;
  const customer = !draft && customerParam ? await getBillCustomer(supabase, customerParam) : null;
  const initial = draft?.data ?? emptyDraft(ctx.today, customer);

  return (
    <BillForm
      key={`${draftParam}-${customerParam}-${String(sp.n ?? "")}`}
      businessName={user.businessName}
      ctx={ctx}
      initial={initial}
      draftId={draft?.id ?? null}
      voiceEnabled={Boolean(aiKey)}
    />
  );
}
