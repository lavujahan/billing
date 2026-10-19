import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

// Default rate for a line: this customer's last rate for the item, else the item's master rate.
export async function GET(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product") ?? "";
  const customer = request.nextUrl.searchParams.get("customer") ?? "";
  if (!UUID.test(product)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const [{ data: p }, last] = await Promise.all([
    supabase.from("products").select("default_rate").eq("id", product).maybeSingle(),
    UUID.test(customer)
      ? supabase.rpc("customer_last_rate", { p_customer: customer, p_product: product })
      : Promise.resolve({ data: null }),
  ]);
  const lastRate = last.data === null ? null : Number(last.data);
  const itemRate = p?.default_rate === null || p?.default_rate === undefined ? null : Number(p.default_rate);
  return NextResponse.json({ rate: lastRate ?? itemRate, usualRate: lastRate, source: lastRate !== null ? "last" : "item" });
}
