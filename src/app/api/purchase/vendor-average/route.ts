import { NextResponse, type NextRequest } from "next/server";
import { vendorAverage } from "@/lib/purchase/server";
import { createClient } from "@/lib/supabase/server";

// Average of this vendor's recent bills, for the "much larger than usual" warning.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("vendor") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ average: null });
  return NextResponse.json({ average: await vendorAverage(await createClient(), id) });
}
