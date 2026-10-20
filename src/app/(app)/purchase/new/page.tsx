import { resolveOpenAIKey } from "@/lib/ai/keys";
import { getCurrentUser, isAdminRole } from "@/lib/auth/session";
import { signedUrls } from "@/lib/purchase/files";
import { getPurchaseContext, loadPurchaseDraft } from "@/lib/purchase/server";
import { emptyPurchase } from "@/lib/purchase/types";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "../_components/PurchaseForm";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewPurchasePage({ searchParams }: PageProps<"/purchase/new">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const draftParam = typeof sp.draft === "string" && UUID.test(sp.draft) ? sp.draft : null;

  const supabase = await createClient();
  const [ctx, aiKey, draft] = await Promise.all([
    getPurchaseContext(supabase, user.businessId),
    resolveOpenAIKey(user.businessId),
    draftParam ? loadPurchaseDraft(supabase, draftParam) : Promise.resolve(null),
  ]);
  const initial = draft?.data ?? emptyPurchase(ctx.today);
  const urls = await signedUrls(supabase, initial.pages.map((p) => p.path));

  return (
    <PurchaseForm
      key={`${draftParam}-${String(sp.n ?? "")}`}
      ctx={ctx}
      initial={initial}
      initialUrls={urls}
      draftId={draft?.id ?? null}
      aiEnabled={Boolean(aiKey)}
      isAdmin={isAdminRole(user.role)}
    />
  );
}
