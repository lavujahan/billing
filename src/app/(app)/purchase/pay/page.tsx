import { getCurrentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/money";
import { getVendor, unpaidBills } from "@/lib/purchase/server";
import { createClient } from "@/lib/supabase/server";
import { PayVendorForm } from "./PayVendorForm";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PayVendorPage({ searchParams }: PageProps<"/purchase/pay">) {
  await getCurrentUser();
  const sp = await searchParams;
  const vendorId = typeof sp.vendor === "string" && UUID.test(sp.vendor) ? sp.vendor : null;
  const supabase = await createClient();
  const [vendor, bills] = vendorId ? await Promise.all([getVendor(supabase, vendorId), unpaidBills(supabase, vendorId)]) : [null, []];

  return (
    <PayVendorForm
      key={vendorId ?? "none"}
      vendor={vendor ? { id: vendor.id!, name: vendor.name, balance: vendor.balance } : null}
      bills={bills}
      today={todayISO()}
    />
  );
}
