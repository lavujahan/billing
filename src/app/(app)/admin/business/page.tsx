import { Page, PageTitle } from "@/components/layout/Page";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BusinessForm } from "./BusinessForm";

export default async function BusinessProfilePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("name, gstin, state_code, address, phone, invoice_prefix, gst_slabs")
    .eq("id", user.businessId)
    .single();
  if (!biz) return null;

  return (
    <Page>
      <PageTitle title="Business profile · நிறுவன விவரம்" subtitle="These details print on every bill." />
      <BusinessForm business={{ ...biz, gst_slabs: (biz.gst_slabs ?? []).map(Number) }} readOnly={user.role !== "owner"} />
    </Page>
  );
}
